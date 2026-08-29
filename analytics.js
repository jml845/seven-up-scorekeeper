(function(){
  const ENDPOINT='https://flipcast-analytics.jml845-flipcast.workers.dev/event';
  const BUILD=88,ID_KEY='flipcast-anonymous-install-v1',OPT_OUT_KEY='flipcast-analytics-opt-out-v1',QUEUE_KEY='flipcast-analytics-queue-v1',CAMPAIGN_KEY='flipcast-analytics-campaign-v1',OPEN_KEY='flipcast-analytics-last-open-v1',CAST_GAME_KEY='flipcast-analytics-cast-game-v1';
  const EVENT_FIELDS={app_open:[],game_started:['edition','player_count'],game_completed:['edition','player_count','round_count','cast_used','session_seconds'],cast_attempt:[],cast_connected:[],cast_disconnected:['session_seconds'],feedback_opened:[]};
  const uuid=()=>crypto.randomUUID?.()||`${Date.now().toString(16).padStart(8,'0')}-0000-4000-8000-${crypto.getRandomValues(new Uint32Array(2)).join('').slice(0,12).padEnd(12,'0')}`;
  const enabled=()=>localStorage.getItem(OPT_OUT_KEY)!=='1';
  function installId(){let id=localStorage.getItem(ID_KEY);if(!id){id=uuid();localStorage.setItem(ID_KEY,id)}return id}
  function campaign(){const current=(new URLSearchParams(location.search).get('campaign')||'').toLowerCase();if(/^[a-z0-9_-]{1,40}$/.test(current))localStorage.setItem(CAMPAIGN_KEY,current);return localStorage.getItem(CAMPAIGN_KEY)||'direct'}
  function queue(){try{const value=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(value)?value.slice(-40):[]}catch{return []}}
  function saveQueue(value){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(value.slice(-40)))}catch{}}
  async function deliver(payload){const response=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify(payload),keepalive:true,cache:'no-store'});if(!response.ok)throw new Error(`analytics_${response.status}`)}
  async function flush(){if(!enabled()||!navigator.onLine)return;const pending=queue();if(!pending.length)return;const remaining=[];for(const payload of pending){try{await deliver(payload)}catch{remaining.push(payload)}}saveQueue(remaining)}
  function track(event,detail={}){if(!enabled()||!EVENT_FIELDS[event])return;const payload={event_id:uuid(),install_id:installId(),event,build:BUILD,campaign:campaign()};for(const key of EVENT_FIELDS[event])if(detail[key]!==undefined)payload[key]=detail[key];deliver(payload).catch(()=>{const pending=queue();pending.push(payload);saveQueue(pending)})}
  function setEnabled(value){localStorage.setItem(OPT_OUT_KEY,value?'0':'1');if(value){recordOpen();flush()}else saveQueue([]);syncControl()}
  function syncControl(){const control=document.querySelector('#analyticsOptOut');if(control)control.checked=!enabled()}
  function recordOpen(){const day=new Date().toISOString().slice(0,10);if(localStorage.getItem(OPEN_KEY)===day)return;localStorage.setItem(OPEN_KEY,day);track('app_open')}
  let castStarted=Number(sessionStorage.getItem('flipcast-analytics-cast-start')||0);
  window.addEventListener('sevenup-cast-connected',()=>{if(!castStarted){castStarted=Date.now();sessionStorage.setItem('flipcast-analytics-cast-start',String(castStarted));track('cast_connected')}sessionStorage.setItem(CAST_GAME_KEY,'1')});
  window.addEventListener('sevenup-cast-disconnected',()=>{if(!castStarted)return;track('cast_disconnected',{session_seconds:Math.min(86400,Math.max(0,Math.round((Date.now()-castStarted)/1000)))});castStarted=0;sessionStorage.removeItem('flipcast-analytics-cast-start')});
  document.addEventListener('DOMContentLoaded',()=>{document.querySelector('#castButton')?.addEventListener('click',()=>track('cast_attempt'),{capture:true});document.querySelectorAll(`a[href^="https://tally.so/"]`).forEach(link=>link.addEventListener('click',()=>track('feedback_opened')));const control=document.querySelector('#analyticsOptOut');if(control){syncControl();control.addEventListener('change',()=>setEnabled(!control.checked))}});
  window.addEventListener('online',flush);
  window.flipcastAnalytics={track,flush,isEnabled:enabled,setEnabled,markCastUsed:()=>sessionStorage.setItem(CAST_GAME_KEY,'1'),resetGame:()=>sessionStorage.removeItem(CAST_GAME_KEY),castUsed:()=>sessionStorage.getItem(CAST_GAME_KEY)==='1'};
  recordOpen();setTimeout(flush,1500);
})();
