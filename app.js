const $ = s => document.querySelector(s);
let code = '', playerId = '', room = null, choice = null, target = null, poll = null;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path, data = {}, method = 'POST') {
  const r = await fetch('/api/' + path, { method, headers: {'Content-Type':'application/json'}, body: method === 'GET' ? undefined : JSON.stringify(data) });
  const d = await r.json(); if (!r.ok) throw Error(d.error || 'Something went wrong.'); return d;
}
function homeError(s) { $('#home-error').textContent = s || ''; }
$('#create').onclick = async () => { homeError(''); try { const d = await api('create', {name:$('#name').value}); enter(d.room.code, d.playerId); } catch(e) { homeError(e.message); } };
$('#join').onclick = async () => { homeError(''); try { const d = await api('join', {name:$('#name').value, code:$('#room-code').value}); enter(d.room.code, d.playerId); } catch(e) { homeError(e.message); } };
$('#room-code').oninput = e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

function enter(c, p) {
  code = c; playerId = p; localStorage.setItem('mm-session', JSON.stringify({code, playerId}));
  renderShell(); refresh(); clearInterval(poll); poll = setInterval(refresh, 900);
}
async function refresh() {
  if (!code) return;
  try { const d = await api(`state?code=${code}&playerId=${playerId}`, {}, 'GET'); room = d.room; paint(); }
  catch(e) { clearInterval(poll); localStorage.removeItem('mm-session'); code = ''; location.reload(); }
}

function renderShell() {
  const app = $('#app'); app.className = 'room-layout';
  app.innerHTML = `<section>
    <div class="room-heading"><div><p class="eyebrow">THE BAZAAR IS OPEN</p><h1 id="room-title">Rain round</h1><p id="room-sub">Secret moves. Shared street. Six rounds.</p></div><button class="room-codebox" id="copy"><small>ROOM CODE · TAP TO COPY</small><strong>${code}</strong></button></div>
    <div id="winner"></div>
    <div class="panel players-panel"><p class="section-title">THE STREET · WATER RISES AFTER EVERY MOVE</p><div id="weather-banner"></div><div class="bazaar" id="bazaar"></div><div class="status-strip" id="status"></div></div>
    <div class="panel" id="main-panel"></div>
    <div class="panel history-panel"><div class="history-heading"><div><p class="section-title">ROUND HISTORY</p><p class="history-caption">Every choice and its effect, shared with the whole bazaar.</p></div><span id="history-count" class="history-count"></span></div><div id="history-content"></div></div>
  </section><aside class="side-col">
    <div class="panel"><p class="section-title">LIVE SCOREBOARD</p><div id="scoreboard"></div></div>
    <div class="panel"><p class="section-title">HOW TO PLAY</p><div class="rules"><b>Trade</b> for 2 coins at water 0–1, 1 at 2, and none when Flooded (3). Market Rush adds 1 coin; Golden Market adds 2.<br><b>Sandbag</b> lowers your water by 1 (or 2 during Drainage Break).<br><b>Divert</b> lowers yours by 1 and raises one neighbor by 1.<br><b>Big Trade</b> earns 3 at water 0–1 or 2 at 2, then adds 1 water after the weather. No coins when Flooded.<br>Weather changes each round. Play all 6 rounds.</div></div>
    <div class="panel"><p class="section-title">ROUND RESULT</p><div class="feed" id="feed">The first shower is gathering…</div></div>
  </aside>`;
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(code); $('#copy small').textContent = 'COPIED · SHARE WITH FRIENDS'; } catch {} };
}

