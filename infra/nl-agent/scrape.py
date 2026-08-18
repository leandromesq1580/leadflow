#!/usr/bin/env python3
"""
NL Agent — scraper do Agent Portal da National Life.
Roda no VPS via xvfb-run (headless=False, channel=chrome, root => --no-sandbox).
Credenciais: /opt/nl-agent/.env (NL_USER / NL_PASS) — preenchidas pelo Leandro, nunca commitadas.
Saída: /opt/nl-agent/out/nl-data.json (+ prev.json e diff em "changes").
"""
import json, os, re, sys, time, unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
# Multi-cliente (12/08/2026): NL_CLIENT_BASE aponta o diretório de trabalho do
# cliente (/opt/nl-agent/clients/<id> com .env, profile/ e out/ próprios).
# Sem a variável, comportamento legado: raiz = book do Leandro.
WORK = Path(os.environ.get("NL_CLIENT_BASE") or str(BASE))
OUT = WORK / "out"
OUT.mkdir(parents=True, exist_ok=True)
PROFILE = WORK / "profile"

def env():
    cfg = {}
    envf = WORK / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip()
    return cfg

CFG = env()
NL_USER = CFG.get("NL_USER", "")
NL_PASS = CFG.get("NL_PASS", "")

NB_URL = "https://www.nationallife.com/agent/book-of-business/new-business/all-new-business-cases"
INF_URL = "https://www.nationallife.com/agent/book-of-business/inforce-book/all-clients/all-clients-agent"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def fail(msg, code=1):
    (OUT / "last-error.txt").write_text(f"{datetime.now(timezone.utc).isoformat()} {msg}\n")
    log(f"ERRO: {msg}")
    sys.exit(code)

def fetch_code_from_email(user, password, host="imap.gmail.com", tries=20, wait=6):
    """Lê o código de verificação da National Life direto da caixa de entrada (IMAP).
    Só olha e-mails que chegaram DEPOIS do início desta busca, para nunca pegar código velho."""
    import imaplib, email as emaillib
    from email.header import decode_header
    started = datetime.now(timezone.utc)
    for attempt in range(tries):
        try:
            M = imaplib.IMAP4_SSL(host)
            M.login(user, password)
            M.select("INBOX")
            typ, data = M.search(None, '(SINCE "%s")' % started.strftime("%d-%b-%Y"))
            ids = (data[0].split() if data and data[0] else [])[-25:]
            best = None
            for i in reversed(ids):
                typ, msg_data = M.fetch(i, "(RFC822)")
                if typ != "OK" or not msg_data or not msg_data[0]:
                    continue
                msg = emaillib.message_from_bytes(msg_data[0][1])
                try:
                    when = emaillib.utils.parsedate_to_datetime(msg.get("Date"))
                    if when and when.tzinfo and when < started - timedelta(minutes=2):
                        continue
                except Exception:
                    pass
                subj = str(decode_header(msg.get("Subject", ""))[0][0])
                frm = str(msg.get("From", ""))
                blob = f"{subj} {frm}"
                if not re.search(r"national ?life|nlg|one[- ]time|verification|secure login", blob, re.I):
                    continue
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        if part.get_content_type() in ("text/plain", "text/html"):
                            try:
                                body += part.get_payload(decode=True).decode("utf-8", "ignore")
                            except Exception:
                                pass
                else:
                    try:
                        body = msg.get_payload(decode=True).decode("utf-8", "ignore")
                    except Exception:
                        body = str(msg.get_payload())
                body = re.sub(r"<[^>]+>", " ", body)
                m = (re.search(r"(?:code|código)\D{0,40}?(\d{4,8})", body, re.I)
                     or re.search(r"\b(\d{6})\b", body))
                if m:
                    best = m.group(1)
                    break
            M.logout()
            if best:
                return best
        except Exception as e:
            log(f"IMAP: {str(e)[:120]}")
            return None
        time.sleep(wait)
    return None


def goto(page, url, tries=3, wait_ms=90000):
    """Navega com paciência e nova tentativa — o portal às vezes demora mais de 45s."""
    last = None
    for n in range(tries):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=wait_ms)
            return True
        except Exception as e:
            last = e
            log(f"navegação lenta ({n+1}/{tries}) em {url.split('/')[-1]} — tentando de novo")
            time.sleep(5)
    raise last


def js_rows(page, cells_js):
    """Extrai linhas do DataTable com page.len(100)."""
    page.evaluate("$('#DataTables_Table_0').DataTable().page.len(100).draw()")
    page.wait_for_timeout(5000)
    return page.evaluate(
        "() => $('#DataTables_Table_0').DataTable().rows().nodes().toArray().map(tr => {"
        " const c = Array.from(tr.cells).map(td => td.innerText.trim().replace(/\\s+/g,' '));"
        f" return {cells_js};"
        "})"
    )

