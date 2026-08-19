const express = require("express");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs");
const { execFileSync } = require("child_process");

const app = express();
app.use(express.json({ limit: "50mb" }));

// === MULTI-TENANT ENV (defaults = legado da Regiane) ===
const PORT = parseInt(process.env.PORT || "3456", 10);
const SESSION_DIR = process.env.SESSION_DIR || "./.wwebjs_auth";
const INSTANCE_NAME = process.env.INSTANCE_NAME || "default";
const BRIDGE_OWNER_BUYER_ID = process.env.BRIDGE_OWNER_BUYER_ID || "";
const API_KEY = process.env.API_KEY || "leadflow-bridge-2026";
const FORWARD_URL = process.env.FORWARD_URL || "https://lead4producers.com/api/webhook/wa-bridge";
const FORWARD_KEY = process.env.FORWARD_KEY || "leadflow-bridge-2026";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nkedavhzzddxuhpxcofd.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "wa-media";
const SESSION_PATH = `${SESSION_DIR}/session-${INSTANCE_NAME}`;

let currentQR = null;
let isReady = false;
let backfilled = false; // B: histórico só puxa 1x por processo

// === GUARD DE PROCESSO (crise 2026-07-20) ===
// git-main do wwebjs registra handler 'framenavigated' que chama pupPage.evaluate()
// enquanto a navegacao pode destruir o contexto -> rejeicao nao-tratada matava o Node
// inteiro (server.js nao tinha guard). Erros benignos de navegacao/puppeteer sao logados
// e IGNORADOS (o wwebjs re-injeta no proximo evento). A bridge nunca cai por erro assincrono solto.
const BENIGN_RE = /Execution context was destroyed|Execution context is not available|detached Frame|Target closed|Protocol error|Session closed|Node is either not visible|frame got detached|Cannot read properties of (?:null|undefined)/i;
process.on("unhandledRejection", (reason) => {
  const m = (reason && reason.message) || String(reason);
  if (BENIGN_RE.test(m)) { console.warn(`[${INSTANCE_NAME}][ignore-nav] ${m}`); return; }
  console.error(`[${INSTANCE_NAME}][unhandledRejection] ${m}`);
});
process.on("uncaughtException", (err) => {
  const m = (err && err.message) || String(err);
  if (BENIGN_RE.test(m)) { console.warn(`[${INSTANCE_NAME}][ignore-nav] ${m}`); return; }
  console.error(`[${INSTANCE_NAME}][uncaughtException] ${m}`);
});


async function uploadToStorage(buffer, filename, mimetype) {
  const safeName = String(filename || "media.bin").replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
  const path = `incoming/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await withTimeout(fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey": SUPABASE_KEY,
          "Content-Type": mimetype || "application/octet-stream",
          "x-upsert": "true",
        },
        body: buffer,
      }), 30000, "MEDIA_UPLOAD");
      if (res.ok) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      console.error(`[${INSTANCE_NAME}][Upload] tentativa ${attempt}/3 non-200:`, res.status);
    } catch (e) {
      console.error(`[${INSTANCE_NAME}][Upload] tentativa ${attempt}/3:`, e.message);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  return null;
}

// Pin OPCIONAL da versao do WhatsApp Web (gated por env WA_WEB_VERSION). Sem a env =
// comportamento atual (WA serve a versao mais nova). Com a env = forca aquela versao,
// pra contornar quebra de downloadMedia quando o WA atualiza e o wwebjs 1.34.7 nao
// acompanha. So a bridge que TIVER a env usa isso; as outras ficam iguais.
// === ECONOMIA DE MEMORIA (opt-in por instancia: env CHROME_LEAN=1) ===
// Diagnostico 2026-08-07: 46 bridges x ~1,1 GB de Chrome numa caixa de 47 GB. RAM e
// swap 100% cheios -> o renderer morre no meio do downloadMedia e a funcao devolve
// VAZIO sem lancar erro (por isso nao existe nenhum log de midia). Texto passa;
// imagem, audio e documento se perdem. Estas flags cortam processos e limitam o heap.
// SEM a env, nada muda: a frota segue exatamente como esta.
const CHROME_LEAN = (process.env.CHROME_LEAN || "").trim() === "1";
const LEAN_ARGS = CHROME_LEAN ? [
  "--disable-features=IsolateOrigins,site-per-process",
  "--renderer-process-limit=2",
  "--js-flags=--max-old-space-size=512",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-default-apps",
  "--mute-audio",
] : [];

const WA_WEB_VERSION = (process.env.WA_WEB_VERSION || "").trim();

// === BLINDAGEM (2026-07-24, autorizada): auto-recovery de init/QR/envio ===
// Estado do vigia: ultima emissao de QR e ultimo sinal de vida do boot.
let lastQrAt = 0;
let bootAliveAt = Date.now();
let lookupTick = 0;
let lookupFails = 0;
// Promise com prazo: envio pendurado (Chrome zumbi) vira erro -> recover(), em vez
// de segurar o HTTP pra sempre (caso "conectada mas nao envia").
function withTimeout(p, ms, tag) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${tag} timeout ${ms}ms`)), ms))]);
}
// Limpa locks Singleton e Chromes orfaos do PROPRIO perfil antes de abrir o navegador —
// e o lock zumbi que deixava todo init em "Waiting failed: 30000ms" pra sempre.
function cleanProfileBeforeInit(wipeSession = false) {
  // client.destroy()/logout() nem sempre encerram o Chrome. Se ele continuar vivo,
  // a reinicializacao entra em loop com "browser is already running" e o usuario
  // fica eternamente em "Iniciando bridge" sem receber o QR.
  try {
    execFileSync("pkill", ["-9", "-f", SESSION_PATH], { stdio: "ignore" });
  } catch {}

  if (wipeSession) {
    try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch {}
    return;
  }

  for (const lf of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    try { fs.rmSync(`${SESSION_PATH}/${lf}`, { force: true }); } catch {}
  }
}

