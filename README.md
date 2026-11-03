# FONCIMO_API — Collecte de données de densification

Backend de données pour le défi **LAT / densification** (Foncimo), commune pilote **Pully (VD)**.

## Idée en une phrase

Un **script de collecte** récupère la donnée brute depuis les API officielles suisses,
la nettoie et la charge dans une **base de données** (Supabase / PostgreSQL). L'outil et
l'équipe lisent ensuite cette base pour **filtrer et scorer** les parcelles.

```
   Script de collecte  ──►  Base de données (Supabase)  ──►  Outil / Équipe
   (bouton + mensuel)       donnée brute + traçable          filtres + scoring
```

> ⚠️ Le script **ne filtre pas et ne score pas**. Il ne fait que collecter la donnée brute
> et la rendre propre et traçable (source + date). Les filtres (ex: « écarter note 1 à 3 »)
> sont appliqués plus tard, côté outil.

## Pourquoi une base et pas du « live » ?

- **Rapide** : l'outil lit une base, pas des dizaines d'appels API à chaque clic.
- **Filtrage sur toutes les parcelles d'un coup** (impossible en live).
- **Résistant** : marche même si une API est momentanément indisponible.
- **Traçable** : chaque ligne garde sa source et sa date de récolte.
- **Détection de changements** : on compare avec la collecte précédente.

Le seul inconvénient (donnée qui vieillit) est réglé par le **rafraîchissement** :
bouton « Actualiser » (manuel) + planification mensuelle (automatique).

## Structure

```
FONCIMO_API/
├── schema.sql              # structure de la base (à exécuter dans Supabase)
├── requirements.txt        # dépendances Python
├── .env.example            # variables d'environnement à copier en .env
└── collecte/
    ├── config.py           # paramètres (commune Pully, bbox, etc.)
    ├── db.py               # connexion + écriture dans la base
    ├── run.py              # orchestre une passe de collecte complète
    └── sources/
        └── geo_admin.py    # source RegBL (bâtiments) via api3.geo.admin.ch
```

## Démarrage

```bash
# 1. Dépendances
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# 2. Configurer la connexion à Supabase
copy .env.example .env         # Windows  (cp sous macOS/Linux)
# puis coller DATABASE_URL depuis Supabase > Project Settings > Database

# 3. Créer les tables dans Supabase
#    (coller le contenu de schema.sql dans Supabase > SQL Editor, OU :)
psql "$DATABASE_URL" -f schema.sql

# 4. Lancer une collecte
python -m collecte.run
```

## Accès à la base pour le site / les collègues

La base Supabase expose automatiquement une **API REST** (lecture seule
publique grâce à la RLS). Le site lit donc les données directement, sans
backend à coder.

- **URL du projet** : `https://gwwioyvhhtskoasvsigc.supabase.co`
- **Clé publishable** (sans danger côté front, lecture seule) :
  `sb_publishable_Jqhmk-U2e7av_XvIg1HLUQ_fRLbH6Cy`
- **Tables** : `parcelle`, `batiment`, `zone`, `collecte_run`, `changement`
  (jointure parcelle ↔ bâtiments via `egrid`).

### Client JavaScript (recommandé) — `npm install @supabase/supabase-js`

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://gwwioyvhhtskoasvsigc.supabase.co',
  'sb_publishable_Jqhmk-U2e7av_XvIg1HLUQ_fRLbH6Cy'
)

// Ex. : parcelles sous-densifiées et NON protégées
const { data } = await supabase
  .from('parcelle')
  .select('numero, surface_m2, taux_occupation_sol, zone_affectation, note_recensement')
  .lt('taux_occupation_sol', 0.1)   // peu bâti
  .gt('note_recensement', 3)         // note 4-7 = pas d'obstacle patrimonial
  .order('surface_m2', { ascending: false })
```

### REST direct (n'importe quel langage)

```bash
curl "https://gwwioyvhhtskoasvsigc.supabase.co/rest/v1/parcelle?select=*&taux_occupation_sol=lt.0.1" \
  -H "apikey: sb_publishable_Jqhmk-U2e7av_XvIg1HLUQ_fRLbH6Cy"
```

> La clé publishable ne permet **que la lecture** (RLS). Seul le script de
> collecte écrit, via la connexion Postgres privée (`.env`, jamais publiée).
> Aucune donnée privée dans la base (ni propriétaire ni prix).

## Sources de données

Voir le Google Sheet de l'équipe (inventaire des API). Principales :

| Donnée | Source | Statut |
|---|---|---|
| Bâtiments (RegBL) | `api3.geo.admin.ch` → `ch.bfs.gebaeude_wohnungs_register` | v1 ✅ |
| Parcelles / cadastre | `api3.geo.admin.ch` → cadastre / mensuration | à venir |
| Note recensement archi. (1–7) | geo.vd.ch / ASIT-VD | à venir |
| Zone d'affectation (PACom) | geo.vd.ch | à venir |
| Règlements (PDF) | communes | à venir (lecture par LLM) |

Hors périmètre : propriétaire et prix (Registre foncier, accès encadré).
