import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManagerAuthClient} from '../dashboard/src/managerAuthClient.js';
const base='https://manager.example.test/auth';
test('manager auth client exposes signIn email, getSession and token without SDK adapter',async()=>{
 const requests=[];
 const client=createManagerAuthClient(base,async(url,options)=>{
   requests.push({url,options});
   const path=url.split('/').at(-1);
   return new Response(JSON.stringify(path==='get-session'?{user:{email:'manager@example.test'},session:{id:'s'}}:path==='token'?{token:'jwt'}:{user:{email:'manager@example.test'}}),{status:200,headers:{'content-type':'application/json'}});
 });
 const signIn=await client.signIn.email({email:'manager@example.test',password:'test-password'});
 assert.equal(signIn.data.user.email,'manager@example.test');
 const session=await client.getSession();
 assert.equal(session.data.user.email,'manager@example.test');
 const token=await client.token();
 assert.equal(token.data.token,'jwt');
 assert.equal(requests[0].url,base+'/sign-in/email');
 assert.equal(requests[0].options.credentials,'same-origin');
 assert.equal(requests[1].url,base+'/get-session');
 assert.equal(requests[2].url,base+'/token');
});
test('manager auth client reports upstream failure instead of throwing',async()=>{
 const client=createManagerAuthClient(base,async()=>new Response(JSON.stringify({message:'Invalid credentials'}),{status:401,headers:{'content-type':'application/json'}}));
 const result=await client.signIn.email({email:'manager@example.test',password:'wrong'});
 assert.equal(result.error.message,'Invalid credentials');
});
