import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = { title: "Société - Foncimo" };

export default function SocietePage() {
  return (
    <>
      <Header />
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="eyebrow">Société</span>
            <h1>L'immobilier en toute clarté et sérénité</h1>
          </div>
        </section>

        <section className="section">
          <div className="container prose">
            <p>
              L'immobilier est souvent complexe, entre décisions stratégiques,
              évolutions réglementaires et coordination des intervenants. C'est là
              que nous intervenons.
            </p>
            <p>
              Avec notre indépendance et notre approche personnalisée, nous vous
              apportons clarté, sérénité et maîtrise à chaque étape de votre
              projet.
            </p>
            <p>
              Basés à Pully, nous œuvrons dans toute la Suisse romande, avec une
              attention particulière aux spécificités locales et à vos besoins.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
