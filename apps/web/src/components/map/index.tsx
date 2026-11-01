'use client';

import dynamic from 'next/dynamic';

import type { LocationMapProps } from './types';

export type { LatLng, LocationMapProps } from './types';

/** Карта только в браузере: Leaflet обращается к `window` при загрузке. */
export const LocationMap = dynamic<LocationMapProps>(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-control bg-surface-muted" />,
});
