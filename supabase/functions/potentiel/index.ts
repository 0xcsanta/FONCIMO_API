// =====================================================================
//  Edge Function : potentiel
//  Deux actions :
//    - "evaluer"  : cherche une parcelle (n° ou adresse, Pully), calcule
//                   les deux notes (densification + valorisation) et renvoie
//                   la carte. Le DETAIL du calcul est masque (teaser).
//    - "capturer" : enregistre le lead (email), renvoie le detail complet
//                   et envoie l'email Foncimo (via Resend).
//
//  Le scoring et la cle service restent cote serveur : rien n'est expose
//  au navigateur avant la capture de l'email.
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

// --------------------------- SCORING ---------------------------------
// Taux d'occupation du sol de reference (proxy, faute d'indice legal en base)
const REF_TAUX: Record<string, number> = {
  "Zones centrales": 0.80,
  "Zones d'habitation": 0.40,
  "Zones d'activités économiques": 0.50,
  "Zones à bâtir à constructibilité restreinte": 0.30,
  "autres zones à bâtir": 0.35,
  "Zones de tourisme et de loisirs": 0.30,
  "Zones affectées à des besoins publics": 0.40,
};
const ZONE_PREMIUM: Record<string, number> = {
  "Zones centrales": 25,
  "Zones d'habitation": 18,
  "Zones d'activités économiques": 14,
  "Zones affectées à des besoins publics": 12,
  "autres zones à bâtir": 12,
  "Zones à bâtir à constructibilité restreinte": 10,
  "Zones de tourisme et de loisirs": 10,
};

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

function tailleNorm(surface: number | null): number {
  if (!surface || surface <= 0) return 0;
  const lo = Math.log(300), hi = Math.log(3000);
  return clamp((Math.log(surface) - lo) / (hi - lo), 0, 1);
}

function malus(d: Record<string, unknown>): Facteur[] {
  const out: Facteur[] = [];
  const rec = num(d.note_recensement);
  if (rec !== null) {
    if (rec <= 2) out.push({ cle: "recensement", label: "Bâtiment protégé (recensement 1-2)", valeur: `note ${rec}`, points: -40 });
    else if (rec === 3) out.push({ cle: "recensement", label: "Valeur patrimoniale élevée (recensement 3)", valeur: "note 3", points: -25 });
    else if (rec === 4) out.push({ cle: "recensement", label: "Intérêt patrimonial (recensement 4)", valeur: "note 4", points: -10 });
  }
  if (d.site_protege) out.push({ cle: "site_protege", label: "Site protégé", valeur: String(d.site_protege), points: -20 });
  if (d.jardin_historique) out.push({ cle: "jardin", label: "Jardin historique", valeur: String(d.jardin_historique), points: -15 });
  if (d.en_zone_archeologique) out.push({ cle: "archeo", label: "Zone archéologique", valeur: "oui", points: -10 });
  if (d.limite_construction) out.push({ cle: "limite", label: "Limite de construction", valeur: "oui", points: -10 });
  const pente = num(d.pente_pct);
  if (pente !== null) {
    if (pente > 45) out.push({ cle: "pente", label: "Terrain très pentu", valeur: `${pente}%`, points: -20 });
    else if (pente > 30) out.push({ cle: "pente", label: "Terrain pentu", valeur: `${pente}%`, points: -10 });
    else if (pente > 15) out.push({ cle: "pente", label: "Pente modérée", valeur: `${pente}%`, points: -3 });
  }
  const bruit = (d.degre_bruit ? String(d.degre_bruit) : "").toUpperCase();
  if (bruit.includes("IV")) out.push({ cle: "bruit", label: "Nuisances sonores (DS IV)", valeur: bruit, points: -8 });
  else if (bruit.includes("III")) out.push({ cle: "bruit", label: "Nuisances sonores (DS III)", valeur: bruit, points: -4 });
  const r = d.restrictions;
  if (r && typeof r === "object" && Object.keys(r as object).length > 0)
    out.push({ cle: "restrictions", label: "Restrictions (OEREB)", valeur: "présentes", points: -5 });
  return out;
}

