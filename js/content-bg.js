// /* 内容区·拓扑矩阵⇆高级拓扑形状 形变引擎
//    - 同一批节点：在 Shape（球/环面/莫比乌斯/三叶结）与 Matrix（相关/低秩/社区/SPD）之间弹簧形变
//    - 背景热力矩阵与K近邻灰/黑细线共存；弱透明，不干扰阅读
//    - 高DPI、窗口缩放适配；页面隐藏自动暂停
//    - 快捷键：T 切换形状，M 切换矩阵模式，P 暂停/继续，B Boost演示加速
// */
// (function(){
//   const canvas = document.getElementById('contentBgCanvas');
//   if (!canvas) return;
//   const ctx = canvas.getContext('2d', { alpha: true });

//   // —— 参数区（可按需微调） ——
//   let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
//   const NODES = 900;                // 节点总数（30×30）
//   const GRID_W = 30, GRID_H = 30;  // 矩阵网格（需使 GRID_W*GRID_H >= NODES）
//   const K_NEIGHBOR = 3;            // K近邻（背景线）
//   const LINE_BASE_ALPHA = 0.14;    // 线条基线透明度
//   const LINE_NEAR_ALPHA = 0.24;    // 近时透明度上限
//   const LINE_WIDTH = 0.7;          // 线宽（未乘DPR）
//   const NODE_RADIUS = 0.9;         // 节点小光点半径（未乘DPR）

//   const SPRING = 0.09;             // 形变弹簧系数
//   const DAMPING = 0.88;            // 阻尼
//   const MAX_SPEED = 2.2;           // 限速（未乘DPR）

//   const SHAPE_DURATION = 12.0;     // 每段形状展示时长（秒）
//   const CROSS_FADE = 2.0;          // 形状→矩阵/矩阵→形状的过渡时长（秒）

//   const HEAT_ALPHA = 0.085;        // 矩阵热力块最高透明度
//   const HEAT_CELL = 22;            // 单元像素（未乘DPR），越大计算越省
//   const HEAT_SOFT_TOP_FADE = 220;  // 内建顶部柔和渐隐高度（像素，未乘DPR）

//   const SHAPES = ['sphere','torus','mobius','trefoil'];
//   const MATRICES = ['toeplitz','lowrank','community','spd'];

//   // —— 运行态 ——
//   let running = true, boost = 1.0;
//   let shapeIdx = 0, matrixIdx = 0;
//   let time0 = performance.now()*0.001;
//   let W=0, H=0, SW=0; // 画布宽、高、侧边栏宽（px）

//   // 节点集合（共用，用目标位置切换）
//   const nodes = Array.from({length:NODES}, ()=>({
//     x:0, y:0, vx:0, vy:0, tx:0, ty:0
//   }));
//   let edges = []; // K邻边
//   // 形状目标/矩阵目标（每帧更新）
//   let shapeTargets = new Array(NODES).fill({x:0,y:0});
//   let matrixTargets = new Array(NODES).fill({x:0,y:0});

//   // —— 工具函数 ——
//   const clamp = (v,a,b)=>Math.max(a, Math.min(b, v));
//   const rand = (a,b)=>Math.random()*(b-a)+a;
//   const getSidebarWidthPx = ()=>{
//     const v = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
//     return parseFloat(v || '280');
//   };

//   // 旋转&投影（简单正交投影）
//   const rot3 = (p, ax, ay, az)=>{
//     let {x,y,z} = p;
//     const sx=Math.sin(ax), cx=Math.cos(ax);
//     const sy=Math.sin(ay), cy=Math.cos(ay);
//     const sz=Math.sin(az), cz=Math.cos(az);
//     // 绕X
//     let y1 = y*cx - z*sx, z1 = y*sx + z*cx; x = x; y = y1; z = z1;
//     // 绕Y
//     let x2 = x*cy + z*sy, z2 = -x*sy + z*cy; x = x2; z = z2;
//     // 绕Z
//     let x3 = x*cz - y*sz, y3 = x*sz + y*cz; x = x3; y = y3;
//     return {x,y,z};
//   };

