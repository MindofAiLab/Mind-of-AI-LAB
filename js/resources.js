/* 公开资料：从 JSON 渲染 PDF 列表 & 在当前页面内嵌预览（带兜底） */
(function(){
  const listEl = document.getElementById('resources-list');
  const viewer  = document.getElementById('pdfViewer');
  const frame   = document.getElementById('pdfFrame');
  const titleEl = document.getElementById('pdfTitle');
  const infoEl  = document.getElementById('pdfInfo');
  const dlEl    = document.getElementById('pdfDownload');
  const nbEl    = document.getElementById('pdfNewtab');
  const fbBox   = document.getElementById('pdfFallback');
  const fbLink  = document.getElementById('pdfFallbackLink');
  const btnClose= document.getElementById('pdfClose');

  if (!listEl) return;

  // —— 加载清单：先 fetch，再内联兜底 —— //
  loadResources()
    .then(renderList)
    .catch(err => {
      console.warn('资源清单加载失败：', err);
      listEl.innerHTML = '<p style="color:var(--muted)">未找到资源清单（data/resources.json / #resources-inline）。</p>';
    });

  async function loadResources(){
    // 1) 尝试 fetch
    try{
      const r = await fetch('data/resources.json', {cache:'no-store'});
      if (r.ok){
        return await r.json();
      }else{
        throw new Error('HTTP '+r.status);
      }
    }catch(e){
      // 2) 兜底：尝试读取内联 JSON
      const inline = document.getElementById('resources-inline');
      if (inline && inline.textContent.trim()){
        return JSON.parse(inline.textContent);
      }
      throw e;
    }
  }

  function renderList(items){
    if (!Array.isArray(items) || items.length === 0){
      listEl.innerHTML = '<p style="color:var(--muted)">暂无公开资料。</p>';
      return;
    }
    listEl.innerHTML = '';
    items.forEach((it)=>{
      const row = document.createElement('div');
      row.className = 'resource-item';
      row.innerHTML = `
        <div class="resource-title">${escapeHTML(it.title || '未命名文档')}</div>
        <div class="resource-meta">${escapeHTML(it.authors || '')} ${it.year ? ('· ' + it.year) : ''}</div>
        <div class="resource-tags">
          ${(it.tags||[]).map(t=>`<span class="resource-tag">${escapeHTML(t)}</span>`).join('')}
        </div>
      `;
      row.addEventListener('click', ()=> openPDF(it));
      listEl.appendChild(row);
    });
  }

  function openPDF(it){
    const url = it.file;
    const src = url + '#toolbar=1&navpanes=0&view=FitH&statusbar=0';
    titleEl.textContent = it.title || '未命名文档';
    infoEl.textContent  = [it.authors, it.year].filter(Boolean).join(' · ');
    dlEl.href = url; nbEl.href = url; fbLink.href = url;

    viewer.hidden = false; fbBox.hidden = true;
    frame.onerror = ()=>{ frame.removeAttribute('src'); fbBox.hidden = false; };
    frame.src = src;

    document.querySelector('.main')?.scrollTo({top:0, behavior:'smooth'});
  }

  function closePDF(){
    viewer.hidden = true;
    frame.removeAttribute('src');
  }
  btnClose?.addEventListener('click', closePDF);
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && !viewer.hidden) closePDF(); });

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
})();
