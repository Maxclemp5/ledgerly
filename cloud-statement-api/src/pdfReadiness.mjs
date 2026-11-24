// PDF readiness coordinator. No statement data or authentication secrets are sent
// during warm-up. Concurrent callers share one bounded readiness probe.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createPdfReadiness({
  getBase=()=>process.env.LEDGERDESK_EMBEDDED_PDF_URL||process.env.PDF_STAMPER_URL,
  fetchImpl=fetch,
  now=Date.now,
  wait=pause,
  logger=console,
  maxWaitMs=100000,
  retryDelayMs=2500,
  probeTimeoutMs=8000,
  readyTtlMs=15000
}={}){
  let state='idle', lastCheckedAt=null, lastReadyAt=0, inFlight=null, attempt=0;
  function snapshot(){
    return {status:state,ready:state==='ready',attempt,lastCheckedAt};
  }
  async function check(){
    const base=getBase();
    if(!base){state='unavailable';lastCheckedAt=new Date(now()).toISOString();return false;}
    let url;
    try{
      url=new URL('/health',base);
      if(!['https:','http:'].includes(url.protocol))throw new Error('Invalid health protocol');
    }catch{
      state='unavailable';lastCheckedAt=new Date(now()).toISOString();return false;
    }
    try{
      const response=await fetchImpl(url,{method:'GET',headers:{accept:'application/json'},
        signal:AbortSignal.timeout(probeTimeoutMs),cache:'no-store'});
      if(response.ok){
        const body=await response.json().catch(()=>null);
        if(body?.status==='ok'){
          lastReadyAt=now();lastCheckedAt=new Date(now()).toISOString();
          state='ready';return true;
        }
      }
    }catch{
      // Normal for cold starts: retry without emitting noisy customer-facing errors.
    }
    lastCheckedAt=new Date(now()).toISOString();
    state='recovering';
    return false;
  }
  function warm({force=false}={}){
    if(inFlight)return inFlight;
    if(!force&&state==='ready'&&now()-lastReadyAt<readyTtlMs)return Promise.resolve(true);
    const base=getBase();
    if(!base){state='unavailable';return Promise.resolve(false);}
    // Keep an already-verified worker available while a nonblocking refresh
    // runs. Only enter starting for first initialization or actual recovery.
    if(state!=='ready')state='starting';
    attempt=0;
    const task=(async()=>{
      const deadline=now()+maxWaitMs;
      while(now()<deadline){
        attempt++;
        if(await check())return true;
        if(now()+retryDelayMs>=deadline)break;
        await wait(retryDelayMs);
      }
      state='unavailable';
      logger.warn('PDF renderer readiness timed out; no customer data involved');
      return false;
    })();
    inFlight=task;
    void task.finally(()=>{if(inFlight===task)inFlight=null;});
    return task;
  }
  function begin(){
    if(!inFlight&&(state!=='ready'||now()-lastReadyAt>=readyTtlMs))void warm();
    return snapshot();
  }
  return {begin,warm,snapshot};
}
