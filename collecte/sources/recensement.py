"""Source : recensement architectural vaudois (note 1-7).

Service WMS cantonal : www.ogc.vd.ch, couche vd.batiment_recense.
La note (1 à 7) indique la valeur patrimoniale d'un bâtiment :
  1-2 = protection nationale/régionale, 3 = protégé (zone réservée Pully),
  4-7 = pas d'obstacle patrimonial majeur.
Le défi demande d'écarter les parcelles de note 1 à 3.

Pas de WFS public -> on interroge en GetFeatureInfo au point de chaque
bâtiment (coordonnées RegBL déjà collectées). On récupère la note, la
mesure de protection, le n° ECA et le lien vers la fiche.

Mention obligatoire de la source :
  « géodonnées © Etat de Vaud - Informations dépourvues de foi publique ».
"""
import re
import time
import requests

WMS_URL = "https://www.ogc.vd.ch/public/services/OGC/wmsVD/Mapserver/WMSServer"
LAYER = "vd.batiment_recense"
SOURCE = "geo.vd.ch / vd.batiment_recense (recensement architectural, © Etat de Vaud)"


def fetch_notes(batiments):
    """batiments : liste de dicts avec egid, coord_e, coord_n.

    Renvoie {egid: {note, mesure_protection, num_eca, lien_fiche, commune}}
    pour les bâtiments effectivement recensés.
    """
    out = {}
    total = len(batiments)
    for i, b in enumerate(batiments):
        e, n = b.get("coord_e"), b.get("coord_n")
        if e is None or n is None:
            continue
        info = _getfeatureinfo(e, n)
        if info and info.get("note") is not None:
            out[b["egid"]] = info
        if (i + 1) % 500 == 0:
            print(f"   recensement : {i + 1}/{total} bâtiments interrogés")
        time.sleep(0.12)
    return out


def _getfeatureinfo(E, N):
    d = 4
    params = {
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo",
        "SRS": "EPSG:2056", "LAYERS": LAYER, "QUERY_LAYERS": LAYER,
        "BBOX": f"{E - d},{N - d},{E + d},{N + d}",
        "WIDTH": 11, "HEIGHT": 11, "X": 5, "Y": 5,
        "INFO_FORMAT": "application/vnd.ogc.gml", "FEATURE_COUNT": 1,
    }
    try:
        r = requests.get(WMS_URL, params=params, timeout=15)
        r.raise_for_status()
        return _parse(r.text)
    except requests.RequestException:
        return None


def _parse(xml):
    """Extrait les attributs de l'élément <FIELDS ...> de la réponse ESRI WMS.

    On utilise une regex plutôt que ElementTree : la réponse déclare son
    encodage, ce que ElementTree.fromstring refuse sur une chaîne.
    """
    if "FIELDS" not in xml:
        return None

    def attr(name):
        m = re.search(name + r'="([^"]*)"', xml)
        return m.group(1) if m else None

    note = attr("Note")
    try:
        note = int(note)
    except (TypeError, ValueError):
        note = None

    return {
        "note": note,
        "mesure_protection": _nn(attr("Mesuredeprotection")),
        "num_eca": _nn(attr("NumECA")),
        "lien_fiche": _nn(attr("Lienfiche")),
        "commune": _nn(attr("Commune")),
    }


def _nn(v):
    if v is None:
        return None
    v = str(v).strip()
    return None if v in ("", "Null", "null") else v
