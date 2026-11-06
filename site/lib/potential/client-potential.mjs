import { computePotentiel } from "./potentiel.mjs";
import { estimateMissingRegulations } from "./regulation-estimates.mjs";
import { lv95ToWgs84 } from "./lv95.mjs";
// Exact EGRID joins only. No aggregate RPC values substitute for building rows.
export function clientPotential(parcel, year = new Date().getFullYear()) {
    const result = computePotentiel(parcel, year);
    const best = result.meilleure ? result.strategies[result.meilleure] : null;
    return {
        note: best?.score100 ?? null,
        label: best ? (best.score100 >= 75 ? "Fort potentiel" : best.score100 >= 50 ? "Potentiel intéressant" : best.score100 >= 25 ? "Potentiel modéré" : "Potentiel limité") : "Non calculable",
        constructible: best != null,
        meilleure: result.meilleure,
        priorite: result.priorite,
        facteurs: best ? [
            ...best.facteurs.map(f => ({ cle: f.cle, label: f.label, valeur: `${Math.round(f.valeur * 1000) / 10} %`, points: Math.round(f.contrib * 100) / 100 })),
            ...best.malus.map((m, i) => ({ cle: `malus-${i}`, label: m.label, valeur: "", points: m.points })),
        ] : [],
        ...result,
    };
}
export function previewPotential(pot) {
    return { note: pot.note, label: pot.label, constructible: pot.constructible,
        meilleure: pot.meilleure, priorite: pot.priorite,
        facteurs: pot.facteurs.map(f => ({ label: f.label })) };
}
export async function loadClientPotential(supa, egrid) {
    if (!/^CH[0-9]{12}$/.test(egrid))
        throw new Error("Identité de parcelle invalide");
    const [p, b] = await Promise.all([
        supa.from("parcelle").select("*").eq("egrid", egrid).single(),
        supa.from("batiment").select("*", { count: "exact" }).eq("egrid", egrid).order("egid").limit(1000),
    ]);
    if (p.error || b.error || !p.data || !Array.isArray(b.data))
        throw new Error("Données de calcul indisponibles");
    if (p.data.egrid !== egrid || b.data.some((row) => row.egrid !== egrid))
        throw new Error("Identités de calcul incohérentes");
    if (b.count == null || b.count !== b.data.length)
        throw new Error("Liste des bâtiments incomplète");
    if (new Set(b.data.map((row) => row.egid)).size !== b.data.length)
        throw new Error("Identifiants de bâtiment dupliqués");
    const parcel = withGeometry({ ...p.data, buildings: b.data });
    if ((parcel.niveaux_max == null || parcel.indice_utilisation == null) && parcel.commune && (parcel.affectation_detaillee || parcel.zone_affectation)) {
        // Same modal fallback as Radar, from original values of the same commune/zone only.
        // Bounded paging; no estimated value is ever written back or reused as a source value.
        const peers = [];
        let total = 0;
        for (let offset = 0;; offset += 1000) {
            let query = supa.from("parcelle").select("egrid,commune,zone_affectation,affectation_detaillee,niveaux_max,indice_utilisation,geom", { count: "exact" }).eq("commune", parcel.commune);
            query = parcel.affectation_detaillee ? query.eq("affectation_detaillee", parcel.affectation_detaillee) : query.eq("zone_affectation", parcel.zone_affectation);
            const page = await query.order("egrid").range(offset, offset + 999);
            if (page.error || !Array.isArray(page.data) || page.count == null || page.count > 10000 || (offset && page.count !== total))
                throw new Error("Références de zone indisponibles");
            total = page.count;
            peers.push(...page.data.map((row) => withGeometry({ ...row, buildings: [] })));
            if (peers.length >= total)
                break;
            if (!page.data.length)
                throw new Error("Références de zone incomplètes");
        }
        if (peers.length !== total || new Set(peers.map(p => p.egrid)).size !== total)
            throw new Error("Références de zone incohérentes");
        const references = peers.filter(p => p.egrid !== parcel.egrid);
        return clientPotential(estimateMissingRegulations([parcel, ...references])[0]);
    }
    return clientPotential(parcel);
}
function withGeometry(row) {
    const geom = row.geom;
    const polygons = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
    const rings = polygons.flatMap((poly) => poly.map(ring => ring.map(([e, n]) => lv95ToWgs84(e, n))));
    const outer = rings[0];
    const center = outer?.length ? [outer.reduce((s, c) => s + c[0], 0) / outer.length, outer.reduce((s, c) => s + c[1], 0) / outer.length] : null;
    return { ...row, rings, center };
}
