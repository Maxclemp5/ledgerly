import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {createNeonVerifier} from '../src/neonAuth.mjs';

const baseUrl='https://testing.neonauth.aws.neon.tech/ledgerly_test/auth';
const jwksUrl=baseUrl+'/.well-known/jwks.json';
async function fixture(){
  const {publicKey,privateKey}=await generateKeyPair('EdDSA',{extractable:true});
  const jwk=await exportJWK(publicKey);Object.assign(jwk,{alg:'EdDSA',kid:'test-key',use:'sig'});
  const keySet=createLocalJWKSet({keys:[jwk]});
  const verify=createNeonVerifier({baseUrl,jwksUrl,keySet});
  const sign=({issuer=new URL(baseUrl).origin,subject='user-123',expired=false}={})=>
    new SignJWT({}).setProtectedHeader({alg:'EdDSA',kid:'test-key'})
    .setIssuer(issuer).setSubject(subject).setIssuedAt(expired?'-1h':undefined)
    .setExpirationTime(expired?'-30m':'10m').sign(privateKey);
  return {verify,sign};
}
test('valid signed Neon Auth JWT returns trusted user subject',async()=>{
  const {verify,sign}=await fixture();
  assert.deepEqual(await verify(await sign()),{uid:'user-123'});
});
test('rejects wrong issuer and expired tokens',async()=>{
  const {verify,sign}=await fixture();
  await assert.rejects(verify(await sign({issuer:'https://evil.example'})));
  await assert.rejects(verify(await sign({expired:true})));
});
test('rejects modified or unsigned tokens',async()=>{
  const {verify,sign}=await fixture();
  const token=await sign();
  await assert.rejects(verify(token.slice(0,-1)+(token.slice(-1)==='a'?'b':'a')));
  await assert.rejects(verify('unsigned')));
});
test('rejects misconfigured JWKS and insecure auth URL',async()=>{
  assert.throws(()=>createNeonVerifier({baseUrl:'http://testing.neonauth.aws.neon.tech/auth',jwksUrl}));
  assert.throws(()=>createNeonVerifier({baseUrl,jwksUrl:'https://other.example/jwks'}));
});
