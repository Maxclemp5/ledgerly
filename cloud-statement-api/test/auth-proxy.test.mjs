import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAuthProxy} from '../src/authProxy.mjs';

test('same-origin proxy forwards session cookie without external Domain',async()=>{
  let seen;
  const proxy=createAuthProxy('https://branch.neonauth.example.neon.tech/db/auth',{
    request:async(url,options)=>{
      seen={url,options};
      return new Response(JSON.stringify({user:{email:'manager@example.test'}}),{
        status:200,headers:{'content-type':'application/json',
          'set-cookie':'better-auth.session_token=xyz; Domain=branch.neonauth.example.neon.tech; Path=/db/auth; HttpOnly; Secure; SameSite=None'}
      });
    }
  });
  const server=http.createServer(async(req,res)=>{
    if(!(await proxy(req,res))){res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base+'/auth/sign-in/email',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'manager@example.test',password:'test-password'})
    });
    assert.equal(response.status,200);
    assert.equal(seen.url,'https://branch.neonauth.example.neon.tech/db/auth/sign-in/email');
    const cookie=response.headers.get('set-cookie');
    assert.match(cookie,/Path=\//);
    assert.doesNotMatch(cookie,/Domain=/);
    const blocked=await fetch(base+'/auth/unknown');
    assert.equal(blocked.status,404);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
