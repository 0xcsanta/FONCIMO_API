// =====================================================================
//  Edge Function : potentiel
//    - "suggest"  : autocompletion d'adresses (Pully)
//    - "evaluer"  : note de potentiel (detail masque = teaser)
//    - "capturer" : enregistre le lead, renvoie le detail, envoie l'email
//
//  Note de densification = VRAI potentiel (plafonds legaux RCATC desormais
//  en base) : marge d'emprise au sol + potentiel de surelevation, moins les
//  freins (zone reservee / gel, patrimoine, pente...).
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("FONCIMO_FROM") ?? "Foncimo <onboarding@resend.dev>";
const RDV_URL = Deno.env.get("FONCIMO_RDV_URL") ?? "https://0xcsanta.github.io/FONCIMO_API/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const num = (x: unknown): number | null =>
  x === null || x === undefined || x === "" ? null : Number(x);

type Facteur = { cle: string; label: string; valeur: string; points: number };

function labelFor(note: number): string {
  if (note >= 75) return "Fort potentiel";
  if (note >= 50) return "Potentiel intéressant";
  if (note >= 25) return "Potentiel modéré";
  return "Potentiel limité";
}

// Affectations non densifiables pour du logement (verdure, equipements publics...)
function affectationExclue(aff: string): boolean {
  return /verdure|besoins publics|utilit|d'?int[ée]r[êe]t public|sport|parc\b|agricole|for[êe]t|cimeti/i.test(aff);
}

function scoreDensification(d: Record<string, unknown>) {
  const zone = d.zone_affectation ? String(d.zone_affectation) : null;
  const aff = d.affectation_detaillee ? String(d.affectation_detaillee) : "";
  const indice = num(d.indice_utilisation);
  const surface = num(d.surface_m2) ?? 0;
  const densifiable = indice !== null && zone !== null && !affectationExclue(aff);

  if (!densifiable) {
    return {
      note: null as number | null,
      label: zone ? "Hors périmètre de densification" : "Zone à confirmer",
      constructible: false,
      facteurs: [{ cle: "zone", label: "Affectation", valeur: aff || zone || "indéterminée", points: 0 }],
    };
  }

  // Plafond au sol (emprise max autorisee), avec repli si la colonne est vide
  let surfc = num(d.surface_constructible_m2);
  if (surfc === null) surfc = (indice ?? 0.2) * surface;
  // Emprise batie actuelle, avec repli (taux d'occupation) ou 0 si parcelle nue
  let emprise = num(d.emprise_batie_m2);
  if (emprise === null) { const t = num(d.taux_occupation_sol); emprise = t !== null ? t * surface : 0; }
  const margeSol = Math.max(0, surfc - emprise);

  const facteurs: Facteur[] = [];

  // A. Marge d'emprise au sol (0-45) : fraction du plafond encore disponible
  const ratioSol = surfc > 0 ? clamp(margeSol / surfc, 0, 1) : 0;
  const ptsSol = Math.round(45 * ratioSol);
  facteurs.push({ cle: "sol", label: "Marge d'emprise au sol", valeur: `${Math.round(margeSol)} m² libres / ${Math.round(surfc)} m² autorisés`, points: ptsSol });

  // B. Potentiel de surelevation (0-35) : niveaux_max - etages actuels
  const niv = num(d.niveaux_max);
  const eact = num(d.etages_max) ?? 0;
  if (niv !== null && niv > 0) {
    const esup = Math.max(0, niv - eact);
    facteurs.push({ cle: "haut", label: "Potentiel de surélévation", valeur: `+${esup} niveau(x) (max ${niv}, actuel ${eact})`, points: Math.round(35 * clamp(esup / niv, 0, 1)) });
  } else {
    facteurs.push({ cle: "haut", label: "Potentiel de surélévation", valeur: "non défini (zone centrale)", points: 0 });
  }

  // C. Ampleur absolue du potentiel (0-20)
  facteurs.push({ cle: "ampleur", label: "Ampleur du potentiel", valeur: `${Math.round(surface)} m² de parcelle`, points: Math.round(20 * clamp(margeSol / 500, 0, 1)) });

  const base = facteurs.reduce((s, f) => s + f.points, 0);

  // --- Freins (malus) ---
  const mal: Facteur[] = [];
  if (d.en_zone_reservee === true) mal.push({ cle: "gel", label: "Zone réservée (gel temporaire des constructions)", valeur: "oui", points: -35 });
  const rec = num(d.note_recensement);
  if (rec !== null) {
    if (rec <= 2) mal.push({ cle: "rec", label: "Bâtiment protégé (recensement 1-2)", valeur: `note ${rec}`, points: -40 });
    else if (rec === 3) mal.push({ cle: "rec", label: "Valeur patrimoniale (recensement 3)", valeur: "note 3", points: -25 });
    else if (rec === 4) mal.push({ cle: "rec", label: "Intérêt patrimonial (recensement 4)", valeur: "note 4", points: -8 });
  }
  if (d.site_protege) mal.push({ cle: "site", label: "Site construit protégé", valeur: String(d.site_protege), points: -20 });
  if (d.jardin_historique) mal.push({ cle: "jardin", label: "Jardin historique", valeur: String(d.jardin_historique), points: -12 });
  if (d.en_zone_archeologique) mal.push({ cle: "archeo", label: "Zone archéologique (fouilles possibles)", valeur: "oui", points: -10 });
  if (d.limite_construction) mal.push({ cle: "limite", label: "Limite de construction (alignement)", valeur: "oui", points: -8 });
  const pente = num(d.pente_pct);
  if (pente !== null) {
    if (pente > 45) mal.push({ cle: "pente", label: "Terrain très pentu", valeur: `${pente}%`, points: -20 });
    else if (pente > 30) mal.push({ cle: "pente", label: "Terrain pentu", valeur: `${pente}%`, points: -10 });
    else if (pente > 15) mal.push({ cle: "pente", label: "Pente modérée", valeur: `${pente}%`, points: -3 });
  }
  const bruit = (d.degre_bruit ? String(d.degre_bruit) : "").toUpperCase();
  if (bruit.includes("IV")) mal.push({ cle: "bruit", label: "Nuisances sonores (DS IV)", valeur: bruit, points: -6 });
  else if (bruit.includes("III")) mal.push({ cle: "bruit", label: "Nuisances sonores (DS III)", valeur: bruit, points: -3 });

  const note = Math.round(clamp(base + mal.reduce((s, f) => s + f.points, 0), 0, 100));
  return { note, label: labelFor(note), constructible: true, facteurs: [...facteurs, ...mal] };
}

