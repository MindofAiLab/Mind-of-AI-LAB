/* 为“学术展示 / 人员展示”提供轻度视差与激活动画节能 */
(function(){
  const sections = Array.from(document.querySelectorAll('.content-section.centered'));
  if (!sections.length) return;

  let mx = 0, my = 0;  // 归一化 -1~1
  let raf = null;

  function onMove(e){
    // 只计算导航右侧区域的相对位置
    const main = document.querySelector('.main');
    if (!main) return;
    const r = main.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    const y = (e.clientY - r.top)  / Math.max(1, r.height);
    mx = (x - 0.5) * 2;  // -1~1
    my = (y - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(apply);
  }

  function apply(){
    raf = null;
    // 仅对“可见的/active”的 section 应用（节能）
    sections.forEach(sec=>{
      if (!sec.classList.contains('active')) return;
      sec.style.setProperty('--mx', (mx*20).toFixed(2) + 'px');
      sec.style.setProperty('--my', (my*20).toFixed(2) + 'px');
    });
  }

  // 页面不可见时暂停一次性更新
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState !== 'visible') { mx = my = 0; apply(); }
  });

  // 鼠标与触控
  document.addEventListener('mousemove', onMove, { passive:true });
  document.addEventListener('touchmove', (e)=>{
    if (!e.touches || !e.touches[0]) return;
    onMove(e.touches[0]);
  }, { passive:true });
})();
