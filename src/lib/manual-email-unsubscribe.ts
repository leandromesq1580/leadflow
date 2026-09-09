export async function handleEmailUnsubscribe(request: Request, suppress: (token: string) => Promise<boolean>): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') || ''
  const headers = {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  }
  const page = (text: string, status = 200) => new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Descadastro / Unsubscribe</title><body><main>${text}</main></body></html>`, { status, headers })
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return page('<h1>Link inválido / Invalid link</h1>', 400)
  if (request.method === 'GET') {
    // GET is safe for link scanners. The POST also supports RFC 8058 one-click headers.
    return page('<h1>Não receber emails manuais deste cliente?</h1><p>Unsubscribe from manual emails from this sender / Cancelar los emails manuales de este remitente.</p><form method="post"><button type="submit">Confirmar descadastro / Unsubscribe / Cancelar suscripción</button></form>')
  }
  if (request.method !== 'POST') return page('<h1>Método não permitido</h1>', 405)
  try {
    if (!(await suppress(token))) return page('<h1>Link inválido / Invalid link</h1>', 404)
    return page('<h1>Descadastro confirmado / Unsubscribed / Suscripción cancelada</h1><p>Você não receberá novos emails manuais deste cliente. You will not receive new manual emails from this sender.</p>')
  } catch { return page('<h1>Não foi possível confirmar. Tente novamente / Please try again.</h1>', 503) }
}
