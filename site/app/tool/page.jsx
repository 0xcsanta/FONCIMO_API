import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AnalyseurPotentiel from "@/components/AnalyseurPotentiel";

export const metadata = {
  title: "Analyse de potentiel d'une parcelle - Foncimo",
  description:
    "Outil d'analyse Foncimo : potentiel de densification d'une parcelle à Pully selon 3 stratégies (agrandissement, surélévation, démolition-reconstruction), avec pondération ajustable.",
};

export default function ToolPage() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Outil d'analyse</span>
            <h1>Potentiel de valorisation d'une parcelle</h1>
            <p className="page-hero-lead">
              Trois stratégies évaluées indépendamment — agrandissement au sol,
              surélévation, démolition-reconstruction — à partir des données
              cadastrales et réglementaires de Pully. La note affichée est celle
              de la meilleure voie. Chaque facteur est pondérable.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <AnalyseurPotentiel />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
