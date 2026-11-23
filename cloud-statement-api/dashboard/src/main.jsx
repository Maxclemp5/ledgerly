import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createManagerAuthClient} from './managerAuthClient.js';
import {
  ArrowRight,CheckCircle2,ChevronRight,CircleAlert,Eye,EyeOff,
  KeyRound,LockKeyhole,LogOut,Menu,RefreshCw,ShieldCheck,X
} from 'lucide-react';
import {createNeonOtp} from './neonOtp.js';
import LegacyAdmin,{ManagerPasswordForm} from './LegacyAdmin.jsx';
import './style.css';

function Brand(){
  return <div className="brand" aria-label="nsave LedgerDesk manager portal">
    <span className="brand-nsave">nsave</span>
    <span className="brand-divider" aria-hidden="true"/>
    <span className="brand-product">LedgerDesk<small>Manager portal</small></span>
  </div>;
}
function Notice({message,success=false,onClose}){
  if(!message)return null;
  return <div className={'notice '+(success?'notice-success':'notice-error')} role={success?'status':'alert'}>
    {success?<CheckCircle2 size={18}/>:<CircleAlert size={18}/>}<span>{message}</span>
    {onClose&&<button aria-label="Dismiss" className="icon-button" onClick={onClose}><X size={15}/></button>}
  </div>;
}
function PasswordInput({value,onChange,autoComplete,placeholder}){
  const [show,setShow]=useState(false);
  return <div className="password-wrap"><input
    type={show?'text':'password'} value={value} onChange={e=>onChange(e.target.value)}
    autoComplete={autoComplete} placeholder={placeholder} minLength={autoComplete==='new-password'?12:8}
    required/>
    <button className="password-toggle" type="button" onClick={()=>setShow(v=>!v)} aria-label={show?'Hide password':'Show password'}>
      {show?<EyeOff size={18}/>:<Eye size={18}/>}
    </button>
  </div>;
}

