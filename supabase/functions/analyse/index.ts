// =====================================================================
//  Edge Function : analyse  (outil /tool)
//    - "defauts" : grille de poids par defaut + libelles + sources
//    - "suggest" : autocompletion d'adresses (Pully)
//    - "analyse" : 3 strategies ponderees (poids ajustables cote client)
//  Le scoring s'appuie sur de vraies colonnes de la base (voir SOURCES).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

const LAMBDA = 300;
const GEL_MULT = 0.6;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const num = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number(x));
const sat = (x: number, k = LAMBDA) => 1 - Math.exp(-Math.max(0, x) / k);
const labelFor = (n: number) => (n >= 75 ? "Fort potentiel" : n >= 50 ? "Potentiel intéressant" : n >= 25 ? "Potentiel modéré" : "Potentiel limité");
const exclue = (aff: string) => /verdure|besoins publics|utilit|sport|parc|agricole|foret|forêt|cimeti/i.test((aff || "").toLowerCase());

const POIDS: Record<string, Record<string, number>> = {
  agrandissement: { G: 20, E: 8, P: 8, I: 10, L: 8, C: 6, N: 8, O: 5, V: 18, R: 4, B: 2, A: 3 },
  elevation: { G: 18, E: 8, S: 15, F: 10, T: 8, C: 6, N: 8, O: 5, V: 14, R: 3, B: 2, A: 3 },
  demolition: { G: 23, E: 8, P: 5, L: 8, C: 6, O: 5, V: 13, R: 4, B: 4, A: 2, D: 8, X: 8, Y: 6 },
};
const LABELS: Record<string, string> = {
  G: "Gain net de surface", E: "Efficacité des surfaces", P: "Marge de pleine terre",
  I: "Intégration au bâti conservé", S: "Structure", F: "Fondations existantes",
  T: "Transformation de toiture", L: "Sol et terrain", C: "Conditions de chantier",
  N: "Adaptations normatives du bâti", O: "Limitation des perturbations",
  V: "Création de valeur comparative", R: "Robustesse économique", B: "Performance carbone",
  A: "Ancienneté", D: "Besoin de renouvellement", X: "Déconstruction", Y: "Polluants",
};
const SOURCES: Record<string, string> = {
  G: "surface_constructible, emprise_bâtie, niveaux_max, étages existants",
  E: "hypothèse (compacité)", P: "surface, surface_constructible (IOS)",
  I: "note_recensement, limite_construction", S: "année de construction",
  F: "année, étages existants", T: "niveaux_max vs étages, recensement",
  L: "pente, zone archéologique", C: "pente, surface, affectation",
  N: "année de construction", O: "stratégie, nb_logements",
  V: "gain × attractivité de zone", R: "attractivité de zone",
  B: "stratégie, année", A: "année de construction",
  D: "surf. plancher existante vs max, année", X: "surf. plancher existante",
  Y: "année (amiante avant 1991)",
};

const ageNew = (a: number | null) => (a == null ? 0.6 : a >= 2000 ? 1 : a >= 1980 ? 0.8 : a >= 1960 ? 0.6 : a >= 1940 ? 0.45 : 0.3);
const ageOld = (a: number | null) => (a == null ? 0.6 : a < 1940 ? 1 : a < 1970 ? 0.8 : a < 2000 ? 0.5 : 0.25);
const structR = (a: number | null) => (a == null ? 0.55 : a >= 1990 ? 0.8 : a >= 1970 ? 0.65 : a >= 1950 ? 0.45 : 0.3);
const penteR = (p: number | null) => (p == null ? 0.8 : p <= 5 ? 1 : p <= 15 ? 0.9 : p <= 30 ? 0.7 : p <= 45 ? 0.45 : 0.25);
const zonePremium = (aff: string) => { const a = (aff || "").toLowerCase(); return a.includes("forte") ? 1 : a.includes("moyenne") ? 0.85 : a.includes("faible") ? 0.65 : a.includes("central") ? 0.9 : 0.55; };

