"""Accès à la base (Supabase / PostgreSQL).

Ce module isole TOUT le SQL. Le reste du code manipule des dictionnaires
Python et ne sait pas comment la base est faite — plus simple à faire évoluer.

On utilise des "upserts" groupés : si le bâtiment existe déjà (même EGID), on
met à jour ; sinon on insère. Relancer la collecte ne crée donc pas de
doublons — c'est exactement ce qu'il faut pour un rafraîchissement.

Pour aller vite sur une base distante, on fait tout par lots (execute_values)
et on ne lit qu'UNE fois l'état existant pour détecter les changements.
"""
import psycopg2
import psycopg2.extras

from . import config

# Colonnes écrites pour un bâtiment (recolte_le est géré à part via now()).
COLS_BAT = [
    "egid", "egrid", "numero_parcelle", "no_commune", "commune", "canton",
    "adresse", "npa", "statut", "categorie", "classe",
    "annee_construction", "periode_construction", "annee_demolition",
    "nb_etages", "nb_logements", "surface_sol_m2", "volume_m3",
    "surface_ref_energie", "chauffage", "agent_energetique",
    "coord_e", "coord_n", "source",
]

# Champs qu'on surveille pour la détection de changements (veille mensuelle).
CHAMPS_SUIVIS = ("annee_construction", "nb_logements", "nb_etages", "statut")

# Colonnes écrites pour une parcelle (geom et recolte_le gérés à part).
COLS_PARC = ["egrid", "numero", "commune", "no_commune", "canton", "surface_m2", "source"]


def get_conn():
    """Ouvre une connexion à la base. DATABASE_URL vient de .env."""
    if not config.DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL manquant. Colle la connection string de ton projet "
            "Supabase dans le fichier .env."
        )
    return psycopg2.connect(config.DATABASE_URL)


# ---------------------------------------------------------------------
# Journal des collectes
# ---------------------------------------------------------------------
def start_run(conn, declencheur):
    """Ouvre une ligne dans collecte_run et renvoie son id."""
    with conn.cursor() as cur:
        cur.execute(
            "insert into collecte_run (declencheur, statut) "
            "values (%s, 'en_cours') returning id",
            (declencheur,),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return run_id


def end_run(conn, run_id, statut, nb_parcelles, nb_batiments, message=None):
    """Clôture la ligne de collecte avec le bilan."""
    with conn.cursor() as cur:
        cur.execute(
            "update collecte_run set termine_le = now(), statut = %s, "
            "nb_parcelles = %s, nb_batiments = %s, message = %s where id = %s",
            (statut, nb_parcelles, nb_batiments, message, run_id),
        )
    conn.commit()


# ---------------------------------------------------------------------
# Upsert groupé des bâtiments
# ---------------------------------------------------------------------
def upsert_batiments(conn, batiments, run_id=None):
    """Insère ou met à jour une liste de bâtiments (dicts), par lots.

    1) on lit en une fois l'état actuel des bâtiments concernés ;
    2) on compare quelques champs clés -> journal des changements ;
    3) on fait l'upsert groupé.
    """
    if not batiments:
        return 0

    egids = [b["egid"] for b in batiments]

    # 1) état existant (une seule requête)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("select * from batiment where egid = any(%s)", (egids,))
        existants = {r["egid"]: r for r in cur.fetchall()}

    # 2) détection des changements
    changements = []
    for b in batiments:
        avant = existants.get(b["egid"])
        if avant is None:
            continue
        for champ in CHAMPS_SUIVIS:
            if str(avant.get(champ)) != str(b.get(champ)):
                changements.append((
                    run_id, "batiment", str(b["egid"]), champ,
                    _s(avant.get(champ)), _s(b.get(champ)),
                ))

    # 3) upsert groupé
    set_clause = ", ".join(
        f"{c}=excluded.{c}" for c in COLS_BAT if c != "egid"
    ) + ", recolte_le=now()"
    valeurs = [[b.get(c) for c in COLS_BAT] for b in batiments]
    template = "(" + ", ".join(["%s"] * len(COLS_BAT)) + ", now())"

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            f"insert into batiment ({', '.join(COLS_BAT)}, recolte_le) "
            f"values %s on conflict (egid) do update set {set_clause}",
            valeurs,
            template=template,
            page_size=1000,
        )
        if changements:
            psycopg2.extras.execute_values(
                cur,
                "insert into changement "
                "(run_id, entite, cle, champ, ancienne_val, nouvelle_val) values %s",
                changements,
                page_size=500,
            )
    conn.commit()
    return len(batiments)


