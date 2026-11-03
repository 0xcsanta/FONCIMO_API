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
    """egrids : liste d'EGRID. Renvoie {egrid: {en_zone_reservee, restrictions}}.

    Le webservice vaudois limite le débit (throttling) : on va donc doucement
    (pause entre chaque appel) et on réessaie avec un backoff en cas d'échec.
    """
    out = {}
    total = len(egrids)
    for i, egrid in enumerate(egrids):
        info = _extract_retry(egrid)
        if info is not None:
            out[egrid] = info
        if (i + 1) % 500 == 0:
            print(f"   OEREB : {i + 1}/{total} parcelles interrogées")
        time.sleep(0.25)
    return out


def _extract_retry(egrid, tentatives=4):
    """Réessaie l'extraction avec un backoff croissant (contre le throttling)."""
    for k in range(tentatives):
        info = _extract(egrid)
        if info is not None:
            return info
        time.sleep(0.6 * (k + 1))
    return None


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
    bien = item.get("RealEstate") or {}
    restrictions_src = bien.get("RestrictionOnLandownership") or []

    zone_reservee = False
    limite = False
    bruit = None
    affectation = None
    aff_pct = -1
    liste = []
    for x in restrictions_src:
        code = (x.get("Theme") or {}).get("Code")
        legende = _txt(x.get("LegendText"))
        pct = x.get("PartInPercent")
        liste.append({"code": code, "legende": legende, "pct": pct})

        if code == CODE_ZONE_RESERVEE:
            zone_reservee = True
        elif code == "ch.Laermempfindlichkeitsstufen" and legende:
            bruit = legende
        elif code and "Baulinien" in code:
            limite = True
        elif code == "ch.Nutzungsplanung" and legende and legende.lower().startswith("zone"):
            p = pct if isinstance(pct, (int, float)) else 0
            if p > aff_pct:
                aff_pct, affectation = p, legende

    return {
        "en_zone_reservee": zone_reservee,
        "affectation_detaillee": affectation,
        "degre_bruit": bruit,
        "limite_construction": limite,
        "surface_rf_m2": _num(bien.get("LandRegistryArea")),
        "restrictions": liste,
    }


def _txt(v):
    """Récupère le texte d'un champ multilingue OEREB (liste ou dict)."""
    if isinstance(v, list) and v:
        return v[0].get("Text")
    if isinstance(v, dict):
        return v.get("Text")
    return v


def _num(v):
    """LandRegistryArea peut être un nombre ou 'Surface non disponible'."""
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None
