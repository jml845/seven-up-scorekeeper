import {MODIFIERS, calculateRound, totalsFor, gameOutcome, playerStats} from './rules.js?v=70';

function syncViewportHeight(){document.documentElement.style.setProperty('--app-height',`${Math.round(window.visualViewport?.height||window.innerHeight)}px`)}
syncViewportHeight();
window.visualViewport?.addEventListener('resize',syncViewportHeight);
window.visualViewport?.addEventListener('scroll',syncViewportHeight);
window.addEventListener('orientationchange',syncViewportHeight);

const KEY = 'seven-up-scorekeeper-v1';
const BUILD = '70';
const FEEDBACK_FORM = 'https://tally.so/r/1Ag8Pb';
const fresh = () => ({players:[], games:[], activeGameId:null});
let state = load(); let view = 'home'; let scoringMode = 'cards'; let draft = {}; let winnerGame = null;
let screenStack = ['home'];
let setupSelection = null;
let scoreErrors = new Set();
const app = document.querySelector('#app');
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('seven-up-live-score') : null;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
function feedbackUrl(){const url=new URL(FEEDBACK_FORM);url.searchParams.set('build',BUILD);url.searchParams.set('device',navigator.platform||'unknown');url.searchParams.set('browser',navigator.userAgent);url.searchParams.set('source',matchMedia('(display-mode: standalone)').matches?'installed app':'web browser');return url.href}
function load(){try{return {...fresh(),...JSON.parse(localStorage.getItem(KEY))}}catch{return fresh()}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));channel?.postMessage('refresh')}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1900)}
function activeGame(){return state.games.find(g=>g.id===state.activeGameId)}
function player(id){return state.players.find(p=>p.id===id)}
function draftScore(id){const d=draft[id];if(!d)return 0;if(scoringMode==='quick')return d.quick===''?0:Math.max(0,Number(d.quick)||0);return calculateRound(d)}
function castPayload(game,includeDraft=false,status='active'){const totals=totalsFor(game);const latestRound=game.rounds.at(-1);return {version:7,gameId:game.id,status,winnerId:status==='winner'?game.winnerId:null,target:game.target,round:game.rounds.length+1,completedRounds:game.rounds.length,roundActive:includeDraft,players:game.playerIds.map(id=>{const roundPoints=includeDraft?draftScore(id):0;const d=includeDraft&&scoringMode==='cards'?draft[id]:null;const score=totals[id]+roundPoints;return {id,name:player(id)?.name||'Player',banked:totals[id],roundPoints,score,flip7:Boolean(d?.flip7),frozen:Boolean(d?.frozen),busted:Boolean(d?.busted),doubled:Boolean(d?.doubled),hot:!includeDraft&&Number(latestRound?.scores?.[id])>62,nearVictory:score>0&&score>=game.target-25}})}}
function castStatsPayload(){return {version:7,status:'stats',generatedAt:new Date().toISOString(),totalGames:state.games.filter(g=>g.status==='complete').length,stats:playerStats(state.players,state.games).sort((a,b)=>b.wins-a.wins||b.winPct-a.winPct).map(p=>({id:p.id,name:p.name,games:p.games,wins:p.wins,winPct:p.winPct,avgScore:p.avgScore,avgPlace:p.avgPlace,streak:p.streak}))}}
function sendToCast(game=activeGame(),includeDraft=view==='score'){if(game)window.sevenUpCast?.send(castPayload(game,includeDraft,'active'))}
function sendWinnerToCast(game){winnerGame=game;window.sevenUpCast?.send(castPayload(game,false,'winner'))}
function sendStatsToCast(){window.sevenUpCast?.send(castStatsPayload())}
function go(next,record=true){if(next==='setup')setupSelection=new Set(view==='winner'&&winnerGame?winnerGame.playerIds:[]);else if(view==='setup')setupSelection=null;view=next;if(record){screenStack.push(next);window.history.pushState({sevenUpView:next},'')}else window.history.replaceState({sevenUpView:next},'');render();scrollTo(0,0);if(next==='game')sendToCast(activeGame(),false);else if(next==='stats')sendStatsToCast()}
function dateText(iso){return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(iso))}

