import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const EMAIL_VENDAS = 'regiane@myhomefirst.us'
const FUSO_TIME = 'America/Sao_Paulo'
const STATUS_OCUPADO = ['scheduled', 'confirmed']

function dataNoFuso(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_TIME,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function horaNoFuso(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_TIME,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || ''
  return `${get('hour')}:${get('minute')}`
}

/** Horários já ocupados na agenda real do time de vendas, no fuso de São Paulo. */
export async function GET(req: Request) {
  const dia = new URL(req.url).searchParams.get('dia') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return NextResponse.json({ error: 'Data inválida.' }, { status: 400 })
  }

  const referencia = new Date(`${dia}T00:00:00.000Z`)
  if (Number.isNaN(referencia.getTime()) || referencia.toISOString().slice(0, 10) !== dia) {
    return NextResponse.json({ error: 'Data inválida.' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: vendas, error: buyerError } = await db
    .from('buyers')
    .select('id')
    .eq('email', EMAIL_VENDAS)
    .single()

  if (buyerError || !vendas) {
    return NextResponse.json({ error: 'Agenda indisponível.' }, { status: 503 })
  }

  // A faixa ampliada cobre qualquer deslocamento de fuso; o filtro final compara
  // o dia civil em São Paulo para evitar erros de horário de verão.
  const inicioBusca = new Date(referencia.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const fimBusca = new Date(referencia.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const { data: appointments, error } = await db
    .from('appointments')
    .select('scheduled_at')
    .eq('buyer_id', vendas.id)
    .in('status', STATUS_OCUPADO)
    .gte('scheduled_at', inicioBusca)
    .lt('scheduled_at', fimBusca)

  if (error) {
    return NextResponse.json({ error: 'Agenda indisponível.' }, { status: 503 })
  }

  const ocupados = [...new Set((appointments || [])
    .map(a => new Date(a.scheduled_at))
    .filter(date => dataNoFuso(date) === dia)
    .map(horaNoFuso))]
    .sort()

  return NextResponse.json(
    { [dia]: ocupados },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
