import { manualPipelineRequest } from '@/lib/manual-pipeline-api'
/** Session + DB is_admin required. Target must still belong to the lead's owner. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return manualPipelineRequest(request, (await params).id, true)
}
