import { describe, expect, it } from 'vitest';

import {
  defaultSettings,
  isSettingKey,
  parseSetting,
  resolveSettings,
  SETTING_KEYS,
  SETTINGS,
} from './registry.js';

describe('settings registry', () => {
  it('contains every key from SPEC 8.13 with its default', () => {
    const d = defaultSettings();
    expect(d['commission.defaultRateBps']).toBe(200);
    expect(d['order.minOrderKg']).toBe(100);
    expect(d['order.deadFishPolicy']).toBe('NOT_PAID');
    expect(d['matching.weights']).toEqual({
      distance: 0.35,
      price: 0.25,
      reliability: 0.2,
      freshness: 0.1,
      volume: 0.1,
    });
    expect(d['ops.workingHours']).toEqual({ from: '08:00', to: '20:00' });
    expect(d['otp.ttlSeconds']).toBe(300);
    expect(d['otp.maxPerPhonePerHour']).toBe(5);
    expect(d['order.requireVetDocument']).toBe(false);
    // 28 ключей SPEC 8.13 + order.requireVetDocument (D-35) + otp.maxPerIpPerHour,
    // otp.blockMinutes, org.invitationTtlDays (D-39).
    expect(SETTING_KEYS).toHaveLength(32);
  });

  it('every default passes its own schema', () => {
    for (const key of SETTING_KEYS) {
      expect(parseSetting(key, SETTINGS[key].default)).toMatchObject({ ok: true });
    }
  });

  it('validates values', () => {
    expect(parseSetting('commission.defaultRateBps', 250)).toEqual({ ok: true, value: 250 });
    expect(parseSetting('commission.defaultRateBps', 10_001).ok).toBe(false);
    expect(parseSetting('commission.defaultRateBps', 1.5).ok).toBe(false);
    expect(parseSetting('commission.billingPeriod', 'DAY').ok).toBe(false);
    expect(
      parseSetting('matching.weights', {
        distance: 0.5,
        price: 0.5,
        reliability: 0.2,
        freshness: 0,
        volume: 0,
      }),
    ).toEqual({ ok: false, issues: [{ code: 'rule', rule: 'weightsSum' }] });
    expect(parseSetting('ops.workingHours', { from: '20:00', to: '08:00' }).ok).toBe(false);
    expect(parseSetting('ops.workingHours', { from: '8:00', to: '20:00' }).ok).toBe(false);
  });

  it('reports structured issues for translation on the client (D-50)', () => {
    const issues = (key: Parameters<typeof parseSetting>[0], value: unknown) => {
      const res = parseSetting(key, value);
      return res.ok ? [] : res.issues;
    };
    expect(issues('commission.defaultRateBps', 10_001)).toEqual([{ code: 'max', max: 10_000 }]);
    expect(issues('commission.defaultRateBps', -1)).toEqual([{ code: 'min', min: 0 }]);
    expect(issues('commission.defaultRateBps', 1.5)).toEqual([{ code: 'integer' }]);
    expect(issues('commission.defaultRateBps', '5')).toEqual([
      { code: 'type', expected: 'number' },
    ]);
    expect(issues('commission.billingPeriod', 'DAY')).toEqual([
      { code: 'oneOf', values: ['WEEK', 'MONTH'] },
    ]);
    expect(issues('order.requireVetDocument', 'yes')).toEqual([
      { code: 'type', expected: 'boolean' },
    ]);
    expect(issues('ops.workingHours', { from: '21:00', to: '20:00' })).toEqual([
      { code: 'rule', rule: 'timeOrder' },
    ]);
    expect(issues('ops.workingHours', { from: '8:00', to: '20:00' })).toEqual([
      { path: 'from', code: 'format' },
      { code: 'rule', rule: 'timeOrder' },
    ]);
    expect(
      issues('matching.weights', {
        distance: 0.5,
        price: 0.5,
        reliability: 0,
        freshness: 0,
        volume: 0,
        extra: 1,
      }),
    ).toEqual([{ code: 'unknownKeys', keys: ['extra'] }]);
    expect(issues('matching.weights', { distance: 1 })[0]).toEqual({
      path: 'price',
      code: 'type',
      expected: 'number',
    });
  });

  it('overlays stored values and ignores invalid ones', () => {
    const { values, invalidKeys } = resolveSettings(
      new Map<string, unknown>([
        ['commission.defaultRateBps', 300],
        ['order.minOrderKg', 'lots'],
        ['unknown.key', 1],
      ]),
    );
    expect(values['commission.defaultRateBps']).toBe(300);
    expect(values['order.minOrderKg']).toBe(100);
    expect(invalidKeys).toEqual(['order.minOrderKg']);
  });

  it('recognizes keys', () => {
    expect(isSettingKey('otp.maxAttempts')).toBe(true);
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey('nope')).toBe(false);
  });
});
