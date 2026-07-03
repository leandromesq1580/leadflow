import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'lead-attachments'

/**
 * GET /api/training/media?path=community/training/... — serve vídeo/poster de aula hospedado
 * no storage. Qualquer buyer LOGADO (treinamento é aberto a todos os planos); restrito ao
 * prefixo community/training/. Redireciona pra signed URL.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const path = request.nextUrl.searchParams.get('path') || ''
    if (!path.startsWith('community/training/') || path.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    const db = createAdminClient()
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
    return NextResponse.redirect(data.signedUrl)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