function render(){
  const pageScroll=app.scrollTop;
  const scoreListScroll=document.querySelector('.score-player-list')?.scrollTop;
  const game=activeGame();
  if(view==='game' && !game) view='home';
  app.innerHTML = view==='home' ? home() : view==='setup' ? setup() : view==='game' ? gameScreen(game) : view==='score' ? scoreScreen(game) : view==='tv' ? tvScreen(game) : view==='stats' ? stats() : history();
  bind();
  app.scrollTop=pageScroll;
  const nextScoreList=document.querySelector('.score-player-list');
  if(scoreListScroll!==undefined&&nextScoreList)nextScoreList.scrollTop=scoreListScroll;
  app.focus({preventScroll:true});if(view==='home')requestAnimationFrame(positionCastArrow);
}
function home(){const game=activeGame();return `<svg class="cast-arrow-overlay" aria-hidden="true"><path pathLength="1"/><polyline/></svg><section class="hero"><h1>Keep score.<br><span>Press your luck.</span></h1><div class="hero-cast-hint">Cast your scoreboard</div><p>Fast round scoring, offline game history, and all-time bragging rights.</p></section><section class="grid two">
  ${game?`<button class="card home-action primary" data-nav="game"><strong>Resume game</strong><span>Round ${game.rounds.length+1} · ${game.playerIds.length} players</span></button>`:`<button class="card home-action primary" data-nav="setup"><strong>New game</strong><span>Choose players and start scoring</span></button>`}
  ${game?`<button class="card home-action" data-nav="setup"><strong>New game</strong><span>Start another match</span></button>`:''}
  <button class="card home-action" data-nav="stats"><strong>All-time stats</strong><span>Wins, win rate, streaks, and more</span></button>
  <button class="card home-action" data-nav="history"><strong>Game history</strong><span>${state.games.filter(g=>g.status==='complete').length} completed games</span></button></section><p class="subtle app-footer"><a href="${esc(feedbackUrl())}" target="_blank" rel="noopener">Feedback</a><span aria-hidden="true">·</span><a href="privacy.html?v=70">Privacy</a></p>`}
function positionCastArrow(){const svg=document.querySelector('.cast-arrow-overlay'),hint=document.querySelector('.hero-cast-hint'),launcher=document.querySelector('.cast-launcher');if(!svg||!hint)return;const h=hint.getBoundingClientRect(),c=launcher?.getBoundingClientRect();const startX=Math.min(innerWidth-70,h.right+9),startY=h.top+h.height/2,targetX=c?.width?c.left+c.width/2:innerWidth-37,targetY=c?.height?c.top+c.height/2:34;svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);svg.querySelector('path').setAttribute('d',`M${startX} ${startY} H${targetX} V${targetY}`);svg.querySelector('polyline').setAttribute('points',`${targetX-8},${targetY+12} ${targetX},${targetY} ${targetX+8},${targetY+12}`)}
function setup(){return `<section class="setup-page-shell"><div class="section-head setup-head"><h1>New game</h1><button class="button ghost small" data-nav="home">Cancel</button></div><section class="card setup-card">
  <div class="field"><label>Target score</label><input id="target" type="number" min="25" max="999" value="200" inputmode="numeric"></div>
  <label>Players (choose 2–18)</label><div id="playerList" class="setup-player-list">${state.players.map(p=>`<div class="player-pick"><input type="checkbox" id="p-${p.id}" value="${p.id}" ${setupSelection?.has(p.id)?'checked':''}><label for="p-${p.id}">${esc(p.name)}</label><button class="button ghost small delete-player" data-id="${p.id}" type="button">Remove</button></div>`).join('')}</div>
  <form id="addPlayer" class="inline-form setup-add-player"><input id="newPlayer" maxlength="24" placeholder="Add a player" autocomplete="off"><button class="button" type="submit">Add</button></form>
  <div class="setup-start-bar"><button id="startGame" class="button full">Start game</button></div></section></section>`}
