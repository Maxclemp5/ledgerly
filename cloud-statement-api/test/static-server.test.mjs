import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createStaticHandler} from '../src/staticServer.mjs';

test('SPA routes and same-origin assets are served with security headers',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'ledger-dashboard-'));
  await mkdir(path.join(dir,'assets'));
  await writeFile(path.join(dir,'index.html'),'<html>Dashboard</html>');
  await writeFile(path.join(dir,'assets','main.js'),'console.log("dashboard")');
  const handler=createStaticHandler({authBaseUrl:'https://auth.test/ledgerly/auth',publicDir:dir});
  const server=http.createServer(async(req,res)=>{
    if(await handler(req,res))return;
    res.writeHead(404);res.end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base+'/manager');
    assert.equal(page.status,200);
    assert.match(await page.text(),/Dashboard/);
    assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    for(const retired of ['/customer','/signup','/register']){
      const blocked=await fetch(base+retired);
      assert.equal(blocked.status,404);
      assert.match(await blocked.text(),/Customer module not hosted here/);
    }
    const asset=await fetch(base+'/assets/main.js');
    assert.equal(asset.status,200);
    assert.match(asset.headers.get('content-type'),/javascript/);
    const traversal=await fetch(base+'/assets/%2e%2e%2findex.html');
    assert.equal(traversal.status,404);
    const api=await fetch(base+'/v1/manager/summary');
    assert.equal(api.status,404);
  }finally{
    await new Promise(r=>server.close(r));
    await rm(dir,{recursive:true,force:true});
  }
});
