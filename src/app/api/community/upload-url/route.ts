import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const BUCKET = 'lead-attachments'
const OK_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']

/**
 * POST /api/community/upload-url — URL assinada pra subir VÍDEO direto pro storage
 * (o upload não passa pelo servidor; o limite de 4.5MB do Vercel não se aplica).
 * Body: { mime }. Devolve { path, signedUrl } — o client faz PUT do arquivo na signedUrl.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Apenas membros pagantes.' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const mime = String(body?.mime || '').toLowerCase()
    if (!OK_VIDEO.includes(mime)) {
      return NextResponse.json({ error: 'Só vídeo MP4, MOV ou WEBM.' }, { status: 400 })
    }
    const ext = mime === 'video/quicktime' ? 'mov' : mime === 'video/webm' ? 'webm' : 'mp4'
    const path = `community/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data?.signedUrl) return NextResponse.json({ error: error?.message || 'Falha ao criar URL de upload.' }, { status: 500 })
    return NextResponse.json({ path, signedUrl: data.signedUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
