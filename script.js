/* gameplay + skins + start menu integration (v11)
   - True 3D aiming: yaw + pitch (pointer-lock) control look
   - Spawn throws along look direction (forward), taps select lateral/vertical via aim or screen touch
   - World->camera transform applies yaw/pitch so projection matches view
   - Ball has full 3D world position and velocity (vx,vy,vz) with gravity on y
   - Improved CPU: opponent will move to intercept incoming balls, catch them, charge, and throw back at the player with prediction
   - Visual: CPU now renders as a Windows‑11 style cursor (rotated to face the camera)
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;

document.body.style.cursor = 'none';
const scoreEl = document.getElementById('score');
const instrEl = document.getElementById('instr');

// skins
const SKINS = [
  {name:'Classic', cursor:'#ffffff', ball:'#ff2b2b'},
  {name:'Neon', cursor:'#8cf6ff', ball:'#ff6ad5'},
  {name:'Lime', cursor:'#b8ff6a', ball:'#ffb86a'},
  {name:'Gold', cursor:'#ffd36a', ball:'#9b6aff'}
];
let selectedSkin = (typeof window.__selectedSkin === 'number') ? window.__selectedSkin : 0;
let currentBallColor = SKINS[selectedSkin].ball;

// camera & projection
const FOCAL = 900;      // focal length
const GRAVITY = 2200;   // px/s^2 downward

// gameplay state
let players = [null, null];
let ball = null;
let scores = [0,0];
let gameOver = false;
let gameStarted = false;
let mode = (typeof window.__mode === 'string') ? window.__mode : 'CPU';

// aiming (yaw + pitch)
let aimYaw = 0;    // radians, rotation around Y, 0 => forward +Z
let aimPitch = 0;  // radians, up/down
const AIM_SENSITIVITY = 0.0028;
const PITCH_LIMIT = Math.PI * 0.35; // ~63 degrees
let usingPointerLock = false;
let mouseAbs = {x: W/2, y: H/2};

// UI
const catchBtn = document.getElementById('catch-btn') || (()=>{const b=document.createElement('button');b.id='catch-btn';b.textContent='Catch';b.style.display='none';document.body.appendChild(b);return b;})();
catchBtn.addEventListener('click', ()=>{ if(ball && ball.state==='incoming' && ball.target===0) catchBall(0); });

const MAX_CHARGE = 1200, MIN_THROW_SPEED = 420, MAX_THROW_SPEED = 1600;
const BASE_BALL_RADIUS = 12;

const keys = {}; addEventListener('keydown', e=>keys[e.code]=true); addEventListener('keyup', e=>keys[e.code]=false);
addEventListener('resize', ()=>{ W=canvas.width=innerWidth; H=canvas.height=innerHeight; });
function now(){ return performance.now(); }

function makePlayers(){
  players[0] = { id:0, world:{x:0,y:0,z:0}, fill:SKINS[selectedSkin].cursor, hasBall:true, charging:false, chargeStart:0, recentAims:[], isHuman:true };
  players[1] = { id:1, world:{x:220,y:0,z:900}, fill:SKINS[selectedSkin].cursor, hasBall:false, aiState:{nextActionAt:0, pendingThrow:false}, isHuman:false };
  updateScore();
}

function requestPointerLock(){ try{ if(canvas.requestPointerLock) canvas.requestPointerLock(); }catch(e){} }

function startGame(){ if(gameStarted) return; if(typeof window.__selectedSkin==='number'){ selectedSkin=window.__selectedSkin; currentBallColor=SKINS[selectedSkin].ball; } if(typeof window.__mode==='string') mode=window.__mode; const startMenu=document.getElementById('start-menu'); if(startMenu) startMenu.style.display='none'; requestPointerLock(); gameStarted=true; resetGame(); lastFrame=now(); requestAnimationFrame(loop); }
window.startGame = startGame;

document.addEventListener('pointerlockchange', ()=>{ usingPointerLock = (document.pointerLockElement === canvas); });

function resetGame(){ makePlayers(); ball=null; scores=[0,0]; updateScore(); gameOver=false; hideCatchButton(); }

// world->camera transform: rotate by -yaw around Y, then -pitch around X
function worldToCamera(wx, wy, wz){
  // translate (camera at origin)
  let x = wx, y = wy, z = wz;
  // rotate by -yaw around Y
  const cy = Math.cos(-aimYaw), sy = Math.sin(-aimYaw);
  let rx = cy * x - sy * z;
  let rz = sy * x + cy * z;
  let ry = y;
  // rotate by -pitch around X
  const cp = Math.cos(-aimPitch), sp = Math.sin(-aimPitch);
  let ry2 = cp * ry - sp * rz;
  let rz2 = sp * ry + cp * rz;
  return { x: rx, y: ry2, z: rz2 };
}

// project camera-space point to screen
function projectWorld(world){
  const cam = worldToCamera(world.x, world.y, world.z);
  if (cam.z <= 10) return null; // behind or too close
  const sx = W/2 + cam.x * (FOCAL / (cam.z + FOCAL));
  const sy = H/2 - cam.y * (FOCAL / (cam.z + FOCAL));
  const scale = (FOCAL / (cam.z + FOCAL));
  const r = Math.max(2, BASE_BALL_RADIUS * scale * 1.0);
  return { x: sx, y: sy, z: cam.z, scale, r };
}

// spawnBall: from world coords. fromIdx 0 = player (camera); 1 = opponent
function spawnBall(fromIdx, speed, curve){
  const from = players[fromIdx]; if(!from) return;
  if (fromIdx === 0){
    // compute look direction from yaw/pitch
    const cosP = Math.cos(aimPitch);
    const dirX = Math.sin(aimYaw) * cosP; // right component
    const dirY = Math.sin(aimPitch);      // up component
    const dirZ = Math.cos(aimYaw) * cosP; // forward component

    // choose a target plane distance based on speed
    const targetPlane = Math.max(600, Math.min(2200, 900 + (speed - MIN_THROW_SPEED) * 0.6));

    // target point in world = dir * targetPlane
    const tx = dirX * targetPlane;
    const ty = dirY * targetPlane;
    const tz = dirZ * targetPlane;

    // start slightly in front of camera along dir
    const SPAWN_FORWARD = 36;
    const startX = dirX * SPAWN_FORWARD;
    const startY = 0;
    const startZ = dirZ * SPAWN_FORWARD;

    // estimate time to reach forward target
    const forwardDist = Math.max(120, tz - startZ);
    const estForwardSpeed = Math.max(300, speed);
    const t = Math.max(0.12, forwardDist / estForwardSpeed);

    // initial velocities to reach (tx,ty,tz) in time t accounting for gravity
    const vx = (tx - startX) / t;
    const vz = (tz - startZ) / t;
    const vy = (ty + 0.5 * GRAVITY * t * t) / t;

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

// AI helpers: schedule and perform throw
function aiScheduleThrow(ai){
  if (!ai || !ai.hasBall || ai.aiState.pendingThrow) return;
  ai.aiState.pendingThrow = true;
  const reactDelay = 300 + Math.random()*800; // reaction time
  setTimeout(()=>{
    if(!ai.hasBall) { ai.aiState.pendingThrow = false; return; }
    // choose speed based on difficulty
    const diff = (typeof window.__cpuDifficulty === 'string') ? window.__cpuDifficulty : 'Medium';
    const map = { 'Easy':0.85, 'Medium':1.0, 'Hard':1.15, 'Expert':1.3 };
    const factor = map[diff] || 1.0;
    const speed = Math.min(MAX_THROW_SPEED, MIN_THROW_SPEED + Math.random()*(MAX_THROW_SPEED-MIN_THROW_SPEED)) * factor;
    aiThrow(ai, speed);
    ai.aiState.pendingThrow = false;
  }, reactDelay);
}

function aiThrow(ai, speed){
  // aim at player's look direction with slight lead
  const cosP = Math.cos(aimPitch);
  const dirX = Math.sin(aimYaw) * cosP;
  const dirY = Math.sin(aimPitch);
  const dirZ = Math.cos(aimYaw) * cosP;
  const targetPlane = 900;
  const tx = dirX * targetPlane + (Math.random()-0.5)*60;
  const ty = dirY * targetPlane + (Math.random()-0.5)*40;
  const tz = dirZ * targetPlane + (Math.random()*80);

  const startX = ai.world.x || 0;
  const startY = ai.world.y || 0;
  const startZ = ai.world.z || 900;
  // estimate time to reach
  const dist = Math.hypot(tx - startX, tz - startZ);
  const t = Math.max(0.15, dist / Math.max(300, speed));
  const vx = (tx - startX) / t;
  const vz = (tz - startZ) / t;
  const vy = (ty - startY + 0.5 * GRAVITY * t * t) / t;

  ball = { world:{ x:startX, y:startY, z:startZ }, vx, vy, vz, r:BASE_BALL_RADIUS, owner:ai.id, target:0, state:'outgoing', born:now() };
  ai.hasBall = false;
  hideCatchButton();
}

// input
canvas.addEventListener('mousemove', e=>{
  if(usingPointerLock){
    aimYaw += e.movementX * AIM_SENSITIVITY;
    aimPitch -= e.movementY * AIM_SENSITIVITY; // invert Y
    aimPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, aimPitch));
  } else {
    const r = canvas.getBoundingClientRect(); mouseAbs.x = e.clientX - r.left; mouseAbs.y = e.clientY - r.top;
    const dx = mouseAbs.x - W/2, dy = mouseAbs.y - H/2;
    aimYaw = Math.atan2(dx, FOCAL);
    aimPitch = Math.atan2(-dy, FOCAL);
  }
  const ra = players[0] && players[0].recentAims; if(ra){ ra.push({x:mouseAbs.x,y:mouseAbs.y,t:now()}); if(ra.length>12) ra.shift(); }
});

canvas.addEventListener('mousedown', e=>{ if(!gameStarted||!players[0]||!players[0].hasBall) return; players[0].charging=true; players[0].chargeStart=now(); players[0].recentAims=[]; });
canvas.addEventListener('mouseup', e=>{ if(!gameStarted||!players[0]||!players[0].charging) return; players[0].charging=false; if(!players[0].hasBall) return; const dt=Math.min(MAX_CHARGE, now()-players[0].chargeStart); const t=dt/MAX_CHARGE; const speed=MIN_THROW_SPEED+t*(MAX_THROW_SPEED-MIN_THROW_SPEED); spawnBall(0,speed,0); });

// touch
canvas.addEventListener('touchstart', e=>{ if(!gameStarted) return; e.preventDefault(); const t=e.changedTouches[0]; touchActive=true; touchId=t.identifier; const r=canvas.getBoundingClientRect(); mouseAbs.x=t.clientX-r.left; mouseAbs.y=t.clientY-r.top; if(players[0]){ players[0].recentAims.push({x:mouseAbs.x,y:mouseAbs.y,t:now()}); if(players[0].recentAims.length>12) players[0].recentAims.shift(); if(players[0].hasBall){ players[0].charging=true; players[0].chargeStart=now(); } } }, {passive:false});
canvas.addEventListener('touchmove', e=>{ if(!gameStarted) return; e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ const r=canvas.getBoundingClientRect(); mouseAbs.x=t.clientX-r.left; mouseAbs.y=t.clientY-r.top; if(players[0]){ players[0].recentAims.push({x:mouseAbs.x,y:mouseAbs.y,t:now()}); if(players[0].recentAims.length>12) players[0].recentAims.shift(); } } } }, {passive:false});
canvas.addEventListener('touchend', e=>{ if(!gameStarted) return; e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ touchActive=false; touchId=null; if(!players[0]||!players[0].charging) return; players[0].charging=false; if(!players[0].hasBall) return; const dt=Math.min(MAX_CHARGE, now()-players[0].chargeStart); const tu=dt/MAX_CHARGE; const speed=MIN_THROW_SPEED+tu*(MAX_THROW_SPEED-MIN_THROW_SPEED); spawnBall(0,speed,0); } } }, {passive:false});

canvas.addEventListener('click', e=>{ if(!gameStarted||!ball) return; if(ball.state!=='incoming') return; if(ball.target!==0) return; const proj = projectWorld(ball.world); if(!proj) return; const d = Math.hypot(proj.x - W/2, proj.y - H/2); if(d <= proj.r + 40 && proj.z > 50) catchBall(0); });

// hotseat / AI movement
function hotseatControls(dt){ const p = players[1]; if(!p) return; const speed = 420; if(keys['KeyW']) p.world.z -= speed*dt; if(keys['KeyS']) p.world.z += speed*dt; if(keys['KeyA']) p.world.x -= speed*dt; if(keys['KeyD']) p.world.x += speed*dt; p.world.x = Math.max(-W, Math.min(W, p.world.x)); p.world.z = Math.max(50, Math.min(5000, p.world.z)); if(keys['Space'] && ball && ball.state==='incoming' && ball.target===1){ const proj = projectWorld(ball.world); const oppProj = projectWorld(p.world); if(proj && oppProj && Math.hypot(proj.x - oppProj.x, proj.y - oppProj.y) <= proj.r + 30) catchBall(1); } }

// AI: move to intercept incoming balls, catch and throw
function aiUpdate(dt){ const ai = players[1]; if(!ai || ai.isHuman) return;
  const diff = (typeof window.__cpuDifficulty === 'string') ? window.__cpuDifficulty : 'Medium';
  const perf = { 'Easy':0.7, 'Medium':1.0, 'Hard':1.2, 'Expert':1.5 }[diff] || 1.0;

  // If ball is incoming to AI, try to intercept
  if(ball && ball.state==='incoming' && ball.target===1){
    // predict where ball will project at AI's depth
    const dz = ball.world.z - ai.world.z;
    const relVz = ball.vz || 0;
    const t = Math.abs(relVz) < 1 ? 0.2 : Math.max(0.05, dz / relVz);
    const predX = ball.world.x + (ball.vx || 0) * t;
    const predY = ball.world.y + (ball.vy || 0) * t - 0.5 * GRAVITY * t * t;
    // move AI toward predicted world point
    ai.world.x += (predX - ai.world.x) * Math.min(1, dt*1.8*perf);
    ai.world.y += (predY - ai.world.y) * Math.min(1, dt*1.8*perf);
    ai.world.x = Math.max(-W, Math.min(W, ai.world.x));
    ai.world.y = Math.max(-200, Math.min(400, ai.world.y));

    // if close enough in world distance, catch
    const dist = Math.hypot(ball.world.x - ai.world.x, ball.world.y - ai.world.y, ball.world.z - ai.world.z);
    if(dist <= 60){
      catchBall(1);
      // ensure AI schedules a throw after catching
      aiScheduleThrow(ai);
    }
    return;
  }

  // If AI has the ball, schedule a throw
  if(ai.hasBall && !ai.aiState.pendingThrow){ aiScheduleThrow(ai); }

  // If AI doesn't have ball and it's not incoming to AI, reposition to home
  const homeX = 220, homeZ = 900;
  ai.world.x += (homeX - ai.world.x) * Math.min(1, dt*0.6*perf);
  ai.world.z += (homeZ - ai.world.z) * Math.min(1, dt*0.6*perf);
}

function catchBall(playerIdx){ players[playerIdx].hasBall = true; scores[playerIdx] += 1; updateScore(); ball = null; hideCatchButton(); }
function updateScore(){ if(scoreEl) scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

function applyPhysics(dt){ if(!ball) return; // integrate velocities
  ball.world.x += ball.vx * dt;
  ball.world.z += ball.vz * dt;
  ball.world.y += ball.vy * dt;
  ball.vy -= GRAVITY * dt;
  if(ball.world.y < -120){ players[ball.owner].hasBall = true; scores[ball.owner] += 1; updateScore(); ball = null; hideCatchButton(); }
}

function showCatchButton(){ if(!('ontouchstart' in window)) return; catchBtn.style.display='block'; }
function hideCatchButton(){ catchBtn.style.display='none'; }
function isTouchDevice(){ return 'ontouchstart' in window || navigator.maxTouchPoints>0; }

let lastFrame = now();
function loop(){ const t = now(); const dt = Math.min(40, t - lastFrame) / 1000; lastFrame = t; if(!gameStarted) return; // keep camera origin
  players[0].world.x = 0; players[0].world.y = 0; players[0].world.z = 0;
  if(mode==='Hotseat') hotseatControls(dt); if(mode==='CPU') aiUpdate(dt);
  if(ball){ applyPhysics(dt);
    if(ball.world.z <= 60 && ball.state !== 'incoming'){ ball.state = 'incoming'; ball.target = (ball.owner === 1) ? 1 : 0; if(ball.target === 0 && isTouchDevice()) showCatchButton(); }
    if(ball.world.z <= 12){ const proj = projectWorld(ball.world); if(proj){ const d = Math.hypot(proj.x - W/2, proj.y - H/2); if(ball.target === 0 && d <= proj.r + 40){ catchBall(0); } else if(ball.target === 1){ const opp = players[1]; const oppProj = projectWorld(opp.world); if(oppProj && Math.hypot(proj.x - oppProj.x, proj.y - oppProj.y) <= proj.r + 30){ catchBall(1); } else { players[1].hasBall = true; ball = null; hideCatchButton(); } } else { players[1].hasBall = true; ball = null; hideCatchButton(); } } }
    if(ball && Math.abs(ball.world.z) > 8000){ ball = null; hideCatchButton(); }
  }
  draw(); if(!gameOver) requestAnimationFrame(loop);
}

function updateScore(){ if(scoreEl) scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

// init
makePlayers(); if(window.__startRequested){ startGame(); }