def main():
    if not NL_USER or not NL_PASS or "PREENCHER" in NL_USER or "PREENCHER" in NL_PASS:
        fail("credenciais não configuradas — preencha NL_USER e NL_PASS em /opt/nl-agent/.env", 2)

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE),
            channel="chrome",
            headless=False,
            no_viewport=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1600,1000"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.set_default_timeout(90000)

        # ---------- LOGIN ----------
        log("abrindo portal…")
        goto(page, "https://www.nationallife.com/agent/")
        page.wait_for_timeout(4000)
        if "auth0.com" in page.url:
            log("tela de login — autenticando…")
            user_sel = "input[name='username'], input[type='text'], input[type='email']"
            page.wait_for_selector(user_sel)
            page.fill(user_sel, NL_USER)
            page.fill("input[type='password']", NL_PASS)
            try:
                cb = page.query_selector("input[type='checkbox']")
                if cb and not cb.is_checked():
                    cb.check(force=True, timeout=3000)  # Remember this device
            except Exception:
                pass
            page.click("button:has-text('Login'), button[type='submit']")
            page.wait_for_timeout(10000)
            if "auth0.com" in page.url:
                page.screenshot(path=str(OUT / "login-challenge.png"), full_page=True)
                fail("login recusado — confira NL_USER/NL_PASS em /opt/nl-agent/.env", 3)

        # ---------- MFA (segundo fator por SMS) ----------
        if "/auth/sfa" in page.url:
            channel = CFG.get("MFA_CHANNEL", "email").lower()
            log(f"verificação em 2 fatores exigida — pedindo código por {'e-mail' if channel == 'email' else 'SMS'}…")
            opt = ("Send code to my email" if channel == "email"
                   else "Text the code to my mobile phone")
            picked = False
            for sel in (f"text={opt}", f"label:has-text('{opt}')", f"*:has-text('{opt}') input[type=radio]"):
                try:
                    page.click(sel, timeout=4000)
                    picked = True
                    break
                except Exception:
                    continue
            if not picked:
                log(f"AVISO: não consegui marcar a opção '{opt}' — seguindo com a opção padrão da tela")
            page.wait_for_timeout(800)
            page.click("button:has-text('Send Code'), input[value='Send Code'], a:has-text('Send Code')")
            page.wait_for_timeout(5000)
            page.screenshot(path=str(OUT / "mfa-code-entry.png"), full_page=True)

            code_file = OUT / "mfa-code.txt"
            code_file.unlink(missing_ok=True)
            (OUT / "awaiting-mfa.txt").write_text(datetime.now(timezone.utc).isoformat())
            log(f"código enviado por {'e-mail' if channel == 'email' else 'SMS'} — aguardando você digitar no dashboard…")

            code = None
            imap_user, imap_pass = CFG.get("IMAP_USER", ""), CFG.get("IMAP_PASS", "")
            if imap_user and imap_pass and "PREENCHER" not in imap_pass:
                log("buscando o código no e-mail automaticamente…")
                code = fetch_code_from_email(imap_user, imap_pass, CFG.get("IMAP_HOST", "imap.gmail.com"))
                if code:
                    log("código lido do e-mail — sem precisar de ninguém 🎉")
                else:
                    log("não achei o código no e-mail — aguardando digitação no dashboard…")
            for _ in range(120):  # até 10 min
                if code:
                    break
                if code_file.exists():
                    c = code_file.read_text().strip()
                    if c:
                        code = c
                        break
                time.sleep(5)
            (OUT / "awaiting-mfa.txt").unlink(missing_ok=True)
            code_file.unlink(missing_ok=True)
            if not code:
                fail("código de verificação não foi informado a tempo (10 min) — clique em Atualizar de novo", 4)

            log("código recebido — validando…")
            filled = page.evaluate(
                """(c) => { const el = Array.from(document.querySelectorAll("input[type='text'],input[type='tel'],input[type='number'],input[type='password'],input:not([type])"))
                     .find(e => (e.offsetWidth||e.offsetHeight) && !(e.id||'').includes('search'));
                   if (!el) return false; el.focus(); el.value = c;
                   el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));
                   return true; }""", code)
            if not filled:
                page.screenshot(path=str(OUT / "mfa-no-field.png"), full_page=True)
                fail("não achei o campo do código na tela de verificação — veja out/mfa-no-field.png", 5)
            try:
                cb = page.query_selector("#check, input[type='checkbox']")
                if cb and cb.is_visible() and not cb.is_checked():
                    cb.check(force=True, timeout=3000)  # confiar neste dispositivo
            except Exception:
                pass
            clicked = False
            for sel in ["button:has-text('Confirm Code')", "input[value='Confirm Code']",
                        "a:has-text('Confirm Code')", "button:has-text('Verify')",
                        "button:has-text('Submit')", "button:has-text('Continue')",
                        "button[type='submit']", "input[type='submit']"]:
                try:
                    page.click(sel, timeout=3000)
                    clicked = True
                    break
                except Exception:
                    continue
            if not clicked:
                page.screenshot(path=str(OUT / "mfa-no-button.png"), full_page=True)
                fail("não achei o botão de confirmar o código — veja out/mfa-no-button.png", 7)
            page.wait_for_timeout(10000)
            if "/auth/sfa" in page.url:
                page.screenshot(path=str(OUT / "mfa-failed.png"), full_page=True)
                fail("código não aceito (expirado ou digitado errado?) — clique em Atualizar e tente de novo", 6)
        log(f"logado — {page.url}")

        # ---------- NEW BUSINESS ----------
        log("New Business…")
        goto(page, NB_URL)
        page.wait_for_selector("#DataTables_Table_0", timeout=60000)
        page.wait_for_timeout(4000)

        body_text = page.evaluate("() => document.body.innerText")
        m = re.search(r"Last Updated:\s*([0-9/]+\s+[0-9:]+\s*[AP]M)", body_text)
        portal_last_updated = m.group(1) if m else None

        def metric(text, label):
            # Os cards quebram títulos em elementos/linhas diferentes (por exemplo,
            # "Commission\nImpact"). Normalizar o whitespace evita perder o total.
            normalized = re.sub(r"\s+", " ", text or " ").strip()
            # O texto acessível de alguns cards inclui "is" entre título e total
            # ("Pending New Business is 8").
            found = re.search(re.escape(label) + r"(?:\s+is)?\s*(\d+)", normalized, re.I)
            return int(found.group(1)) if found else None

        def money_metric(text, label):
            normalized = re.sub(r"\s+", " ", text or " ").strip()
            found = re.search(re.escape(label) + r"\s*(\$[0-9,.]+)", normalized, re.I)
            return found.group(1) if found else None

        # Os cards do topo são a fonte oficial dos totais (o somatório das linhas
        # não é igual ao painel porque a seguradora aplica regras próprias de prêmio).
        nb_summary = {
            "all": metric(body_text, "All Cases in New Business"),
            "pending": metric(body_text, "Pending New Business"),
            "at_risk_chargeback": metric(body_text, "Business at risk of chargeback"),
            "pending_requirements": metric(body_text, "Pending Requirements"),
            "outstanding_edelivery": metric(body_text, "Outstanding eDelivery"),
            "pending_eft": metric(body_text, "Pending EFT"),
            "unread_messages": metric(body_text, "Life Policies with Unread Messages"),
            "anticipated_annual_premium": money_metric(body_text, "Anticipated Annual Premium"),
            "modal_premium": money_metric(body_text, "Modal Premium"),
        }
        nb_summary = {k: v for k, v in nb_summary.items() if v is not None}
        log(f"resumo NB: {nb_summary}")

        # limpar filtro grudento se ativo
        if "Active Filters" in body_text:
            log("filtro ativo detectado — limpando…")
            try:
                page.click("text=Modify Filter", timeout=5000)
                page.wait_for_timeout(1500)
                page.click(".filter-chip, .badge:has-text('Unread')", timeout=3000)
            except Exception:
                pass
            page.wait_for_timeout(2000)

        nb_rows = js_rows(page, "{sub:c[1], name:c[2], pol:c[3].replace(/\\s/g,''), aap:c[4], prod:c[5], st:c[6], deliv:c[7], owner:c[9], sent:c[10], mp:c[11], cm:c[13]}")
        log(f"NB: {len(nb_rows)} casos")

        # ---------- EMPRESA EM RISCO DE ESTORNO (cartão-filtro do relatório) ----------
        estorno_pols = []
        try:
            clicked = page.evaluate("""() => {
                const els = Array.from(document.querySelectorAll('div,a,button,span'))
                  .filter(e => /business\\s*at\\s*risk\\s*of\\s*chargeback|risco\\s*de\\s*estorno/i.test(e.innerText || ''))
                  .sort((a,b) => (a.innerText||'').length - (b.innerText||'').length);
                for (const el of els) {
                  let alvo = el;
                  while (alvo && alvo !== document.body) {
                    const style = getComputedStyle(alvo);
                    if (alvo.matches('a,button,[onclick],[role=button]') || style.cursor === 'pointer') {
                      alvo.click(); return true;
                    }
                    alvo = alvo.parentElement;
                  }
                }
                if (!els[0]) return false;
                els[0].click(); return true;
            }""")
            if clicked:
                page.wait_for_timeout(5000)
                rows_e = page.evaluate(
                    "() => $('#DataTables_Table_0').DataTable().rows({search:'applied'}).nodes().toArray().map(tr => {"
                    " const c = Array.from(tr.cells).map(td => td.innerText.trim().replace(/\\s+/g,' '));"
                    " return (c[3]||'').replace(/\\s/g,''); })"
                )
                estorno_pols = [p for p in rows_e if p]
                log(f"risco de estorno: {len(estorno_pols)} apolices")
                page.evaluate("""() => {
                    const els = Array.from(document.querySelectorAll('div,a,button,span'))
                      .filter(e => /all\\s*cases\\s*in\\s*new\\s*business|all\\s*new\\s*business\\s*cases|todos\\s*os\\s*casos/i.test(e.innerText || ''))
                      .sort((a,b) => (a.innerText||'').length - (b.innerText||'').length);
                    for (const el of els) {
                      let alvo = el;
                      while (alvo && alvo !== document.body) {
                        const style = getComputedStyle(alvo);
                        if (alvo.matches('a,button,[onclick],[role=button]') || style.cursor === 'pointer') {
                          alvo.click(); return true;
                        }
                        alvo = alvo.parentElement;
                      }
                    }
                    if (els[0]) { els[0].click(); return true; }
                    return false;
                }""")
                page.wait_for_timeout(5000)
            else:
                cand = page.evaluate(r"""() => Array.from(document.querySelectorAll('div,a,span,button'))
                    .filter(e => /case|risk|review|pending|delivery|transfer/i.test(e.innerText||'') && (e.innerText||'').length < 90 && e.children.length <= 3)
                    .map(e => (e.innerText||'').replace(/\s+/g,' ').trim())
                    .filter((v,i,a) => v && a.indexOf(v) === i).slice(0, 15)""")
                log(f"risco de estorno: cartao nao encontrado; candidatos: {cand}")
        except Exception as e:
            log(f"risco de estorno: {e}")

        # requirements: 1 clique de modal por linha (AJAX por linha)
        reqs = {}
        pols = page.evaluate("() => $('a.get_requirements_modal').map(function(){return $(this).data('policy')}).get()")
        for pol in pols:
            try:
                page.evaluate(f"$(\"a.get_requirements_modal[data-policy='{pol}']\")[0].click()")
                page.wait_for_timeout(2200)
                r = page.evaluate(
                    f"() => $(\"a.get_requirements_modal[data-policy='{pol}']\").closest('span').find('.divModelContent').text().replace(/\\s+/g,' ').trim()"
                )
                page.evaluate("$('.modal').modal('hide')")
                page.wait_for_timeout(700)
                if r:
                    reqs[pol] = r
            except Exception as e:
                log(f"req {pol}: {e}")
        log(f"requirements: {len(reqs)} com pendência")

        # ---------- CASE COMMUNICATION (PENDING / MODIFIED APPROVED) ----------
        uw_cases = {}
        interesting = [r for r in nb_rows if any(k in r["st"].upper() for k in ("PENDING", "MODIFIED", "APPROVED")) or r["pol"] in reqs]
        for r in interesting:
            pol = r["pol"]
            try:
                href = page.evaluate(
                    "(pol) => { const tr = $('#DataTables_Table_0').DataTable().rows().nodes().toArray()"
                    ".find(tr => tr.innerText.replace(/\\s/g,'').includes(pol));"
                    " const a = tr && tr.cells[3].querySelector('a'); return a ? a.href : null; }", pol)
                if not href:
                    continue
                goto(page, href)
                page.wait_for_timeout(5000)
                txt = page.evaluate("() => document.body.innerText")
                mm = re.search(r"Case Communication.*?(?=Case Tracker|Details\n)", txt, re.S)
                uw = re.search(r"Underwriter\s*\n?\s*([A-Za-z .]+)", txt)
                tracker = re.search(r"policy status\s*(\d/\d)", txt)
                comms = []
                if mm:
                    seccao = mm.group(0)
                    partes = re.split(r"(?=[A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z .'\-]+\s+(?:Started a New Conversation|[Rr]eplied))", seccao)
                    inicial = re.sub(r"^\s*Case Communication\s*\d*\s*", "", partes[0]).strip()
                    if inicial:
                        comms.append({"quem": "National Life", "quando": None, "texto": inicial[:1200]})
                    for pt in partes[1:]:
                        cab = re.match(r"([A-Z][A-Za-z'\-]+,\s+[A-Z][A-Za-z .'\-]+)\s+(Started a New Conversation|[Rr]eplied[^\n]*)", pt)
                        dt = re.search(r"([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*[AP]M)", pt)
                        corpo = pt
                        if cab: corpo = corpo.replace(cab.group(0), "", 1)
                        if dt: corpo = corpo.replace(dt.group(1), "", 1)
                        comms.append({"quem": cab.group(1) if cab else None,
                                      "quando": dt.group(1) if dt else None,
                                      "texto": corpo.strip()[:1200]})
                uw_cases[pol] = {
                    "underwriter": uw.group(1).strip() if uw else None,
                    "tracker": tracker.group(1) if tracker else None,
                    "communication": (mm.group(0)[:3000] if mm else None),
                    "comms": comms,
                }
                goto(page, NB_URL)
                page.wait_for_selector("#DataTables_Table_0", timeout=60000)
                page.wait_for_timeout(3000)
                page.evaluate("$('#DataTables_Table_0').DataTable().page.len(100).draw()")
                page.wait_for_timeout(4000)
            except Exception as e:
                log(f"uw {pol}: {e}")
        log(f"underwriting detalhado: {len(uw_cases)} casos")

        # ---------- INFORCE ----------
        log("Inforce…")
        goto(page, INF_URL)
        page.wait_for_selector("#DataTables_Table_0", timeout=60000)
        page.wait_for_timeout(4000)
        inf_rows = js_rows(page, "{owner:c[0], pol:c[2], type:c[3], st:c[4], issued:c[6]}")
        log(f"Inforce: {len(inf_rows)} policies")

        # ---------- PENDING LAPSE DETAILS ----------
        lapse_details = {}
        for r in [x for x in inf_rows if "Pending Lapse" in x["st"]]:
            pol = r["pol"]
            try:
                page.evaluate(f"$(\"a:contains('{pol}')\")[0].click()")
                page.wait_for_timeout(6000)
                page.evaluate("$('a:contains(More)').trigger('click')")
                page.wait_for_timeout(2000)
                txt = page.evaluate("() => document.body.innerText")
                m1 = re.search(r"at risk of lapsing on ([0-9/]+)\. The total amount due is: (\$[0-9.,]+)", txt)
                m2 = re.search(r"Phone\s*\(?([0-9) (-]{10,16})", txt)
                m3 = re.search(r"Email\s*(\S+@\S+)", txt)
                lapse_details[pol] = {
                    "lapse_date": m1.group(1) if m1 else None,
                    "amount_due": m1.group(2) if m1 else None,
                    "phone": m2.group(1).strip() if m2 else None,
                    "email": m3.group(1) if m3 else None,
                }
                goto(page, INF_URL)
                page.wait_for_selector("#DataTables_Table_0", timeout=60000)
                page.wait_for_timeout(3000)
                page.evaluate("$('#DataTables_Table_0').DataTable().page.len(100).draw()")
                page.wait_for_timeout(4000)
            except Exception as e:
                log(f"lapse {pol}: {e}")

        # ---------- CLIENT INTELLIGENCE ----------
        # Eventos de comissão, conservação, atendimento, vida e pagamentos. O
        # relatório muda de colunas conforme a categoria, então preservamos o mapa
        # header→valor em vez de chutar um schema fixo.
        client_intelligence = {
            "available": False, "error": None, "portal_url": None,
            "metrics": {}, "headers": [], "rows": [],
        }
        try:
            log("Client Intelligence…")
            ci_href = page.evaluate("""() => {
                const links = Array.from(document.querySelectorAll('a'));
                const link = links.find(a => /client intelligence/i.test((a.innerText||'') + ' ' + (a.href||'')));
                return link ? link.href : null;
            }""")
            if not ci_href:
                # Fallback estável: o portal usa a mesma árvore de Inforce Book.
                ci_href = "https://www.nationallife.com/agent/book-of-business/inforce-book/client-intelligence/client-intelligence-agent"
            goto(page, ci_href)
            page.wait_for_timeout(7000)
            ci_text = page.evaluate("() => document.body.innerText")
            if not re.search(r"Client Intelligence", ci_text, re.I):
                raise RuntimeError(f"relatório não abriu ({page.url})")

            ci_defs = [
                ("all", "All"), ("commission_impact", "Commission Impact"),
                ("conservation", "Conservation"), ("claims", "Claims"),
                ("client_service", "Client Service"), ("disbursements", "Disbursements"),
                ("life_event", "Life Event"), ("new_business", "New Business"),
                ("payments", "Payments"),
            ]
            ci_metrics = {key: metric(ci_text, label) for key, label in ci_defs}
            ci_metrics = {k: v for k, v in ci_metrics.items() if v is not None}

            def ci_show_all():
                page.evaluate(r"""() => {
                    const table = Array.from(document.querySelectorAll('table')).find(t => t.querySelector('tbody tr'));
                    if (!table || !window.jQuery || !window.jQuery.fn.DataTable) return;
                    const dt = window.jQuery(table).DataTable();
                    dt.page.len(100).draw();
                }""")
                page.wait_for_timeout(2500)

            def ci_rows_now(category):
                payload = page.evaluate(r"""() => {
                    const tables = Array.from(document.querySelectorAll('table'));
                    const table = tables.find(t => t.querySelector('tbody tr')) || tables[0];
                    if (!table) return {headers:[], rows:[]};
                    const headers = Array.from(table.querySelectorAll('thead th')).map(th => (th.innerText||'').replace(/\s+/g,' ').trim());
                    let nodes;
                    try {
                      const dt = window.jQuery && window.jQuery.fn.DataTable && window.jQuery(table).DataTable();
                      nodes = dt ? dt.rows({search:'applied'}).nodes().toArray() : Array.from(table.querySelectorAll('tbody tr'));
                    } catch (_) { nodes = Array.from(table.querySelectorAll('tbody tr')); }
                    const rows = nodes.filter(tr => getComputedStyle(tr).display !== 'none').map(tr => {
                      const cells = Array.from(tr.cells).map(td => (td.innerText||'').replace(/\s+/g,' ').trim());
                      const anchor = tr.querySelector('a[href]');
                      return {cells, portal_url: anchor ? anchor.href : null};
                    });
                    return {headers, rows};
                }""")
                headers = payload.get("headers") or []
                out = []
                for idx, raw in enumerate(payload.get("rows") or []):
                    cells = raw.get("cells") or []
                    columns = {headers[i] if i < len(headers) and headers[i] else f"Coluna {i+1}": value
                               for i, value in enumerate(cells)}
                    out.append({"id": f"{category}-{idx}-{'|'.join(cells)[:80]}", "category": category,
                                "columns": columns, "cells": cells, "portal_url": raw.get("portal_url")})
                return headers, out

            ci_show_all()
            ci_headers, ci_rows = ci_rows_now("all")
            # Cada card aplica um filtro próprio; capturar por categoria preserva a
            # classificação mesmo quando a tabela não possui uma coluna "Type".
            categorized = []
            for key, label in ci_defs[1:]:
                if not ci_metrics.get(key):
                    continue
                try:
                    page.get_by_text(label, exact=True).first.click(timeout=5000, force=True)
                    page.wait_for_timeout(2500)
                    ci_show_all()
                    headers, rows = ci_rows_now(key)
                    if headers and not ci_headers:
                        ci_headers = headers
                    categorized.extend(rows)
                except Exception as e:
                    log(f"Client Intelligence {label}: {str(e)[:100]}")
            if categorized:
                ci_rows = categorized

            client_intelligence = {
                "available": True, "error": None, "portal_url": page.url,
                "metrics": ci_metrics, "headers": ci_headers, "rows": ci_rows,
            }
            page.screenshot(path=str(OUT / "client-intelligence.png"), full_page=True)
            log(f"Client Intelligence: {len(ci_rows)} eventos; métricas={ci_metrics}")
        except Exception as e:
            client_intelligence["error"] = str(e)[:300]
            log(f"Client Intelligence falhou: {client_intelligence['error']}")

        # ---------- iGo eApp: aplicações enviadas ----------
        igo_rows = []
        igo_err = None
        try:
            log("iGo eApp…")
            goto(page, "https://www.nationallife.com/agent/")
            page.wait_for_timeout(6000)
            igo = None
            try:
                with ctx.expect_page(timeout=30000) as newp:
                    page.click("text=iGo eApp", timeout=10000)
                igo = newp.value
                igo.wait_for_load_state("domcontentloaded")
            except Exception:
                page.click("text=iGo eApp", timeout=8000)
                igo = page
            igo.wait_for_timeout(12000)
            igo.screenshot(path=str(OUT / "igo-1.png"), full_page=True)

            for sel in ["text=View My Cases", "a:has-text('My Cases')", "text=My Cases"]:
                try:
                    igo.click(sel, timeout=8000)
                    break
                except Exception:
                    continue
            igo.wait_for_timeout(12000)
            igo.screenshot(path=str(OUT / "igo-cases.png"), full_page=True)

            extract_js = """() => {
                const norm = s => (s||'').replace(/\\s+/g,' ').trim();
                const tables = Array.from(document.querySelectorAll('table'));
                const tb = tables.find(t => /Application Completed|Started/i.test(t.innerText)) || tables[0];
                if (!tb) return [];
                const rows = Array.from(tb.querySelectorAll('tr'));
                const out = [];
                for (const tr of rows) {
                    const cells = Array.from(tr.cells).map(c => norm(c.innerText));
                    if (cells.length < 4) continue;
                    const joined = cells.join(' | ');
                    if (/^\\s*$/.test(joined) || /Date Modified/i.test(joined)) continue;
                    const st = cells.find(c => /^(Started|Application Completed|Completed Accepted|Completed|Submitted|Signed|In Progress|Pending)/i.test(c));
                    if (!st) continue;
                    const dt = cells.find(c => /^\\d{1,2}\\/\\d{1,2}\\/\\d{4}$/.test(c));
                    const face = (joined.match(/Face Amount:\\s*(\\$[\\d,]+)/i) || [])[1] || null;
                    let name = norm((cells[0] || '').split('Face Amount')[0]);
                    if (!name || name.length < 3) name = norm((cells[1] || '').split('Face Amount')[0]);
                    const prod = cells.find(c => /FlexLife|LSW|Term|NL |IUL/i.test(c) && c !== st) || null;
                    out.push({ name, status: st, product: prod, modified: dt || null, face });
                }
                return out;
            }"""

            # paginação: "Page X of N" com botão ">"
            total_pages = 1
            try:
                mtxt = re.search(r"Page\s+(\d+)\s+of\s+(\d+)", igo.evaluate("() => document.body.innerText"))
                if mtxt:
                    total_pages = int(mtxt.group(2))
            except Exception:
                pass
            log(f"iGo: {total_pages} página(s) de casos")

            seen = set()
            for pg in range(total_pages):
                try:
                    batch = igo.evaluate(extract_js)
                except Exception as e:
                    log(f"iGo página {pg+1} falhou: {str(e)[:100]}")
                    break
                for r in batch:
                    k = (r.get("name"), r.get("status"), r.get("modified"), r.get("face"))
                    if k not in seen:
                        seen.add(k)
                        igo_rows.append(r)
                if pg + 1 >= total_pages:
                    break
                moved = False
                for sel in ["input[value='>']", "a:has-text('>')", "button:has-text('>')",
                            "input[title='Next']", "[id*='Next']"]:
                    try:
                        igo.click(sel, timeout=4000)
                        moved = True
                        break
                    except Exception:
                        continue
                if not moved:
                    log(f"iGo: não achei o botão de próxima página (parei na {pg+1})")
                    break
                igo.wait_for_timeout(4500)
            log(f"iGo: {len(igo_rows)} casos lidos")
        except Exception as e:
            igo_err = str(e)[:250]
            log(f"iGo falhou: {igo_err}")
            try:
                page.screenshot(path=str(OUT / "igo-error.png"), full_page=True)
            except Exception:
                pass

        ctx.close()

    # ---------- LIMBO: enviado no iGo, ainda não apareceu no portal ----------
    # ---- comparação de nomes iGo x portal ----
    # O iGo escreve "Ross, Lilis" / "dos Santos Pedrosa, Leticia Thais".
    # O portal escreve "LILIS ANGELA ROSS" (nome do meio) e GRUDA as partículas:
    # "DOSSANTOS", "DEMEDEIROS", "DESOUZA" — e às vezes tem erro de digitação
    # ("Rebolcas" x "REBOUCAS"). Regra: o PRIMEIRO NOME tem que bater (senão
    # irmãos como Julia Emanuelly x Joao Emanuel casariam) + ao menos um sobrenome.
    import difflib
    PARTICULAS = {"de","da","do","dos","das","del","di","du","van","von","la","le"}
    SUFIXOS = {"jr","ii","iii","filho","neto","dupl","duplicate"}

    def parse_name(s):
        s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
        s = re.sub(r"[^a-z ,]", " ", s)
        if "," in s:
            last, _, first = s.partition(",")
            s = f"{first} {last}"
        raw = [w for w in s.split() if w and w not in SUFIXOS]
        first = raw[0] if raw else ""
        out, i = set(), 0
        while i < len(raw):
            w = raw[i]
            if w in PARTICULAS and i + 1 < len(raw):
                out.add(w + raw[i+1])      # "de souza" -> "desouza"
                out.add(raw[i+1])          # e "souza"
                i += 2
                continue
            if len(w) > 5:
                for p in PARTICULAS:       # "dossantos" -> "santos"
                    if w.startswith(p) and len(w) - len(p) >= 4:
                        out.add(w[len(p):])
            if len(w) > 2:
                out.add(w)
            i += 1
        return first, out

    def close(a, b):
        return difflib.SequenceMatcher(None, a, b).ratio() >= 0.86

    def same_person(x, y):
        (fa, ta), (fb, tb) = x, y
        if not fa or not fb or len(ta) < 2 or len(tb) < 2:
            return False
        if not close(fa, fb):
            return False
        outros = {w for w in ta if not close(w, fa)}
        return any(any(close(w, z) for z in tb) for w in outros)

    portal_people = []
    for r in nb_rows:
        for f in ("name", "owner"):
            p = parse_name(r.get(f, ""))
            if len(p[1]) >= 2:
                portal_people.append(p)
    for r in inf_rows:
        p = parse_name(r.get("owner", ""))
        if len(p[1]) >= 2:
            portal_people.append(p)

    def in_portal(nm):
        x = parse_name(nm)
        if len(x[1]) < 2:
            return True   # nome vago demais: não acusa
        return any(same_person(x, b) for b in portal_people)
    today = datetime.now(timezone.utc).date()
    limbo = []
    for r in igo_rows:
        st = (r.get("status") or "")
        if re.match(r"started|in progress", st, re.I):
            continue  # ainda não foi enviada
        if not re.search(r"completed|submitted|signed", st, re.I):
            continue
        if in_portal(r.get("name")):
            continue
        days = None
        if r.get("modified"):
            try:
                m, d, y = [int(x) for x in r["modified"].split("/")]
                days = (today - datetime(y, m, d, tzinfo=timezone.utc).date()).days
            except Exception:
                pass
        limbo.append({**r, "days_waiting": days, "alert": (days is not None and days > 5)})
    limbo.sort(key=lambda x: (x["days_waiting"] is None, -(x["days_waiting"] or 0)))
    if igo_rows:
        log(f"limbo (enviado e não apareceu no portal): {len(limbo)} — alerta >5 dias: {sum(1 for x in limbo if x['alert'])}")

    # ---------- DIFF + SAVE ----------
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "generated_at": now,
        "portal_last_updated": portal_last_updated,
        "nb_summary": nb_summary,
        "nb": {r["pol"]: r["st"] for r in nb_rows},
        "nb_rows": nb_rows,
        "inforce": {r["pol"]: r["st"] for r in inf_rows},
        "inforce_rows": inf_rows,
        "reqs": reqs,
        "uw_cases": uw_cases,
        "pending_lapse": lapse_details,
        "client_intelligence": client_intelligence,
        "estorno": estorno_pols,
        "igo_rows": igo_rows,
        "igo_error": igo_err,
        "limbo": limbo,
    }

    prev_file = OUT / "nl-data.json"
    changes = []
    if prev_file.exists():
        prev = json.loads(prev_file.read_text())
        for section in ("nb", "inforce"):
            for pol, st in data[section].items():
                old = prev.get(section, {}).get(pol)
                if old is None:
                    changes.append({"pol": pol, "kind": section, "change": f"NOVA: {st}"})
                elif old != st:
                    changes.append({"pol": pol, "kind": section, "change": f"{old} → {st}"})
            for pol in prev.get(section, {}):
                if pol not in data[section]:
                    changes.append({"pol": pol, "kind": section, "change": "saiu da lista"})
        for pol, r in data["reqs"].items():
            if prev.get("reqs", {}).get(pol, "") != r:
                changes.append({"pol": pol, "kind": "requirement", "change": r})
        prev_limbo = {x.get("name") for x in prev.get("limbo", [])}
        for x in limbo:
            if x["name"] not in prev_limbo:
                changes.append({"pol": x["name"], "kind": "iGo",
                                "change": f"enviada no iGo e ainda sem aparecer no portal ({x.get('days_waiting')} dias)"})
        (OUT / "prev.json").write_text(prev_file.read_text())
    data["changes"] = changes

    prev_file.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    (OUT / "last-error.txt").unlink(missing_ok=True)
    log(f"OK — {len(changes)} mudanças. Salvo em out/nl-data.json")

if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        # nunca falhar em silêncio: o painel precisa mostrar o que houve
        import traceback
        detail = f"{type(e).__name__}: {str(e)[:180]}"
        (OUT / "last-error.txt").write_text(
            f"{datetime.now(timezone.utc).isoformat()} falha inesperada — {detail}\n")
        (OUT / "last-traceback.txt").write_text(traceback.format_exc())
        log(f"ERRO INESPERADO: {detail}")
        sys.exit(1)