function ManagerLogin({client,authBaseUrl,onSignIn}){
  // No self-registration: manager identities are provisioned by an administrator.
  const [mode,setMode]=useState('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [otp,setOtp]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  function navigate(next){setMode(next);setError('');setNotice('');setOtp('');setPassword('');setConfirmPassword('');}
  async function handle(event){
    event.preventDefault();
    setError('');setNotice('');setBusy(true);
    const mail=email.trim().toLowerCase();
    try{
      let result;
      const neonOtp=createNeonOtp(client,authBaseUrl);
      if(mode==='login'){
        result=await neonOtp.signInWithEmail(mail,password);
        if(result?.error){
          if(/verif/i.test(result.error.code||'')||/verif/i.test(result.error.message||'')){
            navigate('verify-request');
            setNotice('Email verification is required before signing in.');
            return;
          }
          throw new Error(result.error.message||'Sign-in failed. Check your credentials.');
        }
        await onSignIn();
        return;
      }
      if(mode==='forgot'){
        result=await neonOtp.requestPasswordReset(mail);
        if(result?.error)throw new Error(result.error.message||'Unable to send a password setup code');
        setMode('reset');setOtp('');
        setNotice('If this manager email exists, a one-time password setup code will be delivered.');
        return;
      }
      if(mode==='reset'){
        if(password.length<12)throw new Error('Use a private password containing at least 12 characters.');
        if(password!==confirmPassword)throw new Error('Password confirmation does not match.');
        result=await neonOtp.resetPassword(mail,otp.trim(),password);
        if(result?.error)throw new Error(result.error.message||'Password setup failed');
        navigate('login');
        setNotice('Your password has been updated. Please sign in.');
        return;
      }
      if(mode==='verify-request'){
        result=await neonOtp.sendVerificationOtp(mail);
        if(result?.error)throw new Error(result.error.message||'Could not send verification code');
        setMode('verify');setOtp('');
        setNotice('Enter the email verification code to activate your manager identity.');
        return;
      }
      if(mode==='verify'){
        result=await neonOtp.verifyEmail(mail,otp.trim());
        if(result?.error)throw new Error(result.error.message||'Email verification failed');
        navigate('forgot');
        setNotice('Email verified. Continue by setting your private manager password.');
      }
    }catch(e){setError(e?.message||'Please try again.');}
    finally{setBusy(false);}
  }
  const reset=mode==='reset';
  const verify=mode==='verify'||mode==='verify-request';
  const title={
    login:'Manager sign in',
    forgot:'Set or reset your password',
    reset:'Create your private password',
    'verify-request':'Verify your manager email',
    verify:'Enter verification code'
  }[mode];
  const subtitle={
    login:'Sign in using your organization-approved manager account.',
    forgot:'We will email a one-time code to an existing manager identity.',
    reset:'Enter the code you received and choose your own secure password.',
    'verify-request':'Receive an email verification code for your manager identity.',
    verify:'Verify your email before setting your private password.'
  }[mode];
  return <div className="auth-layout">
    <aside className="auth-illustration">
      <div className="auth-top"><Brand/><span className="auth-pill"><span className="live-light"/> ORGANIZATION PORTAL</span></div>
      <div className="auth-pitch">
        <span className="eyebrow bright">NSAVE / ORGANIZATION ACCESS</span>
        <h1>Banking operations,<br/><em>made simple.</em></h1>
        <p>Manage your authorized organization, internal customers and review workflows in one manager-only workspace.</p>
        <div className="auth-feature"><span><ShieldCheck size={19}/></span>
          <div><strong>Organization-level permissions</strong><small>Every manager action is scoped to administrator-approved issuer organizations.</small></div>
        </div>
        <div className="auth-feature"><span><LockKeyhole size={19}/></span>
          <div><strong>Manager accounts only</strong><small>No public registration or customer login. Customer identities belong to a separate Ledger API module.</small></div>
        </div>
      </div>
      <div className="auth-footer">NSAVE <span>•</span> LEDGERDESK <span>•</span> ORGANIZATION PORTAL</div>
    </aside>
    <main className="auth-panel"><div className="auth-panel-inner">
      <div className="auth-mobile-brand"><Brand/></div>
      <div className="auth-window">
        <div className="auth-overline"><ShieldCheck size={15}/> ORGANIZATION ACCESS ONLY</div>
        <h2>{title}</h2><p className="auth-subtitle">{subtitle}</p>
        <div className="manager-login-note"><ShieldCheck size={17}/>
          <div><strong>Authorized managers</strong><small>Administrator-provisioned credentials only. No self-registration.</small></div>
        </div>
        <Notice message={error} onClose={()=>setError('')}/>
        <Notice message={notice} success onClose={()=>setNotice('')}/>
        <form className="auth-form" onSubmit={handle}>
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="manager@organization.com"/></label>
          {(reset||mode==='verify')&&<label>One-time verification code<input type="text" inputMode="numeric"
            autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)}
            minLength={6} maxLength={10} required placeholder="Email OTP code"/></label>}
          {(mode==='login'||reset)&&<label>{reset?'New private password':'Password'}<PasswordInput
            value={password} onChange={setPassword} autoComplete={reset?'new-password':'current-password'}
            placeholder={reset?'At least 12 characters':'Enter your password'}/></label>}
          {reset&&<label>Confirm new password<PasswordInput
            value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password"
            placeholder="Re-enter your private password"/></label>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy&&<RefreshCw className="spinning" size={17}/>}
            {mode==='login'?'Sign in':mode==='forgot'?'Send password code':reset?'Save new password':mode==='verify-request'?'Send verification code':'Verify email'}
            {!busy&&<ArrowRight size={16}/>}
          </button>
        </form>
        <div className="manager-auth-links">
          {mode==='login'?<>
            <button className="text-link" type="button" onClick={()=>navigate('forgot')}>Forgot / set password?</button>
            <button className="text-link" type="button" onClick={()=>navigate('verify-request')}>Verify manager email</button>
          </>:<button className="text-link" type="button" onClick={()=>navigate('login')}>Back to manager sign in</button>}
        </div>
        <p className="auth-disclaimer"><LockKeyhole size={13}/> Secure nsave manager access. Customer information is retrieved through approved organization APIs.</p>
      </div>
    </div></main>
  </div>;
}

