(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=15';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const vfxVideo=(name,klass,ext='mp4')=>`<video class="fx-video ${klass}" autoplay muted loop playsinline preload="auto" onerror="this.classList.add('failed');this.closest('.player-fx').classList.add('video-failed')"><source src="assets/${name}-v${ext==='mp4'?49:52}.${ext}?v=52" type="video/${ext}"></video>`;
  const videoEffect=p=>p.nearVictory?'electric':p.busted?'bust':p.flip7?'flip7':p.doubled?'x2':p.frozen?'freeze':p.hot?'fire':null;
  const videoPriority=['electric','bust','flip7','x2','freeze','fire'];
  const fx=(p,activeVideo)=>`<span class="player-fx${activeVideo?' has-video':''}" aria-hidden="true">${p.hot?`<span class="fx-sprite fx-fire"></span>${activeVideo==='fire'?vfxVideo('fire','fx-fire-video'):''}`:''}${p.frozen?`<span class="fx-sprite fx-frost-art"></span>${activeVideo==='freeze'?vfxVideo('freeze','fx-freeze-video'):''}`:''}${p.nearVictory?`<span class="fx-electric-fallback"></span>${activeVideo==='electric'?vfxVideo('electric','fx-electric-video'):''}`:''}${p.doubled?`<span class="fx-double-glass"><i></i><i></i><b></b><b></b><u></u></span>${activeVideo==='x2'?vfxVideo('x2','fx-x2-video','webm'):''}`:''}${p.busted?`<svg class="fx-bust-art" viewBox="0 0 1000 180" preserveAspectRatio="none"><g class="bust-cracks"><path d="M548 -8 517 42 548 74 492 111 519 188M517 42 407 16 333 52 246 21 151 63 55 35M548 74 654 35 746 61 845 22 962 58M492 111 385 91 301 134 194 105 86 151M492 111 603 147 701 112 812 155 946 119M519 188 444 142 346 181M548 -8 631 28 704 -2"/><path d="M333 52 298 90 325 112 265 154M298 90 205 67M325 112 419 143M746 61 706 99 744 123 681 177M706 99 821 78M744 123 863 168"/><path d="M151 63 113 93 142 116 76 177M845 22 816 58 854 81 797 135M603 147 650 92 626 65"/></g><g class="bust-shards"><path d="m517 42 31-50 83 36-83 46Z"/><path d="m548 74 83-46 23 7-51 112-111-36Z"/><path d="m407 16 110 26-69 51-115-41Z"/><path d="m301 134 84-43 107 20-48 31-98 39Z"/><path d="m654 35 92 26-40 38-103 48Z"/><path d="m706 99 115-21 42 90-119-45Z"/><path d="m151 63 182-11-35 38-156 26Z"/></g><g class="bust-fragments">${Array.from({length:18},(_,i)=>`<circle cx="${70+i*50}" cy="${18+(i%5)*34}" r="${2+(i%3)}" style="--i:${i}"/>`).join('')}</g></svg>${activeVideo==='bust'?vfxVideo('bust','fx-bust-video','webm'):''}`:''}${p.flip7?`<span class="fx-flip-cards">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</span>${activeVideo==='flip7'?vfxVideo('flip7','fx-flip7-video','webm'):''}`:''}</span>`;
  let lastGameId=null,previousLeaderId=null,previousDoubled=new Map();
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
    if(data.gameId!==lastGameId){lastGameId=data.gameId;previousLeaderId=null;previousDoubled=new Map()}
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
    const selectedVideoPlayer=players.filter(p=>videoEffect(p)).sort((a,b)=>videoPriority.indexOf(videoEffect(a))-videoPriority.indexOf(videoEffect(b))||b.score-a.score)[0],activeVideoById=new Map(selectedVideoPlayer?[[selectedVideoPlayer.id,videoEffect(selectedVideoPlayer)]]:[]);
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>Cast 7</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ CLOSE</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${fx(p,activeVideoById.get(p.id))}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  context.addCustomMessageListener(NAMESPACE,event=>render(event.data));context.start({disableIdleTimeout:true});
})();
