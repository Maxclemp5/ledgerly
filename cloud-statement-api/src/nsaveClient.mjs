const API_BASE='https://nsave.work/api/v1';
const MAX_PAGE=50;
const WINDOW_MS=60_000;
const MAX_REQUESTS=120;
const buckets=new Map();

function assertConfig(env){
  if(env.NSAVE_API_BASE_URL && env.NSAVE_API_BASE_URL.replace(/\/+$/,'')!==API_BASE)
    throw new Error('NSAVE_API_BASE_URL must match the approved nSave API origin and version');
  if(!env.NSAVE_SITE_SERVICE_TOKEN||!env.NSAVE_MANAGER_API_KEY)
    throw new Error('nSave API credentials are not configured');
}
function takeSlot(key,now=Date.now()){
  let b=buckets.get(key);
  if(!b||now-b.started>=WINDOW_MS){b={started:now,count:0};buckets.set(key,b)}
  if(b.count>=MAX_REQUESTS)throw Object.assign(new Error('nSave API rate limit reached'),{code:'UPSTREAM_RATE_LIMIT',status:429});
  b.count++;
}
function safePath(path){
  if(path!=='customers'&&path!=='customers/search'&&!/^customers\/[A-Za-z0-9_%.-]+$/.test(path))throw new Error('Unsupported nSave API route');
  return API_BASE+'/'+path;
}
export function createNsaveClient({env=process.env,request=fetch,now=Date.now}={}){
  return {
    configured(){return Boolean(env.NSAVE_SITE_SERVICE_TOKEN&&env.NSAVE_MANAGER_API_KEY)},
    async call(path,{method='GET',query={},body}={}){
      assertConfig(env);
      takeSlot(env.NSAVE_MANAGER_API_KEY,now());
      const url=new URL(safePath(path));
      for(const [k,v] of Object.entries(query))if(v!==undefined&&v!==null)url.searchParams.set(k,String(v));
      const headers={
        'OAI-Sites-Authorization':'Bearer '+env.NSAVE_SITE_SERVICE_TOKEN,
        'Authorization':'Bearer '+env.NSAVE_MANAGER_API_KEY,
        'Accept':'application/json'
      };
      if(body!==undefined)headers['Content-Type']='application/json';
      const response=await request(url.href,{
        method,headers, ...(body===undefined?{}:{body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(12_000),cache:'no-store',redirect:'error'
      });
      if(response.status===401||response.status===403){
        // Only classify the exact, documented service-token response.
        // Never expose raw upstream payloads, credentials, or customer data.
        const payload=await response.json().catch(()=>null);
        const serviceTokenRejected=payload?.error==='Service authorization required.';
        throw Object.assign(new Error('nSave rejected the configured API credentials'),{
          code:serviceTokenRejected?'NSAVE_SERVICE_TOKEN_REJECTED':'NSAVE_AUTH_FAILED',
          status:502,upstreamStatus:response.status
        });
      }
      if(response.status===429)
        throw Object.assign(new Error('nSave API rate limit reached'),{code:'UPSTREAM_RATE_LIMIT',status:429});
      if(!response.ok)
        throw Object.assign(new Error('nSave customer API request failed'),{code:'NSAVE_API_ERROR',status:502,upstreamStatus:response.status});
      return response.json();
    },
    listCustomers({limit=50,offset=0}={}){
      if(!Number.isInteger(limit)||limit<1||limit>MAX_PAGE||!Number.isInteger(offset)||offset<0)
        throw new Error('Invalid nSave customer pagination');
      return this.call('customers',{query:{limit,offset}});
    },
    getCustomer(id){
      if(typeof id!=='string'||!id.trim()||id.length>160||/[/?#]/.test(id))
        throw new Error('Invalid nSave customer identifier');
      return this.call('customers/'+encodeURIComponent(id.trim()));
    },
    searchCustomer(criteria){
      if(!criteria||typeof criteria!=='object'||Array.isArray(criteria))throw new Error('Search criteria required');
      const keys=Object.keys(criteria);
      if(keys.length!==1||!['account_number','name'].includes(keys[0])||
        typeof criteria[keys[0]]!=='string'||!criteria[keys[0]].trim()||criteria[keys[0]].length>160||
        (keys[0]==='account_number'&&!/^[0-9]+$/.test(criteria[keys[0]])))
        throw new Error('Search by exact account number or full customer name');
      return this.call('customers/search',{method:'POST',body:criteria});
    }
  };
}
