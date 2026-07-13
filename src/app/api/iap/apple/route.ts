import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { X509Certificate, createPublicKey, verify as cryptoVerify } from 'crypto'

/**
 * POST /api/iap/apple — valida a compra da assinatura CRM Pro feita via Apple (StoreKit 2)
 * dentro do app iOS e marca o buyer como assinante (mesmos campos do webhook Stripe).
 *
 * O app manda o JWS (transação assinada pela Apple). Validamos:
 *  1. Cadeia de certificados do header x5c até o Apple Root CA - G3 (embutido abaixo).
 *  2. Assinatura ES256 do JWS com a chave pública do certificado folha.
 *  3. Payload: bundleId, productId e expiração no futuro.
 * Aceita environment Sandbox (a revisão da Apple compra em sandbox) e Production.
 */

const BUNDLE_ID = 'com.lead4pro.app'
const PRODUCT_ID = 'crm_pro_monthly_99'

const APPLE_ROOT_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`

function b64uToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function verifyAppleJws(jws: string): any {
  const parts = jws.split('.')
  if (parts.length !== 3) throw new Error('jws_malformado')
  const header = JSON.parse(b64uToBuf(parts[0]).toString('utf8'))
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2) throw new Error('header_invalido')

  // cadeia: folha → intermediário(s) → raiz embutida
  const certs = header.x5c.map((c: string) => new X509Certificate(Buffer.from(c, 'base64')))
  const root = new X509Certificate(APPLE_ROOT_G3_PEM)
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error('cadeia_invalida')
  }
  const last = certs[certs.length - 1]
  const anchoredInRoot = last.verify(root.publicKey) || last.fingerprint256 === root.fingerprint256
  if (!anchoredInRoot) throw new Error('raiz_nao_apple')

  // assinatura do JWS (ES256 = raw R||S)
  const leafKey = createPublicKey(certs[0].publicKey)
  const ok = cryptoVerify('sha256', Buffer.from(parts[0] + '.' + parts[1]),
    { key: leafKey, dsaEncoding: 'ieee-p1363' }, b64uToBuf(parts[2]))
  if (!ok) throw new Error('assinatura_invalida')

  return JSON.parse(b64uToBuf(parts[1]).toString('utf8'))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const jws = typeof body?.jws === 'string' ? body.jws : ''
    if (!jws || jws.length > 20000) return NextResponse.json({ error: 'jws ausente' }, { status: 400 })

    let tx: any
    try { tx = verifyAppleJws(jws) } catch (e: any) {
      console.error('[iap/apple] verificação falhou:', e?.message)
      return NextResponse.json({ error: 'transação inválida' }, { status: 400 })
    }

    if (tx.bundleId !== BUNDLE_ID || tx.productId !== PRODUCT_ID) {
      return NextResponse.json({ error: 'produto inválido' }, { status: 400 })
    }
    const expiresMs = Number(tx.expiresDate || 0)
    const active = expiresMs > Date.now()

    const db = createAdminClient()
    const { data: buyer } = await db.from('buyers').select('id, crm_subscription_id').eq('auth_user_id', user.id).single()
    if (!buyer) return NextResponse.json({ error: 'buyer não encontrado' }, { status: 404 })

    // Não sobrescrever uma assinatura Stripe ativa com estado Apple
    const appleSubId = `apple:${tx.originalTransactionId || tx.transactionId}`
    if (buyer.crm_subscription_id && !String(buyer.crm_subscription_id).startsWith('apple:') && !active) {
      return NextResponse.json({ ok: true, skipped: 'stripe_sub_present' })
    }

    await db.from('buyers').update({
      crm_plan: active ? 'pro' : 'free',
      crm_subscription_id: appleSubId,
      crm_subscription_status: active ? 'active' : 'inactive',
      crm_billing_interval: 'month',
      crm_expires_at: expiresMs ? new Date(expiresMs).toISOString() : null,
    }).eq('id', buyer.id)

    console.log(`[iap/apple] assinatura ${active ? 'ATIVA' : 'inativa'} p/ buyer ${buyer.id} (${tx.environment}) exp=${new Date(expiresMs).toISOString()}`)
    return NextResponse.json({ ok: true, active, expiresAt: expiresMs })
  } catch (e: any) {
    console.error('[iap/apple]', e?.message)
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}
