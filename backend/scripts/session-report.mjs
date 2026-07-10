#!/usr/bin/env node
/**
 * Rapport de session de test — fusionne les logs `access-*.jsonl` et `ui-*.jsonl`
 * et sort une TIMELINE LISIBLE par testeur (page → clic → action → réponse), en
 * ignorant le bruit (polling / lectures GET / préflights).
 *
 * Usage :
 *   node scripts/session-report.mjs [YYYY-MM-DD] [matricule]
 *   node scripts/session-report.mjs               # aujourd'hui, tous les testeurs
 *   node scripts/session-report.mjs 2026-07-02
 *   node scripts/session-report.mjs 2026-07-02 STGQ667
 *
 * LOG_DIR (env) surcharge le dossier des logs (défaut : <backend>/logs).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const date = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : today();
const onlyMatricule = process.argv[2] && !/^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
  ? process.argv[2]
  : process.argv[3] || null;

const dir = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.join(process.cwd(), 'logs');

function readJsonl(file) {
  const full = path.join(dir, file);
  if (!existsSync(full)) return [];
  return readFileSync(full, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const access = readJsonl(`access-${date}.jsonl`);
const ui = readJsonl(`ui-${date}.jsonl`);

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const hhmmss = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
const who = (m) => m || '(anonyme)';

// Construit la liste d'événements « concrets ».
const events = [];

for (const e of ui) {
  if (e.type === 'page') events.push({ ts: e.ts, m: who(e.matricule), kind: 'PAGE', text: e.path ?? '' });
  else if (e.type === 'click') events.push({ ts: e.ts, m: who(e.matricule), kind: 'CLICK', text: `«${e.label ?? ''}»` });
}

for (const a of access) {
  const isTelemetry = typeof a.path === 'string' && a.path.endsWith('/telemetry');
  const isMutation = MUTATIONS.has(a.method) && !isTelemetry;
  const isError = a.status >= 400;

  if (isMutation) {
    let text = `${a.method} ${a.path} → ${a.status}`;
    if (isError && a.responseBody) text += `  ${extractMessage(a.responseBody)}`;
    events.push({ ts: a.ts, m: who(a.matricule), kind: 'ACTION', text });
  } else if (isError && a.status !== 401) {
    // Vraies erreurs (400/403/404/5xx). Les 401 (tokens expirés) → comptés à part.
    events.push({
      ts: a.ts,
      m: who(a.matricule),
      kind: 'ERREUR',
      text: `${a.method} ${a.path} → ${a.status}  ${extractMessage(a.responseBody)}`,
    });
  }
}

function extractMessage(responseBody) {
  if (!responseBody) return '';
  try {
    const obj = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
    const msg = obj?.message ?? obj?.error ?? '';
    return msg ? `« ${Array.isArray(msg) ? msg.join(', ') : msg} »` : '';
  } catch {
    return '';
  }
}

// Regroupe par testeur.
const byUser = new Map();
for (const ev of events) {
  if (onlyMatricule && ev.m !== onlyMatricule) continue;
  if (!byUser.has(ev.m)) byUser.set(ev.m, []);
  byUser.get(ev.m).push(ev);
}

// Compte les 401 par testeur (indicateur de sessions expirées).
const expired = new Map();
for (const a of access) {
  if (a.status === 401) expired.set(who(a.matricule), (expired.get(who(a.matricule)) ?? 0) + 1);
}

console.log(`\n========================================================`);
console.log(`  Rapport de session — ${date}`);
console.log(`  Dossier : ${dir}`);
console.log(`  Fichiers : access=${access.length} lignes, ui=${ui.length} lignes`);
console.log(`========================================================`);

if (byUser.size === 0) {
  console.log(`\nAucune activité concrète trouvée${onlyMatricule ? ` pour ${onlyMatricule}` : ''}.`);
  process.exit(0);
}

const sortedUsers = [...byUser.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [m, evs] of sortedUsers) {
  evs.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const pages = evs.filter((e) => e.kind === 'PAGE').length;
  const clicks = evs.filter((e) => e.kind === 'CLICK').length;
  const actions = evs.filter((e) => e.kind === 'ACTION').length;
  const errors = evs.filter((e) => e.kind === 'ERREUR').length;
  console.log(
    `\n▓ ${m}  —  ${pages} pages · ${clicks} clics · ${actions} actions · ${errors} erreurs` +
      `${expired.get(m) ? ` · ${expired.get(m)} sessions expirées (401)` : ''}`,
  );
  for (const ev of evs) {
    const tag = ev.kind.padEnd(6);
    console.log(`   ${hhmmss(ev.ts)}  ${tag} ${ev.text}`);
  }
}
console.log('');
