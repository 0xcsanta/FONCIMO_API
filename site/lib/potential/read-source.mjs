import { loadClientPotential } from './client-potential.mjs';

const PARCEL_COLUMNS = 'egrid,numero,commune,surface_m2,zone_affectation,taux_occupation_sol,indice_utilisation,surface_constructible_m2,note_recensement,pente_pct,emprise_batie_m2,en_zone_reservee,affectation_detaillee,limite_construction,niveaux_max,en_zone_archeologique,jardin_historique,site_protege,geom';
const BUILDING_COLUMNS = 'egrid,egid,categorie,surface_sol_m2,nb_etages,nb_logements,annee_construction,agent_energetique,chauffage,note_recensement';
const cache = new Map();

// Public reads only. No service key, RPC, insert, update, delete or schema changes.
export function readOnlySource(url, key, fetcher = fetch) {
  return {
    from(table) {
      if (!['parcelle', 'batiment'].includes(table)) throw new Error('Source non autorisée');
      const params = new URLSearchParams();
      let exactCount = false;
      async function execute(single = false) {
        const response = await fetcher(`${url}/rest/v1/${table}?${params}`, {
          method: 'GET',
          headers: { apikey: key, Authorization: `Bearer ${key}`, ...(exactCount ? { Prefer: 'count=exact' } : {}) },
        });
        if (!response.ok) throw new Error(`Lecture des données indisponible (${response.status})`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Format de données invalide');
        const range = response.headers.get('content-range');
        const total = range?.split('/')[1];
        const count = total && /^\d+$/.test(total) ? Number(total) : null;
        return { data: single ? (data.length === 1 ? data[0] : null) : data, count, error: null };
      }
      const query = {
        select(columns, options) { params.set('select', columns === '*' ? (table === 'parcelle' ? PARCEL_COLUMNS : BUILDING_COLUMNS) : columns); exactCount = options?.count === 'exact'; return query; },
        eq(column, value) { params.set(column, `eq.${value}`); return query; },
        order(column) { params.set('order', `${column}.asc`); return query; },
        single() { params.set('limit', '2'); return execute(true); },
        limit(limit) { params.set('limit', String(limit)); return execute(); },
        range(start, end) { params.set('offset', String(start)); params.set('limit', String(end - start + 1)); return execute(); },
      };
      return query;
    },
  };
}

export async function calculateClientPotential(url, key, egrid) {
  const cacheKey = `${url}|${egrid}`;
  if (!cache.has(cacheKey)) {
    if (cache.size >= 20) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, loadClientPotential(readOnlySource(url, key), egrid).catch(error => { cache.delete(cacheKey); throw error; }));
  }
  return cache.get(cacheKey);
}
