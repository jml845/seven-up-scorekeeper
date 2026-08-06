(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=16';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const VFX={fire:{file:'fire-v49.mp4',type:'video/mp4'},freeze:{file:'freeze-v49.mp4',type:'video/mp4'},electric:{file:'electric-v49.mp4',type:'video/mp4'},x2:{file:'x2-v52.webm',type:'video/webm'},bust:{file:'bust-v52.webm',type:'video/webm',holdAt:8.6},flip7:{file:'flip7-v60.webm',type:'video/webm'}};
  const vfxVideo=(name,key)=>{const asset=VFX[name];return `<video class="fx-video fx-${name}-video" data-effect-key="${esc(key)}"${asset.holdAt?` data-hold-at="${asset.holdAt}"`:''} autoplay muted playsinline preload="auto"><source src="assets/${asset.file}?v=71" type="${asset.type}"></video>`};
  const videoEffects=p=>[['bust',p.busted],['flip7',p.flip7],['x2',p.doubled],['freeze',p.frozen],['fire',p.hot],['electric',p.nearVictory]].filter(([,active])=>active).map(([name])=>name);
  const videoPriority=['bust','flip7','x2','freeze','fire','electric'];
  const MAX_ACTIVE_EFFECTS=4,MIN_ACTIVE_EFFECTS=1,START_TIMEOUT_MS=3500,STALL_GRACE_MS=1400;
  const fx=(p,activeEffect)=>{const key=activeEffect?`${p.id}:${activeEffect}`:'';return `<span class="player-fx${activeEffect?' has-effect has-video':''}" aria-hidden="true">${activeEffect?vfxVideo(activeEffect,key):''}</span>`};
  function warmVfx(){for(const name of Object.keys(VFX)){const asset=VFX[name],video=document.createElement('video');video.preload='metadata';video.muted=true;video.src=`assets/${asset.file}?v=71`}}
  let lastGameId=null,lastRound=null,previousLeaderId=null,previousDoubled=new Map(),effectState=new Map(),effectQueue=[],activeEffectKeys=new Set(),heldEffectKeys=new Set(),lastData=null,decoderLimit=MAX_ACTIVE_EFFECTS,healthyStarts=0;
  const playerKey=key=>key.slice(0,key.lastIndexOf(':'));
  function discardVideo(key){for(const video of board.querySelectorAll('.fx-video[data-effect-key]'))if(!key||video.dataset.effectKey===key){clearTimeout(video._startTimer);clearTimeout(video._stallTimer);video.pause();video.remove()}}
  function clearEffects(){discardVideo();effectQueue=[];activeEffectKeys.clear();heldEffectKeys.clear();effectState=new Map();decoderLimit=MAX_ACTIVE_EFFECTS;healthyStarts=0}
  function takeQueued(excludedPlayers=new Set()){const index=effectQueue.findIndex(key=>!excludedPlayers.has(playerKey(key)));if(index<0)return null;return effectQueue.splice(index,1)[0]}
  function fillEffectSlots(){
    const occupiedPlayers=new Set([...activeEffectKeys,...heldEffectKeys].map(playerKey));
    while(activeEffectKeys.size<decoderLimit){const key=takeQueued(occupiedPlayers);if(!key)break;activeEffectKeys.add(key);occupiedPlayers.add(playerKey(key));effectState.set(key,'playing')}
  }
  function ensurePlayback(video){if(!video||video.dataset.held==='1')return;if(!video._startTimer)video._startTimer=setTimeout(()=>{if(!video.classList.contains('ready'))playbackFailed(video)},START_TIMEOUT_MS);if(video.paused){const started=video.play();if(started?.catch)started.catch(()=>playbackFailed(video))}}
  function holdFinalFrame(video){if(!video||video.dataset.held==='1')return;video.dataset.held='1';clearTimeout(video._startTimer);clearTimeout(video._stallTimer);video.pause();const key=video.dataset.effectKey;if(key){activeEffectKeys.delete(key);heldEffectKeys.add(key);effectState.set(key,'held')}video.classList.add('ready','held');video.closest('.player-fx')?.classList.add('video-ready','video-held');setTimeout(()=>lastData&&render(lastData),0)}
  function playbackFailed(video){if(!video||video.dataset.held==='1')return;const key=video.dataset.effectKey;clearTimeout(video._startTimer);clearTimeout(video._stallTimer);activeEffectKeys.delete(key);effectState.set(key,'queued');if(key&&!effectQueue.includes(key))effectQueue.unshift(key);discardVideo(key);decoderLimit=Math.max(MIN_ACTIVE_EFFECTS,decoderLimit-1);healthyStarts=0;setTimeout(()=>lastData&&render(lastData),0)}
  board.addEventListener('ended',event=>{if(event.target.matches('.fx-video'))holdFinalFrame(event.target)},true);
  board.addEventListener('timeupdate',event=>{const video=event.target;if(!video.matches('.fx-video[data-hold-at]'))return;const holdAt=Number(video.dataset.holdAt);if(video.currentTime>=holdAt)holdFinalFrame(video)},true);
  board.addEventListener('error',event=>{if(event.target.matches('.fx-video'))playbackFailed(event.target)},true);
  board.addEventListener('playing',event=>{const video=event.target;if(!video.matches('.fx-video'))return;clearTimeout(video._startTimer);clearTimeout(video._stallTimer);video._startTimer=null;video.classList.add('ready');video.closest('.player-fx')?.classList.add('video-ready');healthyStarts++;if(healthyStarts>=8&&decoderLimit<MAX_ACTIVE_EFFECTS){decoderLimit++;healthyStarts=0}},true);
  const stall=event=>{const video=event.target;if(!video.matches('.fx-video')||video.dataset.held==='1'||video._stallTimer)return;video._stallTimer=setTimeout(()=>playbackFailed(video),STALL_GRACE_MS)};
  board.addEventListener('waiting',stall,true);board.addEventListener('stalled',stall,true);
  let wakeLock=null;
  async function keepScreenAwake(){
    if(!navigator.wakeLock||wakeLock||document.visibilityState==='hidden')return;
    try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null})}catch{}
  }
  keepScreenAwake();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keepScreenAwake()});
  setInterval(keepScreenAwake,60000);
  function render(data){
    lastData=data;
    if(!data)return;idle.classList.add('hidden');board.classList.remove('hidden');
    if(data.status==='stats'){
      clearEffects();
      const stats=data.stats||[];board.className=`scoreboard stats-screen${stats.length>10?' dense-stats':''}`;board.innerHTML=`<header><div><span>ALL-TIME</span><h1>FlipCast stats</h1></div><div class="round"><b>${Number(data.totalGames)||0}</b><small>games tracked</small></div></header><div class="cast-stats">${stats.map((p,i)=>`<article class="cast-stat-row"><em>${i+1}</em><strong>${esc(p.name)}<small>${Number(p.games)||0} games · ${Math.round((Number(p.winPct)||0)*100)}% wins${p.avgPlace?` · avg place ${Number(p.avgPlace).toFixed(1)}`:''}</small></strong><b>${Number(p.wins)||0}<small>wins</small></b></article>`).join('')||'<p>No completed games yet.</p>'}</div><footer>All-time player leaderboard</footer>`;return;
    }
    if(!data?.players?.length)return;
    if(data.gameId!==lastGameId){lastGameId=data.gameId;lastRound=Number(data.round)||1;previousLeaderId=null;previousDoubled=new Map();clearEffects()}
    else if((Number(data.round)||1)!==lastRound){lastRound=Number(data.round)||1;clearEffects()}
    const players=[...data.players].sort((a,b)=>b.score-a.score),cols=players.length>=6?2:1,rows=Math.ceil(players.length/cols),high=Math.max(...players.map(p=>p.score));
    const uniqueLeaderId=players.length&&(players.length===1||players[0].score>players[1].score)?players[0].id:null;
    const newLeaderId=previousLeaderId&&uniqueLeaderId&&uniqueLeaderId!==previousLeaderId?uniqueLeaderId:null;
    if(data.status==='winner'){
      clearEffects();
      const winner=players.find(p=>p.id===data.winnerId)||players[0];
      board.className='scoreboard winner-screen';
      board.innerHTML=`<div class="flying-crowns" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--i:${i}">👑</i>`).join('')}</div><div class="winner-cards" aria-hidden="true">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="winner-crown">👑</div><span class="winner-kicker">GAME WINNER</span><h1>${esc(winner.name)} wins!</h1><p>${Number(winner.score)||0} points · ${Number(data.completedRounds)||0} rounds</p><div class="final-board">${players.map((p,i)=>`<article class="final-row ${p.id===winner.id?'champion':''}"><em>${i+1}</em><strong>${esc(p.name)}</strong><b>${Number(p.score)||0}</b></article>`).join('')}</div>`;
      return;
    }
    board.className=`scoreboard${players.length>12?' dense':''}`;
    board.style.setProperty('--cols',cols);board.style.setProperty('--rows',rows);
    const activeEffects=players.flatMap(p=>videoEffects(p).map(effect=>[p,effect])),activeKeys=new Set(activeEffects.map(([p,effect])=>`${p.id}:${effect}`));
    for(const key of effectState.keys())if(!activeKeys.has(key)){effectState.delete(key);effectQueue=effectQueue.filter(item=>item!==key);activeEffectKeys.delete(key);heldEffectKeys.delete(key);discardVideo(key)}
    for(const [p,effect] of activeEffects.sort((a,b)=>videoPriority.indexOf(a[1])-videoPriority.indexOf(b[1])||b[0].score-a[0].score)){const key=`${p.id}:${effect}`;if(!effectState.has(key)){effectState.set(key,'queued');effectQueue.push(key)}}
    fillEffectSlots();
    const activeEffectById=new Map();
    for(const [p,effect] of activeEffects){const key=`${p.id}:${effect}`;if(activeEffectKeys.has(key)||heldEffectKeys.has(key))activeEffectById.set(p.id,{effect})}
    const liveVideos=new Map([...board.querySelectorAll('.fx-video[data-effect-key]')].map(video=>{video.remove();return [video.dataset.effectKey,video]}));
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>FlipCast</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ NEAR WIN</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;const active=activeEffectById.get(p.id);return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${fx(p,active?.effect)}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    for(const placeholder of board.querySelectorAll('.fx-video[data-effect-key]')){const live=liveVideos.get(placeholder.dataset.effectKey);if(live)placeholder.replaceWith(live)}
    for(const video of board.querySelectorAll('.fx-video[data-effect-key]'))ensurePlayback(video);
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  warmVfx();context.addCustomMessageListener(NAMESPACE,event=>render(event.data));context.start({disableIdleTimeout:true});
})();
