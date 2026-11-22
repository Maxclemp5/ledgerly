// Narrow same-origin reverse proxy for Neon Managed Auth.
// Keeping session cookies first-party avoids third-party cookie restrictions.
const methods=new Map([
  ['sign-in/email',['POST']],['get-session',['GET']],['token',['GET']],
  ['sign-out',['POST']],['change-password',['POST']],
  ['forget-password/email-otp',['POST']],
  ['email-otp/request-password-reset',['POST']],
  ['email-otp/reset-password',['POST']],
  ['email-otp/verify-email',['POST']],
  ['email-otp/send-verification-otp',['POST']]
]);
const maxBytes=32*1024;
export function createAuthProxy(baseUrl,{request=fetch}={}){
  const endpoint=new URL(baseUrl);
  if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.neon.tech'))throw Error('Trusted Neon Auth URL required');
  return async(req,res)=>{
    const pathname=new URL(req.url||'/','http://localhost').pathname;
    if(!pathname.startsWith('/auth/'))return false;
    const route=pathname.slice('/auth/'.length);
    if(!methods.get(route)?.includes(req.method)){
      res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:{message:'Route unavailable'}}));return true;
    }
    let body;
    if(req.method==='POST'){
      const chunks=[];let size=0;
      for await(const chunk of req){
        size+=chunk.length;
        if(size>maxBytes){res.writeHead(413);res.end();return true;}
        chunks.push(chunk);
      }
      body=Buffer.concat(chunks);
    }
    try{
      const headers={'accept':'application/json'};
      if(req.method==='POST')headers['content-type']='application/json';
      if(req.headers.cookie)headers.cookie=req.headers.cookie;
      if(req.headers.origin)headers.origin=req.headers.origin;
      const upstream=await request(endpoint.href.replace(/\/+$/,'')+'/'+route,{
        method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(12000)
      });
      const cookies=typeof upstream.headers.getSetCookie==='function'?upstream.headers.getSetCookie():[];
      const safeCookies=cookies.map(cookie=>cookie.replace(/;\s*Domain=[^;]*/ig,'').replace(/;\s*Path=[^;]*/ig,'')+'; Path=/');
      const responseHeaders={
        'content-type':upstream.headers.get('content-type')||'application/json',
        'cache-control':'no-store','x-content-type-options':'nosniff'
      };
      if(safeCookies.length)responseHeaders['set-cookie']=safeCookies;
      // Never reflect an auth-server redirect to another host.
      if(upstream.status>=300&&upstream.status<400){
        res.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});
        res.end(JSON.stringify({error:{message:'Authentication redirect is not supported'}}));return true;
      }
      res.writeHead(upstream.status,responseHeaders);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    }catch{
      res.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({error:{message:'Authentication service temporarily unavailable'}}));
    }
    return true;
  };
}
