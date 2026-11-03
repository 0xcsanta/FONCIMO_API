"""Orchestrateur : lance une passe de collecte complète.

C'est CE fichier que déclenchent le bouton « Actualiser » et la planification
mensuelle. Les deux font la même chose ; seul le "déclencheur" change (pour la
traçabilité dans le journal).

Usage :
    python -m collecte.run            # déclencheur = bouton (manuel)
    python -m collecte.run planif     # déclencheur = planif (automatique)
"""
import sys

from . import db, config
from .sources import geo_admin

# Windows : forcer l'UTF-8 sur la sortie pour éviter les erreurs d'encodage.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def main(declencheur="bouton"):
    print(f"Collecte Foncimo — commune : {config.COMMUNE} — déclencheur : {declencheur}")
    conn = db.get_conn()
    run_id = db.start_run(conn, declencheur)
    print(f"Run #{run_id} démarré.")

    try:
        # --- 1. Bâtiments (RegBL) ---
        print("-> Recuperation des batiments (RegBL)...")
        batiments = geo_admin.fetch_batiments()
        nb_bat = db.upsert_batiments(conn, batiments, run_id=run_id)
        print(f"  {nb_bat} bâtiments chargés.")

        # --- 2. Parcelles / recensement / zones : à ajouter ici ---
        nb_parc = 0

        db.end_run(conn, run_id, "ok", nb_parc, nb_bat)
        print(f"Run #{run_id} terminé : {nb_parc} parcelles, {nb_bat} bâtiments.")

    except Exception as e:
        db.end_run(conn, run_id, "erreur", 0, 0, message=str(e))
        print(f"Run #{run_id} en ERREUR : {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    decl = sys.argv[1] if len(sys.argv) > 1 else "bouton"
    main(decl)
