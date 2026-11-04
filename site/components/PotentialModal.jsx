"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { evaluerParcelle, capturerLead } from "@/lib/foncimo";

const ParcelMap = dynamic(() => import("@/components/ParcelMap"), { ssr: false });

function noteColor(note) {
  if (note === null || note === undefined) return "#9aa5a0";
  if (note >= 75) return "#8fae3c";
  if (note >= 50) return "#c9b63a";
  if (note >= 25) return "#cf8a3a";
  return "#b4341f";
}

function NoteCard({ titre, note, label }) {
  const c = noteColor(note);
  return (
    <div className="note-card">
      <div className="note-card-head">{titre}</div>
      <div className="note-value" style={{ color: c }}>
        {note === null || note === undefined ? "n/a" : note}
        {note !== null && note !== undefined && <span className="note-max">/100</span>}
      </div>
      <div className="note-bar">
        <div className="note-bar-fill" style={{ width: `${note || 0}%`, background: c }} />
      </div>
      <div className="note-label" style={{ color: c }}>{label}</div>
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
  const [step, setStep] = useState("form"); // form | result
  const [query, setQuery] = useState("");
  const [type, setType] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [email, setEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function submitQuery(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await evaluerParcelle(query.trim(), type);
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
      setData((d) => ({ ...d, densification: res.densification, valorisation: res.valorisation }));
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
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Fermer" onClick={onClose}>✕</button>

        {step === "form" && (
          <div className="modal-form">
            <span className="eyebrow" style={{ color: "#8fae3c" }}>Estimation gratuite</span>
            <h2>Et si votre terrain avait plus de potentiel que vous ne le pensez&nbsp;?</h2>
            <p>Entrez votre numéro de parcelle ou votre adresse à <strong>Pully</strong> et obtenez votre note de potentiel en 30 secondes.</p>

            <div className="seg">
              {[["auto", "Auto"], ["numero", "N° parcelle"], ["adresse", "Adresse"]].map(([v, l]) => (
                <button key={v} type="button" className={type === v ? "active" : ""} onClick={() => setType(v)}>{l}</button>
              ))}
            </div>

            <form onSubmit={submitQuery}>
              <input
                className="modal-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={type === "adresse" ? "Ex : Chemin des Bosquets 7" : "Ex : 3551  ou  Chemin des Bosquets 7"}
                autoFocus
              />
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
              <p>{data.resume.commune} · {data.resume.surface_m2 ? Math.round(data.resume.surface_m2) + " m²" : ""} {data.resume.zone ? "· " + data.resume.zone : ""}</p>
            </div>

            <ParcelMap carte={data.carte} />

            <div className="notes-row">
              <NoteCard titre="Potentiel de densification" note={data.densification.note} label={data.densification.label} />
              <NoteCard titre="Valorisation (indicatif)" note={data.valorisation.note} label={data.valorisation.label} />
            </div>

            <div className="detail-block">
              <div className="detail-head">
                <strong>Détail du calcul : densification</strong>
                {!revealed && <span className="lock">🔒 masqué</span>}
              </div>
              <DetailList score={data.densification} revealed={revealed} />
              {data.valorisation.facteurs && (
                <>
                  <div className="detail-head" style={{ marginTop: 14 }}>
                    <strong>Détail du calcul : valorisation</strong>
                  </div>
                  <DetailList score={data.valorisation} revealed={revealed} />
                </>
              )}
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
                <p>Ces notes sont des indicateurs automatiques. Pour l'analyse réelle (droits à bâtir, faisabilité, valorisation), <strong>prenons rendez-vous</strong> : au bureau à Pully, ou Foncimo se déplace chez vous.</p>
                <a className="btn btn-lime" href="/contact" style={{ marginTop: 10 }}>Prendre rendez-vous</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
