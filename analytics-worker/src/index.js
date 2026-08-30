const EVENTS = new Set(['app_open','game_started','game_completed','cast_attempt','cast_connected','cast_disconnected','feedback_opened']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9_-]{1,40}$/;
const ALLOWED_KEYS = new Set(['event_id','install_id','event','build','edition','player_count','round_count','cast_used','session_seconds','campaign']);

export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_payload');
  for (const key of Object.keys(input)) if (!ALLOWED_KEYS.has(key)) throw new Error('unknown_field');
  if (!UUID.test(input.event_id || '') || !UUID.test(input.install_id || '')) throw new Error('invalid_id');
  if (!EVENTS.has(input.event)) throw new Error('invalid_event');
  const build=Number(input.build);
  if (!Number.isInteger(build) || build<1 || build>9999) throw new Error('invalid_build');
  const campaign=String(input.campaign || 'direct').toLowerCase();
  if (!SLUG.test(campaign)) throw new Error('invalid_campaign');
  const edition=input.edition == null?null:String(input.edition);
  if (edition!==null && edition!=='classic' && edition!=='vengeance') throw new Error('invalid_edition');
  const bounded=(value,min,max,name)=>{if(value==null)return null;const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw new Error(`invalid_${name}`);return number};
  return {
    event_id:input.event_id.toLowerCase(),install_id:input.install_id.toLowerCase(),event:input.event,build,
    campaign,edition,player_count:bounded(input.player_count,2,18,'player_count'),round_count:bounded(input.round_count,0,999,'round_count'),
    cast_used:input.cast_used===true,session_seconds:bounded(input.session_seconds,0,86400,'session_seconds'),is_internal:campaign==='internal'
  };
}

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const cors=origin=>({'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'});
const allowedOrigin=(request,env)=>{const origin=request.headers.get('Origin')||'';return origin===env.ALLOWED_ORIGIN||origin==='http://127.0.0.1:8787'||origin==='http://localhost:8787'?origin:null};
async function hashInstall(id,pepper){const bytes=new TextEncoder().encode(`${pepper}:${id}`);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const authorized=(request,env)=>{const value=request.headers.get('authorization')||'';return value.length>20&&value===`Bearer ${env.ADMIN_TOKEN}`};

async function ingest(request,env) {
  const origin=allowedOrigin(request,env);
  if (!origin) return json({ok:false,error:'origin_not_allowed'},403);
  const enabled=await env.DB.prepare("SELECT value FROM settings WHERE key='analytics_enabled'").first('value');
  if (enabled!=='true') return json({ok:true,disabled:true},202,cors(origin));
  const length=Number(request.headers.get('content-length')||0);
  if (length>2048) return json({ok:false,error:'payload_too_large'},413,cors(origin));
  let input;
  try { input=validateEvent(JSON.parse(await request.text())); }
  catch(error) { return json({ok:false,error:error.message||'invalid_payload'},400,cors(origin)); }
  const installHash=await hashInstall(input.install_id,env.ID_PEPPER);
  const recent=await env.DB.prepare("SELECT COUNT(*) AS count FROM events WHERE install_hash=? AND received_at>=datetime('now','-1 minute')").bind(installHash).first('count');
  if (Number(recent)>=30) return json({ok:false,error:'rate_limited'},429,cors(origin));
  const day=new Date().toISOString().slice(0,10),internal=input.is_internal?1:0;
  const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO events(event_id,day,install_hash,event_name,build,edition,player_count,round_count,cast_used,session_seconds,campaign,is_internal) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(input.event_id,day,installHash,input.event,input.build,input.edition,input.player_count,input.round_count,input.cast_used?1:0,input.session_seconds,input.campaign,internal).run();
  if (!inserted.meta?.changes) return json({ok:true,duplicate:true},202,cors(origin));
  const metrics=[input.event];
  if(input.event==='game_completed'&&input.cast_used)metrics.push('game_completed_cast');
  const statements=[
    env.DB.prepare(`INSERT INTO installations(install_hash,first_seen,last_seen,first_campaign,is_internal) VALUES(?,datetime('now'),datetime('now'),?,?) ON CONFLICT(install_hash) DO UPDATE SET last_seen=datetime('now'),is_internal=excluded.is_internal`).bind(installHash,input.campaign,internal),
    env.DB.prepare(`INSERT OR IGNORE INTO daily_installations(day,install_hash,is_internal) VALUES(?,?,?)`).bind(day,installHash,internal),
    ...metrics.map(metric=>env.DB.prepare(`INSERT INTO daily_metrics(day,metric,is_internal,count) VALUES(?,?,?,1) ON CONFLICT(day,metric,is_internal) DO UPDATE SET count=count+1`).bind(day,metric,internal))
  ];
  await env.DB.batch(statements);
  return json({ok:true},202,cors(origin));
}

async function summary(request,env){
  if(!authorized(request,env))return json({ok:false,error:'unauthorized'},401,{'www-authenticate':'Bearer'});
  const includeInternal=new URL(request.url).searchParams.get('include_internal')==='1',filter=includeInternal?'':' WHERE is_internal=0';
  const [installs,active7,metrics,daily,campaigns,enabled]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM installations${filter}`).first('count'),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM installations${filter}${filter?' AND':' WHERE'} last_seen>=datetime('now','-7 days')`).first('count'),
    env.DB.prepare(`SELECT metric,SUM(count) AS count FROM daily_metrics${filter} GROUP BY metric`).all(),
    env.DB.prepare(`SELECT day,metric,SUM(count) AS count FROM daily_metrics${filter}${filter?' AND':' WHERE'} day>=date('now','-29 days') GROUP BY day,metric ORDER BY day`).all(),
    env.DB.prepare(`SELECT first_campaign AS campaign,COUNT(*) AS installs FROM installations${filter} GROUP BY first_campaign ORDER BY installs DESC`).all(),
    env.DB.prepare("SELECT value FROM settings WHERE key='analytics_enabled'").first('value')
  ]);
  const metric=Object.fromEntries(metrics.results.map(row=>[row.metric,Number(row.count)]));
  return json({ok:true,analytics_enabled:enabled==='true',include_internal:includeInternal,total_installations:Number(installs||0),active_7d:Number(active7||0),metrics:metric,daily:daily.results,campaigns:campaigns.results,generated_at:new Date().toISOString()});
}