// --------------------------- EMAIL (une seule note) ------------------
const couleur = (n: number | null | undefined) =>
  n === null || n === undefined ? "#9aa5a0" : n >= 75 ? "#6f9c2f" : n >= 50 ? "#b79a1f" : n >= 25 ? "#c47a2b" : "#b4341f";

async function envoyerEmail(to: string, parc: Record<string, unknown>, s: any): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const c = couleur(s.note);
  const adresse = parc.adresse ? String(parc.adresse) : `parcelle n°${parc.numero}`;
  const surf = parc.surface_m2 ? Math.round(Number(parc.surface_m2)) + " m²" : "";
  const zone = parc.affectation_detaillee ? String(parc.affectation_detaillee).replace(" 15 LAT", "") : (parc.zone_affectation ? String(parc.zone_affectation) : "");
  const meta = [parc.commune, surf, zone].filter(Boolean).join(" · ");
  const F = "'Kanit',-apple-system,'Segoe UI',Arial,sans-serif";
  const ligne = (f: Facteur, i: number) => {
    const bg = i % 2 ? "#fafbf9" : "#ffffff";
    return `<tr><td style="padding:13px 20px;font-family:${F};font-size:14px;color:#51605a;background:${bg};border-top:1px solid #eef1ef">${f.label}</td><td style="padding:13px 14px;font-family:${F};font-size:13px;color:#8a948f;text-align:right;white-space:nowrap;background:${bg};border-top:1px solid #eef1ef">${f.valeur}</td><td style="padding:13px 20px 13px 10px;font-family:${F};font-size:14px;font-weight:700;text-align:right;color:${f.points < 0 ? "#b4341f" : "#2a3c37"};background:${bg};border-top:1px solid #eef1ef">${f.points > 0 ? "+" : ""}${f.points}</td></tr>`;
  };
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');</style></head><body style="margin:0;padding:0;background:#e9ede9;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#e9ede9">Votre note de potentiel Foncimo pour ${adresse} : ${s.note ?? "n/a"}/100.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ede9;padding:30px 12px"><tr><td align="center"><table role="presentation" width="580" cellpadding="0" cellspacing="0" style="width:580px;max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(20,28,25,.14)"><tr><td style="background:#2a3c37;padding:32px 34px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${F};font-size:27px;font-weight:700;color:#d3de79;letter-spacing:-.01em">foncimo</td><td style="text-align:right;font-family:${F};font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#9fb0a7">Expertise immobilière</td></tr></table><div style="height:1px;background:rgba(211,222,121,.28);margin:22px 0"></div><div style="font-family:${F};font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#9fb0a7">Note de potentiel</div><div style="font-family:${F};font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;margin-top:3px">${adresse}</div><div style="font-family:${F};font-size:13px;color:#c0ccc4;margin-top:4px">${meta}</div></td></tr><tr><td align="center" style="padding:34px 34px 10px"><div style="font-family:${F};font-size:68px;font-weight:700;line-height:1;color:${c}">${s.note ?? "n/a"}<span style="font-size:22px;color:#b9c2bc;font-weight:500">/100</span></div><div style="margin-top:12px"><span style="display:inline-block;font-family:${F};font-size:13px;font-weight:700;color:${c};background:#f2f5ea;padding:7px 20px;border-radius:30px">${s.label}</span></div></td></tr><tr><td style="padding:22px 34px 0;font-family:${F};font-size:15px;color:#51605a;line-height:1.65">Bonjour,<br>voici le détail du calcul de la note de potentiel établie pour votre bien.</td></tr><tr><td style="padding:22px 34px 0"><div style="font-family:${F};font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#93a09a;margin-bottom:10px">Détail du calcul</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eef1ef;border-radius:12px;overflow:hidden">${(s.facteurs || []).map(ligne).join("")}</table></td></tr><tr><td style="padding:24px 34px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6ec;border-left:4px solid #d3de79;border-radius:10px"><tr><td style="padding:18px 22px;font-family:${F};font-size:14px;color:#3a463f;line-height:1.65">Cette note est un <strong>indicateur automatique</strong>. L'analyse réelle (droits à bâtir exacts, faisabilité, valorisation) demande une expertise. <strong style="color:#2a3c37">Prenons rendez-vous :</strong> au bureau à Pully, ou je me déplace chez vous.</td></tr></table></td></tr><tr><td align="center" style="padding:28px 34px 34px"><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td align="center" bgcolor="#d3de79" style="border-radius:10px"><a href="${RDV_URL}" style="display:inline-block;padding:16px 40px;font-family:${F};font-size:15px;font-weight:700;color:#233029;text-decoration:none;border-radius:10px">Prendre rendez-vous →</a></td></tr></table></td></tr><tr><td style="background:#233029;padding:26px 34px"><div style="font-family:${F};font-size:16px;font-weight:700;color:#d3de79">foncimo</div><div style="font-family:${F};font-size:12px;color:#8b9a90;margin-top:5px">Foncimo SA · Pilotage de projet & expertise immobilière · Pully (VD)</div><div style="font-family:${F};font-size:11px;color:#5f6e66;margin-top:12px">Vous recevez cet email car vous avez demandé le détail de votre note de potentiel sur foncimo.ch.</div></td></tr></table></td></tr></table></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: `Foncimo : potentiel de ${adresse}`, html }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

