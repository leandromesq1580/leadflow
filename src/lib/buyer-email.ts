/**
 * E-mail de comprador comparado SEM diferenciar maiúsculas.
 *
 * 29/09/2026: Anne Dantas estava marcada como prioritária, mas o cadastro dela tem o
 * e-mail em maiúsculas (`DANTASFINANCIAL@GMAIL.COM`). O código convertia a lista de
 * prioritários para minúsculas e buscava com `.in('email', …)`, que compara de forma
 * EXATA no Postgres → ela sumia da Fila de Entregas e não recebia lead no modo exclusivo.
 * 9 de 154 cadastros tinham maiúsculas no e-mail. Toda busca de comprador por e-mail
 * vinda de configuração (prioritários, fallback, rodízio) passa por aqui.
 */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/** Valor entre aspas para filtros `or=(…)` do PostgREST: escapa `\` e `"`. */
function quotePostgrest(value: string): string {
  return `"${value.replace(/[\\"]/g, m => `\\${m}`)}"`
}

/**
 * Filtro para `.or(...)` que casa a coluna `email` sem diferenciar maiúsculas.
 * `_`, `%` e `*` no `ilike` só AMPLIAM a busca (o próprio e-mail sempre casa consigo
 * mesmo), por isso quem chama DEVE passar o resultado por `keepEmails`.
 * Retorna null para lista vazia: não consulte o banco nesse caso.
 */
export function emailIlikeOrFilter(emails: readonly unknown[]): string | null {
  const list = [...new Set(emails.map(normalizeEmail).filter(Boolean))]
  if (!list.length) return null
  return list.map(email => `email.ilike.${quotePostgrest(email)}`).join(',')
}

/** Mantém só as linhas cujo e-mail é EXATAMENTE (normalizado) um dos pedidos. */
export function keepEmails<T extends { email?: string | null }>(rows: readonly T[] | null | undefined, emails: readonly unknown[]): T[] {
  const wanted = new Set(emails.map(normalizeEmail).filter(Boolean))
  return (rows || []).filter(row => wanted.has(normalizeEmail(row.email)))
}

export function sameEmail(a: unknown, b: unknown): boolean {
  const left = normalizeEmail(a)
  return !!left && left === normalizeEmail(b)
}
