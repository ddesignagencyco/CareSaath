"use client";

import { Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
}

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  city?: string | null;
  onChange: (pos: { lat: string; lng: string; placeName?: string }) => void;
  className?: string;
}

/**
 * Interactive OpenStreetMap picker with Lahore place search (Nominatim) +
 * click-anywhere / draggable pin drop. Zero API keys required.
 */
export function LocationPickerMap({
  lat,
  lng,
  city,
  onChange,
  className,
}: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Initialize Leaflet map on the client only.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: "caresaath-pin-icon",
        html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:#0f766e;border:3px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.28);color:#ffffff;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);

      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({
          lat: p.lat.toFixed(6),
          lng: p.lng.toFixed(6),
        });
      });

      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const { lat: nextLat, lng: nextLng } = e.latlng;
        marker.setLatLng([nextLat, nextLng]);
        onChangeRef.current({
          lat: nextLat.toFixed(6),
          lng: nextLng.toFixed(6),
        });
      });

      mapRef.current = map;
      markerRef.current = marker;

      // Ensure tiles size correctly inside modals/dialogs.
      setTimeout(() => {
        if (!cancelled) map.invalidateSize();
      }, 120);
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // Intentionally mount once; subsequent lat/lng updates are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng changes (e.g. "Use my current location" or search pick).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - lat) > 0.00001 || Math.abs(current.lng - lng) > 0.00001) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [lat, lng]);

  // Debounced OpenStreetMap Nominatim search scoped to city (Lahore).
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const searchCity = city || "Lahore";
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          `${trimmed}, ${searchCity}, Pakistan`,
        )}&format=json&limit=5&addressdetails=0`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as Array<{
          lat?: string;
          lon?: string;
          display_name?: string;
        }>;
        const parsed: SearchResult[] = [];
        for (const item of data) {
          const itemLat = Number(item.lat);
          const itemLng = Number(item.lon);
          const name = (item.display_name ?? "").trim();
          if (Number.isFinite(itemLat) && Number.isFinite(itemLng) && name) {
            parsed.push({ name, lat: itemLat, lng: itemLng });
          }
        }
        setResults(parsed);
        setShowResults(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, city]);

  function selectResult(r: SearchResult) {
    const shortName = r.name.split(",").slice(0, 2).join(", ").trim();
    setQuery(shortName);
    setShowResults(false);
    setResults([]);
    onChange({
      lat: r.lat.toFixed(6),
      lng: r.lng.toFixed(6),
      placeName: shortName,
    });
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([r.lat, r.lng]);
      mapRef.current.setView([r.lat, r.lng], 16, { animate: true });
    }
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => {
            if (results.length > 0) setShowResults(true);
          }}
          placeholder="Search DHA, Johar Town, Model Town, Gulberg…"
          className="h-10 w-full rounded-xl border border-ink-200 bg-white pe-9 ps-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
        />
        {searching ? (
          <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand-600" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setShowResults(false);
            }}
            aria-label="Clear search"
            className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="size-3.5" />
          </button>
        ) : null}

        {showResults && results.length > 0 && (
          <ul className="absolute z-[1000] mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-lg">
            {results.map((r, idx) => (
              <li key={`${r.lat}-${r.lng}-${idx}`}>
                <button
                  type="button"
                  onClick={() => selectResult(r)}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-start text-sm text-ink-800 hover:bg-brand-50"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  <span className="line-clamp-2">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="relative z-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
        <div ref={containerRef} className="h-60 w-full" />
      </div>

      <p className="text-xs text-ink-500">
        Search an area above, click anywhere on the map, or drag the pin to set the exact location.
      </p>
    </div>
  );
}
