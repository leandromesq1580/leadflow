import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * Exclusão em massa dos leads MANUAIS do próprio comprador (pedido dos clientes, 2026-07-31).
 *
 * TRAVAS (exclusão é irreversível):
 *  1. Só leads do próprio buyer (assigned_to).
 *  2. Só MANUAIS — dupla checagem: `meta_lead_id IS NULL` (não veio de campanha) E
 *     `form_name` em ('manual_entry','csv_import'). Lead PAGO/entregue pelo sistema
 *     nunca entra — apagá-lo destruiria o histórico do crédito que ele comprou.
 *  3. PRESERVA leads com contrato fechado (contract_closed) — é registro de venda.
 *  4. POST exige confirmação explícita (confirm === 'EXCLUIR').
 *  5. Processa até 500 por chamada (evita timeout); devolve quantos restam.
 *
 * GET  → prévia (quantos serão excluídos / preservados)
 * POST → executa
 */

const LOTE_MAX = 500
const MANUAL_FORMS = ['manual_entry', 'csv_import']

async function alvos(db: ReturnType<typeof createAdminClient>, buyerId: string) {
  const { data } = await db.from('leads')
    .select('id, contract_closed, form_name, meta_lead_id')
    .eq('assigned_to', buyerId)
    .is('meta_lead_id', null)
    .in('form_name', MANUAL_FORMS)
    .limit(5000)
  const todos = data || []
  const excluir = todos.filter(l => !l.contract_closed).map(l => l.id)
  const preservados = todos.filter(l => l.contract_closed).length
  return { excluir, preservados, total: todos.length }
}

export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { excluir, preservados } = await alvos(db, caller.id)
  return NextResponse.json({ toDelete: excluir.length, preserved: preservados, batch: LOTE_MAX })
}

export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { confirm } = await request.json().catch(() => ({ confirm: '' }))
  if (String(confirm).trim().toUpperCase() !== 'EXCLUIR') {
    return NextResponse.json({ error: 'Confirmação obrigatória: digite EXCLUIR.' }, { status: 400 })
  }

  const { excluir, preservados } = await alvos(db, caller.id)
  if (excluir.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, remaining: 0, preserved: preservados })
  }
  const lote = excluir.slice(0, LOTE_MAX)

  // Anexos: apaga os ARQUIVOS do bucket antes (o cascade só limpa as linhas)
  try {
    const { data: atts } = await db.from('lead_attachments').select('file_path').in('lead_id', lote)
    const paths = (atts || []).map((a: any) => a.file_path).filter(Boolean)
    if (paths.length) await db.storage.from('lead-attachments').remove(paths)
  } catch (e: any) { console.warn('[bulk-delete] anexos:', e?.message) }

  // Conversas ficam órfãs (FK SET NULL) — apaga junto
  try { await db.from('whatsapp_messages').delete().in('lead_id', lote) } catch {}
  try { await db.from('sms_messages').delete().in('lead_id', lote) } catch {}

  // Exclusão em blocos de 100 (o resto — follow-ups, pipeline, anexos — sai por cascade)
  let deleted = 0
  for (let i = 0; i < lote.length; i += 100) {
    const chunk = lote.slice(i, i + 100)
    const { error } = await db.from('leads').delete().in('id', chunk)
      .eq('assigned_to', caller.id).is('meta_lead_id', null) // trava repetida no DELETE
    if (error) {
      console.error('[bulk-delete] erro no bloco:', error.message)
      return NextResponse.json({ error: error.message, deleted }, { status: 500 })
    }
    deleted += chunk.length
  }

  console.log(`[bulk-delete] buyer ${caller.id} excluiu ${deleted} lead(s) manual(is); ${preservados} preservado(s) por contrato`)
  return NextResponse.json({
    ok: true, deleted, remaining: Math.max(0, excluir.length - deleted), preserved: preservados,
  })
}
