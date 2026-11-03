-- =====================================================================
--  POC Densification Foncimo — Schéma de la base (PostgreSQL / Supabase)
--  Commune pilote : Pully (VD)
--
--  Rôle de la base : stocker la DONNÉE BRUTE récoltée par le script de
--  collecte. Aucun filtre, aucun scoring ici : ça, c'est le travail de
--  l'outil et de l'équipe qui lisent cette base ensuite.
--
--  Clés de jointure :
--    - EGRID = identifiant fédéral unique d'une PARCELLE
--    - EGID  = identifiant fédéral unique d'un BÂTIMENT
--  Un bâtiment est rattaché à une parcelle via l'EGRID.
-- =====================================================================

-- PostGIS : utile si on veut stocker la géométrie des parcelles (LV95,
-- EPSG:2056). Optionnel pour la v1 — on peut afficher la carte via les
-- tuiles officielles et ne surligner que par EGRID.
create extension if not exists postgis;


-- ---------------------------------------------------------------------
-- 1) PARCELLE  — une ligne par parcelle
-- ---------------------------------------------------------------------
create table if not exists parcelle (
  egrid              text primary key,              -- id fédéral unique de la parcelle
  numero             text,                          -- numéro cadastral local (LPARZ)
  commune            text,
  no_commune         integer,                       -- n° OFS de la commune (GGDENR)
  canton             text default 'VD',

  surface_m2         numeric,                        -- surface de la parcelle
  zone_affectation   text,                           -- libellé de la zone (PACom)
  note_recensement   smallint,                       -- recensement architectural 1-7 (NULL si aucune)
  pente_pct          numeric,                        -- pente moyenne du terrain, en %

  -- Potentiel de densification (donnée brute, PAS un filtre/score) :
  taux_occupation_sol      numeric,                  -- emprise bâtie / surface parcelle
  indice_utilisation       numeric,                  -- indice d'utilisation autorisé (zone/règlement)
  surface_constructible_m2 numeric,                  -- surface de plancher autorisée (si calculable)
  restrictions             jsonb,                    -- restrictions diverses (OEREB, ISOS, zone réservée…)
  protege                  boolean,                  -- repère rapide : sous protection oui/non

  geom               geometry(MultiPolygon, 2056),   -- géométrie LV95 (optionnel)

  -- traçabilité (demandée par le cahier des charges : source + date)
  source             text,                           -- ex: 'api3.geo.admin.ch / cadastre'
  recolte_le         timestamptz default now()       -- quand cette ligne a été récoltée/mise à jour
);

comment on table parcelle is 'Donnée brute par parcelle. Pas de filtre/scoring ici.';


-- ---------------------------------------------------------------------
-- 2) BATIMENT  — une ligne par bâtiment (source RegBL), rattaché à une parcelle
-- ---------------------------------------------------------------------
create table if not exists batiment (
  egid                 bigint primary key,            -- id fédéral unique du bâtiment
  -- Lien logique vers la parcelle (via EGRID). Pas de clé étrangère stricte :
  -- les sources arrivent indépendamment (les bâtiments peuvent être récoltés
  -- avant les parcelles), donc on ne veut pas bloquer l'insertion.
  egrid                text,
  numero_parcelle      text,                           -- LPARZ (n° de parcelle local)
  no_commune           integer,                        -- GGDENR (n° OFS commune)
  commune              text,                           -- GGDENAME
  canton               text,                           -- GDEKT

  adresse              text,                           -- STRNAME + DEINR
  npa                  text,                           -- PLZ_PLZ6

  statut               smallint,                       -- GSTAT  (ex: 1004 = existant)
  categorie            smallint,                       -- GKAT   (type de bâtiment)
  classe               smallint,                       -- GKLAS

  annee_construction   integer,                        -- GBAUJ
  periode_construction text,                            -- GBAUP (si l'année exacte manque)
  annee_demolition     integer,                        -- GABBJ

  nb_etages            smallint,                        -- GASTW
  hauteur_m            numeric,                          -- hauteur réelle (via mensuration MO, si dispo)
  nb_logements         smallint,                        -- GANZWHG

  surface_sol_m2       numeric,                         -- GAREA (emprise au sol)
  volume_m3            numeric,                         -- GVOL
  surface_ref_energie  numeric,                         -- GEBF

  chauffage            smallint,                        -- GWAERZH1
  agent_energetique    smallint,                        -- GENH1

  coord_e              numeric,                         -- GKODE (E, LV95)
  coord_n              numeric,                         -- GKODN (N, LV95)

  source               text,
  recolte_le           timestamptz default now()
);

comment on table batiment is 'Donnée brute RegBL par bâtiment. Rattaché à parcelle via EGRID.';

create index if not exists idx_batiment_egrid on batiment(egrid);


-- ---------------------------------------------------------------------
-- 3) COLLECTE_RUN  — journal de chaque passage du script (traçabilité)
--    Répond à : quand ? déclenché comment ? combien de lignes ? OK ou erreur ?
-- ---------------------------------------------------------------------
create table if not exists collecte_run (
  id             bigserial primary key,
  demarre_le     timestamptz default now(),
  termine_le     timestamptz,
  declencheur    text,          -- 'bouton' | 'planif'
  statut         text,          -- 'en_cours' | 'ok' | 'erreur'
  nb_parcelles   integer,
  nb_batiments   integer,
  message        text           -- détail / erreur éventuelle
);


-- ---------------------------------------------------------------------
-- 4) CHANGEMENT  — détection de changements entre deux collectes
--    Le script compare la nouvelle valeur à l'ancienne ; si ça bouge,
--    il écrit une ligne ici (ex: une parcelle change de zone).
-- ---------------------------------------------------------------------
create table if not exists changement (
  id             bigserial primary key,
  run_id         bigint references collecte_run(id) on delete cascade,
  entite         text,          -- 'parcelle' | 'batiment'
  cle            text,          -- l'EGRID ou l'EGID concerné
  champ          text,          -- quel champ a changé (ex: 'zone_affectation')
  ancienne_val   text,
  nouvelle_val   text,
  detecte_le     timestamptz default now()
);

create index if not exists idx_changement_run on changement(run_id);
