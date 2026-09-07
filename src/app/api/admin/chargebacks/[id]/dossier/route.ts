import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { dossierLines, loadChargebackDossier } from '@/lib/chargeback-dossier'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await context.params
  const dossier = await loadChargebackDossier(db, id)
  if (!dossier) return NextResponse.json({ error: 'Chargeback not found' }, { status: 404 })

  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const size = 9
  const width = 612
  const height = 792
  const margin = 42
  const lineHeight = 13
  let page = pdf.addPage([width, height])
  let y = height - margin

  const writeLine = (text: string) => {
    const maxChars = 102
    const chunks = text ? text.match(new RegExp(`.{1,${maxChars}}(?:\\s|$)|\\S+`, 'g')) || [text] : ['']
    for (const chunk of chunks) {
      if (y < margin) { page = pdf.addPage([width, height]); y = height - margin }
      const heading = /^\d+\.|^LEAD4PRO/.test(chunk)
      page.drawText(chunk.trimEnd(), { x: margin, y, size: heading ? 10 : size, font: heading ? bold : regular, color: rgb(0.12, 0.12, 0.2), maxWidth: width - margin * 2 })
      y -= lineHeight
    }
  }
  for (const line of dossierLines(dossier)) writeLine(line)

  const bytes = await pdf.save()
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="chargeback-${dossier.case.stripe_dispute_id}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
