const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Rebuild a same-origin allowlisted destination, never forward arbitrary query strings. */
export function safePipelineReturn(value: string | null) {
  try {
    if (!value?.startsWith('/') || value.startsWith('//')) return '/dashboard/pipeline'
    const url = new URL(value,'https://local.invalid')
    if (url.origin !== 'https://local.invalid' || !['/dashboard/pipeline','/m/pipeline'].includes(url.pathname)) return '/dashboard/pipeline'
    const query = new URLSearchParams()
    for (const key of ['pipeline']) {
      const id = url.searchParams.get(key)
      if (id && uuid.test(id)) query.set(key,id)
    }
    return url.pathname + (query.size ? `?${query}` : '')
  } catch { return '/dashboard/pipeline' }
}
/** Only resolve within the authenticated account list, never fetch arbitrary item IDs. */
export function resolveActionEdit<T extends {id: string}>(search: string, items: T[]): T | null {
  const id = new URLSearchParams(search).get('edit')
  return items.find(item=>item.id===id) ?? null
}
export function actionEditHref(kind: 'sequences' | 'automations', id: string, returnTo: string) {
  const safeReturn = safePipelineReturn(returnTo)
  const base = safeReturn.split('?')[0] === '/m/pipeline' ? '/m' : '/dashboard'
  return `${base}/${kind}?${new URLSearchParams({edit:id,returnTo:safeReturn})}`
}
