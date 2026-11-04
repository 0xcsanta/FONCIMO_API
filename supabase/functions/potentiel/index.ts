// =====================================================================
//  Edge Function : potentiel
//    - "suggest"  : autocompletion d'adresses (Pully)
//    - "evaluer"  : cherche une parcelle, calcule la note, renvoie la carte
//                   (detail du calcul masque = teaser)
//    - "capturer" : enregistre le lead, renvoie le detail, envoie l'email
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
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: cors });

// --------------------------- SCORING ---------------------------------
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
  const densLog = surface ? logts / (surface / 1000) : 0;
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
  // Toujours calcule (stocke dans le lead), mais plus affiche.
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
  facteurs.push({ cle: "environnement", label: "Cadre & nuisances", valeur: `pente ${pente ?? "?"}%`, points: ptsEnv });
  const logts = num(d.nb_logements) ?? 0;
  const bat = num(d.nb_batiments) ?? 0;
  const ptsBati = Math.min(20, 8 + Math.min(12, logts * 2 + bat));
  facteurs.push({ cle: "bati", label: "Valeur du bâti existant", valeur: `${bat} bâtiment(s), ${logts} logt(s)`, points: ptsBati });
  const surface = num(d.surface_m2);
  const ptsTaille = Math.round(15 * tailleNorm(surface));
  facteurs.push({ cle: "taille", label: "Taille de la parcelle", valeur: `${surface ? Math.round(surface) : "?"} m²`, points: ptsTaille });
  const ref = zone ? REF_TAUX[zone] : undefined;
  const tocc = num(d.taux_occupation_sol);
  let ptsResid = 0;
  if (ref !== undefined) { const toccEff = tocc ?? ref * 0.6; ptsResid = Math.round(20 * clamp((ref - toccEff) / ref, 0, 1)); }
  facteurs.push({ cle: "residuel", label: "Droits à bâtir résiduels", valeur: ref !== undefined ? "estimés" : "n/a", points: ptsResid });
  const rec = num(d.note_recensement);
  let ptsPat = 0;
  if (rec === 3 || rec === 4) ptsPat = 3; else if (rec !== null && rec <= 2) ptsPat = -5;
  if (ptsPat !== 0) facteurs.push({ cle: "patrimoine", label: "Cachet patrimonial", valeur: `recensement ${rec}`, points: ptsPat });
  const note = Math.round(clamp(ptsZone + ptsEnv + ptsBati + ptsTaille + ptsResid + ptsPat, 0, 100));
  return { note, label: labelFor(note), constructible: ref !== undefined, facteurs };
}

// --------------------------- EMAIL (une seule note) ------------------
const couleur = (n: number | null | undefined) =>
  n === null || n === undefined ? "#9aa5a0" : n >= 75 ? "#6f9c2f" : n >= 50 ? "#b79a1f" : n >= 25 ? "#c47a2b" : "#b4341f";

