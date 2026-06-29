import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const BUCKET = 'lead-attachments'

/**
 * GET /api/community/image?path=community/... — serve a imagem de um post da comunidade.
 * Gated (só membro pagante) + restrito ao prefixo community/. Redireciona pra uma signed
 * URL curta do Supabase (a imagem em si nao fica publica; o acesso passa por aqui).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const path = request.nextUrl.searchParams.get('path') || ''
    if (!path.startsWith('community/') || path.includes('..')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 120)
    if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
    return NextResponse.redirect(data.signedUrl)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
