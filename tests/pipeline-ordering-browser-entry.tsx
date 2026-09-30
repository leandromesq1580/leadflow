import React from 'react'
import {createRoot} from 'react-dom/client'
import Desktop from '../src/app/dashboard/pipeline/page'
import Mobile from '../src/app/m/pipeline/page'
import {I18nProvider} from '../src/lib/i18n-client'
const native=window.fetch.bind(window)
// Deliberately ignore abort to exercise logical stale-request guards.
window.fetch=(url,init)=>native(url,{...init,signal:undefined})
const locale=new URLSearchParams(location.search).get('locale')
createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider locale={locale==='en'||locale==='es'?locale:'pt'}><main className={location.pathname.startsWith('/m/')?'m-root':''} style={{padding:location.pathname.startsWith('/m/')?0:24}}>{location.pathname.startsWith('/m/')?<Mobile/>:<Desktop/>}</main></I18nProvider></React.StrictMode>)
