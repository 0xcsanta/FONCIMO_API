// Potentiel 3 stratégies (spéc. 06.11.2026 + garde-fous discutés). UI-free, exploratoire, jamais juridique.
import { effectiveNiveauxMax, effectiveSurfaceConstructible } from "./types.mjs";
import { regulationEstimateNotes } from "./regulation-estimates.mjs";
export const STRATEGY_LABEL = { agrandissement: "Agrandissement", surelevation: "Surélévation", reconstruction: "Démolition-reconstruction" };
export const FACTOR_LABEL = { G: "Gain de surface", V: "Logements créables", P: "Pleine terre", L: "Sol / terrain", N: "Mise aux normes", S: "Structure porteuse", A: "Ancienneté du bâti", D: "Besoin de renouvellement", Y: "Polluants (avant 1991)", B: "Performance carbone" };
export const WEIGHTS = {
    agrandissement: { G: 42, V: 20, P: 14, L: 14, N: 10 },
    surelevation: { G: 38, V: 18, L: 10, N: 12, S: 22 },
    reconstruction: { G: 34, V: 16, P: 5, L: 7, A: 10, D: 12, Y: 8, B: 8 },
};
/** RegBL energy codes treated as fossil (gaz, mazout). */
const FOSSIL = new Set([7520, 7530]);
const NON_DENSIFIABLE = /verdure|besoins? publics?|int[ée]r[êe]t public|sport|parc|agricole|for[êe]t|cimeti[èe]re/i;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const num = (v) => (v == null || v === "" ? NaN : Number(v));
/** Annexes (cat. 1060 or < 50 m²) without official storeys are assumed single-storey; never written back to raw data. */
export const isAnnexe = (b) => b.categorie === 1060 || (b.surface_sol_m2 != null && b.surface_sol_m2 < 50);
export const etagesEffectifs = (b) => b.nb_etages ?? (isAnnexe(b) ? 1 : null);
export function computePotentiel(p, year = new Date().getFullYear()) {
    const bs = p.buildings.map((b) => ({ ...b, nb_etages: etagesEffectifs(b) }));
    const annexesEstimees = p.buildings.filter((b) => b.nb_etages == null && isAnnexe(b)).length;
    const surf = p.surface_m2;
    const empriseAct = p.emprise_batie_m2 ?? (p.taux_occupation_sol != null && surf != null ? (p.taux_occupation_sol <= 1 ? p.taux_occupation_sol : p.taux_occupation_sol / 100) * surf : bs.length ? null : 0);
    const empriseMax = effectiveSurfaceConstructible(p);
    const nMax = effectiveNiveauxMax(p);
    const spExist = bs.every((b) => b.surface_sol_m2 != null && b.nb_etages != null) ? bs.reduce((s, b) => s + b.surface_sol_m2 * b.nb_etages, 0) : null;
    const spMax = empriseMax != null && nMax != null ? empriseMax * nMax : null;
    const H = spMax != null && spExist != null ? Math.max(0, spMax - spExist) : null;
    const years = bs.map((b) => b.annee_construction).filter((y) => y != null);
    const annee = years.length ? Math.min(...years) : null; // bâtiment le plus ancien
    const age = annee != null ? year - annee : null;
    const fossil = bs.some((b) => FOSSIL.has(Number(b.agent_energetique)) || FOSSIL.has(Number(b.chauffage)));
    const logements = bs.reduce((s, b) => s + (b.nb_logements ?? 0), 0);
    const notes = [num(p.note_recensement), ...bs.map((b) => num(b.note_recensement))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
    const minNote = notes.length ? Math.min(...notes) : null;
    const zone = `${p.affectation_detaillee ?? ""} ${p.zone_affectation ?? ""}`;
    const nonDens = NON_DENSIFIABLE.test(zone);
    const pente = p.pente_pct;
    const L = pente == null ? null : clamp((pente <= 15 ? 1 : 1 - (pente - 15) / 30) - (p.en_zone_archeologique ? 0.1 : 0));
    const N = age == null ? 0 : clamp(clamp(age / 80) + (fossil ? 0.2 : 0));
    const S = age == null ? 0.5 : clamp(1 - (age - 20) / 80);
    const A = age == null ? 0 : clamp((age - 30) / 60);
    const D = Math.max(A, fossil ? 0.7 : 0);
    const Y = annee == null ? 0.3 : annee < 1991 ? 1 : annee <= 2005 ? 0.3 : 0;
    const B = clamp(A * (fossil ? 1 : 0.5));
    const Pf = surf && empriseMax != null ? clamp((surf - empriseMax) / surf) : null;
    const G = (gain) => 0.65 * (1 - Math.exp(-gain / 300)) + 0.35 * (gain / (gain + (spExist ?? 0) + 100));
    const V = (gain) => 1 - Math.exp(-gain / 100 / 6);
    const commonMalus = [];
    if (pente != null && pente > 45)
        commonMalus.push({ label: "Pente > 45 %", points: -15 });
    if (p.limite_construction === true)
        commonMalus.push({ label: "Limite des constructions", points: -8 });
    if (p.jardin_historique || p.site_protege)
        commonMalus.push({ label: "Jardin historique / site protégé", points: -12 });
    function build(id, gain, block) {
        const base = { id, gainM2: gain, facteurs: [], malus: [] };
        if (nonDens)
            return { ...base, statut: "non_applicable", raison: "Zone non densifiable", score100: null };
        if (block)
            return { ...base, statut: "non_applicable", raison: block, score100: null };
        if (gain == null || spMax == null)
            return { ...base, statut: "non_calculable", raison: "Données insuffisantes (emprise, niveaux ou surfaces)", score100: null };
        const vals = { G: G(gain), V: V(gain), P: Pf, L, N, S, A, D, Y, B };
        const missing = Object.keys(WEIGHTS[id]).filter((k) => vals[k] == null);
        if (missing.length)
            return { ...base, statut: "non_calculable", raison: `Donnée manquante : ${missing.map((k) => FACTOR_LABEL[k]).join(", ")}`, score100: null };
        const facteurs = Object.entries(WEIGHTS[id]).map(([k, w]) => ({ cle: k, label: FACTOR_LABEL[k] ?? k, poids: w, valeur: vals[k], contrib: w * vals[k] }));
        const malus = [...commonMalus];
        if (minNote != null && minNote <= 2 && id === "agrandissement")
            malus.push({ label: `Recensement ${minNote}`, points: -40 });
        else if (minNote === 3)
            malus.push({ label: "Recensement 3", points: -25 });
        else if (minNote === 4)
            malus.push({ label: "Recensement 4", points: -8 });
        const raw = facteurs.reduce((s, f) => s + f.contrib, 0) + malus.reduce((s, m) => s + m.points, 0);
        return { ...base, facteurs, malus, statut: "ok", raison: null, score100: Math.round(clamp(raw, 0, 100) * 10) / 10 };
    }
    const nRef = nMax != null ? Math.min(nMax, 2) : null;
    const gainA = H != null && empriseMax != null && empriseAct != null && nRef != null ? Math.min(H, Math.max(0, empriseMax - empriseAct) * nRef) : null;
    const gainS = H != null && nMax != null && bs.every((b) => b.surface_sol_m2 != null && b.nb_etages != null) ? Math.min(H, bs.reduce((s, b) => s + b.surface_sol_m2 * Math.max(0, nMax - b.nb_etages), 0)) : null;
    const maxEtages = bs.length ? Math.max(...bs.map((b) => b.nb_etages ?? 0)) : null;
    const blockA = empriseMax == null ? null : empriseAct != null && empriseMax <= empriseAct ? "Emprise au sol déjà saturée" : null;
    const blockS = !bs.length ? "Aucun bâtiment" : minNote != null && minNote <= 2 ? "Recensement 1–2 (monument)" : nMax != null && maxEtages != null && nMax <= maxEtages ? "Bâtiment déjà à la hauteur maximale" : null;
    const blockR = minNote != null && minNote <= 2 ? "Recensement 1–2 (monument)"
        : bs.length && empriseAct != null && empriseMax != null && empriseAct > empriseMax ? "Emprise existante au-delà du plafond : on perdrait des droits acquis"
            : age != null && age < 30 && logements > 4 ? `Immeuble récent (${annee}) de ${logements} logements` : null;
    const strategies = {
        agrandissement: build("agrandissement", gainA, blockA),
        surelevation: build("surelevation", gainS, blockS),
        reconstruction: build("reconstruction", H, blockR),
    };
    const ok = Object.values(strategies).filter((s) => s.statut === "ok");
    const best = ok.length ? ok.reduce((a, b) => (b.score100 > a.score100 ? b : a)) : null;
    const s = best?.score100 ?? null;
    const priorite = s == null ? null : s >= 70 && (minNote == null || minNote > 3) ? "P1" : s >= 50 ? "P2" : "P3";
    const avertissements = [...regulationEstimateNotes(p), ...(annexesEstimees ? [`${annexesEstimees} annexe(s) sans étages officiels comptée(s) de plain-pied (1 niveau, estimé)`] : []), ...new Set(Object.values(strategies).flatMap((x) => x.malus.map((m) => `${m.label} : ${m.points}`)))];
    return { strategies, meilleure: best?.id ?? null, priorite, avertissements, spExist, spMax };
}
