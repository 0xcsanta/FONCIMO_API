/**
 * Swiss LV95 (EPSG:2056) → WGS84 conversion using the official swisstopo
 * approximate formulas (accuracy ≈ 1 m, sufficient for map display).
 * Source: swisstopo, « Formules approchées pour la transformation entre coordonnées suisses et WGS84 ».
 */
export function lv95ToWgs84(e, n) {
    const y = (e - 2_600_000) / 1_000_000;
    const x = (n - 1_200_000) / 1_000_000;
    const lng = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
    const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
    const r = (v) => Math.round(v * 1e6) / 1e6;
    return [r((lat * 100) / 36), r((lng * 100) / 36)];
}
