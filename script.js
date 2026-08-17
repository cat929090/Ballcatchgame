/* gameplay + skins + start menu integration (v9)
   - True first-person 3D-ish throws using simple pinhole projection
   - Taps/screen aim define the target area (left/right/up) on a forward plane
   - Ball has world {x,y,z} and velocity {vx,vy,vz}; gravity applied to vy
   - Player is camera at world origin; opponent lives in world coords in front
   - Pointer-lock aiming supported; touch/absolute fallback supported
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;

document.body.style.cursor = 'none';
const scoreEl = document.getElementById('score');
const instrEl = document.getElementById('instr');

// skins: cursor fill and ball color
const SKINS = [
  {name:'Classic', cursor:'#ffffff', ball:'#ff2b2b'},
  {name:'Neon', cursor:'#8cf6ff', ball:'#ff6ad5'},
  {name:'Lime', cursor:'#b8ff6a', ball:'#ffb86a'},
  {name:'Gold', cursor:'#ffd36a', ball:'#9b6aff'}
];
let selectedSkin = (typeof window.__selectedSkin === 'number') ? window.__selectedSkin : 0;
let currentBallColor = SKINS[selectedSkin].ball;

// world / camera parameters
const FOCAL = 900; // focal length for projection
const GRAVITY = 2200; // px/s^2 (pulls down on world y)

// gameplay state
let players = [null, null]; // players[].world = {x,y,z}
let ball = null; // ball.world {x,y,z} and v{vx,vy,vz}
let scores = [0,0];
let gameOver = false;
let gameStarted = false;
let mode = (typeof window.__mode === 'string') ? window.__mode : 'CPU';

// aiming state
let aimAngle = 0; // rotation around Y (radians)
let usingPointerLock = false;
const AIM_SENSITIVITY = 0.0028;
let mouseAbs = {x: W/2, y: H/2};

// UI
const catchBtn = document.getElementById('catch-btn') || (()=>{const b=document.createElement('button');b.id='catch-btn';b.textContent='Catch';b.style.display='none';document.body.appendChild(b);return b;})();
catchBtn.addEventListener('click', ()=>{ if(ball && ball.state==='incoming' && ball.target===0) catchBall(0); });

const MAX_CHARGE = 1200, MIN_THROW_SPEED = 420, MAX_THROW_SPEED = 1600; // speeds in px/s
const BASE_BALL_RADIUS = 12;

const keys = {}; addEventListener('keydown', e=>keys[e.code]=true); addEventListener('keyup', e=>keys[e.code]=false);
addEventListener('resize', ()=>{ W=canvas.width=innerWidth; H=canvas.height=innerHeight; });
function now(){ return performance.now(); }

function makePlayers(){
  // player is camera at origin (world coords 0,0,0). Player keeps no visible avatar.
  players[0] = { id:0, world:{x:0,y:0,z:0}, fill:SKINS[selectedSkin].cursor, hasBall:true, charging:false, chargeStart:0, recentAims:[], isHuman:true };
  // opponent starts a bit to the right and far forward
  players[1] = { id:1, world:{x:220, y:0, z:900}, fill:SKINS[selectedSkin].cursor, hasBall:false, aiState:{nextActionAt:0}, isHuman:(mode==='Hotseat') };
  updateScore();
}

function requestPointerLock(){ try{ if(canvas.requestPointerLock) canvas.requestPointerLock(); }catch(e){} }

function startGame(){ if(gameStarted) return; if(typeof window.__selectedSkin==='number'){ selectedSkin=window.__selectedSkin; currentBallColor=SKINS[selectedSkin].ball; } if(typeof window.__mode==='string') mode=window.__mode; const startMenu=document.getElementById('start-menu'); if(startMenu) startMenu.style.display='none'; requestPointerLock(); gameStarted=true; resetGame(); lastFrame=now(); requestAnimationFrame(loop); }
window.startGame = startGame;

document.addEventListener('pointerlockchange', ()=>{ usingPointerLock = (document.pointerLockElement === canvas); });

function resetGame(){ makePlayers(); ball=null; scores=[0,0]; updateScore(); gameOver=false; hideCatchButton(); }

// Helper: project a world point {x,y,z} (camera at 0,0,0 looking +z) to screen
function project(world){
  const cx = W/2, cy = H/2;
  const z = world.z;
  if (z <= 10) return null; // behind or too close
  const sx = cx + (world.x) * (FOCAL / (z + FOCAL));
  const sy = cy - (world.y) * (FOCAL / (z + FOCAL));
  const scale = (FOCAL / (z + FOCAL));
  const r = Math.max(2, BASE_BALL_RADIUS * scale * 1.0);
  return { x: sx, y: sy, z: z, scale, r };
}

// spawnBall: from world coords. fromIdx 0 = player (camera); 1 = opponent
function spawnBall(fromIdx, speed, curve){
  const from = players[fromIdx]; if(!from) return;
  if (fromIdx === 0){
    // map screen tap (mouseAbs) to a world target on a forward plane
    const cx = W / 2, cy = H / 2;
    // choose target plane based on speed so stronger throws go farther
    const targetPlane = Math.max(600, Math.min(2200, 900 + (speed - MIN_THROW_SPEED) * 0.6));

    // screen -> camera-space point at depth = targetPlane (pinhole projection inverse)
    const sx = mouseAbs.x, sy = mouseAbs.y;
    const wx_cam = (sx - cx) * ((targetPlane + FOCAL) / FOCAL); // right positive
    const wy_cam = (cy - sy) * ((targetPlane + FOCAL) / FOCAL); // up positive
    const wz_cam = targetPlane;

    // rotate camera-space (wx_cam, wz_cam) by current aimAngle into world coords
    const ca = Math.cos(aimAngle), sa = Math.sin(aimAngle);
    const tx = wx_cam * ca - wz_cam * sa; // world X (right)
    const tz = wx_cam * sa + wz_cam * ca; // world Z (forward)
    const ty = wy_cam;                       // world Y (up)

    // start point slightly forward from camera so ball is visible immediately
    const SPAWN_FORWARD = 30; // px forward from camera
    const startX = SPAWN_FORWARD * sa;    // small offset in world X (based on yaw)
    const startZ = SPAWN_FORWARD * ca;    // small offset in world Z
    const startY = 0;

    // estimate time to reach forward target (based on forward distance and speed)
    const forwardDist = Math.max(120, tz - startZ);
    const estForwardSpeed = Math.max(300, speed);
    const t = Math.max(0.18, forwardDist / estForwardSpeed);

    // initial velocities to reach (tx,ty,tz) in time t (vy accounts for gravity)
    const vx = (tx - startX) / t;
    const vz = (tz - startZ) / t;
    const vy = (ty + 0.5 * GRAVITY * t * t) / t;

    // create 3D ball (world coordinates)
    ball = { world:{ x: startX, y: startY, z: startZ }, vx, vy, vz, r:BASE_BALL_RADIUS, owner:fromIdx, target:1-fromIdx, state:'outgoing', born:now() };
  } else {
    // opponent throw: aim roughly at player with some variation
    const target = players[0];
    const tx = target.world.x + (Math.random()-0.5)*80;
    const ty = 0 + (Math.random()-0.5)*40;
    const tz = Math.max(300, target.world.z + 10);
    const estForwardSpeed = Math.max(300, speed);
    const t = Math.max(0.3, tz / estForwardSpeed);
    const vx = (tx - from.world.x) / t;
    const vy = (ty - from.world.y + 0.5 * GRAVITY * t*t) / t;
    const vz = (tz - from.world.z) / t;
    ball = { world:{ x: from.world.x, y: from.world.y, z: from.world.z }, vx, vy, vz, r:BASE_BALL_RADIUS, owner:fromIdx, target:1-fromIdx, state:'outgoing', born:now() };
  }
  if (ball) { if (ball.owner === 0) players[0].hasBall = false; else players[1].hasBall = false; hideCatchButton(); }
}

// Input handlers (pointer-lock & fallback)
canvas.addEventListener('mousemove', e=>{
  if (usingPointerLock){
    aimAngle += e.movementX * AIM_SENSITIVITY;
    if (aimAngle > Math.PI*2) aimAngle -= Math.PI*2;
    if (aimAngle < -Math.PI*2) aimAngle += Math.PI*2;
  } else {
    const r = canvas.getBoundingClientRect(); mouseAbs.x = e.clientX - r.left; mouseAbs.y = e.clientY - r.top;
    const dx = (mouseAbs.x - W/2), dy = (mouseAbs.y - H/2);
    aimAngle = Math.atan2(dy, dx);
  }
  const ra = players[0] && players[0].recentAims; if(ra){ ra.push({x:mouseAbs.x,y:mouseAbs.y,t:now()}); if(ra.length>12) ra.shift(); }
});

canvas.addEventListener('mousedown', e=>{ if(!gameStarted||!players[0]||!players[0].hasBall) return; players[0].charging=true; players[0].chargeStart=now(); players[0].recentAims=[]; });
canvas.addEventListener('mouseup', e=>{ if(!gameStarted||!players[0]||!players[0].charging) return; players[0].charging=false; if(!players[0].hasBall) return; const dt = Math.min(MAX_CHARGE, now()-players[0].chargeStart); const t = dt / MAX_CHARGE; const speed = MIN_THROW_SPEED + t*(MAX_THROW_SPEED - MIN_THROW_SPEED); let curve=0; spawnBall(0, speed, curve); });

// touch handlers
canvas.addEventListener('touchstart', e=>{ if(!gameStarted) return; e.preventDefault(); const t=e.changedTouches[0]; touchActive=true; touchId=t.identifier; const r=canvas.getBoundingClientRect(); mouseAbs.x=t.clientX-r.left; mouseAbs.y=t.clientY-r.top; if(players[0]){ players[0].recentAims.push({x:mouseAbs.x,y:mouseAbs.y,t:now()}); if(players[0].recentAims.length>12) players[0].recentAims.shift(); if(players[0].hasBall){ players[0].charging=true; players[0].chargeStart=now(); } } }, {passive:false});
canvas.addEventListener('touchmove', e=>{ if(!gameStarted) return; e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ const r=canvas.getBoundingClientRect(); mouseAbs.x=t.clientX-r.left; mouseAbs.y=t.clientY-r.top; if(players[0]){ players[0].recentAims.push({x:mouseAbs.x,y:mouseAbs.y,t:now()}); if(players[0].recentAims.length>12) players[0].recentAims.shift(); } } } }, {passive:false});
canvas.addEventListener('touchend', e=>{ if(!gameStarted) return; e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ touchActive=false; touchId=null; if(!players[0]||!players[0].charging) return; players[0].charging=false; if(!players[0].hasBall) return; const dt = Math.min(MAX_CHARGE, now()-players[0].chargeStart); const tu = dt / MAX_CHARGE; const speed = MIN_THROW_SPEED + tu*(MAX_THROW_SPEED - MIN_THROW_SPEED); spawnBall(0, speed, 0); } } }, {passive:false});

canvas.addEventListener('click', e=>{ if(!gameStarted || !ball) return; if(ball.state!=='incoming') return; if(ball.target!==0) return; const proj = project(ball.world); if(!proj) return; const d = Math.hypot(proj.x - W/2, proj.y - H/2); if(d <= proj.r + 40 && proj.z > 50) catchBall(0); });

// hotseat / AI adapted to world coords
function hotseatControls(dt){ const p = players[1]; if(!p) return; const speed = 420; if(keys['KeyW']) p.world.z -= speed*dt; if(keys['KeyS']) p.world.z += speed*dt; if(keys['KeyA']) p.world.x -= speed*dt; if(keys['KeyD']) p.world.x += speed*dt; p.world.x = Math.max(-W, Math.min(W, p.world.x)); p.world.z = Math.max(50, Math.min(5000, p.world.z)); if(keys['Space'] && ball && ball.state==='incoming' && ball.target===1){ const proj = project(ball.world); if(proj && Math.hypot(proj.x - (W/2 + p.world.x * (FOCAL/(p.world.z+FOCAL))), proj.y - (H/2 - p.world.y * (FOCAL/(p.world.z+FOCAL)))) <= proj.r + 30) catchBall(1); } }

function aiUpdate(dt){ const ai = players[1]; if(!ai || ai.isHuman) return; const diff = (typeof window.__cpuDifficulty === 'string') ? window.__cpuDifficulty : 'Medium'; const diffMap = { 'Easy':0.6, 'Medium':1.0, 'Hard':1.3, 'Expert':1.6 }; const react = diffMap[diff] || 1.0; // move to preferable home
  const homeX = 220, homeZ = 900; ai.world.x += (homeX - ai.world.x) * Math.min(1, dt*0.6*react); ai.world.z += (homeZ - ai.world.z) * Math.min(1, dt*0.6*react); ai.world.x = Math.max(-W, Math.min(W, ai.world.x)); ai.world.z = Math.max(80, Math.min(5000, ai.world.z));
  if(ball && ball.state==='incoming' && ball.target===1){ const proj = project(ball.world); if(proj){ const desiredX = (proj.x - W/2) * ( (ai.world.z + FOCAL) / FOCAL ); const dx = desiredX - ai.world.x; const dz = (proj.z || ai.world.z) - ai.world.z; const dist = Math.hypot(dx, dz) || 1; const mv = 420 * react; ai.world.x += (dx/dist) * Math.min(mv*dt, Math.abs(dx)); ai.world.z += (dz/dist) * Math.min(mv*dt, Math.abs(dz)); if(Math.hypot(ball.world.x - ai.world.x, ball.world.y - ai.world.y, ball.world.z - ai.world.z) <= 60) catchBall(1); } } else if(ai.hasBall){ if(now() > ai.aiState.nextActionAt){ ai.aiState.nextActionAt = now() + 1000/Math.max(0.6,react) + Math.random()*800; setTimeout(()=>{ if(!ai.hasBall) return; const speed = MIN_THROW_SPEED + Math.random()*(MAX_THROW_SPEED - MIN_THROW_SPEED); spawnBall(1, speed * react, (Math.random()-0.5)*0.6); }, 300 + Math.random()*700); } }
}

function catchBall(playerIdx){ players[playerIdx].hasBall = true; scores[playerIdx] += 1; updateScore(); ball = null; hideCatchButton(); }
function updateScore(){ if(scoreEl) scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

function applyPhysics(dt){ if(!ball) return; // integrate velocities
  ball.world.x += ball.vx * dt; ball.world.z += ball.vz * dt; ball.world.y += ball.vy * dt; // gravity
  ball.vy -= GRAVITY * dt;
  // if ball goes below ground plane, assign score to nearest owner
  if(ball.world.y < -120){ players[ball.owner].hasBall = true; scores[ball.owner] += 1; updateScore(); ball = null; hideCatchButton(); }
}

// drawing helpers
function draw(){ ctx.clearRect(0,0,W,H);
  // opponent
  const opp = players[1]; if(opp){ const proj = project(opp.world); if(proj){ ctx.beginPath(); ctx.fillStyle = opp.fill; ctx.arc(proj.x, proj.y, Math.max(6, proj.r*0.9), 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=2; ctx.stroke(); if(opp.hasBall){ ctx.beginPath(); ctx.fillStyle=currentBallColor; ctx.arc(proj.x + proj.r*1.2, proj.y - proj.r*0.6, Math.max(6, proj.r*0.6), 0, Math.PI*2); ctx.fill(); } } }

  // ball
  if(ball){ const proj = project(ball.world); if(proj){ ctx.beginPath(); ctx.fillStyle='rgba(0,0,0,0.36)'; ctx.ellipse(proj.x + 6, proj.y + Math.max(6, proj.r*0.6), proj.r*0.9, proj.r*0.45, 0, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = currentBallColor; ctx.beginPath(); ctx.arc(proj.x, proj.y, proj.r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.arc(proj.x - Math.max(3, proj.r*0.2), proj.y - Math.max(5, proj.r*0.2), proj.r*0.28, 0, Math.PI*2); ctx.fill(); } }

  // reticle
  const cx = W/2, cy = H/2; ctx.save(); ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2; ctx.arc(cx, cy, 8, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.arc(cx, cy, 2, 0, Math.PI*2); ctx.fill(); ctx.restore();
}

function showCatchButton(){ if(!('ontouchstart' in window)) return; catchBtn.style.display='block'; }
function hideCatchButton(){ catchBtn.style.display='none'; }
function isTouchDevice(){ return 'ontouchstart' in window || navigator.maxTouchPoints>0; }

let lastFrame = now();
function loop(){ const t = now(); const dt = Math.min(40, t - lastFrame) / 1000; lastFrame = t; if(!gameStarted) return; // keep player at camera (world origin)
  players[0].world.x = 0; players[0].world.y = 0; players[0].world.z = 0;
  if(mode==='Hotseat') hotseatControls(dt); if(mode==='CPU') aiUpdate(dt);
  if(ball){ applyPhysics(dt);
    // check for catch: when ball z <= some near value, consider catching by player
    if(ball.world.z <= 60 && ball.state !== 'incoming'){
      ball.state = 'incoming'; ball.target = (ball.owner === 1) ? 1 : 0; if(ball.target === 0 && isTouchDevice()) showCatchButton();
    }
    // when very close to camera plane, decide catch/miss
    if(ball.world.z <= 12){ const proj = project(ball.world); if(proj){ const d = Math.hypot(proj.x - W/2, proj.y - H/2); if(ball.target === 0 && d <= proj.r + 40){ catchBall(0); } else if(ball.target === 1){ const opp = players[1]; const oppProj = project(opp.world); if(oppProj && Math.hypot(proj.x - oppProj.x, proj.y - oppProj.y) <= proj.r + 30){ catchBall(1); } else { players[1].hasBall = true; ball = null; hideCatchButton(); } } else { // missed by player
        players[1].hasBall = true; ball = null; hideCatchButton(); } } }
    // cutoff
    if(ball && Math.abs(ball.world.z) > 8000){ ball = null; hideCatchButton(); }
  }
  draw(); if(!gameOver) requestAnimationFrame(loop);
}

function updateScore(){ if(scoreEl) scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

// existing helper functions (hotseatControls, aiUpdate) remain; ensure they reference world coords properly
function hotseatControls(dt){ const p = players[1]; if(!p) return; const speed = 420; if(keys['KeyW']) p.world.z -= speed*dt; if(keys['KeyS']) p.world.z += speed*dt; if(keys['KeyA']) p.world.x -= speed*dt; if(keys['KeyD']) p.world.x += speed*dt; p.world.x = Math.max(-W, Math.min(W, p.world.x)); p.world.z = Math.max(50, Math.min(5000, p.world.z)); if(keys['Space'] && ball && ball.state==='incoming' && ball.target===1){ const proj = project(ball.world); const oppProj = project(p.world); if(proj && oppProj && Math.hypot(proj.x - oppProj.x, proj.y - oppProj.y) <= proj.r + 30) catchBall(1); } }

function aiUpdate(dt){ const ai = players[1]; if(!ai || ai.isHuman) return; const diff = (typeof window.__cpuDifficulty === 'string') ? window.__cpuDifficulty : 'Medium'; const diffMap = { 'Easy':0.6, 'Medium':1.0, 'Hard':1.3, 'Expert':1.6 }; const react = diffMap[diff] || 1.0; // move to preferable home
  const homeX = 220, homeZ = 900; ai.world.x += (homeX - ai.world.x) * Math.min(1, dt*0.6*react); ai.world.z += (homeZ - ai.world.z) * Math.min(1, dt*0.6*react); ai.world.x = Math.max(-W, Math.min(W, ai.world.x)); ai.world.z = Math.max(80, Math.min(5000, ai.world.z));
  if(ball && ball.state==='incoming' && ball.target===1){ const proj = project(ball.world); if(proj){ const desiredX = (proj.x - W/2) * ( (ai.world.z + FOCAL) / FOCAL ); const dx = desiredX - ai.world.x; const dz = (proj.z || ai.world.z) - ai.world.z; const dist = Math.hypot(dx, dz) || 1; const mv = 420 * react; ai.world.x += (dx/dist) * Math.min(mv*dt, Math.abs(dx)); ai.world.z += (dz/dist) * Math.min(mv*dt, Math.abs(dz)); if(Math.hypot(ball.world.x - ai.world.x, ball.world.y - ai.world.y, ball.world.z - ai.world.z) <= 60) catchBall(1); } } else if(ai.hasBall){ if(now() > ai.aiState.nextActionAt){ ai.aiState.nextActionAt = now() + 1000/Math.max(0.6,react) + Math.random()*800; setTimeout(()=>{ if(!ai.hasBall) return; const speed = MIN_THROW_SPEED + Math.random()*(MAX_THROW_SPEED - MIN_THROW_SPEED); spawnBall(1, speed * react, (Math.random()-0.5)*0.6); }, 300 + Math.random()*700); } }
}

// init
makePlayers(); if(window.__startRequested){ startGame(); }
