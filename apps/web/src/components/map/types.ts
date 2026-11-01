export interface LatLng {
  lat: number;
  lng: number;
}

/** Общий интерфейс карты: провайдера (OSM, Яндекс, Google) можно сменить без правки экранов (D-37). */
export interface LocationMapProps {
  value: LatLng | null;
  /** Без обработчика карта только показывает точку. */
  onChange?: (point: LatLng) => void;
  label: string;
  className?: string;
}
