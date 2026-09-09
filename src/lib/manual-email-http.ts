import { handleManualEmail, type EmailDependencies } from './manual-email'

export async function handleManualEmailHttp(request: Request, dependencies: () => EmailDependencies): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' }
  const origin = request.headers.get('origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({ error: 'Origem não permitida.' }, { status: 403, headers })
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return Response.json({ error: 'Use application/json.' }, { status: 415, headers })
  }
  // Count actual bytes, not just Content-Length (chunked requests can omit or lie about it).
  const reader = request.body?.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        return Response.json({ error: 'Corpo excede 64 KiB.' }, { status: 413, headers })
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let input: unknown
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { return Response.json({ error: 'JSON inválido.' }, { status: 400, headers }) }
    const response = await handleManualEmail(input, dependencies())
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return Response.json({ error: 'Email indisponível. Preserve o identificador do envio.' }, { status: 503, headers })
  } finally { reader?.releaseLock() }
}
