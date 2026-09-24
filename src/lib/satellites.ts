// Satellites en direct : éléments orbitaux TLE de Celestrak (cache 2 h) + propagation SGP4 via satellite.js.
import { eciToGeodetic, gstime, propagate, twoline2satrec, json2satrec } from "satellite.js";

import fs from 'node:fs/promises';
import path from 'node:path';
import {dataDir,resourcesDir} from './runtime';
export interface Tle {
  omm?: Parameters<typeof json2satrec>[0];
  name: string;
  group: string;
  l1: string;
  l2: string;
}

export interface IssPosition {
  name: string;
  lat: number;
  lon: number;
  altKm: number;
  speedKmh: number;
}

// [groupe Celestrak, nombre max de satellites (0 = tous)]
const GROUPS: [string, number][] = [
  ["active", 0],
];

let cache: { at: number; tles: Tle[]; warning?:string } | null = null;
let pending:Promise<Tle[]>|null=null,lastAttempt=0,warning='';
const TLE_CACHE_MS=2*3600_000;
export function catalogueInfo(){const epochs=(cache?.tles??[]).map(t=>t.omm?.EPOCH).filter((x):x is string=>typeof x==="string").sort();return {oldestEpoch:epochs[0]??null,fetchedAt:cache?new Date(cache.at).toISOString():null,stale:!!warning||!cache||Date.now()-cache.at>TLE_CACHE_MS,warning};}
function record(t:Tle){return t.omm?json2satrec(t.omm):twoline2satrec(t.l1,t.l2);}
export async function fetchTles():Promise<Tle[]>{
 if(cache&&Date.now()-cache.at<TLE_CACHE_MS&&!warning)return cache.tles;
 if(pending)return pending;
 pending=(async()=>{
  if(!cache){for(const file of [path.join(dataDir(),'space-orbits-active.json'),path.join(resourcesDir(),'public','space-seed.json')]){try{const d=JSON.parse(await fs.readFile(file,'utf8'));if(Array.isArray(d.tles)&&d.tles.length&&Number.isFinite(d.at)){cache=d;warning=d.warning||'';break;}}catch{}}}
  if(Date.now()-lastAttempt<3600_000)return cache?.tles??[];
  lastAttempt=Date.now();const out:Tle[]=[];let failed=0;
  for(const [group,max] of GROUPS){try{const r=await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP='+group+'&FORMAT=json',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(String(r.status));const data=await r.json();if(!Array.isArray(data)||!data.length)throw Error('empty');for(const omm of (max?data.slice(0,max):data)){if(!Number.isFinite(omm.NORAD_CAT_ID)||!omm.EPOCH)continue;out.push({name:String(omm.OBJECT_NAME),group:/STARLINK/i.test(omm.OBJECT_NAME)?'starlink':/GPS|GALILEO|BEIDOU/i.test(omm.OBJECT_NAME)?'navigation':/ISS|CSS |TIANGONG/i.test(omm.OBJECT_NAME)?'stations':'autres',l1:'',l2:'',omm});}}catch{failed++;}}
  if(out.length){cache={at:Date.now(),tles:out};warning=failed?'Catalogue partiel : certains groupes sont indisponibles.':'';cache.warning=warning;await fs.writeFile(path.join(dataDir(),'space-orbits.json'),JSON.stringify(cache)).catch(()=>{});}
  else warning='Hors ligne : dernier catalogue connu, précision réduite si ancien.';
  return cache?.tles??[];
 })().finally(()=>{pending=null;});return pending;
}

/** Positions géographiques de tous les satellites (SGP4 côté serveur — la page /espace les redessine). */
export async function positionsNow(atMs?: number): Promise<{ name: string; group: string; lat: number; lon: number; altKm:number; id:number; epoch:string }[]> {
  const tles = await fetchTles();
  const now = atMs ? new Date(atMs) : new Date();
  const gmst = gstime(now);
  const out: { name: string; group: string; lat: number; lon: number; altKm:number; id:number; epoch:string }[] = [];
  for (const t of tles) {
    try {
      const rec = record(t);
      const pv = propagate(rec, now);
      if (!pv || typeof pv.position === "boolean" || !pv.position) continue;
      const geo = eciToGeodetic(pv.position, gmst);
      out.push({ name: t.name, group: t.group, lat: (geo.latitude * 180) / Math.PI, lon: (geo.longitude * 180) / Math.PI,altKm:geo.height,id:Number(t.omm?.NORAD_CAT_ID??t.l1.slice(2,7)),epoch:t.omm?.EPOCH??"date inconnue" });
    } catch {
      /* élément invalide : on l'ignore */
    }
  }
  return out;
}

/** Position de la Station spatiale internationale en ce instant (latitude/longitude en degrés). */
export async function issNow(): Promise<IssPosition | null> {
  const tles = await fetchTles();
  const iss = tles.find((t) => /ISS \(ZARYA\)|ISS \(ZARYA\)|CSS \(TIANHE\)/i.test(t.name) && t.name.includes("ISS"));
  const rec = iss ? record(iss) : null;
  if (!rec) return null;
  const now = new Date();
  const pv = propagate(rec, now);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = gstime(now);
  const geo = eciToGeodetic(pv.position, gmst);
  const speed = pv.velocity && typeof pv.velocity !== "boolean" ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
  return {
    name: iss?.name ?? "ISS",
    lat: (geo.latitude * 180) / Math.PI,
    lon: (geo.longitude * 180) / Math.PI,
    altKm: geo.height,
    speedKmh: speed * 3600,
  };
}
