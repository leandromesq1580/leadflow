const express = require("express");
const { execSync } = require("child_process");
const fs = require("fs");
const app = express();
app.use(express.json());
const ADMIN_KEY = process.env.ADMIN_KEY;
app.use((req, res, next) => {
  if (req.headers["apikey"] !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
});
// Portas em uso pela FONTE DA VERDADE (envs no disco) — o banco do app pode estar
// defasado (buyer deletado deixa porta órfã; caso silvanamamotta/3492 em 2026-07-24).
function usedPorts() {
  const used = new Set([3456, 3457, 3458]);
  for (const f of fs.readdirSync("/etc/wa-bridge")) {
    if (!f.endsWith(".env") && !f.endsWith(".env.disabled")) continue;
    const m = fs.readFileSync(`/etc/wa-bridge/${f}`, "utf8").match(/^PORT=(\d+)/m);
    if (m) used.add(parseInt(m[1], 10));
  }
  return used;
}
app.post("/create-bridge", (req, res) => {
  const { buyer_id, port, name } = req.body || {};
  if (!buyer_id || !port || !name) return res.status(400).json({ error: "Missing" });
  try {
    // Autoridade de porta: pedido colidiu com env existente -> pula pra proxima livre.
    const used = usedPorts();
    let actual = parseInt(port, 10);
    while (used.has(actual)) actual++;
    if (actual !== parseInt(port, 10)) console.log(`[admin] porta ${port} ocupada -> usando ${actual} (${name})`);
    const out = execSync("/usr/local/bin/setup-bridge.sh " + buyer_id + " " + actual + " " + name, { encoding: "utf8" });
    const keyMatch = out.match(/API Key:\s*(\S+)/);
    res.json({ ok: true, port: actual, instance: name, api_key: keyMatch ? keyMatch[1] : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.listen(3458, "0.0.0.0", () => console.log("Admin listening on 3458"));
