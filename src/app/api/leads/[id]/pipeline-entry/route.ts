import { manualPipelineRequest } from '@/lib/manual-pipeline-api'
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, { params }: Context) {
  return manualPipelineRequest(request, (await params).id)
}
export async function POST(request: Request, { params }: Context) {
  return manualPipelineRequest(request, (await params).id)
}
