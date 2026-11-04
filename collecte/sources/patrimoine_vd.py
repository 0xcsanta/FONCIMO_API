"""Source : contraintes « patrimoine » du canton de Vaud, par parcelle.

WMS cantonal www.ogc.vd.ch (GetFeatureInfo au centroïde). Trois couches, qui
sont toutes des freins potentiels à la densification :
  - vd.region_archeologique : région archéologique (art. 40 LPrPCI) -> fouilles
  - vd.jardin_historique    : jardin historique recensé
  - vd.site                 : site construit protégé (ensemble bâti)

Pas de WFS public (données payantes au téléchargement) ; la consultation
GetFeatureInfo est gratuite. Mention : « géodonnées © Etat de Vaud -
Informations dépourvues de foi publique ».

`fetch_patrimoine(parcelles, workers=N)` interroge N parcelles en parallèle.
Garde-fou intégrité : une parcelle dont une requête échoue (après retries) est
OMISE du résultat — elle reste « à traiter » et sera reprise au passage suivant.
On ne confond donc jamais « échec réseau » avec « pas de contrainte ».
"""
import re
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

WMS_URL = "https://www.ogc.vd.ch/public/services/OGC/wmsVD/Mapserver/WMSServer"
SOURCE = "geo.vd.ch (© Etat de Vaud)"

LAYER_ARCHEO = "vd.region_archeologique"
LAYER_JARDIN = "vd.jardin_historique"
LAYER_SITE = "vd.site"


def _fetch_one(p):
    """Interroge les 3 couches pour une parcelle.

    Renvoie (egrid, {archeo, jardin, site}) si les 3 requêtes aboutissent ;
    lève une exception réseau sinon (la parcelle sera reprise plus tard).
    """
    e, n = p["cx"], p["cy"]
    return p["egrid"], {
        "archeo": _query(e, n, LAYER_ARCHEO, r'"(\d+/\d+)"'),
        "jardin": _query(e, n, LAYER_JARDIN, r'Nom\w*="([^"]*)"'),
        "site": _query(e, n, LAYER_SITE, r'Nomsite="([^"]*)"'),
    }


def fetch_patrimoine(parcelles, workers=1):
    """parcelles : [{egrid, cx, cy}]. workers>1 -> requêtes WMS en parallèle.

    Renvoie {egrid: {archeo, jardin, site}} (valeur = libellé/n° ou None).
    """
    cibles = [p for p in parcelles if p.get("cx") is not None]
    total = len(cibles)
    out = {}

    if workers <= 1:
        for i, p in enumerate(cibles):
            try:
                egrid, info = _fetch_one(p)
                out[egrid] = info
            except requests.RequestException:
                pass  # parcelle laissée « à traiter » (reprise au prochain passage)
            if (i + 1) % 500 == 0:
                print(f"   patrimoine VD : {i + 1}/{total} parcelles")
            time.sleep(0.1)
        return out

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_fetch_one, p) for p in cibles]
        for j, fut in enumerate(as_completed(futs)):
            try:
                egrid, info = fut.result()
                out[egrid] = info
            except requests.RequestException:
                pass  # idem : omise, pas de faux négatif
            if (j + 1) % 500 == 0:
                print(f"   patrimoine VD : {j + 1}/{total} parcelles")
    return out


def _query(E, N, layer, pattern, tentatives=3):
    """GetFeatureInfo sur une couche ; renvoie un libellé, 'oui', ou None.

    Réessaie sur erreur réseau/HTTP ; lève après `tentatives` échecs (pour
    distinguer « échec » de « pas de donnée »)."""
    d = 4
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo",
        "SRS": "EPSG:2056", "LAYERS": layer, "QUERY_LAYERS": layer,
        "BBOX": f"{E - d},{N - d},{E + d},{N + d}",
        "WIDTH": 11, "HEIGHT": 11, "X": 5, "Y": 5,
        "INFO_FORMAT": "application/vnd.ogc.gml", "FEATURE_COUNT": 1,
    }
    derniere = None
    for k in range(tentatives):
        try:
            r = requests.get(WMS_URL, params=params, timeout=15)
            r.raise_for_status()
        except requests.RequestException as e:
            derniere = e
            time.sleep(0.4 * (k + 1))
            continue
        if "FIELDS" not in r.text:
            return None
        m = re.search(pattern, r.text)
        return m.group(1) if m else "oui"
    raise derniere
