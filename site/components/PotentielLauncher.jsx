"use client";

import { useEffect, useState } from "react";
import PotentialModal from "@/components/PotentialModal";

export default function PotentielLauncher() {
  const [open, setOpen] = useState(false);

  // Ouverture automatique une fois par session (après 3 s)
  useEffect(() => {
    let shown = false;
    try {
      shown = sessionStorage.getItem("foncimo-potentiel-vu") === "1";
    } catch (e) {
      /* ignore */
    }
    if (shown) return;
    const t = setTimeout(() => {
      setOpen(true);
      try {
        sessionStorage.setItem("foncimo-potentiel-vu", "1");
      } catch (e) {
        /* ignore */
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <button className="potentiel-fab" onClick={() => setOpen(true)}>
        <span className="fab-dot" /> Évaluer ma parcelle
      </button>
      {open && <PotentialModal onClose={() => setOpen(false)} />}
    </>
  );
}