function scoreDensification(d: Record<string, unknown>) {
  const zone = d.zone_affectation ? String(d.zone_affectation) : null;
  const ref = zone ? REF_TAUX[zone] : undefined;
  const constructible = ref !== undefined;
  const facteurs: Facteur[] = [];

  if (!constructible) {
    return {
      note: null as number | null,
      label: zone ? "Hors périmètre de densification" : "Zone à confirmer",
      constructible: false,
      facteurs: [{ cle: "zone", label: "Zone d'affectation", valeur: zone ?? "indéterminée", points: 0 }],
    };
  }

  const tocc = num(d.taux_occupation_sol);
  const toccEff = tocc ?? ref * 0.6;
  const reserveRatio = clamp((ref - toccEff) / ref, 0, 1);
  const ptsReserve = Math.round(50 * reserveRatio);
  facteurs.push({ cle: "reserve", label: "Réserve de densification au sol", valeur: `occupation ${Math.round(toccEff * 100)}% / réf ${Math.round(ref * 100)}%`, points: ptsReserve });

  const surface = num(d.surface_m2);
  const ptsTaille = Math.round(20 * tailleNorm(surface));
  facteurs.push({ cle: "taille", label: "Taille de la parcelle", valeur: `${surface ? Math.round(surface) : "?"} m²`, points: ptsTaille });

  let ptsMomentum = 8;
  let momentumTxt = "zone constructible";
  if (d.en_zone_reservee === true) { ptsMomentum = 15; momentumTxt = "zone réservée (étude communale en cours)"; }
  else if (zone === "Zones à bâtir à constructibilité restreinte") { ptsMomentum = 5; momentumTxt = "constructibilité restreinte"; }
  facteurs.push({ cle: "momentum", label: "Momentum réglementaire", valeur: momentumTxt, points: ptsMomentum });

  const logts = num(d.nb_logements) ?? 0;
  const annee = num(d.annee_min);
  let ptsRenouv = 7;
  const densLog = surface ? logts / (surface / 1000) : 0; // logements / 1000 m2
  if (densLog < 3) ptsRenouv += 5; else if (densLog < 6) ptsRenouv += 2;
  if (annee !== null && annee < 1960) ptsRenouv += 3; else if (annee !== null && annee < 1980) ptsRenouv += 1;
  ptsRenouv = Math.min(15, ptsRenouv);
  facteurs.push({ cle: "renouvellement", label: "Potentiel de renouvellement du bâti", valeur: annee ? `bâti dès ${annee}, ${logts} logt(s)` : `${logts} logt(s)`, points: ptsRenouv });

  const mal = malus(d);
  const base = ptsReserve + ptsTaille + ptsMomentum + ptsRenouv;
  const totalMalus = mal.reduce((s, f) => s + f.points, 0);
  const note = Math.round(clamp(base + totalMalus, 0, 100));
  return { note, label: labelFor(note), constructible: true, facteurs: [...facteurs, ...mal] };
}