//   // —— 高级拓扑采样（3D） ——
//   function sampleSphere(n){
//     const pts=[];
//     const phi = Math.PI*(3 - Math.sqrt(5)); // 黄金角
//     for(let i=0;i<n;i++){
//       const y = 1 - 2*(i+0.5)/n;  // [-1,1]
//       const r = Math.sqrt(1 - y*y);
//       const th = phi * i;
//       pts.push({x: r*Math.cos(th), y, z: r*Math.sin(th)});
//     }
//     return pts;
//   }
//   function sampleTorus(n, R=1.25, r=0.42){
//     const pts=[];
//     for(let i=0;i<n;i++){
//       const u = i/n * Math.PI*2;
//       const v = ((i*97)%n)/n * Math.PI*2; // 去相关
//       const x = (R + r*Math.cos(v)) * Math.cos(u);
//       const y = (R + r*Math.cos(v)) * Math.sin(u);
//       const z = r*Math.sin(v);
//       pts.push({x,y,z});
//     }
//     return pts;
//   }
//   function sampleMobius(n, w=0.7){
//     const pts=[];
//     for(let i=0;i<n;i++){
//       const u = i/n * Math.PI*2;            // 环向
//       const v = (rand(-w,w));               // 带宽
//       const x = (1 + (v/2)*Math.cos(u/2)) * Math.cos(u);
//       const y = (1 + (v/2)*Math.cos(u/2)) * Math.sin(u);
//       const z = (v/2) * Math.sin(u/2);
//       pts.push({x,y,z});
//     }
//     return pts;
//   }
//   function sampleTrefoil(n){
//     const pts=[];
//     for(let i=0;i<n;i++){
//       const t = i/n * Math.PI*2;
//       // 三叶结中心线
//       let x = Math.sin(t) + 2*Math.sin(2*t);
//       let y = Math.cos(t) - 2*Math.cos(2*t);
//       let z = -Math.sin(3*t);
//       // 轻微粗化（法向抖动）
//       x += 0.08*Math.cos(5*t);
//       y += 0.08*Math.sin(3*t);
//       z += 0.06*Math.cos(4*t);
//       pts.push({x,y,z});
//     }
//     // 归一化
//     const maxR = Math.max(...pts.map(p=>Math.hypot(p.x,p.y,p.z)));
//     return pts.map(p=>({x:p.x/maxR, y:p.y/maxR, z:p.z/maxR}));
//   }

//   // —— 矩阵模式（热力值函数，不逐像素而是按网格Cell） ——
//   function heatValue(mode, i, j, t){
//     // i∈[0,gw), j∈[0,gh)
//     if (mode==='toeplitz'){
//       const L = 5 + 3*Math.sin(t*0.7);
//       const v = Math.exp(-Math.abs(i-j)/L);
//       return v;
//     }
//     if (mode==='lowrank'){
//       // u·v^T：两条随时间缓慢变化的正弦向量
//       const u = 0.5 + 0.5*Math.sin((i*0.3 + t*1.1));
//       const v = 0.5 + 0.5*Math.cos((j*0.27 - t*0.9));
//       return u*v;
//     }
//     if (mode==='community'){
//       // 4个社区块：高亮块对角，非对角弱
//       const c = (idx)=> (idx % 4);
//       const bi = c(i), bj = c(j);
//       const same = (bi===bj) ? 1.0 : 0.18;
//       // 叠加滑动边界增强
//       const wave = 0.15 + 0.15*Math.sin( (i+j)*0.15 + t*0.8 );
//       return same + wave;
//     }
//     if (mode==='spd'){
//       // SPD感：|i-j|相关 + 低秩扰动
//       const base = Math.exp(-Math.abs(i-j)/(3.5+1.2*Math.sin(t*0.6)));
//       const u = Math.sin(i*0.18 + t*0.9), v = Math.sin(j*0.21 - t*1.0);
//       return base + 0.25*(u*v + 1)*0.5;
//     }
//     return 0;
//   }

//   // —— 尺寸与初始化 ——
//   function resize(){
//     SW = getSidebarWidthPx();
//     const cssW = Math.max(0, window.innerWidth - SW);
//     const cssH = window.innerHeight;

//     W = Math.floor(cssW * DPR);
//     H = Math.floor(cssH * DPR);
//     canvas.width = W; canvas.height = H;
//     canvas.style.width = cssW + 'px';
//     canvas.style.height = cssH + 'px';

//     // 初始化节点位置为矩阵网格中心（更稳）
//     setMatrixTargets(true);
//     nodes.forEach((n,idx)=>{
//       const t = matrixTargets[idx];
//       n.x = t.x; n.y = t.y; n.vx = 0; n.vy = 0;
//     });
//     rebuildEdges(); // 初始邻接
//   }

//   // —— 目标更新：形状/矩阵（同样数量的目标） ——
//   function setShapeTargets(shapeName, t){
//     // 采样3D形状 → 旋转 → 正交投影 → 缩放/平移至内容区
//     const pts3 = ({
//       sphere: ()=> sampleSphere(NODES),
//       torus: ()=> sampleTorus(NODES),
//       mobius: ()=> sampleMobius(NODES),
//       trefoil: ()=> sampleTrefoil(NODES)
//     }[shapeName] || sampleSphere)();

//     const ax = t*0.5, ay = t*0.37, az = t*0.23; // 缓慢旋转
//     const S = Math.min(W,H) * 0.36; // 尺寸
//     const cx = W * 0.5, cy = H * 0.58; // 稍偏下，避开英雄区
//     const jitter = 0.007; // 少量扰动避免死板

//     shapeTargets = pts3.map(p=>{
//       const r = rot3(p, ax, ay, az);
//       const x = cx + (r.x + (Math.random()-0.5)*jitter) * S;
//       const y = cy + (r.y + (Math.random()-0.5)*jitter) * S * 0.9; // 轻微Y压缩
//       return {x, y};
//     });
//   }

//   function setMatrixTargets(init=false){
//     const cell = Math.max(12, HEAT_CELL) * DPR;
//     const gw = Math.min(GRID_W, Math.floor(W/cell));
//     const gh = Math.min(GRID_H, Math.floor(H/cell));
//     const used = Math.min(NODES, gw*gh);

