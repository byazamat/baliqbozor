/** Расстояния для каталога и подбора (SPEC 13.1): гаверсинус + отбор по прямоугольнику. */
const EARTH_RADIUS_KM = 6371;
const KM_PER_DEG_LAT = 111.32;
const rad = (deg: number) => (deg * Math.PI) / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Прямоугольник, гарантированно содержащий круг `radiusKm` вокруг точки (широты Узбекистана). */
export function boundingBox(center: LatLng, radiusKm: number) {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLng =
    radiusKm / (KM_PER_DEG_LAT * Math.max(Math.cos(rad(Math.abs(center.lat) + dLat)), 0.01));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** Публичное расстояние: вверх до шага (5 км), чтобы не выдавать точку хозяйства (D-53). */
export function publicDistanceKm(km: number, step = 5): number {
  return Math.max(step, Math.ceil(km / step) * step);
}

/** Узбекистан с запасом ~0,5°: защита от перепутанных широты и долготы и точек «в океане». */
const UZ_BOUNDS = { minLat: 36.6, maxLat: 46.2, minLng: 55.4, maxLng: 73.7 };

export function isInServiceArea(p: LatLng): boolean {
  return (
    p.lat >= UZ_BOUNDS.minLat &&
    p.lat <= UZ_BOUNDS.maxLat &&
    p.lng >= UZ_BOUNDS.minLng &&
    p.lng <= UZ_BOUNDS.maxLng
  );
}
