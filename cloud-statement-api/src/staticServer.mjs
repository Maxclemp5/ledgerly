import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {URL} from 'node:url';

const PUBLIC_DIR=path.resolve(process.cwd(),'public');
const contentTypes={
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.ico':'image/x-icon'
};

export function createStaticHandler({authBaseUrl,publicDir=PUBLIC_DIR}={}){
  if(!authBaseUrl)throw new Error('Neon Auth URL required for browser Content Security Policy');
  const authOrigin=new URL(authBaseUrl).origin;
  return async (req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD')return false;
    const pathname=new URL(req.url||'/','http://localhost').pathname;
    const isIndex=['/','/login','/customer','/manager'].includes(pathname);
    const isAsset=/^\/assets\/[a-zA-Z0-9._-]+$/.test(pathname);
    const isFavicon=pathname==='/favicon.svg';
    if(!isIndex&&!isAsset&&!isFavicon)return false;
    const relative=isIndex?'index.html':pathname.slice(1);
    // Only a known SPA route or one flat Vite asset filename may be read.
    const filename=path.join(publicDir,relative);
    const ext=path.extname(filename);
    try{
      const bytes=await readFile(filename);
      res.writeHead(200,{
        'content-type':contentTypes[ext]||'application/octet-stream',
        'cache-control':isIndex?'no-store':'public, max-age=31536000, immutable',
        'x-content-type-options':'nosniff',
        'referrer-policy':'no-referrer',
        'x-frame-options':'DENY',
        'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' "+authOrigin+"; frame-src "+authOrigin+"; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
      });
      if(req.method==='HEAD')res.end();
      else res.end(bytes);
    }catch(error){
      if(error.code==='ENOENT'){
        res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});
        res.end(JSON.stringify({error:{code:'NOT_FOUND',message:'Frontend asset unavailable'}}));
      }else{
        res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
        res.end(JSON.stringify({error:{code:'SERVICE_NOT_READY',message:'Frontend unavailable'}}));
      }
    }
    return true;
  };
}
