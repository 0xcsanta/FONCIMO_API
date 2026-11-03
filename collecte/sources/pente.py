"""Source : pente du terrain, via le service `height` de geo.admin.

On échantillonne l'altitude en 4 points autour du centroïde de la parcelle
(Nord, Sud, Est, Ouest à ±25 m) et on estime la pente moyenne en % à partir
des gradients N-S et E-O. Service fédéral ouvert, sans clé.
"""
import math
import time
import requests

HEIGHT_URL = "https://api3.geo.admin.ch/rest/services/height"
D = 25  # distance d'échantillonnage, en mètres


def fetch_pentes(parcelles):
    """parcelles : liste de {egrid, cx, cy}. Renvoie {egrid: pente_pct}."""
    out = {}
    total = len(parcelles)
    for i, p in enumerate(parcelles):
        if p.get("cx") is None:
            continue
        v = _pente(p["cx"], p["cy"])
        if v is not None:
            out[p["egrid"]] = v
        if (i + 1) % 500 == 0:
            print(f"   pente : {i + 1}/{total} parcelles")
    return out


def _pente(E, N):
    n = _h(E, N + D)
    s = _h(E, N - D)
    e = _h(E + D, N)
    w = _h(E - D, N)
    if None in (n, s, e, w):
        return None
    g_ns = (n - s) / (2 * D)
    g_eo = (e - w) / (2 * D)
    pente = math.sqrt(g_ns * g_ns + g_eo * g_eo)  # tangente de la pente
    return round(pente * 100, 1)  # en %


def _h(E, N):
    try:
        r = requests.get(
            HEIGHT_URL, params={"easting": E, "northing": N, "sr": 2056}, timeout=15
        )
        r.raise_for_status()
        h = r.json().get("height")
        return float(h) if h not in (None, "") else None
    except (requests.RequestException, ValueError, TypeError):
        return None
