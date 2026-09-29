import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { sequenceAPI } from '@/lib/sequence-api'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  return sequenceAPI(db, () => callerBuyer(db))('save', request, (await params).id)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  return sequenceAPI(db, () => callerBuyer(db))('remove', request, (await params).id)
}
