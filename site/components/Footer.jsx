import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <nav className="footer-nav">
            <Link href="/pilotage-de-projet-immobilier">Pilotage de projet</Link>
            <Link href="/expertise-immobiliere">Expertise immobilière</Link>
            <Link href="/societe">Société</Link>
            <Link href="/contact">Contact</Link>
          </nav>
          <div className="footer-logo">foncimo</div>
        </div>

        <div className="footer-bottom">
          <span>© 2025 Foncimo SA</span>
          <div className="footer-bottom-links">
            <Link href="/politique-de-confidentialite">
              Politique de confidentialité
            </Link>
            <Link href="/impressum">Impressum</Link>
            <a
              href="https://www.linkedin.com/company/foncimo-sa/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
