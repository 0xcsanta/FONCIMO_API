"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Carte Leaflet (OpenStreetMap) affichant la parcelle surlignée.
export default function ParcelMap({ carte }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!carte || !ref.current) return;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      // (ré)initialise la carte
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const center = carte.centroid
        ? [carte.centroid.lat, carte.centroid.lng]
        : [46.509, 6.66];
      const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: false }).setView(center, 17);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      if (carte.geojson) {
        const layer = L.geoJSON(carte.geojson, {
          style: { color: "#2a3c37", weight: 2, fillColor: "#d3de79", fillOpacity: 0.45 },
        }).addTo(map);
        try {
          map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 18 });
        } catch (e) {
          /* geometry vide : on garde le centre */
        }
      } else if (carte.centroid) {
        L.circleMarker(center, { radius: 10, color: "#2a3c37", fillColor: "#d3de79", fillOpacity: 0.7 }).addTo(map);
      }

      setTimeout(() => map.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [carte]);

  return <div ref={ref} className="parcel-map" />;
}
