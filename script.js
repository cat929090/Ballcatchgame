/* gameplay + skins + start menu integration (v8) */

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
let selectedSkin = 0; // index
let currentBallColor = SKINS[selectedSkin].ball;

let players = [null, null];
let ball = null;
let scores = [0,0];
let gameOver = false;
let gameStarted = false; // wait for Start

// UI elements
const startMenu = document.getElementById('start-menu');
const playBtn = document.getElementById('play-btn');
const cpuBtn = document.getElementById('cpu-btn');
const skinButtons = Array.from(document.querySelectorAll('.skin-swatch'));

// catch button
const catchBtn = document.getElementById('catch-btn') || (() => { const b=document.createElement('button'); b.id='catch-btn'; b.textContent='Catch'; b.style.display='none'; document.body.appendChild(b); return b; })();
catchBtn.addEventListener('click', ()=>{ if (ball && ball.state==='incoming' && ball.target===0) catchBall(0); });

// wiring skin buttons
skinButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const idx = Number(btn.dataset.index);
    selectSkin(idx);
  });
});

function selectSkin(idx){ selectedSkin = idx; currentBallColor = SKINS[selectedSkin].ball; skinButtons.forEach(b=>b.classList.remove('selected')); skinButtons[selectedSkin].classList.add('selected');
  if (players[0]) players[0].fill = SKINS[selectedSkin].cursor; if (players[1]) players[1].fill = SKINS[selectedSkin].cursor; updateScore(); }

// default select
selectSkin(0);

playBtn.addEventListener('click', ()=>{ mode='CPU'; startGame(); });
cpuBtn.addEventListener('click', ()=>{ mode = (mode==='CPU')? 'Hotseat' : 'CPU'; cpuBtn.textContent = mode==='CPU' ? 'CPU Mode' : 'Hotseat Mode'; });

// input state
let mouseAim = {x:W/2,y:H/2}, touchActive=false, touchId=null;
const MAX_CHARGE = 1200, MIN_THROW_SPEED = 420, MAX_THROW_SPEED = 1400; const BALL_RADIUS = 12;

const keys = {}; addEventListener('keydown', e=>keys[e.code]=true); addEventListener('keyup', e=>keys[e.code]=false);
addEventListener('resize', ()=>{ W=canvas.width=innerWidth; H=canvas.height=innerHeight; if(players[0]){players[0].x=W/2;players[0].y=H/2;} });

function now(){return performance.now();}

function makePlayers(){ players[0] = {id:0,x:W*0.5,y:H*0.5,fill:SKINS[selectedSkin].cursor,hasBall:true,charging:false,chargeStart:0,recentAims:[],isHuman:true}; players[1]={id:1,x:W*0.8,y:H*0.5,fill:SKINS[selectedSkin].cursor,hasBall:false,charging:false,chargeStart:0,isHuman:(mode==='Hotseat'),aiState:{nextActionAt:0}}; updateScore(); }

function startGame(){ startMenu.style.display='none'; gameStarted=true; resetGame(); lastFrame=now(); requestAnimationFrame(loop); }

function resetGame(){ makePlayers(); ball=null; scores=[0,0]; updateScore(); gameOver=false; hideCatchButton(); }

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
function hotseatControls(dt){ const p=players[1]; if(!p) return; const speed=380; if(keys['KeyW']) p.y-=speed*dt; if(keys['KeyS']) p.y+=speed*dt; if(keys['KeyA']) p.x-=speed*dt; if(keys['KeyD']) p.x+=speed*dt; p.x=Math.max(20,Math.min(W-20,p.x)); p.y=Math.max(20,Math.min(H-20,p.y)); if(keys['ShiftRight']&&p.hasBall){ if(!p.charging){ p.charging=true; p.chargeStart=now(); } } else if(p.charging){ if(keys['Enter']){ p.charging=false; const dtc=Math.min(MAX_CHARGE, now()-p.chargeStart); const t=dtc/MAX_CHARGE; const spd=MIN_REQUIREMENTS exceeded