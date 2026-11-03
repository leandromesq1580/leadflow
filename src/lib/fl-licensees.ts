/**
 * Novos agentes licenciados (Life & Annuity) — fonte pública: Florida DFS "Licensee Search"
 * (https://licenseesearch.fldfs.com). O DFS licencia agentes de TODOS os estados que querem vender na Flórida
 * (não-residentes também), então a lista tem agentes de vários estados.
 *
 * Fluxo da fonte (sem API oficial): GET / → cookie + csrf_token; POST / com o filtro; GET /Home/Export devolve o CSV
 * da busca. Não há data de emissão no CSV: a lista é "licenças emitidas no período" (inclui agente antigo que
 * acrescentou a linha Life & Annuity — o número de licença mais baixo costuma denunciar isso).
 */

const BASE = 'https://licenseesearch.fldfs.com'
const LIFE_AND_ANNUITY = '9'
const MAX_DAYS = 62

export type Licensee = {
  name: string; license: string; address: string; city: string; state: string; zip: string
  county: string; email: string; phone: string; npn: string
}

/** Lê um CSV (aspas duplas, vírgula, CRLF). */
function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/** "SILVA, JOAO" → "JOAO SILVA" */
function flipName(raw: string): string {
  const [last, ...rest] = raw.split(',').map(s => s.trim())
  return rest.length ? `${rest.join(' ')} ${last}`.trim() : last
}

export function parseLicenseeCsv(text: string): Licensee[] {
  const rows = csvRows((text || '').replace(/^\uFEFF/, ''))
  const h = rows.findIndex(r => r[0]?.trim() === 'Licensee Name')
  if (h < 0) return []
  const out: Licensee[] = []
  for (const r of rows.slice(h + 1)) {
    if (r.length < 8 || !r[0].trim()) continue
    const [city = '', state = '', zip = ''] = r[3].split(',').map(s => s.trim())
    out.push({
      name: flipName(r[0]), license: r[1].trim(), address: r[2].trim(), city, state, zip,
      county: r[4].trim(), email: r[5].trim().toLowerCase(), phone: r[6].trim(),
      npn: r[7].replace(/^="?|"$/g, '').trim(),
    })
  }
  return out
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
function validIso(s: string | null | undefined): s is string {
  if (!s || !ISO.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function validateRange(from: string | null | undefined, to: string | null | undefined, now = new Date()):
  { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (!validIso(from) || !validIso(to)) return { ok: false, error: 'Informe data início e data fim válidas.' }
  if (from > to) return { ok: false, error: 'A data início não pode ser depois da data fim.' }
  const today = now.toISOString().slice(0, 10)
  if (to > today) return { ok: false, error: 'A data fim não pode ser no futuro.' }
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1
  if (days > MAX_DAYS) return { ok: false, error: `Período máximo de ${MAX_DAYS} dias por consulta.` }
  return { ok: true, from, to }
}

export function toUsDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function cookieHeader(res: Response, jar: Map<string, string>) {
  for (const line of res.headers.getSetCookie?.() || []) {
    const [kv] = line.split(';'); const i = kv.indexOf('=')
    if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim())
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
}

/** Busca no DFS as licenças Life & Annuity emitidas entre `from` e `to` (ISO yyyy-mm-dd, já validadas). */
export async function fetchNewLicensees(from: string, to: string): Promise<Licensee[]> {
  const jar = new Map<string, string>()
  const ua = { 'User-Agent': 'Mozilla/5.0 (compatible; Lead4Pro-admin)' }
  const signal = () => AbortSignal.timeout(25000)

  const home = await fetch(`${BASE}/?source=1`, { headers: ua, signal: signal() })
  if (!home.ok) throw new Error(`DFS fora do ar (HTTP ${home.status}).`)
  let cookie = cookieHeader(home, jar)
  const token = (await home.text()).match(/name="csrf_token"[^>]*value="([^"]+)"/)?.[1]
  if (!token) throw new Error('DFS mudou a página de busca (token não encontrado).')

  const body = new URLSearchParams({
    csrf_token: token, LicenseCategoryFilter: LIFE_AND_ANNUITY,
    LicenseIssueDateFromFilter: toUsDate(from), LicenseIssueDateToFilter: toUsDate(to),
    EmailAddressBeginContainFilter: '1', FirmNameBeginContainFilter: '1', LicenseStatusFilter: '',
    OnlyLicWithNoQuApptFilter: 'false', CEHrsNotMetFilter: 'false',
    'LicenseeSearchInfo.PagingInfo.CurrentPage': '1', TabLLValue: '1',
  })
  const search = await fetch(`${BASE}/`, {
    method: 'POST', headers: { ...ua, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}/?source=1` },
    body, signal: signal(),
  })
  if (!search.ok) throw new Error(`DFS recusou a busca (HTTP ${search.status}).`)
  cookie = cookieHeader(search, jar) || cookie
  await search.text()

  const exp = await fetch(`${BASE}/Home/Export`, { headers: { ...ua, Cookie: cookie }, signal: AbortSignal.timeout(50000) })
  if (!exp.ok) throw new Error(`DFS recusou a exportação (HTTP ${exp.status}).`)
  const csv = await exp.text()
  const list = parseLicenseeCsv(csv)
  // Cabeçalho de colunas ausente com texto não vazio = o formato mudou (≠ período sem licenças).
  if (!list.length && csv.trim() && !/Licensee Name,/.test(csv) && !/no records/i.test(csv)) {
    throw new Error('DFS devolveu um formato inesperado na exportação.')
  }
  return list
}

const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export function licenseesToCsv(list: Licensee[]): string {
  const head = 'Nome,Licença,Endereço,Cidade,Estado,CEP,Condado,E-mail,Telefone,NPN'
  const lines = list.map(l => [l.name, l.license, l.address, l.city, l.state, l.zip, l.county, l.email, l.phone, l.npn].map(esc).join(','))
  return '\uFEFF' + [head, ...lines].join('\r\n')
}
