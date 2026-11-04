import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "Pilotage de projet immobilier - Foncimo" };

export default function PilotagePage() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Pilotage de projet</span>
            <h1>Pilotage de projet immobilier</h1>
          </div>
        </section>

        <section className="section">
          <div className="container prose">
            <p>
              Nous vous accompagnons dans chaque étape de votre projet immobilier
              de la définition des besoins à la réception de l'ouvrage. Notre
              rôle est de sécuriser vos décisions et de coordonner l'ensemble des
              intervenants.
            </p>
            <h2>Nos prestations</h2>
            <p>Étude de faisabilité et planification stratégique.</p>
            <p>Coordination et suivi de projet de construction.</p>
            <p>Conseil en durabilité, réglementation et optimisation.</p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