function gameScreen(game){const totals=totalsFor(game);const latestRound=game.rounds.at(-1);const order=[...game.playerIds].sort((a,b)=>totals[b]-totals[a]);return `<section class="game-shell"><div class="game-scroll"><div class="section-head"><div><h1>Scoreboard</h1><span class="subtle">First to ${game.target}</span></div><div><button class="button ghost small" data-nav="home">Home</button></div></div>
  <div class="round-banner">${game.rounds.length ? `${game.rounds.length} round${game.rounds.length===1?'':'s'} completed` : 'Ready for round 1'}</div><section class="scoreboard">${order.map((id,i)=>{const hot=Number(latestRound?.scores?.[id])>62;return `<div class="score-row ${hot?'hot-next-round':''}">${hot?scoreFx({hot:true}):''}<span class="rank">#${i+1}</span><strong>${esc(player(id)?.name)}${hot?`<small class="round-hot-badge">🔥 ${latestRound.scores[id]} last round</small>`:''}</strong><span class="total">${totals[id]}</span><div class="progress"><span style="width:${Math.min(100,totals[id]/game.target*100)}%"></span></div></div>`}).join('')}</section>
  ${game.rounds.length?`<section class="card" style="margin-top:14px"><div class="section-head"><h2>Rounds</h2><button id="undoRound" class="button ghost small">Undo last</button></div>${game.rounds.slice().reverse().map((r,idx)=>`<div class="history-row"><div><strong>Round ${game.rounds.length-idx}</strong><p>${game.playerIds.map(id=>`${esc(player(id)?.name)} ${r.scores[id]}`).join(' · ')}</p></div></div>`).join('')}</section>`:''}</div>
  <div class="game-actions"><button id="endGame" class="button ghost">End game</button><button id="scoreRound" class="button">Score round ${game.rounds.length+1}</button></div></section>`}
function tvScreen(game){
  const totals=totalsFor(game);const order=[...game.playerIds].sort((a,b)=>totals[b]-totals[a]);const high=Math.max(...Object.values(totals));const cols=order.length>8?2:1;const rows=Math.ceil(order.length/cols);
  return `<section class="tv-view ${cols===2?'tv-dense':''}" style="--tv-cols:${cols};--tv-rows:${rows}"><header class="tv-head"><div><span class="tv-kicker">LIVE SCOREBOARD</span><h1>FlipCast</h1></div><div class="tv-round">Round <strong>${game.rounds.length+1}</strong><small>First to ${game.target}</small></div></header>
  <div class="tv-board">${order.map((id,i)=>`<article class="tv-player ${totals[id]===high&&high>0?'leader':''}"><div class="tv-rank">${i===0?'♛':i+1}</div><div class="tv-name">${esc(player(id)?.name)}${totals[id]===high&&high>0?'<span>LEADER</span>':''}</div><div class="tv-track"><i style="width:${Math.min(100,totals[id]/game.target*100)}%"></i></div><div class="tv-score">${totals[id]}</div></article>`).join('')}</div>
  <footer class="tv-foot"><span>${game.rounds.length?`${game.rounds.length} round${game.rounds.length===1?'':'s'} complete`:'Game ready'} · ${game.playerIds.length} players</span><div><button id="tvFullscreen" class="button ghost small">Full screen</button> <button class="button ghost small" data-nav="game">Exit TV mode</button></div></footer></section>`;
}
function initDraft(game){draft={};for(const id of game.playerIds)draft[id]={quick:'',numbers:[],doubled:false,doublePulse:false,modifiers:[],flip7:false,frozen:false,busted:false,expanded:false}}
function scoreScreen(game){if(!draft[game.playerIds[0]])initDraft(game);return `<section class="score-entry-shell"><div class="section-head score-entry-head"><div><h1>Round ${game.rounds.length+1}</h1><span class="subtle">Enter every player’s score or select Bust</span></div><button class="button ghost small" data-nav="game">Cancel</button></div><div class="mode-tabs"><button data-mode="quick" class="${scoringMode==='quick'?'active':''}">Quick score</button><button data-mode="cards" class="${scoringMode==='cards'?'active':''}">Card calculator</button></div>
  <div class="score-player-list">${game.playerIds.map(id=>scoreCard(id)).join('')}</div><div class="score-save-bar"><button class="button ghost" data-nav="game">Cancel</button><button id="saveRound" class="button">Save round</button></div></section>`}
function scoreFx({flip7=false,frozen=false,hot=false,near=false}={}){return `<span class="score-card-fx" aria-hidden="true">${hot?'<span class="fx-sprite fx-fire"></span>':''}${frozen?'<span class="fx-sprite fx-frost-art"></span>':''}${near?'<span class="fx-sprite fx-electric-art fx-near-electric"></span>':''}${flip7?`<span class="fx-flip-cards">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</span>`:''}</span>`}
function scoreCard(id){const d=draft[id];const calc=calculateRound(d);const invalid=scoreErrors.has(id)?' score-card-error':'';const game=activeGame();const banked=game?totalsFor(game)[id]||0:0;if(scoringMode==='quick'){const points=d.quick===''?0:Number(d.quick);const projected=banked+points;const near=d.quick!==''&&game&&projected>0&&projected>=game.target-25;const badges=`${near?'<span class="effect-badge electric">⚡ NEAR WIN</span>':''}`;return `<section class="card score-card${near?' effect-near':''}${invalid}" data-player="${id}">${scoreFx({near})}<div class="score-card-head"><div><h3>${esc(player(id)?.name)}</h3><span class="score-effects">${badges}</span></div><span class="score-value">${d.quick===''?'—':points}</span></div><input class="quick-score" type="number" min="0" max="999" inputmode="numeric" value="${esc(d.quick)}" placeholder="Round score"><p class="score-required">Enter a score for this player</p></section>`}const projected=banked+calc;const near=Boolean(game&&projected>0&&projected>=game.target-25);const effects=`${d.flip7?' effect-flip7':''}${d.frozen?' effect-frozen':''}${near?' effect-near':''}${d.doublePulse?' effect-double-pulse':''}`;const badges=`${d.flip7?'<span class="effect-badge gold">✦ FLIP 7</span>':''}${d.frozen?'<span class="effect-badge ice">❄ FROZEN</span>':''}${d.doubled?'<span class="effect-badge double">×2</span>':''}${near?'<span class="effect-badge electric">⚡ NEAR WIN</span>':''}`;return `<section class="card score-card ${d.expanded?'expanded':'collapsed'}${effects}${invalid}" data-player="${id}">${scoreFx({flip7:d.flip7,frozen:d.frozen,near})}<div class="score-card-head"><div><h3>${esc(player(id)?.name)}</h3><span class="score-effects">${badges}</span></div><span class="score-value">${calc}</span></div><div class="compact-score-actions"><button class="chip bust ${d.busted?'active':''}">Bust = 0</button><button class="button ghost small expand-calculator" aria-expanded="${d.expanded}">${d.expanded?'Minimize':'Enter cards'}</button></div><p class="score-required">Enter cards, Frozen, or select Bust</p>${d.expanded?`<div class="calculator-controls"><div class="number-grid">${Array.from({length:13},(_,n)=>`<button class="chip number ${d.numbers.includes(n)?'active':''}" data-number="${n}">${n}</button>`).join('')}</div><div class="specials"><button class="chip double ${d.doubled?'active':''}">×2</button>${MODIFIERS.map(n=>`<button class="chip modifier ${d.modifiers.includes(n)?'active':''}" data-mod="${n}">+${n}</button>`).join('')}<button class="chip flip ${d.flip7?'active':''}">Flip 7 +15</button><button class="chip frozen ${d.frozen?'active':''}">❄ Frozen</button></div></div>`:''}</section>`}
function stats(){const rows=playerStats(state.players,state.games).sort((a,b)=>b.wins-a.wins||b.winPct-a.winPct);return `<div class="section-head"><h1>All-time stats</h1><button class="button ghost small" data-nav="home">Home</button></div>${rows.length?`<section class="card">${rows.map((p,i)=>`<div class="stat-row"><div><strong>${i+1}. ${esc(p.name)}</strong><p>${p.games} game${p.games===1?'':'s'} · ${Math.round(p.winPct*100)}% wins · Avg ${p.avgScore.toFixed(1)} pts${p.avgPlace?` · Avg place ${p.avgPlace.toFixed(1)}`:''}${p.streak?` · 🔥 ${p.streak} streak`:''}</p></div><div><div class="stat-number">${p.wins}</div><span class="subtle">win${p.wins===1?'':'s'}</span></div></div>`).join('')}</section>`:`<div class="empty">Play a game to start the leaderboard.</div>`}`}
function history(){const games=state.games.filter(g=>g.status==='complete').sort((a,b)=>b.completedAt.localeCompare(a.completedAt));return `<div class="section-head"><h1>Game history</h1><button class="button ghost small" data-nav="home">Home</button></div>${games.length?`<section class="card">${games.map(g=>{const totals=totalsFor(g);return `<div class="history-row"><div><strong>${esc(player(g.winnerId)?.name||'No winner')} won</strong><p>${dateText(g.completedAt)} · ${g.rounds.length} rounds · ${g.playerIds.map(id=>`${esc(player(id)?.name)} ${totals[id]}`).join(', ')}</p></div><span class="pill">${totals[g.winnerId]||0} pts</span></div>`}).join('')}</section>`:`<div class="empty">Completed games will appear here.</div>`}`}

function bind(){
  document.querySelectorAll('[data-nav]').forEach(el=>el.onclick=()=>go(el.dataset.nav));
  document.querySelectorAll('#playerList input[type="checkbox"]').forEach(box=>box.onchange=()=>{if(!setupSelection)setupSelection=new Set();if(box.checked)setupSelection.add(box.value);else setupSelection.delete(box.value)});
  document.querySelectorAll('[data-mode]').forEach(el=>el.onclick=()=>{scoringMode=el.dataset.mode;scoreErrors.clear();render();sendToCast()});
  const add=document.querySelector('#addPlayer');if(add)add.onsubmit=e=>{e.preventDefault();const input=document.querySelector('#newPlayer');const name=input.value.trim();if(!name)return;if(state.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return toast('That player already exists');const p={id:uid(),name,createdAt:new Date().toISOString()};state.players.push(p);if(!setupSelection)setupSelection=new Set();setupSelection.add(p.id);save();render()};
  document.querySelectorAll('.delete-player').forEach(btn=>btn.onclick=()=>{if(state.games.some(g=>g.playerIds.includes(btn.dataset.id)))return toast('Player has game history and cannot be removed');state.players=state.players.filter(p=>p.id!==btn.dataset.id);setupSelection?.delete(btn.dataset.id);save();render()});
  const start=document.querySelector('#startGame');if(start)start.onclick=()=>{const ids=[...document.querySelectorAll('#playerList input:checked')].map(x=>x.value);if(ids.length<2)return toast('Choose at least 2 players');if(ids.length>18)return toast('Maximum 18 players');if(activeGame()&&!confirm('Replace the current unfinished game?'))return;const target=Math.max(25,Math.min(999,Number(document.querySelector('#target').value)||200));const game={id:uid(),playerIds:ids,target,rounds:[],status:'active',createdAt:new Date().toISOString()};state.games.push(game);state.activeGameId=game.id;winnerGame=null;draft={};save();go('game')};
  const score=document.querySelector('#scoreRound');if(score)score.onclick=()=>{draft={};scoreErrors.clear();scoringMode='cards';go('score');sendToCast()};
  document.querySelectorAll('.score-card').forEach(card=>{const id=card.dataset.player;const input=card.querySelector('.quick-score');if(input)input.oninput=()=>{draft[id].quick=input.value;clearScoreError(id);render();document.querySelector(`[data-player="${id}"] .quick-score`)?.focus({preventScroll:true});sendToCast()};const expand=card.querySelector('.expand-calculator');if(expand)expand.onclick=()=>toggleExpanded(id);card.querySelectorAll('.number').forEach(b=>b.onclick=()=>toggleArray(id,'numbers',Number(b.dataset.number)));card.querySelectorAll('.modifier').forEach(b=>b.onclick=()=>toggleArray(id,'modifiers',Number(b.dataset.mod)));const dbl=card.querySelector('button.chip.double');if(dbl)dbl.onclick=()=>toggleDouble(id);const flip=card.querySelector('.flip');if(flip)flip.onclick=()=>toggle(id,'flip7');const frozen=card.querySelector('.frozen');if(frozen)frozen.onclick=()=>toggle(id,'frozen');const bust=card.querySelector('.bust');if(bust)bust.onclick=()=>toggle(id,'busted')});
  const saveRound=document.querySelector('#saveRound');if(saveRound)saveRound.onclick=()=>{const g=activeGame();const missing=g.playerIds.filter(id=>scoringMode==='quick'?draft[id].quick==='':!hasCardScore(draft[id]));if(missing.length){scoreErrors=new Set(missing);render();document.querySelector(`[data-player="${missing[0]}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});toast(`${missing.length} player${missing.length===1?'':'s'} still need a score or Bust`);return}const scores={};for(const id of g.playerIds)scores[id]=scoringMode==='quick'?Math.max(0,Number(draft[id].quick)||0):calculateRound(draft[id]);g.rounds.push({scores,createdAt:new Date().toISOString()});scoreErrors.clear();const outcome=gameOutcome(g);if(outcome.finished){g.status='complete';g.winnerId=outcome.leaders[0];g.completedAt=new Date().toISOString();state.activeGameId=null;save();sendWinnerToCast(g);showWinner(g);return}sendToCast(g,false);save();draft={};go('game');if(outcome.tied)toast('Leaders tied — play another round')};
  const undo=document.querySelector('#undoRound');if(undo)undo.onclick=()=>{const g=activeGame();if(g.rounds.length&&confirm('Remove the most recent round?')){g.rounds.pop();save();render();toast('Last round removed')}};
  const end=document.querySelector('#endGame');if(end)end.onclick=()=>{if(confirm('End this game without recording a winner?')){const g=activeGame();g.status='abandoned';g.completedAt=new Date().toISOString();state.activeGameId=null;save();go('home')}};
  const fullscreen=document.querySelector('#tvFullscreen');if(fullscreen)fullscreen.onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{toast('Use the browser menu to enter full screen')}};
}
function hasCardScore(d){return d.busted||d.frozen||d.numbers.length>0||d.modifiers.length>0||d.doubled||d.flip7}
function clearScoreError(id){if(scoreErrors.delete(id))document.querySelector(`[data-player="${id}"]`)?.classList.remove('score-card-error')}
function toggle(id,key){draft[id][key]=!draft[id][key];if(hasCardScore(draft[id]))scoreErrors.delete(id);render();sendToCast()}
function toggleDouble(id){draft[id].doubled=!draft[id].doubled;draft[id].doublePulse=draft[id].doubled;if(hasCardScore(draft[id]))scoreErrors.delete(id);render();draft[id].doublePulse=false;sendToCast()}
function toggleExpanded(id){draft[id].expanded=!draft[id].expanded;render();document.querySelector(`[data-player="${id}"]`)?.scrollIntoView({block:'nearest'});sendToCast()}
function toggleArray(id,key,value){const a=draft[id][key];draft[id][key]=a.includes(value)?a.filter(x=>x!==value):[...a,value];if(key==='numbers')draft[id].flip7=draft[id].numbers.length===7;if(hasCardScore(draft[id]))scoreErrors.delete(id);render();sendToCast()}
function showWinner(game,record=true){const winner=player(game.winnerId);const totals=totalsFor(game);const order=[...game.playerIds].sort((a,b)=>totals[b]-totals[a]);winnerGame=game;view='winner';if(record)screenStack.push('winner');window.history.replaceState({sevenUpView:'winner'},'');app.innerHTML=`<section class="card winner"><div class="flying-crowns" aria-hidden="true">${Array.from({length:8},(_,i)=>`<i style="--i:${i}">👑</i>`).join('')}</div><div class="victory-cards" aria-hidden="true">${Array.from({length:7},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="winner-crown" aria-label="Winner">👑</div><h2>${esc(winner.name)} wins!</h2><p class="subtle">${totals[game.winnerId]} points · ${game.rounds.length} rounds</p><div class="winner-leaderboard">${order.map((id,i)=>`<div class="winner-row ${id===game.winnerId?'champion':''}"><span>${i+1}</span><strong>${esc(player(id)?.name)}</strong><b>${totals[id]}</b></div>`).join('')}</div><button class="button" data-nav="setup">New game</button> <button class="button ghost" data-nav="stats">All-time stats</button> <button class="button ghost" data-nav="home">Home</button></section>`;bind()}

