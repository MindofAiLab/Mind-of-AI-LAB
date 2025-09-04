/* 文本轮廓驱动的数学拓扑网络
   - 采样 "Mind-Of-AI" 字形轮廓点作为每个节点的目标位
   - 弹簧力把节点拉到轮廓，叠加微弱流场 → 呼吸动态
   - K近邻细线（灰/黑半透明）+ 部分边粒子流
   - 鼠标交互：邻域斥力（学术演示感）
*/
const TEXT_WIDTH_RATIO = 0.92; // 文字目标宽度占画布比例（0~1），可调大到 0.95
const TEXT_Y_POS = 0.50;       // 文字垂直位置（0~1），0.5 居中，可根据视觉微调
(function(){
  const canvas = document.getElementById('topologyCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha:true });

  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W=0, H=0;

  // 配置
  const TEXT = 'Mind-Of-AI';
  const MAX_POINTS = 800;      // 轮廓采样目标上限（性能友好）
  const GRID_STEP = 6;         // 采样网格步长（像素，乘以 DPR）
  const SPRING = 0.06;         // 指向目标的弹簧系数
  const DAMPING = 0.90;        // 速度阻尼
  const FLOW_A = 0.004;        // 流场扰动强度
  const FLOW_F = 0.0018;       // 流场空间频率
  const MAX_SPEED = 3.0;       // 节点速度上限（DPR 前）
  const K = 4;                 // 每节点近邻数量
  const MAX_DIST = 58;         // 近邻连接阈值（像素，乘以 DPR）
  const EDGE_ALPHA = 0.22;     // 线透明度基线
  const EDGE_ALPHA_NEAR = 0.35;// 更近时的透明度上限
  const EDGE_WIDTH = 0.8;      // 线宽（DPR 前）
  const STREAM_EDGE_RATIO = 0.25; // 带粒子流的边比例
  const STREAM_SPEED = [0.003, 0.007];

  const nodes = [];
  let targets = [];
  let edges = [];
  let streams = [];
  let frame = 0;
  let mouse = {x: -9999, y: -9999, r: 90};

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rand(a,b){ return Math.random()*(b-a)+a; }

  // 高 DPI 大小
  function resize(){
    const r = canvas.getBoundingClientRect();
    W = Math.floor(r.width * DPR);
    H = Math.floor(r.height * DPR);
    canvas.width = W; canvas.height = H;
    buildTargets();
    initNodes();
    buildEdges(); // 初始邻接
    buildStreams();
  }

  // 用离屏画布绘制文本并采样轮廓点
function buildTargets(){
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d');
  octx.clearRect(0,0,W,H);

  // —— 用二分法按目标宽度适配字号（让字样“尽量大”）——
  const desiredWidth = W * TEXT_WIDTH_RATIO;
  let lo = 12 * DPR;
  let hi = Math.min(W, H) * 0.9; // 上界：不超过画布 90%
  let best = lo;

  for (let it=0; it<14; it++){ // 14次迭代足够收敛
    const mid = (lo + hi) * 0.5;
    octx.font = `900 ${mid}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
    const m = octx.measureText(TEXT);
    const w = m.width;
    if (w <= desiredWidth){ best = mid; lo = mid; } else { hi = mid; }
  }

  // 设定最终字号与排版
  const fontPx = best;
  octx.font = `900 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';

  const tx = W * 0.5;
  const ty = H * TEXT_Y_POS; // 默认 0.50（居中）
  octx.fillStyle = '#fff';
  octx.fillText(TEXT, tx, ty);

  // 采样文本像素生成目标点
  const img = octx.getImageData(0,0,W,H).data;
  targets = [];
  const step = Math.max(3, Math.floor(GRID_STEP * DPR));
  for (let y=0; y<H; y+=step){
    for (let x=0; x<W; x+=step){
      const a = img[(y*W + x)*4 + 3];
      if (a > 40) targets.push({x, y});
    }
  }

  // 下采样控制上限
  if (targets.length > MAX_POINTS){
    const keep = [];
    for (let i=0; i<MAX_POINTS; i++){
      keep.push(targets[Math.floor(Math.random()*targets.length)]);
    }
    targets = keep;
  }
}
  function initNodes(){
    nodes.length = 0;
    for(let i=0; i<targets.length; i++){
      const t = targets[i];
      // 节点初始随机，稍后被弹簧拉向目标
      nodes.push({
        x: rand(W*0.2, W*0.8),
        y: rand(H*0.2, H*0.8),
        vx: rand(-0.5, 0.5) * DPR,
        vy: rand(-0.5, 0.5) * DPR,
        tx: t.x, ty: t.y,
        r: (Math.random()*0.8 + 0.8) * DPR,
        hue: 190 + Math.sin(i*0.17)*80 // 学术冷色系波动
      });
    }
  }

  // 简易格网近邻搜索（每 N 帧重建一次）
  function buildEdges(){
    edges = [];
    const cell = Math.max(16, MAX_DIST) * DPR;
    const cols = Math.ceil(W / cell);
    const rows = Math.ceil(H / cell);
    const bins = new Array(cols*rows).fill(0).map(()=>[]);
    const idx = (x,y)=> clamp(Math.floor(x/cell),0,cols-1) + cols * clamp(Math.floor(y/cell),0,rows-1);

    nodes.forEach((n,i)=> bins[idx(n.x, n.y)].push(i));

    for(let i=0;i<nodes.length;i++){
      const n = nodes[i];
      const cx = clamp(Math.floor(n.x/cell),0,cols-1);
      const cy = clamp(Math.floor(n.y/cell),0,rows-1);
      const cand = [];
      for(let yy=cy-1; yy<=cy+1; yy++){
        for(let xx=cx-1; xx<=cx+1; xx++){
          if (xx<0||yy<0||xx>=cols||yy>=rows) continue;
          cand.push(...bins[xx + cols*yy]);
        }
      }
      // K近邻
      const dists = [];
      for(const j of cand){
        if (j===i) continue;
        const m = nodes[j];
        const dx=n.x-m.x, dy=n.y-m.y;
        const d2 = dx*dx + dy*dy;
        if (d2 <= (MAX_DIST*DPR)*(MAX_DIST*DPR)){
          dists.push({j, d2});
        }
      }
      dists.sort((a,b)=>a.d2-b.d2);
      const chosen = dists.slice(0, K);
      for(const c of chosen){
        const a = i, b = c.j;
        if (a < b) edges.push({a,b});
      }
    }
  }

  // 从部分边生成“粒子流”
  function buildStreams(){
    streams = [];
    for(const e of edges){
      if (Math.random() < STREAM_EDGE_RATIO){
        streams.push({
          e, t: Math.random(),
          v: rand(STREAM_SPEED[0], STREAM_SPEED[1])
        });
      }
    }
  }

  // 鼠标交互
  canvas.addEventListener('mousemove', (ev)=>{
    const rect = canvas.getBoundingClientRect();
    mouse.x = (ev.clientX - rect.left) * DPR;
    mouse.y = (ev.clientY - rect.top) * DPR;
  }, {passive:true});
  canvas.addEventListener('mouseleave', ()=>{
    mouse.x = -9999; mouse.y = -9999;
  });

  function step(){
    // 物理更新
    const maxV = MAX_SPEED * DPR;
    const time = performance.now() * 0.001;

    for(const n of nodes){
      // 弹簧力 → 指向目标（文本轮廓）
      n.vx += (n.tx - n.x) * SPRING;
      n.vy += (n.ty - n.y) * SPRING;

      // 微弱流场（可见的数学动态感）
      const fx = Math.sin(n.y*FLOW_F + time*1.3);
      const fy = Math.cos(n.x*FLOW_F + time*1.1);
      n.vx += fx * FLOW_A * DPR;
      n.vy += fy * FLOW_A * DPR;

      // 鼠标斥力（演示交互）
      const dx = n.x - mouse.x, dy = n.y - mouse.y;
      const d2 = dx*dx + dy*dy;
      const rr = (mouse.r*DPR)*(mouse.r*DPR);
      if (d2 < rr){
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d/Math.sqrt(rr)) * 0.8 * DPR;
        n.vx += (dx/d) * f;
        n.vy += (dy/d) * f;
      }

      // 阻尼 & 限速
      n.vx *= DAMPING; n.vy *= DAMPING;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > maxV){ n.vx = n.vx/sp * maxV; n.vy = n.vy/sp * maxV; }

      // 移动
      n.x += n.vx; n.y += n.vy;
    }

    // 周期性重建邻接（省成本）
    if ((frame++ % 24) === 0){ buildEdges(); }

    draw(time);
    requestAnimationFrame(step);
  }

  function draw(time){
    ctx.clearRect(0,0,W,H);

    // 先画边（细灰/黑）
    ctx.lineWidth = Math.max(0.6*DPR, EDGE_WIDTH*DPR);
    for(const e of edges){
      const a = nodes[e.a], b = nodes[e.b];
      const dx=b.x-a.x, dy=b.y-a.y;
      const d = Math.hypot(dx,dy);
      const alpha = clamp(EDGE_ALPHA + (MAX_DIST*DPR - d)/(MAX_DIST*DPR) * (EDGE_ALPHA_NEAR-EDGE_ALPHA), 0.06, EDGE_ALPHA_NEAR);
      ctx.strokeStyle = `rgba(20,24,28,${alpha.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }

    // 粒子流（沿边方向行进的小点）
    for(const s of streams){
      s.t += s.v;
      if (s.t > 1) s.t -= 1;
      const a = nodes[s.e.a], b = nodes[s.e.b];
      const x = a.x + (b.x-a.x)*s.t;
      const y = a.y + (b.y-a.y)*s.t;
      ctx.fillStyle = 'rgba(235,240,245,0.45)';
      ctx.beginPath(); ctx.arc(x, y, 1.1*DPR, 0, Math.PI*2); ctx.fill();
    }

    // 再画节点（细腻发光，冷色系）
    for(const n of nodes){
      const r = Math.max(1.0*DPR, n.r);
      // 核
      ctx.fillStyle = `hsla(${n.hue}, 85%, 72%, 0.95)`;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2); ctx.fill();
      // 光晕
      const g = ctx.createRadialGradient(n.x,n.y,0, n.x,n.y, r*4.5);
      g.addColorStop(0, `hsla(${n.hue}, 90%, 80%, 0.22)`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x, n.y, r*4.5, 0, Math.PI*2); ctx.fill();
    }
  }

  window.addEventListener('resize', resize, { passive:true });
  resize(); step();
})();
