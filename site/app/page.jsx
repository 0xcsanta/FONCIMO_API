import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Testimonials from "@/components/Testimonials";
import CookieBanner from "@/components/CookieBanner";

const IMG_HERO =
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80";
const IMG_PILOTAGE =
  "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=80";
const IMG_EXPERTISE =
  "https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?auto=format&fit=crop&w=1200&q=80";
const IMG_CTA =
  "https://images.unsplash.com/photo-1664575602554-2087b04935a5?auto=format&fit=crop&w=1600&q=80";

const clients = [
  "Business Broker",
  "Gonset",
  "L3M Partners",
  "GEFISWISS",
  "CCHE",
  "SCHL",
];

export default function Home() {
  return (
    <>
      <Header />

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="container">
            <h1>Pilotage de projet et expertise immobilière</h1>
          </div>
          <div className="hero-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={IMG_HERO}
              alt="Propriété avec vue sur le lac Léman et les Alpes"
            />
          </div>
        </section>

        {/* Intro */}
        <section className="intro section">
          <div className="container">
            <span className="eyebrow">Un accompagnement transparent et structuré</span>
            <h2>
              Nous mettons à votre service plus de 20 années d'expérience pour
              sécuriser vos décisions immobilières.
            </h2>
            <div className="intro-text">
              <p>
                Foncimo est spécialisé dans le pilotage de projet et l'expertise
                immobilière.
              </p>
              <p>
                Que vous soyez propriétaire, investisseur, promoteur, institution
                ou collectivité, nous vous accompagnons à chaque étape de votre
                projet immobilier.
              </p>
              <p>
                Grâce à notre indépendance, notre regard transversal et une
                gestion rigoureuse, nous vous aidons à prendre des décisions
                claires en toute confiance.
              </p>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="section">
          <div className="container">
            <div className="service">
              <div className="service-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={IMG_PILOTAGE}
                  alt="Expert immobilier prenant des notes lors d'une visite de chantier"
                />
              </div>
              <div className="service-body">
                <h3>Pilotage de projet immobilier</h3>
                <p>
                  Nous vous accompagnons dans chaque étape de votre projet
                  immobilier, de la définition des besoins à la réception de
                  l'ouvrage.
                </p>
                <ul>
                  <li>Étude de faisabilité et planification stratégique</li>
                  <li>Coordination et suivi de projet de construction</li>
                  <li>Conseil en durabilité, réglementation et optimisation</li>
                </ul>
                <Link
                  href="/pilotage-de-projet-immobilier"
                  className="btn btn-lime"
                >
                  En savoir plus
                </Link>
              </div>
            </div>

            <div className="service reverse">
              <div className="service-body">
                <h3>Expertise immobilière</h3>
                <p>
                  Nous réalisons une évaluation précise et objective de la valeur
                  de votre bien en intégrant les spécificités locales, les
                  dynamiques du marché et les normes en vigueur.
                </p>
                <ul>
                  <li>Évaluation de la valeur vénale</li>
                  <li>Étude du potentiel de valorisation</li>
                  <li>Analyse technique et réglementaire</li>
                </ul>
                <Link href="/expertise-immobiliere" className="btn btn-lime">
                  En savoir plus
                </Link>
              </div>
              <div className="service-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={IMG_EXPERTISE}
                  alt="Photographie d'une maison lors d'une expertise immobilière"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Engagement */}
        <section className="section engagement">
          <div className="container">
            <span className="eyebrow">Notre engagement</span>
            <h2>
              L'immobilier en toute clarté et sérénité avec un accompagnement
              personnalisé
            </h2>
            <div className="engagement-text">
              <p>
                L'immobilier est souvent complexe, entre décisions stratégiques,
                évolutions réglementaires et coordination des intervenants. C'est
                là que nous intervenons.
              </p>
              <p>
                Avec notre indépendance et notre approche personnalisée, nous
                vous apportons clarté, sérénité et maîtrise à chaque étape de
                votre projet.
              </p>
              <p>
                Basés à Pully, nous œuvrons dans toute la Suisse romande, avec une
                attention particulière aux spécificités locales et à vos besoins.
              </p>
            </div>
          </div>
        </section>

        {/* Clients */}
        <section className="clients">
          <div className="container">
            <h2>Ils nous font confiance</h2>
            <div className="clients-grid">
              {clients.map((c) => (
                <span key={c} className="client-logo">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <Testimonials />

        {/* CTA */}
        <section className="section cta">
          <div className="cta-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG_CTA} alt="" />
          </div>
          <div className="container">
            <h2>Besoin de clarté pour avancer&nbsp;?</h2>
            <p>
              Prenons quelques minutes pour faire le point sur vos besoins et
              répondre à vos premières questions, sans engagement.
            </p>
            <Link href="/contact" className="btn btn-lime">
              Échanger avec nous
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      <CookieBanner />
    </>
  );
}
