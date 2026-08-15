#!/usr/bin/env node
/**
 * diagnose-recovery.mjs — Capturador de diagnóstico para leitora Control iD
 * que entra em boot loop / recovery.
 *
 * Cenário: a leitora sobe em modo web, fica alguns minutos, depois cai pro
 * modo de recuperação e reinicia. Este script fica em ciclo:
 *   - tenta logar a cada poucos segundos;
 *   - quando a web está de pé, baixa system_information + get_ac_log (log de
 *     diagnóstico) + export_audit_logs (foco na categoria boot);
 *   - detecta a transição UP -> DOWN e registra a hora exata da queda e o
 *     uptime do último capture (revela a cadência do crash);
 *   - repete indefinidamente, então cada ciclo pega o "rabo" do log logo antes
 *     da queda — que é onde costuma aparecer o motivo (watchdog, OOM, temperatura,
 *     brownout de energia / PoE insuficiente).
 *
 * Uso (PowerShell):
 *   node tools/diagnose-recovery.mjs --ip 192.168.0.129 --user admin --pass admin
 *
 * Opções:
 *   --ip     <ip>        IP da leitora            (obrigatório)
 *   --user   <login>     usuário web              (default: admin)
 *   --pass   <senha>     senha web                (default: admin)
 *   --port   <porta>     porta                    (default: 80, ou 443 se --https)
 *   --https              usa HTTPS (aceita certificado self-signed)
 *   --interval <seg>     intervalo entre pings    (default: 5)
 *   --out    <pasta>     pasta de saída           (default: ./diag-<ip>)
 *
 * Saída: um arquivo .txt por capture em <out>/, mais um events.log com a linha
 * do tempo (UP/DOWN, uptime, versão). Basta me mandar o events.log + os 2-3
 * capturas mais recentes antes de uma queda.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';

// ─── args ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { user: 'admin', pass: 'admin', interval: 5, https: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--https') { a.https = true; continue; }
    const v = argv[i + 1];
    if (k === '--ip') a.ip = v, i++;
    else if (k === '--user') a.user = v, i++;
    else if (k === '--pass') a.pass = v, i++;
    else if (k === '--port') a.port = parseInt(v, 10), i++;
    else if (k === '--interval') a.interval = parseFloat(v), i++;
    else if (k === '--out') a.out = v, i++;
  }
  if (!a.ip) {
    console.error('ERRO: faltou --ip. Ex: node tools/diagnose-recovery.mjs --ip 192.168.0.129 --user admin --pass admin');
    process.exit(1);
  }
  a.port = a.port || (a.https ? 443 : 80);
  a.proto = a.https ? 'https' : 'http';
  a.out = a.out || `./diag-${a.ip.replace(/[^\d.]/g, '_')}`;
  return a;
}

const args = parseArgs(process.argv);
fs.mkdirSync(args.out, { recursive: true });
const eventsPath = path.join(args.out, 'events.log');

function stamp() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}
function fileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}
function logEvent(line) {
  const entry = `[${stamp()}] ${line}`;
  console.log(entry);
  fs.appendFileSync(eventsPath, entry + '\n');
}

// ─── HTTP helpers (mesma auth do adapter: ?session= na query) ───────
function request(pathName, body, session, timeoutMs = 15000) {
  const mod = args.proto === 'https' ? https : http;
  const fullPath = session
    ? `${pathName}${pathName.includes('?') ? '&' : '?'}session=${encodeURIComponent(session)}`
    : pathName;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      host: args.ip, port: args.port, path: fullPath, method: 'POST',
      rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function login() {
  const res = await request('/login.fcgi', JSON.stringify({ login: args.user, password: args.pass }), null, 10000);
  let json;
  try { json = JSON.parse(res.body); } catch { throw new Error(`login: resposta não-JSON (status ${res.status})`); }
  if (!json.session) throw new Error(`login sem session: ${res.body.slice(0, 200)}`);
  return { session: json.session, message: json.message };
}

async function capture(session) {
  const files = {};
  // system_information: versão, uptime, storage, rede
  try {
    const r = await request('/system_information.fcgi', '{}', session, 15000);
    files.system_information = r.body;
  } catch (e) { files.system_information = `ERRO: ${e.message}`; }
  // get_ac_log: log de diagnóstico do firmware (texto puro)
  try {
    const r = await request('/get_ac_log.fcgi', '{}', session, 30000);
    files.diagnostic_log = r.body;
  } catch (e) { files.diagnostic_log = `ERRO: ${e.message}`; }
  // audit logs com todas as categorias (boot é a chave aqui)
  try {
    const cats = { config: 1, api: 1, usb: 1, network: 1, time: 1, online: 1, menu: 1, boot: 1, push_server: 1 };
    const r = await request('/export_audit_logs.fcgi', JSON.stringify(cats), session, 30000);
    files.audit_log = r.body;
  } catch (e) { files.audit_log = `ERRO: ${e.message}`; }
  return files;
}

function extractUptimeAndVersion(sysInfoRaw) {
  let version = '?', uptime = '?';
  try {
    const j = JSON.parse(sysInfoRaw);
    version = j.version ?? j.firmware ?? '?';
    // uptime pode vir em vários nomes dependendo do fw
    uptime = j.uptime ?? j.up_time ?? j.system_uptime ?? (j.system && j.system.uptime) ?? '?';
  } catch { /* não-JSON */ }
  return { version, uptime };
}

// ─── loop principal ────────────────────────────────────────────────
let webUp = false;
let lastCapture = null;
let cycle = 0;

async function tick() {
  try {
    const { session, message } = await login();
    if (!webUp) {
      webUp = true;
      cycle++;
      logEvent(`WEB UP  (ciclo ${cycle})${message ? ` — msg: ${message}` : ''}`);
    }
    const files = await capture(session);
    const { version, uptime } = extractUptimeAndVersion(files.system_information);
    const base = path.join(args.out, `capture_${fileStamp()}_cycle${cycle}`);
    fs.writeFileSync(`${base}_system_information.txt`, files.system_information);
    fs.writeFileSync(`${base}_diagnostic_log.txt`, files.diagnostic_log);
    fs.writeFileSync(`${base}_audit_log.txt`, files.audit_log);
    lastCapture = { at: stamp(), version, uptime };
    logEvent(`  capture OK — fw ${version}, uptime ${uptime}  -> ${path.basename(base)}_*.txt`);
    await request('/logout.fcgi', '{}', session, 5000).catch(() => {});
  } catch (e) {
    if (webUp) {
      webUp = false;
      const info = lastCapture ? ` | último capture: ${lastCapture.at} (uptime ${lastCapture.uptime}, fw ${lastCapture.version})` : '';
      logEvent(`WEB DOWN / RECOVERY — ${e.message}${info}`);
    }
    // silêncio enquanto continua caída, pra não poluir
  }
}

logEvent(`=== monitor iniciado: ${args.proto}://${args.ip}:${args.port} user=${args.user} intervalo=${args.interval}s ===`);
logEvent(`Saída em: ${path.resolve(args.out)}`);
tick();
setInterval(tick, Math.max(1000, args.interval * 1000));
