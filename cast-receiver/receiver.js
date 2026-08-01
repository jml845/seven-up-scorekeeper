(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=15';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const vfxVideo=(name,klass)=>`<video class="fx-video ${klass}" autoplay muted loop playsinline preload="metadata" poster="assets/${name}-fallback.webp?v=49" onerror="this.classList.add('failed')"><source src="assets/${name}-v49.mp4" type="video/mp4"></video>`;
  const fx=(p,useVideo)=>`<span class="player-fx" aria-hidden="true">${p.hot?`<span class="fx-sprite fx-fire"></span>${useVideo?vfxVideo('fire','fx-fire-video'):''}`:''}${p.frozen?`<span class="fx-sprite fx-frost-art"></span>${useVideo?vfxVideo('freeze','fx-freeze-video'):''}`:''}${p.nearVictory?`<span class="fx-electric-fallback"></span>${useVideo?vfxVideo('electric','fx-electric-video'):''}`:''}${p.doubled?'<span class="fx-double-glass"><i></i><i></i></span>':''}${p.busted?`<svg class="fx-bust-art" viewBox="0 0 1000 180" preserveAspectRatio="none"><g class="bust-cracks"><path d="M694 -5 649 47 672 69 601 116 626 180M649 47 557 22M672 69 757 42M601 116 496 91M601 116 548 177M626 180 734 134M694 -5 782 34M649 47 587 73"/><path d="M724 35 703 86 744 101 687 151M703 86 813 70M744 101 832 145M687 151 590 133"/><path d="M571 58 522 107 548 127 476 181M522 107 432 66M548 127 641 157"/></g><g class="bust-shards"><path d="m649 47 45-52 30 40-52 34Z"/><path d="m672 69 52-34-21 51-31 15Z"/><path d="m601 116 71-47-46 111-78-53Z"/><path d="m522 107 79 9-53 11-72 54Z"/><path d="m744 101 69-31 19 75-88-12Z"/><path d="m687 151 57-50 88 44-98-11Z"/></g><g class="bust-fragments">${Array.from({length:12},(_,i)=>`<circle cx="${470+i*35}" cy="${22+(i%4)*42}" r="${2+(i%3)}" style="--i:${i}"/>`).join('')}</g></svg>`:''}${p.flip7?`<span class="fx-flip-cards">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</span>`:''}</span>`;
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
    const videoFxIds=new Set(players.filter(p=>p.nearVictory||p.frozen||p.hot).sort((a,b)=>Number(b.nearVictory)-Number(a.nearVictory)||b.score-a.score).slice(0,1).map(p=>p.id));
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>Cast 7</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ CLOSE</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${fx(p,videoFxIds.has(p.id))}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  context.addCustomMessageListener(NAMESPACE,event=>render(event.data));context.start({disableIdleTimeout:true});
})();
