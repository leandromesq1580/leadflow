import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { sequenceAPI } from '@/lib/sequence-api'

export async function GET(request: Request) {
  const db = createAdminClient()
  return sequenceAPI(db, () => callerBuyer(db))('enrollments', request)
}

export async function POST(request: Request) {
  const db = createAdminClient()
  return sequenceAPI(db, () => callerBuyer(db))('enroll', request)
}

export async function DELETE(request: Request) {
  const db = createAdminClient()
  return sequenceAPI(db, () => callerBuyer(db))('stop', request)
}
