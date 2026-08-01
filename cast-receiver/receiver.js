(function(){
  const winnerStyles=document.createElement('link');winnerStyles.rel='stylesheet';winnerStyles.href='winner.css?v=15';document.head.appendChild(winnerStyles);
  const NAMESPACE='urn:x-cast:com.sevenup.scoreboard';
  const context=cast.framework.CastReceiverContext.getInstance();
  const idle=document.querySelector('#idle'),board=document.querySelector('#scoreboard');
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fx=p=>`<span class="player-fx" aria-hidden="true">${p.hot?'<span class="fx-sprite fx-fire"></span>':''}${p.frozen?'<span class="fx-sprite fx-frost-art"></span>':''}${p.nearVictory?`<svg class="fx-lightning" viewBox="0 0 1000 180" preserveAspectRatio="none"><g class="lightning-main"><path d="M72 -8 136 49 111 67 186 119 149 132 213 188"/><path d="M706 -5 672 46 701 61 651 105 677 119 625 184"/></g><g class="lightning-branches"><path d="M132 50 191 37M115 68 62 96M180 119 235 103M677 46 620 30M652 105 596 126M676 119 735 151"/></g><circle cx="151" cy="132" r="9"/><circle cx="676" cy="119" r="8"/></svg>`:''}${p.busted?`<svg class="fx-bust-art" viewBox="0 0 1000 180" preserveAspectRatio="none"><g class="bust-card"><path d="M785 19h103a15 15 0 0 1 15 15v112a15 15 0 0 1-15 15H785a15 15 0 0 1-15-15V34a15 15 0 0 1 15-15Z"/><path class="bust-crack" d="m843 20-18 44 23 13-31 42 18 42"/><path class="bust-seven" d="M805 50h64l-38 79"/></g><g class="bust-shards"><path d="m753 44-31-21 7 38Z"/><path d="m741 91-44-4 28 29Z"/><path d="m756 136-35 24 43-2Z"/><path d="m916 52 34-17-18 37Z"/><path d="m917 115 46 9-41 18Z"/></g></svg>`:''}${p.flip7?`<span class="fx-flip-cards">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</span>`:''}</span>`;
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
    board.innerHTML=`<header><div><span>${data.roundActive?'CURRENT ROUND PREVIEW':'LIVE SCOREBOARD'}</span><h1>Cast 7</h1></div><div class="round">Round <b>${Number(data.round)||1}</b><small>First to ${Number(data.target)||200}</small></div></header><div class="players">${players.map((p,i)=>{const doublePulse=p.doubled&&previousDoubled.get(p.id)===false;const effects=`${p.flip7?' flip7':''}${p.frozen?' frozen':''}${p.hot?' hot':''}${p.busted?' busted':''}${p.nearVictory?' near-win':''}${doublePulse?' double-pulse':''}${p.id===newLeaderId?' new-leader':''}`;const badges=`${p.flip7?'<small class="effect-tag gold">✦ FLIP 7</small>':''}${p.frozen?'<small class="effect-tag ice">❄ FROZEN</small>':''}${p.doubled?'<small class="effect-tag double">×2</small>':''}${p.hot?'<small class="effect-tag fire">🔥 60+</small>':''}${p.nearVictory?'<small class="effect-tag electric">⚡ CLOSE</small>':''}${p.busted?'<small class="effect-tag bust">BUST</small>':''}`;return `<article class="player ${p.score===high&&high>0?'leader':''} ${data.roundActive?'preview':''}${effects}">${fx(p)}<em>${i===0?'♛':i+1}</em><strong>${esc(p.name)}<span class="effect-tags">${badges}</span>${p.score===high&&high>0?'<small class="leader-label">LEADER</small>':''}</strong><i><u style="width:${Math.min(100,p.score/data.target*100)}%"></u></i><b>${Number(p.score)||0}${data.roundActive?`<small><span>${Number(p.banked)||0}</span> <mark>+${Number(p.roundPoints)||0}</mark></small>`:''}</b></article>`}).join('')}</div><footer>${data.roundActive?'Projected totals if everyone stops now':`${Number(data.completedRounds)||0} rounds complete · ${players.length} players`}</footer>`;
    if(uniqueLeaderId)previousLeaderId=uniqueLeaderId;
    previousDoubled=new Map(players.map(p=>[p.id,Boolean(p.doubled)]));
  }
  context.addCustomMessageListener(NAMESPACE,event=>render(event.data));context.start({disableIdleTimeout:true});
})();