//     const startX = (W - gw*cell)*0.5 + cell*0.5;
//     const startY = (H - gh*cell)*0.58 + cell*0.5; // 偏下
//     const targets = [];
//     let idx=0;
//     for(let r=0;r<gh;r++){
//       for(let c=0;c<gw;c++){
//         if (idx++ >= used) break;
//         const x = startX + c*cell;
//         const y = startY + r*cell;
//         targets.push({x,y});
//       }
//     }
//     // 如果节点多于格子，随机回填（一般NODES=gw*gh恰好）
//     while(targets.length < NODES){
//       targets.push(targets[Math.floor(Math.random()*targets.length)]);
//     }
//     matrixTargets = targets;
//     if (init) return;
//   }

//   // —— K近邻：格网桶加速，每隔若干帧重建 ——
//   function rebuildEdges(){
//     edges = [];
//     const cell = 60 * DPR;
//     const cols = Math.ceil(W/cell), rows = Math.ceil(H/cell);
//     const bins = new Array(cols*rows).fill(0).map(()=>[]);
//     const idx = (x,y)=> clamp(Math.floor(x/cell),0,cols-1) + cols*clamp(Math.floor(y/cell),0,rows-1);
//     nodes.forEach((n,i)=> bins[idx(n.x,n.y)].push(i));

//     for(let i=0;i<nodes.length;i++){
//       const n = nodes[i];
//       const cx = clamp(Math.floor(n.x/cell),0,cols-1);
//       const cy = clamp(Math.floor(n.y/cell),0,rows-1);
//       const cand=[];
//       for(let yy=cy-1; yy<=cy+1; yy++){
//         for(let xx=cx-1; xx<=cx+1; xx++){
//           if (xx<0||yy<0||xx>=cols||yy>=rows) continue;
//           cand.push(...bins[xx + cols*yy]);
//         }
//       }
//       const dists=[];
//       for(const j of cand){
//         if (j===i) continue;
//         const m = nodes[j];
//         const dx=n.x-m.x, dy=n.y-m.y;
//         const d2 = dx*dx + dy*dy;
//         dists.push({j, d2});
//       }
//       dists.sort((a,b)=>a.d2-b.d2);
//       const chosen = dists.slice(0, K_NEIGHBOR);
//       for(const c of chosen){
//         const a=i, b=c.j;
//         if (a<b) edges.push({a,b});
//       }
//     }
//   }

//   // —— 矩阵热力绘制（按 Cell 渲染，弱透明） ——
//   function drawHeat(t){
//     const cell = Math.max(12, HEAT_CELL) * DPR;
//     const gw = Math.floor(W/cell);
//     const gh = Math.floor(H/cell);

//     // 顶部柔和淡出（避免与英雄区叠色）
//     const fadeTopPx = HEAT_SOFT_TOP_FADE * DPR;

//     for(let r=0;r<gh;r++){
//       for(let c=0;c<gw;c++){
//         const val = heatValue(MATRICES[matrixIdx], c, r, t);
//         if (val <= 0) continue;
//         // 透明度映射与顶部衰减
//         const topFade = clamp((r*cell - fadeTopPx)/(H*0.5), 0, 1);
//         const alpha = HEAT_ALPHA * clamp(val, 0, 1) * topFade;
//         if (alpha < 0.01) continue;

//         ctx.fillStyle = `rgba(215,230,255,${alpha.toFixed(3)})`;
//         const x = c*cell, y = r*cell;
//         ctx.fillRect(x, y, cell*0.9, cell*0.9);
//       }
//     }
//   }

//   // —— 线条网络绘制（灰/黑细线 + 微光点） ——
//   function drawNetwork(){
//     ctx.lineWidth = Math.max(0.6*DPR, LINE_WIDTH*DPR);
//     for(const e of edges){
//       const a = nodes[e.a], b = nodes[e.b];
//       const dx=b.x-a.x, dy=b.y-a.y;
//       const d = Math.hypot(dx,dy);
//       const alpha = clamp(LINE_BASE_ALPHA + (120*DPR - d)/(120*DPR) * (LINE_NEAR_ALPHA - LINE_BASE_ALPHA), 0.05, LINE_NEAR_ALPHA);
//       ctx.strokeStyle = `rgba(18,22,26,${alpha.toFixed(3)})`;
//       ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
//     }
//     // 微光点
//     for(const n of nodes){
//       ctx.fillStyle = 'rgba(235,242,255,0.06)';
//       ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.0*DPR, NODE_RADIUS*DPR), 0, Math.PI*2); ctx.fill();
//     }
//   }

//   // —— 主循环：形状/矩阵时序控制与弹簧形变 ——
//   function tick(){
//     if (!running) return;

//     const now = performance.now()*0.001;
//     const t = (now - time0) * boost;

//     // 周期：Shape(SHAPE_DURATION) → Cross(CROSS_FADE) → Matrix(SHAPE_DURATION) → Cross → …
//     const cycle = SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION + CROSS_FADE;
//     const tt = t % cycle;

//     let inShape=true, fade=0; // fade: 0=纯Shape，1=纯Matrix
//     if (tt < SHAPE_DURATION){ inShape = true; fade = 0; }
//     else if (tt < SHAPE_DURATION + CROSS_FADE){ inShape = true; fade = (tt - SHAPE_DURATION)/CROSS_FADE; }
//     else if (tt < SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION){ inShape = false; fade = 1; }
//     else { inShape = false; fade = 1 - (tt - (SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION))/CROSS_FADE; }

