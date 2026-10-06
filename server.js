const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 4173);
const REVEAL_MS = 1700;
const rooms = new Map();
const root = __dirname;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const WEATHER = [
  { name: 'Normal Rain', icon: '🌧️', text: 'Everyone gets +1 water.' },
  { name: 'Heavy Rain', icon: '⛈️', text: 'Everyone gets +2 water.' },
  { name: 'Market Rush', icon: '🛍️', text: 'Trade earns +1 coin this round.' },
  { name: 'Overflow', icon: '🌊', text: 'After normal rain, the wettest starting shop(s) get +1 water.' },
  { name: 'Drainage Break', icon: '🧱', text: 'Sandbag lowers water by 2 this round.' },
  { name: 'Golden Market', icon: '✨', text: 'Trade earns +2 coins this round.' }
];
function nextRound(room) { room.phase = 'choosing'; room.weather = WEATHER[crypto.randomInt(WEATHER.length)]; room.deadline = Date.now() + 25000; }
function finishReveal(room) {
  if (room.phase !== 'reveal' || Date.now() < room.revealUntil) return;
  if (room.round >= 6) {
    room.status = 'finished'; room.phase = 'finished';
    const high = Math.max(...room.players.map(p => p.coins)); room.winnerIds = room.players.filter(p => p.coins === high).map(p => p.id);
  } else { room.round += 1; nextRound(room); }
}

