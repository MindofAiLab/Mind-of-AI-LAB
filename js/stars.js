/* 星空背景 + 银河系八大行星（分布在页面四周，缓慢漂移发光） */
(function(){
  const canvas = document.getElementById('starsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha:true });

  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W=0, H=0; let t=0;

  const STAR_COUNT = 260;
  const TWINKLE_SPEED = 0.012;

  let stars = [];
  let planets = [];

  function resize(){
    const rect = canvas.getBoundingClientRect();
    W = Math.floor(rect.width * DPR);
    H = Math.floor(rect.height * DPR);
    canvas.width = W; canvas.height = H;

    // 背景星
    stars = Array.from({length: STAR_COUNT}, ()=>({
      x: Math.random()*W,
      y: Math.random()*H,
      r: (Math.random()*1.1 + 0.25) * DPR,
      a: Math.random()*Math.PI*2,
      w: Math.random()*0.02 + 0.005
    }));

    // 8 大行星（边缘分布：上/右/下/左环绕）
    const margin = 24*DPR;
    planets = [
      // name, baseR, color / gradient builder, position generator
      {name:'Mercury',  r: 5*DPR,  getColor:()=>['#bfbfbf','#8c8c8c'], pos:()=>({x: rand(margin, W*0.35), y: rand(0, margin)})},
      {name:'Venus',    r: 7*DPR,  getColor:()=>['#ffd27e','#ffc061'], pos:()=>({x: rand(W*0.65, W-margin), y: rand(0, margin)})},
      {name:'Earth',    r: 8*DPR,  getColor:()=>['#6fb9ff','#2a87ff'], pos:()=>({x: W - rand(0, margin), y: rand(H*0.15, H*0.4)})},
      {name:'Mars',     r: 6.2*DPR,getColor:()=>['#ff7a6e','#e85a4f'], pos:()=>({x: rand(W*0.65, W-margin), y: H - rand(0, margin)})},
      {name:'Jupiter',  r: 11*DPR, getColor:()=>['#d8a47f','#b87b5f'], pos:()=>({x: rand(W*0.35, W*0.65), y: H - rand(0, margin)})},
      {name:'Saturn',   r: 10*DPR, getColor:()=>['#e9d8a6','#c9b78a'], pos:()=>({x: rand(margin, W*0.35), y: H - rand(0, margin)}), ring:true},
      {name:'Uranus',   r: 8*DPR,  getColor:()=>['#9be7f5','#6fd3e6'], pos:()=>({x: rand(0, margin), y: rand(H*0.55, H*0.85)})},
      {name:'Neptune',  r: 8*DPR,  getColor:()=>['#6699ff','#3f6fe0'], pos:()=>({x: rand(0, margin), y: rand(H*0.15, H*0.45)})},
    ].map(p=>{
      const {x,y} = p.pos();
      return {
        ...p, x, y,
        wob: Math.random()*Math.PI*2, // 漂浮位相
        wobAmp: (1 + Math.random()) * 2 * DPR,
        wobSpeed: 0.003 + Math.random()*0.003
      };
    });
  }

  function rand(a,b){ return Math.random()*(b-a)+a; }

  function drawStar(s){
    const twinkle = (Math.sin(t*s.w + s.a) + 1) * 0.5; // 0~1
    const alpha = 0.14 + twinkle*0.5;
    ctx.fillStyle = `rgba(240, 248, 255, ${alpha})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
  }

  function drawPlanet(p){
    // 漂浮
    p.wob += p.wobSpeed;
    const ox = Math.sin(p.wob) * p.wobAmp;
    const oy = Math.cos(p.wob*0.8) * p.wobAmp*0.6;

    // 渐变球体
    const g = ctx.createRadialGradient(p.x+ox, p.y+oy, 0, p.x+ox, p.y+oy, p.r*2.2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, p.getColor()[0]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x+ox, p.y+oy, p.r*2.2, 0, Math.PI*2); ctx.fill();

    // 本体
    const g2 = ctx.createRadialGradient(p.x+ox, p.y+oy, p.r*0.3, p.x+ox, p.y+oy, p.r);
    g2.addColorStop(0, p.getColor()[0]);
    g2.addColorStop(1, p.getColor()[1]);
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(p.x+ox, p.y+oy, p.r, 0, Math.PI*2); ctx.fill();

    // 土星环
    if (p.ring){
      ctx.save();
      ctx.translate(p.x+ox, p.y+oy);
      ctx.rotate(-0.6);
      ctx.strokeStyle = 'rgba(240,240,240,0.35)';
      ctx.lineWidth = 2.2*DPR;
      ctx.beginPath();
      ctx.ellipse(0,0, p.r*1.6, p.r*0.7, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function step(){
    t += TWINKLE_SPEED;
    ctx.clearRect(0,0,W,H);

    // 背景星
    for(const s of stars) drawStar(s);

    // 行星（围边分布）
    for(const p of planets) drawPlanet(p);

    requestAnimationFrame(step);
  }

  window.addEventListener('resize', resize, { passive:true });
  resize(); step();
})();