// --------------------------- HANDLER ---------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }

  const rawAction = body.action;
  const query = String(body.query ?? "").trim();
  const type = ["numero", "adresse", "auto"].includes(body.type) ? body.type : "auto";

  if (rawAction === "suggest") {
    if (query.length < 2) return json({ suggestions: [] });
    const { data } = await supa.rpc("suggest_adresses", { p_q: query });
    return json({ suggestions: data ?? [] });
  }

  const action = rawAction === "capturer" ? "capturer" : "evaluer";
  if (!query && action === "evaluer" && !body.egrid) return json({ error: "Requête vide" }, 400);

  let parc: any = null;
  if (body.egrid) {
    const { data } = await supa.rpc("get_parcelle_data", { p_query: String(body.egrid), p_type: "egrid" });
    parc = data && data.found ? data : null;
  }
  if (!parc) {
    const { data, error } = await supa.rpc("get_parcelle_data", { p_query: query, p_type: type });
    if (error) return json({ error: error.message }, 500);
    parc = data;
  }

  if (!parc || !parc.found) {
    return json({ found: false, message: "Parcelle introuvable à Pully. Essayez un numéro cadastral ou une adresse de Pully." });
  }

  const pot = scoreDensification(parc);

  const carte = { centroid: parc.centroid, geojson: parc.geojson };
  const resume = {
    numero: parc.numero, adresse: parc.adresse, commune: parc.commune,
    surface_m2: parc.surface_m2, zone: parc.affectation_detaillee || parc.zone_affectation, egrid: parc.egrid,
  };

  if (action === "evaluer") {
    const masque = { note: pot.note, label: pot.label, constructible: pot.constructible, facteurs: (pot.facteurs || []).map((f: Facteur) => ({ label: f.label })) };
    return json({ found: true, resume, carte, potentiel: masque });
  }

  const email = String(body.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email invalide" }, 400);

  const emailOk = await envoyerEmail(email, parc, pot);

  await supa.from("lead").insert({
    email,
    egrid: parc.egrid,
    numero_parcelle: parc.numero,
    adresse: parc.adresse,
    commune: parc.commune,
    note_densification: pot.note,
    label_densification: pot.label,
    detail_calcul: { potentiel: pot },
    email_envoye: emailOk,
    rdv_demande: body.rdv === true,
  });

  return json({ found: true, resume, carte, potentiel: pot, email_envoye: emailOk });
});
