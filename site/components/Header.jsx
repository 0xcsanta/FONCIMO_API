"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/pilotage-de-projet-immobilier", label: "Pilotage de projet" },
  { href: "/expertise-immobiliere", label: "Expertise immobilière" },
  { href: "/societe", label: "Société" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          foncimo
        </Link>

        <nav className={`nav ${open ? "open" : ""}`}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="btn btn-lime"
            onClick={() => setOpen(false)}
          >
            Contact
          </Link>
        </nav>

        <button
          className="nav-toggle"
          aria-label="Ouvrir le menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>
    </header>
  );
}
