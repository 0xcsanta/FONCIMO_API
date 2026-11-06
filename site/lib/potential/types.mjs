// Read-only DTOs for the shared (teammates') official-data database. UI-free.
export const effectiveNiveauxMax = (p) => p.niveaux_max ?? p.estimations_reglementaires?.niveaux_max?.value ?? null;
export const effectiveIndiceUtilisation = (p) => p.indice_utilisation ?? p.estimations_reglementaires?.indice_utilisation?.value ?? null;
/** Official maximum footprint, or a transparent derivation from surface × effective IOS. */
export const effectiveSurfaceConstructible = (p) => {
    if (p.surface_constructible_m2 != null)
        return p.surface_constructible_m2;
    const ios = effectiveIndiceUtilisation(p);
    if (p.surface_m2 == null || ios == null)
        return null;
    return (ios <= 1 ? ios : ios / 100) * p.surface_m2;
};
/** Remaining footprint = effective emprise max − official emprise bâtie. Null when either is unknown. */
export const emprisReserve = (p) => {
    const max = effectiveSurfaceConstructible(p);
    return max == null || p.emprise_batie_m2 == null ? null : max - p.emprise_batie_m2;
};
/** LAT blocking per team doc: heritage rating ≤ 3 on parcel or a building. */
export function isLatBlocked(p) {
    const notes = [p.note_recensement, ...p.buildings.map((b) => b.note_recensement)]
        .map((v) => (v == null || v === "" ? NaN : Number(v))).filter((n) => Number.isFinite(n));
    return notes.some((n) => n <= 3);
}
/** Distinct official architectural inventory grades (1–7) of the linked buildings (building-level attribute), plus count of buildings without a grade. */
export function heritageGrades(p) {
    const toNum = (v) => (v == null || v === "" ? NaN : Number(v));
    const valid = (n) => Number.isInteger(n) && n >= 1 && n <= 7;
    const grades = [...new Set(p.buildings.map((b) => b.note_recensement).map(toNum).filter(valid))].sort((a, b) => a - b);
    const missing = p.buildings.filter((b) => !valid(toNum(b.note_recensement))).length;
    return { grades, missing };
}
/** DP = domaine public (roads, public domain) — hidden by default. */
export const isPublicDomain = (p) => /^DP\b/i.test(p.numero.trim());
/** Most specific zoning level shown to the user: detailed affectation when known, else the broad zone. */
export const effectiveZone = (p) => p.affectation_detaillee ?? p.zone_affectation;
/** Default map set: building-zone parcels, excluding public domain. */
export const isDefaultVisible = (p) => !isPublicDomain(p) && p.zone_affectation != null;
/** Flag for expert verification: missing zone, occupation rate, building rights index or geometry. */
export const needsVerification = (p) => p.zone_affectation == null || p.taux_occupation_sol == null || p.indice_utilisation == null || p.rings.length === 0;
export const NA = "Non disponible";
/** Official GWR (RegBL) codes — only those with a verified French label; others show the raw code. */
export const GWR_STATUT = {
    1001: "Projeté", 1002: "Autorisé", 1003: "En construction", 1004: "Existant",
    1005: "Non utilisable", 1007: "Démoli", 1008: "Non réalisé",
};
export const GWR_CATEGORIE = {
    1010: "Habitation provisoire",
    1020: "Bâtiment exclusivement à usage d'habitation",
    1030: "Autre bâtiment d'habitation (usage annexe)",
    1040: "Bâtiment partiellement à usage d'habitation",
    1060: "Bâtiment sans usage d'habitation",
    1080: "Construction particulière",
};
/** Short display label for a zone: drops legal suffixes like « 15 LAT » and the « Zone d'habitation de » prefix. Display only. */
export const zoneLabel = (z) => {
    if (!z)
        return z ?? null;
    const s = z.replace(/\s*\b\d+\s*LAT\b/gi, "").replace(/^Zones? d'habitation de\s+/i, "Habitation ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
};
