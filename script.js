/* gameplay + skins + start menu integration (v8)
   - Exposes window.startGame() so the inline start menu can start the game
   - Reads window.__selectedSkin and window.__mode if set by the inline menu
   - Auto-starts if window.__startRequested is true
   - Improved first-person cursor rendering and refined opponent cursors
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

let players = [null, null];
let ball = null;
let scores = [0,0];
let gameOver = false;
let gameStarted = false; // wait for Start
let mode = (typeof window.__mode === 'string') ? window.__mode : 'CPU';

// catch button
const catchBtn = document.getElementById('catch-btn') || (() => { const b=document.createElement('button'); b.id='catch-btn'; b.textContent='Catch'; b.style.display='none'; document.body.appendChild(b); return b; })();
catchBtn.addEventListener('click', ()=>{ if (ball && ball.state==='incoming' && ball.target===0) catchBall(0); });

// input state
let mouseAim = {x:W/2,y:H/2}, touchActive=false, touchId=null;
const MAX_CHARGE = 1200, MIN_THROW_SPEED = 420, MAX_THROW_SPEED = 1400; const BALL_RADIUS = 12;

const keys = {}; addEventListener('keydown', e=>keys[e.code]=true); addEventListener('keyup', e=>keys[e.code]=false);
addEventListener('resize', ()=>{ W=canvas.width=innerWidth; H=canvas.height=innerHeight; if(players[0]){players[0].x=W/2;players[0].y=H/2;} });

function now(){return performance.now();}

function makePlayers(){
  players[0] = {id:0,x:W*0.5,y:H*0.5,fill:SKINS[selectedSkin].cursor,hasBall:true,charging:false,chargeStart:0,recentAims:[],isHuman:true};
  players[1] = {id:1,x:W*0.8,y:H*0.5,fill:SKINS[selectedSkin].cursor,hasBall:false,charging:false,chargeStart:0,isHuman:(mode==='Hotseat'),aiState:{nextActionAt:0}};
  updateScore();
}

function startGame(){
  // If already started, ignore
  if (gameStarted) return;
  // re-read possible selections set by inline menu
  if (typeof window.__selectedSkin === 'number'){
    selectedSkin = window.__selectedSkin;
    currentBallColor = SKINS[selectedSkin].ball;
  }
  if (typeof window.__mode === 'string') mode = window.__mode;

  // hide start menu if present
  const startMenu = document.getElementById('start-menu'); if (startMenu) startMenu.style.display = 'none';
  gameStarted = true; resetGame(); lastFrame = now(); requestAnimationFrame(loop);
}

// expose globally so inline menu can call it
window.startGame = startGame;

function resetGame(){ makePlayers(); ball = null; scores=[0,0]; updateScore(); gameOver=false; hideCatchButton(); }

function spawnBall(fromIdx, speed, curve){ const from=players[fromIdx]; if(!from) return; let vx=0,vy=0; if(fromIdx===0){ const dx=mouseAim.x-from.x, dy=mouseAim.y-from.y, len=Math.hypot(dx,dy)||1; vx=(dx/len)*speed; vy=(dy/len)*speed; } else { const target=players[0]; const dx=target.x-from.x, dy=target.y-from.y, len=Math.hypot(dx,dy)||1; vx=(dx/len)*speed; vy=(dy/len)*speed; } ball={x:from.x,y:from.y,vx,vy,r:BALL_RADIUS,owner:fromIdx,target:1-fromIdx,state:'outgoing',traveled:0,maxDistance:Math.min(1400,200+speed*0.6),curve:curve||0,born:now()}; from.hasBall=false; hideCatchButton(); }

// input handlers
canvas.addEventListener('mousemove', e=>{ const r=canvas.getBoundingClientRect(); mouseAim.x=e.clientX-r.left; mouseAim.y=e.clientY-r.top; const ra=players[0] && players[0].recentAims; if(ra){ ra.push({x:mouseAim.x,y:mouseAim.y,t:now()}); if(ra.length>12) ra.shift(); } });
canvas.addEventListener('mousedown', e=>{ if(!gameStarted||!players[0]||!players[0].hasBall) return; players[0].charging=true; players[0].chargeStart=now(); players[0].recentAims=[]; });
canvas.addEventListener('mouseup', e=>{ if(!gameStarted||!players[0]||!players[0].charging) return; players[0].charging=false; if(!players[0].hasBall) return; const dt=Math.min(MAX_CHARGE, now()-players[0].chargeStart); const t=dt/MAX_CHARGE; const speed=MIN_THROW_SPEED+t*(MAX_THROW_SPEED-MIN_THROW_SPEED); let curve=0; const rp=players[0].recentAims; if(rp.length>=2){ const first=rp[0], last=rp[rp.length-1]; const mvx=last.x-first.x; curve=Math.max(-1,Math.min(1,mvx/200))*(0.8+t*1.2); } spawnBall(0,speed,curve); });

canvas.addEventListener('touchstart', e=>{ if(!gameStarted) return; e.preventDefault(); const t=e.changedTouches[0]; touchActive=true; touchId=t.identifier; const r=canvas.getBoundingClientRect(); mouseAim.x=t.clientX-r.left; mouseAim.y=t.clientY-r.top; if(players[0]){ players[0].recentAims.push({x:mouseAim.x,y:mouseAim.y,t:now()}); if(players[0].recentAims.length>12) players[0].recentAims.shift(); if(players[0].hasBall){ players[0].charging=true; players[0].chargeStart=now(); } } }, {passive:false});
canvas.addEventListener('touchmove', e=>{ if(!gameStarted) return; e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ const r=canvas.getBoundingClientRect(); mouseAim.x=t.clientX-r.left; mouseAim.y=t.clientY-r.top; if(players[0]){ players[0].recentAims.push({x:mouseAim.x,y:mouseAim.y,t:now()}); if(players[0].recentAims.length>12) players[0].recentAims.shift(); } } } }, {passive:false});
canvas.addEventListener('touchend', e=>{ if(!gameStarted) return; e.preventDefault(); for(const t of e.changedTouches){ if(t.identifier===touchId){ touchActive=false; touchId=null; if(!players[0]||!players[0].charging) return; players[0].charging=false; if(!players[0].hasBall) return; const dt=Math.min(MAX_CHARGE, now()-players[0].chargeStart); const tt=dt/MAX_CHARGE; const speed=MIN_THROW_SPEED+tt*(MAX_THROW_SPEED-MIN_THROW_SPEED); let curve=0; const rp=players[0].recentAims; if(rp.length>=2){ const first=rp[0], last=rp[rp.length-1]; const mvx=last.x-first.x; curve=Math.max(-1,Math.min(1,mvx/200))*(0.8+tt*1.2); } spawnBall(0,speed,curve); } } }, {passive:false});
canvas.addEventListener('click', e=>{ if(!gameStarted || !ball) return; if(ball.state!=='incoming') return; if(ball.target!==0) return; const d=Math.hypot(ball.x-players[0].x, ball.y-players[0].y); if(d<=ball.r+30) catchBall(0); });

// hotseat controls
function hotseatControls(dt){ const p=players[1]; if(!p) return; const speed=380; if(keys['KeyW']) p.y-=speed*dt; if(keys['KeyS']) p.y+=speed*dt; if(keys['KeyA']) p.x-=speed*dt; if(keys['KeyD']) p.x+=speed*dt; p.x=Math.max(20,Math.min(W-20,p.x)); p.y=Math.max(20,Math.min(H-20,p.y)); if(keys['ShiftRight']&&p.hasBall){ if(!p.charging){ p.charging=true; p.chargeStart=now(); } } else if(p.charging){ if(keys['Enter']){ p.charging=false; const dtc=Math.min(MAX_CHARGE, now()-p.chargeStart); const t=dtc/MAX_CHARGE; const spd=MIN_THROW_SPEED+t*(MAX_THROW_SPEED-MIN_THROW_SPEED); let curve=0; if(keys['KeyA']) curve=-0.7*(0.6+t); if(keys['KeyD']) curve=0.7*(0.6+t); spawnBall(1,spd,curve); } if(!keys['ShiftRight']){ const dtc=Math.min(MAX_CHARGE, now()-p.chargeStart); const t=dtc/MAX_CHARGE; const spd=MIN_THROW_SPEED+t*(MAX_THROW_SPEED-MIN_THROW_SPEED); let curve=0; if(keys['KeyA']) curve=-0.6*(0.6+t); if(keys['KeyD']) curve=0.6*(0.6+t); spawnBall(1,spd,curve); p.charging=false; } } if(keys['Space'] && ball && ball.state==='incoming' && ball.target===1){ const d=Math.hypot(ball.x-p.x, ball.y-p.y); if(d<=ball.r+30) catchBall(1); } }

// AI
function aiUpdate(dt){ const ai=players[1]; if(!ai || ai.isHuman) return; // difficulty influences reaction & movement speed
  const diff = (typeof window.__cpuDifficulty === 'string') ? window.__cpuDifficulty : 'Medium';
  const diffMap = { 'Easy': 0.6, 'Medium': 1.0, 'Hard': 1.3, 'Expert': 1.6 };
  const react = diffMap[diff] || 1.0;
  if(ball && ball.state==='incoming' && ball.target===1){ const dx=ball.x-ai.x, dy=ball.y-ai.y, dist=Math.hypot(dx,dy)||1; const moveSpeed=420 * react; ai.x += (dx/dist)*Math.min(moveSpeed*dt, dist); ai.y += (dy/dist)*Math.min(moveSpeed*dt, dist); if(Math.hypot(ball.x-ai.x, ball.y-ai.y) <= ball.r + 18){ catchBall(1); } } else if(ai.hasBall){ if(now() > ai.aiState.nextActionAt){ const chargeDur = 300 + Math.random()*700; ai.aiState.nextActionAt = now() + 1000/Math.max(0.6,react) + Math.random()*800; setTimeout(()=>{ if(!ai.hasBall) return; const t=Math.min(1, Math.random()*0.95 + 0.1); const spd = MIN_THROW_SPEED + t*(MAX_THROW_SPEED-MIN_THROW_SPEED); const curve=(Math.random()-0.5)*(0.6 + t*1.2); spawnBall(1, spd*react, curve*react); }, chargeDur/Math.max(0.6,react)); } } else { const cx=W*0.8, cy=H/2; ai.x += (cx-ai.x)*Math.min(1, dt*1.4*react); ai.y += (cy-ai.y)*Math.min(1, dt*1.4*react); } ai.x = Math.max(20, Math.min(W-20, ai.x)); ai.y = Math.max(20, Math.min(H-20, ai.y)); }

function catchBall(playerIdx){ players[playerIdx].hasBall = true; scores[playerIdx] += 1; updateScore(); ball = null; hideCatchButton(); }
function updateScore(){ if(scoreEl) scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

function applyCurve(b, dt){ if(!b || Math.abs(b.curve) < 0.001) return; const speed=Math.hypot(b.vx,b.vy)||1; const nx=b.vx/speed, ny=b.vy/speed; const px=-ny, py=nx; const curveStrength=600; const age=(now()-b.born)/1000; const fade=Math.max(0.2,1-age*0.5); b.vx += px*(b.curve*curveStrength*fade)*dt; b.vy += py*(b.curve*curveStrength*fade)*dt; }

// Improved cursor drawing (pixel-art Win98 arrow, supports rotation)
function drawCursorPixel(x,y,scale, fill, stroke, angle=0, shadow=true){
  const map = [
    '100000000000','110000000000','111000000000','111100000000','111110000000','111111000000','111111100000',
    '111111110000','111111100000','111110010000','111100011000','111000001100','110000000110','100000000011',
    '000000000001','000000000000'
  ];
  const s = scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = false;
  if(shadow){ ctx.fillStyle = 'rgba(0,0,0,0.22)'; for(let r=0;r<map.length;r++){ for(let c=0;c<map[r].length;c++){ if(map[r][c]==='1') ctx.fillRect((c-2)*s + s + 1, (r-8)*s + s + 1, s, s); } } }
  // outline
  ctx.fillStyle = stroke;
  for(let r=0;r<map.length;r++){ for(let c=0;c<map[r].length;c++){ if(map[r][c]==='1') ctx.fillRect((c-2)*s, (r-8)*s, s, s); } }
  // inner
  ctx.fillStyle = fill;
  for(let r=0;r<map.length;r++){ for(let c=0;c<map[r].length;c++){ if(map[r][c]==='1') ctx.fillRect((c-2)*s + 1, (r-8)*s + 1, Math.max(0,s-2), Math.max(0,s-2)); } }
  // small shine highlight
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(2*s, -6*s, Math.max(0,s*0.8), Math.max(0,s*0.9));
  ctx.restore();
}

function draw(){ ctx.clearRect(0,0,W,H);
  // subtle background tint (handled by CSS), we draw only gameplay objects

  // opponent (draw slightly smaller and with subtle bob)
  const p = players[1]; if(p){
    const bob = Math.sin(now()/400)*2;
    drawCursorPixel(p.x, p.y + bob, 4, p.fill, '#000000', Math.sin(now()/700)*0.06, true);
    ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.arc(p.x,p.y,32,0,Math.PI*2); ctx.stroke();
    if(p.hasBall){ ctx.beginPath(); ctx.fillStyle=currentBallColor; ctx.arc(p.x+34,p.y-14,10,0,Math.PI*2); ctx.fill(); }
  }

  // ball
  if(ball){ ctx.beginPath(); ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.ellipse(ball.x+6, ball.y+8, ball.r*0.9, ball.r*0.45, 0,0,Math.PI*2); ctx.fill(); ctx.fillStyle=currentBallColor; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.fillStyle='rgba(255,255,255,0.22)'; ctx.arc(ball.x-4, ball.y-6, ball.r*0.35,0,Math.PI*2); ctx.fill(); }

  // center cursor (first-person) - rotate towards recent aim movement to feel like wrist rotation
  const center = players[0]; if(center){
    // compute smoothed aim delta to derive rotation
    const rp = center.recentAims || [];
    let ang = 0;
    if(rp.length >= 2){ const first = rp[0], last = rp[rp.length-1]; ang = Math.atan2(last.y - first.y, last.x - first.x); }
    // make rotation subtle and point roughly toward mouseAim
    const dx = mouseAim.x - center.x, dy = mouseAim.y - center.y; const targ = Math.atan2(dy,dx);
    // lerp between targ and ang for smoothness
    const rtarget = (targ + ang*0.6) / 1.6;
    // charging bob
    const bob = (center.charging) ? Math.sin(now()/150)*2 : 0;
    drawCursorPixel(center.x, center.y + bob, 6, center.fill, '#000000', rtarget, true);

    // charge arc
    if(center.charging && center.hasBall){ const dt=Math.min(MAX_CHARGE, now()-center.chargeStart); const t=dt/MAX_CHARGE; const arc = Math.PI*2 * t; ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6; ctx.arc(center.x, center.y + bob, 72, -Math.PI/2, -Math.PI/2 + arc); ctx.stroke(); }
  }
}

function showCatchButton(){ if(!('ontouchstart' in window)) return; catchBtn.style.display='block'; }
function hideCatchButton(){ catchBtn.style.display='none'; }
function isTouchDevice(){ return 'ontouchstart' in window || navigator.maxTouchPoints>0; }

let lastFrame = now();
function loop(){ const t=now(); const dt=Math.min(40, t-lastFrame)/1000; lastFrame=t; if(!gameStarted) return; if(mode==='Hotseat') hotseatControls(dt); if(mode==='CPU') aiUpdate(dt); if(ball){ if(ball.state==='outgoing'){ applyCurve(ball, dt); ball.x += ball.vx*dt; ball.y += ball.vy*dt; ball.traveled += Math.hypot(ball.vx*dt, ball.vy*dt); const target=players[ball.target]; const d=Math.hypot(ball.x-target.x, ball.y-target.y); if(d<=120 || ball.traveled>=ball.maxDistance){ ball.state='incoming'; if(ball.target===0 && isTouchDevice()) showCatchButton(); } } else if(ball.state==='incoming'){ const target=players[ball.target]; const dx=target.x-ball.x, dy=target.y-ball.y, dist=Math.hypot(dx,dy)||1; const steer=200; ball.vx += (dx/dist)*steer*dt; ball.vy += (dy/dist)*steer*dt; applyCurve(ball, dt); ball.x += ball.vx*dt; ball.y += ball.vy*dt; if(dist <= ball.r + 8){ scores[ball.owner] += 1; players[ball.owner].hasBall = true; updateScore(); ball = null; hideCatchButton(); } } }
  draw(); if(!gameOver) requestAnimationFrame(loop); }

function updateScore(){ if(scoreEl) scoreEl.textContent = `Score: ${scores[0]} - ${scores[1]}`; }

// init
makePlayers();

// auto-start if requested by inline menu before the script loaded
if (window.__startRequested){ startGame(); }
