import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/[id]/attachments/register
 * Body: { buyer_id, file_name, file_path, file_size, file_type }
 *
 * Chamado depois do upload direto pro Storage (via signed URL). Salva
 * metadados na tabela lead_attachments — body pequeno, dentro do limite
 * Vercel sem problema.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params
    const body = await request.json()
    const { buyer_id, file_name, file_path, file_size, file_type } = body

    if (!buyer_id || !file_name || !file_path) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data, error } = await db.from('lead_attachments').insert({
      lead_id: leadId,
      buyer_id,
      file_name,
      file_path,
      file_size: typeof file_size === 'number' ? file_size : 0,
      file_type: file_type || 'application/octet-stream',
    }).select().single()

    if (error) {
      // Se inserção falhou, remove o arquivo do Storage pra não deixar lixo
      await db.storage.from('lead-attachments').remove([file_path]).catch(() => {})
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ attachment: data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
