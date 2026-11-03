"""Source : parcelles / biens-fonds via api3.geo.admin.ch.

Couche : ch.kantone.cadastralwebmap-farbe (identify renvoie les biens-fonds).
Donne : EGRID (egris_egrid), numéro (number), et la géométrie (rings) d'où
l'on calcule la surface. On ne garde que Pully, repéré par l'identifiant de
l'arrondissement cadastral `identnd = VD0136000000`.

Même plafond de ~200 objets/requête que le RegBL -> subdivision adaptative.
"""
import time
import requests

from .. import config

IDENTIFY_URL = "https://api3.geo.admin.ch/rest/services/all/MapServer/identify"
LAYER = "ch.kantone.cadastralwebmap-farbe"
SOURCE = "api3.geo.admin.ch / ch.kantone.cadastralwebmap-farbe"
IDENTND_PULLY = "VD0136000000"   # arrondissement cadastral de Pully

CAP = 200
TAILLE_INITIALE = 1000
TAILLE_MIN = 60


def fetch_parcelles():
    """Renvoie la liste des parcelles (dicts) de Pully."""
    xmin, ymin, xmax, ymax = config.BBOX_PULLY_LV95
    vus = {}
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
        if a.get("identnd") != IDENTND_PULLY:
            continue  # on ignore les communes voisines
        egrid = _clean(a.get("egris_egrid"))
        if not egrid:
            continue
        rings = f.get("geometry", {}).get("rings")
        vus[egrid] = {
            "egrid": egrid,
            "numero": _clean(a.get("number")),
            "commune": config.COMMUNE,
            "no_commune": config.NO_COMMUNE_OFS,
            "canton": "VD",
            "surface_m2": _aire(rings),
            "wkt": _wkt(rings),
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
        print(f"  [avertissement] tuile {bbox} ignorée : {e}")
        feats = []
    time.sleep(config.PAUSE_ENTRE_REQUETES)
    return feats


def _aire(rings):
    """Surface en m² via la formule du lacet (gère les trous par orientation)."""
    if not rings:
        return None
    total = 0.0
    for r in rings:
        if len(r) < 4:
            continue
        s = sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))
        total += s / 2.0
    return round(abs(total), 1)


def _wkt(rings):
    """Construit un MULTIPOLYGON WKT (LV95) à partir des anneaux Esri."""
    polys = []
    for r in rings or []:
        if len(r) < 4:
            continue
        coords = ", ".join(f"{p[0]} {p[1]}" for p in r)
        polys.append(f"(({coords}))")
    if not polys:
        return None
    return "MULTIPOLYGON(" + ", ".join(polys) + ")"


def _clean(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None
