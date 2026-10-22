"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { GridLayer, type Coords, type DoneCallback } from "leaflet";
import { satelliteTileRegion, satelliteTileUrl } from "@/lib/satellite-tiles";

export default function SatelliteLayer({ onReady, onError, onFallback }: {
  onReady: () => void; onError: () => void; onFallback: () => void;
}) {
  const map = useMap();
  const callbacks = useRef({ onReady, onError, onFallback });
  callbacks.current = { onReady, onError, onFallback };
  useEffect(() => {
    let active = true;
    const pending = new Set<HTMLImageElement>();
    class Imagery extends GridLayer {
      createTile(coords: Coords, done: DoneCallback) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d")!;
        function load(sourceZoom: number) {
          if (!active) return;
          const region = satelliteTileRegion(coords.x, coords.y, coords.z, sourceZoom);
          const image = new Image();
          pending.add(image);
          image.onload = () => {
            pending.delete(image);
            if (!active) return;
            context.drawImage(image, region.left, region.top, region.size, region.size, 0, 0, 256, 256);
            if (sourceZoom < coords.z) callbacks.current.onFallback();
            callbacks.current.onReady();
            done(undefined, canvas);
          };
          image.onerror = () => {
            pending.delete(image);
            if (!active) return;
            if (sourceZoom > 0) load(sourceZoom - 1);
            else { callbacks.current.onError(); done(new Error("Satellite imagery unavailable"), canvas); }
          };
          image.src = satelliteTileUrl(sourceZoom, region.x, region.y);
        }
        load(Math.min(coords.z, 19));
        return canvas;
      }
    }
    const layer = new Imagery({ maxZoom: 21, attribution: "Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community" });
    layer.addTo(map);
    return () => {
      active = false;
      pending.forEach(image => { image.onload = image.onerror = null; image.src = ""; });
      pending.clear();
      layer.remove();
    };
  }, [map]);
  return null;
}
