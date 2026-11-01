import { execFile } from 'node:child_process';

import ffmpegStatic from 'ffmpeg-static';

/** Путь к ffmpeg: `FFMPEG_PATH` или бинарник из npm-пакета `ffmpeg-static` (D-52). */
export function resolveFfmpeg(override: string | undefined): string {
  const path = override ?? (ffmpegStatic as unknown as string | null);
  if (!path) throw new Error('ffmpeg binary is not available for this platform');
  return path;
}

/** Запуск ffmpeg; stderr возвращается и при коде 0 — в нём ffmpeg пишет длительность. */
export function runFfmpeg(bin: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      ['-hide_banner', '-nostdin', ...args],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`ffmpeg failed: ${error.message}`, { cause: stderr }));
        else resolve(stderr);
      },
    );
  });
}

/** `Duration: 00:01:02.50` из вывода ffmpeg → секунды. */
export function parseDurationSec(stderr: string): number | null {
  const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
