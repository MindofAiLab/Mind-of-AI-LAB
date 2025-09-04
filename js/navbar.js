/* 单页导航路由：独占激活 + 别名映射 + hash 支持 */
(function(){
  const links = Array.from(document.querySelectorAll('.nav-link, [data-target], [data-section]'));
  const main  = document.querySelector('main');

  if (!main) return;

  // 统一收集 main 下的所有 section（不包含顶部 hero）
  const sections = Array.from(main.querySelectorAll(':scope > section'));

  // 路由别名：左侧导航的 key → 实际 section id
  const idMap = {
    home: 'home',
    showcase: 'section-overview',
    people: 'section-members',
    funding: 'funding',
    resources: 'resources',
    // 兼容早先 data-section 的命名
    overview: 'section-overview',
    members: 'section-members'
  };

  // 由元素读取目标 key
  function getKeyFromEl(el){
    return el?.dataset?.target || el?.dataset?.section ||
           (el?.getAttribute?.('href') || '').replace('#','');
  }

  function show(key){
    const canon = key && idMap[key] ? key : // 已知 key
                  (Object.values(idMap).includes(key) ? // 直接传了真实 id
                    Object.keys(idMap).find(k=>idMap[k]===key) : 'home');

    const id = idMap[canon] || 'home';

    // 切换 active/hidden（独占激活）
    sections.forEach(sec=>{
      const active = (sec.id === id);
      sec.classList.toggle('active', active);
      if (active) {
        sec.removeAttribute('hidden');
        // 提升可访问性：把焦点交给当前块，但不强制滚动
        sec.focus?.({preventScroll:true});
      } else {
        sec.setAttribute('hidden','');
      }
    });

    // 高亮左侧导航
    links.forEach(a=>{
      const k = getKeyFromEl(a);
      const match = (k ? (idMap[k] || k) : '') === id;
      a.classList.toggle('active', match);
      if (match) a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });

    // 更新 hash（使用导航的规范 key，保持 #home/#showcase 等可分享）
    const newHash = '#' + canon;
    if (location.hash !== newHash) history.replaceState(null, '', newHash);
  }

  // 监听点击（阻止默认跳转，改走单页路由）
  links.forEach(a=>{
    a.addEventListener('click', (e)=>{
      const key = getKeyFromEl(a);
      if (!key) return;
      e.preventDefault();
      show(key);
    });
  });

  // 支持直接访问 hash（#showcase/#people/#funding/...）
  function initFromHash(){
    const raw = (location.hash || '#home').slice(1);
    const key = raw || 'home';
    show(key);
  }
  window.addEventListener('hashchange', initFromHash);

  // 启动时：若页面上有多个 active，先统一到 hash 指定或 home
  initFromHash();
})();
