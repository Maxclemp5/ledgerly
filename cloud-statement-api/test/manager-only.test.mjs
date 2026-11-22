import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import {createHandler} from '../src/handler.mjs';

test('organization frontend exposes no customer signup/login/dashboard',async()=>{
  const source=await readFile(new URL('../dashboard/src/main.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/CustomerDashboard|signUp\.email|function CustomerLogin|mode==='signup'/);
  assert.match(source,/ManagerLogin/);
  assert.match(source,/LegacyAdmin/);
  assert.match(source,/Verify manager email/);
  assert.match(source,/password reset code|password setup code|Send password code/);
});

test('customer-specific API routes disabled in Manager-only deployment',async()=>{
  const handler=createHandler({
    verify:async token=>({uid:token}),
    store:{async listManagerOrganizations(){return[]},async isManager(){return false}},
    allowedOrigin:'https://manager.example.test',logger:{error(){}}
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const routes=['/v1/me/accounts','/v1/me/statement-requests',
      '/v1/me/statement-requests/550e8400-e29b-41d4-a716-446655440000',
      '/v1/me/statements/550e8400-e29b-41d4-a716-446655440000/download'];
    for(const route of routes){
      const res=await fetch(base+route,{headers:{authorization:'Bearer test_user'}});
      assert.equal(res.status,404,route);
    }
  }finally{await new Promise(resolve=>server.close(resolve))}
});
