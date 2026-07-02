import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_COL = /community_bio|community_avatar_path|column .* does not exist/i

/** GET /api/community/profile — meu perfil na comunidade (nome, bio, foto). */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me } = ctx
    const { data, error } = await db
      .from('buyers')
      .select('name, community_bio, community_avatar_path')
      .eq('id', me.id)
      .single()
    if (error) {
      if (MISSING_COL.test(error.message)) return NextResponse.json({ name: me.name, bio: null, avatar_path: null, needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ name: data?.name || me.name, bio: data?.community_bio || null, avatar_path: data?.community_avatar_path || null })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/** PATCH — atualiza nome / bio / foto. Foto tem que ser um upload PRÓPRIO (community/<meuId>/...). */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Apenas membros.' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const patch: Record<string, any> = {}

    if (typeof body?.name === 'string') {
      const name = body.name.trim().slice(0, 60)
      if (name.length < 2) return NextResponse.json({ error: 'Nome muito curto.' }, { status: 400 })
      patch.name = name
    }
    if (typeof body?.bio === 'string') {
      patch.community_bio = body.bio.trim().slice(0, 300) || null
    }
    if (typeof body?.avatar_path === 'string') {
      const p = body.avatar_path.trim()
      if (p && !p.startsWith(`community/${me.id}/`)) {
        return NextResponse.json({ error: 'Foto inválida.' }, { status: 400 })
      }
      patch.community_avatar_path = p || null
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nada pra salvar.' }, { status: 400 })

    const { error } = await db.from('buyers').update(patch).eq('id', me.id)
    if (error) {
      if (MISSING_COL.test(error.message)) return NextResponse.json({ error: 'Rode a migration 028 (supabase/migrations/028_community_profiles.sql) no Supabase.' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
