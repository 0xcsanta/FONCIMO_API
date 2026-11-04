// =====================================================================
//  Outil local d'analyse de potentiel (Pully)
//  -> entre un numero de parcelle, sort les 3 strategies + la meilleure.
//  Lancer :  npm install  puis  npm start   (http://localhost:4000)
//  Se connecte a Postgres via DATABASE_URL (lu dans ../.env).
// =====================================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4000;

// --- Lecture de DATABASE_URL dans ../.env (ou .env local) ---
function lireEnv() {
  for (const p of [path.join(__dirname, "..", ".env"), path.join(__dirname, ".env")]) {
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, "utf8");
      const m = txt.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return process.env.DATABASE_URL;
}
const connectionString = lireEnv();
if (!connectionString) {
  console.error("DATABASE_URL introuvable (ni dans ../.env, ni dans l'environnement).");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// =====================================================================
//  SCORING  —  3 strategies independantes, note = la meilleure
//  (tweake librement les constantes ci-dessous)
// =====================================================================
const LAMBDA = 300;        // m2 de surface de plancher = "impressionnant" (plus bas = notes plus genereuses)
const GEL_MULT_DEFAUT = 0.6; // multiplicateur zone reservee (gel). 1 = "hors gel"

const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ampleur = (dsp) => 1 - Math.exp(-Math.max(0, dsp) / LAMBDA);
const labelFor = (n) =>
  n == null ? "—" : n >= 75 ? "Fort potentiel" : n >= 50 ? "Potentiel intéressant" : n >= 25 ? "Potentiel modéré" : "Potentiel limité";
const exclue = (aff) => /verdure|besoins publics|utilit|d'?int[ée]r[êe]t public|sport|parc\b|agricole|for[êe]t|cimeti/i.test(aff || "");

function calcule(r, gelMult = GEL_MULT_DEFAUT) {
  const S = num(r.surface_m2) || 0;
  const aff = (r.affectation_detaillee || "") + "";
  const zone = r.zone_affectation || null;
  const indice = num(r.indice_utilisation);
  const densifiable = indice !== null && zone !== null && !exclue(aff);
  if (!densifiable) return { densifiable: false, horsPerimetre: true, aff, zone, numero: r.numero };

  let Fmax = num(r.surface_constructible_m2); if (Fmax == null) Fmax = (indice ?? 0.2) * S;
  let Fexist = num(r.emprise_batie_m2); if (Fexist == null) Fexist = num(r.emprise_bat) ?? 0;
  const Nmax = num(r.niveaux_max);
  const Nact = num(r.etages_max) ?? 0;
  const SPexist = num(r.sp_exist) ?? 0;
  const SPmax = Nmax != null ? Fmax * Nmax : null;
  const annee = num(r.annee);
  const rec = num(r.note_recensement);
  const nue = Fexist <= 0 && SPexist <= 0;

  // coefficients communs
  const p = num(r.pente_pct);
  const cPente = p == null ? 1 : p > 45 ? 0.5 : p > 30 ? 0.7 : p > 15 ? 0.9 : 1;
  let cGlobal = 1;
  if (r.en_zone_reservee === true) cGlobal *= gelMult;
  const bruit = (r.degre_bruit || "").toUpperCase();
  if (bruit.includes("IV")) cGlobal *= 0.9; else if (bruit.includes("III")) cGlobal *= 0.95;
  if (r.en_zone_archeologique) cGlobal *= 0.9;

  // 1) AGRANDISSEMENT au sol (etendre l'emprise, a hauteur existante)
  const dF = Math.max(0, Fmax - Fexist);
  const Nref = Math.min(Math.max(Nact, 1), Nmax || Math.max(Nact, 1));
  const dspAgr = dF * Nref;
  let fAgr = 0.95 * cPente * cGlobal;
  if (r.limite_construction) fAgr *= 0.7;
  if (rec != null) fAgr *= rec <= 2 ? 0.3 : rec === 3 ? 0.6 : rec === 4 ? 0.85 : 1;
  const sAgr = Math.round(100 * fAgr * ampleur(dspAgr));

  // 2) SURELEVATION (ajouter des etages sur l'emprise existante)
  const dN = Nmax != null ? Math.max(0, Nmax - Nact) : 0;
  const dspElev = Fexist * dN;
  let fElev = 0.85 * cPente * cGlobal;
  if (rec != null) fElev *= rec <= 2 ? 0.1 : rec === 3 ? 0.4 : rec === 4 ? 0.7 : 1;
  if (annee != null) fElev *= annee < 1940 ? 0.6 : annee < 1980 ? 0.85 : 1;
  const sElev = Math.round(100 * fElev * ampleur(dspElev));

  // 3) DEMOLITION-RECONSTRUCTION (raser et rebatir au max)
  const dspDemo = SPmax != null ? Math.max(0, SPmax - SPexist) : 0;
  const baseDemo = nue ? 0.95 : 0.80;
  let cPat = 1;
  if (r.site_protege) cPat = 0;
  if (rec != null) { if (rec <= 3) cPat = 0; else if (rec === 4) cPat = 0.4; }
  const cAge = nue || annee == null ? 1 : annee < 1960 ? 1 : annee < 1985 ? 0.85 : annee < 2005 ? 0.6 : 0.3;
  const fDemo = baseDemo * cPat * cAge * cPente * cGlobal;
  const sDemo = Math.round(100 * fDemo * ampleur(dspDemo));

  const strategies = [
    { cle: "agrandissement", nom: "Agrandissement au sol", dsp: Math.round(dspAgr), score: sAgr, f: fAgr,
      detail: `+${Math.round(dF)} m² d'emprise × ${Nref} niveau(x)` },
    { cle: "elevation", nom: "Surélévation", dsp: Math.round(dspElev), score: sElev, f: fElev,
      detail: `+${dN} niveau(x) × ${Math.round(Fexist)} m² d'emprise` },
    { cle: "demolition", nom: nue ? "Construction neuve" : "Démolition-reconstruction", dsp: Math.round(dspDemo), score: sDemo, f: fDemo,
      detail: `${Math.round(SPmax ?? 0)} m² max − ${Math.round(SPexist)} m² existants` },
  ];
  const best = strategies.reduce((a, b) => (b.score > a.score ? b : a));

  return {
    densifiable: true,
    numero: r.numero,
    inputs: { S: Math.round(S), aff, Fmax: Math.round(Fmax), Fexist: Math.round(Fexist), Nmax, Nact,
      SPexist: Math.round(SPexist), SPmax: SPmax == null ? null : Math.round(SPmax),
      annee, rec, gel: r.en_zone_reservee === true, pente: p, nue,
      archeo: r.en_zone_archeologique === true, site_protege: r.site_protege || null,
      limite: r.limite_construction === true, bruit: r.degre_bruit || null },
    strategies,
    best,
    note: best.score,
    label: labelFor(best.score),
  };
}

// --- Requete parcelle + agregats batiment ---
const SQL = `
with b as (
  select egrid,
    sum(coalesce(surface_sol_m2,0) * coalesce(nb_etages,1)) as sp_exist,
    max(nb_etages) as etages_max,
    sum(coalesce(surface_sol_m2,0)) as emprise_bat,
    sum(nb_logements) as logts,
    min(annee_construction) as annee,
    count(*) as nb_bat
  from batiment group by egrid
)
select p.numero, p.commune, p.affectation_detaillee, p.zone_affectation,
  p.surface_m2, p.indice_utilisation, p.surface_constructible_m2, p.emprise_batie_m2,
  p.niveaux_max, p.hauteur_max_m, p.note_recensement, p.site_protege, p.jardin_historique,
  p.en_zone_archeologique, p.limite_construction, p.degre_bruit, p.en_zone_reservee, p.pente_pct,
  coalesce(b.sp_exist,0) sp_exist, coalesce(b.etages_max,0) etages_max,
  b.emprise_bat, b.logts, b.annee, coalesce(b.nb_bat,0) nb_bat
from parcelle p
left join b on b.egrid = p.egrid
where p.commune ilike 'Pully' and p.numero = $1
limit 1;`;

async function analyser(numero, gelMult) {
  const { rows } = await pool.query(SQL, [String(numero).trim()]);
  if (!rows.length) return { found: false };
  return { found: true, ...calcule(rows[0], gelMult) };
}

// --- Serveur HTTP ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/calc") {
    try {
      const numero = url.searchParams.get("numero") || "";
      const gel = url.searchParams.get("gel");
      const gelMult = gel === "0" ? 1 : GEL_MULT_DEFAUT;
      const out = await analyser(numero, gelMult);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
});
server.listen(PORT, () => console.log(`\n  Outil parcelle -> http://localhost:${PORT}\n`));

