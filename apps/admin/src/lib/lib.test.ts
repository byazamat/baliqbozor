import { describe, expect, it } from 'vitest';

import { settingFromText, settingToText } from './settings';
import { availableActions, NOTE_REQUIRED } from './verification';

describe('settings text conversion', () => {
  it('round-trips numbers, strings, booleans and objects', () => {
    expect(settingToText(200)).toBe('200');
    expect(settingToText('WEEK')).toBe('WEEK');
    expect(settingToText(false)).toBe('false');
    expect(settingToText({ from: '08:00', to: '20:00' })).toBe('{"from":"08:00","to":"20:00"}');

    expect(settingFromText('150', 200)).toBe(150);
    expect(settingFromText(' ', 200)).toBeNaN();
    expect(settingFromText('1,3', 1.3)).toBeNaN();
    expect(settingFromText('true', false)).toBe(true);
    expect(settingFromText(' MONTH ', 'WEEK')).toBe('MONTH');
    expect(settingFromText('{"from":"09:00","to":"18:00"}', {})).toEqual({
      from: '09:00',
      to: '18:00',
    });
    expect(settingFromText('{bad', {})).toBeUndefined();
  });
});

describe('availableActions', () => {
  const org = (verificationStatus: string, type = 'SELLER', verifiedAt: string | null = null) =>
    ({ verificationStatus, type, verifiedAt }) as Parameters<typeof availableActions>[0];

  it('follows the verification state machine', () => {
    expect(availableActions(org('PENDING'))).toEqual(['verify', 'reject', 'suspend']);
    expect(availableActions(org('UNVERIFIED'))).toEqual(['suspend']);
    expect(availableActions(org('UNVERIFIED', 'BUYER'))).toEqual(['verify', 'suspend']);
    expect(availableActions(org('VERIFIED', 'SELLER', '2026-10-01'))).toEqual(['suspend']);
    expect(availableActions(org('SUSPENDED'))).toEqual(['unsuspend']);
  });

  it('requires a note for reject and suspend', () => {
    expect([...NOTE_REQUIRED]).toEqual(['reject', 'suspend']);
  });
});
