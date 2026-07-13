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
    _renderSeg: null,     // renderPage 时保存的当前页分段，供 mergePageContent 复用
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

  // 撤销/重做历史栈（仿 Word 行为）
  var history = {
    stack: [],
    index: -1,
    maxSize: 100,
    lastPush: 0,
    seeded: false, // 是否已播种初始状态
  };

  // 自动翻页标记 — 防止 flipPage 重复合并截断后的 textarea
  var _autoPaging = false;

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
  // 字符宽度权重 — 仿 Word 按实际宽度分页
  // ═════════════════════════════════════════════════════════════

  function getCharWeight(ch) {
    if (ch === '\f') return 0;  // 分页符不计权重（已在 split 时处理）
    if (ch === '\n' || ch === '\r' || ch === '\t') return 1.0;
    var code = ch.charCodeAt(0);
    // 全角区间：中文 / 日文假名 / 韩文 / 全角标点 → 宽度 ≈ 字号
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK 统一表意文字
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK 扩展 A
      (code >= 0xF900 && code <= 0xFAFF) ||   // CJK 兼容汉字
      (code >= 0x3000 && code <= 0x303F) ||   // CJK 符号 & 标点（含全角空格　）
      (code >= 0xFF01 && code <= 0xFF5E) ||   // 全角 ASCII（！＂＃…）
      (code >= 0xFFE0 && code <= 0xFFE6) ||   // 全角货币符号
      (code >= 0x3040 && code <= 0x309F) ||   // 平假名
      (code >= 0x30A0 && code <= 0x30FF) ||   // 片假名
      (code >= 0xAC00 && code <= 0xD7AF) ||   // 韩文音节
      (code >= 0x2E80 && code <= 0x2FDF) ||   // CJK 部首
      (code >= 0x31C0 && code <= 0x31EF) ||   // CJK 笔画
      (code >= 0x3200 && code <= 0x33FF) ||   // 带圈 CJK
      (code >= 0x2000 && code <= 0x206F)       // 通用标点（—…等宽标点）
    ) {
      return 1.0;
    }
    // 半角：英文 / 数字 / 空格 / 符号 → 宽度 ≈ 0.55 个中文字
    return 0.55;
  }

  // 按加权宽度将一个 chunk 切分为多个页面区段
  function splitChunkByWeight(chunk, ci, cursor, cp) {
    var parts = [];
    if (chunk.length === 0) {
      parts.push({
        start: cursor, end: cursor, chunkIndex: ci, isEmpty: true,
      });
      return parts;
    }
    var weight = 0;
    var lastSplit = 0;
    for (var i = 0; i < chunk.length; i++) {
      weight += getCharWeight(chunk[i]);
      if (weight >= cp && i > lastSplit) {
        parts.push({
          start: cursor + lastSplit, end: cursor + i + 1,
          chunkIndex: ci, isEmpty: false,
        });
        lastSplit = i + 1;
        weight = 0;
      }
    }
    // 剩余部分（至少保留一个区段）
    var restEmpty = (chunk.trim().length === 0) && parts.length === 0;
    parts.push({
      start: cursor + lastSplit, end: cursor + chunk.length,
      chunkIndex: ci, isEmpty: restEmpty,
    });
    return parts;
  }

  // ═════════════════════════════════════════════════════════════
  // 分页 — 按 \f 切开后每段按加权宽度切子页
  // ═════════════════════════════════════════════════════════════

  function getPageSegments() {
    var text = state.fullContent || '';
    var chunks = text.split('\f');
    var segments = [];
    var cp = state.charsPerPage;
    var cursor = 0;
    var nextPage = 1;

    chunks.forEach(function (chunk, ci) {
      var subSegs = splitChunkByWeight(chunk, ci, cursor, cp);
      for (var s = 0; s < subSegs.length; s++) {
        subSegs[s].globalPage = nextPage++;
      }
      segments = segments.concat(subSegs);
      cursor += chunk.length;
      if (ci < chunks.length - 1) cursor += 1; // +1 for \f
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
    state._renderSeg = seg || null;  // 保存分段，避免 mergePageContent 时 charsPerPage 变化导致误拼接
    if (!seg) { textarea.value = ''; return; }
    state.renderingPage = true;
    textarea.value = state.fullContent.substring(seg.start, seg.end);
    state.renderingPage = false;
    updateStats();
  }

  // ── 合并：把 textarea 内容写回全文 ──────────────────────────

  function mergePageContent() {
    if (state.renderingPage) return;
    // 使用 renderPage 保存的分段，避免 charsPerPage 变化导致内容重复
    var seg = state._renderSeg;
    if (!seg) {
      // _renderSeg 为 null 说明 renderPage 还没被调用过，textarea 里
      // 仍是模板渲染的全文，fullContent 也是全文，二者一致，无需合并。
      // 若强行用 getPageSegments() 回退，此时 charsPerPage 可能与
      // textarea 实际代表的全文长度不匹配，会把全文内容错误地拼接到
      // 分页位置，造成内容重复/字数膨胀。
      return;
    }
    if (!seg) return;
    var edited = textarea.value;
    var fc = state.fullContent;
    state.fullContent = fc.substring(0, seg.start) + edited + fc.substring(seg.end);
  }

  // ── 翻页 ──────────────────────────────────────────────────

  function flipPage(direction) {
    var newPage = state.currentPage + direction;
    if (newPage < 1 || newPage > state.totalPages) return;

    // 自动翻页时跳过合并：input handler 已合并完整内容，
    // 此时 textarea 被 renderPage 截断过，再次合并会破坏全文
    if (!_autoPaging) mergePageContent();

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
    var segs = getPageSegments();
    var seg = segs[state.currentPage - 1];
    pushHistory();
    // 光标位置需映射到全文（textarea 只显示当前页片段）
    var pos = seg ? seg.start + textarea.selectionStart : textarea.selectionStart;
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

  // ── 播种初始历史（仿 Word：打开文档时的状态作为 undo 基线）──
  function seedInitialHistory() {
    if (history.seeded) return;
    // 确保 fullContent 与 textarea 初始值一致
    if (!state.fullContent && textarea.value) {
      state.fullContent = textarea.value;
    }
    history.stack = [{ content: state.fullContent, page: 1, cursor: 0 }];
    history.index = 0;
    history.lastPush = Date.now();
    history.seeded = true;
    updateUndoButtons();
  }

  function pushHistory(force) {
    // 如果还没播种，先播种（不 return，继续推入当前状态）
    if (!history.seeded) { seedInitialHistory(); }

    var now = Date.now();
    // 记录当前光标在全文中的位置
    var segs = getPageSegments();
    var seg = segs[state.currentPage - 1];
    var cursorInFull = seg ? seg.start + textarea.selectionStart : 0;
    var entry = { content: state.fullContent, page: state.currentPage, cursor: cursorInFull };

    // 1 秒内的连续输入合并（但永不合并到初始条目 index 0）
    if (history.index > 0 && now - history.lastPush < 1000) {
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
    if (!entry) return;
    state.fullContent = entry.content;
    // 钳制页码
    var segs = getPageSegments();
    state.currentPage = Math.min(entry.page || 1, Math.max(1, segs.length));
    renderPage();
    // 恢复光标位置
    var seg = getPageSegments()[state.currentPage - 1];
    if (seg && typeof entry.cursor === 'number') {
      var posInPage = entry.cursor - seg.start;
      if (posInPage < 0) posInPage = 0;
      if (posInPage > textarea.value.length) posInPage = textarea.value.length;
      textarea.setSelectionRange(posInPage, posInPage);
    }
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
    paperScale.style.transform = 'translate(' + panState.x + 'px, ' + panState.y + 'px) scale(' + state.zoom + ')';
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
    var titles = { char: '人物', plot: '情节', world: '世界观' };
    var h = '<div class="ref-toolbar"><span class="ref-panel-title-inline">' + (titles[tab] || '') + '</span>';
    h += '<button class="ref-add-btn" data-tab="' + tab + '">＋ 新建</button></div>';
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
    // [+ 新建] 按钮事件
    var addBtn = refPanelBody.querySelector('.ref-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        showQuickCreateForm(this.dataset.tab);
      });
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
    var h = '<div class="ref-detail-actions">';
    h += '<button class="ref-detail-back" id="ref-detail-back">&larr; 返回列表</button>';
    h += '<button class="ref-edit-btn" data-type="' + type + '" data-id="' + d.id + '">编辑</button>';
    h += '</div>';
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
    var editBtn = refPanelBody.querySelector('.ref-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () {
      showQuickEditForm(this.dataset.type, state.refDetailItem.data);
    });
  }

  // ── 参考书快捷编辑 ──────────────────────────────────────────

  function showQuickCreateForm(tab) {
    var titles = { char: '人物', plot: '情节', world: '世界观' };
    var h = '<div class="ref-form-overlay">';
    h += '<div class="ref-form-title">新建' + (titles[tab] || '') + '</div>';

    if (tab === 'char') {
      h += '<div class="ref-form-field"><label>姓名 <span class="ref-form-req">*</span></label><input class="ref-form-input" id="qf-name" placeholder="必填"></div>';
      h += '<div class="ref-form-field"><label>别称</label><input class="ref-form-input" id="qf-alias"></div>';
      h += '<div class="ref-form-field"><label>描述</label><textarea class="ref-form-textarea" id="qf-desc" rows="3"></textarea></div>';
    } else if (tab === 'plot') {
      h += '<div class="ref-form-field"><label>标题 <span class="ref-form-req">*</span></label><input class="ref-form-input" id="qf-title" placeholder="必填"></div>';
      h += '<div class="ref-form-field"><label>时间</label><input class="ref-form-input" id="qf-time"></div>';
      h += '<div class="ref-form-field"><label>地点</label><input class="ref-form-input" id="qf-location"></div>';
      h += '<div class="ref-form-field"><label>摘要</label><textarea class="ref-form-textarea" id="qf-summary" rows="3"></textarea></div>';
    } else if (tab === 'world') {
      h += '<div class="ref-form-field"><label>标题 <span class="ref-form-req">*</span></label><input class="ref-form-input" id="qf-title" placeholder="必填"></div>';
      h += '<div class="ref-form-field"><label>类别</label><select class="ref-form-input" id="qf-category"><option value="地理">地理</option><option value="规则">规则</option><option value="历史">历史</option><option value="其他">其他</option></select></div>';
      h += '<div class="ref-form-field"><label>内容</label><textarea class="ref-form-textarea" id="qf-content" rows="3"></textarea></div>';
    }

    h += '<div class="ref-form-actions"><button class="ref-form-cancel">取消</button><button class="ref-form-save">保存</button></div>';
    h += '</div>';
    refPanelBody.innerHTML = h;

    refPanelBody.querySelector('.ref-form-cancel').addEventListener('click', function () {
      renderRefList(state.refTab, state.refData[state.refTab] || []);
    });
    refPanelBody.querySelector('.ref-form-save').addEventListener('click', function () {
      submitQuickCreate(tab);
    });
  }

  function showQuickEditForm(type, data) {
    var titles = { char: '人物', plot: '情节', world: '世界观' };
    var h = '<div class="ref-form-overlay">';
    h += '<div class="ref-form-title">编辑' + (titles[type] || '') + '</div>';

    if (type === 'char') {
      h += '<div class="ref-form-field"><label>姓名 <span class="ref-form-req">*</span></label><input class="ref-form-input" id="qf-name" value="' + esc(data.name || '') + '"></div>';
      h += '<div class="ref-form-field"><label>别称</label><input class="ref-form-input" id="qf-alias" value="' + esc(data.alias || '') + '"></div>';
      h += '<div class="ref-form-field"><label>描述</label><textarea class="ref-form-textarea" id="qf-desc" rows="3">' + esc(data.description || '') + '</textarea></div>';
    } else if (type === 'plot') {
      h += '<div class="ref-form-field"><label>标题 <span class="ref-form-req">*</span></label><input class="ref-form-input" id="qf-title" value="' + esc(data.title || '') + '"></div>';
      h += '<div class="ref-form-field"><label>时间</label><input class="ref-form-input" id="qf-time" value="' + esc(data.time_in_story || '') + '"></div>';
      h += '<div class="ref-form-field"><label>地点</label><input class="ref-form-input" id="qf-location" value="' + esc(data.location || '') + '"></div>';
      h += '<div class="ref-form-field"><label>摘要</label><textarea class="ref-form-textarea" id="qf-summary" rows="3">' + esc(data.summary || '') + '</textarea></div>';
    } else if (type === 'world') {
      var cats = ['地理', '规则', '历史', '其他'];
      h += '<div class="ref-form-field"><label>标题 <span class="ref-form-req">*</span></label><input class="ref-form-input" id="qf-title" value="' + esc(data.title || '') + '"></div>';
      h += '<div class="ref-form-field"><label>类别</label><select class="ref-form-input" id="qf-category">';
      cats.forEach(function (c) { h += '<option value="' + c + '"' + (data.category === c ? ' selected' : '') + '>' + c + '</option>'; });
      h += '</select></div>';
      h += '<div class="ref-form-field"><label>内容</label><textarea class="ref-form-textarea" id="qf-content" rows="3">' + esc(data.content || '') + '</textarea></div>';
    }

    h += '<div class="ref-form-actions"><button class="ref-form-cancel">取消</button><button class="ref-form-save">保存</button></div>';
    h += '</div>';
    refPanelBody.innerHTML = h;

    refPanelBody.querySelector('.ref-form-cancel').addEventListener('click', function () {
      loadRefDetail(type, data.id);
    });
    refPanelBody.querySelector('.ref-form-save').addEventListener('click', function () {
      submitQuickUpdate(type, data.id);
    });
  }

  function submitQuickCreate(tab) {
    var body = {};
    var idField = null;

    if (tab === 'char') {
      body.name = (document.getElementById('qf-name') || {}).value || '';
      if (!body.name.trim()) { alert('名称不能为空'); return; }
      body.alias = (document.getElementById('qf-alias') || {}).value || '';
      body.description = (document.getElementById('qf-desc') || {}).value || '';
    } else if (tab === 'plot') {
      body.title = (document.getElementById('qf-title') || {}).value || '';
      if (!body.title.trim()) { alert('标题不能为空'); return; }
      body.time_in_story = (document.getElementById('qf-time') || {}).value || '';
      body.location = (document.getElementById('qf-location') || {}).value || '';
      body.summary = (document.getElementById('qf-summary') || {}).value || '';
    } else if (tab === 'world') {
      body.title = (document.getElementById('qf-title') || {}).value || '';
      if (!body.title.trim()) { alert('标题不能为空'); return; }
      body.category = (document.getElementById('qf-category') || {}).value || '其他';
      body.content = (document.getElementById('qf-content') || {}).value || '';
    }

    var endpoints = { char: 'characters', plot: 'plots', world: 'world' };
    fetch('/api/books/' + bookId + '/' + endpoints[tab] + '/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.error) { alert(result.error); return; }
        // 清除缓存，重新加载列表
        delete state.refData[tab];
        loadRefData(tab);
      });
  }

  function submitQuickUpdate(type, id) {
    var body = {};

    if (type === 'char') {
      body.name = (document.getElementById('qf-name') || {}).value || '';
      if (!body.name.trim()) { alert('名称不能为空'); return; }
      body.alias = (document.getElementById('qf-alias') || {}).value || '';
      body.description = (document.getElementById('qf-desc') || {}).value || '';
    } else if (type === 'plot') {
      body.title = (document.getElementById('qf-title') || {}).value || '';
      if (!body.title.trim()) { alert('标题不能为空'); return; }
      body.time_in_story = (document.getElementById('qf-time') || {}).value || '';
      body.location = (document.getElementById('qf-location') || {}).value || '';
      body.summary = (document.getElementById('qf-summary') || {}).value || '';
    } else if (type === 'world') {
      body.title = (document.getElementById('qf-title') || {}).value || '';
      if (!body.title.trim()) { alert('标题不能为空'); return; }
      body.category = (document.getElementById('qf-category') || {}).value || '其他';
      body.content = (document.getElementById('qf-content') || {}).value || '';
    }

    var endpoints = { char: 'characters', plot: 'plot-nodes', world: 'world-settings' };
    fetch('/api/' + endpoints[type] + '/' + id + '/quick', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.error) { alert(result.error); return; }
        // 清除缓存，重新加载详情
        delete state.refData[state.refTab];
        loadRefDetail(type, id);
      });
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); insertPageBreak(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      // 插入两个全角空格（精确缩进两个汉字），同时触发 input 事件走完整编辑流程
      var pos = textarea.selectionStart;
      var indent = '　　';
      textarea.setRangeText(indent, pos, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
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
    // ── 阅读模式：textarea 只读，隐藏写作专属按钮 ──
    var isReading = initData.bookType === 'reading';
    if (isReading) {
      textarea.readOnly = true;
      textarea.placeholder = '阅读中…';
      // 隐藏写作专属工具栏按钮
      var writingBtns = [
        'btn-paper-lined', 'btn-paper-grid',
        'btn-color-white', 'btn-color-cream',
        'btn-size-a5', 'btn-size-a4',
        'btn-undo', 'btn-redo',
        'btn-break-page', 'btn-delete-page',
        'btn-export-chapter'
      ];
      writingBtns.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      // 隐藏状态栏删除按钮和分页按钮
      var delBtn = $('btn-delete-page');
      var breakBtn = $('btn-break-page');
      if (delBtn) delBtn.style.display = 'none';
      if (breakBtn) breakBtn.style.display = 'none';
      // 保存指示器改为阅读模式
      var indicator = $('save-indicator');
      if (indicator) { indicator.textContent = '阅读模式'; indicator.className = 'editor-save-indicator saved'; }
      // 禁止 Ctrl+S 保存
      document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
        }
      });
    }

    // 样式
    setPaperStyle(state.paperStyle);
    setPaperColor(state.paperColor);
    setPaperSize(state.paperSize);
    applyTransform();

    // 先测尺寸再渲染首页
    setTimeout(function () {
      computeCharsPerPage();
      renderPage();
      // 播种初始历史 — 打开文档时的状态作为 undo 基线
      seedInitialHistory();
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
      if (state.totalPages > oldTotal) {
        renderPage();  // textarea 截取到当前页边界
        _autoPaging = true;
        flipPage(1);   // 翻到下一页（跳过 mergePageContent，保护全文）
        _autoPaging = false;
      }
      autoSave();
      var indicator = $('save-indicator');
      if (indicator) { indicator.textContent = '未保存'; indicator.className = 'editor-save-indicator'; }
    });

    textarea.addEventListener('keydown', onKeydown);
    // 文档级 Ctrl+S：确保焦点不在 textarea 时也能保存（main.js 已阻止浏览器另存为）
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        mergePageContent();
        saveNow();
      }
    });

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

    // 导出下拉菜单
    var exportToggle = document.getElementById('btn-export-chapter');
    var exportMenu = document.getElementById('editor-export-menu');
    if (exportToggle && exportMenu) {
      exportToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        exportMenu.classList.toggle('open');
      });
      document.addEventListener('click', function () {
        exportMenu.classList.remove('open');
      });
    }
  }

  init();

})();