function paint() {
  const me = room.players.find(p => p.id === playerId); if (!me) return;
  const title = $('#room-title'), sub = $('#room-sub');
  if (room.status === 'lobby') { title.textContent = 'Gather the shopkeepers'; sub.textContent = `${room.players.length}/8 players · Start with at least 2.`; }
  else if (room.phase === 'reveal') { title.textContent = `Round ${room.round} · Reveal!`; sub.textContent = 'Everyone’s choices are in. The bazaar reacts together.'; }
  else if (room.status === 'finished') { title.textContent = 'Bazaar closed'; sub.textContent = 'Six rounds. One very soggy street.'; }
  else { title.textContent = `Round ${room.round} of 6`; sub.textContent = `${room.players.filter(p=>p.locked).length}/${room.players.length} shopkeepers locked in · ${room.secondsLeft}s`; }

  const weather = room.weatherEvent;
  $('#weather-banner').innerHTML = room.status !== 'lobby' && weather ? `<div class="weather-banner weather-${weather.name.toLowerCase().replace(/\s+/g,'-')}"><span class="weather-icon">${weather.icon}</span><div><span class="weather-kicker">ROUND ${room.round} WEATHER</span><strong>${esc(weather.name)}</strong><span class="weather-text">${esc(weather.text)}</span></div><span class="weather-one">ONE EVENT</span></div>` : '';
  $('#bazaar').innerHTML = room.players.map(p => `<article class="stall ${p.id===playerId?'me':''} ${p.water===3?'water-3':''}"><div class="stall-roof"></div><div class="stall-name">${esc(p.name)}${p.id===playerId?'<span class="you-tag">YOU</span>':''}</div><div class="stall-meta"><span>WATER</span><span>${p.water}/3</span></div><div class="water-track"><div class="water-fill" style="width:${p.water/3*100}%"></div></div><div class="flood-tag">${p.water===3?'● FLOODED':p.connected?'● HERE':'○ RECONNECTING'}</div></article>`).join('');
  $('#scoreboard').innerHTML = [...room.players].sort((a,b)=>b.coins-a.coins).map((p,i)=>`<div class="score-row"><span class="score-name"><span class="rank">${String(i+1).padStart(2,'0')}</span>${esc(p.name)}${p.id===playerId?' · YOU':''}</span><b class="coin">${p.coins} ◉</b></div>`).join('');
  $('#status').innerHTML = room.status==='lobby' ? `<span>Invite 1–7 friends with code <strong>${code}</strong></span><span>⏳ Waiting for players</span>` : room.status==='finished' ? `<span>Final score is in</span><strong>GAME OVER</strong>` : `<span>All choices reveal together, then the weather hits.</span><strong>ROUND ${room.round}/6</strong>`;

  const history = room.history || [];
  $('#history-count').textContent = history.length ? `${history.length} / 6 ROUNDS` : 'NO ROUNDS YET';
  $('#history-content').innerHTML = history.length ? history.map(h=>`<section class="history-round"><h3>${h.weatherEvent.icon} Round ${h.round} · ${esc(h.weatherEvent.name)}</h3><div class="history-table-scroll"><table class="history-table"><thead><tr><th>Shopkeeper</th><th>Action</th><th>Start water</th><th>Coins earned</th><th>After actions</th><th>After weather</th><th>Final water</th><th>Running total</th></tr></thead><tbody>${h.players.map(p=>`<tr><td>${esc(p.name)}${p.id===playerId?' · you':''}</td><td>${actionName(p.action)}${p.targetName?` → ${esc(p.targetName)}`:''}${p.automatic?' · auto':''}</td><td>${p.startingWater}/3</td><td>+${p.coinsEarned}</td><td>${p.waterAfterActions}/3</td><td>${p.waterAfterWeather}/3</td><td>${p.finalWater}/3${p.finalWater===3?' · flooded':''}</td><td>${p.runningCoins}</td></tr>`).join('')}</tbody></table></div></section>`).join('') : '<p class="history-empty">Completed rounds will appear here for everyone.</p>';
  if (room.lastResolution) $('#feed').innerHTML = `<div class="feed-line"><b>Round ${room.lastResolution.round} · ${esc(room.lastResolution.weatherEvent.name)}</b></div>${room.lastResolution.resultMessages.map(m=>`<div class="feed-line">${esc(m)}</div>`).join('')}<div class="feed-line">After weather: ${waterSummary(room, room.lastResolution.afterWeather)}</div><div class="feed-line">Final water: ${waterSummary(room, room.lastResolution.afterRain, true)}</div>`;

  const main = $('#main-panel');
  if (room.status === 'lobby') {
    const host = room.hostId === playerId;
    main.innerHTML = `<div class="actions-panel"><h2>Ready for the downpour?</h2><p>Share the room code, then start when everyone’s here.</p><div class="lobby-actions">${host?`<button id="start" class="btn primary" ${room.players.length<2?'disabled':''}>Start the 6 rounds <span>↗</span></button>`:`<span class="share-line">You’re in. The host will start shortly.</span>`}<span class="share-line">${room.players.length<2?'Need at least 2 players.':'Everyone is in!'}</span></div></div>`;
    $('#start')?.addEventListener('click', async()=>{ try { await api('start',{code,playerId}); } catch(e) { alert(e.message); } }); return;
  }
  if (room.phase === 'reveal' && room.lastResolution) {
    choice = null; target = null;
    const reveal = room.lastResolution;
    const actions = reveal.players.map(p=>`<article class="reveal-player ${p.id===playerId?'reveal-you':''}"><span class="reveal-player-name">${p.id===playerId?'You':esc(p.name)}</span><strong>${actionIcon(p.action)} ${actionName(p.action)}</strong>${p.action==='divert'?`<span class="reveal-target">→ ${esc(p.targetName||'neighbor')}</span>`:''}${p.automatic?'<span class="auto-tag">AUTO</span>':''}<small>${p.startingWater}/3 start · +${p.coinsEarned} coins</small></article>`).join('');
    const actionCallouts = reveal.players.map(p=>{
      const who = p.id===playerId ? 'You' : esc(p.name);
      if (p.action==='divert') return `🌊 ${who} diverted water to ${p.targetId===playerId?'you':esc(p.targetName||'a neighbor')}`;
      if (p.action==='big-trade') return `⚡ ${who} BIG TRADE — +${p.coinsEarned} coins`;
      if (p.action==='trade') return `🪙 ${who} Trade — +${p.coinsEarned} coins`;
      return `🧱 ${who} Sandbagged${reveal.weatherEvent.name==='Drainage Break'?' — −2 water':' — −1 water'}`;
    });
    main.innerHTML = `<div class="reveal-panel"><div class="reveal-heading"><span class="reveal-burst">✦</span><div><span class="eyebrow">ROUND ${reveal.round} RESULTS</span><h2>REVEAL!</h2><p>All moves landed at once.</p></div></div><div class="reveal-actions-grid">${actions}</div><div class="reveal-aftermath"><div class="reveal-weather-callout">${weatherCallout(reveal.weatherEvent)}</div><div class="reveal-result-list">${actionCallouts.map(x=>`<div>${x}</div>`).join('')}</div></div><p class="reveal-next">${reveal.round===6?'Final results are next…':'Next round is coming…'}</p></div>`;
    return;
  }
  if (room.status === 'finished') {
    const winners = room.players.filter(p=>room.winnerIds.includes(p.id));
    $('#winner').innerHTML = `<div class="winner-banner"><p class="eyebrow">THE STREETS ARE DRYING</p><h2>${winners.map(p=>esc(p.name)).join(' & ')} ${winners.length===1?'wins':'tie for the win'}!</h2><p>Top score: ${Math.max(...room.players.map(p=>p.coins))} coins. Well played.</p></div>`;
    main.innerHTML = '<div class="actions-panel"><h2>Thanks for playing!</h2><p>Round History is saved above for this game.</p></div>'; return;
  }
  $('#winner').innerHTML = '';
  const locked = !!room.players.find(p=>p.id===playerId)?.locked;
  const preview = choice ? actionPreview(room, playerId, choice, target) : '';
  main.innerHTML = `<div class="actions-panel"><h2>Choose your move</h2><p>${locked?'Your move is locked. The bazaar waits for the other shopkeepers.':'Choices reveal together. Choose before the timer runs out.'}</p><div class="action-grid">
    <button class="action-card ${choice==='trade'?'selected':''}" data-choice="trade" ${locked?'disabled':''}><span class="action-icon">🪙</span><strong>Trade</strong><small>2 coins at water 0–1, 1 at 2. Weather may boost it.</small></button>
    <button class="action-card ${choice==='sandbag'?'selected':''}" data-choice="sandbag" ${locked?'disabled':''}><span class="action-icon">🧱</span><strong>Sandbag</strong><small>Lower your water by 1. Drainage Break lowers it by 2.</small></button>
    <button class="action-card ${choice==='divert'?'selected':''}" data-choice="divert" ${locked?'disabled':''}><span class="action-icon">🌊</span><strong>Divert</strong><small>Lower yours; raise a chosen neighbor by 1.</small></button>
    <button class="action-card big-trade-card ${choice==='big-trade'?'selected':''}" data-choice="big-trade" ${locked?'disabled':''}><span class="action-icon">⚡</span><strong>Big Trade <span class="risk-label">RISKY</span></strong><small>3 coins at water 0–1, 2 at 2; then +1 water after weather.</small></button>
  </div>${choice==='divert'&&!locked?`<div class="target-row"><span>DIVERT WATER TO</span>${room.players.filter((p,i)=>Math.abs(i-room.players.findIndex(x=>x.id===playerId))===1).map(p=>`<button class="target ${target===p.id?'selected':''}" data-target="${p.id}">${esc(p.name)}</button>`).join('')}</div>`:''}${preview?`<div class="action-preview">${preview}<span class="preview-caveat">Water forecast assumes no other player Diverts to or from these shops this round.</span></div>`:''}<div class="lock-row"><span class="lock-note">${locked?'🔒 Choice locked for this round':choice==='divert'&&!target?'Choose a neighbor to divert toward':choice?'Ready to lock in':'Pick one move'}</span><button class="btn lock-button" id="lock" ${locked||!choice||(choice==='divert'&&!target)?'disabled':''}>Lock choice</button></div></div>`;
  main.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{choice=b.dataset.choice;target=null;paint();});
  main.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{target=b.dataset.target;paint();});
  $('#lock').onclick = async()=>{ try { await api('action',{code,playerId,action:choice,target}); } catch(e) { alert(e.message); } choice=null; target=null; await refresh(); };
}
function actionName(a) { return a==='big-trade'?'Big Trade':a==='trade'?'Trade':a==='sandbag'?'Sandbag':'Divert'; }
function actionIcon(a) { return a==='big-trade'?'⚡':a==='trade'?'🪙':a==='sandbag'?'🧱':'🌊'; }
function weatherCallout(w) {
  const text = {'Normal Rain':'NORMAL RAIN — +1 water','Heavy Rain':'HEAVY RAIN — +2 water','Market Rush':'MARKET RUSH — Trade +1 coin','Overflow':'OVERFLOW — wettest starting shop(s) +1 water','Drainage Break':'DRAINAGE BREAK — Sandbag −2 water','Golden Market':'GOLDEN MARKET — Trade +2 coins'}[w.name] || w.text;
  return `${w.icon} ${text}`;
}
function actionPreview(r, pid, action, targetId) {
  const me = r.players.find(p=>p.id===pid), w = r.weatherEvent; if (!me || !w) return '';
  const maxStart = Math.max(...r.players.map(p=>p.water));
  const overflow = player => w.name==='Overflow' && player.water===maxStart ? 1 : 0;
  const rain = w.name==='Heavy Rain' ? 2 : 1;
  const afterWeather = (player, afterActions) => Math.min(3, afterActions + rain + overflow(player));
  const normalTrade = me.water<=1 ? 2 : me.water===2 ? 1 : 0;
  const payout = normalTrade ? normalTrade + (w.name==='Market Rush'?1:w.name==='Golden Market'?2:0) : 0;
  if (action==='trade') return `<strong>Preview:</strong> +${payout} coins · water ${me.water}/3 → ${afterWeather(me,me.water)}/3 after weather`;
  if (action==='sandbag') { const drop=w.name==='Drainage Break'?2:1, after=Math.max(0,me.water-drop); return `<strong>Preview:</strong> −${drop} water from Sandbag · ${me.water}/3 → ${after}/3 after actions → ${afterWeather(me,after)}/3 after weather`; }
  if (action==='big-trade') { const coins=me.water<=1?3:me.water===2?2:0, weatherWater=afterWeather(me,me.water), final=Math.min(3,weatherWater+1); return `<strong>Preview:</strong> +${coins} coins · risky +1 water after weather · ${me.water}/3 → ${weatherWater}/3 after weather → ${final}/3 final`; }
  if (action==='divert') {
    if (!targetId) return '<strong>Preview:</strong> Choose a neighboring shop to see the water change.';
    const other=r.players.find(p=>p.id===targetId); if (!other) return '';
    const ownAfter=Math.max(0,me.water-1), otherAfter=Math.min(3,other.water+1);
    const ownChange=ownAfter-me.water, otherChange=otherAfter-other.water;
    const signed=n=>n<0?`−${Math.abs(n)}`:`+${n}`;
    return `<strong>Preview:</strong> You ${signed(ownChange)} water → ${esc(other.name)} ${signed(otherChange)} water · after weather: you ${afterWeather(me,ownAfter)}/3, ${esc(other.name)} ${afterWeather(other,otherAfter)}/3`;
  }
  return '';
}

function waterSummary(r, waterById, showFlooded = false) {
  const totals = new Map(), seen = new Map();
  for (const p of r.players) totals.set(p.name, (totals.get(p.name) || 0) + 1);
  return r.players.map(p => {
    const occurrence = (seen.get(p.name) || 0) + 1;
    seen.set(p.name, occurrence);
    const label = totals.get(p.name) > 1 ? `${p.name} (${occurrence})` : p.name;
    const water = waterById?.[p.id];
    return `${esc(label)} ${showFlooded && water === 3 ? 'Flooded' : `${water}/3`}`;
  }).join(' · ');
}

const saved = localStorage.getItem('mm-session');
if (saved) { try { const s=JSON.parse(saved); enter(s.code,s.playerId); } catch { localStorage.removeItem('mm-session'); } }
