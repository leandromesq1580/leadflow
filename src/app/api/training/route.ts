import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/training — lista os vídeos de treinamento lendo a PASTA PÚBLICA do Google Drive.
 * Vídeo novo na pasta aparece sozinho (sem deploy). Cache em memória de 15 min.
 * Se a pasta estiver privada, devolve needsPublic:true (a página instrui o admin).
 */

const FOLDER_ID = '1Dmvo7lyNqdyFuBbPN_JAoIJzWkcHJgm5'
const FOLDER_URL = `https://drive.google.com/drive/folders/${FOLDER_ID}`

type Video = { id: string; name: string }
let cache: { at: number; videos: Video[]; needsPublic: boolean } | null = null

function decodeName(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\.(mp4|mov|webm|m4v|avi|mkv)$/i, '')
    .trim()
}

function parseVideos(html: string): Video[] {
  const seen = new Map<string, string>()
  // O HTML da pasta pública embute JSON (às vezes com aspas escapadas):
  // ["<fileId>",["<parent>"],"<nome>","video/mp4",...
  const patterns = [
    /\["([-\w]{25,44})",\["[-\w]{25,44}"\],"((?:[^"\\]|\\.)+?)","(video\/[^"]+)"/g,
    /\\"([-\w]{25,44})\\",\[\\"[-\w]{25,44}\\"\],\\"((?:[^"\\]|\\[^"])+?)\\",\\"(video\/[^"\\]+)\\"/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      if (!seen.has(m[1])) seen.set(m[1], decodeName(m[2]))
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const db = createAdminClient()
    const { data: buyer } = await db.from('buyers').select('id, is_admin').eq('auth_user_id', user.id).maybeSingle()
    if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

    const force = request.nextUrl.searchParams.get('refresh') === '1'
    if (!force && cache && Date.now() - cache.at < 15 * 60 * 1000) {
      return NextResponse.json({ videos: cache.videos, needsPublic: cache.needsPublic, folderUrl: FOLDER_URL, isAdmin: !!buyer.is_admin, cached: true })
    }

    let videos: Video[] = []
    let needsPublic = false
    try {
      const res = await fetch(FOLDER_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' })
      const html = await res.text()
      if (/Google Drive: Sign-in|accounts\.google\.com/i.test(html.slice(0, 4000)) && !/drive-viewer/i.test(html)) {
        needsPublic = true
      } else {
        videos = parseVideos(html)
      }
    } catch {
      needsPublic = false
    }

    cache = { at: Date.now(), videos, needsPublic }
    return NextResponse.json({ videos, needsPublic, folderUrl: FOLDER_URL, isAdmin: !!buyer.is_admin })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
