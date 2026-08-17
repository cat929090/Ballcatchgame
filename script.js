/* First-person Cursor Throw & Catch — Windows 98 cursor visuals
   Changes:
   - First-person: player 1 is fixed at screen center. Mouse/touch aim controls throw direction (not player position).
   - Windows 98 style cursors: draw retro, high-contrast cursor for both players.
   - Touch still supported (hold to charge, release to throw, tap to catch); on-screen catch button remains for mobile.
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;

// hide system cursor for retro look
document.body.style.cursor = 'none';

const scoreEl = document.getElementById('score');
const instrEl = document.getElementById('instr');

let mode = 'CPU'; // 'CPU' or 'Hotseat'
const modeSelect = document.querySelector('.mode-select');
modeSelect.value = mode;
modeSelect.addEventListener('change', e => { mode = modeSelect.value; resetGame(); });

let mouseAim = { x: W/2, y: H/2 }; // where the player is pointing (screen coords)
let touchActive = false; let touchId = null;

const MAX_CHARGE = 1200; // ms
const MIN_THROW_SPEED = 420; // px/s
const MAX_THROW_SPEED = 1400; // px/s
const BALL_RADIUS = 12;

let players = [ null, null ];
let ball = null; // single ball at a time
let scores = [0,0];
let gameOver = false;

// on-screen catch button for mobile
const catchBtn = document.getElementById('catch-btn') || (() => {
  const b = document.createElement('button');
  b.id = 'catch-btn'; b.textContent = 'Catch';
  b.style.display = 'none'; b.style.position = 'fixed'; b.style.right = '18px'; b.style.bottom = '18px';
  b.style.zIndex = 30; b.style.padding = '14px 18px'; b.style.borderRadius = '12px';
  b.style.background = 'rgba(88,182,255,0.95)'; b.style.color = '#002'; b.style.border = 'none';
  b.style.fontWeight = '800'; b.style.boxShadow = '0 8px 20px rgba(2,6,23,0.6)';
  b.addEventListener('click', () => { if (ball && ball.state === 'incoming' && ball.target === 0) catchBall(0); });
  document.body.appendChild(b);
  return b;
})();

// keyboard state for hotseat player
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });

function resize(){ W = canvas.width = innerWidth; H = canvas.height = innerHeight; // keep player1 centered if needed
  if (players && players[0]) { players[0].x = W/2; players[0].y = H/2; }
}
addEventListener('resize', resize);

function now(){ return performance.now(); }

function makePlayers(){
  players[0] = {
    id:0, x: W*0.5, y: H*0.5, // first-person: anchored center
    color:'#000', fill:'#fff', hasBall: true, charging:false, chargeStart:0, recentAims: [], isHuman:true
  };
  players[1] = {
    id:1, x: W*0.8, y: H*0.5, color:'#000', fill:'#fff', hasBall: false, charging:false, chargeStart:0,
    isHuman:(mode==='Hotseat'), aiState:{nextActionAt:0}
  };
}

function spawnBall(fromIdx, speed, curve){
  const from = players[fromIdx];
  let vx=0, vy=0;
  if (fromIdx === 0){
    // direction based on mouseAim relative to center
    const dx = mouseAim.x - from.x; const dy = mouseAim.y - from.y; const len = Math.hypot(dx,dy) || 1;
    vx = (dx/len) * speed; vy = (dy/len) * speed;
  } else {
    // target player 0 (center)
    const target = players[0]; const dx = target.x - from.x; const dy = target.y - from.y; const len = Math.hypot(dx,dy) || 1;
    vx = (dx/len) * speed; vy = (dy/len) * speed;
  }
  ball = {
    x: from.x, y: from.y, vx, vy, r: BALL_RADIUS,
    owner: fromIdx, target: 1 - fromIdx, state: 'outgoing', traveled:0, maxDistance: Math.min(1400, 200 + speed*0.6),
    curve: curve || 0, born: now()
  };
  players[fromIdx].hasBall = false;
  hideCatchButton();
}

// Mouse/touch aim handling
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseAim.x = e.clientX - rect.left; mouseAim.y = e.clientY - rect.top;
  // record recent aim deltas for curve calculation
  const r = players[0].recentAims; r.push({x:mouseAim.x, y:mouseAim.y, t: now()}); if (r.length > 12) r.shift();
});

canvas.addEventListener('mousedown', e => {
  if (gameOver) return; if (!players[0].hasBall) return;
  players[0].charging = true; players[0].chargeStart = now(); players[0].recentAims.length = 0;
});
canvas.addEventListener('mouseup', e => {
  if (!players[0].charging) return; players[0].charging = false; if (!players[0].hasBall) return;
  const dt = Math.min(MAX_CHARGE, now() - players[0].chargeStart); const t = dt / MAX_CHARGE;
  const speed = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED);
  // calculate lateral movement relative to center for curve
  let curve = 0; const rp = players[0].recentAims; if (rp.length >= 2){ const first = rp[0], last = rp[rp.length-1]; const mvx = last.x - first.x; curve = Math.max(-1, Math.min(1, mvx / 200)) * (0.8 + t*1.2); }
  spawnBall(0, speed, curve);
});

// Touch support: touchstart to charge, touchend to release, touchmove to aim
canvas.addEventListener('touchstart', e => {
  if (gameOver) return; e.preventDefault(); const t = e.changedTouches[0]; touchActive = true; touchId = t.identifier;
  const rect = canvas.getBoundingClientRect(); mouseAim.x = t.clientX - rect.left; mouseAim.y = t.clientY - rect.top;
  players[0].recentAims.push({x:mouseAim.x,y:mouseAim.y,t:now()}); if (players[0].recentAims.length>12) players[0].recentAims.shift();
  if (!players[0].hasBall) return; players[0].charging = true; players[0].chargeStart = now();
}, {passive:false});
canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches){ if (t.identifier === touchId){ const rect = canvas.getBoundingClientRect(); mouseAim.x = t.clientX - rect.left; mouseAim.y = t.clientY - rect.top; players[0].recentAims.push({x:mouseAim.x,y:mouseAim.y,t:now()}); if (players[0].recentAims.length>12) players[0].recentAims.shift(); } } }, {passive:false});
canvas.addEventListener('touchend', e => { e.preventDefault(); for (const t of e.changedTouches){ if (t.identifier === touchId){ touchActive = false; touchId = null; if (!players[0].charging) return; players[0].charging = false; if (!players[0].hasBall) return; const dt = Math.min(MAX_CHARGE, now() - players[0].chargeStart); const tt = dt / MAX_CHARGE; const speed = MIN_THROW_SPEED + tt * (MAX_THROW_SPEED - MIN_THROW_SPEED); let curve = 0; const rp = players[0].recentAims; if (rp.length>=2){ const first = rp[0], last = rp[rp.length-1]; const mvx = last.x - first.x; curve = Math.max(-1, Math.min(1, mvx / 200)) * (0.8 + tt*1.2); } spawnBall(0, speed, curve); } } }, {passive:false});

// clicking/tapping to catch for player1: if incoming and near center
canvas.addEventListener('click', e => { if (!ball) return; if (ball.state !== 'incoming') return; if (ball.target !== 0) return; const rect = canvas.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top; const d = Math.hypot(ball.x - players[0].x, ball.y - players[0].y); if (d <= ball.r + 30) catchBall(0); });

// hotseat controls for player2 unchanged (WASD, ShiftRight to charge, Enter to release, Space to catch)
function hotseatControls(dt){ const p = players[1]; const speed = 380; if (keys['KeyW']) p.y -= speed*dt; if (keys['KeyS']) p.y += speed*dt; if (keys['KeyA']) p.x -= speed*dt; if (keys['KeyD']) p.x += speed*dt; p.x = Math.max(20, Math.min(W-20, p.x)); p.y = Math.max(20, Math.min(H-20, p.y)); if (keys['ShiftRight'] && p.hasBall){ if (!p.charging){ p.charging = true; p.chargeStart = now(); } } else if (p.charging){ if (keys['Enter']){ p.charging = false; const dtc = Math.min(MAX_CHARGE, now() - p.chargeStart); const t = dtc / MAX_CHARGE; const spd = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED); let curve = 0; if (keys['KeyA']) curve = -0.7 * (0.6 + t); if (keys['KeyD']) curve = 0.7 * (0.6 + t); spawnBall(1, spd, curve); } if (!keys['ShiftRight']){ const dtc = Math.min(MAX_CHARGE, now() - p.chargeStart); const t = dtc / MAX_CHARGE; const spd = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED); let curve = 0; if (keys['KeyA']) curve = -0.6*(0.6+t); if (keys['KeyD']) curve = 0.6*(0.6+t); spawnBall(1, spd, curve); p.charging = false; } } if (keys['Space'] && ball && ball.state === 'incoming' && ball.target === 1){ const d = Math.hypot(ball.x - p.x, ball.y - p.y); if (d <= ball.r + 30){ catchBall(1); } } }

// simple CPU AI
function aiUpdate(dt){ const ai = players[1]; if (!ai.isHuman){ if (ball && ball.state === 'incoming' && ball.target === 1){ const px = ball.x, py = ball.y; const dx = px - ai.x; const dy = py - ai.y; const dist = Math.hypot(dx,dy)||1; const moveSpeed = 420; ai.x += (dx/dist) * Math.min(moveSpeed*dt, dist); ai.y += (dy/dist) * Math.min(moveSpeed*dt, dist); if (Math.hypot(ball.x - ai.x, ball.y - ai.y) <= ball.r + 18){ catchBall(1); } } else if (ai.hasBall){ if (now() > ai.aiState.nextActionAt){ const chargeDur = 300 + Math.random()*700; ai.aiState.nextActionAt = now() + 1000 + Math.random()*800; setTimeout(()=>{ if (!ai.hasBall) return; const t = Math.min(1, Math.random()*0.95 + 0.1); const spd = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED); const curve = (Math.random()-0.5) * (0.6 + t*1.2); spawnBall(1, spd, curve); }, chargeDur); } } else { const cx = W*0.8, cy = H/2; ai.x += (cx - ai.x) * Math.min(1, dt*1.4); ai.y += (cy - ai.y) * Math.min(1, dt*1.4); } ai.x = Math.max(20, Math.min(W-20, ai.x)); ai.y = Math.max(20, Math.min(H-20, ai.y)); } }

function catchBall(playerIdx){ players[playerIdx].hasBall = true; scores[playerIdx] += 1; updateScore(); ball = null; hideCatchButton(); }
function updateScore(){ scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

function applyCurve(b, dt){ if (!b || Math.abs(b.curve) < 0.001) return; const speed = Math.hypot(b.vx, b.vy) || 1; const nx = b.vx / speed; const ny = b.vy / speed; const px = -ny; const py = nx; const curveStrength = 600; const age = (now() - b.born) / 1000; const fade = Math.max(0.2, 1 - age*0.5); const ax = px * (b.curve * curveStrength * fade); const ay = py * (b.curve * curveStrength * fade); b.vx += ax * dt; b.vy += ay * dt; }

let lastFrame = now();
function loop(){ const t = now(); const dt = Math.min(40, t - lastFrame) / 1000; lastFrame = t; if (mode === 'Hotseat') hotseatControls(dt); if (mode === 'CPU') aiUpdate(dt);
  if (ball){ if (ball.state === 'outgoing'){ applyCurve(ball, dt); ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.traveled += Math.hypot(ball.vx*dt, ball.vy*dt); const target = players[ball.target]; const d = Math.hypot(ball.x - target.x, ball.y - target.y); if (d <= 120 || ball.traveled >= ball.maxDistance){ ball.state = 'incoming'; if (ball.target === 0 && isTouchDevice()){ showCatchButton(); } } } else if (ball.state === 'incoming'){ const target = players[ball.target]; const dx = target.x - ball.x; const dy = target.y - ball.y; const dist = Math.hypot(dx,dy)||1; const steerStrength = 200; ball.vx += (dx/dist) * steerStrength * dt; ball.vy += (dy/dist) * steerStrength * dt; applyCurve(ball, dt); ball.x += ball.vx * dt; ball.y += ball.vy * dt; if (dist <= ball.r + 8){ scores[ball.owner] += 1; players[ball.owner].hasBall = true; updateScore(); ball = null; hideCatchButton(); } } }
  draw(); if (!gameOver) requestAnimationFrame(loop); }

// draw a Windows 98 style pixel cursor using a small pixel map scaled up
function drawWin98Cursor(x,y,scale, fill, stroke){
  // simple 12x16 pixel arrow map (1 = filled pixel)
  const map = [
    '100000000000',
    '110000000000',
    '111000000000',
    '111100000000',
    '111110000000',
    '111111000000',
    '111111100000',
    '111111110000',
    '111111100000',
    '111110010000',
    '111100011000',
    '111000001100',
    '110000000110',
    '100000000011',
    '000000000001',
    '000000000000'
  ];
  const s = scale;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  // draw shadow offset 1px
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let row=0; row<map.length; row++){
    for (let col=0; col<map[row].length; col++){
      if (map[row][col] === '1') ctx.fillRect(x + (col-2)*s + s, y + (row-8)*s + s, s, s);
    }
  }
  // draw outline (black) and fill (white) by first drawing black, then smaller white
  ctx.fillStyle = stroke; for (let row=0; row<map.length; row++){ for (let col=0; col<map[row].length; col++){ if (map[row][col] === '1') ctx.fillRect(x + (col-2)*s, y + (row-8)*s, s, s); } }
  ctx.fillStyle = fill; // inner 1px inset to simulate white interior
  for (let row=0; row<map.length; row++){ for (let col=0; col<map[row].length; col++){ if (map[row][col] === '1'){
        // draw smaller white pixel to create outline effect
        ctx.fillRect(x + (col-2)*s + 1, y + (row-8)*s + 1, Math.max(0,s-2), Math.max(0,s-2));
      } } }
  ctx.restore();
}

function draw(){ ctx.clearRect(0,0,W,H); ctx.fillStyle = '#07111a'; ctx.fillRect(0,0,W,H);
  // draw opponent
  const p = players[1]; if (p){ drawWin98Cursor(p.x, p.y, 2, p.fill || '#ffd', p.color || '#000'); ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.arc(p.x,p.y,28,0,Math.PI*2); ctx.stroke(); if (p.hasBall){ ctx.beginPath(); ctx.fillStyle='#ffd47a'; ctx.arc(p.x+26,p.y-12,10,0,Math.PI*2); ctx.fill(); } }
  // draw ball
  if (ball){ ctx.beginPath(); ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.ellipse(ball.x+6, ball.y+8, ball.r*0.9, ball.r*0.45, 0,0,2*Math.PI); ctx.fill(); ctx.fillStyle = ball.state==='outgoing'? '#ff9d58' : '#58ffb4'; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,0.22)'; ctx.arc(ball.x-4, ball.y-6, ball.r*0.35,0,Math.PI*2); ctx.fill(); }
  // draw center Win98 cursor (player1) with larger scale
  const center = players[0]; drawWin98Cursor(center.x, center.y, 3, center.fill || '#fff', center.color || '#000');
  // draw charge arc
  if (center.charging && center.hasBall){ const dt = Math.min(MAX_CHARGE, now() - center.chargeStart); const t = dt / MAX_CHARGE; const ang = Math.PI*2 * t; ctx.beginPath(); ctx.strokeStyle = 'rgba(88,182,255,0.95)'; ctx.lineWidth = 4; ctx.arc(center.x, center.y, 44, -Math.PI/2, -Math.PI/2 + ang); ctx.stroke(); }
  // HUD area subtle
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(8, H-60, 260, 48);
}

function showCatchButton(){ if (!isTouchDevice()) return; catchBtn.style.display = 'block'; }
function hideCatchButton(){ catchBtn.style.display = 'none'; }
function isTouchDevice(){ return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

function endGame(){ gameOver = true; }

function resetGame(){ makePlayers(); ball = null; scores = [0,0]; updateScore(); gameOver = false; lastFrame = now(); hideCatchButton(); }

function updateScore(){ scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

// initialization
makePlayers(); let lastFrame = now(); requestAnimationFrame(loop);