// --- Page (UI) ---
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Potentiel parcelle — Pully</title>
<style>
  :root{--g:#2a3c37;--gd:#233029;--lime:#d3de79;--mut:#5a6b63;--bg:#eef1ef}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:var(--bg);color:#1d2622}
  header{background:var(--g);color:#fff;padding:18px 24px}
  header b{color:var(--lime);font-size:20px} header span{color:#9fb0a7;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-left:10px}
  .wrap{max-width:1000px;margin:0 auto;padding:24px}
  .search{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  input{font-size:16px;padding:12px 14px;border:1px solid #cfd6d2;border-radius:8px;width:200px}
  button{font-size:15px;font-weight:600;padding:12px 22px;border:none;border-radius:8px;background:var(--lime);color:var(--gd);cursor:pointer}
  label.toggle{font-size:14px;color:var(--mut);display:flex;gap:6px;align-items:center;cursor:pointer}
  .hint{color:var(--mut);font-size:13px;margin:4px 0 20px}
  .final{display:flex;align-items:center;gap:20px;background:#fff;border-radius:14px;padding:22px 24px;margin-bottom:18px;border:1px solid #e3e7e8}
  .final .num{font-size:52px;font-weight:800;line-height:1}
  .final .meta{font-size:14px;color:var(--mut)}
  .final .voie{font-weight:700;font-size:17px}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}
  .card{background:#fff;border:1px solid #e3e7e8;border-radius:12px;padding:18px}
  .card.best{border:2px solid var(--lime);box-shadow:0 6px 18px rgba(0,0,0,.06)}
  .card h3{margin:0 0 4px;font-size:15px}
  .card .sp{font-size:13px;color:var(--mut)}
  .card .sc{font-size:40px;font-weight:800;margin:8px 0 2px}
  .card .f{font-size:12px;color:var(--mut)}
  .badge{display:inline-block;font-size:11px;font-weight:700;color:var(--gd);background:var(--lime);padding:2px 8px;border-radius:20px;margin-left:6px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3e7e8}
  td{padding:9px 14px;font-size:14px;border-top:1px solid #eef1ef} td:first-child{color:var(--mut)} td:last-child{text-align:right;font-weight:600}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:22px 0 8px}
  .err{color:#b4341f;font-weight:600}
  .sub{color:var(--mut);font-size:13px}
</style></head><body>
<header><b>foncimo</b><span>Outil d'analyse de potentiel — Pully</span></header>
<div class="wrap">
  <div class="search">
    <input id="num" placeholder="N° de parcelle (ex: 365)" autofocus>
    <button onclick="go()">Analyser</button>
    <label class="toggle"><input type="checkbox" id="gel" checked> appliquer le gel (zone réservée ×0.6)</label>
  </div>
  <div class="hint">Astuce : 365 (fort), 118 (fort, nue), 3551 (gelée), 701 (hors périmètre).</div>
  <div id="out"></div>
</div>
<script>
const $ = (id)=>document.getElementById(id);
async function go(){
  const n = $('num').value.trim();
  if(!n) return;
  const gel = $('gel').checked ? '1':'0';
  $('out').innerHTML = '<p class="sub">Calcul…</p>';
  try{
    const r = await fetch('/api/calc?numero='+encodeURIComponent(n)+'&gel='+gel);
    const d = await r.json();
    render(d);
  }catch(e){ $('out').innerHTML = '<p class="err">Erreur : '+e.message+'</p>'; }
}
function render(d){
  if(d.error){ $('out').innerHTML='<p class="err">'+d.error+'</p>'; return; }
  if(!d.found){ $('out').innerHTML='<p class="err">Parcelle introuvable à Pully.</p>'; return; }
  if(!d.densifiable){ $('out').innerHTML='<div class="final"><div><div class="voie">Hors périmètre de densification</div><div class="meta">'+(d.aff||d.zone||'')+'</div></div></div>'; return; }
  const i=d.inputs;
  const cards = d.strategies.map(s=>{
    const best = s.cle===d.best.cle;
    return '<div class="card'+(best?' best':'')+'"><h3>'+s.nom+(best?'<span class="badge">meilleure</span>':'')+'</h3>'
      +'<div class="sp">'+s.detail+'</div>'
      +'<div class="sc">'+(s.score/10).toFixed(1)+'<span style="font-size:16px;color:#b9c2bc">/10</span></div>'
      +'<div class="sp">+'+s.dsp+' m² de plancher</div>'
      +'<div class="f">faisabilité '+Math.round(s.f*100)+'%</div></div>';
  }).join('');
  const rows = [
    ['Affectation', i.aff],
    ['Surface parcelle', i.S+' m²'],
    ['Emprise max autorisée (Fmax)', i.Fmax+' m²'],
    ['Emprise bâtie actuelle (Fexist)', i.Fexist+' m²'],
    ['Niveaux max / actuels', (i.Nmax??'—')+' / '+i.Nact],
    ['Surf. plancher existante / max', i.SPexist+' / '+(i.SPmax??'—')+' m²'],
    ['Année construction', i.annee??'—'],
    ['Recensement bâtiment', i.rec??'—'],
    ['Zone réservée (gel)', i.gel?'OUI':'non'],
    ['Pente', (i.pente??'—')+' %'],
    ['Contraintes', [i.limite&&'alignement', i.archeo&&'archéo', i.site_protege&&'site protégé', i.bruit].filter(Boolean).join(', ')||'—'],
  ].map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  $('out').innerHTML =
    '<div class="final"><div class="num" style="color:'+coul(d.note)+'">'+(d.note/10).toFixed(1)+'<span style="font-size:22px;color:#b9c2bc;font-weight:600">/10</span></div>'
    +'<div><div class="voie">'+d.label+'</div><div class="meta">Parcelle '+d.numero+' · meilleure voie : <b>'+d.best.nom+'</b></div></div></div>'
    +'<h2>Les 3 stratégies</h2><div class="cards">'+cards+'</div>'
    +'<h2>Chiffres utilisés</h2><table>'+rows+'</table>';
}
function coul(n){return n>=75?'#6f9c2f':n>=50?'#b79a1f':n>=25?'#c47a2b':'#b4341f';}
$('num').addEventListener('keydown',e=>{if(e.key==='Enter')go();});
$('gel').addEventListener('change',()=>{ if($('num').value.trim()) go(); });
</script>
</body></html>`;
