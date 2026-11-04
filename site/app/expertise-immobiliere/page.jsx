import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "Expertise immobilière - Foncimo" };

export default function ExpertisePage() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Expertise immobilière</span>
            <h1>Expertise immobilière</h1>
          </div>
        </section>

        <section className="section">
          <div className="container prose">
            <p>
              Nous réalisons une évaluation précise et objective de la valeur de
              votre bien en intégrant les spécificités locales, les dynamiques du
              marché et les normes en vigueur.
            </p>
            <h2>Nos prestations</h2>
            <p>Évaluation de la valeur vénale.</p>
            <p>Étude du potentiel de valorisation.</p>
            <p>Analyse technique et réglementaire.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
