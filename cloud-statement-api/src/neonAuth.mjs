import {createRemoteJWKSet,jwtVerify} from 'jose';

// The branch's Neon Auth URL is a trusted deployment setting, not an input from callers.
export function createNeonVerifier({baseUrl,jwksUrl,keySet}={}) {
  if (!baseUrl || !jwksUrl) throw new Error('Neon Auth issuer and JWKS URL required');
  const auth=new URL(baseUrl);
  const keysUrl=new URL(jwksUrl);
  if (auth.protocol!=='https:' || keysUrl.protocol!=='https:' ||
      keysUrl.origin!==auth.origin ||
      !keysUrl.pathname.startsWith(auth.pathname.replace(/\/$/,'')+'/'))
    throw new Error('Neon Auth issuer/JWKS settings must use the same trusted HTTPS endpoint');
  const issuer=auth.origin; // Neon documents JWT 'iss' as the auth origin.
  const jwks=keySet||createRemoteJWKSet(keysUrl);
  return async token=>{
    const {payload}=await jwtVerify(token,jwks,{
      issuer,
      algorithms:['EdDSA'],
      clockTolerance:'10s',
      maxTokenAge:'20m'
    });
    if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256||
       typeof payload.exp!=='number') throw new Error('Invalid Neon Auth identity');
    // Do not accept browser-issued "manager" or issuer claims for authorization.
    return {uid:payload.sub};
  };
}
