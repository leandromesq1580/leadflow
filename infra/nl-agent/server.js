// NL Agent — API do serviço (porta 3900, atrás do nginx em /nl-agent/)
//
// MULTI-CLIENTE (12/08/2026): cada agente do Lead4Pro tem seu diretório em
// clients/<id>/ (.env com credenciais dele, profile/ e out/ próprios). A raiz
// (/opt/nl-agent) segue sendo o book do Leandro — comportamento legado intacto.
//
// POST /run[?client=ID&k=SECRET]  → dispara/enfileira a varredura (fila global de 1)
// GET  /status[?client=ID]        → { running, queued, awaiting_mfa, ... }
// POST /mfa[?client=ID]           → entrega o código de verificação digitado
// GET  /data?k=SECRET[&client=ID] → JSON completo (protegido)
// POST /clients?k=SECRET          → provisiona cliente novo {client, nl_user, nl_pass}
//
// Ops com client= exigem k=SECRET (mexem com credenciais alheias); a raiz mantém
// /run e /mfa abertos por compatibilidade com o dashboard antigo.
const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const CLIENTS = path.join(BASE, 'clients');

const env = {};
try {
  fs.readFileSync(path.join(BASE, '.env'), 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
    if (m) env[m[1]] = m[2];
  });
} catch (e) { /* .env ainda não criado */ }

const CLIENT_RE = /^[a-z0-9-]{6,64}$/;
function baseDe(client) {
  if (!client) return BASE;
  if (!CLIENT_RE.test(client)) return null;
  return path.join(CLIENTS, client);
}
function outDe(client) { return path.join(baseDe(client), 'out'); }

// fila global: 1 varredura por vez (cada uma abre um Chrome inteiro)
const jobs = {};             // chave ('' = raiz) → { running, queued, startedAt }
const fila = [];
function jobDe(client) {
  const k = client || '';
  if (!jobs[k]) jobs[k] = { running: false, queued: false, startedAt: null };
  return jobs[k];
}
function algoRodando() { return Object.values(jobs).some(j => j.running); }

function dispara(client) {
  const job = jobDe(client);
  job.queued = false;
  job.running = true;
  job.startedAt = new Date().toISOString();
  const cbase = baseDe(client);
  const out = path.join(cbase, 'out');
  fs.mkdirSync(out, { recursive: true });
  const logStream = fs.openSync(path.join(out, 'last-run.log'), 'w');
  const child = spawn('xvfb-run', ['-a', 'python3', path.join(BASE, 'scrape.py')], {
    stdio: ['ignore', logStream, logStream],
    detached: false,
    env: { ...process.env, NL_CLIENT_BASE: client ? cbase : '' },
  });
  child.on('exit', (code) => {
    job.running = false;
    fs.appendFileSync(path.join(out, 'last-run.log'), `\n[exit ${code}] ${new Date().toISOString()}\n`);
    const prox = fila.shift();
    if (prox !== undefined) dispara(prox);
  });
}

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/** valida client + exige SECRET pras operações de cliente; devolve '' pra raiz */
function clienteDe(req, res, { exigeKey }) {
  const client = String(req.query.client || '').trim();
  if (!client) return '';
  if (!CLIENT_RE.test(client)) { res.status(400).json({ ok: false, error: 'client inválido' }); return null; }
  if (!fs.existsSync(baseDe(client))) { res.status(404).json({ ok: false, error: 'cliente não provisionado' }); return null; }
  if (exigeKey && (!env.SECRET || req.query.k !== env.SECRET)) { res.status(403).json({ ok: false, error: 'forbidden' }); return null; }
  return client;
}

app.post('/run', (req, res) => {
  const client = clienteDe(req, res, { exigeKey: true });
  if (client === null) return;
  const job = jobDe(client);
  if (job.running) return res.json({ ok: true, status: 'already_running', started_at: job.startedAt });
  if (job.queued) return res.json({ ok: true, status: 'queued' });
  if (algoRodando()) {
    job.queued = true;
    fila.push(client);
    return res.json({ ok: true, status: 'queued', ahead: fila.length });
  }
  dispara(client);
  res.json({ ok: true, status: 'started', started_at: job.startedAt });
});

