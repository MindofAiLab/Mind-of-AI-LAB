/* 北斗七星：每星拥有彩虹散射核 + 粒子云闪烁 + 学术感连线 */
(function(){
  const canvas = document.getElementById('dipperCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha:true });

  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W=0, H=0; let t=0;

  // 归一化坐标（居中略艺术化）
  const norm = [
    {x:0.16, y:0.46}, // Dubhe
    {x:0.28, y:0.56}, // Merak
    {x:0.40, y:0.50}, // Phecda
    {x:0.51, y:0.52}, // Megrez
    {x:0.62, y:0.45}, // Alioth
    {x:0.74, y:0.52}, // Mizar
    {x:0.84, y:0.60}  // Alkaid
  ];
  const links = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]];

  // 每颗星的粒子云
  const stars = [];
  const PARTICLES_PER_STAR = 80;
  const BASE_R = 2.2; // 核半径基准

  function resize(){
    const r = canvas.getBoundingClientRect();
    W = Math.floor(r.width * DPR);
    H = Math.floor(r.height * DPR);
    canvas.width = W; canvas.height = H;

    stars.length = 0;
    const scale = Math.min(W,H)*0.55;
    for(let i=0;i<norm.length;i++){
      const px = norm[i].x*W, py = norm[i].y*H;
      // 为每颗星生成粒子云（椭圆/环绕）
      const cloud = Array.from({length: PARTICLES_PER_STAR}, ()=>({
        a: Math.random()*Math.PI*2,
        r: (Math.random()*1.0 + 0.6) * 16*DPR,
        o: Math.random()*Math.PI*2,
        s: Math.random()*0.005 + 0.001
      }));
      stars.push({
        x:px, y:py,
        r: BASE_R*DPR*(1 + (i%3)*0.15),
        cloud
      });
    }
  }

  function rainbowGradient(x,y,R){
    const g = ctx.createRadialGradient(x,y,0, x,y,R);
    g.addColorStop(0.00,'rgba(255,255,255,0.95)');
    g.addColorStop(0.18,'rgba(255, 87,  51,0.85)'); // R
    g.addColorStop(0.32,'rgba(255,165,  0,0.75)');  // O
    g.addColorStop(0.46,'rgba(255,255,  0,0.65)');  // Y
    g.addColorStop(0.60,'rgba( 80,220,100,0.55)');  // G
    g.addColorStop(0.74,'rgba( 80,190,255,0.45)');  // C
    g.addColorStop(0.86,'rgba( 70,120,255,0.35)');  // B
    g.addColorStop(1.00,'rgba(150, 80,255,0.00)');  // V → 渐隐
    return g;
  }

  function drawLink(a,b){
    ctx.strokeStyle = 'rgba(110,243,255,0.45)';
    ctx.lineWidth = 1.1*DPR;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    t += 0.015;

    // 连线（先画线，后画星，保证星体在上层）
    for(const [i,j] of links){
      drawLink(stars[i], stars[j]);
    }

    // 逐星绘制
    for(let i=0;i<stars.length;i++){
      const s = stars[i];

      // 粒子云：忽明忽暗
      for(const p of s.cloud){
        p.o += p.s;
        const rr = p.r * (0.85 + 0.15*Math.sin(p.o + i));
        const x = s.x + Math.cos(p.a)*rr;
        const y = s.y + Math.sin(p.a)*rr*0.72; // 椭圆
        const alpha = 0.08 + 0.10*(Math.sin(p.o*2)+1)/2;
        ctx.fillStyle = `rgba(200,245,255,${alpha})`;
        ctx.beginPath(); ctx.arc(x,y, 0.9*DPR, 0, Math.PI*2); ctx.fill();
      }

      // 核心彩虹散射（可见的光线变化）
      const pulse = 1 + 0.18*Math.sin(t*1.2 + i);
      const R = 16*DPR * pulse;
      ctx.fillStyle = rainbowGradient(s.x, s.y, R*2.2);
      ctx.beginPath(); ctx.arc(s.x, s.y, R*2.2, 0, Math.PI*2); ctx.fill();

      // 星核（高亮）
      ctx.fillStyle = 'rgba(240,250,255,0.95)';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*2.2, 0, Math.PI*2); ctx.fill();

      // 小光晕
      const g2 = ctx.createRadialGradient(s.x,s.y,0, s.x,s.y, s.r*8);
      g2.addColorStop(0,'rgba(110,243,255,0.28)');
      g2.addColorStop(1,'rgba(110,243,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*8, 0, Math.PI*2); ctx.fill();
    }
  }

  function loop(){ draw(); requestAnimationFrame(loop); }

  window.addEventListener('resize', resize, { passive:true });
  resize(); loop();
})();
