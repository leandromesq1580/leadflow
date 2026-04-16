import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const filePath = new URL(request.url).searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const db = createAdminClient()
  const { data } = await db.storage.from('lead-attachments').createSignedUrl(filePath, 300) // 5 min

  if (!data?.signedUrl) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  return NextResponse.json({ url: data.signedUrl })
}
