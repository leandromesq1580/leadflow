import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const BUCKET = 'lead-attachments'
const MAX = 5 * 1024 * 1024 // 5MB
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * POST /api/community/upload — recebe uma imagem (multipart, campo "file"), grava no
 * bucket lead-attachments sob community/{buyerId}/... e devolve { path } pra anexar ao post.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Apenas membros pagantes.' }, { status: 403 })

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente.' }, { status: 400 })
    if (!OK_TYPES.includes(file.type)) return NextResponse.json({ error: 'Só imagem (JPG, PNG, WEBP ou GIF).' }, { status: 400 })
    if (file.size > MAX) return NextResponse.json({ error: 'Imagem muito grande (máx 5MB).' }, { status: 400 })

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
    const path = `community/${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ path })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
