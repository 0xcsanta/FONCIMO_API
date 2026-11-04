// =====================================================================
//  Outil local d'analyse de potentiel (Pully) — modele pondere multi-facteurs
//  Poids editables dans l'interface (grille par defaut comme base).
//  Lancer :  npm install  puis  npm start   (http://localhost:4000)
// =====================================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4000;

function lireEnv() {
  for (const p of [path.join(__dirname, "..", ".env"), path.join(__dirname, ".env")]) {
    if (fs.existsSync(p)) {
      const m = fs.readFileSync(p, "utf8").match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return process.env.DATABASE_URL;
}
const connectionString = lireEnv();
if (!connectionString) { console.error("DATABASE_URL introuvable (../.env)."); process.exit(1); }
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

// =====================================================================
//  SCORING pondere  —  tweake librement
// =====================================================================
const LAMBDA = 300;
const GEL_MULT_DEFAUT = 0.6;

// Poids (%) par defaut — grille de reference (modifiable cote interface)
const POIDS = {
  agrandissement: { G: 20, E: 8, P: 8, I: 10, L: 8, C: 6, N: 8, O: 5, V: 18, R: 4, B: 2, A: 3 },
  elevation:      { G: 18, E: 8, S: 15, F: 10, T: 8, C: 6, N: 8, O: 5, V: 14, R: 3, B: 2, A: 3 },
  demolition:     { G: 23, E: 8, P: 5, L: 8, C: 6, O: 5, V: 13, R: 4, B: 4, A: 2, D: 8, X: 8, Y: 6 },
};
const LABELS = {
  G: "Gain net de surface", E: "Efficacité des surfaces", P: "Marge de pleine terre",
  I: "Intégration au bâti conservé", S: "Structure", F: "Fondations existantes",
  T: "Transformation de toiture", L: "Sol et terrain", C: "Conditions de chantier",
  N: "Adaptations normatives du bâti", O: "Limitation des perturbations",
  V: "Création de valeur comparative", R: "Robustesse économique", B: "Performance carbone",
  A: "Ancienneté", D: "Besoin de renouvellement", X: "Déconstruction", Y: "Polluants",
};

const num = (x) => (x === null || x === undefined || x === "" ? null : Number(x));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const sat = (x, k = LAMBDA) => 1 - Math.exp(-Math.max(0, x) / k);
const labelFor = (n) => n == null ? "—" : n >= 75 ? "Fort potentiel" : n >= 50 ? "Potentiel intéressant" : n >= 25 ? "Potentiel modéré" : "Potentiel limité";
const exclue = (aff) => /verdure|besoins publics|utilit|d'?int[ée]r[êe]t public|sport|parc\b|agricole|for[êe]t|cimeti/i.test(aff || "");

const ageNew = (a) => a == null ? 0.6 : a >= 2000 ? 1 : a >= 1980 ? 0.8 : a >= 1960 ? 0.6 : a >= 1940 ? 0.45 : 0.3;
const ageOld = (a) => a == null ? 0.6 : a < 1940 ? 1 : a < 1970 ? 0.8 : a < 2000 ? 0.5 : 0.25;
const structR = (a) => a == null ? 0.55 : a >= 1990 ? 0.8 : a >= 1970 ? 0.65 : a >= 1950 ? 0.45 : 0.3;
const penteR = (p) => p == null ? 0.8 : p <= 5 ? 1 : p <= 15 ? 0.9 : p <= 30 ? 0.7 : p <= 45 ? 0.45 : 0.25;

// Notes de facteur (0..1)
const R = {
  G: (s, c) => sat(s === "agrandissement" ? c.dspAgr : s === "elevation" ? c.dspElev : c.dspDemo),
  E: (s) => (s === "demolition" ? 0.80 : s === "elevation" ? 0.68 : 0.72),
  P: (s, c) => { const free = c.S > 0 ? (c.S - c.Fmax) / c.S : 0; return clamp((free - 0.3) / 0.5, 0, 1); },
  I: (s, c) => { let r = c.rec == null ? 0.9 : c.rec <= 2 ? 0.25 : c.rec === 3 ? 0.45 : c.rec === 4 ? 0.7 : 0.9; if (c.limite) r -= 0.1; return clamp(r, 0, 1); },
  S: (s, c) => structR(c.annee),
  F: (s, c) => clamp(structR(c.annee) * (1 - 0.08 * c.Nact), 0, 1),
  T: (s, c) => { const base = c.Nmax != null && c.Nmax - c.Nact > 0 ? 0.7 : 0.3; const h = c.rec == null ? 1 : c.rec <= 3 ? 0.4 : 0.85; return clamp(base * h, 0, 1); },
  L: (s, c) => clamp(penteR(c.pente) * (c.archeo ? 0.7 : 1), 0, 1),
  C: (s, c) => { let r = penteR(c.pente) * (0.7 + 0.3 * sat(c.S, 1500)); if (c.central) r *= 0.85; if (s === "demolition") r *= 0.9; return clamp(r, 0, 1); },
  N: (s, c) => ageNew(c.annee),
  O: (s, c) => { let b = s === "agrandissement" ? 0.9 : s === "elevation" ? 0.6 : 0.3; if ((c.logts || 0) === 0) b += 0.2; return clamp(b, 0, 1); },
  V: (s, c) => { const d = s === "agrandissement" ? c.dspAgr : s === "elevation" ? c.dspElev : c.dspDemo; return clamp(c.zoneP * sat(d, 400), 0, 1); },
  R: (s, c) => clamp(0.4 + 0.5 * c.zoneP, 0, 1),
  B: (s, c) => (s === "demolition" ? clamp(0.45 + 0.25 * ageOld(c.annee), 0, 1) : 0.75),
  A: (s, c) => (s === "demolition" ? ageOld(c.annee) : ageNew(c.annee)),
  D: (s, c) => { const u = c.SPmax > 0 ? clamp(1 - c.SPexist / c.SPmax, 0, 1) : 1; return clamp(0.5 * u + 0.5 * ageOld(c.annee), 0, 1); },
  X: (s, c) => (c.nue ? 1 : clamp(1 - 0.5 * sat(c.SPexist, 1500), 0, 1)),
  Y: (s, c) => (c.nue ? 1 : c.annee == null ? 0.6 : c.annee >= 1991 ? 0.9 : c.annee >= 1960 ? 0.4 : 0.55),
};

function zonePremium(aff) {
  const a = (aff || "").toLowerCase();
  if (a.includes("forte")) return 1;
  if (a.includes("moyenne")) return 0.85;
  if (a.includes("faible")) return 0.65;
  if (a.includes("central")) return 0.9;
  return 0.55;
}

// score d'une strategie — les poids sont normalises (le total peut etre != 100)
function scoreStrat(strat, c, poids) {
  const base = POIDS[strat];
  const custom = (poids && poids[strat]) || {};
  let total = 0, sumW = 0;
  const tmp = [];
  for (const k in base) {
    let pw = k in custom ? Number(custom[k]) : base[k];
    if (!isFinite(pw) || pw < 0) pw = 0;
    const r = R[k] ? R[k](strat, c) : 0;
    total += pw * r; sumW += pw;
    tmp.push({ code: k, label: LABELS[k] || k, poids: pw, r });
  }
  const score = sumW > 0 ? (total / sumW) * 100 : 0;
  const lignes = tmp
    .map((t) => ({ code: t.code, label: t.label, poids: t.poids,
      note: Math.round(t.r * 100) / 10,
      contrib: sumW > 0 ? Math.round((100 * t.poids * t.r / sumW) * 10) / 10 : 0 }))
    .sort((a, b) => b.contrib - a.contrib);
  return { score: Math.round(score), lignes };
}

function calcule(r, gelMult = GEL_MULT_DEFAUT, poids = null) {
  const S = num(r.surface_m2) || 0;
  const aff = (r.affectation_detaillee || "") + "";
  const zone = r.zone_affectation || null;
  const indice = num(r.indice_utilisation);
  if (!(indice !== null && zone !== null && !exclue(aff)))
    return { densifiable: false, horsPerimetre: true, aff, zone, numero: r.numero };

  let Fmax = num(r.surface_constructible_m2); if (Fmax == null) Fmax = (indice ?? 0.2) * S;
  let Fexist = num(r.emprise_batie_m2); if (Fexist == null) Fexist = num(r.emprise_bat) ?? 0;
  const Nmax = num(r.niveaux_max);
  const Nact = num(r.etages_max) ?? 0;
  const SPexist = num(r.sp_exist) ?? 0;
  const SPmax = Nmax != null ? Fmax * Nmax : Fmax * Math.max(Nact, 2);
  const annee = num(r.annee);
  const rec = num(r.note_recensement);
  const nue = Fexist <= 0 && SPexist <= 0;

  const dF = Math.max(0, Fmax - Fexist);
  const Nref = Math.min(Math.max(Nact, 1), Nmax || Math.max(Nact, 1));
  const dspAgr = dF * Nref;
  const dN = Nmax != null ? Math.max(0, Nmax - Nact) : 0;
  const dspElev = Fexist * dN;
  const dspDemo = Math.max(0, SPmax - SPexist);

  const c = {
    S, Fmax, Fexist, Nmax, Nact, SPexist, SPmax, annee, rec, nue,
    pente: num(r.pente_pct), logts: num(r.logts) ?? 0, zoneP: zonePremium(aff),
    central: /central/i.test(aff), archeo: r.en_zone_archeologique === true,
    limite: r.limite_construction === true, dspAgr, dspElev, dspDemo,
  };

  const gel = r.en_zone_reservee === true;
  const mk = (cle, nom) => {
    const s = scoreStrat(cle, c, poids);
    const score = Math.round(s.score * (gel ? gelMult : 1));
    const dsp = cle === "agrandissement" ? dspAgr : cle === "elevation" ? dspElev : dspDemo;
    return { cle, nom, score, dsp: Math.round(dsp), lignes: s.lignes, brut: s.score };
  };
  const strategies = [
    mk("agrandissement", "Agrandissement au sol"),
    mk("elevation", "Surélévation"),
    mk("demolition", nue ? "Construction neuve" : "Démolition-reconstruction"),
  ];
  const best = strategies.reduce((a, b) => (b.score > a.score ? b : a));

  return {
    densifiable: true, numero: r.numero, gel,
    inputs: {
      S: Math.round(S), aff, Fmax: Math.round(Fmax), Fexist: Math.round(Fexist),
      Nmax, Nact, SPexist: Math.round(SPexist), SPmax: Math.round(SPmax),
      annee, rec, gel, pente: c.pente, nue, logts: c.logts,
      contraintes: [c.limite && "alignement", c.archeo && "archéo", r.site_protege && "site protégé", r.degre_bruit].filter(Boolean).join(", ") || "—",
    },
    strategies, best, note: best.score, label: labelFor(best.score),
  };
}

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
from parcelle p left join b on b.egrid = p.egrid
where p.commune ilike 'Pully' and p.numero = $1
limit 1;`;

async function analyser(numero, gelMult, poids) {
  const { rows } = await pool.query(SQL, [String(numero).trim()]);
  if (!rows.length) return { found: false };
  return { found: true, ...calcule(rows[0], gelMult, poids) };
}

const lireBody = (req) => new Promise((resolve) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/api/calc") {
    try {
      let numero = "", gelMult = GEL_MULT_DEFAUT, poids = null;
      if (req.method === "POST") {
        const j = JSON.parse((await lireBody(req)) || "{}");
        numero = j.numero || "";
        gelMult = j.gel === false || j.gel === "0" ? 1 : GEL_MULT_DEFAUT;
        poids = j.poids || null;
      } else {
        numero = url.searchParams.get("numero") || "";
        gelMult = url.searchParams.get("gel") === "0" ? 1 : GEL_MULT_DEFAUT;
      }
      const out = await analyser(numero, gelMult, poids);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }
  if (url.pathname === "/api/poids") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ poids: POIDS, labels: LABELS }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
});
server.listen(PORT, () => console.log(`\n  Outil parcelle -> http://localhost:${PORT}\n`));

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Potentiel parcelle — Pully</title>
<style>
  :root{--g:#2a3c37;--gd:#233029;--lime:#d3de79;--mut:#5a6b63;--bg:#eef1ef}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:var(--bg);color:#1d2622}
  header{background:var(--g);color:#fff;padding:18px 24px} header b{color:var(--lime);font-size:20px}
  header span{color:#9fb0a7;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-left:10px}
  .wrap{max-width:1040px;margin:0 auto;padding:24px}
  .search{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
  input[type=text]{font-size:16px;padding:12px 14px;border:1px solid #cfd6d2;border-radius:8px;width:200px}
  button{font-size:15px;font-weight:600;padding:12px 22px;border:none;border-radius:8px;background:var(--lime);color:var(--gd);cursor:pointer}
  button.lite{background:#e7ebe8;color:#2a3c37;padding:8px 14px;font-size:13px}
  label.toggle{font-size:14px;color:var(--mut);display:flex;gap:6px;align-items:center;cursor:pointer}
  .hint{color:var(--mut);font-size:13px;margin:4px 0 16px}
  details{background:#fff;border:1px solid #e3e7e8;border-radius:12px;margin-bottom:12px;padding:4px 14px}
  summary{cursor:pointer;font-weight:600;padding:12px 2px} summary .s{color:var(--mut);font-weight:400}
  .final{display:flex;align-items:center;gap:20px;background:#fff;border-radius:14px;padding:22px 24px;margin-bottom:18px;border:1px solid #e3e7e8}
  .final .num{font-size:52px;font-weight:800;line-height:1} .final .voie{font-weight:700;font-size:17px} .final .meta{font-size:14px;color:var(--mut)}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:10px}
  .card{background:#fff;border:1px solid #e3e7e8;border-radius:12px;padding:18px}
  .card.best{border:2px solid var(--lime);box-shadow:0 6px 18px rgba(0,0,0,.06)}
  .card h3{margin:0 0 6px;font-size:15px} .card .sc{font-size:40px;font-weight:800;margin:4px 0 2px}
  .card .sp{font-size:12px;color:var(--mut)} .badge{display:inline-block;font-size:11px;font-weight:700;color:var(--gd);background:var(--lime);padding:2px 8px;border-radius:20px;margin-left:6px}
  .topf{margin-top:8px;font-size:12px;color:var(--mut);line-height:1.5}
  table{width:100%;border-collapse:collapse} td,th{padding:7px 8px;font-size:13px;border-top:1px solid #eef1ef;text-align:right}
  th{color:var(--mut);font-weight:600;text-align:right} td:first-child,th:first-child{text-align:left}
  .bar{height:7px;background:#eef1ef;border-radius:4px;overflow:hidden;min-width:70px;display:inline-block;vertical-align:middle} .bar>i{display:block;height:100%;background:var(--lime)}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:20px 0 8px}
  .infos td:first-child{color:var(--mut)} .infos td:last-child{font-weight:600}
  .err{color:#b4341f;font-weight:600} .sub{color:var(--mut);font-size:13px}
  /* editeur de poids */
  #ed table td,#ed table th{text-align:center} #ed table td:first-child,#ed table th:first-child{text-align:left}
  #ed input{width:60px;font-size:14px;padding:6px;border:1px solid #cfd6d2;border-radius:6px;text-align:center}
  #ed .na{color:#c3ccc6} #ed .sum td{font-weight:700;border-top:2px solid #cfd6d2;color:var(--mut)}
  #ed .act{display:flex;gap:10px;align-items:center;margin:10px 0}
</style></head><body>
<header><b>foncimo</b><span>Outil d'analyse de potentiel — Pully</span></header>
<div class="wrap">
  <div class="search">
    <input id="num" type="text" placeholder="N° de parcelle (ex: 365)" autofocus>
    <button onclick="go()">Analyser</button>
    <label class="toggle"><input type="checkbox" id="gel" checked> appliquer le gel (zone réservée ×0.6)</label>
  </div>
  <div class="hint">Astuce : 365 (fort), 118 (fort, nue), 3676 (modérée), 3551 (gelée), 701 (hors périmètre).</div>
  <details id="poidsPanel"><summary>⚙️ Pondération des facteurs <span class="s">— modifiable (le score se normalise)</span></summary>
    <div id="ed"></div>
    <div class="act"><button class="lite" onclick="resetPoids()">Réinitialiser la grille</button><span class="sub" id="poidsMsg"></span></div>
  </details>
  <div id="out"></div>
</div>
<script>
const $=(id)=>document.getElementById(id);
function coul(n){return n>=75?'#6f9c2f':n>=50?'#b79a1f':n>=25?'#c47a2b':'#b4341f';}
const ORDRE=['G','E','P','I','S','F','T','L','C','N','O','V','R','B','A','D','X','Y'];
let DEF={}, LAB={}, POIDS={};
function clone(o){return JSON.parse(JSON.stringify(o));}

async function init(){
  const r=await fetch('/api/poids'); const d=await r.json();
  DEF=d.poids; LAB=d.labels;
  try{ const saved=localStorage.getItem('foncimo-poids'); POIDS = saved?JSON.parse(saved):clone(DEF); }catch(e){ POIDS=clone(DEF); }
  // complete les cles manquantes avec le defaut
  for(const s in DEF){ POIDS[s]=POIDS[s]||{}; for(const k in DEF[s]){ if(!(k in POIDS[s])) POIDS[s][k]=DEF[s][k]; } }
  buildEditor();
}
function buildEditor(){
  const strat=['agrandissement','elevation','demolition'];
  const noms={agrandissement:'Agr.',elevation:'Élév.',demo:'Démo.',demolition:'Démo.'};
  let rows=ORDRE.filter(k=>strat.some(s=>k in DEF[s])).map(k=>{
    const cells=strat.map(s=> (k in DEF[s])
      ? '<td><input type="number" min="0" step="1" data-s="'+s+'" data-k="'+k+'" value="'+POIDS[s][k]+'"></td>'
      : '<td class="na">—</td>').join('');
    return '<tr><td>'+k+' — '+(LAB[k]||'')+'</td>'+cells+'</tr>';
  }).join('');
  const sums=strat.map(s=>'<td id="sum-'+s+'"></td>').join('');
  $('ed').innerHTML='<table><tr><th>Facteur</th><th>Agr.</th><th>Élév.</th><th>Démo.</th></tr>'+rows
    +'<tr class="sum"><td>Total</td>'+sums+'</tr></table>';
  $('ed').querySelectorAll('input').forEach(inp=>inp.addEventListener('input',onPoids));
  majSommes();
}
function onPoids(e){
  const s=e.target.dataset.s,k=e.target.dataset.k; let v=Number(e.target.value); if(!isFinite(v)||v<0)v=0;
  POIDS[s][k]=v; try{localStorage.setItem('foncimo-poids',JSON.stringify(POIDS));}catch(_){}
  majSommes();
  if($('num').value.trim()) go();
}
function majSommes(){
  for(const s of ['agrandissement','elevation','demolition']){
    let t=0; for(const k in DEF[s]) t+=Number(POIDS[s][k])||0;
    const el=$('sum-'+s); if(el){ el.textContent=t; el.style.color = t===100?'#6f9c2f':'#c47a2b'; }
  }
}
function resetPoids(){ POIDS=clone(DEF); try{localStorage.removeItem('foncimo-poids');}catch(_){ } buildEditor(); if($('num').value.trim())go(); $('poidsMsg').textContent='grille par défaut restaurée'; setTimeout(()=>$('poidsMsg').textContent='',2000); }

async function go(){
  const n=$('num').value.trim(); if(!n) return;
  $('out').innerHTML='<p class="sub">Calcul…</p>';
  try{
    const r=await fetch('/api/calc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({numero:n,gel:$('gel').checked,poids:POIDS})});
    render(await r.json());
  }catch(e){ $('out').innerHTML='<p class="err">Erreur : '+e.message+'</p>'; }
}
function render(d){
  if(d.error){$('out').innerHTML='<p class="err">'+d.error+'</p>';return;}
  if(!d.found){$('out').innerHTML='<p class="err">Parcelle introuvable à Pully.</p>';return;}
  if(!d.densifiable){$('out').innerHTML='<div class="final"><div><div class="voie">Hors périmètre de densification</div><div class="meta">'+(d.aff||d.zone||'')+'</div></div></div>';return;}
  const cards=d.strategies.map(s=>{
    const best=s.cle===d.best.cle; const top=s.lignes.slice(0,3).map(l=>l.code+' '+l.contrib).join(' · ');
    return '<div class="card'+(best?' best':'')+'"><h3>'+s.nom+(best?'<span class="badge">meilleure</span>':'')+'</h3>'
      +'<div class="sc" style="color:'+coul(s.score)+'">'+(s.score/10).toFixed(1)+'<span style="font-size:16px;color:#b9c2bc">/10</span></div>'
      +'<div class="sp">+'+s.dsp+' m² de plancher'+(d.gel?' · brut '+(s.brut/10).toFixed(1):'')+'</div>'
      +'<div class="topf">top : '+top+'</div></div>';
  }).join('');
  const tables=d.strategies.map(s=>{
    const rows=s.lignes.map(l=>'<tr><td>'+l.code+' — '+l.label+'</td><td>'+l.poids+'%</td><td>'+l.note.toFixed(1)+'</td>'
      +'<td><span class="bar" style="width:90px"><i style="width:'+Math.round(l.note*10)+'%"></i></span></td><td>'+l.contrib+'</td></tr>').join('');
    return '<details'+(s.cle===d.best.cle?' open':'')+'><summary>'+s.nom+' <span class="s">— '+(s.score/10).toFixed(1)+'/10</span></summary>'
      +'<table><tr><th>Facteur</th><th>Poids</th><th>Note/10</th><th>Note</th><th>Contrib.</th></tr>'+rows+'</table></details>';
  }).join('');
  const i=d.inputs;
  const infos=[['Affectation',i.aff],['Surface',i.S+' m²'],['Emprise max / actuelle',i.Fmax+' / '+i.Fexist+' m²'],
    ['Niveaux max / actuels',(i.Nmax??'—')+' / '+i.Nact],['Surf. plancher existante / max',i.SPexist+' / '+i.SPmax+' m²'],
    ['Logements actuels',i.logts],['Année',i.annee??'—'],['Recensement',i.rec??'—'],
    ['Zone réservée (gel)',i.gel?'OUI':'non'],['Pente',(i.pente??'—')+' %'],['Contraintes',i.contraintes]]
    .map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>').join('');
  $('out').innerHTML=
    '<div class="final"><div class="num" style="color:'+coul(d.note)+'">'+(d.note/10).toFixed(1)+'<span style="font-size:22px;color:#b9c2bc;font-weight:600">/10</span></div>'
    +'<div><div class="voie">'+d.label+'</div><div class="meta">Parcelle '+d.numero+' · meilleure voie : <b>'+d.best.nom+'</b></div></div></div>'
    +'<h2>Les 3 stratégies</h2><div class="cards">'+cards+'</div>'
    +'<h2>Détail par facteur</h2>'+tables
    +'<h2>Chiffres utilisés</h2><table class="infos">'+infos+'</table>';
}
$('num').addEventListener('keydown',e=>{if(e.key==='Enter')go();});
$('gel').addEventListener('change',()=>{if($('num').value.trim())go();});
init();
</script>
</body></html>`;