app.get('/status', (req, res) => {
  const client = clienteDe(req, res, { exigeKey: false });
  if (client === null) return;
  const job = jobDe(client);
  const out = outDe(client);
  let lastRun = null, lastError = null, changes = null, portalLastUpdated = null, progress = null;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(out, 'nl-data.json'), 'utf8'));
    lastRun = d.generated_at;
    changes = (d.changes || []).length;
    portalLastUpdated = d.portal_last_updated;
  } catch (e) { /* ainda sem dados */ }
  try { lastError = fs.readFileSync(path.join(out, 'last-error.txt'), 'utf8').trim(); } catch (e) { /* sem erro */ }
  let awaitingMfa = false;
  if (job.running) {
    try {
      const lines = fs.readFileSync(path.join(out, 'last-run.log'), 'utf8').trim().split('\n').filter(l => l.trim());
      progress = lines[lines.length - 1] || null;
    } catch (e) { /* log ainda vazio */ }
    awaitingMfa = fs.existsSync(path.join(out, 'awaiting-mfa.txt'));
  }
  res.json({ ok: true, running: job.running, queued: job.queued, awaiting_mfa: awaitingMfa, started_at: job.startedAt, progress, last_run: lastRun, last_error: lastError, changes_count: changes, portal_last_updated: portalLastUpdated });
});

// Recebe o código de verificação digitado pelo usuário (banner do Lead4Pro ou
// dashboard antigo). Gravado em arquivo e consumido pelo scraper; nunca logado.
app.post('/mfa', express.json(), (req, res) => {
  const client = clienteDe(req, res, { exigeKey: true });
  if (client === null) return;
  const out = outDe(client);
  const code = String((req.body && req.body.code) || '').trim();
  if (!/^[0-9]{4,10}$/.test(code)) return res.status(400).json({ ok: false, error: 'código inválido' });
  if (!fs.existsSync(path.join(out, 'awaiting-mfa.txt'))) return res.status(409).json({ ok: false, error: 'nenhuma verificação pendente' });
  fs.writeFileSync(path.join(out, 'mfa-code.txt'), code, { mode: 0o600 });
  res.json({ ok: true });
});

app.get('/data', (req, res) => {
  if (!env.SECRET || req.query.k !== env.SECRET) return res.status(403).json({ error: 'forbidden' });
  const client = clienteDe(req, res, { exigeKey: false });
  if (client === null) return;
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(fs.readFileSync(path.join(outDe(client), 'nl-data.json'), 'utf8'));
  } catch (e) {
    res.status(404).json({ error: 'sem dados ainda — rode POST /run' });
  }
});

// Provisiona um cliente novo: cria clients/<id>/ com .env (credenciais dele).
// As credenciais chegam por HTTPS e vivem SÓ neste arquivo chmod 600 — nunca em
// banco de dados, nunca em log.
app.post('/clients', express.json(), (req, res) => {
  if (!env.SECRET || req.query.k !== env.SECRET) return res.status(403).json({ ok: false, error: 'forbidden' });
  const { client, nl_user, nl_pass } = req.body || {};
  if (!CLIENT_RE.test(String(client || ''))) return res.status(400).json({ ok: false, error: 'client inválido (a-z 0-9 hífen, 6-64)' });
  if (!nl_user || !nl_pass || String(nl_user).includes('\n') || String(nl_pass).includes('\n')) {
    return res.status(400).json({ ok: false, error: 'credenciais ausentes ou inválidas' });
  }
  const cbase = path.join(CLIENTS, client);
  fs.mkdirSync(path.join(cbase, 'out'), { recursive: true });
  const envPath = path.join(cbase, '.env');
  const jaExistia = fs.existsSync(envPath);
  fs.writeFileSync(envPath, `NL_USER=${nl_user}\nNL_PASS=${nl_pass}\nMFA_CHANNEL=email\n`, { mode: 0o600 });
  res.json({ ok: true, client, atualizado: jaExistia });
});

app.listen(3900, '127.0.0.1', () => console.log('nl-agent multi-cliente na 3900'));
