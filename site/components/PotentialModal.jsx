"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { evaluerParcelle, capturerLead, suggererAdresses } from "@/lib/foncimo";

const ParcelMap = dynamic(() => import("@/components/ParcelMap"), { ssr: false });

function noteColor(note) {
  if (note === null || note === undefined) return "#9aa5a0";
  if (note >= 75) return "#6f9c2f";
  if (note >= 50) return "#b79a1f";
  if (note >= 25) return "#c47a2b";
  return "#b4341f";
}

function Gauge({ note, label }) {
  const c = noteColor(note);
  const deg = note ? Math.max(0, Math.min(100, note)) * 3.6 : 0;
  return (
    <div className="gauge-wrap">
      <div className="gauge" style={{ background: `conic-gradient(${c} ${deg}deg, #e9ecea 0deg)` }}>
        <div className="gauge-inner">
          <span className="gauge-num" style={{ color: c }}>
            {note === null || note === undefined ? "n/a" : note}
          </span>
          {note !== null && note !== undefined && <span className="gauge-max">/100</span>}
        </div>
      </div>
      <span className="gauge-label" style={{ color: c, background: "#f2f5ea" }}>{label}</span>
    </div>
  );
}

function DetailList({ score, revealed }) {
  const facteurs = (score && score.facteurs) || [];
  return (
    <ul className="detail-list">
      {facteurs.map((f, i) => (
        <li key={i}>
          <span className="detail-label">{f.label}</span>
          <span className={`detail-val ${revealed ? "" : "blurred"}`}>
            {revealed ? f.valeur : "•••••••"}
          </span>
          <span className={`detail-pts ${revealed ? "" : "blurred"}`} style={{ color: revealed && f.points < 0 ? "#b4341f" : "#2a3c37" }}>
            {revealed ? `${f.points > 0 ? "+" : ""}${f.points}` : "••"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PotentialModal({ onClose }) {
  const [step, setStep] = useState("form");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // autocomplétion
  const [sugg, setSugg] = useState([]);
  const [showSugg, setShowSugg] = useState(false);
  const [sugLoading, setSugLoading] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [egrid, setEgrid] = useState(null);
  const debRef = useRef(null);

  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => () => clearTimeout(debRef.current), []);

  function onQueryChange(v) {
    setQuery(v);
    setEgrid(null);
    setNoMatch(false);
    const digits = /^\s*\d+\s*$/.test(v);
    if (type === "numero" || digits || v.trim().length < 2) {
      setSugg([]);
      setShowSugg(false);
      return;
    }
    setSugLoading(true);
    setShowSugg(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      const list = await suggererAdresses(v);
      setSugg(list);
      setSugLoading(false);
      setNoMatch(list.length === 0 && v.trim().length >= 3);
    }, 260);
  }

  function pickSuggestion(s) {
    setQuery(s.adresse);
    setType("adresse");
    setEgrid(s.egrid);
    setSugg([]);
    setShowSugg(false);
    setNoMatch(false);
  }

  async function submitQuery(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSugg(false);
    setLoading(true);
    setError("");
    try {
      const res = await evaluerParcelle(query.trim(), type, egrid);
      if (!res || res.found === false) {
        setError(res?.message || "Parcelle introuvable à Pully.");
      } else {
        setData(res);
        setStep("result");
      }
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    setError("");
    try {
      const res = await capturerLead({
        egrid: data.resume.egrid,
        query: data.resume.numero || query,
        type,
        email: email.trim(),
        rdv: true,
      });
      setData((d) => ({ ...d, potentiel: res.potentiel }));
      setRevealed(true);
      setEmailSent(!!res.email_envoye);
    } catch (err) {
      setError(err.message || "Impossible d'enregistrer votre demande.");
    } finally {
      setEmailLoading(false);
    }
  }

  function reset() {
    setStep("form");
    setData(null);
    setQuery("");
    setError("");
    setRevealed(false);
    setEmail("");
    setEmailSent(false);
    setEgrid(null);
    setSugg([]);
    setShowSugg(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Fermer" onClick={onClose}>✕</button>

        {step === "form" && (
          <div className="modal-form">
            <span className="eyebrow" style={{ color: "#6f9c2f" }}>Estimation gratuite</span>
            <h2>Et si votre terrain avait plus de potentiel que vous ne le pensez&nbsp;?</h2>
            <p>Entrez votre numéro de parcelle ou votre adresse à <strong>Pully</strong> et obtenez votre note de potentiel en 30 secondes.</p>

            <div className="seg">
              {[["auto", "Auto"], ["numero", "N° parcelle"], ["adresse", "Adresse"]].map(([v, l]) => (
                <button key={v} type="button" className={type === v ? "active" : ""} onClick={() => { setType(v); setSugg([]); setShowSugg(false); }}>{l}</button>
              ))}
            </div>

            <form onSubmit={submitQuery} autoComplete="off">
              <div className="autocomplete">
                <input
                  className="modal-input"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onFocus={() => { if (sugg.length) setShowSugg(true); }}
                  placeholder={type === "adresse" ? "Ex : Chemin des Bosquets 7" : "Ex : 3551  ou  Chemin des Bosquets 7"}
                  autoFocus
                />
                {egrid && <span className="input-check">✓</span>}
                {showSugg && (sugLoading || sugg.length > 0) && (
                  <ul className="sugg-list">
                    {sugLoading && <li className="sugg-loading">Recherche…</li>}
                    {sugg.map((s, i) => (
                      <li key={i} onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}>
                        <span className="sugg-pin">📍</span>
                        <span>{s.adresse}</span>
                        <span className="sugg-num">n° {s.numero}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {noMatch && <p className="modal-hint" style={{ textAlign: "left", color: "#c47a2b" }}>Aucune adresse à Pully ne correspond.</p>}
              {error && <p className="modal-error">{error}</p>}
              <button className="btn btn-lime" type="submit" disabled={loading} style={{ width: "100%", marginTop: 12 }}>
                {loading ? "Analyse en cours…" : "Obtenir ma note"}
              </button>
            </form>
            <p className="modal-hint">Démo limitée à la commune de Pully (VD).</p>
          </div>
        )}

        {step === "result" && data && (
          <div className="modal-result">
            <button className="modal-back" onClick={reset}>‹ Nouvelle recherche</button>
            <div className="result-head">
              <h3>{data.resume.adresse || `Parcelle n°${data.resume.numero}`}</h3>
              <p>{data.resume.commune}{data.resume.surface_m2 ? " · " + Math.round(data.resume.surface_m2) + " m²" : ""}{data.resume.zone ? " · " + data.resume.zone : ""}</p>
            </div>

            <ParcelMap carte={data.carte} />

            <div className="potentiel-hero">
              <Gauge note={data.potentiel.note} label={data.potentiel.label} />
              <div className="potentiel-caption">Note de potentiel de la parcelle</div>
            </div>

            <div className="detail-block">
              <div className="detail-head">
                <strong>Détail du calcul</strong>
                {!revealed && <span className="lock">🔒 masqué</span>}
              </div>
              <DetailList score={data.potentiel} revealed={revealed} />
            </div>

            {!revealed ? (
              <form className="email-capture" onSubmit={submitEmail}>
                <p>Recevez le <strong>détail complet du calcul</strong> par email&nbsp;:</p>
                <div className="email-row">
                  <input
                    className="modal-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.ch"
                    required
                  />
                  <button className="btn btn-lime" type="submit" disabled={emailLoading}>
                    {emailLoading ? "…" : "Révéler"}
                  </button>
                </div>
                {error && <p className="modal-error">{error}</p>}
              </form>
            ) : (
              <div className="done-block">
                <p className="done-title">✓ Détail révélé{emailSent ? ", un email vous a été envoyé." : "."}</p>
                <p>Cette note est un indicateur automatique. Pour l'analyse réelle (droits à bâtir, faisabilité, valorisation), <strong>prenons rendez-vous</strong> : au bureau à Pully, ou Foncimo se déplace chez vous.</p>
                <a className="btn btn-lime" href="/contact" style={{ marginTop: 10 }}>Prendre rendez-vous</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
