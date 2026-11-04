# Foncimo - site vitrine (reproduction)

Reproduction fidèle du site [foncimo.ch](https://www.foncimo.ch/) en **Next.js 14 (App Router) + React 18**.

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:3000

## Structure

```
app/
  layout.jsx        # police Kanit + metadata
  globals.css       # design tokens (vert #2A3C37, lime #D3DE79) + styles
  page.jsx          # page d'accueil (hero, services, engagement, clients, témoignages, CTA)
  contact/          # page contact + formulaire
  pilotage-de-projet-immobilier/
  expertise-immobiliere/
  societe/
components/
  Header.jsx        # nav + menu mobile
  Footer.jsx
  Testimonials.jsx  # carrousel (client component)
  CookieBanner.jsx  # bannière cookies (localStorage)
```

## Notes

- Police : **Kanit** (Google Fonts, chargée via `next/font`).
- Photos : images libres de droits (Unsplash), à remplacer par les visuels définitifs.
- Contenu textuel repris du site Foncimo ; logos clients rendus en texte (placeholders).