async function toggle(request,env){
  if(!authorized(request,env))return json({ok:false,error:'unauthorized'},401);
  let input;try{input=await request.json()}catch{return json({ok:false,error:'invalid_payload'},400)}
  if(typeof input.enabled!=='boolean')return json({ok:false,error:'invalid_enabled'},400);
  await env.DB.prepare("UPDATE settings SET value=? WHERE key='analytics_enabled'").bind(input.enabled?'true':'false').run();
  return json({ok:true,analytics_enabled:input.enabled});
}

const DASHBOARD=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlipCast analytics</title><style>body{margin:0;padding:24px;background:#07152c;color:#f6fbff;font:15px system-ui}main{max-width:1040px;margin:auto}h1{margin:0 0 4px}.muted{color:#9db2c7}.bar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.card{padding:18px;border:1px solid #ffffff20;border-radius:15px;background:#10243a;min-width:150px}.card b{display:block;font-size:30px;color:#50e0bd}.card small{display:block;color:#9db2c7;margin-top:3px}button,input{padding:10px 13px;border:0;border-radius:9px;font:inherit}button{background:#2ad4ab;color:#031a19;font-weight:800;cursor:pointer}table{width:100%;border-collapse:collapse;background:#10243a;border-radius:14px;overflow:hidden}th,td{padding:10px;border-bottom:1px solid #ffffff16;text-align:left}dialog{border:0;border-radius:16px;padding:24px}#error{color:#ff8f8f}</style></head><body><main><h1>FlipCast analytics</h1><p class="muted">Anonymous beta usage only. A unique device is one browser profile, not a confirmed PWA installation. No player names, scores, or game history.</p><div><button id="refresh">Refresh</button> <label><input id="internal" type="checkbox"> Include internal tests</label> <button id="toggle">Pause collection</button></div><p id="error"></p><section id="cards" class="bar"></section><h2>Campaigns</h2><table><thead><tr><th>Campaign</th><th>Unique devices</th></tr></thead><tbody id="campaigns"></tbody></table><h2>Last 30 days</h2><table><thead><tr><th>Date</th><th>Opens</th><th>Games started</th><th>Games completed</th><th>Cast connected</th></tr></thead><tbody id="daily"></tbody></table></main><script>let token=sessionStorage.getItem('flipcast-admin-token')||prompt('Admin token');if(token)sessionStorage.setItem('flipcast-admin-token',token);const q=s=>document.querySelector(s),n=x=>Number(x||0).toLocaleString(),pct=(a,b)=>b?Math.round(100*Number(a||0)/Number(b))+'%':'—';async function load(){q('#error').textContent='';const r=await fetch('/api/summary'+(q('#internal').checked?'?include_internal=1':''),{headers:{authorization:'Bearer '+token}});if(r.status===401){sessionStorage.removeItem('flipcast-admin-token');token=prompt('Admin token');return load()}const d=await r.json();if(!d.ok)throw Error(d.error);q('#toggle').textContent=d.analytics_enabled?'Pause collection':'Resume collection';q('#toggle').dataset.enabled=d.analytics_enabled;const m=d.metrics||{},items=[['Unique devices',d.total_installations,'Browser profiles seen'],['Active 7d',d.active_7d,'Recently active devices'],['Games started',m.game_started,pct(m.game_started,d.total_installations)+' per device'],['Games completed',m.game_completed,pct(m.game_completed,m.game_started)+' of starts'],['Completed while casting',m.game_completed_cast,pct(m.game_completed_cast,m.game_completed)+' of completions'],['Cast attempts',m.cast_attempt,pct(m.cast_connected,m.cast_attempt)+' connected'],['Cast connected',m.cast_connected,'Successful sessions'],['Feedback opened',m.feedback_opened,pct(m.feedback_opened,d.total_installations)+' per device']];q('#cards').innerHTML=items.map(x=>'<div class="card"><span>'+x[0]+'</span><b>'+n(x[1])+'</b><small>'+x[2]+'</small></div>').join('');q('#campaigns').innerHTML=d.campaigns.map(x=>'<tr><td>'+x.campaign+'</td><td>'+n(x.installs)+'</td></tr>').join('');const days={};for(const x of d.daily){days[x.day]??={};days[x.day][x.metric]=x.count}q('#daily').innerHTML=Object.entries(days).reverse().map(([day,x])=>'<tr><td>'+day+'</td><td>'+n(x.app_open)+'</td><td>'+n(x.game_started)+'</td><td>'+n(x.game_completed)+'</td><td>'+n(x.cast_connected)+'</td></tr>').join('')}q('#refresh').onclick=()=>load().catch(e=>q('#error').textContent=e.message);q('#internal').onchange=q('#refresh').onclick;q('#toggle').onclick=async()=>{await fetch('/admin/toggle',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({enabled:q('#toggle').dataset.enabled!=='true'})});load()};load().catch(e=>q('#error').textContent=e.message)</script></body></html>`;

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS'){const origin=allowedOrigin(request,env);return origin?new Response(null,{status:204,headers:cors(origin)}):new Response(null,{status:403})}
    if(request.method==='POST'&&url.pathname==='/event')return ingest(request,env);
    if(request.method==='GET'&&url.pathname==='/api/summary')return summary(request,env);
    if(request.method==='POST'&&url.pathname==='/admin/toggle')return toggle(request,env);
    if(request.method==='GET'&&url.pathname==='/dashboard')return new Response(DASHBOARD,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'}});
    if(request.method==='GET'&&url.pathname==='/health')return json({ok:true,service:'flipcast-analytics'});
    return json({ok:false,error:'not_found'},404);
  },
  async scheduled(_controller,env){await env.DB.prepare("DELETE FROM events WHERE received_at<datetime('now','-90 days')").run();await env.DB.prepare("DELETE FROM daily_installations WHERE day<date('now','-90 days')").run()}
};
