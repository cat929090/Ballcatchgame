/* Enhanced Cursor Throw & Catch with CPU / Hotseat P2 and curve throws
   - Two players: player 1 (mouse) and player 2 (CPU or hotseat keyboard)
   - Hold/click to charge and release to throw to the other player
   - Throws include a curve force (based on lateral movement when charging or randomized for CPU)
   - Opponent must catch while the ball is incoming (click for player1, Space for hotseat player2)
   - Players are drawn as cursors (arrow shape)
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;

const scoreEl = document.getElementById('score');
const instrEl = document.getElementById('instr');

let mode = 'CPU'; // 'CPU' or 'Hotseat'

const modeSelect = document.createElement('select');
modeSelect.className = 'mode-select';
modeSelect.innerHTML = `<option value="CPU">CPU</option><option value="Hotseat">Hotseat (keyboard)</option>`;
document.querySelector('#hud').appendChild(modeSelect);
modeSelect.addEventListener('change', e=>{ mode = modeSelect.value; resetGame(); });

// info panel for hotseat controls
const info = document.createElement('div');
info.className = 'info-panel';
info.innerHTML = `<div style="font-weight:800;margin-bottom:6px">Controls</div>
<div class="instructions">
- Player 1 (you): Move with mouse. Hold left mouse to charge, release to throw. Click incoming ball to catch.
- Player 2 (Hotseat): Move with WASD. Hold Right Shift to charge, press Enter to release. Press Space to catch incoming ball.
- In CPU mode player 2 is controlled by AI that tries to catch and throws back.
</div>`;
document.body.appendChild(info);

let mouse = { x: W/2, y: H/2 };
let charging = false;
let chargeStart = 0;
let recentPositions = [];
const RECENT_MAX = 10;

const MAX_CHARGE = 1200; // ms
const MIN_THROW_SPEED = 400; // px/s
const MAX_THROW_SPEED = 1400; // px/s
const BALL_RADIUS = 12;

let players = [ null, null ];
let ball = null; // single ball at a time for simplicity
let scores = [0,0];
let gameOver = false;

// keyboard state for hotseat player
const keys = {};
addEventListener('keydown', e=>{ keys[e.code] = true; });
addEventListener('keyup', e=>{ keys[e.code] = false; });

function resize(){ W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
addEventListener('resize', resize);

function now(){ return performance.now(); }

function makePlayers(){
  players[0] = {
    id:0, x: W*0.25, y: H/2, color:'#58b6ff', cursorColor:'#bff0ff',
    hasBall: true, charging:false, chargeStart:0, recentPositions:[],
    catchKey:'Mouse', isHuman:true
  };
  players[1] = {
    id:1, x: W*0.75, y: H/2, color:'#ff9d58', cursorColor:'#ffddc2',
    hasBall: false, charging:false, chargeStart:0, recentPositions:[],
    catchKey:(mode==='Hotseat'?'Space':'CPU'), isHuman:(mode==='Hotseat') , aiState:{nextActionAt:0}
  };
}

function spawnBall(fromIdx, speed, curve){
  const from = players[fromIdx];
  const toIdx = 1 - fromIdx;
  const target = players[toIdx];
  // direction to target's current position
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx,dy) || 1;
  const vx = (dx/len) * speed;
  const vy = (dy/len) * speed;
  ball = {
    x: from.x, y: from.y, vx, vy, r: BALL_RADIUS,
    owner: fromIdx, target: toIdx, state: 'outgoing', traveled:0, maxDistance: Math.min(1200, 200 + speed*0.6),
    curve: curve || 0, // positive -> curve right relative to velocity, negative -> left
    born: now()
  };
  players[fromIdx].hasBall = false;
}

// mouse controls for player1
canvas.addEventListener('mousemove', e=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
  players[0].x = mouse.x; players[0].y = mouse.y;
  players[0].recentPositions.push({x:mouse.x,y:mouse.y});
  if (players[0].recentPositions.length>RECENT_MAX) players[0].recentPositions.shift();
});

canvas.addEventListener('mousedown', e=>{
  if (gameOver) return;
  // only allow throw if player has ball
  if (!players[0].hasBall) return;
  players[0].charging = true; players[0].chargeStart = now();
});
canvas.addEventListener('mouseup', e=>{
  if (!players[0].charging) return;
  players[0].charging = false;
  if (!players[0].hasBall) return;
  const dt = Math.min(MAX_CHARGE, now() - players[0].chargeStart);
  const t = dt / MAX_CHARGE;
  const speed = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED);
  // compute lateral motion during charge to set curve
  let curve = 0;
  const rp = players[0].recentPositions;
  if (rp.length>=2){
    const first = rp[0], last = rp[rp.length-1];
    const mvx = last.x - first.x;
    // map lateral motion to curve [-1,1]
    curve = Math.max(-1, Math.min(1, mvx / 200)) * (0.8 + t*1.2);
  }
  spawnBall(0, speed, curve);
});

// clicking to catch for player1
canvas.addEventListener('click', e=>{
  if (!ball) return;
  if (ball.state !== 'incoming') return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left; const cy = e.clientY - rect.top;
  const target = players[ball.target];
  // only clicks near the player1 cursor and if target is player1
  if (ball.target !== 0) return;
  const d = Math.hypot(ball.x - target.x, ball.y - target.y);
  if (d <= ball.r + 20){
    // caught
    catchBall(ball.target);
  }
});

// hotseat controls for player2
function hotseatControls(dt){
  const p = players[1];
  const speed = 380; // keyboard move speed px/s
  if (keys['KeyW']) p.y -= speed*dt;
  if (keys['KeyS']) p.y += speed*dt;
  if (keys['KeyA']) p.x -= speed*dt;
  if (keys['KeyD']) p.x += speed*dt;
  p.x = Math.max(20, Math.min(W-20, p.x));
  p.y = Math.max(20, Math.min(H-20, p.y));
  // charge with RightShift
  if (keys['ShiftRight'] && p.hasBall){
    if (!p.charging){ p.charging = true; p.chargeStart = now(); }
  } else if (p.charging){
    // release with Enter
    if (keys['Enter']){
      p.charging = false;
      const dtc = Math.min(MAX_CHARGE, now() - p.chargeStart);
      const t = dtc / MAX_CHARGE;
      const spd = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED);
      // curve based on left/right keys during charge
      let curve = 0;
      if (keys['KeyA']) curve = -0.7 * (0.6 + t);
      if (keys['KeyD']) curve = 0.7 * (0.6 + t);
      spawnBall(1, spd, curve);
    }
    // or releasing Shift without Enter will also throw (convenience)
    if (!keys['ShiftRight']){
      const dtc = Math.min(MAX_CHARGE, now() - p.chargeStart);
      const t = dtc / MAX_CHARGE;
      const spd = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED);
      let curve = 0; if (keys['KeyA']) curve = -0.6*(0.6+t); if (keys['KeyD']) curve = 0.6*(0.6+t);
      spawnBall(1, spd, curve);
      p.charging = false;
    }
  }
  // catch with Space
  if (keys['Space'] && ball && ball.state === 'incoming' && ball.target === 1){
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d <= ball.r + 20){ catchBall(1); }
  }
}

// CPU AI simple
function aiUpdate(dt){
  const ai = players[1];
  // movement: follow an orbit around center or track ball when incoming
  if (!ai.isHuman){
    if (ball && ball.state === 'incoming' && ball.target === 1){
      // move toward predicted intercept point
      const px = ball.x, py = ball.y; const vx = ball.vx, vy = ball.vy;
      // simple prediction: move toward current ball position with some speed
      const dx = px - ai.x; const dy = py - ai.y; const dist = Math.hypot(dx,dy)||1;
      const moveSpeed = 420;
      ai.x += (dx/dist) * Math.min(moveSpeed*dt, dist);
      ai.y += (dy/dist) * Math.min(moveSpeed*dt, dist);
      // attempt to catch with a reaction delay
      const timeUntilArrival = dist / (Math.hypot(ball.vx, ball.vy)||1);
      const shouldCatch = Math.random() < 0.95; // high skill
      if (shouldCatch && Math.random() > 0.995){} // tiny randomness
      // auto-catch when close
      if (Math.hypot(ball.x - ai.x, ball.y - ai.y) <= ball.r + 18){ catchBall(1); }
    } else if (ai.hasBall){
      // decide when to throw back: random cooldown
      if (now() > ai.aiState.nextActionAt){
        const chargeDur = 300 + Math.random()*700;
        // schedule throw after chargeDur
        ai.aiState.nextActionAt = now() + 1000 + Math.random()*800;
        // perform throw now with a small delay using setTimeout
        setTimeout(()=>{
          if (!ai.hasBall) return;
          const t = Math.min(1, Math.random()*0.95 + 0.1);
          const spd = MIN_THROW_SPEED + t * (MAX_THROW_SPEED - MIN_THROW_SPEED);
          const curve = (Math.random()-0.5) * (0.6 + t*1.2);
          spawnBall(1, spd, curve);
        }, chargeDur);
      }
    } else {
      // roam
      const cx = W*0.75, cy = H/2;
      ai.x += (cx - ai.x) * Math.min(1, dt*1.4);
      ai.y += (cy - ai.y) * Math.min(1, dt*1.4);
    }
    // bounds
    ai.x = Math.max(20, Math.min(W-20, ai.x)); ai.y = Math.max(20, Math.min(H-20, ai.y));
  }
}

function catchBall(playerIdx){
  // catcher gets possession
  players[playerIdx].hasBall = true;
  // award a point to catcher? We can award score on successful catch
  scores[playerIdx] += 1;
  updateScore();
  ball = null;
}

function updateScore(){ scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

function applyCurve(b, dt){
  if (!b || Math.abs(b.curve) < 0.001) return;
  // apply lateral acceleration perpendicular to velocity direction
  const speed = Math.hypot(b.vx, b.vy) || 1;
  // normalize velocity
  const nx = b.vx / speed; const ny = b.vy / speed;
  // perpendicular vector
  const px = -ny; const py = nx;
  // curve magnitude (tunable)
  const curveStrength = 600; // px/s^2 base
  // make curve fade over time slightly
  const age = (now() - b.born) / 1000;
  const fade = Math.max(0.2, 1 - age*0.5);
  const ax = px * (b.curve * curveStrength * fade);
  const ay = py * (b.curve * curveStrength * fade);
  b.vx += ax * dt; b.vy += ay * dt;
}

let lastFrame = now();
function loop(){
  const t = now();
  const dt = Math.min(40, t - lastFrame) / 1000; lastFrame = t;

  // hotseat input update
  if (mode === 'Hotseat') hotseatControls(dt);

  // AI update
  if (mode === 'CPU') aiUpdate(dt);

  // update ball
  if (ball){
    if (ball.state === 'outgoing'){
      applyCurve(ball, dt);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      ball.traveled += Math.hypot(ball.vx*dt, ball.vy*dt);
      // if close to target, flip to incoming state
      const target = players[ball.target];
      const d = Math.hypot(ball.x - target.x, ball.y - target.y);
      if (d <= 120 || ball.traveled >= ball.maxDistance){
        ball.state = 'incoming';
      }
    } else if (ball.state === 'incoming'){
      // homing slightly to target's current position
      const target = players[ball.target];
      const dx = target.x - ball.x; const dy = target.y - ball.y; const dist = Math.hypot(dx,dy)||1;
      // steer toward target
      const steerStrength = 200; // pixels/s^2
      ball.vx += (dx/dist) * steerStrength * dt; ball.vy += (dy/dist) * steerStrength * dt;
      applyCurve(ball, dt);
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      // check if reaches target (uncaught)
      if (dist <= ball.r + 8){
        // uncaught: award point to thrower, possession returns to thrower
        scores[ball.owner] += 1;
        players[ball.owner].hasBall = true;
        updateScore();
        ball = null;
      }
    }
  }

  // draw
  draw();
  if (!gameOver) requestAnimationFrame(loop);
}

function drawCursor(x,y,color,outline){
  ctx.save(); ctx.translate(x,y);
  ctx.rotate(Math.atan2(0,1));
  // draw arrow cursor (triangle + tail)
  ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(6,0); ctx.lineTo(2,0); ctx.lineTo(12,14); ctx.lineTo(8,16); ctx.lineTo(-4,2); ctx.lineTo(-10,2); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = outline; ctx.stroke();
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = '#07111a'; ctx.fillRect(0,0,W,H);

  // center line
  ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();

  // draw players
  for (const p of players){
    drawCursor(p.x, p.y, p.cursorColor, p.color);
    // draw a subtle circle indicating catch zone
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.arc(p.x,p.y,24,0,Math.PI*2); ctx.stroke();
    if (p.hasBall){
      // small ball attached
      ctx.beginPath(); ctx.fillStyle = '#ffd47a'; ctx.arc(p.x+18, p.y-10, 8,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.arc(p.x+18, p.y-10, 8,0,Math.PI*2); ctx.stroke();
    }
  }

  // draw ball
  if (ball){
    // shadow
    ctx.beginPath(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.ellipse(ball.x+6, ball.y+8, ball.r*0.9, ball.r*0.45, 0, 0, 2*Math.PI); ctx.fill();
    ctx.fillStyle = ball.state==='outgoing'? '#ff9d58' : '#58ffb4';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.arc(ball.x-4, ball.y-6, ball.r*0.35, 0, Math.PI*2); ctx.fill();
    // draw a little trail showing curve
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x - ball.vx*0.02, ball.y - ball.vy*0.02); ctx.stroke();
  }

  // draw charge arc for human if charging and has ball
  const p0 = players[0];
  if (p0.charging && p0.hasBall){
    const dt = Math.min(MAX_CHARGE, now() - p0.chargeStart);
    const t = dt / MAX_CHARGE; const ang = Math.PI*2 * t;
    ctx.beginPath(); ctx.strokeStyle = 'rgba(88,182,255,0.95)'; ctx.lineWidth = 4; ctx.arc(p0.x, p0.y, 26, -Math.PI/2, -Math.PI/2 + ang); ctx.stroke();
  }

  // draw HUD score
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(8, H-60, 260, 48);
}

function endGame(){ gameOver = true; }

function resetGame(){
  makePlayers(); ball = null; scores = [0,0]; updateScore(); gameOver = false; lastFrame = now();
}

// initial
resetGame(); requestAnimationFrame(loop);