//     // 每段开始时切换形状 / 矩阵模式（更有“场景感”）
//     const prevIdxShape = shapeIdx, prevIdxMat = matrixIdx;
//     if (Math.abs((t % cycle) - 0) < 0.016) shapeIdx = (shapeIdx+1)%SHAPES.length;
//     if (Math.abs((t % cycle) - (SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION)) < 0.016) matrixIdx = (matrixIdx+1)%MATRICES.length;
//     // 更新目标
//     setShapeTargets(SHAPES[shapeIdx], t);
//     if ((prevIdxMat!==matrixIdx) || (t%2.5 < 0.016)) setMatrixTargets(false);

//     // 节点弹簧指向：在两个目标之间做线性插值，体现“形变”
//     for(let i=0;i<NODES;i++){
//       const sa = shapeTargets[i], mb = matrixTargets[i];
//       const tx = sa.x*(1-fade) + mb.x*fade;
//       const ty = sa.y*(1-fade) + mb.y*fade;
//       const n = nodes[i];

//       n.vx += (tx - n.x) * SPRING;
//       n.vy += (ty - n.y) * SPRING;

//       // 顶部轻微流场扰动（让底纹更“活”）
//       const fx = Math.sin((n.y*0.0012 + t*0.7));
//       const fy = Math.cos((n.x*0.0010 - t*0.6));
//       n.vx += fx * 0.12 * DPR * (1 - fade*0.4);
//       n.vy += fy * 0.12 * DPR * (1 - fade*0.4);

//       // 阻尼与限速
//       n.vx *= DAMPING; n.vy *= DAMPING;
//       const maxV = MAX_SPEED * DPR;
//       const sp = Math.hypot(n.vx, n.vy);
//       if (sp > maxV){ n.vx = n.vx/sp * maxV; n.vy = n.vy/sp * maxV; }

//       n.x += n.vx; n.y += n.vy;
//     }

//     // 重建邻接（稀疏频度）
//     if (Math.floor(t*60) % 30 === 0) rebuildEdges();

//     // —— 绘制序列 —— //
//     ctx.clearRect(0,0,W,H);

//     // 先铺矩阵热力（fade越大越明显）
//     ctx.save();
//     ctx.globalAlpha = 0.9; // 主控
//     drawHeat(t);
//     ctx.restore();

//     // 再绘制K近邻网络（始终存在，但在纯矩阵期仍提供“数学感”）
//     drawNetwork();

//     requestAnimationFrame(tick);
//   }

//   // —— 生命周期与交互 —— //
//   window.addEventListener('resize', resize, {passive:true});
//   document.addEventListener('visibilitychange', ()=>{
//     running = (document.visibilityState === 'visible');
//     if (running) requestAnimationFrame(tick);
//   });

//   // 演示快捷键：T/M/P/B
//   window.addEventListener('keydown', (e)=>{
//     if (e.key==='T' || e.key==='t'){ shapeIdx = (shapeIdx+1)%SHAPES.length; }
//     if (e.key==='M' || e.key==='m'){ matrixIdx = (matrixIdx+1)%MATRICES.length; }
//     if (e.key==='P' || e.key==='p'){ running = !running; if (running) requestAnimationFrame(tick); }
//     if (e.key==='B' || e.key==='b'){ boost = (boost===1.0? 1.8 : 1.0); }
//   });

//   // 首次启动
//   resize();
//   requestAnimationFrame(tick);
// })();





