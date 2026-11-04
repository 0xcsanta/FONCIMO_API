"use client";

import { useState } from "react";

const items = [
  {
    quote:
      "Chez Business Broker SA, nous avons eu le plaisir de collaborer avec Dani Trillo sur plusieurs dossiers comprenant des biens immobiliers industriels et avons particulièrement apprécié son professionnalisme, sa réactivité et la qualité de son travail. Son approche rigoureuse et sa connaissance du marché en font un partenaire de confiance, avec qui les échanges sont toujours clairs et constructifs. Nous le recommandons sans hésitation.",
    author: "Loris Python",
    role: "Consultant M&A, Business Broker SA",
  },
  {
    quote:
      "Dani Trillo nous a tout de suite mis en confiance avec un discours clair, direct et transparent. La qualité de son travail, sa fiabilité et ses propositions de solutions sont exactement ce que nous recherchons d'un partenaire immobilier.",
    author: "Martial Decoppet",
    role: "Administrateur-délégué, Gonset Holding SA",
  },
  {
    quote:
      "Au cours de nos différentes collaborations, Dani a fait preuve d'un grand professionnalisme et d'une réactivité remarquable. Il prend le temps de bien comprendre les besoins de ses clients et y répond avec pertinence. Un partenaire de confiance, avec qui je recommande de travailler.",
    author: "Jean-Baptiste Rogasik",
    role: "Partner, L3M Partners SA",
  },
  {
    quote:
      "J'ai connu Dani Trillo à l'occasion de la direction des travaux d'un projet immobilier d'environ 60 logements, avant qu'il ne rejoigne notre société. J'ai toujours apprécié chez lui son sérieux, sa rigueur, son engagement et sa très bonne connaissance du terrain. Depuis l'obtention de son brevet d'estimateur, il a su compléter cette solide expérience pratique par une véritable compétence dans le domaine de l'expertise immobilière. C'est un professionnel fiable, pragmatique et attentif, avec qui il est agréable de travailler.",
    author: "Boris Clivaz",
    role: "Directeur, GEFISWISS SA",
  },
  {
    quote:
      "L'expérience acquise dans les domaines de la construction et de l'architecture, notamment durant plus de dix ans au sein du groupe CCHE, lui permet d'apporter une vision transversale pour accompagner les projets de développement immobilier. Sa qualité d'écoute et sa capacité à comprendre les attentes de ses clients est l'une de ses plus grandes forces. Attentif et engagé, il propose un accompagnement personnalisé et va au bout des choses, avec rigueur et détermination.",
    author: "Marco Cennini",
    role: "Associé administrateur, CCHE SA",
  },
  {
    quote:
      "La SCHL, coopérative centenaire leader dans le canton de Vaud, a pu s'appuyer sur les services de Foncimo SA. Cette collaboration lui a permis de renforcer sa présence sur le territoire vaudois afin d'offrir davantage de logements d'utilité publique et de loyers abordables à la population.",
    author: "Daniel Brülhart",
    role: "Directeur immobilier, Société Coopérative d'Habitation Lausanne (SCHL)",
  },
];

export default function Testimonials() {
  const [index, setIndex] = useState(0);
  const total = items.length;

  const go = (dir) => setIndex((i) => (i + dir + total) % total);
  const current = items[index];

  return (
    <section className="section testimonials">
      <div className="container">
        <span className="eyebrow">Témoignages</span>
        <div className="carousel">
          <blockquote className="carousel-quote">
            «&nbsp;{current.quote}&nbsp;»
          </blockquote>
          <div className="carousel-author">{current.author}</div>
          <div className="carousel-role">{current.role}</div>

          <div className="carousel-controls">
            <button
              className="carousel-btn"
              aria-label="Précédent"
              onClick={() => go(-1)}
            >
              ‹
            </button>
            <div className="carousel-dots">
              {items.map((_, i) => (
                <button
                  key={i}
                  className={`dot ${i === index ? "active" : ""}`}
                  aria-label={`Témoignage ${i + 1}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button
              className="carousel-btn"
              aria-label="Suivant"
              onClick={() => go(1)}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
