"use client";

// Outil d'analyse de potentiel (page /tool) : 3 stratégies pondérées
// (agrandissement / surélévation / démolition), poids ajustables, recalcul
// en direct. Le scoring tourne dans l'edge function "analyse" (vraies
// colonnes de la base) ; ce composant gère la recherche, les poids et le rendu.

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { analyserParcelle, poidsDefaut, suggererAdresses } from "@/lib/foncimo";

const ParcelMap = dynamic(() => import("@/components/ParcelMap"), { ssr: false });

const ORDRE = ["G", "E", "P", "I", "S", "F", "T", "L", "C", "N", "O", "V", "R", "B", "A", "D", "X", "Y"];
const STRATS = [
  ["agrandissement", "Agr."],
  ["elevation", "Élév."],
  ["demolition", "Démo."],
];
const clone = (o) => JSON.parse(JSON.stringify(o));
function coul(n) {
  if (n == null) return "#9aa5a0";
  return n >= 75 ? "#6f9c2f" : n >= 50 ? "#b79a1f" : n >= 25 ? "#c47a2b" : "#b4341f";
}

export default function AnalyseurPotentiel() {
  const [defauts, setDefauts] = useState(null); // {poids, labels, sources}
  const [poids, setPoids] = useState(null);
  const [gel, setGel] = useState(true);

  const [query, setQuery] = useState("");
  const [type, setType] = useState("auto");
  const [egrid, setEgrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [sugg, setSugg] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const debSug = useRef(null);
  const debCalc = useRef(null);
  // refs pour le recalcul (évite les closures périmées)
  const ctx = useRef({ query: "", type: "auto", egrid: null, poids: null, gel: true });
  ctx.current = { query, type, egrid, poids, gel };

  // Charge la grille par défaut + poids mémorisés
  useEffect(() => {
    poidsDefaut()
      .then((d) => {
        setDefauts(d);
        let p = clone(d.poids);
        try {
          const saved = localStorage.getItem("foncimo-poids");
          if (saved) {
            const sp = JSON.parse(saved);
            for (const s in d.poids) { p[s] = { ...d.poids[s], ...(sp[s] || {}) }; }
          }
        } catch (e) { /* ignore */ }
        setPoids(p);
      })
      .catch(() => setDefauts({ poids: {}, labels: {}, sources: {} }));
    return () => { clearTimeout(debSug.current); clearTimeout(debCalc.current); };
  }, []);

  const lancer = useCallback(async (over = {}) => {
    const c = { ...ctx.current, ...over };
    if (!c.query.trim() && !c.egrid) return;
    setLoading(true);
    setError("");
    try {
      const res = await analyserParcelle({ query: c.query.trim(), type: c.type, egrid: c.egrid, poids: c.poids, gel: c.gel });
      if (!res || res.found === false) { setError(res?.message || "Parcelle introuvable à Pully."); setData(null); }
      else setData(res);
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }, []);

  const recalc = useCallback(() => {
    if (!data) return;
    clearTimeout(debCalc.current);
    debCalc.current = setTimeout(() => lancer(), 300);
  }, [data, lancer]);

  function onQueryChange(v) {
    setQuery(v); setEgrid(null); setNoMatch(false);
    const digits = /^\s*\d+\s*$/.test(v);
    if (type === "numero" || digits || v.trim().length < 2) { setSugg([]); setShowSugg(false); return; }
    setShowSugg(true);
    clearTimeout(debSug.current);
    debSug.current = setTimeout(async () => {
      const list = await suggererAdresses(v);
      setSugg(list);
      setNoMatch(list.length === 0 && v.trim().length >= 3);
    }, 260);
  }
  function pickSuggestion(s) {
    setQuery(s.adresse); setType("adresse"); setEgrid(s.egrid);
    setSugg([]); setShowSugg(false); setNoMatch(false);
    setTimeout(() => lancer({ query: s.adresse, type: "adresse", egrid: s.egrid }), 0);
  }
  function submit(e) { e.preventDefault(); setShowSugg(false); lancer(); }

  function onPoids(strat, code, val) {
    let v = Number(val); if (!isFinite(v) || v < 0) v = 0;
    setPoids((prev) => {
      const np = { ...prev, [strat]: { ...prev[strat], [code]: v } };
      try { localStorage.setItem("foncimo-poids", JSON.stringify(np)); } catch (e) { /* ignore */ }
      ctx.current = { ...ctx.current, poids: np };
      return np;
    });
    recalc();
  }
  function resetPoids() {
    const p = clone(defauts.poids);
    setPoids(p);
    ctx.current = { ...ctx.current, poids: p };
    try { localStorage.removeItem("foncimo-poids"); } catch (e) { /* ignore */ }
    recalc();
  }
  function onGel(v) { setGel(v); ctx.current = { ...ctx.current, gel: v }; recalc(); }

  const sommes = {};
  if (defauts && poids) for (const [s] of STRATS) sommes[s] = Object.keys(defauts.poids[s] || {}).reduce((a, k) => a + (Number(poids[s]?.[k]) || 0), 0);

  return (
    <div className="an">
      {/* Recherche */}
      <form onSubmit={submit} autoComplete="off" className="an-search">
        <div className="seg">
          {[["auto", "Auto"], ["numero", "N° parcelle"], ["adresse", "Adresse"]].map(([v, l]) => (
            <button key={v} type="button" className={type === v ? "active" : ""} onClick={() => { setType(v); setSugg([]); setShowSugg(false); }}>{l}</button>
          ))}
        </div>
        <div className="an-row">
          <div className="autocomplete" style={{ flex: 1 }}>
            <input className="modal-input" value={query} onChange={(e) => onQueryChange(e.target.value)} onFocus={() => { if (sugg.length) setShowSugg(true); }} placeholder="N° de parcelle ou adresse (Pully) — ex : 365" />
            {egrid && <span className="input-check">✓</span>}
            {showSugg && sugg.length > 0 && (
              <ul className="sugg-list">
                {sugg.map((s, i) => (
                  <li key={i} onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}>
                    <span className="sugg-pin">📍</span><span>{s.adresse}</span><span className="sugg-num">n° {s.numero}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn btn-lime" type="submit" disabled={loading}>{loading ? "…" : "Analyser"}</button>
          <label className="an-toggle"><input type="checkbox" checked={gel} onChange={(e) => onGel(e.target.checked)} /> gel ×0.6</label>
        </div>
        {noMatch && <p className="modal-hint" style={{ textAlign: "left", color: "#c47a2b" }}>Aucune adresse à Pully ne correspond.</p>}
        {error && <p className="modal-error">{error}</p>}
      </form>

      {/* Éditeur de poids */}
      {defauts && poids && (
        <details className="an-panel">
          <summary>⚙️ Pondération des facteurs <span className="an-muted">— modifiable, le score se recalcule</span></summary>
          <div className="an-edtable">
            <table>
              <thead><tr><th>Facteur</th><th>Agr.</th><th>Élév.</th><th>Démo.</th><th>Source (base)</th></tr></thead>
              <tbody>
                {ORDRE.filter((k) => STRATS.some(([s]) => k in (defauts.poids[s] || {}))).map((k) => (
                  <tr key={k}>
                    <td className="an-fac">{k} — {defauts.labels[k]}</td>
                    {STRATS.map(([s]) => (
                      <td key={s}>{k in (defauts.poids[s] || {})
                        ? <input type="number" min="0" value={poids[s]?.[k] ?? 0} onChange={(e) => onPoids(s, k, e.target.value)} />
                        : <span className="an-na">—</span>}</td>
                    ))}
                    <td className="an-src">{defauts.sources[k]}</td>
                  </tr>
                ))}
                <tr className="an-sum">
                  <td>Total</td>
                  {STRATS.map(([s]) => <td key={s} style={{ color: sommes[s] === 100 ? "#6f9c2f" : "#c47a2b" }}>{sommes[s]}</td>)}
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div className="an-act"><button type="button" className="an-lite" onClick={resetPoids}>Réinitialiser la grille</button></div>
          </div>
        </details>
      )}

      {/* Résultats */}
      {data && data.found && !data.densifiable && (
        <div className="an-final"><div><div className="an-voie">Hors périmètre de densification</div><div className="an-meta">{data.aff || data.zone || ""}</div></div></div>
      )}

      {data && data.found && data.densifiable && (
        <>
          <div className="an-final">
            <div className="an-num" style={{ color: coul(data.note) }}>{(data.note / 10).toFixed(1)}<span className="an-sur">/10</span></div>
            <div>
              <div className="an-voie" style={{ color: coul(data.note) }}>{data.label}</div>
              <div className="an-meta">
                {data.resume.adresse || "Parcelle n°" + data.resume.numero} · meilleure voie : <b>{data.strategies.find((s) => s.cle === data.best)?.nom}</b>
                {data.gel && <span className="an-gel"> · zone réservée (gel appliqué)</span>}
              </div>
            </div>
          </div>

          {data.carte && <div className="an-map"><ParcelMap carte={data.carte} /></div>}

          <div className="an-cards">
            {data.strategies.map((s) => {
              const best = s.cle === data.best;
              return (
                <div key={s.cle} className={`an-card ${best ? "best" : ""}`}>
                  <h3>{s.nom}{best && <span className="an-badge">meilleure</span>}</h3>
                  <div className="an-sc" style={{ color: coul(s.score) }}>{(s.score / 10).toFixed(1)}<span className="an-sur">/10</span></div>
                  <div className="an-sp">+{s.dsp} m² de plancher{data.gel ? ` · brut ${(s.brut / 10).toFixed(1)}` : ""}</div>
                  <div className="an-top">top : {s.lignes.slice(0, 3).map((l) => `${l.code} ${l.contrib}`).join(" · ")}</div>
                </div>
              );
            })}
          </div>

          <h4 className="an-h">Détail par facteur</h4>
          {data.strategies.map((s) => (
            <details key={s.cle} className="an-panel" open={s.cle === data.best}>
              <summary>{s.nom} <span className="an-muted">— {(s.score / 10).toFixed(1)}/10</span></summary>
              <div className="an-edtable">
                <table>
                  <thead><tr><th>Facteur</th><th>Poids</th><th>Note/10</th><th></th><th>Contrib.</th></tr></thead>
                  <tbody>
                    {s.lignes.map((l) => (
                      <tr key={l.code}>
                        <td className="an-fac" title={l.source}>{l.code} — {l.label}</td>
                        <td>{l.poids}%</td>
                        <td>{l.note.toFixed(1)}</td>
                        <td><span className="an-bar"><i style={{ width: Math.round(l.note * 10) + "%" }} /></span></td>
                        <td><b>{l.contrib}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}

          <h4 className="an-h">Chiffres utilisés</h4>
          <div className="an-edtable">
            <table className="an-infos"><tbody>
              {[
                ["Affectation", data.inputs.aff],
                ["Surface", data.inputs.S + " m²"],
                ["Emprise max / actuelle", data.inputs.Fmax + " / " + data.inputs.Fexist + " m²"],
                ["Niveaux max / actuels", (data.inputs.Nmax ?? "—") + " / " + data.inputs.Nact],
                ["Surf. plancher existante / max", data.inputs.SPexist + " / " + data.inputs.SPmax + " m²"],
                ["Logements actuels", data.inputs.logts],
                ["Année de construction", data.inputs.annee ?? "—"],
                ["Recensement", data.inputs.rec ?? "—"],
                ["Zone réservée (gel)", data.inputs.gel ? "OUI" : "non"],
                ["Pente", (data.inputs.pente ?? "—") + " %"],
                ["Contraintes", data.inputs.contraintes],
              ].map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>)}
            </tbody></table>
          </div>
        </>
      )}
    </div>
  );
}
