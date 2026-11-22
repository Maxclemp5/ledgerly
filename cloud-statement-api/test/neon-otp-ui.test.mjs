import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNeonOtp} from '../dashboard/src/neonOtp.js';

test('Neon managed auth uses forgetPassword.emailOtp when present',async()=>{
  const calls=[];
  const otp=createNeonOtp({
    forgetPassword:{async emailOtp(payload){calls.push(payload);return {data:{success:true}};}}
  });
  const r=await otp.requestPasswordReset('example@example.test');
  assert.equal(r.data.success,true);
  assert.equal(calls[0].email,'example@example.test');
});

test('Falls back to Better Auth $fetch for missing OTP namespace',async()=>{
  const calls=[];
  const otp=createNeonOtp({async $fetch(path,opts){calls.push({path,opts});return {data:{success:true}};}});
  await otp.requestPasswordReset('example@example.test');
  await otp.resetPassword('example@example.test','123456','test-secret');
  await otp.verifyEmail('example@example.test','123456');
  await otp.sendVerificationOtp('example@example.test');
  assert.deepEqual(calls.map(c=>c.path),[
    '/email-otp/request-password-reset',
    '/email-otp/reset-password',
    '/email-otp/verify-email',
    '/email-otp/send-verification-otp'
  ]);
  for(const item of calls)assert.equal(item.opts.method,'POST');
});

test('Unsupported adapter produces actionable error rather than undefined property access',async()=>{
  const otp=createNeonOtp({});
  await assert.rejects(otp.requestPasswordReset('example@example.test'),/Email OTP is unavailable/);
});
