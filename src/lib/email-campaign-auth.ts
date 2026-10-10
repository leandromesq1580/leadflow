export type CampaignBuyerQuery={select:(columns:'id,is_admin')=>{eq:(column:'auth_user_id',uid:string)=>{single:()=>PromiseLike<{data:{id:string;is_admin:boolean}|null;error:unknown}>}}}
type Dependencies={getUser:()=>PromiseLike<{data:{user:{id:string}|null};error:unknown}>;buyers:()=>CampaignBuyerQuery}
export async function authenticateCampaignAdmin(deps:Dependencies):Promise<{id:string}|Response>{
 const {data:{user},error}=await deps.getUser()
 if(error||!user)return Response.json({error:'Não autorizado.'},{status:401})
 // buyers.id is NOT the Auth uid. Only the signed-in buyer's own admin flag counts.
 const {data:buyer,error:e}=await deps.buyers().select('id,is_admin').eq('auth_user_id',user.id).single()
 if(e||buyer?.is_admin!==true)return Response.json({error:'Acesso exclusivo do admin.'},{status:403})
 return {id:buyer.id}
}
