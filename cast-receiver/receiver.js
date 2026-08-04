(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=15';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const VFX={fire:{file:'fire-v49.mp4',type:'video/mp4'},freeze:{file:'freeze-v49.mp4',type:'video/mp4'},electric:{file:'electric-v49.mp4',type:'video/mp4'},x2:{file:'x2-v52.webm',type:'video/webm'},bust:{file:'bust-v52.webm',type:'video/webm',holdAt:8.6},flip7:{file:'flip7-v59.webm',type:'video/webm'}};
  const requestedVideoLimit=Number(new URLSearchParams(location.search).get('vfx'));
  const MAX_ACTIVE_VIDEOS=Number.isFinite(requestedVideoLimit)&&requestedVideoLimit>0?Math.min(6,requestedVideoLimit):2;
  const posterFile=name=>name==='bust'?'bust-v58-poster.png':name==='flip7'?'flip7-v59-poster.png':`${name}-v53-poster.png`;
  const poster=(name,active)=>`<img class="fx-poster fx-${name}-poster${active?' active-poster':''}" src="assets/${posterFile(name)}?v=59" alt="">`;
  const vfxVideo=(name,key)=>{const asset=VFX[name];return `<video class="fx-video fx-${name}-video" data-effect-key="${esc(key)}"${asset.holdAt?` data-hold-at="${asset.holdAt}"`:''} autoplay muted playsinline preload="auto" onloadeddata="this.classList.add('ready');this.closest('.player-fx').classList.add('video-ready')" onplaying="this.classList.add('ready');this.closest('.player-fx').classList.add('video-ready')"><source src="assets/${asset.file}?v=59" type="${asset.type}"></video>`};
  const videoEffect=p=>p.nearVictory?'electric':p.busted?'bust':p.flip7?'flip7':p.doubled?'x2':p.frozen?'freeze':p.hot?'fire':null;
  const videoPriority=['electric','bust','flip7','x2','freeze','fire'];
  const fx=(p,activeVideo)=>{const names=[];if(p.hot)names.push('fire');if(p.frozen)names.push('freeze');if(p.nearVictory)names.push('electric');if(p.doubled)names.push('x2');if(p.busted)names.push('bust');if(p.flip7)names.push('flip7');const key=activeVideo?`${p.id}:${activeVideo}`:'';return `<span class="player-fx${activeVideo?' has-video':''}" aria-hidden="true">${names.map(name=>poster(name,name===activeVideo)).join('')}${p.doubled?'<span class="fx-x2-hold">×2</span>':''}${activeVideo?vfxVideo(activeVideo,key):''}</span>`};
  function warmVfx(){const bin=document.createElement('div');bin.className='vfx-preload';for(const [name,asset] of Object.entries(VFX)){const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.poster=`assets/${posterFile(name)}?v=59`;video.src=`assets/${asset.file}?v=59`;video.load();bin.appendChild(video)}document.body.appendChild(bin)}
  let lastGameId=null,previousLeaderId=null,previousDoubled=new Map(),effectState=new Map();
  function finishVideo(video,failed=false){const key=video.dataset.effectKey;if(key)effectState.set(key,'done');const wrap=video.closest('.player-fx');if(failed)video.classList.add('failed');video.remove();if(wrap){wrap.classList.remove('video-ready','has-video');if(failed)wrap.classList.add('video-failed')}}
  board.addEventListener('ended',event=>{if(event.target.matches('.fx-video'))finishVideo(event.target)},true);
  board.addEventListener('timeupdate',event=>{const video=event.target;if(!video.matches('.fx-video[data-hold-at]'))return;const holdAt=Number(video.dataset.holdAt);if(video.currentTime>=holdAt){video.pause();finishVideo(video)}},true);
  board.addEventListener('error',event=>{if(event.target.matches('.fx-video'))finishVideo(event.target,true)},true);
  let wakeLock=null;
  async function keepScreenAwake(){
    if(!navigator.wakeLock||wakeLock||document.visibilityState==='hidden')return;
    try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}catch{}
  }
  keepScreenAwake();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keepScreenAwake()});
  setInterval(keepScreenAwake,60000);
  function render(data){
    if(!data?.players?.length)return;idle.classList.add('hidden');board.classList.remove('hidden');
    if(data.gameId!==lastGameId){lastGameId=data.gameId;previousLeaderId=null;previousDoubled=new Map();effectState=new Map()}
    const players=[...data.players].sort((a,b)=>b.score-a.score),cols=players.length>8?2:1,rows=Math.ceil(players.length/cols),high=Math.max(...players.map(p=>p.score));
    const uniqueLeaderId=players.length&&(players.length===1||players[0].score>players[1].score)?players[0].id:null;
    const newLeaderId=previousLeaderId&&uniqueLeaderId&&uniqueLeaderId!==previousLeaderId?uniqueLeaderId:null;
    if(data.status==='winner'){
      const winner=players.find(p=>p.id===data.winnerId)||players[0];
      board.className='scoreboard winner-screen';
      board.innerHTML=`<div class="flying-crowns" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--i:${i}">👑</i>`).join('')}</div><div class="winner-cards" aria-hidden="true">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="winner-crown">👑</div><span class="winner-kicker">GAME WINNER</span><h1>${esc(winner.name)} wins!</h1><p>${Number(winner.score)||0} points · ${Number(data.completedRounds)||0} rounds</p><div class="final-board">${players.map((p,i)=>`<article class="final-row ${p.id===winner.id?'champion':''}"><em>${i+1}</em><strong>${esc(p.name)}</strong><b>${Number(p.score)||0}</b></article>`).join('')}</div>`;
      return;
    }
    board.className=`scoreboard${players.length>12?' dense':''}`;
    board.style.setProperty('--cols',cols);board.style.setProperty('--rows',rows);
    const activeEffects=players.map(p=>[p,videoEffect(p)]).filter(([,effect])=>effect),activeKeys=new Set(activeEffects.map(([p,effect])=>`${p.id}:${effect}`));
    for(const key of effectState.keys())if(!activeKeys.has(key))effectState.delete(key);
    let available=Math.max(0,MAX_ACTIVE_VIDEOS-[...effectState.values()].filter(state=>state==='playing').length);
    for(const [p,effect] of activeEffects.sort((a,b)=>videoPriority.indexOf(a[1])-videoPriority.indexOf(b[1])||b[0].score-a[0].score)){const key=`${p.id}:${effect}`;if(!effectState.has(key)){effectState.set(key,available>0?'playing':'done');if(available>0)available--}}
    const activeVideoById=new Map(activeEffects.filter(([p,effect])=>effectState.get(`${p.id}:${effect}`)==='playing').map(([p,effect])=>[p.id,effect]));
    const liveVideos=new Map([...board.querySelectorAll('.fx-video[data-effect-key]')].map(video=>{video.remove();return [video.dataset.effectKey,video]}));
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>Cast 7</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ CLOSE</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${fx(p,activeVideoById.get(p.id))}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    for(const placeholder of board.querySelectorAll('.fx-video[data-effect-key]')){const live=liveVideos.get(placeholder.dataset.effectKey);if(live&&!live.ended)placeholder.replaceWith(live)}
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  warmVfx();context.addCustomMessageListener(NAMESPACE,event=>render(event.data));context.start({disableIdleTimeout:true});
})();