function useManagerApi(client,onUnauthorized){
  return useCallback(async(path,options={})=>{
    const token=await client.token();
    const jwt=token?.data?.token;
    if(token?.error||!jwt){onUnauthorized();throw new Error('Session expired. Please sign in again.');}
    const response=await fetch(path,{
      method:options.method||'GET',
      headers:{authorization:'Bearer '+jwt,...(options.body?{'content-type':'application/json'}:{})},
      body:options.body?JSON.stringify(options.body):undefined,
      cache:'no-store'
    });
    if(response.status===401){onUnauthorized();throw new Error('Session expired. Please sign in again.');}
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw new Error(data?.error?.message||'Request failed ('+response.status+')');
    }
    if(options.responseType==='blob')return response.blob();
    const data=await response.json().catch(()=>({}));
    return data.data;
  },[client,onUnauthorized]);
}
function ManagerWorkspace({client,session,onSignOut}){
  const [access,setAccess]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [mobile,setMobile]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const api=useManagerApi(client,onSignOut);
  const loadAccess=useCallback(async()=>{
    setLoading(true);setError('');
    try{setAccess(await api('/v1/me/access'));}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[api]);
  useEffect(()=>{loadAccess();},[loadAccess,refresh]);
  const user=session?.user?.name||session?.user?.email||'Manager';
  return <div className="app-shell">
    <aside className={'sidebar '+(mobile?'sidebar-open':'')}>
      <div className="sidebar-top"><Brand/></div>
      <div className="sidebar-section-label">ORGANIZATION PORTAL</div>
      <nav className="side-nav" aria-label="Manager navigation">
        <button className="active" onClick={()=>setMobile(false)}><ShieldCheck size={19}/> Admin dashboard <ChevronRight size={16} className="nav-chevron"/></button>
        <button onClick={()=>{setMobile(false);setRefresh(x=>x+1);}}><RefreshCw size={18}/> Refresh permissions</button>
        <button onClick={onSignOut}><LogOut size={18}/> Sign out</button>
      </nav>
      <div className="sidebar-bottom"><div className="security-panel"><span><ShieldCheck size={20}/></span>
        <strong>Restricted access</strong><small>Organization grants are checked by the server, not by browser settings.</small>
      </div><span className="sidebar-caption">NSAVE · LEDGERDESK</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(!mobile)}><Menu size={21}/></button>
          <div className="breadcrumb">Organization <ChevronRight size={15}/> <strong>Manager Dashboard</strong></div>
        </div><div className="topbar-right">
          <span className="environment-badge"><span className="live-light"/> TEST ENVIRONMENT</span>
          <div className="user-info"><span className="user-avatar">{String(user)[0]?.toUpperCase()||'M'}</span>
            <span className="user-name"><strong>{user}</strong><small>Organization manager</small></span></div>
          <button className="icon-button" title="Sign out" onClick={onSignOut}><LogOut size={18}/></button>
        </div></header>
      <main className="main-content">
        <Notice message={error} onClose={()=>setError('')}/>
        {loading?<div className="page-loading"><RefreshCw className="spinning" size={18}/> Checking organization permissions…</div>:
        access?.pendingPasswordChange?
          <ManagerPasswordForm mandatory authClient={client} onSuccess={()=>setRefresh(n=>n+1)}/>:
        !access?.manager?
          <section className="surface-card access-denied"><ShieldCheck size={32}/>
            <h1>Manager authorization required</h1>
            <p>This account is not assigned to an authorized organization. Contact your system administrator. Creating a customer account does not grant manager permissions.</p>
            <button className="primary-button" onClick={onSignOut}>Return to sign in <ArrowRight size={16}/></button>
          </section>:
          <LegacyAdmin api={api} authClient={client} session={session} organizations={access.organizations||[]}/>}
        <footer className="page-footer"><span>nsave · LedgerDesk Organization Portal</span>
          <span><LockKeyhole size={13}/> Customer authentication belongs to your separate Ledger API</span></footer>
      </main>
    </div>
  </div>;
}
function App(){
  const [client,setClient]=useState(null);
  const [authBaseUrl,setAuthBaseUrl]=useState('');
  const [session,setSession]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let stopped=false;
    (async()=>{
      try{
        const r=await fetch('/public-config',{cache:'no-store'});
        if(!r.ok)throw new Error('Unable to load manager authentication configuration');
        const json=await r.json();
        if(!/^https:\/\//.test(json.authUrl||''))throw new Error('Invalid Neon Auth configuration');
        const proxyUrl=new URL(json.authProxyUrl||'/auth',window.location.origin).href.replace(/\/$/,'');
        const c=createManagerAuthClient(proxyUrl);
        const s=await c.getSession();
        if(!stopped){setClient(c);setAuthBaseUrl(proxyUrl);setSession(s?.data?.user?s.data:null);}
      }catch(e){if(!stopped)setError(e?.message||'Unable to start Manager Portal');}
      finally{if(!stopped)setLoading(false);}
    })();
    return()=>{stopped=true};
  },[]);
  const signOut=useCallback(async()=>{
    try{await client?.signOut?.();}finally{setSession(null);}
  },[client]);
  const signIn=async()=>{
    const result=await client.getSession();
    if(result?.error)throw new Error(result.error.message||'Unable to read manager session');
    if(!result?.data?.user)throw new Error('Authentication succeeded but browser session was not established. Enable cookies for this site and try again.');
    setSession(result.data);
  };
  if(loading)return <div className="boot-screen"><Brand/><RefreshCw size={24} className="spinning"/> Loading Manager Portal…</div>;
  if(error)return <div className="boot-screen error-boot"><Brand/><CircleAlert size={25}/><h2>Unable to open Manager Portal</h2><p>{error}</p>
    <button className="primary-button" onClick={()=>location.reload()}>Retry <RefreshCw size={15}/></button></div>;
  if(!client)return null;
  return session?<ManagerWorkspace client={client} session={session} onSignOut={signOut}/>:
    <ManagerLogin client={client} authBaseUrl={authBaseUrl} onSignIn={signIn}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
