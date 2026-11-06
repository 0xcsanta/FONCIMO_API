import test from 'node:test';
import assert from 'node:assert/strict';
import {computePotentiel} from '../lib/potential/potentiel.mjs';
import {clientPotential, previewPotential, loadClientPotential} from '../lib/potential/client-potential.mjs';
import {readOnlySource} from '../lib/potential/read-source.mjs';
const p={egrid:'CH000000000001',numero:'TEST',commune:'Pully',surface_m2:1000,emprise_batie_m2:100,surface_constructible_m2:200,niveaux_max:3,pente_pct:5,zone_affectation:'Habitation',indice_utilisation:0.2,buildings:[{egrid:'CH000000000001',egid:1,categorie:1020,surface_sol_m2:100,nb_etages:1,annee_construction:1947,nb_logements:1}],rings:[],center:null};
test('La note est exactement celle de la meilleure stratégie',()=>{const a=computePotentiel(p,2026),b=clientPotential(p,2026);assert.equal(b.note,a.strategies[a.meilleure].score100)});
test('Détail limité aux facteurs de la meilleure voie',()=>{const a=clientPotential(p,2026);assert.equal(a.facteurs.length,a.strategies[a.meilleure].facteurs.length)});
test('Niveaux manquants : pas de faux zéro',()=>assert.equal(clientPotential({...p,niveaux_max:null},2026).note,null));
test('Affectation exclue : absence de note',()=>assert.equal(clientPotential({...p,zone_affectation:'Besoins publics'},2026).note,null));
test('Aperçu sans trois notes ni contributions dévoilées',()=>{const a=previewPotential(clientPotential(p,2026));assert.equal(a.strategies,undefined);assert.ok(a.facteurs.every(f=>f.points===undefined))});
test('Règle patrimoniale originale conservée',()=>assert.equal(clientPotential({...p,note_recensement:'2'},2026).strategies.reconstruction.statut,'non_applicable'));
test('Transport : GET seulement et EGRID exact',async()=>{
 const calls=[];const source=readOnlySource('https://example.test','test',async(url,options)=>{calls.push([url,options.method]);const rows=url.includes('/batiment?')?p.buildings:[p];return new Response(JSON.stringify(rows),{headers:{'content-range':'0-0/1'}})});
 const r=await loadClientPotential(source,p.egrid);assert.ok(r.note!=null);assert.equal(calls.length,2);assert.ok(calls.every(([url,method])=>method==='GET'&&new URL(url).searchParams.get('egrid')==='eq.'+p.egrid));
});
test('Liste des bâtiments tronquée : refus explicite',async()=>{
 const source=readOnlySource('https://example.test','test',async url=>new Response(JSON.stringify(url.includes('/batiment?')?p.buildings:[p]),{headers:{'content-range':url.includes('/batiment?')?'0-0/2':'0-0/1'}}));await assert.rejects(()=>loadClientPotential(source,p.egrid));
});
