/* 英雄区拓扑网络：力学模拟（吸引/排斥）+ 社区聚类 + 粒子连线（灰/黑细线） */
(function(){
  const canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W=0, H=0;

  // 配置
  const GROUPS = 4;                  // 社区数
  const NODES  = 120;                // 节点数（注意性能）
  const DEGREE = 3;                  // 每点平均目标度（主要内部边）
  const INTER_LINKS = 18;            // 跨社区弱连接条数
  const CHARGE = -120;               // 斥力常量（负值=相互排斥）
  const LINK_K = 0.035;              // 弹簧系数
  const LINK_LEN = 42;               // 理想边长（基础）
  const DAMPING = 0.9;               // 速度阻尼
  const CENTER_PULL = 0.005;         // 向心力
  const MAX_SPEED = 2.2;             // 速度上限
  const LINE_COLOR = 'rgba(10,12,16,0.35)';   // 透明黑/灰
  const LINE_WIDTH = 0.8;            // 默认线宽（DPR前）
  const PARTICLE_PORTION = 0.28;     // 有粒子流的边占比

  const palette = [
    '#8ec5ff', '#6ef3ff', '#a6ffcb', '#ffd6a5', '#ffadad', '#cdb4db'
  ];

  const nodes = [];
  const links = [];
  const particles = []; // 在边上漂移的小粒子

  function randIn(min,max){ return Math.random()*(max-min)+min; }

  function resize(){
    const r = canvas.getBoundingClientRect();
    W = Math.floor(r.width * DPR);
    H = Math.floor(r.height * DPR);
    canvas.width = W; canvas.height = H;
  }

  function init(){
    nodes.length = 0; links.length = 0; particles.length = 0;

    // 初始以社区为中心的高斯分布
    const centers = Array.from({length: GROUPS}, (_,i)=>({
      x: (0.25 + 0.5*(i%2)) * W + randIn(-40,40),
      y: (0.35 + 0.3*Math.floor(i/2)) * H + randIn(-40,40)
    }));

    for(let i=0; i<NODES; i++){
      const g = i % GROUPS;
      const c = centers[g];
      nodes.push({
        id: i,
        g,
        x: c.x + randIn(-80,80),
        y: c.y + randIn(-60,60),
        vx: randIn(-.5,.5),
        vy: randIn(-.5,.5),
        r: (Math.random()*1.2 + 1.0) * DPR,
        color: palette[g % palette.length]
      });
    }

    // 社区内近邻边
    for(let g=0; g<GROUPS; g++){
      const groupNodes = nodes.filter(n=>n.g===g);
      for(const n of groupNodes){
        // 选 k 个近邻
        const nn = groupNodes
          .filter(m => m!==n)
          .sort((a,b)=>{
            const da=(a.x-n.x)**2+(a.y-n.y)**2;
            const db=(b.x-n.x)**2+(b.y-n.y)**2;
            return da-db;
          })
          .slice(0, DEGREE);
        for(const m of nn){
          if (!links.find(e => (e.a===n && e.b===m) || (e.a===m && e.b===n))){
            links.push({ a:n, b:m, w:1.0, len: LINK_LEN*DPR });
          }
        }
      }
    }

    // 跨社区弱连接（更细、透明）
    for(let i=0; i<INTER_LINKS; i++){
      const a = nodes[Math.floor(Math.random()*nodes.length)];
      let b = nodes[Math.floor(Math.random()*nodes.length)];
      let guard=0;
      while((b.g===a.g || b===a) && guard++<10){
        b = nodes[Math.floor(Math.random()*nodes.length)];
      }
      links.push({ a, b, w: 0.5, len: (LINK_LEN+20)*DPR });
    }

    // 边上粒子（部分边启用）
    for(const e of links){
      if (Math.random() < PARTICLE_PORTION){
        particles.push({
          e, t: Math.random(), speed: randIn(0.002, 0.006) // 0~1 的进度
        });
      }
    }
  }

  function applyForces(){
    // 斥力 O(N^2)（N=120可接受）
    for(let i=0;i<nodes.length;i++){
      const n = nodes[i];
      for(let j=i+1;j<nodes.length;j++){
        const m = nodes[j];
        let dx = n.x - m.x, dy = n.y - m.y;
        let d2 = dx*dx + dy*dy + 0.01;
        const f = CHARGE * DPR / d2;
        const fx = f * dx, fy = f * dy;
        n.vx += fx; n.vy += fy;
        m.vx -= fx; m.vy -= fy;
      }
    }

    // 弹簧
    for(const e of links){
      let dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      let d = Math.sqrt(dx*dx + dy*dy) || 0.001;
      const k = LINK_K * e.w;
      const diff = d - e.len;
      const fx = k * diff * (dx/d);
      const fy = k * diff * (dy/d);
      e.a.vx += fx; e.a.vy += fy;
      e.b.vx -= fx; e.b.vy -= fy;
    }

    // 向心力与速度限制
    const cx = W*0.5, cy = H*0.52;
    for(const n of nodes){
      n.vx += (cx - n.x) * CENTER_PULL;
      n.vy += (cy - n.y) * CENTER_PULL;

      n.vx *= DAMPING; n.vy *= DAMPING;

      const sp = Math.hypot(n.vx, n.vy);
      if (sp > MAX_SPEED*DPR){
        n.vx = n.vx/sp * MAX_SPEED*DPR;
        n.vy = n.vy/sp * MAX_SPEED*DPR;
      }

      n.x += n.vx; n.y += n.vy;

      // 边界回弹
      if (n.x < 6*DPR || n.x > W-6*DPR) n.vx *= -0.8;
      if (n.y < 6*DPR || n.y > H-6*DPR) n.vy *= -0.8;
      n.x = Math.max(6*DPR, Math.min(W-6*DPR, n.x));
      n.y = Math.max(6*DPR, Math.min(H-6*DPR, n.y));
    }
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

    // 连线：细、半透明灰/黑
    ctx.lineWidth = Math.max(0.6*DPR, LINE_WIDTH*DPR);
    for(const e of links){
      const alpha = 0.16 * e.w + 0.06; // 弱连接更淡
      ctx.strokeStyle = `rgba(20,24,28,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }

    // 边上粒子（表示交互/流动）
    for(const p of particles){
      p.t += p.speed;
      if (p.t > 1) p.t -= 1;
      const {a,b} = p.e;
      const x = a.x + (b.x - a.x) * p.t;
      const y = a.y + (b.y - a.y) * p.t;
      const r = 1.2*DPR;
      ctx.fillStyle = 'rgba(230,235,240,0.45)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }

    // 节点：按社区上色，核心亮、外晕淡
    for(const n of nodes){
      // 核
      ctx.fillStyle = n.color + 'ee'.replace('ee',''); // 兼容性简化
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fill();
      // 光晕
      const g = ctx.createRadialGradient(n.x,n.y,0, n.x,n.y, n.r*4);
      g.addColorStop(0,'rgba(255,255,255,0.18)');
      g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r*4, 0, Math.PI*2); ctx.fill();
    }
  }

  function step(){
    applyForces();
    draw();
    requestAnimationFrame(step);
  }

  window.addEventListener('resize', ()=>{ resize(); init(); }, { passive:true });
  resize(); init(); step();
})();
