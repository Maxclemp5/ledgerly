// Compatible with Neon Managed Better Auth client adapters.
export function createNeonOtp(client) {
  async function call(owner,method,path,body) {
    if (typeof owner?.[method]==='function') return owner[method](body);
    if (typeof client?.$fetch==='function') return client.$fetch(path,{method:'POST',body});
    throw new Error('Email OTP is unavailable. Please contact the administrator.');
  }
  return {
    requestPasswordReset(email) {
      if (typeof client?.forgetPassword?.emailOtp==='function')
        return client.forgetPassword.emailOtp({email});
      return call(client?.emailOtp,'requestPasswordReset','/email-otp/request-password-reset',{email});
    },
    resetPassword(email,otp,password) {
      return call(client?.emailOtp,'resetPassword','/email-otp/reset-password',{email,otp,password});
    },
    verifyEmail(email,otp) {
      return call(client?.emailOtp,'verifyEmail','/email-otp/verify-email',{email,otp});
    },
    sendVerificationOtp(email) {
      return call(client?.emailOtp,'sendVerificationOtp','/email-otp/send-verification-otp',{email,type:'email-verification'});
    }
  };
}
