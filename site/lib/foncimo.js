import { calculateClientPotential } from "./potential/read-source.mjs";
import { previewPotential } from "./potential/client-potential.mjs";
// Config publique Foncimo (clés anon = publiques, OK côté navigateur).
// L'edge function "potentiel" garde le scoring + la clé service côté serveur.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gwwioyvhhtskoasvsigc.supabase.co";

// Clé anon (JWT), requise par le gateway des edge functions (verify_jwt).
export const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3d2lveXZoaHRza29hc3ZzaWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2OTI3OTEsImV4cCI6MjEwOTI2ODc5MX0.DCg9xQP7hEhOp_gIdnNCvWQ6K2ZM3WNfp0OWh1HCNJk";

const FN_URL = `${SUPABASE_URL}/functions/v1/potentiel`;

async function callFn(payload) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      apikey: SUPABASE_ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Erreur ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Étape 1 : évaluer une parcelle (détail masqué / teaser).
export async function evaluerParcelle(query, type = "auto", egrid) {
  const data = await callFn({ action: "evaluer", query, type, egrid });
  if (!data?.found) return data;
  if (egrid && data.resume?.egrid !== egrid) throw new Error("Parcelle du résultat incohérente");
  const potentiel = await calculateClientPotential(SUPABASE_URL, SUPABASE_ANON, data.resume.egrid);
  return { ...data, potentiel: previewPotential(potentiel) };
}

// Étape 2 : capturer l'email, révéler le détail, déclencher l'email Foncimo.
export async function capturerLead({ query, type = "auto", egrid, email, telephone, rdv }) {
  // Existing lead/email service remains untouched. Its email still uses its old server-side score.
  const potentiel = await calculateClientPotential(SUPABASE_URL, SUPABASE_ANON, egrid);
  const data = await callFn({ action: "capturer", query, type, egrid, email, telephone, rdv });
  if (!data?.found || data.resume?.egrid !== egrid) throw new Error("Parcelle du résultat incohérente");
  return { ...data, potentiel };
}

// Autocomplétion : adresses de Pully correspondant à la saisie.
export async function suggererAdresses(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await callFn({ action: "suggest", query });
    return (res && res.suggestions) || [];
  } catch (e) {
    return [];
  }
}

// ---- Outil /tool : modèle pondéré 3 stratégies (edge function "analyse") ----
const ANALYSE_URL = `${SUPABASE_URL}/functions/v1/analyse`;

async function callAnalyse(payload) {
  const res = await fetch(ANALYSE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      apikey: SUPABASE_ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `Erreur ${res.status}`);
  return data;
}

// Grille de poids par défaut + libellés + sources.
export function poidsDefaut() {
  return callAnalyse({ action: "defauts" });
}

// Analyse une parcelle avec les poids fournis (ou défauts si omis).
export function analyserParcelle({ query, type = "auto", egrid, poids, gel = true }) {
  return callAnalyse({ action: "analyse", query, type, egrid, poids, gel });
}