document.addEventListener('click',e=>{if(e.target.closest('button')&&e.target.closest('button').type!=='submit')e.preventDefault()});
document.querySelector('.brand').onclick=()=>go('home');
const installBtn=document.querySelector('#installBtn');
const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let deferredInstall;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;installBtn.classList.remove('hidden')});
if(isIOS&&!isStandalone)installBtn.classList.remove('hidden');
installBtn.onclick=async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;installBtn.classList.add('hidden')}else if(isIOS&&!isStandalone)toast('On iPhone: tap Share, then Add to Home Screen')};
if('serviceWorker'in navigator){
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    reloading=true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js?v=70',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
}
channel?.addEventListener('message',()=>{state=load();if(view==='tv')render()});
window.addEventListener('storage',event=>{if(event.key===KEY){state=load();if(view==='tv')render()}});
window.addEventListener('sevenup-cast-connected',()=>view==='stats'?sendStatsToCast():view==='winner'&&winnerGame?sendWinnerToCast(winnerGame):sendToCast());
window.addEventListener('sevenup-cast-notice',event=>toast(event.detail));
window.history.replaceState({sevenUpView:'home'},'');
window.addEventListener('popstate',event=>{
  if(event.state?.sevenUpView){
    view=event.state.sevenUpView;
    if((view==='game'||view==='score'||view==='tv')&&!activeGame())view='home';
    if(view==='winner'&&winnerGame)showWinner(winnerGame,false);else render();
    scrollTo(0,0);if(view==='game')sendToCast(activeGame(),false);else if(view==='stats')sendStatsToCast();
  }
});
window.addEventListener('resize',()=>{if(view==='home')positionCastArrow()});
render();
