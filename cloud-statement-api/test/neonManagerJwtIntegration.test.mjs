import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createNeonVerifier} from '../src/neonAuth.mjs';
import {createHandler} from '../src/handler.mjs';

// These disposable keys are generated in CI. They never belong to Neon or a real user.
const baseUrl='https://staging-auth.example.invalid/api/auth';
const jwksUrl=baseUrl+'/jwks';
async function fixture(){
  const {publicKey,privateKey}=await generateKeyPair('EdDSA',{crv:'Ed25519'});
  const pub=await exportJWK(publicKey);
  const keySet=createLocalJWKSet({keys:[{...pub,alg:'EdDSA',use:'sig',kid:'ci-test-key'}]});
  const verify=createNeonVerifier({baseUrl,jwksUrl,keySet});
  const token=async(overrides={})=>{
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({role:'manager',issuerOrgId:'untrusted-browser-claim'})
      .setProtectedHeader({alg:'EdDSA',kid:'ci-test-key'})
      .setSubject('synthetic-staging-manager')
      .setIssuer(overrides.issuer??'https://staging-auth.example.invalid')
      .setIssuedAt(overrides.iat??now)
      .setExpirationTime(overrides.exp??now+600)
      .sign(privateKey);
  };
  return {verify,token};
}
async function serve(handler,fn){
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
test('Neon-compatible EdDSA JWT grants readiness only with active SQL manager organization',async()=>{
  const {verify,token}=await fixture();
  let calls=0;
  const handler=createHandler({
    verify,
    store:{
      isManager:async()=>true,
      listManagerOrganizations:async()=>[{issuerOrgId:'synthetic-issuer'}]
    },
    pdfReadiness:{begin:()=>{calls++;return {status:'ready',ready:true,attempt:1};}}
  });
  await serve(handler,async base=>{
    const path=base+'/v1/manager/pdf-readiness';
    const noToken=await fetch(path);
    assert.equal(noToken.status,401);
    const badIssuer=await fetch(path,{headers:{authorization:'Bearer '+await token({issuer:'https://forged.example.invalid'})}});
    assert.equal(badIssuer.status,401);
    const expired=await fetch(path,{headers:{authorization:'Bearer '+await token({iat:Math.floor(Date.now()/1000)-3600,exp:Math.floor(Date.now()/1000)-1800})}});
    assert.equal(expired.status,401);
    const authorized=await fetch(path,{headers:{authorization:'Bearer '+await token()}});
    assert.equal(authorized.status,200);
    assert.equal((await authorized.json()).data.ready,true);
    assert.equal(calls,1);
  });
});
test('even valid signed JWT with manager claim cannot bypass missing SQL grants',async()=>{
  const {verify,token}=await fixture();
  for(const [isManager,organizations] of [[false,[]],[true,[]]]){
    let calls=0;
    const handler=createHandler({
      verify,
      store:{isManager:async()=>isManager,listManagerOrganizations:async()=>organizations},
      pdfReadiness:{begin:()=>{calls++;return {status:'ready',ready:true};}}
    });
    await serve(handler,async base=>{
      const response=await fetch(base+'/v1/manager/pdf-readiness',{
        headers:{authorization:'Bearer '+await token()}
      });
      assert.equal(response.status,403);
      assert.equal(calls,0);
    });
  }
});
