# Calcul du potentiel d'une parcelle — les 3 stratégies

Document de référence pour comprendre comment l'outil note le potentiel d'une
parcelle (commune de **Pully**). Il explique les **3 fonctions de scoring**, les
**formules**, et **d'où vient chaque chiffre** dans la base Supabase.

- Code de référence : `outil-parcelle/serveur.mjs` (version locale) et
  `supabase/functions/analyse/index.ts` (version en ligne / site `/tool`). Les deux
  utilisent exactement la même logique.
- Données : tables `parcelle` et `batiment` (reliées par `egrid`), + fonction
  `get_parcelle_data` qui agrège le tout.

---

## 1. Le principe

Un propriétaire rationnel choisit, pour densifier/valoriser son bien, **la meilleure
des 3 voies possibles**. On calcule donc **3 scores indépendants** :

1. **Agrandissement au sol** — étendre l'emprise du bâtiment existant.
2. **Surélévation** — ajouter des étages sur l'emprise existante.
3. **Démolition-reconstruction** — raser et rebâtir au maximum du droit (sur une
   parcelle nue, c'est simplement de la **construction neuve**).

> **Note finale affichée = la meilleure des trois.** Chaque note est sur **/10**.

Chaque stratégie est une **somme pondérée de facteurs** (12 à 13 facteurs selon la
stratégie). La grille de poids est modifiable dans l'outil ; les valeurs par défaut
sont données plus bas.

---

## 2. Les quantités de départ (communes aux 3)

Calculées une fois par parcelle à partir de la base :

| Symbole | Définition | Colonne(s) source |
|---|---|---|
| `S` | surface de la parcelle (m²) | `parcelle.surface_m2` |
| `Fmax` | emprise au sol **max autorisée** (IOS 0,20 × S) | `parcelle.surface_constructible_m2` |
| `Fexist` | emprise bâtie **actuelle** (m²) | `parcelle.emprise_batie_m2` |
| `Nmax` | nombre de niveaux **max** autorisés | `parcelle.niveaux_max` |
| `Nact` | étages **actuels** (bâtiment le plus haut) | `max(batiment.nb_etages)` |
| `SPexist` | surface de plancher **existante** = Σ(emprise × étages) | `Σ(batiment.surface_sol_m2 × nb_etages)` |
| `SPmax` | surface de plancher **max** = `Fmax × Nmax` | dérivé |
| `annee` | année de construction (la plus ancienne) | `min(batiment.annee_construction)` |
| `rec` | note de recensement patrimonial (1 = très protégé … 7) | `parcelle.note_recensement` |

**Gain de surface de plancher (`ΔSP`)** — c'est le moteur de chaque stratégie :

| Stratégie | Gain `ΔSP` | Explication |
|---|---|---|
| Agrandissement | `ΔF × Nref` | `ΔF = max(0, Fmax − Fexist)` (emprise encore dispo), `Nref` = hauteur de l'annexe (étages actuels, borné 1..Nmax) |
| Surélévation | `Fexist × ΔN` | `ΔN = max(0, Nmax − Nact)` (niveaux ajoutables) |
| Démolition / neuf | `max(0, SPmax − SPexist)` | tout l'écart entre l'enveloppe max et l'existant |

---

## 3. La formule d'une stratégie

```
score_strategie = ( Σ  poids_facteur × note_facteur )  /  ( Σ poids_facteur )  × 100
```

- `note_facteur` ∈ [0 ; 1] (affichée sur /10 dans l'outil).
- Le score est **normalisé** par la somme des poids → on peut changer les poids
  librement, pas besoin qu'ils fassent exactement 100.
- Puis **gel** éventuel (voir §6), puis affichage sur **/10**.

Beaucoup de facteurs utilisent une **courbe de saturation** pour convertir des m² en
note :

```
sat(x) = 1 − e^(−x / 300)      // ~300 m² de plancher = déjà une bonne note
```

---

## 4. Les poids par défaut (grille de référence)

| Facteur | Agrandissement | Surélévation | Démolition |
|---|---:|---:|---:|
| **G** Gain net de surface | 20 % | 18 % | 23 % |
| **E** Efficacité des surfaces | 8 % | 8 % | 8 % |
| **P** Marge de pleine terre | 8 % | — | 5 % |
| **I** Intégration au bâti conservé | 10 % | — | — |
| **S** Structure | — | 15 % | — |
| **F** Fondations existantes | — | 10 % | — |
| **T** Transformation de toiture | — | 8 % | — |
| **L** Sol et terrain | 8 % | — | 8 % |
| **C** Conditions de chantier | 6 % | 6 % | 6 % |
| **N** Adaptations normatives | 8 % | 8 % | — |
| **O** Limitation des perturbations | 5 % | 5 % | 5 % |
| **V** Création de valeur comparative | 18 % | 14 % | 13 % |
| **R** Robustesse économique | 4 % | 3 % | 4 % |
| **B** Performance carbone | 2 % | 2 % | 4 % |
| **A** Ancienneté | 3 % | 3 % | 2 % |
| **D** Besoin de renouvellement | — | — | 8 % |
| **X** Déconstruction | — | — | 8 % |
| **Y** Polluants | — | — | 6 % |
| **Total** | 100 % | 100 % | 100 % |

Ces poids sont **modifiables en direct** dans l'outil (le score se recalcule).

---

## 5. Comment chaque facteur est noté (0 à 10)

Pour chaque facteur : la logique, et la **colonne de base** utilisée. Plusieurs
facteurs sont des **proxys** ou des **hypothèses** (faute de données de plan), c'est
signalé.

| Code | Facteur | Comment on le note | Source / statut |
|---|---|---|---|
| **G** | Gain net de surface | `sat(ΔSP)` : plus le gain de plancher est grand, plus la note monte (saturation à ~300 m²) | surf. constructible, emprise, niveaux, étages — **données réelles** |
| **V** | Création de valeur | `attractivité_zone × sat(ΔSP)` : gros gain **dans une bonne zone** | affectation + ΔSP — **données réelles** |
| **A** | Ancienneté | agr./surélév. : **récent = mieux** · démo. : **vieux = mieux** | `annee_construction` — **données réelles** |
| **L** | Sol et terrain | pente faible = mieux ; zone archéologique = pénalité | `pente_pct`, `en_zone_archeologique` — **données réelles** |
| **S** | Structure | bâti récent porte mieux des étages en plus | `annee_construction` — **proxy** |
| **F** | Fondations existantes | comme Structure, moins si déjà beaucoup d'étages | `annee`, `nb_etages` — **proxy** |
| **T** | Transformation de toiture | possible si `Nmax > Nact` et bâtiment non protégé | `niveaux_max`, `nb_etages`, `recensement` — **proxy** |
| **I** | Intégration au bâti conservé | plus le bâti est protégé, plus une annexe est difficile | `note_recensement`, `limite_construction` — **données réelles** |
| **N** | Adaptations normatives | bâti ancien = plus de mises aux normes = note plus basse | `annee_construction` — **proxy** |
| **O** | Limitation des perturbations | agr. 0,9 / surélév. 0,6 / démo. 0,3 ; bonus si aucun logement occupé | stratégie + `nb_logements` — **règle** |
| **P** | Marge de pleine terre | part de terrain qui reste non bâti après projet (IOS 0,20 → ~80 % libre) | `surface`, `surface_constructible` — **données réelles** |
| **C** | Conditions de chantier | pente, taille de parcelle, accès (zone centrale plus contrainte) | `pente`, `surface`, affectation — **proxy** |
| **R** | Robustesse économique | résilience selon l'attractivité de la zone | affectation — **proxy** |
| **B** | Performance carbone | réemploi (agr./surélév.) mieux noté que démolition | stratégie + `annee` — **proxy** |
| **D** | Besoin de renouvellement *(démo.)* | sous-utilisation des droits + vétusté | `SPexist` vs `SPmax`, `annee` — **données réelles** |
| **X** | Déconstruction *(démo.)* | plus le bâtiment est petit/simple, plus c'est facile | `SPexist` — **données réelles** |
| **Y** | Polluants *(démo.)* | risque amiante : bâti **avant 1991** pénalisé | `annee_construction` — **données réelles** |
| **E** | Efficacité des surfaces | note fixe (~0,7-0,8) selon la stratégie | **hypothèse** (pas de données de plan) |

### Barèmes des sous-fonctions

```
ancienneté "récent" (agr./surélév.) :  ≥2000 →1,0 · ≥1980 →0,8 · ≥1960 →0,6 · ≥1940 →0,45 · sinon 0,3
ancienneté "vieux"  (démolition)    :  <1940 →1,0 · <1970 →0,8 · <2000 →0,5 · sinon 0,25
structure (par année)               :  ≥1990 →0,8 · ≥1970 →0,65 · ≥1950 →0,45 · sinon 0,3
pente                               :  ≤5% →1,0 · ≤15% →0,9 · ≤30% →0,7 · ≤45% →0,45 · sinon 0,25
attractivité de zone                :  forte →1,0 · moyenne →0,85 · faible →0,65 · centrale →0,9 · autre →0,55
polluants (amiante)                 :  ≥1991 →0,9 · 1960-1990 →0,4 · <1960 →0,55
recensement (facteur I)             :  1-2 →0,25 · 3 →0,45 · 4 →0,7 · aucun →0,9
```

---

## 6. Règles spéciales (prioritaires)

1. **Hors périmètre.** Zone de verdure, besoins publics, agricole, forêt, parc,
   sport… ou absence d'indice → la parcelle **n'est pas densifiable** pour du
   logement : l'outil affiche *« Hors périmètre de densification »* (pas de note).

2. **Zone réservée (gel).** Si la parcelle est en **zone réservée**
   (`en_zone_reservee = true`), les 3 scores sont **multipliés par 0,6** (gel
   temporaire des constructions décidé par la commune). Un bouton permet de voir le
   potentiel **« hors gel »** (× 1).

3. **Bâtiment protégé → note 0.** Si `note_recensement` est **entre 1 et 3**
   (bâtiment classé), **toutes les stratégies sont mises à 0** : on ne peut ni
   démolir ni transformer de façon significative. L'outil affiche *« Bâtiment
   protégé (recensement X) — potentiel nul »*.

---

## 7. Les réglages (où modifier)

En haut du fichier de scoring :

```js
const LAMBDA = 300;      // m² de plancher = "impressionnant" (plus bas = notes plus hautes)
const GEL_MULT = 0.6;    // poids du gel zone réservée (1 = ignorer le gel)
const POIDS = { ... };   // la grille de poids par défaut
```

Chaque **note de facteur** est une petite fonction dans l'objet `RF` (ex. `RF.Y` =
amiante, `RF.S` = structure). Les **poids** sont aussi modifiables en direct dans
l'interface de l'outil.

---

## 8. Exemples réels (poids par défaut, gel appliqué)

| Parcelle | Contexte | Agrand. | Surélév. | Démo./neuf | **Note** | Voie |
|---|---|---:|---:|---:|---:|---|
| 365 | forte densité, **nue** | 7,9 | 4,5 | **8,9** | **8,9** | Construction neuve |
| 118 | moyenne densité, **nue** | 7,1 | 4,4 | **8,6** | **8,6** | Construction neuve |
| 3676 | moyenne, bâtie, **gelée** | 4,7 | 2,9 | **5,0** | **5,0** | Démolition |
| 3551 | faible, bâtie, **gelée** | **4,4** | 3,5 | 4,4 | **4,4** | Agrandissement |
| 116 | zone centrale, **recensement 3** | 0 | 0 | 0 | **0** | Bâtiment protégé |
| 701 | zone de verdure | — | — | — | — | Hors périmètre |

---

## 9. Limites connues (honnêtes)

- Les plafonds légaux (`indice_utilisation`, `niveaux_max`, `hauteur_max_m`) viennent
  du règlement de Pully (RCATC) appliqué par zone ; ils ne reflètent pas d'éventuelles
  dérogations au cas par cas.
- La hauteur **en mètres** des bâtiments existants n'est pas en base : la surélévation
  se calcule en **étages** (`nb_etages`), pas en mètres.
- Les facteurs marqués *proxy / hypothèse* devront être affinés avec des données
  complémentaires (plans, diagnostics structure, diagnostic amiante…).
- La note est un **indicateur automatique**, pas une étude de faisabilité : elle sert
  à **prioriser**, pas à décider.
