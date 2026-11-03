"""Source : zones d'affectation (zones à bâtir harmonisées).

API : api3.geo.admin.ch, couche ch.are.bauzonen (harmonisation fédérale des
plans d'affectation cantonaux). Donne, par zone, un code et un libellé FR
(ex. « Zones d'habitation », « Zones centrales »...), avec la géométrie.

On filtre Pully (bfs_no = 5590) et on rattache ensuite chaque parcelle à sa
zone par jointure spatiale (centroïde de la parcelle dans le polygone).
"""
import time
import requests

from .. import config

IDENTIFY_URL = "https://api3.geo.admin.ch/rest/services/all/MapServer/identify"
LAYER = "ch.are.bauzonen"
SOURCE = "api3.geo.admin.ch / ch.are.bauzonen"

CAP = 200
TAILLE_INITIALE = 2000
TAILLE_MIN = 100


def fetch_zones():
    """Renvoie la liste des polygones de zone (dicts) de Pully."""
    xmin, ymin, xmax, ymax = config.BBOX_PULLY_LV95
    vus = {}  # wkt -> zone (dédoublonnage par géométrie)
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
    feats = _identify(bbox)
    if len(feats) >= CAP and (bbox[2] - bbox[0]) > TAILLE_MIN:
        xmin, ymin, xmax, ymax = bbox
        mx = (xmin + xmax) / 2
        my = (ymin + ymax) / 2
        _collecter((xmin, ymin, mx, my), vus)
        _collecter((mx, ymin, xmax, my), vus)
        _collecter((xmin, my, mx, ymax), vus)
        _collecter((mx, my, xmax, ymax), vus)
        return
    for f in feats:
        a = f.get("attributes", {})
        if _int(a.get("bfs_no")) != config.NO_COMMUNE_OFS:
            continue
        wkt = _wkt(f.get("geometry", {}).get("rings"))
        if not wkt:
            continue
        vus[wkt] = {
            "code_zone": _int(a.get("ch_code_hn")),
            "libelle": _clean(a.get("ch_bez_f")),
            "bfs_no": _int(a.get("bfs_no")),
            "wkt": wkt,
            "source": SOURCE,
        }


def _identify(bbox):
    xmin, ymin, xmax, ymax = bbox
    g = f"{xmin},{ymin},{xmax},{ymax}"
    params = {
        "geometryType": "esriGeometryEnvelope", "geometry": g, "mapExtent": g,
        "imageDisplay": "500,500,96", "tolerance": 0,
        "layers": f"all:{LAYER}", "sr": config.SRID,
        "returnGeometry": "true", "lang": "fr",
    }
    try:
        r = requests.get(IDENTIFY_URL, params=params, timeout=config.HTTP_TIMEOUT)
        r.raise_for_status()
        feats = r.json().get("results", [])
    except requests.RequestException as e:
        print(f"  [avertissement] tuile zones {bbox} ignorée : {e}")
        feats = []
    time.sleep(config.PAUSE_ENTRE_REQUETES)
    return feats


def _wkt(rings):
    polys = []
    for r in rings or []:
        if len(r) < 4:
            continue
        coords = ", ".join(f"{p[0]} {p[1]}" for p in r)
        polys.append(f"(({coords}))")
    if not polys:
        return None
    return "MULTIPOLYGON(" + ", ".join(polys) + ")"


def _int(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def _clean(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None
