"use client";

// Enveloppe "popup" du calculateur de note : overlay + bouton fermer.
// Toute la logique vit dans PotentielCalculator (partagé avec la page /tool).

import PotentielCalculator from "@/components/PotentielCalculator";

export default function PotentialModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Fermer" onClick={onClose}>✕</button>
        <PotentielCalculator autoFocusInput />
      </div>
    </div>
  );
}
