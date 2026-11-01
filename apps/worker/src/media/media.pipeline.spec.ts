import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import { parseDurationSec, resolveFfmpeg, runFfmpeg } from './ffmpeg.js';
import { processMedia } from './media.pipeline.js';

const ffmpeg = () => resolveFfmpeg(undefined);

/** JPEG 800×600 с EXIF: ориентация «повёрнуто на 90°» и GPS. */
async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: '#3a7' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '41/1 17/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '69/1 14/1 0/1',
      },
    })
    .toBuffer();
}

async function makeVideo(seconds: number): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'bb-test-'));
  const out = path.join(dir, 'v.mov'); // как с iPhone: QuickTime с геотегом
  try {
    await runFfmpeg(ffmpeg(), [
      '-f',
      'lavfi',
      '-i',
      `testsrc=duration=${String(seconds)}:size=160x120:rate=5`,
      '-metadata',
      'location=+41.2995+069.2401/',
      '-c:v',
      'mpeg4',
      '-y',
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('processMedia', () => {
  it('strips EXIF and GPS, applies orientation and builds a thumbnail', async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await processMedia(input, 'IMAGE', ffmpeg);
    if (!result.ok) throw new Error(result.reason);
    const meta = await sharp(result.body).metadata();
    expect(meta.exif).toBeUndefined();
    expect(result.body.includes(Buffer.from('TestCam'))).toBe(false);
    expect([result.width, result.height]).toEqual([600, 800]);
    expect(result.mimeType).toBe('image/jpeg');
    const thumb = await sharp(result.thumbnail ?? Buffer.alloc(0)).metadata();
    expect(thumb.format).toBe('webp');
    expect(Math.max(thumb.width, thumb.height)).toBe(480);
  });

  it('keeps PNG as PNG and rejects content of another kind', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#fff' } })
      .png()
      .toBuffer();
    expect(await processMedia(png, 'IMAGE', ffmpeg)).toMatchObject({
      ok: true,
      mimeType: 'image/png',
    });
    expect(await processMedia(png, 'VIDEO', ffmpeg)).toEqual({
      ok: false,
      reason: 'TYPE_MISMATCH',
    });
    expect(await processMedia(Buffer.from('MZ fake exe'), 'IMAGE', ffmpeg)).toEqual({
      ok: false,
      reason: 'UNKNOWN_TYPE',
    });
  });

  it('rejects a truncated image', async () => {
    const broken = (await jpegWithGps()).subarray(0, 400);
    expect(await processMedia(broken, 'IMAGE', ffmpeg)).toEqual({
      ok: false,
      reason: 'UNREADABLE',
    });
  });

  it('passes PDF through after the magic bytes check', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    expect(await processMedia(pdf, 'PDF', ffmpeg)).toMatchObject({
      ok: true,
      mimeType: 'application/pdf',
    });
  });

  it('remuxes a short video without metadata', async () => {
    const input = await makeVideo(2);
    expect(input.includes(Buffer.from('+41.2995'))).toBe(true);
    const result = await processMedia(input, 'VIDEO', ffmpeg);
    if (!result.ok) throw new Error(result.reason);
    expect(result.durationSec).toBe(2);
    expect([result.width, result.height]).toEqual([160, 120]);
    expect(result.body.includes(Buffer.from('+41.2995'))).toBe(false);
    expect(result.thumbnail).not.toBeNull();
  }, 30_000);

  it('rejects a video longer than 60 s', async () => {
    const input = await makeVideo(62);
    expect(await processMedia(input, 'VIDEO', ffmpeg)).toEqual({
      ok: false,
      reason: 'VIDEO_TOO_LONG',
    });
  }, 30_000);

  it('parses ffmpeg durations', () => {
    expect(parseDurationSec('  Duration: 00:01:02.50, start')).toBe(62.5);
    expect(parseDurationSec('no duration')).toBeNull();
  });
});