async function envoyerEmail(to: string, parc: Record<string, unknown>, s: any): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const c = couleur(s.note);
  const adresse = parc.adresse ? String(parc.adresse) : `parcelle n°${parc.numero}`;
  const surf = parc.surface_m2 ? Math.round(Number(parc.surface_m2)) + " m²" : "";
  const zone = parc.zone_affectation ? String(parc.zone_affectation) : "";
  const meta = [parc.commune, surf, zone].filter(Boolean).join(" · ");
  const F = "'Kanit',-apple-system,'Segoe UI',Arial,sans-serif";

  const ligne = (f: Facteur, i: number) => {
    const bg = i % 2 ? "#fafbf9" : "#ffffff";
    return `<tr>
      <td style="padding:13px 20px;font-family:${F};font-size:14px;color:#51605a;background:${bg};border-top:1px solid #eef1ef">${f.label}</td>
      <td style="padding:13px 14px;font-family:${F};font-size:13px;color:#8a948f;text-align:right;white-space:nowrap;background:${bg};border-top:1px solid #eef1ef">${f.valeur}</td>
      <td style="padding:13px 20px 13px 10px;font-family:${F};font-size:14px;font-weight:700;text-align:right;color:${f.points < 0 ? "#b4341f" : "#2a3c37"};background:${bg};border-top:1px solid #eef1ef">${f.points > 0 ? "+" : ""}${f.points}</td>
    </tr>`;
  };

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');</style></head>
<body style="margin:0;padding:0;background:#e9ede9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#e9ede9">Votre note de potentiel Foncimo pour ${adresse} : ${s.note ?? "n/a"}/100.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ede9;padding:30px 12px">
  <tr><td align="center">
    <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="width:580px;max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 34px rgba(20,28,25,.14)">

      <!-- Header -->
      <tr><td style="background:#2a3c37;padding:32px 34px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:${F};font-size:27px;font-weight:700;color:#d3de79;letter-spacing:-.01em">foncimo</td>
          <td style="text-align:right;font-family:${F};font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:#9fb0a7">Expertise immobilière</td>
        </tr></table>
        <div style="height:1px;background:rgba(211,222,121,.28);margin:22px 0"></div>
        <div style="font-family:${F};font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#9fb0a7">Note de potentiel</div>
        <div style="font-family:${F};font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;margin-top:3px">${adresse}</div>
        <div style="font-family:${F};font-size:13px;color:#c0ccc4;margin-top:4px">${meta}</div>
      </td></tr>

      <!-- Score hero -->
      <tr><td align="center" style="padding:34px 34px 10px">
        <div style="font-family:${F};font-size:68px;font-weight:700;line-height:1;color:${c}">${s.note ?? "n/a"}<span style="font-size:22px;color:#b9c2bc;font-weight:500">/100</span></div>
        <div style="margin-top:12px"><span style="display:inline-block;font-family:${F};font-size:13px;font-weight:700;color:${c};background:#f2f5ea;padding:7px 20px;border-radius:30px">${s.label}</span></div>
      </td></tr>

      <!-- Intro -->
      <tr><td style="padding:22px 34px 0;font-family:${F};font-size:15px;color:#51605a;line-height:1.65">
        Bonjour,<br>voici le détail du calcul de la note de potentiel établie pour votre bien.
      </td></tr>

      <!-- Detail -->
      <tr><td style="padding:22px 34px 0">
        <div style="font-family:${F};font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#93a09a;margin-bottom:10px">Détail du calcul</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eef1ef;border-radius:12px;overflow:hidden">
          ${(s.facteurs || []).map(ligne).join("")}
        </table>
      </td></tr>

      <!-- Callout -->
      <tr><td style="padding:24px 34px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6ec;border-left:4px solid #d3de79;border-radius:10px">
          <tr><td style="padding:18px 22px;font-family:${F};font-size:14px;color:#3a463f;line-height:1.65">
            Cette note est un <strong>indicateur automatique</strong>. L'analyse réelle (droits à bâtir exacts, faisabilité, valorisation) demande une expertise. <strong style="color:#2a3c37">Prenons rendez-vous :</strong> au bureau à Pully, ou je me déplace chez vous.
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td align="center" style="padding:28px 34px 34px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
          <td align="center" bgcolor="#d3de79" style="border-radius:10px">
            <a href="${RDV_URL}" style="display:inline-block;padding:16px 40px;font-family:${F};font-size:15px;font-weight:700;color:#233029;text-decoration:none;border-radius:10px">Prendre rendez-vous →</a>
          </td>
        </tr></table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#233029;padding:26px 34px">
        <div style="font-family:${F};font-size:16px;font-weight:700;color:#d3de79">foncimo</div>
        <div style="font-family:${F};font-size:12px;color:#8b9a90;margin-top:5px">Foncimo SA · Pilotage de projet & expertise immobilière · Pully (VD)</div>
        <div style="font-family:${F};font-size:11px;color:#5f6e66;margin-top:12px">Vous recevez cet email car vous avez demandé le détail de votre note de potentiel sur foncimo.ch.</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
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

  // --- Autocompletion d'adresses ---
  if (rawAction === "suggest") {
    if (query.length < 2) return json({ suggestions: [] });
    const { data } = await supa.rpc("suggest_adresses", { p_q: query });
    return json({ suggestions: data ?? [] });
  }

  const action = rawAction === "capturer" ? "capturer" : "evaluer";
  if (!query && action === "evaluer" && !body.egrid) return json({ error: "Requête vide" }, 400);

  // Recupere la parcelle (par egrid si fourni, sinon par la requete)
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

  const dens = scoreDensification(parc);
  const valo = scoreValorisation(parc); // calcule mais non affiche

  const carte = { centroid: parc.centroid, geojson: parc.geojson };
  const resume = {
    numero: parc.numero, adresse: parc.adresse, commune: parc.commune,
    surface_m2: parc.surface_m2, zone: parc.zone_affectation, egrid: parc.egrid,
  };

  if (action === "evaluer") {
    const masque = { note: dens.note, label: dens.label, constructible: dens.constructible, facteurs: (dens.facteurs || []).map((f: Facteur) => ({ label: f.label })) };
    return json({ found: true, resume, carte, potentiel: masque });
  }

  // action "capturer"
  const email = String(body.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email invalide" }, 400);

  const emailOk = await envoyerEmail(email, parc, dens);

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
    detail_calcul: { densification: dens, valorisation: valo },
    email_envoye: emailOk,
    rdv_demande: body.rdv === true,
  });

  return json({ found: true, resume, carte, potentiel: dens, email_envoye: emailOk });
});
