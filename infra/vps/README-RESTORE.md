# Restauração do VPS wa-bridge (62.146.229.13) — runbook de desastre

Componentes que vivem SÓ no VPS (código-fonte versionado aqui; segredos no tarball):
- `wa-bridge-server.js`  → `/opt/wa-bridge/server.js` (bridge WhatsApp c/ blindagens: locks no boot, vigia init 2min, QR auto-renova 10min, timeout envio 45s, self-test de consulta 5min)
- `watchdog.sh`          → `/opt/wa-bridge/watchdog.sh` (auto-recovery frota, timer 5min, rate-limit 2/h)
- `wa-bridge-admin-server.js` → `/opt/wa-bridge-admin/server.js` (porta 3458; cria bridges; AUTORIDADE de portas — varre envs e desvia colisão)
- `setup-bridge.sh`      → `/usr/local/bin/setup-bridge.sh` (⚠️ preencher `__PREENCHER_SERVICE_ROLE_KEY__`)

Segredos (NÃO estão no repo): tarball `~/Backups/leadflow-vps/leadflow-vps-backup-AAAAMMDD.tar.gz`
no Mac do Leandro — contém `/etc/wa-bridge/*.env` (API keys por bridge) + units systemd completos.

## Passos de restauração (VPS novo Ubuntu)
1. `apt install -y nodejs npm google-chrome-stable` (Chrome estável; node 20+)
2. Extrair o tarball na raiz: `tar xzf leadflow-vps-backup-*.tar.gz -C /`
3. Copiar os arquivos deste diretório pros caminhos acima (chmod +x nos .sh)
4. `cd /opt/wa-bridge && npm install whatsapp-web.js express qrcode` (usar git-main do wwebjs se o npm estiver quebrado c/ o WhatsApp: `npm i github:pedroslopez/whatsapp-web.js`)
5. Units: tarball traz `/etc/systemd/system/wa-bridge@.service`, `wa-bridge-admin.service`, `wa-bridge-watchdog.{service,timer}` → `systemctl daemon-reload`
6. Subir: `systemctl enable --now wa-bridge-admin wa-bridge-watchdog.timer` e `for f in /etc/wa-bridge/*.env; do systemctl enable --now wa-bridge@$(basename $f .env); done`
   - Todas as instâncias devem ter `CHROME_LEAN=1` no arquivo `/etc/wa-bridge/<instância>.env`; sem isso, dezenas de Chromes esgotam RAM/swap e o download de áudios falha silenciosamente.
7. Sessões WhatsApp NÃO são restauráveis (expiram) → clientes reescaneiam QR (fica sempre vivo)
8. Conferir: `bash /opt/wa-bridge/watchdog.sh && tail /var/log/wa-bridge-watchdog.log`

Registro de decisões/receitas: memória do Claude (`feedback_wa_bridge_recovery`).