/* 内容区·拓扑矩阵⇆高级拓扑形状 形变引擎（增强色彩可读性）
   - 新增：按模式的科学配色梯度（Sphere/Torus/Mobius/Trefoil & Toeplitz/LowRank/Community/SPD）
   - 新增：矩阵热力采用“屏幕叠加”(screen) 提升亮度（不改变底色），并随时间轻微色相呼吸
   - 新增：形状阶段为网络边/节点添加克制的彩色高光（随 fade 渐入/渐出）
   - 仍保持：高DPI、节能、独占绘制、导航右侧固定覆盖
   - 快捷键：T/M/P/B（同原版）
*/
(function(){
  const canvas = document.getElementById('contentBgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  // —— 参数（可根据喜好微调） ——
  let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const NODES = 900;                // 节点总数（30×30）
  const GRID_W = 30, GRID_H = 30;   // 矩阵网格（需使 GRID_W*GRID_H >= NODES）
  const K_NEIGHBOR = 3;             // K近邻（背景线）

  // 线条与节点
  const LINE_BASE_ALPHA = 0.14;     // 灰/黑线基线透明度
  const LINE_NEAR_ALPHA = 0.26;     // 近时透明度上限（略提）
  const LINE_WIDTH = 0.7;           // 基线宽（未乘DPR）
  const NODE_RADIUS = 0.9;          // 小点半径（未乘DPR）
  const LINE_COLOR_STRENGTH = 0.55; // 彩色高光占比（0~1），越大越显色
  const NODE_GLOW_STRENGTH = 0.55;  // 节点彩色光晕强度（0~1）

  // 形变物理
  const SPRING = 0.09;
  const DAMPING = 0.88;
  const MAX_SPEED = 2.2;

  // 时序
  const SHAPE_DURATION = 12.0;
  const CROSS_FADE = 2.0;

  // 矩阵热力
  let HEAT_ALPHA = 0.12;            // 比原来更亮
  const HEAT_CELL = 22;
  const HEAT_SOFT_TOP_FADE = 220;
  const HEAT_BLEND = 'screen';      // 'screen' 或 'lighter'；改回 'source-over' 则为普通叠加
  const COLOR_BREATH = 6.0;         // 色相呼吸周期（秒）

  const SHAPES = ['sphere','torus','mobius','trefoil'];
  const MATRICES = ['toeplitz','lowrank','community','spd'];

  // —— 运行态 ——
  let running = true, boost = 1.0;
  let shapeIdx = 0, matrixIdx = 0;
  let time0 = performance.now()*0.001;
  let W=0, H=0, SW=0;
  let gFade = 0; // 0=纯形状；1=纯矩阵，用于颜色过渡

  // 节点与边
  const nodes = Array.from({length:NODES}, () => ({ x:0, y:0, vx:0, vy:0, tx:0, ty:0 }));
  let edges = [];
  let shapeTargets = new Array(NODES).fill({x:0,y:0});
  let matrixTargets = new Array(NODES).fill({x:0,y:0});

  // 颜色辅助
  const clamp = (v,a,b)=>Math.max(a, Math.min(b, v));
  const rand = (a,b)=>Math.random()*(b-a)+a;
  const lerp = (a,b,t)=>a+(b-a)*t;
  const lerpHue = (h1,h2,t)=>{
    let d = ((h2-h1+540)%360)-180; // 最短角度差
    return (h1 + d*t + 360) % 360;
  };
  const hsl = (h,s,l,a=1)=>`hsla(${(h%360+360)%360}, ${clamp(s,0,100)}%, ${clamp(l,0,100)}%, ${clamp(a,0,1)})`;

  // 每个模式的基色（HSL）：用低饱和+较高亮度，屏幕叠加下不刺眼
  const SHAPE_HUES = { sphere: 200, torus: 280, mobius: 335, trefoil: 120 };
  const MATRIX_HUES = { toeplitz: 195, lowrank: 270, community: 35, spd: 155 };

  // JSON: 资源 -> 暂无

  // 布局相关
  const getSidebarWidthPx = ()=>{
    const v = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
    return parseFloat(v || '280');
  };

  // 旋转&投影
  const rot3 = (p, ax, ay, az)=>{
    let {x,y,z} = p;
    const sx=Math.sin(ax), cx=Math.cos(ax);
    const sy=Math.sin(ay), cy=Math.cos(ay);
    const sz=Math.sin(az), cz=Math.cos(az);
    let y1 = y*cx - z*sx, z1 = y*sx + z*cx; y = y1; z = z1;
    let x2 = x*cy + z*sy, z2 = -x*sy + z*cy; x = x2; z = z2;
    let x3 = x*cz - y*sz, y3 = x*sz + y*cz; x = x3; y = y3;
    return {x,y,z};
  };

  // —— 拓扑采样 —— //
  function sampleSphere(n){
    const pts=[], phi = Math.PI*(3 - Math.sqrt(5));
    for(let i=0;i<n;i++){
      const y = 1 - 2*(i+0.5)/n;
      const r = Math.sqrt(1 - y*y);
      const th = phi * i;
      pts.push({x: r*Math.cos(th), y, z: r*Math.sin(th)});
    }
    return pts;
  }
  function sampleTorus(n, R=1.25, r=0.42){
    const pts=[];
    for(let i=0;i<n;i++){
      const u = i/n * Math.PI*2;
      const v = ((i*97)%n)/n * Math.PI*2;
      const x = (R + r*Math.cos(v)) * Math.cos(u);
      const y = (R + r*Math.cos(v)) * Math.sin(u);
      const z = r*Math.sin(v);
      pts.push({x,y,z});
    }
    return pts;
  }
  function sampleMobius(n, w=0.7){
    const pts=[];
    for(let i=0;i<n;i++){
      const u = i/n * Math.PI*2;
      const v = rand(-w,w);
      const x = (1 + (v/2)*Math.cos(u/2)) * Math.cos(u);
      const y = (1 + (v/2)*Math.cos(u/2)) * Math.sin(u);
      const z = (v/2) * Math.sin(u/2);
      pts.push({x,y,z});
    }
    return pts;
  }
  function sampleTrefoil(n){
    const pts=[];
    for(let i=0;i<n;i++){
      const t = i/n * Math.PI*2;
      let x = Math.sin(t) + 2*Math.sin(2*t);
      let y = Math.cos(t) - 2*Math.cos(2*t);
      let z = -Math.sin(3*t);
      x += 0.08*Math.cos(5*t);
      y += 0.08*Math.sin(3*t);
      z += 0.06*Math.cos(4*t);
      pts.push({x,y,z});
    }
    const maxR = Math.max(...pts.map(p=>Math.hypot(p.x,p.y,p.z)));
    return pts.map(p=>({x:p.x/maxR, y:p.y/maxR, z:p.z/maxR}));
  }

  // —— 矩阵热力值 —— //
  function heatValue(mode, i, j, t){
    if (mode==='toeplitz'){
      const L = 5 + 3*Math.sin(t*0.7);
      return Math.exp(-Math.abs(i-j)/L);
    }
    if (mode==='lowrank'){
      const u = 0.5 + 0.5*Math.sin(i*0.3 + t*1.1);
      const v = 0.5 + 0.5*Math.cos(j*0.27 - t*0.9);
      return u*v;
    }
    if (mode==='community'){
      const c = idx => (idx % 4);
      const same = (c(i)===c(j)) ? 1.0 : 0.18;
      const wave = 0.15 + 0.15*Math.sin((i+j)*0.15 + t*0.8);
      return same + wave;
    }
    if (mode==='spd'){
      const base = Math.exp(-Math.abs(i-j)/(3.5+1.2*Math.sin(t*0.6)));
      const u = Math.sin(i*0.18 + t*0.9), v = Math.sin(j*0.21 - t*1.0);
      return base + 0.25*(u*v + 1)*0.5;
    }
    return 0;
  }

  // —— 矩阵配色（返回 hsla 字符串） —— //
  function matrixColor(mode, i, j, val, t){
    const hueBase = MATRIX_HUES[mode] ?? 200;
    // 色相轻微呼吸，避免静态单色
    const hueBreath = Math.sin((t % COLOR_BREATH) / COLOR_BREATH * Math.PI*2) * 10; // ±10°
    let h, s, l;

    if (mode==='toeplitz'){
      // 青绿 → 天青 → 靛蓝
      const h1 = hueBase - 15; // 近青绿
      const h2 = hueBase + 0;  // 青
      const h3 = hueBase + 35; // 向蓝
      const vv = clamp(val, 0, 1);
      if (vv < 0.5){
        h = lerpHue(h1, h2, vv/0.5);
        s = 55; l = lerp(58, 66, vv/0.5);
      }else{
        h = lerpHue(h2, h3, (vv-0.5)/0.5);
        s = 62; l = lerp(66, 60, (vv-0.5)/0.5);
      }
    } else if (mode==='lowrank'){
      // 洋红 → 紫罗兰 → 青
      const h1 = 300, h2 = 270, h3 = 200;
      const vv = clamp(Math.pow(val, 0.85), 0, 1);
      if (vv < 0.5){
        h = lerpHue(h1, h2, vv/0.5); s = 60; l = lerp(60, 66, vv/0.5);
      }else{
        h = lerpHue(h2, h3, (vv-0.5)/0.5); s = 62; l = lerp(66, 62, (vv-0.5)/0.5);
      }
    } else if (mode==='community'){
      // 分块强调：按 (i%4) 选色，亮度由 val 控制
      const palette = [35, 195, 330, 120]; // 橙、海蓝、品红、青绿
      const hp = palette[(i%4)];
      h = hp; s = 65; l = lerp(40, 68, clamp(val,0,1));
    } else if (mode==='spd'){
      // 黄绿 → 青绿 → 青
      const h1 = 95, h2 = 155, h3 = 195;
      const vv = clamp(val, 0, 1);
      if (vv < 0.5){
        h = lerpHue(h1, h2, vv/0.5); s = 58; l = lerp(58, 68, vv/0.5);
      }else{
        h = lerpHue(h2, h3, (vv-0.5)/0.5); s = 62; l = lerp(68, 62, (vv-0.5)/0.5);
      }
    } else {
      h = hueBase; s = 50; l = 62;
    }

    h = (h + hueBreath) % 360;
    // 根据全局 fade 与模式，略提饱和度与亮度，确保足够可辨
    const boost = lerp(1.0, 1.15, 1.0); // 可调
    return hsl(h, s*boost, l*boost, 1);
  }

  // —— 尺寸与初始化 —— //
  function resize(){
    SW = getSidebarWidthPx();
    const cssW = Math.max(0, window.innerWidth - SW);
    const cssH = window.innerHeight;

    W = Math.floor(cssW * DPR);
    H = Math.floor(cssH * DPR);
    canvas.width = W; canvas.height = H;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    setMatrixTargets(true);
    nodes.forEach((n,idx)=>{
      const t = matrixTargets[idx];
      n.x = t.x; n.y = t.y; n.vx = 0; n.vy = 0;
    });
    rebuildEdges();
  }

  // —— 目标更新 —— //
  function setShapeTargets(shapeName, t){
    const pts3 = ({
      sphere: ()=> sampleSphere(NODES),
      torus: ()=> sampleTorus(NODES),
      mobius: ()=> sampleMobius(NODES),
      trefoil: ()=> sampleTrefoil(NODES)
    }[shapeName] || sampleSphere)();

    const ax = t*0.5, ay = t*0.37, az = t*0.23;
    const S = Math.min(W,H) * 0.36;
    const cx = W * 0.5, cy = H * 0.58;
    const jitter = 0.007;

    shapeTargets = pts3.map(p=>{
      const r = rot3(p, ax, ay, az);
      const x = cx + (r.x + (Math.random()-0.5)*jitter) * S;
      const y = cy + (r.y + (Math.random()-0.5)*jitter) * S * 0.9;
      return {x, y};
    });
  }

  function setMatrixTargets(init=false){
    const cell = Math.max(12, HEAT_CELL) * DPR;
    const gw = Math.min(GRID_W, Math.floor(W/cell));
    const gh = Math.min(GRID_H, Math.floor(H/cell));
    const used = Math.min(NODES, gw*gh);

    const startX = (W - gw*cell)*0.5 + cell*0.5;
    const startY = (H - gh*cell)*0.58 + cell*0.5;
    const targets = [];
    let idx=0;
    for(let r=0;r<gh;r++){
      for(let c=0;c<gw;c++){
        if (idx++ >= used) break;
        const x = startX + c*cell;
        const y = startY + r*cell;
        targets.push({x,y});
      }
    }
    while(targets.length < NODES){
      targets.push(targets[Math.floor(Math.random()*targets.length)]);
    }
    matrixTargets = targets;
    if (init) return;
  }

  // —— K近邻 —— //
  function rebuildEdges(){
    edges = [];
    const cell = 60 * DPR;
    const cols = Math.ceil(W/cell), rows = Math.ceil(H/cell);
    const bins = new Array(cols*rows).fill(0).map(()=>[]);
    const idx = (x,y)=> clamp(Math.floor(x/cell),0,cols-1) + cols*clamp(Math.floor(y/cell),0,rows-1);
    nodes.forEach((n,i)=> bins[idx(n.x,n.y)].push(i));

    for(let i=0;i<nodes.length;i++){
      const n = nodes[i];
      const cx = clamp(Math.floor(n.x/cell),0,cols-1);
      const cy = clamp(Math.floor(n.y/cell),0,rows-1);
      const cand=[];
      for(let yy=cy-1; yy<=cy+1; yy++){
        for(let xx=cx-1; xx<=cx+1; xx++){
          if (xx<0||yy<0||xx>=cols||yy>=rows) continue;
          cand.push(...bins[xx + cols*yy]);
        }
      }
      const dists=[];
      for(const j of cand){
        if (j===i) continue;
        const m = nodes[j];
        const dx=n.x-m.x, dy=n.y-m.y;
        const d2 = dx*dx + dy*dy;
        dists.push({j, d2});
      }
      dists.sort((a,b)=>a.d2-b.d2);
      const chosen = dists.slice(0, K_NEIGHBOR);
      for(const c of chosen){
        const a=i, b=c.j;
        if (a<b) edges.push({a,b});
      }
    }
  }

  // —— 矩阵热力（彩色） —— //
  function drawHeat(t){
    const cell = Math.max(12, HEAT_CELL) * DPR;
    const gw = Math.floor(W/cell);
    const gh = Math.floor(H/cell);
    const fadeTopPx = HEAT_SOFT_TOP_FADE * DPR;

    // 彩色叠加模式
    const prevComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = HEAT_BLEND; // 'screen' 推荐

    for(let r=0; r<gh; r++){
      for(let c=0; c<gw; c++){
        const val = heatValue(MATRICES[matrixIdx], c, r, t);
        if (val <= 0) continue;
        const topFade = clamp((r*cell - fadeTopPx)/(H*0.5), 0, 1);
        const alpha = HEAT_ALPHA * clamp(val, 0, 1) * topFade;
        if (alpha < 0.01) continue;

        const col = matrixColor(MATRICES[matrixIdx], c, r, val, t);
        // 将 hsla 转为 rgba 字符串时，ctx 可直接接受 hsla
        ctx.fillStyle = col.replace('hsla', 'hsla').replace('1)', `${alpha.toFixed(3)})`);
        const x = c*cell, y = r*cell;
        ctx.fillRect(x, y, cell*0.9, cell*0.9);
      }
    }
    ctx.globalCompositeOperation = prevComposite;
  }

  // —— 线条与节点（叠加彩色高光） —— //
  function drawNetwork(t){
    // 1) 基础灰/黑网络（原样）
    ctx.lineWidth = Math.max(0.6*DPR, LINE_WIDTH*DPR);
    for(const e of edges){
      const a = nodes[e.a], b = nodes[e.b];
      const dx=b.x-a.x, dy=b.y-a.y;
      const d = Math.hypot(dx,dy);
      const alpha = clamp(LINE_BASE_ALPHA + (120*DPR - d)/(120*DPR) * (LINE_NEAR_ALPHA - LINE_BASE_ALPHA), 0.05, LINE_NEAR_ALPHA);
      ctx.strokeStyle = `rgba(18,22,26,${alpha.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }

    // 2) 形状阶段的彩色高光（随着 gFade→0 更明显；矩阵阶段几乎看不见）
    const shapeName = SHAPES[shapeIdx];
    const hueBase = lerpHue(SHAPE_HUES[shapeName]||200, MATRIX_HUES[MATRICES[matrixIdx]]||200, gFade);
    const colorAlphaScale = (1 - gFade) * LINE_COLOR_STRENGTH; // 从形状到矩阵逐渐减弱

    if (colorAlphaScale > 0.02){
      const prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'screen'; // 彩色高光更显
      ctx.lineWidth = Math.max(0.45*DPR, LINE_WIDTH*0.85*DPR);

      for(const e of edges){
        const a = nodes[e.a], b = nodes[e.b];
        const dx=b.x-a.x, dy=b.y-a.y;
        const d = Math.hypot(dx,dy);
        const nearAlpha = clamp((120*DPR - d)/(120*DPR), 0, 1);
        const alpha = nearAlpha * colorAlphaScale * 0.85;

        // 沿边方向轻微色相变化，增强动态感
        const dir = Math.atan2(dy,dx);
        const h = (hueBase + Math.sin(dir + t*0.6)*18 + (e.a%7)*2) % 360;
        const s = 62, l = 64;
        ctx.strokeStyle = hsl(h, s, l, alpha);
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }

      // 节点彩色光晕（非常克制）
      for(const n of nodes){
        const h = (hueBase + (n.x+n.y)*0.0005 + t*8) % 360;
        const s = 70, l = 70;
        const r = Math.max(1.0*DPR, NODE_RADIUS*DPR);
        const g = ctx.createRadialGradient(n.x,n.y,0, n.x,n.y, r*4.0);
        g.addColorStop(0.0, hsl(h, s, l, 0.22*NODE_GLOW_STRENGTH*(1-gFade)));
        g.addColorStop(1.0, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, r*4.0, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalCompositeOperation = prevComp;
    }

    // 3) 微光点（原淡蓝→略提）
    for(const n of nodes){
      ctx.fillStyle = 'rgba(235,242,255,0.09)';
      ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.0*DPR, NODE_RADIUS*DPR), 0, Math.PI*2); ctx.fill();
    }
  }

  // —— 主循环 —— //
  function tick(){
    if (!running) return;

    const now = performance.now()*0.001;
    const t = (now - time0) * boost;

    const cycle = SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION + CROSS_FADE;
    const tt = t % cycle;

    let inShape=true, fade=0;
    if (tt < SHAPE_DURATION){ inShape = true; fade = 0; }
    else if (tt < SHAPE_DURATION + CROSS_FADE){ inShape = true; fade = (tt - SHAPE_DURATION)/CROSS_FADE; }
    else if (tt < SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION){ inShape = false; fade = 1; }
    else { inShape = false; fade = 1 - (tt - (SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION))/CROSS_FADE; }
    gFade = fade;

    const prevIdxMat = matrixIdx;
    if (Math.abs((t % cycle) - 0) < 0.016) shapeIdx = (shapeIdx+1)%SHAPES.length;
    if (Math.abs((t % cycle) - (SHAPE_DURATION + CROSS_FADE + SHAPE_DURATION)) < 0.016) matrixIdx = (matrixIdx+1)%MATRICES.length;

    setShapeTargets(SHAPES[shapeIdx], t);
    if ((prevIdxMat!==matrixIdx) || (t%2.5 < 0.016)) setMatrixTargets(false);

    for(let i=0;i<NODES;i++){
      const sa = shapeTargets[i], mb = matrixTargets[i];
      const tx = sa.x*(1-fade) + mb.x*fade;
      const ty = sa.y*(1-fade) + mb.y*fade;
      const n = nodes[i];

      n.vx += (tx - n.x) * SPRING;
      n.vy += (ty - n.y) * SPRING;

      const fx = Math.sin((n.y*0.0012 + t*0.7));
      const fy = Math.cos((n.x*0.0010 - t*0.6));
      n.vx += fx * 0.12 * DPR * (1 - fade*0.4);
      n.vy += fy * 0.12 * DPR * (1 - fade*0.4);

      n.vx *= DAMPING; n.vy *= DAMPING;
      const maxV = MAX_SPEED * DPR;
      const sp = Math.hypot(n.vx, n.vy);
      if (sp > maxV){ n.vx = n.vx/sp * maxV; n.vy = n.vy/sp * maxV; }

      n.x += n.vx; n.y += n.vy;
    }

    if (Math.floor(t*60) % 30 === 0) rebuildEdges();

    ctx.clearRect(0,0,W,H);

    // 矩阵热力（彩色 & 叠加）
    ctx.save();
    ctx.globalAlpha = 0.92;  // 主控透明度
    drawHeat(t);
    ctx.restore();

    // 网络+节点（含彩色高光）
    drawNetwork(t);

    requestAnimationFrame(tick);
  }

  // —— 生命周期与交互 —— //
  window.addEventListener('resize', resize, {passive:true});
  document.addEventListener('visibilitychange', ()=>{
    running = (document.visibilityState === 'visible');
    if (running) requestAnimationFrame(tick);
  });

  window.addEventListener('keydown', (e)=>{
    if (e.key==='T' || e.key==='t'){ shapeIdx = (shapeIdx+1)%SHAPES.length; }
    if (e.key==='M' || e.key==='m'){ matrixIdx = (matrixIdx+1)%MATRICES.length; }
    if (e.key==='P' || e.key==='p'){ running = !running; if (running) requestAnimationFrame(tick); }
    if (e.key==='B' || e.key==='b'){ boost = (boost===1.0? 1.8 : 1.0); }
  });

  // 首次启动
  resize();
  requestAnimationFrame(tick);
})();
