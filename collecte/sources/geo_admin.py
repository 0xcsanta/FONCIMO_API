"""Source : Registre fédéral des bâtiments et logements (RegBL).

API : api3.geo.admin.ch (swisstopo), service REST public, sans clé, CORS ouvert.
Couche : ch.bfs.gebaeude_wohnungs_register

⚠️ L'endpoint `identify` PLAFONNE à ~200 objets par requête (au-delà, il
tronque la réponse sans prévenir). On découpe donc l'emprise en tuiles, et
dès qu'une tuile atteint ce plafond on la redécoupe en 4 (subdivision
adaptative) jusqu'à repasser sous le plafond : aucune zone dense n'est perdue.

On ne garde que les bâtiments de la commune cible (Pully, ggdenr = 5590) ;
le reste de l'emprise (communes voisines) est ignoré.
"""
import time
import requests

from .. import config

IDENTIFY_URL = "https://api3.geo.admin.ch/rest/services/all/MapServer/identify"
LAYER = "ch.bfs.gebaeude_wohnungs_register"
SOURCE = "api3.geo.admin.ch / ch.bfs.gebaeude_wohnungs_register"

CAP = 200             # au-delà, l'API tronque -> on subdivise la tuile
TAILLE_INITIALE = 1000  # côté d'une tuile de départ, en mètres
TAILLE_MIN = 60         # on ne subdivise pas en dessous (garde-fou anti-boucle)


def fetch_batiments():
    """Renvoie la liste des bâtiments (dicts) de la commune de Pully."""
    xmin, ymin, xmax, ymax = config.BBOX_PULLY_LV95
    vus = {}  # egid -> bâtiment (dédoublonnage)

    x = xmin
    while x < xmax:
        y = ymin
        while y < ymax:
            tuile = (x, y, min(x + TAILLE_INITIALE, xmax), min(y + TAILLE_INITIALE, ymax))
            _collecter(tuile, vus)
            y += TAILLE_INITIALE
        x += TAILLE_INITIALE

    return list(vus.values())


def _collecter(bbox, vus):
    """Interroge une tuile ; si elle est saturée, la redécoupe en 4."""
    feats = _identify_tuile(bbox)

    if len(feats) >= CAP and (bbox[2] - bbox[0]) > TAILLE_MIN:
        xmin, ymin, xmax, ymax = bbox
        mx = (xmin + xmax) / 2
        my = (ymin + ymax) / 2
        _collecter((xmin, ymin, mx, my), vus)
        _collecter((mx, ymin, xmax, my), vus)
        _collecter((xmin, my, mx, ymax), vus)
        _collecter((mx, my, xmax, ymax), vus)
        return

    for feat in feats:
        b = _normaliser(feat)
        if b["egid"] is None:
            continue
        if b["no_commune"] != config.NO_COMMUNE_OFS:
            continue  # on ignore les communes voisines
        vus[b["egid"]] = b


def _identify_tuile(bbox):
    """Un appel identify sur une tuile ; renvoie la liste des features."""
    xmin, ymin, xmax, ymax = bbox
    geometry = f"{xmin},{ymin},{xmax},{ymax}"
    params = {
        "geometryType": "esriGeometryEnvelope",
        "geometry": geometry,
        "mapExtent": geometry,
        "imageDisplay": "500,500,96",
        "tolerance": 0,
        "layers": f"all:{LAYER}",
        "sr": config.SRID,
        "returnGeometry": "false",
        "lang": "fr",
    }
    try:
        r = requests.get(IDENTIFY_URL, params=params, timeout=config.HTTP_TIMEOUT)
        r.raise_for_status()
        feats = r.json().get("results", [])
    except requests.RequestException as e:
        print(f"  [avertissement] tuile {bbox} ignorée : {e}")
        feats = []
    time.sleep(config.PAUSE_ENTRE_REQUETES)
    return feats


def _normaliser(feature):
    """Transforme la réponse brute de l'API en dict au format de notre base."""
    a = feature.get("attributes", {})
    return {
        "egid": _int(a.get("egid")),
        "egrid": _clean(a.get("egrid")),
        "numero_parcelle": _clean(a.get("lparz")),
        "no_commune": _int(a.get("ggdenr")),
        "commune": _clean(a.get("ggdename")),
        "canton": _clean(a.get("gdekt")),
        "adresse": _clean(a.get("strname_deinr")),
        "npa": _clean(a.get("plz_plz6") or a.get("dplz4")),
        "statut": _int(a.get("gstat")),
        "categorie": _int(a.get("gkat")),
        "classe": _int(a.get("gklas")),
        "annee_construction": _int(a.get("gbauj")),
        "periode_construction": _clean(a.get("gbaup")),
        "annee_demolition": _int(a.get("gabbj")),
        "nb_etages": _int(a.get("gastw")),
        "nb_logements": _int(a.get("ganzwhg")),
        "surface_sol_m2": _num(a.get("garea")),
        "volume_m3": _num(a.get("gvol")),
        "surface_ref_energie": _num(a.get("gebf")),
        "chauffage": _int(a.get("gwaerzh1")),
        "agent_energetique": _int(a.get("genh1")),
        "coord_e": _num(a.get("gkode")),
        "coord_n": _num(a.get("gkodn")),
        "source": SOURCE,
    }


# --- petits aides de nettoyage (la donnée arrive parfois en texte / vide) ---
def _clean(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None


def _int(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def _num(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None
