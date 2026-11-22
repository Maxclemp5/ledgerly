import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNeonOtp} from '../dashboard/src/neonOtp.js';
const origin='https://test.neonauth.us-east-1.aws.neon.tech/project/auth';
test('OTP fallback uses Neon HTTPS endpoint when SDK methods absent',async()=>{
  const requests=[];
  const send=async(url,options)=>{
    requests.push({url,options});
    return new Response(JSON.stringify({success:true}),{status:200});
  };
  const otp=createNeonOtp({},origin,send);
  const result=await otp.requestPasswordReset('someone@example.test');
  assert.equal(result.data.success,true);
  assert.equal(requests[0].url,origin+'/forget-password/email-otp');
  assert.equal(requests[0].options.method,'POST');
  assert.equal(requests[0].options.credentials,'include');
});
test('OTP fallback returns actual provider errors',async()=>{
  const otp=createNeonOtp({},origin,async()=>new Response(
    JSON.stringify({message:'Rate limit reached'}),{status:429}
  ));
  const result=await otp.requestPasswordReset('someone@example.test');
  assert.equal(result.error.status,429);
});
