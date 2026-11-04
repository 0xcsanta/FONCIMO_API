"""Source : contraintes « patrimoine » du canton de Vaud, par parcelle.

WMS cantonal www.ogc.vd.ch (GetFeatureInfo au centroïde). Trois couches, qui
sont toutes des freins potentiels à la densification :
  - vd.region_archeologique : région archéologique (art. 40 LPrPCI) -> fouilles
  - vd.jardin_historique    : jardin historique recensé
  - vd.site                 : site construit protégé (ensemble bâti)

Pas de WFS public (données payantes au téléchargement) ; la consultation
GetFeatureInfo est gratuite. Mention : « géodonnées © Etat de Vaud -
Informations dépourvues de foi publique ».
"""
import re
import time
import requests

WMS_URL = "https://www.ogc.vd.ch/public/services/OGC/wmsVD/Mapserver/WMSServer"
SOURCE = "geo.vd.ch (© Etat de Vaud)"

LAYER_ARCHEO = "vd.region_archeologique"
LAYER_JARDIN = "vd.jardin_historique"
LAYER_SITE = "vd.site"


def fetch_patrimoine(parcelles):
    """parcelles : [{egrid, cx, cy}].

    Renvoie {egrid: {archeo, jardin, site}} (valeur = libellé/n° ou None).
    """
    out = {}
    total = len(parcelles)
    for i, p in enumerate(parcelles):
        if p.get("cx") is None:
            continue
        e, n = p["cx"], p["cy"]
        out[p["egrid"]] = {
            "archeo": _query(e, n, LAYER_ARCHEO, r'"(\d+/\d+)"'),
            "jardin": _query(e, n, LAYER_JARDIN, r'Nom\w*="([^"]*)"'),
            "site": _query(e, n, LAYER_SITE, r'Nomsite="([^"]*)"'),
        }
        if (i + 1) % 500 == 0:
            print(f"   patrimoine VD : {i + 1}/{total} parcelles")
        time.sleep(0.1)
    return out


def _query(E, N, layer, pattern):
    """GetFeatureInfo sur une couche ; renvoie un libellé, 'oui', ou None."""
    d = 4
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo",
        "SRS": "EPSG:2056", "LAYERS": layer, "QUERY_LAYERS": layer,
        "BBOX": f"{E - d},{N - d},{E + d},{N + d}",
        "WIDTH": 11, "HEIGHT": 11, "X": 5, "Y": 5,
        "INFO_FORMAT": "application/vnd.ogc.gml", "FEATURE_COUNT": 1,
    }
    try:
        r = requests.get(WMS_URL, params=params, timeout=15)
        r.raise_for_status()
    except requests.RequestException:
        return None
    if "FIELDS" not in r.text:
        return None
    m = re.search(pattern, r.text)
    return m.group(1) if m else "oui"
