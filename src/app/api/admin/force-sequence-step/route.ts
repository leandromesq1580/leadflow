import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runLegacyEnrollment } from '@/lib/sequence-engine'
import { runAIEnrollment, aiEnginePorts } from '@/lib/ai-sequence-engine'

/** Administrative execution uses the normal due/state/STOP/batch guards. No rearm. */
export async function POST(request: NextRequest) {
  if (!process.env.POLL_SECRET || request.nextUrl.searchParams.get('secret') !== process.env.POLL_SECRET) {
    return NextResponse.json({error:'Unauthorized'},{status:401})
  }
  const id=request.nextUrl.searchParams.get('enrollment_id')
  if(!id)return NextResponse.json({error:'Missing enrollment_id'},{status:400})
  const db=createAdminClient()
  const {data:e,error}=await db.from('sequence_enrollments').select('id,mode').eq('id',id).single()
  if(error||!e)return NextResponse.json({error:'Enrollment not found'},{status:404})
  try {
    const processed=e.mode==='ai_until_reply' ? await runAIEnrollment(id,aiEnginePorts(db)) : await runLegacyEnrollment(id,db)
    return NextResponse.json({processed})
  }catch {
    return NextResponse.json({error:'Sequence storage unavailable'},{status:503})
  }
}
