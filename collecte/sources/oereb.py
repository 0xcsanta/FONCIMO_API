"""Source : cadastre RDPPF / OEREB (restrictions de droit public).

Webservice vaudois : www.rdppf.vd.ch — extrait JSON par EGRID, SANS géométrie
(≈ 77 Ko/parcelle). On récupère la liste des thèmes de restriction qui
touchent la parcelle (ConcernedTheme), et en particulier si elle est en
ZONE RÉSERVÉE (ch.Planungszonen) : la construction y est gelée, c'est un
critère direct pour écarter une parcelle de la densification.

C'est la même donnée que l'extrait RDPPF PDF, mais en format structuré :
pas besoin de parser le PDF.

Mention : « géodonnées © Etat de Vaud - Informations dépourvues de foi publique ».
"""
import time
import requests

EXTRACT_URL = "https://www.rdppf.vd.ch/ws/RdppfSVC.svc/extract/json/"
SOURCE = "rdppf.vd.ch (cadastre RDPPF/OEREB, © Etat de Vaud)"
CODE_ZONE_RESERVEE = "ch.Planungszonen"


def fetch_restrictions(egrids):
    """egrids : liste d'EGRID. Renvoie {egrid: {en_zone_reservee, restrictions}}."""
    out = {}
    total = len(egrids)
    for i, egrid in enumerate(egrids):
        info = _extract(egrid)
        if info is not None:
            out[egrid] = info
        if (i + 1) % 500 == 0:
            print(f"   OEREB : {i + 1}/{total} parcelles interrogées")
        time.sleep(0.1)
    return out


def _extract(egrid):
    try:
        r = requests.get(
            EXTRACT_URL, params={"GEOMETRY": "false", "EGRID": egrid}, timeout=30
        )
        r.raise_for_status()
        d = r.json()
    except (requests.RequestException, ValueError):
        return None

    item = d.get("Item", d)
    themes = item.get("ConcernedTheme") or []
    codes, labels = [], []
    for t in themes:
        code = t.get("Code")
        txt = (t.get("Text") or [{}])[0].get("Text")
        if code:
            codes.append(code)
        if txt and txt not in labels:
            labels.append(txt)

    return {
        "en_zone_reservee": CODE_ZONE_RESERVEE in codes,
        "restrictions": labels,
    }