function scoreValorisation(d: Record<string, unknown>) {
  const zone = d.zone_affectation ? String(d.zone_affectation) : null;
  const facteurs: Facteur[] = [];

  const ptsZone = zone && ZONE_PREMIUM[zone] !== undefined ? ZONE_PREMIUM[zone] : 6;
  facteurs.push({ cle: "zone", label: "Attractivité de la zone", valeur: zone ?? "indéterminée", points: ptsZone });

  let ptsEnv = 20;
  const pente = num(d.pente_pct);
  if (pente !== null && pente > 30) ptsEnv -= 6; else if (pente !== null && pente > 15) ptsEnv -= 3;
  const bruit = (d.degre_bruit ? String(d.degre_bruit) : "").toUpperCase();
  if (bruit.includes("IV")) ptsEnv -= 8; else if (bruit.includes("III")) ptsEnv -= 4;
  if (d.en_zone_archeologique) ptsEnv -= 3;
  ptsEnv = Math.max(0, ptsEnv);
  facteurs.push({ cle: "environnement", label: "Cadre & nuisances", valeur: `pente ${pente ?? "?"}%${bruit ? ", bruit " + bruit : ""}`, points: ptsEnv });

  const logts = num(d.nb_logements) ?? 0;
  const bat = num(d.nb_batiments) ?? 0;
  let ptsBati = 8 + Math.min(12, logts * 2 + bat);
  ptsBati = Math.min(20, ptsBati);
  facteurs.push({ cle: "bati", label: "Valeur du bâti existant", valeur: `${bat} bâtiment(s), ${logts} logt(s)`, points: ptsBati });

  const surface = num(d.surface_m2);
  const ptsTaille = Math.round(15 * tailleNorm(surface));
  facteurs.push({ cle: "taille", label: "Taille de la parcelle", valeur: `${surface ? Math.round(surface) : "?"} m²`, points: ptsTaille });

  const ref = zone ? REF_TAUX[zone] : undefined;
  const tocc = num(d.taux_occupation_sol);
  let ptsResid = 0;
  if (ref !== undefined) {
    const toccEff = tocc ?? ref * 0.6;
    ptsResid = Math.round(20 * clamp((ref - toccEff) / ref, 0, 1));
  }
  facteurs.push({ cle: "residuel", label: "Droits à bâtir résiduels", valeur: ref !== undefined ? "estimés" : "n/a", points: ptsResid });

  // Ajustement patrimoine : le cachet peut valoriser, la lourde protection pénalise
  const rec = num(d.note_recensement);
  let ptsPat = 0;
  if (rec === 3 || rec === 4) ptsPat = 3; else if (rec !== null && rec <= 2) ptsPat = -5;
  if (ptsPat !== 0) facteurs.push({ cle: "patrimoine", label: "Cachet patrimonial", valeur: `recensement ${rec}`, points: ptsPat });

  const note = Math.round(clamp(ptsZone + ptsEnv + ptsBati + ptsTaille + ptsResid + ptsPat, 0, 100));
  return { note, label: labelFor(note), constructible: ref !== undefined, facteurs };
}

