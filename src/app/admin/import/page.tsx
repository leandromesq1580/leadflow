'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ImportPage() {
  const [sheetUrl, setSheetUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any[]>([])

  async function fetchSheet() {
    if (!sheetUrl) return
    setLoading(true)
    setError('')
    setPreview([])
    setResult(null)

    try {
      // Extract sheet ID and gid from URL
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
      const gidMatch = sheetUrl.match(/gid=(\d+)/)
      if (!match) { setError('URL invalida'); setLoading(false); return }

      const sheetId = match[1]
      const gid = gidMatch?.[1] || '0'

      // Fetch CSV via public export
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      const resp = await fetch(csvUrl)
      const text = await resp.text()

      // Parse CSV
      const lines = text.split('\n').filter(l => l.trim())
      const headers = parseCSVLine(lines[0])

      const leads = lines.slice(1).map(line => {
        const values = parseCSVLine(line)
        const obj: any = {}
        headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim() || '' })
        return obj
      }).filter(l => l.full_name || l.email)

      setPreview(leads)
    } catch (err: any) {
      setError(err?.message || 'Erro ao buscar planilha')
    }
    setLoading(false)
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { result.push(current); current = ''; continue }
      current += char
    }
    result.push(current)
    return result
  }

  function getAge(dateStr: string): { days: number; color: string } {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
    const color = days <= 3 ? '#10b981' : days <= 7 ? '#f59e0b' : '#ef4444'
    return { days, color }
  }

  async function importLeads() {
    setLoading(true)
    setError('')

    const resp = await fetch('/api/import-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leads: preview, sheetUrl }),
    })

    const data = await resp.json()
    setResult(data)
    setLoading(false)
  }

  return (
    <div className="max-w-[1100px]">
      <Link href="/admin/leads" className="text-[13px] font-medium mb-6 inline-block" style={{ color: '#6366f1' }}>← Voltar para leads</Link>

      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Importar Leads</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Importe leads do Google Sheets com a data original preservada</p>

      {/* Sheet URL Input */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1a1a2e' }}>1. Cole o link da planilha</h2>
        <div className="flex gap-3">
          <input
            type="url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="flex-1 px-4 py-3 rounded-xl text-[14px]"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
          />
          <button onClick={fetchSheet} disabled={loading || !sheetUrl}
            className="px-6 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: '#6366f1' }}>
            {loading ? 'Carregando...' : 'Buscar Leads'}
          </button>
        </div>
        {error && <p className="text-[13px] mt-3 font-semibold" style={{ color: '#ef4444' }}>{error}</p>}
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          <h2 className="text-[15px] font-bold mb-2" style={{ color: '#10b981' }}>✅ Importacao Concluida</h2>
          <p className="text-[14px]" style={{ color: '#065f46' }}>
            {result.imported} importados · {result.skipped} ignorados (duplicados ou incompletos) · {result.total} total
          </p>
          {result.errors?.length > 0 && (
            <div className="mt-2">
              {result.errors.map((e: string, i: number) => (
                <p key={i} className="text-[12px]" style={{ color: '#b91c1c' }}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && !result && (
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid #e8ecf4' }}>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>2. Preview — {preview.length} leads encontrados</h2>
              <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>Confira os dados antes de importar</p>
            </div>
            <button onClick={importLeads} disabled={loading}
              className="px-6 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: '#10b981' }}>
              {loading ? 'Importando...' : `Importar ${preview.length} Leads`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: '#f8f9fc', borderBottom: '1px solid #e8ecf4' }}>
                  <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Nome</th>
                  <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Telefone</th>
                  <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Email</th>
                  <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Data</th>
                  <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Idade</th>
                  <th className="text-left px-4 py-2 text-[11px] font-bold uppercase" style={{ color: '#94a3b8' }}>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((lead, i) => {
                  const age = lead.created_time ? getAge(lead.created_time) : { days: 0, color: '#94a3b8' }
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{lead.full_name}</td>
                      <td className="px-4 py-2 text-[13px]" style={{ color: '#64748b' }}>{(lead.phone || '').replace(/^p:/, '')}</td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: '#94a3b8' }}>{lead.email}</td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: '#64748b' }}>{lead.created_time ? new Date(lead.created_time).toLocaleDateString('pt-BR') : '—'}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: age.color + '20', color: age.color }}>
                          {age.days}d
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[12px]">
                        {age.days > 7 ? <span style={{ color: '#3b82f6' }}>❄️ Frio</span> : <span style={{ color: '#ef4444' }}>🔥 Quente</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="text-center py-3 text-[12px]" style={{ color: '#94a3b8' }}>... e mais {preview.length - 50} leads</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
