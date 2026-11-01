'use client';

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import type { LocationMapProps } from './types';

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Узбекистан целиком. */
const DEFAULT_VIEW = { center: [41.3, 64.6] as L.LatLngTuple, zoom: 5 };

/** Реализация на Leaflet + OSM (D-37); экраны знают только `LocationMap`. */
export default function LeafletMap({ value, onChange, label, className }: LocationMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { scrollWheelZoom: false }).setView(
      DEFAULT_VIEW.center,
      DEFAULT_VIEW.zoom,
    );
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(instance);
    instance.on('click', (e: L.LeafletMouseEvent) => {
      onChangeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const point: L.LatLngTuple = [value.lat, value.lng];
    if (marker.current) marker.current.setLatLng(point);
    else {
      marker.current = L.circleMarker(point, {
        radius: 9,
        color: '#0f5f8c',
        fillColor: '#1b82bd',
        fillOpacity: 0.9,
      }).addTo(instance);
      instance.setView(point, Math.max(instance.getZoom(), 10));
    }
  }, [value]);

  return (
    <div
      ref={host}
      role="application"
      aria-label={label}
      data-testid="location-map"
      data-lat={value?.lat}
      data-lng={value?.lng}
      className={className ?? 'h-72 w-full overflow-hidden rounded-control border border-border'}
    />
  );
}
