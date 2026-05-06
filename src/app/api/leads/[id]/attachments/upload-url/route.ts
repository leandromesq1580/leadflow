import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/[id]/attachments/upload-url
 * Body: { file_name, file_size, buyer_id }
 *
 * Retorna signedUrl + path pra o client fazer PUT direto no Supabase Storage.
 * Bypassa o limite de body do Vercel (4.5MB serverless function) — o arquivo
 * vai do navegador direto pro bucket Storage. Depois o client chama
 * /attachments/register pra salvar os metadados no DB.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params
    const body = await request.json()
    const { file_name, file_size, buyer_id } = body

    if (!file_name || !buyer_id) {
      return NextResponse.json({ error: 'Missing file_name or buyer_id' }, { status: 400 })
    }
    // Limite real do Storage (50MB free tier; usamos 30MB pra deixar folga)
    const MAX = 30 * 1024 * 1024
    if (typeof file_size === 'number' && file_size > MAX) {
      return NextResponse.json({ error: `Arquivo maior que ${MAX / 1024 / 1024}MB` }, { status: 413 })
    }

    const db = createAdminClient()

    // Sanitiza file name
    const safe = String(file_name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const path = `${leadId}/${Date.now()}-${safe}`

    const { data, error } = await db.storage
      .from('lead-attachments')
      .createSignedUploadUrl(path)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      path,
      signedUrl: data.signedUrl,
      token: data.token,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
