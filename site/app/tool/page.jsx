import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PotentielCalculator from "@/components/PotentielCalculator";

export const metadata = {
  title: "Évaluez le potentiel de votre parcelle - Foncimo",
  description:
    "Outil gratuit Foncimo : obtenez la note de potentiel de densification d'une parcelle à Pully (VD) en 30 secondes, à partir de son numéro ou de son adresse.",
};

export default function ToolPage() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Outil gratuit</span>
            <h1>Évaluez le potentiel de votre parcelle</h1>
            <p className="page-hero-lead">
              Entrez un numéro de parcelle ou une adresse à Pully : notre
              algorithme croise zones, droits à bâtir, patrimoine et terrain
              pour estimer son potentiel de densification.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="tool-card modal">
              <PotentielCalculator autoFocusInput={false} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