try {
  cleanProfileBeforeInit(false);
  console.log(`[${INSTANCE_NAME}][BOOT] locks/chromes do perfil limpos`);
} catch {}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: INSTANCE_NAME, dataPath: SESSION_DIR }),
  ...(WA_WEB_VERSION ? {
    webVersion: WA_WEB_VERSION,
    webVersionCache: { type: "remote", remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WA_WEB_VERSION}.html` },
  } : {}),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", ...LEAN_ARGS],
  },
});

// Resolve um @lid (formato novo do WhatsApp) pro número de telefone REAL.
// Usa a API dedicada getContactLidAndPhone (retorna { lid, pn }). Sem isso, o
// remetente chega como ID @lid e o webhook não consegue casar com o lead.
// CACHE: cada chamada é um pupPage.evaluate (round-trip pro Chrome). Sem cache,
// rajadas de mensagens estressam o navegador e ele crasha (Protocol error).
const lidPhoneCache = new Map(); // wid -> phone (string) | null
async function lidToPhone(wid) {
  if (lidPhoneCache.has(wid)) return lidPhoneCache.get(wid);
  let phone = null;
  try {
    const r = await client.getContactLidAndPhone([wid]);
    const pn = r && r[0] && r[0].pn; // ex: '12037261379@c.us'
    if (pn) phone = String(pn).replace(/@.*/, "");
  } catch (e) { console.error(`[${INSTANCE_NAME}][lidToPhone]`, e.message); }
  lidPhoneCache.set(wid, phone);
  // poda se crescer demais (mantem os 1000 mais recentes na pratica)
  if (lidPhoneCache.size > 2000) {
    const keep = Array.from(lidPhoneCache.entries()).slice(-1000);
    lidPhoneCache.clear();
    for (const [k, v] of keep) lidPhoneCache.set(k, v);
  }
  return phone;
}

client.on("qr", async (qr) => {
  lastQrAt = Date.now(); bootAliveAt = Date.now();
  currentQR = await qrcode.toDataURL(qr);
  console.log(`[${INSTANCE_NAME}][QR] Generated`);
});
client.on("ready", () => {
  isReady = true; currentQR = null; bootAliveAt = Date.now();
  console.log(`[${INSTANCE_NAME}][READY] Number:`, client.info?.wid?.user);
  // B: backfill agora é SÓ via endpoint manual /backfill (auto-on-ready removido —
  // pesado demais em contas grandes tipo Regiane, e não deve atrasar o inbound).
});
client.on("authenticated", () => { bootAliveAt = Date.now(); console.log(`[${INSTANCE_NAME}][AUTH] ok`); });

// === AUTO-RECOVERY: religa sozinho quando cai (queda de rede, logout, sessão rejeitada) ===
// Antes, o handler de "disconnected" só setava isReady=false e o bridge ficava preso
// (ready:false + hasQR:false) ate alguem reiniciar na mao. Agora ele se recupera sozinho.
let recovering = false;
async function recover(reason, forceWipe = false) {
  if (recovering) return;
  recovering = true;
  bootAliveAt = Date.now(); lastQrAt = 0;
  isReady = false;
  currentQR = null;
  const wipe = forceWipe || /LOGOUT|UNPAIRED|CONFLICT|BANNED|AUTH/i.test(String(reason));
  console.log(`[${INSTANCE_NAME}][RECOVER] reason=${reason} wipeSession=${wipe}`);
  try { await client.destroy(); } catch (e) { console.error(`[${INSTANCE_NAME}][destroy]`, e.message); }
  cleanProfileBeforeInit(wipe);
  if (wipe) console.log(`[${INSTANCE_NAME}][RECOVER] sessao e Chrome limpos — vai gerar QR novo`);
  setTimeout(() => {
    client.initialize()
      .then(() => { recovering = false; console.log(`[${INSTANCE_NAME}][RECOVER] reinicializado`); })
      .catch((e) => { recovering = false; console.error(`[${INSTANCE_NAME}][reinit]`, e.message); });
  }, 3000);
}

client.on("auth_failure", (m) => { console.log(`[${INSTANCE_NAME}][AUTH FAIL]`, m); recover("AUTH_FAILURE"); });
client.on("disconnected", (r) => { console.log(`[${INSTANCE_NAME}][DISCONNECTED]`, r); recover(r); });

// VIGIA de init/QR (30 em 30s):
//  - travou no boot (2min sem QR, sem auth, sem ready) -> recover() sozinho
//  - QR parado ha 10min sem scan -> recover() gera QR FRESCO (cliente sempre acha QR vivo)
setInterval(() => {
  try {
    if (isReady || recovering) {
      bootAliveAt = Date.now();
      if (isReady && !recovering && ++lookupTick >= 10) {
        lookupTick = 0;
        (async () => {
          try {
            const me = myNumber();
            if (!me) return;
            const info = await withTimeout(client.getNumberId(me), 20000, "SELFTEST");
            if (info) { lookupFails = 0; return; }
            lookupFails++;
          } catch (e) { lookupFails++; }
          if (lookupFails >= 2) {
            console.error(`[${INSTANCE_NAME}][VIGIA] consultas mortas (getNumberId falhou ${lookupFails}x) — recover()`);
            lookupFails = 0;
            recover("LOOKUP_DEAD");
          }
        })();
      }
      return;
    }
    if (currentQR) {
      if (lastQrAt && Date.now() - lastQrAt > 10 * 60 * 1000) {
        console.error(`[${INSTANCE_NAME}][VIGIA] QR parado ha ${Math.round((Date.now() - lastQrAt) / 60000)}min — renovando`);
        recover("QR_STALE");
      }
      return;
    }
    if (Date.now() - bootAliveAt > 120000) {
      console.error(`[${INSTANCE_NAME}][VIGIA] ${Math.round((Date.now() - bootAliveAt) / 1000)}s sem QR/ready — recover()`);
      recover("INIT_TIMEOUT");
    }
  } catch (e) { console.error(`[${INSTANCE_NAME}][VIGIA]`, e.message); }
}, 30000);

client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;
    if (msg.from.endsWith("@g.us")) return;

    const { media_url, media_type, media_mimetype } = await extractMedia(msg, "Media IN");

    let fromNumber = msg.from.replace("@c.us", "").replace("@lid", "");
    if (msg.from.endsWith("@lid")) {
      // Migração LID do WhatsApp: o remetente vem como @lid. Resolve pro telefone
      // REAL via API dedicada (senão o webhook não acha o lead -> mensagem some).
      let resolved = await lidToPhone(msg.from);
      if (!resolved) {
        try { const c = await msg.getContact(); if (c?.number) resolved = String(c.number); } catch (e) { console.error(`[${INSTANCE_NAME}][LID]`, e.message); }
      }
      if (resolved && /^[0-9]+$/.test(resolved)) {
        fromNumber = resolved;
      } else {
        console.warn(`[${INSTANCE_NAME}][IN] @lid sem telefone resolvido — skip:`, msg.from);
        return;
      }
    }
    if (!/^[0-9]+$/.test(fromNumber)) { console.warn(`[${INSTANCE_NAME}][IN] skip non-numeric:`, fromNumber); return; }

    const pushName = (msg._data && msg._data.notifyName) ? String(msg._data.notifyName).trim().slice(0, 80) : null;
    console.log(`[${INSTANCE_NAME}][IN]`, fromNumber, msg.type, media_type || "text", "name=" + (pushName || "-"), (msg.body || "").slice(0, 40));

    const payload = {
      wa_message_id: msgId(msg),
      from: fromNumber,
      push_name: pushName,
      to: myNumber(),
      body: msg.body || "",
      type: msg.type,
      timestamp: msg.timestamp,
      has_media: msg.hasMedia,
      media_url, media_type, media_mimetype,
      bridge_owner_buyer_id: BRIDGE_OWNER_BUYER_ID,
    };
    const r = await fetch(FORWARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": FORWARD_KEY },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error(`[${INSTANCE_NAME}][Forward] non-200:`, r.status);
  } catch (e) { console.error(`[${INSTANCE_NAME}][Forward ERR]`, e.message); }
});

// ===== HELPERS compartilhados pelas features novas (A msg do celular, B backfill) =====
// Ids enviados via /send (pelo app) pra NÃO reprocessar no message_create (senão duplica).
const recentBridgeSends = new Map(); // id -> ts
function markBridgeSend(id) {
  if (!id) return;
  recentBridgeSends.set(id, Date.now());
  if (recentBridgeSends.size > 800) {
    const cut = Date.now() - 5 * 60 * 1000;
    for (const [k, v] of recentBridgeSends) if (v < cut) recentBridgeSends.delete(k);
  }
}

// Resolve um WID (@c.us / @lid / @s.whatsapp.net) pro número em dígitos.
async function widToNumber(wid) {
  if (!wid) return "";
  let num = String(wid).replace(/@(c\.us|lid|s\.whatsapp\.net|g\.us)$/i, "");
  if (String(wid).endsWith("@lid")) {
    // API dedicada primeiro (resolve o telefone real do @lid)
    const phone = await lidToPhone(wid);
    if (phone) return phone;
    try {
      const contact = await client.getContactById(wid);
      if (contact?.number) num = String(contact.number);
      else if (contact?.id?.user && /^[0-9]+$/.test(contact.id.user)) num = contact.id.user;
    } catch (e) {}
  }
  return num;
}

async function extractMedia(msg, logTag = "Media", maxAttempts = 3) {
  let media_url = null, media_type = null, media_mimetype = null;
  if (!msg.hasMedia) return { media_url, media_type, media_mimetype };

  for (let attempt = 1; attempt <= maxAttempts && !media_url; attempt++) {
    try {
      const media = await withTimeout(msg.downloadMedia(), 45000, "MEDIA_DOWNLOAD");
      if (media && media.data) {
        const buffer = Buffer.from(media.data, "base64");
        if (!buffer.length) throw new Error("arquivo vazio");
        media_mimetype = (media.mimetype || "application/octet-stream").split(";")[0].trim();
        const ext = (media.mimetype || "").split("/")[1]?.split(";")[0] || "bin";
        const filename = media.filename || `${msg.type || "file"}.${ext}`;
        media_url = await uploadToStorage(buffer, filename, media_mimetype);
        if (media_mimetype.startsWith("image/")) media_type = "image";
        else if (media_mimetype.startsWith("audio/") || media_mimetype.includes("ogg") || media_mimetype.includes("ptt")) media_type = "audio";
        else if (media_mimetype.startsWith("video/")) media_type = "video";
        else media_type = "document";
        if (!media_url) throw new Error("upload nao retornou URL");
      } else {
        throw new Error("downloadMedia retornou vazio");
      }
    } catch (e) {
      console.error(`[${INSTANCE_NAME}][${logTag}] tentativa ${attempt}/${maxAttempts}:`, e.message);
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  return { media_url, media_type, media_mimetype };
}

async function forwardToApp(payload) {
  // GUARD: o LeadFlow rejeita com 400 "Missing fields" se faltar wa_message_id ou from.
  // Em vez de mandar payload quebrado (e poluir com 400), pula e LOGA o motivo exato.
  if (!payload || !payload.wa_message_id || !payload.from) {
    console.warn(`[${INSTANCE_NAME}][Forward] payload incompleto - pulado:`, JSON.stringify({
      id: payload && payload.wa_message_id ? payload.wa_message_id : null,
      from: payload && payload.from ? payload.from : null,
      to: payload ? payload.to : null,
      type: payload ? payload.type : null,
      direction: payload ? payload.direction : null,
    }));
    return false;
  }
  try {
    const r = await fetch(FORWARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": FORWARD_KEY },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error(`[${INSTANCE_NAME}][Forward] non-200:`, r.status, JSON.stringify({
      id: payload.wa_message_id, from: payload.from, to: payload.to, type: payload.type, direction: payload.direction,
    }));
    return r.ok;
  } catch (e) { console.error(`[${INSTANCE_NAME}][Forward ERR]`, e.message); return false; }
}

// === A: captura mensagens que o DONO mandou DO CELULAR (message_create fromMe) ===
client.on("message_create", async (msg) => {
  try {
    // CRÍTICO: ignora tudo até o sync inicial terminar (ready=true). Sem isso,
    // o message_create dispara pra todas as mensagens antigas que entram no
    // store durante o sync, cada uma chamando lidToPhone (puppeteer evaluate) —
    // engasga o sync e a instância nunca chega a READY (visto na Regiane 81+ chats).
    if (!isReady) return;
    if (!msg.fromMe) return;                                   // só saída
    const dest = msg.to || "";
    if (!dest || /@g\.us$/i.test(dest) || /broadcast|status/i.test(dest)) return; // sem grupos/status
    if (recentBridgeSends.has(msgId(msg))) return;     // já gravada pelo app (/send)
    if (recentBridgeSends.has("noack:" + (msg.to || "") + ":" + String(msg.body || "").slice(0, 60))) return; // app-send @lid/grupo sem ack
    const toNumber = await widToNumber(dest);
    if (!/^[0-9]+$/.test(toNumber)) return;
    const { media_url, media_type, media_mimetype } = await extractMedia(msg);
    const meNum = myNumber();
    if (!meNum) { console.warn(`[${INSTANCE_NAME}][OUT-celular] client.info vazio - forward pulado (evita 400)`); return; }
    console.log(`[${INSTANCE_NAME}][OUT-celular]`, toNumber, msg.type, media_type || "text", (msg.body || "").slice(0, 40));
    await forwardToApp({
      wa_message_id: msgId(msg),
      direction: "out",
      from: meNum,
      to: toNumber,
      body: msg.body || "",
      type: msg.type,
      timestamp: msg.timestamp,
      has_media: msg.hasMedia,
      media_url, media_type, media_mimetype,
      bridge_owner_buyer_id: BRIDGE_OWNER_BUYER_ID,
    });
  } catch (e) { console.error(`[${INSTANCE_NAME}][OUT-celular ERR]`, e.message); }
});

// === B: backfill do histórico dos leads do dono (fetchMessages por chat) ===
let backfillRunning = false;
async function backfillHistory(limitPerChat = 30) {
  if (!isReady) return { error: "not ready" };
  if (!SUPABASE_KEY || !BRIDGE_OWNER_BUYER_ID) return { error: "no supabase/owner" };
  if (backfillRunning) return { error: "already running" };
  backfillRunning = true;
  let imported = 0, chats = 0;
  try {
    const q = `${SUPABASE_URL}/rest/v1/leads?assigned_to=eq.${BRIDGE_OWNER_BUYER_ID}&phone=not.is.null&select=phone&limit=300`;
    const r = await fetch(q, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const leads = r.ok ? await r.json() : [];
    const myNum = myNumber();
    console.log(`[${INSTANCE_NAME}][Backfill] ${leads.length} leads pra varrer`);
    for (const lead of leads) {
      const digits = String(lead.phone || "").replace(/\D/g, "");
      if (!digits) continue;
      const chatId = await tryGetChatId(digits);
      if (!chatId) continue;
      let chat;
      try { chat = await client.getChatById(chatId); } catch (e) { continue; }
      let msgs = [];
      try { msgs = await chat.fetchMessages({ limit: limitPerChat }); } catch (e) { continue; }
      chats++;
      for (const msg of msgs) {
        try {
          const peerNum = await widToNumber(msg.fromMe ? (msg.to || chatId) : (msg.from || chatId));
          if (!/^[0-9]+$/.test(peerNum)) continue;
          const { media_url, media_type, media_mimetype } = await extractMedia(msg);
          const ok = await forwardToApp({
            wa_message_id: msgId(msg),
            direction: msg.fromMe ? "out" : "in",
            from: msg.fromMe ? myNum : peerNum,
            to: msg.fromMe ? peerNum : myNum,
            body: msg.body || "",
            type: msg.type,
            timestamp: msg.timestamp,
            has_media: msg.hasMedia,
            media_url, media_type, media_mimetype,
            bridge_owner_buyer_id: BRIDGE_OWNER_BUYER_ID,
          });
          if (ok) imported++;
        } catch (e) {}
      }
      await new Promise((r) => setTimeout(r, 350)); // espaça entre chats
    }
  } catch (e) {
    console.error(`[${INSTANCE_NAME}][Backfill ERR]`, e.message);
    backfillRunning = false;
    return { error: e.message, imported, chats };
  }
  backfillRunning = false;
  console.log(`[${INSTANCE_NAME}][Backfill] OK chats=${chats} forwarded=${imported}`);
  return { ok: true, chats, imported };
}

app.use((req, res, next) => {
  if (req.headers["apikey"] !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
});

app.get("/health", (req, res) => res.json({ ok: true, ready: isReady, instance: INSTANCE_NAME }));
app.get("/status", (req, res) => res.json({ ready: isReady, hasQR: !!currentQR, number: client.info?.wid?.user || null, instance: INSTANCE_NAME }));
app.get("/qr", (req, res) => {
  if (currentQR) return res.json({ qr: currentQR });
  res.status(404).json({ error: "No QR" });
});
app.post("/logout", async (req, res) => {
  try { await client.logout(); isReady = false; currentQR = null; res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/restart", async (req, res) => {
  try {
    await recover("MANUAL_RESET", true);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/backfill", async (req, res) => {
  const limit = parseInt(req.body?.limit || "30", 10);
  const result = await backfillHistory(limit);
  res.json(result);
});

// Apaga uma mensagem ENVIADA pelo dono desta sessão para todos no WhatsApp.
// A checagem de canRevoke é feita antes do delete: Message.delete(true) cai
// silenciosamente em "apagar só para mim" quando o prazo do WhatsApp expirou,
// o que faria o portal mentir que a mensagem sumiu para o destinatário.
app.post("/delete-message", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "Not connected" });

  const waMessageId = String(req.body?.waMessageId || "").trim();
  if (!waMessageId || waMessageId.length > 300) {
    return res.status(400).json({ error: "waMessageId required" });
  }

  try {
    const capability = await withTimeout(client.pupPage.evaluate(async (messageId) => {
      const collections = window.require("WAWebCollections");
      const message = collections.Msg.get(messageId) ||
        (await collections.Msg.getMessagesById([messageId]))?.messages?.[0];
      if (!message) return { found: false, fromMe: false, canRevoke: false };

      const actions = window.require("WAWebMsgActionCapability");
      return {
        found: true,
        fromMe: !!message.id?.fromMe,
        canRevoke: !!actions.canSenderRevokeMsg(message),
      };
    }, waMessageId), 20000, "DELETE_LOOKUP");

    if (!capability?.found) {
      return res.status(404).json({ error: "Message not found in this WhatsApp session" });
    }
    if (!capability.fromMe) {
      return res.status(403).json({ error: "Only sent messages can be deleted" });
    }
    if (!capability.canRevoke) {
      return res.status(409).json({ error: "WhatsApp delete-for-everyone window expired" });
    }

    const message = await withTimeout(client.getMessageById(waMessageId), 20000, "DELETE_GET");
    if (!message) return res.status(404).json({ error: "Message not found" });
    await withTimeout(message.delete(true, true), 30000, "DELETE");

    console.log(`[${INSTANCE_NAME}][DELETE] apagada para todos: ${waMessageId}`);
    return res.json({ success: true, deletedForEveryone: true });
  } catch (err) {
    console.error(`[${INSTANCE_NAME}][DELETE ERR]`, err.message);
    if (/detached Frame|Target closed|Protocol error|Execution context|Session closed|DELETE timeout/i.test(err.message || "")) {
      recover("DELETE_FRAME_ERROR");
    }
    return res.status(500).json({ error: err.message || "Delete failed" });
  }
});

// Recupera uma mídia específica que chegou sem arquivo. Evita varrer centenas de
// conversas: abre somente o chat informado, encontra o wa_message_id e reenvia o
// mesmo evento ao app. O webhook faz o healing idempotente da linha já existente.
let mediaRecoveryRunning = false;
app.post("/recover-media", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "not ready" });
  if (mediaRecoveryRunning) return res.status(409).json({ error: "recovery already running" });

  const digits = String(req.body?.number || "").replace(/\D/g, "");
  const requestedIds = Array.isArray(req.body?.messageIds)
    ? req.body.messageIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 100)
    : [String(req.body?.messageId || "").trim()].filter(Boolean);
  const limit = Math.min(Math.max(parseInt(req.body?.limit || "300", 10), 30), 1000);
  if (!digits || !requestedIds.length) return res.status(400).json({ error: "number and messageId(s) required" });

  mediaRecoveryRunning = true;
  try {
    const chatId = await tryGetChatId(digits);
    if (!chatId) return res.status(404).json({ error: "chat not found" });
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    const wanted = new Set(requestedIds);
    const found = messages.filter((item) => wanted.has(msgId(item)));
    let recovered = 0;
    let downloadFailed = 0;
    let forwardFailed = 0;
    const meNum = myNumber();

    for (const msg of found) {
      if (!msg.hasMedia) { downloadFailed++; continue; }
      // Histórico antigo normalmente falha rápido quando a mídia já expirou. Duas
      // tentativas recuperam falhas transitórias sem prender a bridge por minutos.
      const { media_url, media_type, media_mimetype } = await extractMedia(msg, "Media RECOVER", 2);
      if (!media_url) { downloadFailed++; continue; }
      const peer = await widToNumber(msg.fromMe ? (msg.to || chatId) : (msg.from || chatId));
      if (!peer || !meNum) { forwardFailed++; continue; }
      const ok = await forwardToApp({
        wa_message_id: msgId(msg),
        direction: msg.fromMe ? "out" : "in",
        from: msg.fromMe ? meNum : peer,
        to: msg.fromMe ? peer : meNum,
        body: msg.body || "",
        type: msg.type,
        timestamp: msg.timestamp,
        has_media: true,
        media_url, media_type, media_mimetype,
        bridge_owner_buyer_id: BRIDGE_OWNER_BUYER_ID,
      });
      if (ok) recovered++; else forwardFailed++;
    }

    return res.json({
      ok: true,
      requested: requestedIds.length,
      checked: messages.length,
      found: found.length,
      recovered,
      notFound: requestedIds.length - found.length,
      downloadFailed,
      forwardFailed,
    });
  } catch (e) {
    console.error(`[${INSTANCE_NAME}][Media RECOVER]`, e.message);
    return res.status(500).json({ error: e.message });
  } finally {
    mediaRecoveryRunning = false;
  }
});

// Le o NOME (pushname) real do WhatsApp de uma lista de numeros — pra backfill de
// nomes nos leads "Novo cliente XXXX". Batch num so request.
app.post("/contactnames", async (req, res) => {
  if (!isReady) return res.status(503).json({ error: "not ready" });
  const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  const names = {};
  for (const n of numbers) {
    const num = String(n).replace(/\D/g, "");
    if (!num) continue;
    try {
      const c = await client.getContactById(num + "@c.us");
      names[num] = (c && (c.pushname || c.name || c.verifiedName)) || null;
    } catch (e) { names[num] = null; }
  }
  res.json({ names });
});

// Backfill das conversas com os CLIENTES (compradores): pra cada buyer ativo
// com telefone, puxa a conversa que já existe neste WhatsApp e forwarda. O
// webhook reconhece o telefone como comprador e grava em client_messages.
let backfillClientsRunning = false;
async function backfillClients(limitPerChat = 40) {
  if (!isReady) return { error: "not ready" };
  if (!SUPABASE_KEY) return { error: "no supabase" };
  if (backfillClientsRunning) return { error: "already running" };
  backfillClientsRunning = true;
  let imported = 0, chats = 0, scanned = 0;
  try {
    const q = `${SUPABASE_URL}/rest/v1/buyers?is_active=eq.true&select=id,phone,whatsapp`;
    const r = await fetch(q, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const buyers = r.ok ? await r.json() : [];
    const myNum = myNumber();
    console.log(`[${INSTANCE_NAME}][BackfillClients] ${buyers.length} compradores pra varrer`);
    const seen = new Set();
    for (const b of buyers) {
      const digits = String(b.whatsapp || b.phone || "").replace(/\D/g, "");
      if (!digits || seen.has(digits)) continue;
      seen.add(digits);
      scanned++;
      const chatId = await tryGetChatId(digits);
      if (!chatId) continue;
      let chat;
      try { chat = await client.getChatById(chatId); } catch (e) { continue; }
      let msgs = [];
      try { msgs = await chat.fetchMessages({ limit: limitPerChat }); } catch (e) { continue; }
      if (!msgs.length) continue;
      chats++;
      for (const msg of msgs) {
        try {
          const peer = await widToNumber(msg.fromMe ? (msg.to || chatId) : (msg.from || chatId));
          if (!/^[0-9]+$/.test(peer)) continue;
          const { media_url, media_type, media_mimetype } = await extractMedia(msg);
          const ok = await forwardToApp({
            wa_message_id: msgId(msg),
            direction: msg.fromMe ? "out" : "in",
            from: msg.fromMe ? myNum : peer,
            to: msg.fromMe ? peer : myNum,
            body: msg.body || "",
            type: msg.type, timestamp: msg.timestamp,
            has_media: msg.hasMedia, media_url, media_type, media_mimetype,
            bridge_owner_buyer_id: BRIDGE_OWNER_BUYER_ID,
          });
          if (ok) imported++;
        } catch (e) {}
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  } catch (e) {
    console.error(`[${INSTANCE_NAME}][BackfillClients ERR]`, e.message);
    backfillClientsRunning = false;
    return { error: e.message, imported, chats, scanned };
  }
  backfillClientsRunning = false;
  console.log(`[${INSTANCE_NAME}][BackfillClients] OK scanned=${scanned} chats=${chats} forwarded=${imported}`);
  return { ok: true, scanned, chats, imported };
}
app.post("/backfill-clients", async (req, res) => {
  const limit = parseInt(req.body?.limit || "40", 10);
  const result = await backfillClients(limit);
  res.json(result);
});
// Diagnóstico: resolve um @lid pro telefone real (testa a correção do inbound LID).
app.get("/lidtest", async (req, res) => {
  const wid = String(req.query.wid || "");
  if (!wid) return res.status(400).json({ error: "?wid=NNNN@lid" });
  const phone = await lidToPhone(wid);
  res.json({ wid, phone, resolved: !!phone });
});

function brVariants(digits) {
  if (!digits.startsWith("55")) return [digits];
  const variants = [digits];
  if (digits.length === 13) variants.push(digits.slice(0, 4) + digits.slice(5));
  else if (digits.length === 12) variants.push(digits.slice(0, 4) + "9" + digits.slice(4));
  return variants;
}

// Numero PROPRIO da bridge. wid.user e imune a @lid e a @c.us. O padrao antigo
// (_serialized.replace("@c.us","")) virava "" quando client.info nao estava populado
// (durante re-init) -> forward sem "from" -> LeadFlow rejeitava com 400 "Missing fields".
// ID da mensagem. Em algumas mensagens (saida do celular) o wwebjs devolve
// msg.id._serialized UNDEFINED -> payload sem wa_message_id -> LeadFlow 400 e a msg
// nao salva. Reconstroi no formato canonico: fromMe_remote_id.
function msgId(msg) {
  try {
    const i = msg && msg.id;
    if (!i) return null;
    if (i._serialized) return i._serialized;
    if (i.id) {
      const rebuilt = `${i.fromMe ? "true" : "false"}_${i.remote || ""}_${i.id}`;
      console.warn(`[${INSTANCE_NAME}][msgId] _serialized vazio - reconstruido: ${rebuilt}`);
      return rebuilt;
    }
    console.warn(`[${INSTANCE_NAME}][msgId] id sem _serialized nem id:`, JSON.stringify(i));
    return null;
  } catch (e) { return null; }
}

function myNumber() {
  return String(client.info?.wid?.user || "").replace(/\D/g, "");
}

async function tryGetChatId(digits) {
  const variants = brVariants(digits);
  for (const v of variants) {
    try {
      const info = await client.getNumberId(v);
      if (info && info._serialized) return info._serialized;
    } catch (e) {}
  }
  return null;
}

app.post("/send", async (req, res) => {
  console.log(`[${INSTANCE_NAME}][SEND]`, JSON.stringify({ ...req.body, mediaUrl: req.body.mediaUrl ? "(url)" : undefined }).slice(0, 120));
  if (!isReady) return res.status(503).json({ error: "Not connected" });
  try {
    const { number, message, mediaUrl, mediaMimetype, mediaFilename } = req.body;
    let chatId;
    if (number.includes("@")) chatId = number;
    else {
      const digits = number.replace(/\D/g, "");
      chatId = await tryGetChatId(digits);
      if (!chatId) return res.status(404).json({ error: "Numero nao tem WhatsApp (" + digits + ")" });
    }
    let sent;
    if (mediaUrl) {
      const mr = await fetch(mediaUrl);
      if (!mr.ok) throw new Error(`Media fetch ${mr.status}`);
      let buf = Buffer.from(await mr.arrayBuffer());
      let mime = mediaMimetype || mr.headers.get("content-type") || "application/octet-stream";
      let filename = mediaFilename || "file";
      let isAudio = (mime || "").startsWith("audio/");
      // VOICE NOTE: o WhatsApp Web atual so aceita ptt em ogg/opus. O MediaRecorder
      // do navegador grava webm/mp4 e o envio quebrava com o erro minificado "t".
      // Converte com ffmpeg (webm/opus = remux -c:a copy, instantaneo; AAC re-encoda).
      if (isAudio && !/ogg/i.test(mime)) {
        const tmpIn = `/tmp/wa-audio-${process.pid}-${Date.now()}.in`;
        const tmpOut = tmpIn.replace(/\.in$/, ".ogg");
        try {
          fs.writeFileSync(tmpIn, buf);
          try { execFileSync("ffmpeg", ["-y", "-i", tmpIn, "-vn", "-c:a", "copy", tmpOut], { stdio: "ignore" }); }
          catch (e1) { execFileSync("ffmpeg", ["-y", "-i", tmpIn, "-vn", "-c:a", "libopus", "-b:a", "32k", tmpOut], { stdio: "ignore" }); }
          buf = fs.readFileSync(tmpOut);
          mime = "audio/ogg; codecs=opus";
          filename = filename.replace(/\.[A-Za-z0-9]+$/, "") + ".ogg";
        } catch (e) {
          console.error(`[${INSTANCE_NAME}][SEND] conversao de audio falhou (${e.message}) — enviando como arquivo`);
          isAudio = false;
        } finally {
          try { fs.unlinkSync(tmpIn); } catch (e2) {}
          try { fs.unlinkSync(tmpOut); } catch (e3) {}
        }
      }
      const media = new MessageMedia(mime, buf.toString("base64"), filename);
      try {
        sent = await withTimeout(client.sendMessage(chatId, media, { caption: message || undefined, sendAudioAsVoice: isAudio }), 45000, "SEND");
      } catch (e) {
        if (!isAudio) throw e;
        // voice recusado mesmo em ogg → nao perde a mensagem: vai como arquivo comum
        console.error(`[${INSTANCE_NAME}][SEND] voice falhou (${e.message}) — reenviando como arquivo`);
        sent = await withTimeout(client.sendMessage(chatId, media, { caption: message || undefined }), 45000, "SEND");
      }
    } else sent = await withTimeout(client.sendMessage(chatId, message), 45000, "SEND");
    // GRUPO (@g.us) as vezes devolve undefined no whatsapp-web.js. Isso NAO e Chrome
    // degradado: falha SO esta mensagem, sem derrubar a sessao inteira da bridge.
    // Fallback: sendMessage devolve undefined em GRUPO (@g.us) e as vezes em @lid,
    // MAS A MENSAGEM SAI. Tenta pelo objeto Chat pra obter um ack de verdade.
    // sendMessage devolve undefined em GRUPO (@g.us) e as vezes em @lid, MAS A MSG SAI.
    // NUNCA reenviar aqui (chat.sendMessage reenviava -> ENTREGA DUPLICADA no @lid).
    // Recupera o id REAL LENDO a ultima msg do chat: serve de ack e deixa o
    // message_create deduplicar (sem 2a copia no inbox).
    if (!sent || !sent.id) {
      try {
        const chat = await client.getChatById(chatId);
        if (chat) {
          const recent = await chat.fetchMessages({ limit: 1 });
          const last = recent && recent[0];
          if (last && last.fromMe && last.id && last.id._serialized) {
            sent = last;
            console.log(`[${INSTANCE_NAME}][SEND] id recuperado por leitura (${chatId})`);
          }
        }
      } catch (e) {
        console.error(`[${INSTANCE_NAME}][SEND] recuperar id (read-only) falhou: ${e.message}`);
      }
    }
    if (!sent || !sent.id) {
      // Realmente sem id: SUCESSO (evita loop de notif). Marca por chatId+body pra o
      // message_create NAO duplicar essa saida. NADA e reenviado.
      markBridgeSend("noack:" + chatId + ":" + String(message || "").slice(0, 60));
      console.warn(`[${INSTANCE_NAME}][SEND] entregue SEM ack (chatId=${chatId}) - sucesso sem id`);
      return res.json({ success: true, id: null, noAck: true, resolvedId: chatId });
    }
    markBridgeSend(sent.id._serialized); // A: msg enviada pelo app — não reprocessar no message_create
    res.json({ success: true, id: sent.id._serialized, resolvedId: chatId });
  } catch (err) {
    console.error(`[${INSTANCE_NAME}][SEND ERR]`, err.message);
    // Chrome/puppeteer degradado (detached Frame, target closed, etc): o bridge fica
    // "connected" mas nao consegue enviar. Dispara recover() (destroy + reinitialize,
    // SEM wipe — mantem a sessao) pra restaurar sozinho. Proximo envio ja funciona.
    if (/detached Frame|Target closed|Protocol error|Execution context|Session closed|SEND timeout/i.test(err.message || "")) {
      console.error(`[${INSTANCE_NAME}][SEND] Chrome degradado — disparando recover()`);
      recover("FRAME_ERROR");
    }
    res.status(500).json({ error: err.message });
  }
});

client.initialize();
app.listen(PORT, "0.0.0.0", () => console.log(`[${INSTANCE_NAME}] WA Bridge listening on ${PORT} (forward to ${FORWARD_URL})`));
