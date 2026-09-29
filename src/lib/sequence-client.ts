export async function sequenceJSON(url:string,init?:RequestInit,send:typeof fetch=fetch){
 const r=await send(url,init)
 const data=await r.json().catch(()=>({}))
 if(!r.ok)throw new Error(data.error||`Falha HTTP ${r.status}`)
 return data
}
export async function saveSequenceDraft(url:string,payload:unknown,close:()=>void,reload:()=>Promise<void>,send:typeof fetch=fetch){
 await sequenceJSON(url,{method:url==='/api/sequences'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},send)
 close()
 try{await reload()}catch{throw new Error('Salvo, mas não foi possível recarregar a lista. Atualize a página; não salve novamente.')}
}
