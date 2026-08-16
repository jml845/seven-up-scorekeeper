(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=16';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const VFX={fire:{file:'fire-v49.mp4',type:'video/mp4',poster:'fire-v53-poster.png'},freeze:{file:'freeze-v49.mp4',type:'video/mp4',poster:'freeze-v53-poster.png'},electric:{file:'electric-v49.mp4',type:'video/mp4',poster:'electric-v53-poster.png'},x2:{file:'x2-v83.mp4',type:'video/mp4',poster:'x2-v53-poster.png'},bust:{file:'bust-v83.mp4',type:'video/mp4',poster:'bust-v58-poster.png',holdAt:8.6},flip7:{file:'flip7-v83.mp4',type:'video/mp4',poster:'flip7-v60-poster.png'}};
  const vfxVideo=(name,key)=>{const asset=VFX[name];return `<video class="fx-video fx-${name}-video" data-effect-key="${esc(key)}"${asset.holdAt?` data-hold-at="${asset.holdAt}"`:''} muted playsinline preload="auto"><source src="assets/${asset.file}?v=84" type="${asset.type}"></video>`};
  const videoEffects=p=>[['bust',p.busted],['flip7',p.flip7],['x2',p.doubled],['freeze',p.frozen],['fire',p.hot],['electric',p.nearVictory]].filter(([,active])=>active).map(([name])=>name);
  const videoPriority=['bust','flip7','x2','freeze','fire','electric'];
  const MAX_ACTIVE_EFFECTS=1,START_TIMEOUT_MS=4500,STALL_GRACE_MS=1400,MAX_PLAYBACK_RETRIES=1,REVEAL_AFTER_SECONDS=.12,REVEAL_AFTER_FRAMES=3;
  const fx=(p,activeEffect)=>{const key=activeEffect?`${p.id}:${activeEffect}`:'';return `<span class="player-fx${activeEffect?` has-effect has-video fx-stage-${activeEffect}`:''}" aria-hidden="true">${activeEffect?vfxVideo(activeEffect,key):''}</span>`};
  const frozenFx=(playerId,effect)=>{if(!effect)return '';const asset=VFX[effect];return `<span class="player-fx effect-frozen fx-${effect}-frozen${effect==='x2'?' x2-frozen':''}" data-held-effect-key="${esc(`${playerId}:${effect}`)}" aria-hidden="true"><img class="fx-poster fx-${effect}-poster" src="assets/${asset.poster}?v=84" alt="">${effect==='x2'?'<span>×2</span>':''}</span>`};
  function warmVfx(){for(const asset of Object.values(VFX)){const image=new Image();image.decoding='async';image.src=`assets/${asset.poster}?v=84`}}
  const decoderWarmups=new Map();let decoderWarmupChain=Promise.resolve();
  function warmVideoSource(source,type){if(decoderWarmups.has(source))return decoderWarmups.get(source);const warming=decoderWarmupChain=decoderWarmupChain.then(()=>new Promise(resolve=>{const video=document.createElement('video');video.dataset.decoderWarm='1';video.muted=true;video.playsInline=true;video.preload='auto';video.style.cssText='position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:.001;pointer-events:none;z-index:-1';const finish=()=>{if(video.dataset.done)return;video.dataset.done='1';clearTimeout(video._warmTimer);video.pause();video.remove();resolve()};video.addEventListener('timeupdate',()=>{if(video.currentTime>=.3)finish()});video.addEventListener('ended',finish);video.addEventListener('error',finish);video.innerHTML=`<source src="${source}" type="${type}">`;document.body.appendChild(video);video._warmTimer=setTimeout(finish,3000);const started=video.play();if(started?.catch)started.catch(finish)}));decoderWarmups.set(source,warming);return warming}
  function warmApprovedVideos(){for(const name of videoPriority){const asset=VFX[name];warmVideoSource(`assets/${asset.file}?v=84`,asset.type)}}
  let lastGameId=null,lastRound=null,previousLeaderId=null,previousDoubled=new Map(),effectState=new Map(),playbackRetries=new Map(),effectQueue=[],activeEffectKeys=new Set(),heldEffects=new Map(),lastData=null,decoderLimit=MAX_ACTIVE_EFFECTS;
  const playerKey=key=>key.slice(0,key.lastIndexOf(':'));
  function discardVideo(key){for(const video of board.querySelectorAll('.fx-video[data-effect-key]'))if(!key||video.dataset.effectKey===key){clearTimeout(video._startTimer);clearTimeout(video._stallTimer);clearTimeout(video._frameTimer);if(video._frameRequest&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(video._frameRequest);if(video._canvasPump)cancelAnimationFrame(video._canvasPump);video.pause();video.remove()}}
  function clearEffects(){discardVideo();effectQueue=[];activeEffectKeys.clear();heldEffects.clear();effectState=new Map();playbackRetries.clear();decoderLimit=MAX_ACTIVE_EFFECTS}
  function takeQueued(excludedPlayers=new Set()){const index=effectQueue.findIndex(key=>!excludedPlayers.has(playerKey(key)));if(index<0)return null;return effectQueue.splice(index,1)[0]}
  function fillEffectSlots(){
    const occupiedPlayers=new Set([...activeEffectKeys].map(playerKey));
    while(activeEffectKeys.size<decoderLimit){const key=takeQueued(occupiedPlayers);if(!key)break;activeEffectKeys.add(key);occupiedPlayers.add(playerKey(key));effectState.set(key,'playing')}
  }
  function ensurePlayback(video){if(!video||video.dataset.held==='1')return;const source=video.querySelector('source');if(!video._decoderWarmed){if(video._warmWait)return;video._warmWait=true;warmVideoSource(source?.getAttribute('src')||'',source?.getAttribute('type')||'video/mp4').then(()=>{video._warmWait=false;video._decoderWarmed=true;if(video.isConnected)ensurePlayback(video)});return}if(!video._startTimer)video._startTimer=setTimeout(()=>{if(!video.classList.contains('ready'))playbackFailed(video)},START_TIMEOUT_MS);if(video.paused){const started=video.play();if(started?.catch)started.catch(()=>playbackFailed(video))}}
  function revealVideo(video){if(!video?.isConnected||video.classList.contains('ready')||video.currentTime<REVEAL_AFTER_SECONDS)return false;clearTimeout(video._startTimer);clearTimeout(video._frameTimer);video._startTimer=null;video.classList.add('ready');video.closest('.player-fx')?.classList.add('video-ready');return true}
  function waitForVisibleFrame(video,metadata={}){if(!video?.isConnected)return;video._decodedFrames=Math.max(video._decodedFrames||0,Number(metadata.presentedFrames)||0);if(video._decodedFrames>=REVEAL_AFTER_FRAMES)revealVideo(video);if(video.requestVideoFrameCallback)video._frameRequest=video.requestVideoFrameCallback((now,next)=>waitForVisibleFrame(video,next))}
  function finishVideo(video){if(!video||video.dataset.finished==='1')return;video.dataset.finished='1';clearTimeout(video._startTimer);clearTimeout(video._stallTimer);clearTimeout(video._frameTimer);if(video._frameRequest&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(video._frameRequest);if(video._canvasPump)cancelAnimationFrame(video._canvasPump);video.pause();const key=video.dataset.effectKey;if(key){activeEffectKeys.delete(key);effectState.set(key,'done');heldEffects.set(playerKey(key),key.slice(key.lastIndexOf(':')+1))}video.remove();setTimeout(()=>lastData&&render(lastData),0)}
  function playbackFailed(video){if(!video||video.dataset.held==='1')return;const key=video.dataset.effectKey,retries=(playbackRetries.get(key)||0)+1;clearTimeout(video._startTimer);clearTimeout(video._stallTimer);activeEffectKeys.delete(key);discardVideo(key);playbackRetries.set(key,retries);if(retries<=MAX_PLAYBACK_RETRIES){effectState.set(key,'queued');if(key&&!effectQueue.includes(key))effectQueue.unshift(key)}else effectState.set(key,'done');setTimeout(()=>lastData&&render(lastData),0)}
  board.addEventListener('ended',event=>{if(event.target.matches('.fx-video'))finishVideo(event.target)},true);
  board.addEventListener('timeupdate',event=>{const video=event.target;if(!video.matches('.fx-video'))return;if(!video.classList.contains('ready')&&!video.requestVideoFrameCallback)revealVideo(video);if(!video.matches('[data-hold-at]'))return;const holdAt=Number(video.dataset.holdAt);if(video.currentTime>=holdAt)finishVideo(video)},true);
  board.addEventListener('error',event=>{if(event.target.matches('.fx-video'))playbackFailed(event.target)},true);
  board.addEventListener('playing',event=>{const video=event.target;if(!video.matches('.fx-video'))return;clearTimeout(video._stallTimer);if(video.classList.contains('ready'))return;if(video.requestVideoFrameCallback)video._frameRequest=video.requestVideoFrameCallback((now,metadata)=>waitForVisibleFrame(video,metadata));else video._frameTimer=setTimeout(()=>revealVideo(video),180)},true);
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
    for(const key of effectState.keys())if(!activeKeys.has(key)){effectState.delete(key);playbackRetries.delete(key);effectQueue=effectQueue.filter(item=>item!==key);activeEffectKeys.delete(key);if(heldEffects.get(playerKey(key))===key.slice(key.lastIndexOf(':')+1))heldEffects.delete(playerKey(key));discardVideo(key)}
    for(const [p,effect] of activeEffects.sort((a,b)=>videoPriority.indexOf(a[1])-videoPriority.indexOf(b[1])||b[0].score-a[0].score)){const key=`${p.id}:${effect}`;if(!effectState.has(key)){effectState.set(key,'queued');effectQueue.push(key)}}
    fillEffectSlots();
    const activeEffectById=new Map();
    for(const [p,effect] of activeEffects){const key=`${p.id}:${effect}`;if(activeEffectKeys.has(key))activeEffectById.set(p.id,{effect})}
    const liveVideos=new Map([...board.querySelectorAll('.fx-video[data-effect-key]')].map(video=>{video.remove();return [video.dataset.effectKey,video]}));
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>FlipCast</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ NEAR WIN</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;const active=activeEffectById.get(p.id),held=active?null:heldEffects.get(String(p.id));return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${frozenFx(p.id,held)}${fx(p,active?.effect)}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    for(const placeholder of board.querySelectorAll('.fx-video[data-effect-key]')){const live=liveVideos.get(placeholder.dataset.effectKey);if(live)placeholder.replaceWith(live)}
    for(const video of board.querySelectorAll('.fx-video[data-effect-key]'))ensurePlayback(video);
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  warmVfx();warmApprovedVideos();context.addCustomMessageListener(NAMESPACE,event=>render(event.data));context.start({disableIdleTimeout:true});
})();
