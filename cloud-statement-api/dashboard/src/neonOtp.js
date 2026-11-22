// Neon Auth manages these endpoints. The installed client adapter can omit
// emailOTPClient methods; use the documented HTTPS endpoints as a fallback.
export function createNeonOtp(client,baseUrl,request=globalThis.fetch){
  const base=new URL(baseUrl);
  if(base.protocol!=='https:'||!base.hostname.endsWith('.neon.tech'))
    throw new Error('Neon Auth configuration is invalid');
  const post=async(path,body)=>{
    const url=base.href.replace(/\/+$/,'')+path;
    let response;
    try{
      response=await request(url,{
        method:'POST',
        mode:'cors',
        credentials:'include',
        referrerPolicy:'no-referrer',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(body)
      });
    }catch{
      return {data:null,error:{message:'Could not contact Neon Auth. Check your connection and try again.'}};
    }
    let data;
    try{data=await response.json()}catch{data={}}
    if(!response.ok){
      const message=typeof data?.message==='string'?data.message:
        typeof data?.error?.message==='string'?data.error.message:
        'Authentication service rejected this request ('+response.status+').';
      return {data:null,error:{message,code:data?.code||data?.error?.code||String(response.status),status:response.status}};
    }
    return {data,error:null};
  };
  return {
    async requestPasswordReset(email){
      if(typeof client?.emailOtp?.requestPasswordReset==='function')
        return client.emailOtp.requestPasswordReset({email});
      if(typeof client?.forgetPassword?.emailOtp==='function')
        return client.forgetPassword.emailOtp({email});
      // The Neon Managed Better Auth email-OTP reference documents this route.
      const result=await post('/forget-password/email-otp',{email});
      if(result.error?.status===404)
        return post('/email-otp/request-password-reset',{email});
      return result;
    },
    resetPassword(email,otp,password){
      if(typeof client?.emailOtp?.resetPassword==='function')
        return client.emailOtp.resetPassword({email,otp,password});
      return post('/email-otp/reset-password',{email,otp,password});
    },
    verifyEmail(email,otp){
      if(typeof client?.emailOtp?.verifyEmail==='function')
        return client.emailOtp.verifyEmail({email,otp});
      return post('/email-otp/verify-email',{email,otp});
    },
    sendVerificationOtp(email){
      if(typeof client?.emailOtp?.sendVerificationOtp==='function')
        return client.emailOtp.sendVerificationOtp({email,type:'email-verification'});
      return post('/email-otp/send-verification-otp',{email,type:'email-verification'});
    }
  };
}