// --------------------------- EMAIL -----------------------------------
async function envoyerEmail(to: string, parc: Record<string, unknown>, dens: any, valo: any): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const ligne = (f: Facteur) =>
    `<tr><td style="padding:4px 10px;color:#5a6b63">${f.label}</td><td style="padding:4px 10px;text-align:right;color:#1d2622">${f.valeur}</td><td style="padding:4px 10px;text-align:right;font-weight:600;color:${f.points < 0 ? "#b4341f" : "#2a3c37"}">${f.points > 0 ? "+" : ""}${f.points}</td></tr>`;
  const bloc = (titre: string, s: any) =>
    `<h3 style="font-family:sans-serif;color:#2a3c37;margin:18px 0 6px">${titre} — ${s.note ?? "—"}/100 <span style="color:#8a948f;font-weight:400">(${s.label})</span></h3>
     <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">${(s.facteurs || []).map(ligne).join("")}</table>`;
  const adresse = parc.adresse ? String(parc.adresse) : `parcelle n°${parc.numero}`;
  const html = `
  <div style="max-width:620px;margin:0 auto;font-family:sans-serif;color:#1d2622">
    <div style="background:#2a3c37;color:#fff;padding:22px 24px;border-radius:8px 8px 0 0">
      <span style="color:#d3de79;font-size:22px;font-weight:600">foncimo</span>
      <div style="margin-top:8px;font-size:15px">Le détail du potentiel de votre parcelle</div>
    </div>
    <div style="border:1px solid #e3e7e8;border-top:0;padding:24px;border-radius:0 0 8px 8px">
      <p>Bonjour,</p>
      <p>Voici le détail du calcul pour <strong>${adresse}</strong> (${parc.commune}, ${parc.surface_m2 ? Math.round(Number(parc.surface_m2)) + " m²" : ""}).</p>
      ${bloc("Potentiel de densification", dens)}
      ${bloc("Valorisation (indicatif)", valo)}
      <p style="margin-top:18px;padding:14px;border-left:3px solid #d3de79;background:#f4f6ec">
        Ces notes sont des <strong>indicateurs automatiques</strong>. L'analyse réelle — droits à bâtir exacts, faisabilité, valorisation — nécessite une expertise. <strong>Prenons rendez-vous :</strong> au bureau à Pully, ou je me déplace chez vous.
      </p>
      <p style="text-align:center;margin:24px 0">
        <a href="${RDV_URL}" style="background:#d3de79;color:#233029;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:5px;display:inline-block">Prendre rendez-vous</a>
      </p>
      <p style="color:#8a948f;font-size:12px">Foncimo SA — Pilotage de projet & expertise immobilière — Pully (VD)</p>
    </div>
  </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: `Foncimo — potentiel de ${adresse}`, html }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}

// --------------------------- HANDLER ---------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "JSON invalide" }), { status: 400, headers: cors }); }

  const action = body.action === "capturer" ? "capturer" : "evaluer";
  const query = String(body.query ?? "").trim();
  const type = ["numero", "adresse", "auto"].includes(body.type) ? body.type : "auto";

  if (!query && action === "evaluer") return new Response(JSON.stringify({ error: "Requête vide" }), { status: 400, headers: cors });

  // Recupere la parcelle (par la requete, ou par egrid pour la capture)
  let parc: any = null;
  if (body.egrid) {
    const { data } = await supa.rpc("get_parcelle_data", { p_query: String(body.egrid), p_type: "egrid" });
    parc = data && data.found ? data : null;
  }
  if (!parc) {
    const { data, error } = await supa.rpc("get_parcelle_data", { p_query: query, p_type: type });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
    parc = data;
  }

  if (!parc || !parc.found) {
    return new Response(JSON.stringify({ found: false, message: "Parcelle introuvable à Pully. Essayez un numéro cadastral ou une adresse de Pully." }), { headers: cors });
  }

  const dens = scoreDensification(parc);
  const valo = scoreValorisation(parc);

  const carte = { centroid: parc.centroid, geojson: parc.geojson };
  const resume = {
    numero: parc.numero, adresse: parc.adresse, commune: parc.commune,
    surface_m2: parc.surface_m2, zone: parc.zone_affectation, egrid: parc.egrid,
  };

  if (action === "evaluer") {
    // TEASER : notes visibles, detail masque (seuls les libelles des facteurs)
    const masque = (s: any) => ({ note: s.note, label: s.label, constructible: s.constructible, facteurs: (s.facteurs || []).map((f: Facteur) => ({ label: f.label })) });
    return new Response(JSON.stringify({ found: true, resume, carte, densification: masque(dens), valorisation: masque(valo) }), { headers: cors });
  }

  // action "capturer"
  const email = String(body.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return new Response(JSON.stringify({ error: "Email invalide" }), { status: 400, headers: cors });

  const detail = { densification: dens, valorisation: valo };
  const emailOk = await envoyerEmail(email, parc, dens, valo);

  await supa.from("lead").insert({
    email,
    egrid: parc.egrid,
    numero_parcelle: parc.numero,
    adresse: parc.adresse,
    commune: parc.commune,
    note_densification: dens.note,
    label_densification: dens.label,
    note_valorisation: valo.note,
    label_valorisation: valo.label,
    detail_calcul: detail,
    email_envoye: emailOk,
    rdv_demande: body.rdv === true,
  });

  return new Response(JSON.stringify({ found: true, resume, carte, densification: dens, valorisation: valo, email_envoye: emailOk }), { headers: cors });
});
