/** Formatação de dinheiro em dólar — sem dependências (serve em client components). */
export function moneyFromCents(cents: number): string {
  const v = cents / 100
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })
}
export function moneyFromDollars(dollars: number): string {
  return moneyFromCents(Math.round(dollars * 100))
}
