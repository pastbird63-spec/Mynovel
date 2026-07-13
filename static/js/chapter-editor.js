// ═════════════════════════════════════════════════════════════════════════
// 稿纸编辑器 — 逐页编辑、动态分页、自动保存、参考书
// ═════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var chapterId = window.CHAPTER_ID;
  var bookId = window.CHAPTER_BOOK_ID;
  var initData = window.CHAPTER_INIT || {};

  // ── 状态 ───────────────────────────────────────────────────────

  var state = {
    paperStyle: initData.paperStyle || 'lined',
    paperColor: initData.paperColor || 'cream',
    paperSize: initData.paperSize || 'a5',
    zoom: 1.0,
    // 全文内容（含 \f 分页符），textarea 只显示当前页片段
    fullContent: initData.content || '',
    currentPage: 1,
    totalPages: 1,
    charsPerPage: 900, // 动态计算
    dirty: false,
    saveTimer: null,
    // 防止合并时触发 input 循环
    renderingPage: false,
    refOpen: false,
    refTab: 'char',
    refData: {},
    refView: 'list',
    refDetailItem: null,
  };

  // ── DOM 引用 ───────────────────────────────────────────────────

  var $ = function (id) { return document.getElementById(id); };
  var textarea = $('paper-textarea');
  var paperSheet = $('paper-sheet');
  var paperScale = $('paper-scale');
  var wordCountEl = $('word-count');
  var pageIndicator = $('page-indicator');
  var refSidebar = $('ref-sidebar');
  var refPanelBody = $('ref-panel-body');
  var refPanelTitle = $('ref-panel-title');
  var flipOverlay = $('page-flip-overlay');
  var flipCard = $('page-flip-card');
  var paperStage = $('paper-stage');

  // 稿纸平移状态
  var panState = { x: 0, y: 0, dragging: false, sx: 0, sy: 0 };

  // 撤销/重做历史栈
  var history = {
    stack: [],
    index: -1,
    maxSize: 100,
    lastPush: 0,
  };

  // ═════════════════════════════════════════════════════════════
  // 动态计算每页字数
  // ═════════════════════════════════════════════════════════════

  function computeCharsPerPage() {
    var style = getComputedStyle(textarea);
    var fontSize = parseFloat(style.fontSize);
    var lineHeight = parseFloat(style.lineHeight);
    // textarea 内容区宽高 = padding-box 减去 padding
    var padLeft = parseFloat(style.paddingLeft);
    var padRight = parseFloat(style.paddingRight);
    var padTop = parseFloat(style.paddingTop);
    var padBottom = parseFloat(style.paddingBottom);
    var contentW = textarea.clientWidth - padLeft - padRight;
    var contentH = textarea.clientHeight - padTop - padBottom;
    if (contentW <= 0 || contentH <= 0 || fontSize <= 0 || lineHeight <= 0) return;
    var charsPerLine = Math.floor(contentW / fontSize);
    var linesPerPage = Math.floor(contentH / lineHeight);
    state.charsPerPage = Math.max(200, charsPerLine * linesPerPage);
  }

  // ═════════════════════════════════════════════════════════════
  // 分页 — 按 \f 切开后每段按 charsPerPage 切子页
  // ═════════════════════════════════════════════════════════════

  function getPageSegments() {
    var text = state.fullContent || '';
    var chunks = text.split('\f');
    var segments = [];
    var cp = state.charsPerPage;
    var globalPage = 1;
    var cursor = 0; // 当前段在全文中的起始位置

    chunks.forEach(function (chunk, ci) {
      var subPages = Math.max(1, Math.ceil(chunk.length / cp));
      for (var p = 0; p < subPages; p++) {
        segments.push({
          start: cursor + p * cp,
          end: Math.min(cursor + (p + 1) * cp, cursor + chunk.length),
          globalPage: globalPage++,
          chunkIndex: ci,
          isEmpty: (chunk.trim().length === 0),
        });
      }
      cursor += chunk.length;
      if (ci < chunks.length - 1) cursor += 1; // +1 for the \f char
    });

    return segments;
  }

  function updateStats() {
    computeCharsPerPage();
    var segs = getPageSegments();
    state.totalPages = segs.length || 1;
    if (state.currentPage > state.totalPages) state.currentPage = state.totalPages;
    wordCountEl.textContent = (state.fullContent || '').length;
    pageIndicator.textContent = state.currentPage + '/' + state.totalPages;

    var prevBtn = $('btn-prev-page');
    var nextBtn = $('btn-next-page');
    if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;

    // 当前页是否空白（删除按钮显隐）
    var seg = segs[state.currentPage - 1];
    var delBtn = $('btn-delete-page');
    if (delBtn) {
      delBtn.style.display = (seg && seg.isEmpty && segs.length > 1) ? '' : 'none';
    }
  }

  // ── 提取当前页内容填入 textarea ────────────────────────────

  function renderPage() {
    var segs = getPageSegments();
    var seg = segs[state.currentPage - 1];
    if (!seg) { textarea.value = ''; return; }
    state.renderingPage = true;
    textarea.value = state.fullContent.substring(seg.start, seg.end);
    state.renderingPage = false;
    updateStats();
  }

  // ── 合并：把 textarea 内容写回全文 ──────────────────────────

  function mergePageContent() {
    if (state.renderingPage) return;
    var segs = getPageSegments();
    var seg = segs[state.currentPage - 1];
    if (!seg) return;
    var edited = textarea.value;
    var fc = state.fullContent;
    state.fullContent = fc.substring(0, seg.start) + edited + fc.substring(seg.end);
  }

  // ── 翻页 ──────────────────────────────────────────────────

  function flipPage(direction) {
    var newPage = state.currentPage + direction;
    if (newPage < 1 || newPage > state.totalPages) return;

    // 翻前先合并当前页的编辑
    mergePageContent();

    var paperRect = paperSheet.getBoundingClientRect();
    flipCard.style.left = paperRect.left + 'px';
    flipCard.style.top = paperRect.top + 'px';
    flipCard.style.width = paperRect.width + 'px';
    flipCard.style.height = paperRect.height + 'px';
    flipCard.style.transformOrigin = direction > 0 ? 'right bottom' : 'left bottom';

    flipOverlay.style.display = 'block';
    flipCard.offsetHeight;
    var angle = direction > 0 ? -180 : 180;
    flipCard.style.transition = 'transform 0.5s ease-in-out';
    flipCard.style.transform = 'rotateY(' + angle + 'deg)';

    state.currentPage = newPage;

    setTimeout(function () {
      renderPage();
      flipCard.style.transition = 'none';
      flipCard.style.transform = 'rotateY(0deg)';
      flipOverlay.style.display = 'none';
    }, 480);
  }

  // ── 插入手动分页符 ────────────────────────────────────────

  function insertPageBreak() {
    mergePageContent();
    pushHistory();
    var pos = textarea.selectionStart;
    state.fullContent = state.fullContent.substring(0, pos) + '\f' + state.fullContent.substring(pos);
    // 光标后的内容被推到新页
    state.currentPage = Math.min(state.currentPage + 1, getPageSegments().length);
    renderPage();
    autoSave();
  }

  // ── 删除当前空白页 ────────────────────────────────────────

  function deleteCurrentPage() {
    var segs = getPageSegments();
    var seg = segs[state.currentPage - 1];
    if (!seg || !seg.isEmpty) return;

    pushHistory();
    var chunks = state.fullContent.split('\f');
    var ci = seg.chunkIndex;
    if (ci >= chunks.length) return;

    // 移除空段 + 其 \f 分隔符
    if (chunks.length === 1) return; // 至少保留一个段
    chunks.splice(ci, 1);
    state.fullContent = chunks.join('\f');

    // 如果当前页超出总页数，后退
    var newSegs = getPageSegments();
    if (state.currentPage > newSegs.length) state.currentPage = newSegs.length;
    renderPage();
    autoSave();
  }

  // ═════════════════════════════════════════════════════════════
  // 撤销 / 重做
  // ═════════════════════════════════════════════════════════════

  function pushHistory() {
    var now = Date.now();
    var entry = { content: state.fullContent, page: state.currentPage };
    // 1 秒内的连续输入合并为一个历史条目
    if (history.index >= 0 && now - history.lastPush < 1000) {
      history.stack[history.index] = entry;
    } else {
      // 丢弃"未来"重做栈
      history.stack = history.stack.slice(0, history.index + 1);
      history.stack.push(entry);
      if (history.stack.length > history.maxSize) history.stack.shift();
      else history.index++;
    }
    history.lastPush = now;
  }

  function undo() {
    if (history.index <= 0) return;
    history.index--;
    restoreHistory();
  }

  function redo() {
    if (history.index >= history.stack.length - 1) return;
    history.index++;
    restoreHistory();
  }

  function restoreHistory() {
    var entry = history.stack[history.index];
    state.fullContent = entry.content;
    // 钳制页码
    var segs = getPageSegments();
    state.currentPage = Math.min(entry.page, Math.max(1, segs.length));
    renderPage();
    autoSave();
    updateUndoButtons();
  }

  function updateUndoButtons() {
    var ub = $('btn-undo'), rb = $('btn-redo');
    if (ub) ub.disabled = history.index <= 0;
    if (rb) rb.disabled = history.index >= history.stack.length - 1;
  }

  // ═════════════════════════════════════════════════════════════
  // 自动保存
  // ═════════════════════════════════════════════════════════════

  function autoSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 2000);
  }

  function saveNow() {
    var indicator = $('save-indicator');
    if (indicator) { indicator.textContent = '保存中…'; indicator.className = 'editor-save-indicator saving'; }
    fetch('/api/chapters/' + chapterId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: state.fullContent,
        paper_style: state.paperStyle,
        paper_color: state.paperColor,
        paper_size: state.paperSize,
      }),
    }).then(function (r) { return r.json(); })
      .then(function () {
        state.dirty = false;
        if (indicator) { indicator.textContent = '已保存'; indicator.className = 'editor-save-indicator saved'; }
      });
  }

  // ═════════════════════════════════════════════════════════════
  // 稿纸样式 / 颜色 / 尺寸 / 缩放
  // ═════════════════════════════════════════════════════════════

  function setPaperStyle(style) {
    state.paperStyle = style;
    paperSheet.classList.remove('style-lined', 'style-grid');
    paperSheet.classList.add('style-' + style);
    $('btn-paper-lined').classList.toggle('active', style === 'lined');
    $('btn-paper-grid').classList.toggle('active', style === 'grid');
    recalcAndRender();
  }

  function setPaperColor(color) {
    state.paperColor = color;
    paperSheet.classList.remove('color-white', 'color-cream');
    paperSheet.classList.add('color-' + color);
    $('btn-color-white').classList.toggle('active', color === 'white');
    $('btn-color-cream').classList.toggle('active', color === 'cream');
    autoSave();
  }

  function setPaperSize(size) {
    state.paperSize = size;
    paperSheet.classList.toggle('size-a4', size === 'a4');
    $('btn-size-a5').classList.toggle('active', size === 'a5');
    $('btn-size-a4').classList.toggle('active', size === 'a4');
    recalcAndRender();
  }

  // ── 应用平移+缩放变换 ─────────────────────────────────────

  function applyTransform() {
    clampPan();
    paperScale.style.transform = 'translate(' + panState.x + 'px, ' + panState.y + 'px) scale(' + state.zoom + ')';
  }

  function clampPan() {
    var pw = paperSheet.offsetWidth * state.zoom;
    var ph = paperSheet.offsetHeight * state.zoom;
    var vw = paperStage.clientWidth;
    var vh = paperStage.clientHeight;
    if (!pw || !ph || !vw || !vh) return;
    var margin = 150; // 至少保留 150px 可见
    var half = 0.5;
    panState.x = Math.max(-(vw * half + pw * half - margin),
                  Math.min(vw * half + pw * half - margin, panState.x));
    panState.y = Math.max(-(vh * half + ph * half - margin),
                  Math.min(vh * half + ph * half - margin, panState.y));
  }

  function setZoom(delta, ox, oy) {
    var oldZoom = state.zoom;
    var newZoom = Math.max(0.5, Math.min(2.0, +(oldZoom + delta).toFixed(1)));
    if (ox !== undefined) {
      // 绕鼠标位置缩放
      panState.x = ox - (ox - panState.x) * newZoom / oldZoom;
      panState.y = oy - (oy - panState.y) * newZoom / oldZoom;
    }
    state.zoom = newZoom;
    applyTransform();
    $('editor-zoom-val').textContent = Math.round(state.zoom * 100) + '%';
  }

  // 纸大小/样式变化后重算分页并重绘
  function recalcAndRender() {
    // 合并当前页编辑再重算
    mergePageContent();
    // 等 CSS transition 完成再测尺寸
    setTimeout(function () {
      computeCharsPerPage();
      var segs = getPageSegments();
      if (state.currentPage > segs.length) state.currentPage = segs.length;
      renderPage();
      autoSave();
    }, 250);
  }

  // ═════════════════════════════════════════════════════════════
  // 参考书 — 列表 & 详情（面板内）
  // ═════════════════════════════════════════════════════════════

  function toggleRef() {
    state.refOpen = !state.refOpen;
    if (state.refOpen) {
      refSidebar.classList.add('expanded');
      state.refView = 'list';
      state.refDetailItem = null;
      loadRefData(state.refTab);
    } else {
      refSidebar.classList.remove('expanded');
    }
  }

  function switchRefTab(tab) {
    if (state.refTab === tab && state.refOpen) { toggleRef(); return; }
    state.refTab = tab;
    state.refOpen = true;
    state.refView = 'list';
    state.refDetailItem = null;
    refSidebar.classList.add('expanded');
    refSidebar.querySelectorAll('.ref-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.ref === tab);
    });
    var titles = { char: '人物', plot: '情节', world: '世界观' };
    refPanelTitle.textContent = titles[tab] || '';
    loadRefData(tab);
  }

  function loadRefData(tab) {
    if (state.refData[tab]) { renderRefList(tab, state.refData[tab]); return; }
    refPanelBody.innerHTML = '<div class="ref-loading">加载中...</div>';
    var endpoints = {
      char: '/api/books/' + bookId + '/reference/characters',
      plot: '/api/books/' + bookId + '/reference/plots',
      world: '/api/books/' + bookId + '/reference/world',
    };
    var url = endpoints[tab];
    if (!url) return;
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      state.refData[tab] = data;
      renderRefList(tab, data);
    });
  }

  function renderRefList(tab, data) {
    state.refView = 'list'; state.refDetailItem = null;
    var h = '';
    if (tab === 'world') {
      for (var cat in data) {
        if (!data.hasOwnProperty(cat)) continue;
        h += '<div class="ref-cat-title" style="font-size:0.7rem;color:#999;padding:0.4rem 0.5rem 0.15rem;text-transform:uppercase;letter-spacing:.05em">' + esc(cat) + '</div>';
        data[cat].forEach(function (s) {
          h += '<div class="ref-item" data-type="world" data-id="' + s.id + '">'
            + '<div class="ref-item-name">' + esc(s.title) + '</div>'
            + (s.content ? '<div class="ref-item-content">' + esc(s.content) + '</div>' : '')
            + '</div>';
        });
      }
      refPanelBody.innerHTML = h || '<div class="ref-loading">暂无数据</div>';
    } else if (tab === 'char') {
      if (!data || !data.length) { refPanelBody.innerHTML = '<div class="ref-loading">暂无数据</div>'; return; }
      data.forEach(function (c) {
        h += '<div class="ref-item" data-type="char" data-id="' + c.id + '">'
          + '<div class="ref-item-name">' + esc(c.name) + (c.alias ? '<span class="ref-item-alias">' + esc(c.alias) + '</span>' : '') + '</div>'
          + (c.age || c.gender ? '<div class="ref-item-meta">' + [c.age, c.gender].filter(Boolean).join(' · ') + '</div>' : '')
          + (c.description ? '<div class="ref-item-desc">' + esc(c.description) + '</div>' : '')
          + '</div>';
      });
      refPanelBody.innerHTML = h;
    } else if (tab === 'plot') {
      if (!data || !data.length) { refPanelBody.innerHTML = '<div class="ref-loading">暂无数据</div>'; return; }
      data.forEach(function (n) {
        h += '<div class="ref-item" data-type="plot" data-id="' + n.id + '">'
          + '<div class="ref-item-name">' + esc(n.title) + '</div>'
          + (n.time_in_story || n.location ? '<div class="ref-item-meta">' + [n.time_in_story, n.location].filter(Boolean).join(' · ') + '</div>' : '')
          + (n.summary ? '<div class="ref-item-desc">' + esc(n.summary) + '</div>' : '')
          + '</div>';
      });
      refPanelBody.innerHTML = h;
    }
    refPanelBody.querySelectorAll('.ref-item').forEach(function (item) {
      item.addEventListener('click', function () {
        loadRefDetail(this.dataset.type, parseInt(this.dataset.id));
      });
    });
  }

  function loadRefDetail(type, id) {
    refPanelBody.innerHTML = '<div class="ref-loading">加载中...</div>';
    var urls = { char: '/api/reference/character/', plot: '/api/reference/plot/', world: '/api/reference/world/' };
    fetch(urls[type] + id).then(function (r) { return r.json(); }).then(function (data) {
      state.refView = 'detail'; state.refDetailItem = { type: type, data: data };
      renderRefDetail(type, data);
    });
  }

  function renderRefDetail(type, d) {
    var h = '<button class="ref-detail-back" id="ref-detail-back">&larr; 返回列表</button>';
    if (type === 'char') {
      h += '<div class="ref-detail-name">' + esc(d.name) + '</div>';
      if (d.alias) h += '<div class="ref-detail-alias">' + esc(d.alias) + '</div>';
      h += '<table class="ref-detail-table">';
      if (d.age) h += '<tr><td>年龄</td><td>' + esc(d.age) + '</td></tr>';
      if (d.gender) h += '<tr><td>性别</td><td>' + esc(d.gender) + '</td></tr>';
      h += '</table>';
      if (d.description) { h += '<div class="ref-detail-section">简介</div><div class="ref-detail-desc">' + esc(d.description) + '</div>'; }
      if (d.custom_fields && d.custom_fields.length) {
        h += '<div class="ref-detail-section">自定义字段</div>';
        d.custom_fields.forEach(function (f) { h += '<div class="ref-field-item"><div class="ref-field-name">' + esc(f.name) + '</div><div class="ref-field-value">' + esc(f.value || '—') + '</div></div>'; });
      }
    } else if (type === 'plot') {
      h += '<div class="ref-detail-name">' + esc(d.title) + '</div>';
      h += '<table class="ref-detail-table">';
      if (d.time_in_story) h += '<tr><td>时间</td><td>' + esc(d.time_in_story) + '</td></tr>';
      if (d.location) h += '<tr><td>地点</td><td>' + esc(d.location) + '</td></tr>';
      h += '</table>';
      if (d.summary) { h += '<div class="ref-detail-section">摘要</div><div class="ref-detail-desc">' + esc(d.summary) + '</div>'; }
      if (d.characters && d.characters.length) {
        h += '<div class="ref-detail-section">关联人物</div><div class="ref-char-list">';
        d.characters.forEach(function (pc) { h += '<span class="ref-char-tag">' + esc(pc.name) + (pc.role ? '<span class="role"> ' + esc(pc.role) + '</span>' : '') + '</span>'; });
        h += '</div>';
      }
      if (d.custom_fields && d.custom_fields.length) {
        h += '<div class="ref-detail-section">描述卡片</div>';
        d.custom_fields.forEach(function (f) {
          if (f.is_flagged) {
            h += '<div class="ref-field-flagged"><strong>' + esc(f.name) + '</strong>: ' + esc(f.value || '—') + '</div>';
          } else {
            h += '<div class="ref-field-item"><div class="ref-field-name">' + esc(f.name) + '</div><div class="ref-field-value">' + esc(f.value || '—') + '</div></div>';
          }
        });
      }
    } else if (type === 'world') {
      h += '<div class="ref-detail-name">' + esc(d.title) + '</div>';
      h += '<table class="ref-detail-table"><tr><td>类别</td><td>' + esc(d.category) + '</td></tr></table>';
      if (d.content) { h += '<div class="ref-detail-section">内容</div><div class="ref-detail-desc">' + esc(d.content) + '</div>'; }
      if (d.custom_fields && d.custom_fields.length) {
        h += '<div class="ref-detail-section">描述字段</div>';
        d.custom_fields.forEach(function (f) { h += '<div class="ref-field-item"><div class="ref-field-name">' + esc(f.name) + '</div><div class="ref-field-value">' + esc(f.value || '—') + '</div></div>'; });
      }
    }
    refPanelBody.innerHTML = h;
    var backBtn = document.getElementById('ref-detail-back');
    if (backBtn) backBtn.addEventListener('click', function () { renderRefList(state.refTab, state.refData[state.refTab]); });
  }

  // ── 上下章导航 ──────────────────────────────────────────────

  function loadNeighbors() {
    fetch('/api/chapters/' + chapterId + '/neighbors')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var prevBtn = $('btn-prev-chapter'), nextBtn = $('btn-next-chapter');
        if (data.prev) { prevBtn.href = '/chapters/' + data.prev.id + '/write'; prevBtn.title = '上一章：' + data.prev.title; prevBtn.style.display = ''; }
        if (data.next) { nextBtn.href = '/chapters/' + data.next.id + '/write'; nextBtn.title = '下一章：' + data.next.title; nextBtn.style.display = ''; }
      });
  }

  // ── 键盘快捷键 ────────────────────────────────────────────────

  function onKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNow(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); insertPageBreak(); }
    if (e.key === 'Escape') {
      if (state.refOpen && state.refView === 'detail') {
        renderRefList(state.refTab, state.refData[state.refTab]);
      } else if (state.refOpen) { toggleRef(); }
    }
  }

  // ── HTML 转义 ─────────────────────────────────────────────────

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  }

  // ═════════════════════════════════════════════════════════════
  // 初始化
  // ═════════════════════════════════════════════════════════════

  function init() {
    // 样式
    setPaperStyle(state.paperStyle);
    setPaperColor(state.paperColor);
    setPaperSize(state.paperSize);
    applyTransform();

    // 先测尺寸再渲染首页
    setTimeout(function () {
      computeCharsPerPage();
      renderPage();
    }, 100);

    // 输入 → 合并 + 自动保存
    textarea.addEventListener('input', function () {
      if (state.renderingPage) return;
      state.dirty = true;
      pushHistory();
      var oldTotal = state.totalPages;
      mergePageContent();
      updateStats();
      // 内容超出当前页 → 先截断再自动翻页（带动画）
      if (state.totalPages > oldTotal && textarea.value.length > state.charsPerPage) {
        renderPage();  // textarea 截取到当前页边界
        flipPage(1);   // 翻到下一页
      }
      autoSave();
      var indicator = $('save-indicator');
      if (indicator) { indicator.textContent = '未保存'; indicator.className = 'editor-save-indicator'; }
    });

    textarea.addEventListener('keydown', onKeydown);

    // 工具栏
    $('btn-paper-lined').addEventListener('click', function () { setPaperStyle('lined'); });
    $('btn-paper-grid').addEventListener('click', function () { setPaperStyle('grid'); });
    $('btn-color-white').addEventListener('click', function () { setPaperColor('white'); });
    $('btn-color-cream').addEventListener('click', function () { setPaperColor('cream'); });
    $('btn-size-a5').addEventListener('click', function () { setPaperSize('a5'); });
    $('btn-size-a4').addEventListener('click', function () { setPaperSize('a4'); });
    $('btn-zoom-out').addEventListener('click', function () { setZoom(-0.1); });
    $('btn-zoom-in').addEventListener('click', function () { setZoom(0.1); });
    $('btn-undo').addEventListener('click', function () { undo(); });
    $('btn-redo').addEventListener('click', function () { redo(); });

    // 翻页
    $('btn-prev-page').addEventListener('click', function () { flipPage(-1); });
    $('btn-next-page').addEventListener('click', function () { flipPage(1); });
    $('btn-break-page').addEventListener('click', function () { insertPageBreak(); });
    var delBtn = $('btn-delete-page');
    if (delBtn) delBtn.addEventListener('click', function () { deleteCurrentPage(); });

    // 上下章
    loadNeighbors();

    // 参考书
    refSidebar.querySelectorAll('.ref-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchRefTab(tab.dataset.ref); });
    });
    // ── 稿纸拖拽平移（Pan）──────────────────────────────────
    paperStage.addEventListener('mousedown', function (e) {
      // 只拖拽空白区域，不拦截稿纸/按钮/状态栏的点击
      if (e.target.closest('.paper-sheet') || e.target.closest('.paper-status') ||
          e.target.closest('button') || e.target.closest('a')) return;
      if (e.button !== 0) return; // 左键
      e.preventDefault();
      panState.dragging = true;
      panState.sx = e.clientX - panState.x;
      panState.sy = e.clientY - panState.y;
      paperStage.classList.add('grabbing');
    });
    document.addEventListener('mousemove', function (e) {
      if (!panState.dragging) return;
      panState.x = e.clientX - panState.sx;
      panState.y = e.clientY - panState.sy;
      applyTransform();
    });
    document.addEventListener('mouseup', function () {
      if (!panState.dragging) return;
      panState.dragging = false;
      paperStage.classList.remove('grabbing');
    });
    // 参考书关闭（点击空白区域）
    paperStage.addEventListener('click', function (e) {
      if (state.refOpen && !e.target.closest('.paper-sheet') && !e.target.closest('button')) {
        toggleRef();
      }
    });
    // 滚轮：Ctrl=缩放（绕鼠标），普通=平移
    paperStage.addEventListener('wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        var rect = paperStage.getBoundingClientRect();
        setZoom(e.deltaY < 0 ? 0.1 : -0.1, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        e.preventDefault();
        panState.y -= e.deltaY;
        if (e.shiftKey || Math.abs(e.deltaX) > 0) panState.x -= e.deltaX || e.deltaY;
        applyTransform();
      }
    }, { passive: false });

    window.addEventListener('beforeunload', function () {
      mergePageContent();
      if (state.dirty) saveNow();
    });

    if (!textarea.value) textarea.focus();
  }

  init();

})();
