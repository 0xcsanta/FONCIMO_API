// Data-grounded fallbacks for missing administrative zoning values. UI-free.
// Official fields stay null; estimates live in their own metadata and never propagate
// from one estimated parcel to another.
import { findNeighbors } from "./neighbors.mjs";
import { effectiveZone } from "./types.mjs";
const FIELD_LABEL = {
    niveaux_max: "Nombre maximal de niveaux",
    indice_utilisation: "IOS maximum",
};
function officialValues(parcels, field) {
    return parcels
        .map((p) => p[field])
        .filter((v) => v != null && Number.isFinite(v) && v > 0)
        .map((v) => Math.round(v * 1_000_000) / 1_000_000);
}
/** Most frequent value; ties keep the nearest/first reference rather than inventing an average. */
function mode(values) {
    if (!values.length)
        return null;
    const counts = new Map();
    values.forEach((value, index) => {
        const current = counts.get(value);
        counts.set(value, { count: (current?.count ?? 0) + 1, first: current?.first ?? index });
    });
    const [value, selected] = [...counts.entries()].sort(([, a], [, b]) => b.count - a.count || a.first - b.first)[0];
    return { value, support: selected.count };
}
const sameZone = (a, b) => a.commune === b.commune && effectiveZone(a) != null && effectiveZone(a) === effectiveZone(b);
/**
 * Fill missing levels/IOS from official values only:
 * 1. modal value of touching parcels in exactly the same zone;
 * 2. modal value of all parcels in that zone and commune.
 * No geometry or no same-zone reference means no estimate and the score stays non calculable.
 */
export function estimateMissingRegulations(parcels) {
    return parcels.map((p) => {
        const missing = ["niveaux_max", "indice_utilisation"].filter((field) => p[field] == null && p.estimations_reglementaires?.[field] == null);
        if (!missing.length || effectiveZone(p) == null)
            return p;
        const neighbors = findNeighbors(p, parcels, 40).filter((q) => sameZone(p, q));
        const zonePeers = parcels.filter((q) => q.egrid !== p.egrid && sameZone(p, q));
        const estimations = { ...p.estimations_reglementaires };
        for (const field of missing) {
            const nearby = mode(officialValues(neighbors, field));
            const zonal = mode(officialValues(zonePeers, field));
            const selected = nearby ?? zonal;
            if (!selected)
                continue;
            estimations[field] = {
                value: selected.value,
                methode: nearby ? "voisinage" : "zone",
                references: selected.support,
            };
        }
        return Object.keys(estimations).length ? { ...p, estimations_reglementaires: estimations } : p;
    });
}
export const estimateSuffix = (p, field) => {
    const estimate = p.estimations_reglementaires?.[field];
    return p[field] == null && estimate ? ` (estimé ${estimate.methode})` : "";
};
export function regulationEstimateNotes(p) {
    return ["niveaux_max", "indice_utilisation"].flatMap((field) => {
        const estimate = p.estimations_reglementaires?.[field];
        if (p[field] != null || !estimate)
            return [];
        const origin = estimate.methode === "voisinage" ? "parcelles voisines de même zone" : "parcelles de même zone";
        return [`${FIELD_LABEL[field]} estimé d’après ${estimate.references} ${origin} — valeur officielle à vérifier`];
    });
}
