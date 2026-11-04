# Dictionnaire des nouvelles variables — base Foncimo (parcelles de Pully)

Ce document décrit les **variables ajoutées récemment** à la table `parcelle`.
Pour chacune : **nom exact de la colonne**, type, ce qu'elle contient, d'où elle
vient, sa couverture actuelle et comment l'utiliser pour repérer un potentiel de
densification.

> Rappel : chaque ligne de `parcelle` = une parcelle, identifiée par `egrid`.
> Les bâtiments sont dans la table `batiment` (liés par `egrid`).
> Couverture indiquée sur **2 660 parcelles** (toute la commune de Pully).

---

## 🧭 Le modèle mental : « existant » vs « plafond légal »

La clé de l'analyse, c'est de comparer **ce qui est déjà construit** à **ce que
le règlement autorise**. L'écart = le potentiel.

| | Variables « existant » | Variables « plafond légal » |
|---|---|---|
| Emprise au sol | `taux_occupation_sol`, `emprise_batie_m2` | `indice_utilisation`, `surface_constructible_m2` |
| Hauteur / niveaux | `batiment.nb_etages` (étages actuels) | `hauteur_max_m`, `niveaux_max` |

**Potentiel de densification** = `surface_constructible_m2 − emprise_batie_m2`
(au sol) et `niveaux_max − batiment.nb_etages` (en surélévation).

---

## 1. Restrictions RDPPF / OEREB
*Source : webservice cadastre RDPPF du canton de Vaud (`rdppf.vd.ch`), par parcelle.*

Ce sont les restrictions de droit public qui pèsent officiellement sur la parcelle.

### `en_zone_reservee` — `boolean`
La parcelle est touchée par une **zone réservée** (`ch.Planungszonen`) : un **gel
temporaire** des constructions décidé par la commune en attendant la révision de
son plan d'affectation.
- **`true` = frein majeur à court terme** : on ne peut en principe pas y densifier tant que le gel dure.
- Couverture : **2 364 / 2 660** renseignées (finalisation en cours → ~94 %), dont **1 697 en zone réservée** (`true`).
- Usage : écarter (ou signaler) les parcelles `en_zone_reservee = true`.

### `affectation_detaillee` — `text`
Le **libellé précis de l'affectation** selon le plan communal — plus fin que
`zone_affectation`. Ex. : `zone de moyenne densité`, `zone de villas`.
- Source : extrait RDPPF (`ch.Nutzungsplanung`), legende couvrant la plus grande part de la parcelle.
- Couverture : **2 350 / 2 660**.
- Usage : c'est ce champ qui détermine la catégorie de densité (et donc les plafonds ci-dessous).

### `degre_bruit` — `text`
**Degré de sensibilité au bruit** (OPB), de `DS I` à `DS IV`.
- Source : RDPPF (`ch.Laermempfindlichkeitsstufen`).
- Couverture : **2 024 / 2 660**.
- Usage : contrainte environnementale (le logement exige en général DS II ou III).

### `limite_construction` — `boolean`
Présence d'une **limite / alignement de construction** (Baulinien) sur la parcelle.
- `true` = un alignement est à respecter (recul obligatoire → surface vraiment bâtissable réduite).
- Source : RDPPF (Baulinien).
- Couverture : **2 364 / 2 660** renseignées.

