import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  classifyDetectedMedia,
  isVideoDurationAllowed,
  type MediaKind,
  type MediaRejectReason,
} from '@baliqbozor/domain';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import { parseDurationSec, runFfmpeg } from './ffmpeg.js';

/** Длинная сторона обработанного фото и превью (D-52). */
export const MAX_IMAGE_SIDE = 2560;
export const THUMB_SIDE = 480;

export type ProcessResult =
  | {
      ok: true;
      body: Buffer;
      mimeType: string;
      width: number | null;
      height: number | null;
      durationSec: number | null;
      thumbnail: Buffer | null;
    }
  | { ok: false; reason: MediaRejectReason };

/**
 * Проверка содержимого и очистка файла (SPEC 13.2, D-52): magic bytes; изображения — поворот
 * по EXIF и перекодирование без метаданных; видео — длительность и перепаковка без метаданных.
 */
export async function processMedia(
  input: Buffer,
  declared: MediaKind,
  ffmpegBin: () => string,
): Promise<ProcessResult> {
  const detected = await fileTypeFromBuffer(input);
  const verdict = classifyDetectedMedia(declared, detected?.mime);
  if (!verdict.ok) return verdict;
  switch (declared) {
    case 'IMAGE':
      return processImage(input, verdict.mimeType);
    case 'VIDEO':
      return processVideo(input, verdict.mimeType, ffmpegBin());
    default:
      return {
        ok: true,
        body: input,
        mimeType: verdict.mimeType,
        width: null,
        height: null,
        durationSec: null,
        thumbnail: null,
      };
  }
}

async function processImage(input: Buffer, mimeType: string): Promise<ProcessResult> {
  try {
    // sharp не переносит метаданные (EXIF, GPS, XMP), если их не попросить явно. Обрезанный файл —
    // отказ; мелкие ошибки формата (контрольные суммы служебных блоков) телефоны допускают.
    const pipeline = sharp(input, { failOn: 'truncated' }).rotate().resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const encoded =
      mimeType === 'image/png'
        ? pipeline.png({ compressionLevel: 9 })
        : mimeType === 'image/webp'
          ? pipeline.webp({ quality: 85 })
          : pipeline.jpeg({ quality: 85, mozjpeg: true });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    const thumbnail = await thumbnailOf(data);
    return {
      ok: true,
      body: data,
      // HEIC (если libvips его прочитал) сохраняется как JPEG.
      mimeType: mimeType === 'image/png' || mimeType === 'image/webp' ? mimeType : 'image/jpeg',
      width: info.width,
      height: info.height,
      durationSec: null,
      thumbnail,
    };
  } catch {
    return { ok: false, reason: 'UNREADABLE' };
  }
}

function thumbnailOf(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}

async function processVideo(input: Buffer, mimeType: string, bin: string): Promise<ProcessResult> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bb-media-'));
  const ext = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const src = path.join(dir, `in.${ext}`);
  const out = path.join(dir, `out.${ext}`);
  const poster = path.join(dir, 'poster.jpg');
  try {
    await writeFile(src, input);
    let log: string;
    try {
      // Только видео и звук: дорожки метаданных (в том числе геотеги Apple) не копируются.
      log = await runFfmpeg(bin, [
        '-i',
        src,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-map_metadata',
        '-1',
        '-map_chapters',
        '-1',
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-f',
        ext === 'mov' ? 'mov' : 'mp4',
        '-y',
        out,
      ]);
    } catch {
      return { ok: false, reason: 'UNREADABLE' };
    }
    const duration = parseDurationSec(log);
    if (duration === null) return { ok: false, reason: 'UNREADABLE' };
    if (!isVideoDurationAllowed(duration)) return { ok: false, reason: 'VIDEO_TOO_LONG' };
    const size = /Video: [^\n]*?(\d{2,5})x(\d{2,5})/.exec(log);
    let thumbnail: Buffer | null = null;
    try {
      await runFfmpeg(bin, [
        '-i',
        out,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        '-f',
        'image2',
        '-y',
        poster,
      ]);
      thumbnail = await thumbnailOf(await readFile(poster));
    } catch {
      thumbnail = null; // превью необязательно: видео без кадра всё равно годно
    }
    return {
      ok: true,
      body: await readFile(out),
      mimeType,
      width: size ? Number(size[1]) : null,
      height: size ? Number(size[2]) : null,
      durationSec: Math.round(duration),
      thumbnail,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
