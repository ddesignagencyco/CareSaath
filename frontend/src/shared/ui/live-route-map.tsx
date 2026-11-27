"use client";

import { Crosshair, Maximize2, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { Modal } from "@shared/ui/overlay";

export interface LiveRouteMapProps {
  /** Primary pin (typically the destination / patient home). */
  lat: number | string;
  lng: number | string;
  /** Optional second pin (e.g. caregiver live GPS) to draw an OSRM road route. */
  originLat?: number | string | null;
  originLng?: number | string | null;
  originLabel?: string;
  destLabel?: string;
  /** Tailwind height class for inline map (defaults to "h-56"). */
  heightClass?: string;
  /** Optional Google Maps directions URL shown in the expanded modal. */
  directionsUrl?: string;
  /** Title for the expanded fullscreen map modal. */
  modalTitle?: string;
  className?: string;
}

function toCoord(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makePinIcon(L: typeof Leaflet, label: string, color: string) {
  const safe = label.replace(/[<>&"']/g, "");
  return L.divIcon({
    className: "caresaath-route-pin",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:none;">
      <div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.22);margin-bottom:4px;border:1.5px solid #fff;">${safe}</div>
      <div style="width:16px;height:16px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function LeafletRouteCanvas({
  lat,
  lng,
  originLat,
  originLng,
  originLabel,
  destLabel,
  heightClass,
  interactive,
  onDistance,
  recenterSignal,
}: {
  lat: number;
  lng: number;
  originLat: number | null;
  originLng: number | null;
  originLabel: string;
  destLabel: string;
  heightClass: string;
  interactive: boolean;
  onDistance?: (meters: number | null) => void;
  recenterSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const destMarkerRef = useRef<Leaflet.Marker | null>(null);
  const originMarkerRef = useRef<Leaflet.Marker | null>(null);
  const routeLayerRef = useRef<Leaflet.Polyline | null>(null);
  const lastRouteKeyRef = useRef<string>("");
  const fittedRef = useRef(false);
  // Incremented once async `import("leaflet")` finishes so the sync effect runs immediately.
  const [mapReady, setMapReady] = useState(0);

  const hasOrigin =
    originLat !== null &&
    originLng !== null &&
    Number.isFinite(originLat) &&
    Number.isFinite(originLng) &&
    (originLat !== 0 || originLng !== 0) &&
    haversineMeters(originLat, originLng, lat, lng) > 25;

  // Mount Leaflet map once on the client.
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: interactive,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        attributionControl: false,
      });

      // OpenStreetMap tiles (free, no API key) with ArcGIS World Street Map fallback on error.
      let fallbackAdded = false;
      const primaryTiles = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
        },
      );
      primaryTiles.on("tileerror", () => {
        if (fallbackAdded || cancelled || !mapRef.current) return;
        fallbackAdded = true;
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
          },
        ).addTo(map);
      });
      primaryTiles.addTo(map);

      const destMarker = L.marker([lat, lng], {
        icon: makePinIcon(L, destLabel, "#d97706"),
      }).addTo(map);

      mapRef.current = map;
      destMarkerRef.current = destMarker;
      fittedRef.current = false;
      lastRouteKeyRef.current = "";

      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        observer = new ResizeObserver(() => {
          if (!cancelled && mapRef.current) {
            mapRef.current.invalidateSize();
          }
        });
        observer.observe(containerRef.current);
      }

      setTimeout(() => {
        if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
      }, 120);

      // Trigger the coordinate/route sync effect now that the Leaflet map exists.
      setMapReady((n) => n + 1);
    }

    init().catch(() => undefined);

    return () => {
      cancelled = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        destMarkerRef.current = null;
        originMarkerRef.current = null;
        routeLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Sync markers, bounds, and OSRM driving route whenever map is ready or coordinates change.
  useEffect(() => {
    if (mapReady === 0) return;
    let cancelled = false;
    const controller = new AbortController();

    async function sync() {
      const map = mapRef.current;
      const destMarker = destMarkerRef.current;
      if (!map || !destMarker) return;
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      destMarker.setLatLng([lat, lng]);
      destMarker.setIcon(makePinIcon(L, destLabel, "#d97706"));

      if (!hasOrigin || originLat === null || originLng === null) {
        if (originMarkerRef.current) {
          originMarkerRef.current.remove();
          originMarkerRef.current = null;
        }
        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
          routeLayerRef.current = null;
        }
        onDistance?.(null);
        if (!fittedRef.current || recenterSignal > 0) {
          map.setView([lat, lng], 15, { animate: fittedRef.current });
          fittedRef.current = true;
        }
        return;
      }

      if (!originMarkerRef.current) {
        originMarkerRef.current = L.marker([originLat, originLng], {
          icon: makePinIcon(L, originLabel, "#0f766e"),
        }).addTo(map);
      } else {
        originMarkerRef.current.setLatLng([originLat, originLng]);
        originMarkerRef.current.setIcon(makePinIcon(L, originLabel, "#0f766e"));
      }

      // Immediately fit both pins in view before OSRM finishes so the user sees both markers right away.
      if (!fittedRef.current || recenterSignal > 0) {
        const bounds = L.latLngBounds([
          [originLat, originLng],
          [lat, lng],
        ]);
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: fittedRef.current });
        fittedRef.current = true;
      }

      const routeKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}->${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (routeKey !== lastRouteKeyRef.current) {
        lastRouteKeyRef.current = routeKey;
        const straightDist = haversineMeters(originLat, originLng, lat, lng);
        let pts: [number, number][] = [
          [originLat, originLng],
          [lat, lng],
        ];
        let roadMeters = straightDist;
        let dashed = true;

        // Draw immediate dashed preview while OSRM road route loads.
        if (routeLayerRef.current) routeLayerRef.current.remove();
        routeLayerRef.current = L.polyline(pts, {
          color: "#0f766e",
          weight: 4,
          opacity: 0.55,
          dashArray: "8 6",
        }).addTo(map);
        onDistance?.(straightDist);

        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${lng},${lat}?overview=full&geometries=geojson`;
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const data = (await res.json()) as {
              routes?: Array<{
                distance?: number;
                geometry?: { coordinates?: Array<[number, number]> };
              }>;
            };
            const first = data.routes?.[0];
            const coords = first?.geometry?.coordinates;
            if (coords && coords.length >= 2) {
              pts = coords.map(([lo, la]) => [la, lo]);
              if (typeof first.distance === "number" && first.distance > 0) {
                roadMeters = first.distance;
              }
              dashed = false;
            }
          }
        } catch {
          // Keep straight dashed line fallback.
        }

        if (cancelled || !mapRef.current) return;
        onDistance?.(roadMeters);

        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }
        routeLayerRef.current = L.polyline(pts, {
          color: "#0f766e",
          weight: 4,
          opacity: 0.92,
          dashArray: dashed ? "8 6" : undefined,
        }).addTo(map);

        if (!dashed) {
          map.fitBounds(routeLayerRef.current.getBounds(), {
            padding: [48, 48],
            maxZoom: 16,
            animate: true,
          });
        }
      }
    }

    sync().catch(() => undefined);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mapReady, lat, lng, originLat, originLng, hasOrigin, originLabel, destLabel, recenterSignal, onDistance]);

  return <div ref={containerRef} className={`w-full ${heightClass}`} />;
}

/**
 * Interactive Leaflet + CARTO/OpenStreetMap route map with real OSRM driving road
 * routing, labeled pins, distance overlay, and a fullscreen zoomable modal.
 */
export function LiveRouteMap({
  lat,
  lng,
  originLat,
  originLng,
  originLabel = "Doctor",
  destLabel = "Home",
  heightClass = "h-56",
  directionsUrl,
  modalTitle = "Live route map",
  className,
}: LiveRouteMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [recenterTick, setRecenterTick] = useState(0);

  const dLat = toCoord(lat);
  const dLng = toCoord(lng);
  const oLat = toCoord(originLat);
  const oLng = toCoord(originLng);

  if (dLat === null || dLng === null || (dLat === 0 && dLng === 0)) {
    return null;
  }

  return (
    <>
      <div className={`relative z-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-50 ${className ?? ""}`}>
        <LeafletRouteCanvas
          lat={dLat}
          lng={dLng}
          originLat={oLat}
          originLng={oLng}
          originLabel={originLabel}
          destLabel={destLabel}
          heightClass={heightClass}
          interactive={false}
          onDistance={setDistanceMeters}
          recenterSignal={recenterTick}
        />

        {distanceMeters != null && (
          <span className="pointer-events-none absolute start-2.5 top-2.5 z-[400] inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-brand-800 shadow-sm ring-1 ring-ink-200">
            <Navigation className="size-3 text-brand-600" />
            {formatDistance(distanceMeters)}
          </span>
        )}

        <div className="absolute end-2.5 top-2.5 z-[400] flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand map"
            className="inline-flex items-center gap-1 rounded-lg bg-white/95 px-2.5 py-1.5 text-xs font-bold text-ink-800 shadow-sm ring-1 ring-ink-200 transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            <Maximize2 className="size-3.5" />
            <span>Expand</span>
          </button>
        </div>
      </div>

      {expanded && (
        <Modal open onClose={() => setExpanded(false)} size="lg" title={modalTitle}>
          <div className="space-y-3">
            <div className="relative z-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
              <LeafletRouteCanvas
                lat={dLat}
                lng={dLng}
                originLat={oLat}
                originLng={oLng}
                originLabel={originLabel}
                destLabel={destLabel}
                heightClass="h-[60vh] min-h-[340px]"
                interactive
                onDistance={setDistanceMeters}
                recenterSignal={recenterTick}
              />
              {distanceMeters != null && (
                <span className="pointer-events-none absolute start-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-brand-800 shadow-sm ring-1 ring-ink-200">
                  <Navigation className="size-3.5 text-brand-600" />
                  {formatDistance(distanceMeters)} by road
                </span>
              )}
              <button
                type="button"
                onClick={() => setRecenterTick((n) => n + 1)}
                aria-label="Recenter map"
                className="absolute bottom-3 end-3 z-[400] inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-ink-800 shadow-sm ring-1 ring-ink-200 hover:bg-brand-50"
              >
                <Crosshair className="size-3.5 text-brand-700" /> Recenter
              </button>
            </div>
            {directionsUrl && (
              <div className="flex justify-end">
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-800"
                >
                  <Navigation className="size-4" /> Open in Google Maps
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
