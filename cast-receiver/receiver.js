(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=16';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const RECEIVER_BUILD=94;
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const VFX={fire:{file:'fire-v49.mp4',type:'video/mp4',poster:'fire-v53-poster.png'},freeze:{file:'freeze-v49.mp4',type:'video/mp4',poster:'freeze-v53-poster.png'},electric:{file:'electric-v85.mp4',type:'video/mp4',poster:'electric-v85-poster.png'},x2:{file:'x2-v83.mp4',type:'video/mp4',poster:'x2-v53-poster.png'},divide:{file:'divide-v91.mp4',type:'video/mp4',poster:'divide-v91-poster.png',holdAt:5.75},lucky13:{file:'lucky13-v86.mp4',type:'video/mp4',poster:'lucky13-v86-poster.png'},bust:{file:'bust-v92.mp4',type:'video/mp4',poster:'bust-v92-poster.png',holdAt:7.6},flip7:{file:'flip7-v83.mp4',type:'video/mp4',poster:'flip7-v60-poster.png'}};
  const vfxVideo=(name,key)=>`<span class="fx-video-slot" data-effect-key="${esc(key)}" data-effect-name="${esc(name)}"></span>`;
  const videoEffects=p=>[['bust',p.busted],['flip7',p.flip7],['lucky13',p.lucky13],['divide',p.divided],['x2',p.doubled],['freeze',p.frozen],['fire',p.hot],['electric',p.nearVictory]].filter(([,active])=>active).map(([name])=>name);
  const videoPriority=['bust','flip7','lucky13','divide','x2','freeze','fire','electric'];
  const MAX_ACTIVE_EFFECTS=1,START_TIMEOUT_MS=4500,STALL_GRACE_MS=1400,MAX_PLAYBACK_RETRIES=1,REVEAL_AFTER_SECONDS=.12,REVEAL_AFTER_FRAMES=3,PRIMER_TIMEOUT_MS=3500,PRIMER_FRAMES=5;
  const fx=(p,activeEffect)=>{const key=activeEffect?`${p.id}:${activeEffect}`:'';return `<span class="player-fx${activeEffect?` has-effect has-video fx-stage-${activeEffect}`:''}" aria-hidden="true">${activeEffect?vfxVideo(activeEffect,key):''}</span>`};
  const frozenFx=(playerId,effect)=>{if(!effect)return '';const asset=VFX[effect];return `<span class="player-fx effect-frozen fx-${effect}-frozen${effect==='x2'?' x2-frozen':''}" data-held-effect-key="${esc(`${playerId}:${effect}`)}" aria-hidden="true"><img class="fx-poster fx-${effect}-poster" src="assets/${asset.poster}?v=94" alt="">${effect==='x2'?'<span>×2</span>':''}</span>`};
  const warmedPosters=new Set();
  function warmPoster(name){const asset=VFX[name];if(!asset||warmedPosters.has(name))return;warmedPosters.add(name);const image=new Image();image.decoding='async';image.src=`assets/${asset.poster}?v=94`}
  const decoderDock=document.createElement('span');decoderDock.id='decoder-dock';decoderDock.setAttribute('aria-hidden','true');document.body.appendChild(decoderDock);
  const sharedVideo=document.createElement('video');sharedVideo.muted=true;sharedVideo.playsInline=true;sharedVideo.preload='auto';decoderDock.appendChild(sharedVideo);
  let decoderState='priming',decoderPrimeTimer=null,lastGameId=null,lastRound=null,previousLeaderId=null,previousDoubled=new Map(),effectState=new Map(),playbackRetries=new Map(),effectQueue=[],activeEffectKeys=new Set(),heldEffects=new Map(),lastData=null,decoderLimit=MAX_ACTIVE_EFFECTS;
  const playerKey=key=>key.slice(0,key.lastIndexOf(':'));
  function resetVideoRuntime(video){clearTimeout(video._startTimer);clearTimeout(video._stallTimer);clearTimeout(video._frameTimer);video._startTimer=video._stallTimer=video._frameTimer=null;if(video._frameRequest&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(video._frameRequest);video._frameRequest=null;video._decodedFrames=0;video.dataset.finished=''}
  function parkVideo(){resetVideoRuntime(sharedVideo);sharedVideo.pause();sharedVideo.className='decoder-surface';sharedVideo.removeAttribute('data-effect-key');sharedVideo.removeAttribute('data-hold-at');decoderDock.appendChild(sharedVideo)}
  function discardVideo(key){if(sharedVideo.dataset.effectKey&&(!key||sharedVideo.dataset.effectKey===key))parkVideo()}
  function clearEffects(){discardVideo();effectQueue=[];activeEffectKeys.clear();heldEffects.clear();effectState=new Map();playbackRetries.clear();decoderLimit=MAX_ACTIVE_EFFECTS}
  function takeQueued(excludedPlayers=new Set()){const index=effectQueue.findIndex(key=>!excludedPlayers.has(playerKey(key)));if(index<0)return null;return effectQueue.splice(index,1)[0]}
  function fillEffectSlots(){
    if(decoderState!=='ready')return;
    const occupiedPlayers=new Set([...activeEffectKeys].map(playerKey));
    while(activeEffectKeys.size<decoderLimit){const key=takeQueued(occupiedPlayers);if(!key)break;activeEffectKeys.add(key);occupiedPlayers.add(playerKey(key));effectState.set(key,'playing')}
  }
  function ensurePlayback(video){if(!video||video.dataset.held==='1')return;const key=video.dataset.effectKey||'',effect=key.slice(key.lastIndexOf(':')+1);warmPoster(effect);if(!video._startTimer)video._startTimer=setTimeout(()=>{if(!video.classList.contains('ready'))playbackFailed(video)},START_TIMEOUT_MS);if(video.paused){const started=video.play();if(started?.catch)started.catch(()=>playbackFailed(video))}}
  function mountSharedVideo(slot){if(!slot||decoderState!=='ready')return;const key=slot.dataset.effectKey,name=slot.dataset.effectName,asset=VFX[name];if(!asset)return;if(sharedVideo.dataset.effectKey!==key){resetVideoRuntime(sharedVideo);sharedVideo.pause();sharedVideo.className=`fx-video fx-${name}-video`;sharedVideo.dataset.effectKey=key;if(asset.holdAt)sharedVideo.dataset.holdAt=asset.holdAt;else sharedVideo.removeAttribute('data-hold-at');sharedVideo.src=`assets/${asset.file}?v=94`;sharedVideo.load()}slot.replaceWith(sharedVideo);ensurePlayback(sharedVideo)}
  function revealVideo(video){if(!video?.isConnected||video.classList.contains('ready')||video.currentTime<REVEAL_AFTER_SECONDS)return false;clearTimeout(video._startTimer);clearTimeout(video._frameTimer);video._startTimer=null;video.classList.add('ready');video.closest('.player-fx')?.classList.add('video-ready');return true}
  function waitForVisibleFrame(video,metadata={}){if(!video?.isConnected)return;video._decodedFrames=Math.max(video._decodedFrames||0,Number(metadata.presentedFrames)||0);if(video._decodedFrames>=REVEAL_AFTER_FRAMES)revealVideo(video);if(video.requestVideoFrameCallback)video._frameRequest=video.requestVideoFrameCallback((now,next)=>waitForVisibleFrame(video,next))}
  function finishVideo(video){if(!video||video.dataset.finished==='1')return;video.dataset.finished='1';const key=video.dataset.effectKey;if(key){activeEffectKeys.delete(key);effectState.set(key,'done');heldEffects.set(playerKey(key),key.slice(key.lastIndexOf(':')+1))}parkVideo();setTimeout(()=>lastData&&render(lastData),0)}
  function playbackFailed(video){if(!video||video.dataset.held==='1')return;const key=video.dataset.effectKey,retries=(playbackRetries.get(key)||0)+1;clearTimeout(video._startTimer);clearTimeout(video._stallTimer);activeEffectKeys.delete(key);discardVideo(key);playbackRetries.set(key,retries);if(retries<=MAX_PLAYBACK_RETRIES){effectState.set(key,'queued');if(key&&!effectQueue.includes(key))effectQueue.unshift(key)}else effectState.set(key,'done');setTimeout(()=>lastData&&render(lastData),0)}
  board.addEventListener('ended',event=>{if(event.target.matches('.fx-video'))finishVideo(event.target)},true);
  board.addEventListener('timeupdate',event=>{const video=event.target;if(!video.matches('.fx-video'))return;if(!video.classList.contains('ready')&&!video.requestVideoFrameCallback)revealVideo(video);if(!video.matches('[data-hold-at]'))return;const holdAt=Number(video.dataset.holdAt);if(video.currentTime>=holdAt)finishVideo(video)},true);
  board.addEventListener('error',event=>{if(event.target.matches('.fx-video'))playbackFailed(event.target)},true);
  board.addEventListener('playing',event=>{const video=event.target;if(!video.matches('.fx-video'))return;clearTimeout(video._stallTimer);if(video.classList.contains('ready'))return;clearTimeout(video._frameTimer);if(video.requestVideoFrameCallback)video._frameRequest=video.requestVideoFrameCallback((now,metadata)=>waitForVisibleFrame(video,metadata));else video._frameTimer=setTimeout(()=>revealVideo(video),220)},true);
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
    if(sharedVideo.dataset.effectKey)sharedVideo.remove();
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>FlipCast</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.lucky13?'<small class="effect-tag gold">LUCKY 13</small>':''}${p.divided?'<small class="effect-tag vengeance">÷2</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ NEAR WIN</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;const active=activeEffectById.get(p.id),held=active?null:heldEffects.get(String(p.id));return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${frozenFx(p.id,held)}${fx(p,active?.effect)}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    mountSharedVideo(board.querySelector('.fx-video-slot[data-effect-key]'));
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  const lastSequenceBySender=new Map(),knownSenderIds=new Set();
  function reply(senderId,data){try{context.sendCustomMessage?.(NAMESPACE,senderId,data)}catch{}}
  function publishDecoderState(){for(const senderId of knownSenderIds)reply(senderId,{type:'DECODER',receiverBuild:RECEIVER_BUILD,decoderState})}
  context.addCustomMessageListener(NAMESPACE,event=>{const data=event.data||{},senderId=event.senderId||'';if(senderId)knownSenderIds.add(senderId);if(data.type==='HELLO'){reply(senderId,{type:'READY',receiverBuild:RECEIVER_BUILD,decoderState});return}if(data.type==='STATE'){const seq=Number(data.seq)||0,last=lastSequenceBySender.get(senderId)||0;if(seq>last){lastSequenceBySender.set(senderId,seq);render(data.scoreboard)}reply(senderId,{type:'ACK',seq,receiverBuild:RECEIVER_BUILD,decoderState});return}render(data)});
  function decoderPrimed(){if(decoderState!=='priming')return;clearTimeout(decoderPrimeTimer);decoderState='ready';sharedVideo.pause();sharedVideo.dataset.decoderWarm='';sharedVideo.className='decoder-surface';sharedVideo._frameRequest=null;publishDecoderState();setTimeout(()=>lastData&&render(lastData),0)}
  function waitForPrimerFrame(video,metadata={}){if(decoderState!=='priming')return;video._primerFrames=Math.max(video._primerFrames||0,Number(metadata.presentedFrames)||0);if(video._primerFrames>=PRIMER_FRAMES&&video.currentTime>=REVEAL_AFTER_SECONDS){decoderPrimed();return}if(video.requestVideoFrameCallback)video._frameRequest=video.requestVideoFrameCallback((now,next)=>waitForPrimerFrame(video,next))}
  function startDecoderPrimer(){sharedVideo.dataset.decoderWarm='1';sharedVideo.className='decoder-surface';sharedVideo.src='assets/divide-v87.mp4?v=94';sharedVideo.load();decoderPrimeTimer=setTimeout(()=>{if(decoderState==='priming'){decoderState='failed';sharedVideo.pause();publishDecoderState();setTimeout(()=>lastData&&render(lastData),0)}},PRIMER_TIMEOUT_MS);sharedVideo.addEventListener('playing',()=>{if(decoderState!=='priming')return;if(sharedVideo.requestVideoFrameCallback)sharedVideo._frameRequest=sharedVideo.requestVideoFrameCallback((now,metadata)=>waitForPrimerFrame(sharedVideo,metadata))},{once:true});sharedVideo.addEventListener('ended',decoderPrimed,{once:true});const started=sharedVideo.play();if(started?.catch)started.catch(()=>{})}
  context.start();startDecoderPrimer();
})();
