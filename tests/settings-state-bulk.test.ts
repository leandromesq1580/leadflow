import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('state settings expose bulk select and deselect in all supported languages', () => {
  for (const file of [
    'src/app/dashboard/settings/settings-form.tsx',
    'src/app/m/config/page.tsx',
  ]) {
    const code = source(file)
    assert.match(code, /Selecionar todos.*Select all.*Seleccionar todos/s)
    assert.match(code, /Desmarcar todos.*Deselect all.*Desmarcar todos/s)
  }
})

test('desktop bulk state changes use the immediate autosave path', () => {
  const code = source('src/app/dashboard/settings/settings-form.tsx')
  assert.match(code, /function selectAllStates\(\) \{\s*markSelectionChange\(\)\s*setStates\(\[\.\.\.allStates\]\)/)
  assert.match(code, /function deselectAllStates\(\) \{\s*markSelectionChange\(\)\s*setStates\(\[\]\)/)
})