type Ctx = any;
const RF: Record<string, (s: string, c: Ctx) => number> = {
  G: (s, c) => sat(s === "agrandissement" ? c.dspAgr : s === "elevation" ? c.dspElev : c.dspDemo),
  E: (s) => (s === "demolition" ? 0.80 : s === "elevation" ? 0.68 : 0.72),
  P: (_s, c) => { const free = c.S > 0 ? (c.S - c.Fmax) / c.S : 0; return clamp((free - 0.3) / 0.5, 0, 1); },
  I: (_s, c) => { let r = c.rec == null ? 0.9 : c.rec <= 2 ? 0.25 : c.rec === 3 ? 0.45 : c.rec === 4 ? 0.7 : 0.9; if (c.limite) r -= 0.1; return clamp(r, 0, 1); },
  S: (_s, c) => structR(c.annee),
  F: (_s, c) => clamp(structR(c.annee) * (1 - 0.08 * c.Nact), 0, 1),
  T: (_s, c) => { const base = c.Nmax != null && c.Nmax - c.Nact > 0 ? 0.7 : 0.3; const h = c.rec == null ? 1 : c.rec <= 3 ? 0.4 : 0.85; return clamp(base * h, 0, 1); },
  L: (_s, c) => clamp(penteR(c.pente) * (c.archeo ? 0.7 : 1), 0, 1),
  C: (s, c) => { let r = penteR(c.pente) * (0.7 + 0.3 * sat(c.S, 1500)); if (c.central) r *= 0.85; if (s === "demolition") r *= 0.9; return clamp(r, 0, 1); },
  N: (_s, c) => ageNew(c.annee),
  O: (s, c) => { let b = s === "agrandissement" ? 0.9 : s === "elevation" ? 0.6 : 0.3; if ((c.logts || 0) === 0) b += 0.2; return clamp(b, 0, 1); },
  V: (s, c) => { const d = s === "agrandissement" ? c.dspAgr : s === "elevation" ? c.dspElev : c.dspDemo; return clamp(c.zoneP * sat(d, 400), 0, 1); },
  R: (_s, c) => clamp(0.4 + 0.5 * c.zoneP, 0, 1),
  B: (s, c) => (s === "demolition" ? clamp(0.45 + 0.25 * ageOld(c.annee), 0, 1) : 0.75),
  A: (s, c) => (s === "demolition" ? ageOld(c.annee) : ageNew(c.annee)),
  D: (_s, c) => { const u = c.SPmax > 0 ? clamp(1 - c.SPexist / c.SPmax, 0, 1) : 1; return clamp(0.5 * u + 0.5 * ageOld(c.annee), 0, 1); },
  X: (_s, c) => (c.nue ? 1 : clamp(1 - 0.5 * sat(c.SPexist, 1500), 0, 1)),
  Y: (_s, c) => (c.nue ? 1 : c.annee == null ? 0.6 : c.annee >= 1991 ? 0.9 : c.annee >= 1960 ? 0.4 : 0.55),
};

function scoreStrat(strat: string, c: Ctx, poids: any) {
  const base = POIDS[strat];
  const custom = (poids && poids[strat]) || {};
  let total = 0, sumW = 0;
  const tmp: { code: string; poids: number; r: number }[] = [];
  for (const k in base) {
    let pw = k in custom ? Number(custom[k]) : base[k];
    if (!isFinite(pw) || pw < 0) pw = 0;
    const r = RF[k] ? RF[k](strat, c) : 0;
    total += pw * r; sumW += pw;
    tmp.push({ code: k, poids: pw, r });
  }
  const score = sumW > 0 ? (total / sumW) * 100 : 0;
  const lignes = tmp
    .map((t) => ({ code: t.code, label: LABELS[t.code] || t.code, source: SOURCES[t.code] || "", poids: t.poids, note: Math.round(t.r * 100) / 10, contrib: sumW > 0 ? Math.round((100 * t.poids * t.r / sumW) * 10) / 10 : 0 }))
    .sort((a, b) => b.contrib - a.contrib);
  return { score: Math.round(score), lignes };
}

