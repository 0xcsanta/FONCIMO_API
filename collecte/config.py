"""Paramètres de la collecte.

On commence volontairement petit : une seule commune (Pully) et une zone
géographique réduite, pour prouver la chaîne de bout en bout avant d'étendre.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Connexion à la base (Supabase). Lue depuis .env — jamais en dur dans le code.
DATABASE_URL = os.environ.get("DATABASE_URL")

# --- Commune pilote : Pully ---
COMMUNE = "Pully"
NO_COMMUNE_OFS = 5590          # n° OFS de Pully (GGDENR)

# Emprise géographique de Pully en LV95 (EPSG:2056) : (xmin, ymin, xmax, ymax).
# On la prend volontairement LARGE (elle déborde sur les communes voisines) :
# le filtre par commune (ggdenr) ne garde que Pully, et la subdivision
# adaptative garantit qu'aucune zone dense n'est tronquée.
BBOX_PULLY_LV95 = (2538000, 1149500, 2544000, 1154500)

# Système de coordonnées utilisé partout.
SRID = 2056

# Politesse avec les API publiques (clause de "fair use", pas de quota chiffré).
HTTP_TIMEOUT = 30              # secondes
PAUSE_ENTRE_REQUETES = 0.2    # secondes
