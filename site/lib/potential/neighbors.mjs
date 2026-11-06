/** ~4 m in degrees at Pully's latitude — tolerance for "shared boundary". */
const TOL = 0.00005;
function bbox(rings) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const ring of rings)
        for (const [lat, lng] of ring) {
            if (lat < minLat)
                minLat = lat;
            if (lat > maxLat)
                maxLat = lat;
            if (lng < minLng)
                minLng = lng;
            if (lng > maxLng)
                maxLng = lng;
        }
    return { minLat, maxLat, minLng, maxLng };
}
/** Squared distance from point p to segment ab, with lng scaled by cos(lat). */
function segDist2(p, a, b) {
    const k = Math.cos((p[0] * Math.PI) / 180);
    const px = p[1] * k, py = p[0];
    const ax = a[1] * k, ay = a[0];
    const bx = b[1] * k, by = b[0];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx, cy = ay + t * dy;
    return (px - cx) ** 2 + (py - cy) ** 2;
}
/** True when a vertex of one outline lies on (or within tol of) a segment of the other. */
function touches(a, b, tol) {
    const tol2 = tol * tol;
    const near = (pts, ring) => {
        for (const pt of pts)
            for (let i = 0; i < ring.length - 1; i++)
                if (segDist2(pt, ring[i], ring[i + 1]) <= tol2)
                    return true;
        return false;
    };
    for (const ra of a)
        for (const rb of b)
            if (near(ra, rb) || near(rb, ra))
                return true;
    return false;
}
/**
 * Parcels sharing a boundary with `p`, sorted by centre distance, capped at `max`.
 * Returns [] when `p` has no usable geometry (caller shows « Voisinage non disponible »).
 */
export function findNeighbors(p, all, max = 12) {
    if (!p.rings.length)
        return [];
    const bb = bbox(p.rings);
    const pad = TOL * 4;
    const out = [];
    for (const q of all) {
        if (q.egrid === p.egrid || !q.rings.length)
            continue;
        const qb = bbox(q.rings);
        if (qb.minLat > bb.maxLat + pad || qb.maxLat < bb.minLat - pad || qb.minLng > bb.maxLng + pad || qb.maxLng < bb.minLng - pad)
            continue;
        if (!touches(p.rings, q.rings, TOL))
            continue;
        const d = p.center && q.center ? Math.hypot(p.center[0] - q.center[0], p.center[1] - q.center[1]) : 0;
        out.push({ q, d });
    }
    return out.sort((x, y) => x.d - y.d).slice(0, max).map((o) => o.q);
}
