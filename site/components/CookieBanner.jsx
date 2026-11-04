"use client";

import { useEffect, useState } from "react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem("foncimo-cookie")) setVisible(true);
    } catch (e) {
      setVisible(true);
    }
  }, []);

  const decide = (value) => {
    try {
      localStorage.setItem("foncimo-cookie", value);
    } catch (e) {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie" role="dialog" aria-label="Préférences cookies">
      <p>
        Ce site utilise des cookies et vous permet de contrôler ceux que vous
        souhaitez activer.
      </p>
      <div className="cookie-actions">
        <button className="btn btn-lime" onClick={() => decide("all")}>
          Accepter
        </button>
        <button
          className="btn"
          style={{ background: "#eceff0", color: "#1d2622" }}
          onClick={() => decide("none")}
        >
          Refuser
        </button>
        <span className="cookie-link" onClick={() => decide("all")}>
          Paramètres
        </span>
      </div>
    </div>
  );
}
