import { NextRequest, NextResponse } from 'next/server'
import { scoreLeadWithAI } from '@/lib/ai-scoring'

/** POST /api/leads/[id]/score — trigger manual AI scoring */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await scoreLeadWithAI(id)
  if (!result) return NextResponse.json({ error: 'Scoring failed or API key missing' }, { status: 500 })
  return NextResponse.json(result)
}