def upsert_parcelles(conn, parcelles, run_id=None):
    """Insère ou met à jour les parcelles (dicts), par lots, avec géométrie.

    La géométrie est forcée en MultiPolygon valide via
    ST_Multi(ST_CollectionExtract(ST_MakeValid(...), 3)) pour éviter tout
    rejet dû à une géométrie auto-intersectante.
    """
    if not parcelles:
        return 0

    set_clause = ", ".join(
        f"{c}=excluded.{c}" for c in COLS_PARC if c != "egrid"
    ) + ", geom=excluded.geom, recolte_le=now()"

    valeurs = [[p.get(c) for c in COLS_PARC] + [p.get("wkt")] for p in parcelles]
    template = (
        "(" + ", ".join(["%s"] * len(COLS_PARC)) + ", "
        "ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(%s, 2056)), 3)), now())"
    )

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            f"insert into parcelle ({', '.join(COLS_PARC)}, geom, recolte_le) "
            f"values %s on conflict (egrid) do update set {set_clause}",
            valeurs,
            template=template,
            page_size=500,
        )
    conn.commit()
    return len(parcelles)


def recompute_taux_occupation(conn):
    """Recalcule le taux d'occupation du sol de chaque parcelle.

    taux = emprise bâtie totale (somme des surfaces au sol des bâtiments
    de la parcelle) / surface de la parcelle. C'est une donnée factuelle
    (un simple ratio), pas un score : l'écart à 1 indique le potentiel brut.
    """
    with conn.cursor() as cur:
        cur.execute("""
            update parcelle p
            set taux_occupation_sol = round((sub.emprise / p.surface_m2)::numeric, 3)
            from (select egrid, sum(surface_sol_m2) as emprise
                  from batiment where egrid is not null group by egrid) sub
            where p.egrid = sub.egrid
              and p.surface_m2 is not null and p.surface_m2 > 0
        """)
    conn.commit()


# ---------------------------------------------------------------------
# Zones d'affectation
# ---------------------------------------------------------------------
def upsert_zones(conn, zones):
    """Recharge la table des zones et renvoie le nombre de zones."""
    if not zones:
        return 0
    with conn.cursor() as cur:
        cur.execute("truncate table zone")
        for z in zones:
            cur.execute(
                "insert into zone (code_zone, libelle, bfs_no, source, geom) "
                "values (%s, %s, %s, %s, "
                "ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_GeomFromText(%s, 2056)), 3)))",
                (z["code_zone"], z["libelle"], z["bfs_no"], z["source"], z["wkt"]),
            )
    conn.commit()
    return len(zones)


def assign_zone_to_parcelle(conn):
    """Rattache chaque parcelle à sa zone (centroïde dans le polygone)."""
    with conn.cursor() as cur:
        cur.execute("""
            update parcelle p
            set zone_affectation = z.libelle
            from zone z
            where z.geom && ST_Centroid(p.geom)
              and ST_Intersects(z.geom, ST_Centroid(p.geom))
        """)
    conn.commit()


# ---------------------------------------------------------------------
# Note de recensement architectural
# ---------------------------------------------------------------------
def update_notes_batiment(conn, notes):
    """notes : {egid: {note, mesure_protection, num_eca, lien_fiche}}."""
    if not notes:
        return 0
    with conn.cursor() as cur:
        for egid, info in notes.items():
            cur.execute(
                "update batiment set note_recensement=%s, mesure_protection=%s, "
                "num_eca=%s, lien_fiche=%s where egid=%s",
                (info.get("note"), info.get("mesure_protection"),
                 info.get("num_eca"), info.get("lien_fiche"), egid),
            )
    conn.commit()
    return len(notes)


def recompute_note_parcelle(conn):
    """Note de la parcelle = note la plus protectrice (min) de ses bâtiments."""
    with conn.cursor() as cur:
        cur.execute("""
            update parcelle p
            set note_recensement = sub.note_min
            from (select egrid, min(note_recensement) as note_min
                  from batiment
                  where egrid is not null and note_recensement is not null
                  group by egrid) sub
            where p.egrid = sub.egrid
        """)
    conn.commit()


def _s(v):
    """None reste NULL ; sinon on stocke la valeur en texte."""
    return None if v is None else str(v)
