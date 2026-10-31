// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const tokens = new Map(
  [...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
);

function color(name: string): string {
  if (name === 'white') return '#ffffff';
  const value = tokens.get(name);
  if (!value) throw new Error(`Unknown color token: ${name}`);
  return value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(color(fg)), luminance(color(bg))].sort((a, b) => b - a);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Текст: ≥ 4.5:1 (WCAG AA). */
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'surface'],
  ['ink', 'surface-muted'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'surface-muted'],
  ['white', 'brand-700'],
  ['white', 'brand-800'],
  ['white', 'danger-600'],
  ['white', 'danger-700'],
  ['brand-700', 'surface'],
  ['brand-700', 'brand-50'],
  ...(['neutral', 'info', 'success', 'warning', 'danger'] as const).map(
    (tone): [string, string] => [`status-${tone}-fg`, `status-${tone}-bg`],
  ),
];

/** Нетекстовые элементы (рамки полей, фокус): ≥ 3:1. */
const UI_PAIRS: [string, string][] = [
  ['border-strong', 'surface'],
  ['brand-600', 'surface'],
];

describe('theme contrast (WCAG AA)', () => {
  it.each(TEXT_PAIRS)('text %s on %s ≥ 4.5', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('ui %s on %s ≥ 3', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('rejects unknown tokens', () => {
    expect(() => color('missing')).toThrow(/Unknown color token/);
  });
});
