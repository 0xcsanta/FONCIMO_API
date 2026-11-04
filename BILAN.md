# Bilan — potentiel de densification des parcelles de Pully

*Base Foncimo, données collectées le 2026-11-04. Toutes les données brutes sont
dans Supabase ; les filtres ci-dessous sont des exemples, réversibles à volonté.*

---

## 1. Ce qui a été collecté

| Donnée | Volume | Couverture |
|---|---|---|
| Parcelles | **2 660** | 100 % de la commune |
| Bâtiments (RegBL) | **3 021** | — |
| Zones d'affectation | 2 254 parcelles à bâtir | 85 % |
| Restrictions RDPPF/OEREB | 2 531 parcelles | **95 %** (le reste = domaine public/lac, sans extrait) |
| Patrimoine VD (archéo/jardin/site) | 2 660 parcelles | **100 %** |
| Pente du terrain | 2 660 parcelles | 100 % |
| Plafonds légaux (règlement) | 2 254 parcelles | zones à bâtir |

Contraintes patrimoniales trouvées : **213** parcelles avec un bâtiment protégé
(note 1–3), **288** sites protégés, **138** zones archéologiques, **88** jardins
historiques.

---

## 2. L'entonnoir de densification

Point de départ : **2 254 parcelles à bâtir**.

| Étape | Parcelles restantes |
|---|---|
| Parcelles à bâtir | **2 254** |
| … hors **zone réservée** (gel levé) | **442** |
| … sans jardin historique ni site protégé | 363 |
| … sans bâtiment protégé (note 1–3) | **334** |
| … **en zone d'habitation** (hors verdure/desserte/besoins publics) | **85** |

---

## 3. 🔑 Le facteur décisif : la zone réservée

**1 812 des 2 254 parcelles à bâtir (80 %) sont en zone réservée** — un gel
temporaire des constructions décidé en attendant la révision du plan
d'affectation. C'est, de très loin, le premier frein à la densification à Pully.

> ⚠️ **À vérifier avant toute conclusion** : la date de validité / l'échéance de
> cette zone réservée. Si elle arrive à terme bientôt, le potentiel « gelé »
> redevient mobilisable. L'info brute est dans la colonne `restrictions` (jsonb).

---

## 4. Le potentiel réellement mobilisable (zones d'habitation, libres de contraintes)

Sur les **85 parcelles d'habitation libres** :
- **39 sont vacantes** (aucun bâtiment) → construction neuve directe.
- **27** ont une marge au sol > 50 m², soit **~8 100 m²** d'emprise au sol encore
  constructible cumulée.

### Top 12 des candidats (triés par marge au sol)

| Parcelle | Surface | Affectation | État | Niv. max | Marge sol | Pente |
|---|--:|---|---|:--:|--:|--:|
| **2034** | 14 248 m² | Moyenne densité | vacante | 4 | 2 850 m² | 4 % |
| **1900** | 5 292 m² | Moyenne densité | vacante | 4 | 1 058 m² | 11 % |
| **365** | 2 320 m² | Forte densité | vacante | 5 | 464 m² | 10 % |
| **118** | 1 492 m² | Moyenne densité | vacante | 4 | 299 m² | 15 % |
| **172** | 1 428 m² | Faible densité | vacante | 3 | 286 m² | 10 % |
| **113** | 1 378 m² | Moyenne densité | vacante | 4 | 276 m² | 11 % |
| **114** | 1 351 m² | Moyenne densité | vacante | 4 | 270 m² | 12 % |
| **6508** | 1 296 m² | Forte densité | vacante | — | 259 m² | 11 % |
| **366** | 3 157 m² | Forte densité | 1 bât. (5 niv.) | 5 | 259 m² | 1 % |
| **117** | 1 109 m² | Moyenne densité | vacante | 4 | 222 m² | 14 % |
| **102** | 903 m² | Forte densité | vacante | 5 | 181 m² | 15 % |
| **11** | 890 m² | Forte densité | vacante | 5 | 178 m² | 10 % |

La parcelle **2034** se détache nettement : 1,4 ha vacant en zone de moyenne
densité, terrain quasi plat.

---

## 5. Limites à garder en tête

1. **Indice appliqué largement** — l'indice de 20 % (surface constructible) a été
   posé sur *toutes* les zones ayant une affectation, y compris verdure, desserte
   et besoins publics. Ces zones gonflent artificiellement la « marge au sol » si
   on ne les exclut pas (ce bilan les a écartées en ne gardant que l'habitation).
   → *Amélioration possible : ne poser l'indice que sur les zones d'habitation.*
2. **Zone réservée** — son échéance conditionne tout (cf. §3).
3. **Hauteur réelle des bâtiments** — non disponible en mètres (le RegBL ne la
   fournit pas) ; on raisonne en **niveaux** (`nb_etages` vs `niveaux_max`).
4. **Surélévation** — potentiel vertical identifiable surtout là où `nb_etages` et
   `niveaux_max` sont tous deux connus (intersection partielle).

---

## 6. Requête de référence (zones d'habitation libres)

```sql
select p.numero, p.surface_m2, p.affectation_detaillee, p.niveaux_max,
       round(p.surface_constructible_m2 - coalesce(p.emprise_batie_m2,0)) as marge_sol_m2
from parcelle p
where p.zone_affectation is not null
  and p.en_zone_reservee is not true                 -- pas gelée
  and p.jardin_historique is null and p.site_protege is null
  and (p.note_recensement is null or p.note_recensement > 3)
  and (p.affectation_detaillee ilike '%densité%' or p.affectation_detaillee ilike '%villas%')
order by marge_sol_m2 desc;
```