function analyse(d: Record<string, unknown>, poids: any, gelMult: number) {
  const S = num(d.surface_m2) || 0;
  const aff = (d.affectation_detaillee || "") + "";
  const zone = d.zone_affectation ? String(d.zone_affectation) : null;
  const indice = num(d.indice_utilisation);
  if (!(indice !== null && zone !== null && !exclue(aff))) return { densifiable: false, aff, zone };

  let Fmax = num(d.surface_constructible_m2); if (Fmax == null) Fmax = (indice ?? 0.2) * S;
  const Fexist = num(d.emprise_batie_m2) ?? 0;
  const Nmax = num(d.niveaux_max);
  const Nact = num(d.etages_max) ?? 0;
  const SPexist = num(d.sp_existante) ?? 0;
  const SPmax = Nmax != null ? Fmax * Nmax : Fmax * Math.max(Nact, 2);
  const annee = num(d.annee_min);
  const rec = num(d.note_recensement);
  const nue = Fexist <= 0 && SPexist <= 0;

  const dF = Math.max(0, Fmax - Fexist);
  const Nref = Math.min(Math.max(Nact, 1), Nmax || Math.max(Nact, 1));
  const dspAgr = dF * Nref;
  const dN = Nmax != null ? Math.max(0, Nmax - Nact) : 0;
  const dspElev = Fexist * dN;
  const dspDemo = Math.max(0, SPmax - SPexist);

  const c: Ctx = { S, Fmax, Fexist, Nmax, Nact, SPexist, SPmax, annee, rec, nue, pente: num(d.pente_pct), logts: num(d.nb_logements) ?? 0, zoneP: zonePremium(aff), central: /central/i.test(aff), archeo: d.en_zone_archeologique === true, limite: d.limite_construction === true, dspAgr, dspElev, dspDemo };
  const gel = d.en_zone_reservee === true;
  const mk = (cle: string, nom: string, dsp: number) => { const s = scoreStrat(cle, c, poids); return { cle, nom, score: Math.round(s.score * (gel ? gelMult : 1)), brut: s.score, dsp: Math.round(dsp), lignes: s.lignes }; };
  const strategies = [
    mk("agrandissement", "Agrandissement au sol", dspAgr),
    mk("elevation", "Surélévation", dspElev),
    mk("demolition", nue ? "Construction neuve" : "Démolition-reconstruction", dspDemo),
  ];
  // Batiment protege (recensement 1-3) : potentiel nul
  const protege = rec != null && rec >= 1 && rec <= 3;
  if (protege) strategies.forEach((s) => { s.score = 0; });
  const best = strategies.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    densifiable: true, gel, protege, note: best.score,
    label: protege ? `Bâtiment protégé (recensement ${rec}) — potentiel nul` : labelFor(best.score),
    strategies, best: best.cle,
    inputs: { S: Math.round(S), aff, Fmax: Math.round(Fmax), Fexist: Math.round(Fexist), Nmax, Nact, SPexist: Math.round(SPexist), SPmax: Math.round(SPmax), annee, rec, gel, pente: c.pente, nue, logts: c.logts, contraintes: [c.limite && "alignement", c.archeo && "archéo", d.site_protege && "site protégé", d.degre_bruit].filter(Boolean).join(", ") || "—" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }

  if (body.action === "defauts") return json({ poids: POIDS, labels: LABELS, sources: SOURCES });

  if (body.action === "suggest") {
    const q = String(body.query ?? "").trim();
    if (q.length < 2) return json({ suggestions: [] });
    const { data } = await supa.rpc("suggest_adresses", { p_q: q });
    return json({ suggestions: data ?? [] });
  }

  // action "analyse"
  let parc: any = null;
  if (body.egrid) {
    const { data } = await supa.rpc("get_parcelle_data", { p_query: String(body.egrid), p_type: "egrid" });
    if (data && data.found) parc = data;
  }
  if (!parc) {
    const query = String(body.query ?? "").trim();
    const type = ["numero", "adresse", "auto"].includes(body.type) ? body.type : "auto";
    if (!query) return json({ error: "Requête vide" }, 400);
    const { data, error } = await supa.rpc("get_parcelle_data", { p_query: query, p_type: type });
    if (error) return json({ error: error.message }, 500);
    parc = data;
  }
  if (!parc || !parc.found) return json({ found: false, message: "Parcelle introuvable à Pully." });

  const gelMult = body.gel === false || body.gel === "0" ? 1 : GEL_MULT;
  const out = analyse(parc, body.poids || null, gelMult);
  return json({
    found: true,
    resume: { numero: parc.numero, adresse: parc.adresse, commune: parc.commune, surface_m2: parc.surface_m2, zone: parc.affectation_detaillee || parc.zone_affectation, egrid: parc.egrid },
    carte: { centroid: parc.centroid, geojson: parc.geojson },
    ...out,
  });
});
