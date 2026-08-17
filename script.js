// DEBUG VISUALS v6
// This debug script forces very large, obvious visuals to confirm canvas rendering.
// It intentionally replaces gameplay with a simple visual test: huge Win98 cursor, big red ball, and centered text.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
addEventListener('resize', resize); resize();

console.log('debug v6 running');

function drawWin98Cursor(x,y,scale, fill, stroke){
  const map = [
    '100000000000','110000000000','111000000000','111100000000','111110000000','111111000000','111111100000',
    '111111110000','111111100000','111110010000','111100011000','111000001100','110000000110','100000000011',
    '000000000001','000000000000'
  ];
  const s = scale;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for(let r=0;r<map.length;r++){
    for(let c=0;c<map[r].length;c++){
      if(map[r][c]==='1') ctx.fillRect(x + (c-2)*s + s, y + (r-8)*s + s, s, s);
    }
  }
  // outline
  ctx.fillStyle = stroke;
  for(let r=0;r<map.length;r++){
    for(let c=0;c<map[r].length;c++){
      if(map[r][c]==='1') ctx.fillRect(x + (c-2)*s, y + (r-8)*s, s, s);
    }
  }
  // inner
  ctx.fillStyle = fill;
  for(let r=0;r<map.length;r++){
    for(let c=0;c<map[r].length;c++){
      if(map[r][c]==='1') ctx.fillRect(x + (c-2)*s + 1, y + (r-8)*s + 1, Math.max(0,s-2), Math.max(0,s-2));
    }
  }
  ctx.restore();
}

function draw(){
  const W = canvas.width; const H = canvas.height;
  // blue background
  ctx.fillStyle = '#2b6cff'; ctx.fillRect(0,0,W,H);
  // huge center cursor
  drawWin98Cursor(W/2 - 8*6, H/2 - 8*6, 12, '#ffffff', '#000000');
  // big red ball slightly right
  ctx.beginPath(); ctx.fillStyle = '#ff2b2b'; ctx.arc(W/2 + 180, H/2, 48, 0, Math.PI*2); ctx.fill();
  // label
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 42px system-ui, Arial'; ctx.textAlign = 'center'; ctx.fillText('TEST VISUALS v6', W/2, H*0.18);
  // small instructions
  ctx.font = '18px system-ui, Arial'; ctx.fillText('If you see the cursor and red ball, canvas drawing works.', W/2, H*0.18 + 40);
}

// run
setInterval(draw, 1000/30);

// also expose a console check
window.__debug_v6 = true;