function code() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function publicRoom(room) {
  return { code: room.code, hostId: room.hostId, status: room.status, phase: room.phase || room.status, round: room.round, maxRounds: 6,
    players: room.players.map(p => ({ id: p.id, name: p.name, water: p.water, coins: p.coins, connected: Date.now() - p.seen < 25000, locked: !!room.actions[p.id] })),
    secondsLeft: room.status === 'playing' && room.phase === 'choosing' ? Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)) : null,
    revealMsRemaining: room.phase === 'reveal' ? Math.max(0, room.revealUntil - Date.now()) : 0,
    weatherEvent: room.weather || null, lastResolution: room.lastResolution, history: room.history || [], winnerIds: room.winnerIds || [] };
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); }
async function body(req) { let s = ''; for await (const c of req) s += c; try { return JSON.parse(s || '{}'); } catch { return {}; } }
function resolve(room, timedOut = false) {
  if (room.status !== 'playing') return;
  const actions = { ...room.actions };
  for (const p of room.players) if (!actions[p.id]) actions[p.id] = { type: 'sandbag', target: null, automatic: true };
  const weather = room.weather || WEATHER[0];
  const start = Object.fromEntries(room.players.map(p => [p.id, p.water]));
  const coinsAtStart = Object.fromEntries(room.players.map(p => [p.id, p.coins]));
  const coinsEarned = Object.fromEntries(room.players.map(p => [p.id, 0]));
  const deltas = Object.fromEntries(room.players.map(p => [p.id, 0]));
  const trades = [], resultMessages = [`${weather.icon} ${weather.name}!`];
  const tradeBonus = weather.name === 'Market Rush' ? 1 : weather.name === 'Golden Market' ? 2 : 0;
  const highestStartingWater = Math.max(...room.players.map(p => start[p.id]));
  for (const p of room.players) {
    const a = actions[p.id];
    if (a.type === 'trade') { const base = start[p.id] <= 1 ? 2 : start[p.id] === 2 ? 1 : 0; const gain = base ? base + tradeBonus : 0; p.coins += gain; coinsEarned[p.id] = gain; trades.push({ id: p.id, name: p.name, gain, water: start[p.id] }); if (gain) resultMessages.push(`🪙 ${p.name} earned ${gain} coin${gain===1?'':'s'} from Trade!`); }
    if (a.type === 'big-trade') { const gain = start[p.id] <= 1 ? 3 : start[p.id] === 2 ? 2 : 0; p.coins += gain; coinsEarned[p.id] = gain; trades.push({ id: p.id, name: p.name, gain, water: start[p.id], action: 'big-trade' }); if (gain) resultMessages.push(`🪙 ${p.name} earned ${gain} coin${gain===1?'':'s'} from Big Trade!`); }
    if (a.type === 'sandbag') deltas[p.id] -= weather.name === 'Drainage Break' ? 2 : 1;
    if (a.type === 'divert') { deltas[p.id] -= 1; if (deltas[a.target] !== undefined) { deltas[a.target] += 1; const targetPlayer = room.players.find(t => t.id === a.target); resultMessages.push(`🌊 ${p.name} diverted water to ${targetPlayer.name}!`); } }
  }
  for (const p of room.players) p.water = Math.max(0, Math.min(3, start[p.id] + deltas[p.id]));
  const afterActions = Object.fromEntries(room.players.map(p => [p.id, p.water]));
  const waterAfterActions = Object.fromEntries(room.players.map(p => [p.id, p.water]));
  const rain = weather.name === 'Heavy Rain' ? 2 : 1;
  for (const p of room.players) {
    const overflow = weather.name === 'Overflow' && start[p.id] === highestStartingWater ? 1 : 0;
    p.water = Math.min(3, p.water + rain + overflow);
  }
  const waterAfterWeather = Object.fromEntries(room.players.map(p => [p.id, p.water]));
  for (const p of room.players) if (actions[p.id].type === 'big-trade') p.water = Math.min(3, p.water + 1);
  const finalWater = Object.fromEntries(room.players.map(p => [p.id, p.water]));
  const playerResults = room.players.map(p => ({ id: p.id, name: p.name, action: actions[p.id].type,
    targetId: actions[p.id].target || null,
    targetName: actions[p.id].target ? room.players.find(t => t.id === actions[p.id].target)?.name || null : null,
    coinsEarned: coinsEarned[p.id], startingWater: start[p.id], waterAfterActions: waterAfterActions[p.id],
    waterAfterWeather: waterAfterWeather[p.id], finalWater: finalWater[p.id], automatic: !!actions[p.id].automatic }));
  room.lastResolution = { round: room.round, weatherEvent: weather, trades, players: playerResults, afterActions, afterWeather: Object.fromEntries(room.players.map(p => [p.id, waterAfterWeather[p.id]])), afterRain: Object.fromEntries(room.players.map(p => [p.id, p.water])), resultMessages, timedOut, revealStartedAt: Date.now() };
  room.history.push({ round: room.round, weatherEvent: weather, players: room.players.map(p => ({ id: p.id, name: p.name,
    action: actions[p.id].type, targetName: actions[p.id].target ? room.players.find(t => t.id === actions[p.id].target)?.name || null : null,
    automatic: !!actions[p.id].automatic, startingWater: start[p.id], coinsEarned: coinsEarned[p.id],
    waterAfterActions: waterAfterActions[p.id], waterAfterWeather: waterAfterWeather[p.id], finalWater: finalWater[p.id],
    runningCoins: p.coins, coinsAtStart: coinsAtStart[p.id] })) });
  room.actions = {}; room.phase = 'reveal'; room.revealUntil = Date.now() + REVEAL_MS;
  setTimeout(() => finishReveal(room), REVEAL_MS);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    const b = await body(req); let room = rooms.get(String(b.code || url.searchParams.get('code') || '').toUpperCase());
    if (url.pathname === '/api/create' && req.method === 'POST') {
      if (!b.name?.trim()) return send(res, 400, { error: 'Add your shopkeeper name first.' });
      let id = code(); while (rooms.has(id)) id = code();
      const pid = crypto.randomUUID(); room = { code: id, hostId: pid, status: 'lobby', phase: 'lobby', round: 1, deadline: 0, players: [{ id: pid, name: b.name.trim().slice(0, 18), water: 0, coins: 0, seen: Date.now() }], actions: {}, lastResolution: null, history: [], winnerIds: [] }; rooms.set(id, room);
      return send(res, 200, { room: publicRoom(room), playerId: pid });
    }
    if (url.pathname === '/api/join' && req.method === 'POST') {
      if (!room) return send(res, 404, { error: 'Room code not found. Check it and try again.' });
      if (room.status !== 'lobby') return send(res, 409, { error: 'This bazaar has already started. Join the next game.' });
      if (room.players.length >= 8) return send(res, 409, { error: 'This room is full (8 players).' });
      if (!b.name?.trim()) return send(res, 400, { error: 'Add your shopkeeper name first.' });
      const pid = crypto.randomUUID(); room.players.push({ id: pid, name: b.name.trim().slice(0, 18), water: 0, coins: 0, seen: Date.now() });
      return send(res, 200, { room: publicRoom(room), playerId: pid });
    }
    if (!room) return send(res, 404, { error: 'Room not found.' });
    const player = room.players.find(p => p.id === b.playerId || p.id === url.searchParams.get('playerId'));
    if (url.pathname === '/api/state' && req.method === 'GET') { if (player) player.seen = Date.now(); if (room.phase === 'reveal' && Date.now() >= room.revealUntil) finishReveal(room); else if (room.status === 'playing' && room.phase === 'choosing' && Date.now() >= room.deadline) resolve(room, true); return send(res, 200, { room: publicRoom(room), playerId: player?.id || null }); }
    if (!player) return send(res, 403, { error: 'Your shopkeeper session was not found in this room.' });
    player.seen = Date.now();
    if (url.pathname === '/api/start' && req.method === 'POST') {
      if (player.id !== room.hostId) return send(res, 403, { error: 'Only the room host can start the game.' });
      if (room.status !== 'lobby') return send(res, 409, { error: 'Game already started.' });
      if (room.players.length < 2) return send(res, 409, { error: 'Invite at least one more shopkeeper to start.' });
      room.status = 'playing'; room.round = 1; nextRound(room); return send(res, 200, { room: publicRoom(room) });
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      if (room.status !== 'playing' || room.phase !== 'choosing') return send(res, 409, { error: 'The game is not accepting actions right now.' });
      if (!['trade', 'sandbag', 'divert', 'big-trade'].includes(b.action)) return send(res, 400, { error: 'Choose Trade, Sandbag, Divert, or Big Trade.' });
      if (room.actions[player.id]) return send(res, 409, { error: 'Your choice is already locked in.' });
      if (b.action === 'divert') {
        const idx = room.players.findIndex(p => p.id === player.id), ti = room.players.findIndex(p => p.id === b.target);
        if (ti < 0 || Math.abs(ti - idx) !== 1) return send(res, 400, { error: 'Choose one of the neighboring shops.' });
      }
      room.actions[player.id] = { type: b.action, target: b.target || null };
      if (room.players.every(p => room.actions[p.id])) resolve(room);
      return send(res, 200, { room: publicRoom(room) });
    }
    return send(res, 404, { error: 'Unknown request.' });
  }
  const file = path.join(root, url.pathname === '/' ? 'index.html' : path.basename(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
server.listen(PORT, '0.0.0.0', () => console.log(`Monsoon Mayhem is running on http://localhost:${PORT}`));

