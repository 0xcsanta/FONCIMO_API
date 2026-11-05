"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PotentialModal from "@/components/PotentialModal";

export default function PotentielLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";
  // Sur la page dédiée /tool, l'outil est déjà affiché : pas de bouton flottant
  // ni de popup automatique.
  const surPageTool = pathname.startsWith("/tool");

  // Ouverture automatique une fois par session (après 3 s)
  useEffect(() => {
    if (surPageTool) return;
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
  }, [surPageTool]);

  if (surPageTool) return null;

  return (
    <>
      <button className="potentiel-fab" onClick={() => setOpen(true)}>
        <span className="fab-dot" /> Évaluer ma parcelle
      </button>
      {open && <PotentialModal onClose={() => setOpen(false)} />}
    </>
  );
}
