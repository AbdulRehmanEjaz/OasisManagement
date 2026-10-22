export const satelliteTileUrl = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?blankTile=false`;

// Crop the exact area of an ancestor tile; never shift a report's coordinates.
export function satelliteTileRegion(x: number, y: number, zoom: number, sourceZoom: number) {
  const scale = 2 ** (zoom - sourceZoom);
  return {
    x: Math.floor(x / scale), y: Math.floor(y / scale), z: sourceZoom,
    left: (x % scale) * 256 / scale, top: (y % scale) * 256 / scale,
    size: 256 / scale,
  };
}
