/**
 * FAIXA DE HORAS DA GRADE DA AGENDA — calculada a partir do que existe no período.
 *
 * As grades eram fixas (semana 7h–20h, dia 6h–22h) e engoliam em silêncio tudo que
 * caísse fora: 19,6% dos compromissos do sistema não tinham célula na visão semana
 * (a reunião das 22h, a ligação das 6h). O item vinha da API, entrava no array e
 * simplesmente não era desenhado — pro corretor, parecia que o sistema não tinha
 * agendado nada.
 *
 * Agora a grade começa uma hora antes do compromisso mais cedo e termina uma hora
 * depois do mais tarde, sempre contendo a faixa comercial padrão.
 */
export function faixaDeHoras(inicios: (string | Date)[], padraoIni: number, padraoFim: number): number[] {
  let ini = padraoIni, fim = padraoFim
  for (const s of inicios) {
    const h = new Date(s).getHours()
    if (!Number.isFinite(h)) continue
    if (h < ini) ini = Math.max(0, h - 1)
    if (h > fim) fim = Math.min(23, h + 1)
  }
  return Array.from({ length: fim - ini + 1 }, (_, i) => i + ini)
}
