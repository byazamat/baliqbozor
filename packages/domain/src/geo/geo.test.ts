import { describe, expect, it } from 'vitest';

import { boundingBox, haversineKm, isInServiceArea, publicDistanceKm } from './geo.js';

const tashkent = { lat: 41.2995, lng: 69.2401 };
const samarkand = { lat: 39.6542, lng: 66.9597 };

describe('geo', () => {
  it('computes great-circle distance', () => {
    expect(haversineKm(tashkent, samarkand)).toBeGreaterThan(265);
    expect(haversineKm(tashkent, samarkand)).toBeLessThan(275);
    expect(haversineKm(tashkent, tashkent)).toBe(0);
  });

  it('builds a box that contains the circle', () => {
    const box = boundingBox(tashkent, 300);
    expect(samarkand.lat).toBeGreaterThan(box.minLat);
    expect(samarkand.lng).toBeGreaterThan(box.minLng);
    for (const bearing of [0, 90, 180, 270]) {
      const b = rad(bearing);
      const p = {
        lat: tashkent.lat + (299 / 111.32) * Math.cos(b),
        lng: tashkent.lng + (299 / (111.32 * Math.cos(rad(tashkent.lat)))) * Math.sin(b),
      };
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(p.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it('rounds public distance up to 5 km', () => {
    expect(publicDistanceKm(0.3)).toBe(5);
    expect(publicDistanceKm(5)).toBe(5);
    expect(publicDistanceKm(271.2)).toBe(275);
  });

  it('accepts only points in the service area', () => {
    expect(isInServiceArea(samarkand)).toBe(true);
    expect(isInServiceArea({ lat: 69.24, lng: 41.29 })).toBe(false);
  });
});

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}