### `surface_rf_m2` — `numeric`
**Surface officielle au Registre foncier** (champ `LandRegistryArea` de l'extrait).
- Permet de **recouper** avec `surface_m2` (elle, calculée à partir de la géométrie cadastrale).
- Source : RDPPF.
- Couverture : **2 067 / 2 660**.

### `restrictions` — `jsonb`
**Toutes les restrictions RDPPF brutes** de la parcelle, sous forme de liste
d'objets (thème, texte de légende, pourcentage de surface concernée).
- C'est l'**archive complète** : si un jour vous voulez filtrer sur un thème qu'on n'a pas encore extrait en colonne dédiée, tout est là.
- Source : RDPPF. Couverture : idem `en_zone_reservee`.

---

## 2. Patrimoine (canton de Vaud)
*Source : WMS cantonal `geo.vd.ch` (GetFeatureInfo au centroïde de la parcelle).*

Trois freins patrimoniaux potentiels. Couverture **100 % (2 660 / 2 660)** —
toutes les parcelles ont été testées.

### `en_zone_archeologique` — `boolean`
La parcelle intersecte une **région archéologique** (art. 40 LPrPCI) → des
**fouilles** peuvent être exigées avant travaux.
- `true` pour **138** parcelles.
- Source : `vd.region_archeologique`.

### `zone_archeologique` — `text`
Le **numéro de la région archéologique** (ex. `127/301`) quand il y en a une
(`NULL` sinon).
- Source : idem. Renseigné pour les 138 parcelles concernées.

### `jardin_historique` — `text`
**Nom du jardin historique recensé** (ou `oui` si recensé sans nom), `NULL` sinon.
Frein patrimonial sur les aménagements extérieurs.
- **88** parcelles concernées.
- Source : `vd.jardin_historique`.
- ⚠️ À ne pas confondre avec la **note de recensement du bâtiment** (`batiment.note_recensement` / `parcelle.note_recensement`) : ici il s'agit du **jardin**, pas de la maison.

### `site_protege` — `text`
**Nom du site construit protégé** (ensemble bâti remarquable), ou `oui`, `NULL` sinon.
- **288** parcelles concernées.
- Source : `vd.site`.

---

## 3. Terrain

### `pente_pct` — `numeric`
**Pente moyenne du terrain, en %**, calculée autour du centroïde de la parcelle
(4 points N/S/E/O à ±25 m sur le modèle numérique d'altitude swisstopo).
- Couverture : **100 % (2 660 / 2 660)**.
- Source : `geo.admin.ch`, service `height`.
- Usage : un terrain très pentu renchérit/complique la construction (ex. filtrer `pente_pct > 30`).

---

## 4. Plafonds légaux de constructibilité (règlement de Pully — RCATC)
*Source : règlement communal (RCATC, en vigueur le 03.11.2017), appliqué par zone.*

Ce sont les réponses à « **combien a-t-on le droit de construire ?** ». Ils ne
sont posés **que sur les parcelles à bâtir** (celles ayant une `zone_affectation`).

### `indice_utilisation` — `numeric`
**Indice d'occupation du sol maximal = 0.20** (20 %) dans toutes les zones à
bâtir de Pully (Art. 10 RCATC).
- Couverture : **2 254 / 2 660** (= les parcelles à bâtir).

### `surface_constructible_m2` — `numeric`
**Emprise au sol maximale autorisée** = `indice_utilisation × surface_m2`.
- Dérivée (calcul). Couverture : **2 254 / 2 660**. Moyenne ≈ **260 m²**.
- Usage clé : `surface_constructible_m2 − emprise_batie_m2` = marge au sol encore disponible.

### `hauteur_max_m` — `numeric`
**Hauteur au faîte maximale**, selon la densité de la zone (Art. 37 / 39 RCATC) :
faible densité **12 m**, moyenne **15 m**, forte **18 m**, villas **10 m**.
- Couverture : **1 605 / 2 660** (les parcelles dont l'affectation correspond à une des catégories de densité).

### `niveaux_max` — `smallint`
**Nombre de niveaux hors-sol maximal**, selon la densité : faible **3**,
moyenne **4**, forte **5**, villas **3**.
- Couverture : **1 605 / 2 660**.
- Usage clé : `niveaux_max − batiment.nb_etages` = **potentiel de surélévation** (nombre d'étages qu'on pourrait encore ajouter).

---

## 🔎 Exemple : repérer les parcelles à fort potentiel

```sql
select numero, surface_m2, taux_occupation_sol,
       surface_constructible_m2, emprise_batie_m2,
       affectation_detaillee, niveaux_max
from parcelle
where zone_affectation is not null       -- parcelle à bâtir
  and taux_occupation_sol < 0.10         -- très peu bâtie aujourd'hui
  and en_zone_reservee is not true       -- pas gelée
  and jardin_historique is null          -- pas de jardin historique
  and site_protege is null               -- pas en site protégé
  and (note_recensement is null or note_recensement > 3)  -- pas de bâtiment protégé (note 1-3)
order by surface_constructible_m2 desc;
```

Chaque filtre reste **optionnel et réversible** : la base contient **toutes** les
données brutes, les critères se posent côté lecture.
