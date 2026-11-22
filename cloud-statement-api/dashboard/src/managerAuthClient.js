// LedgerDesk manager auth uses the same-origin Neon Auth reverse proxy.
// A small explicit client avoids @neon/auth adapter-version API mismatches.
export function createManagerAuthClient(baseUrl,request=globalThis.fetch){
  const base=new URL(baseUrl,globalThis.location?.href||'https://ledgerdesk.example');
  if(globalThis.location&&base.origin!==globalThis.location.origin)throw new Error('Manager authentication must use the current site');
  async function call(route,body){
    let response;
    try{
      response=await request(base.href.replace(/\/$/,'')+'/'+route,{
        method:body===undefined?'GET':'POST',
        credentials:'same-origin',cache:'no-store',
        headers:body===undefined?{'accept':'application/json'}:{'accept':'application/json','content-type':'application/json'},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
    }catch{return {data:null,error:{message:'Authentication service is unreachable.'}};}
    const payload=await response.json().catch(()=>null);
    if(!response.ok)return {data:null,error:{
      message:payload?.message||payload?.error?.message||'Authentication request failed ('+response.status+')',
      code:payload?.code||payload?.error?.code||String(response.status)
    }};
    return {data:payload,error:null};
  }
  return {
    signIn:{email:({email,password})=>call('sign-in/email',{email,password})},
    getSession:()=>call('get-session'),
    token:()=>call('token'),
    signOut:()=>call('sign-out',{}),
    changePassword:({currentPassword,newPassword,revokeOtherSessions=true})=>call('change-password',{currentPassword,newPassword,revokeOtherSessions})
  };
}
