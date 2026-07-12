// ═══════════════════════════════════════════════════════════════════════
// 翻书视图 — 打开/关闭、标签切换、翻页、内容路由、拖拽排序辅助
// 依赖：search.js, shelf.js, tab-chars.js, tab-world.js, timeline.js
// ═══════════════════════════════════════════════════════════════════════

var AppState = window.AppState;
var DATA = window.BOOKS_DATA || [];
var LS_OPEN = 'mynovel-open-book';

// ── 打开 / 关闭书本 ──

function openBook(book, tab, hl) {
  AppState.currentBook = book;
  AppState.currentTab = tab || 'char';
  AppState.currentSpread = 0;
  AppState.pendingHL = hl || 0;
  document.querySelectorAll('#page-tabs .page-tab').forEach(function (t) { t.classList.remove('active'); });
  var tabEl = document.querySelector('#page-tabs [data-tab="' + AppState.currentTab + '"]');
  if (tabEl) tabEl.classList.add('active');
  document.getElementById('book-topbar-title').textContent = book.title;
  document.getElementById('btn-edit-book').href = '/books/' + book.id + '/edit';
  document.getElementById('shelf-view').style.display = 'none';
  document.getElementById('book-view').style.display = 'block';
  renderContent();
  window.scrollTo(0, 0);
  localStorage.setItem(LS_OPEN, book.id);
}

function closeBook() {
  AppState.currentBook = null;
  document.getElementById('shelf-view').style.display = '';
  document.getElementById('book-view').style.display = 'none';
  window.scrollTo(0, 0);
  localStorage.removeItem(LS_OPEN);
}

// ── 标签切换与页面重置 ──

function resetBookPages() {
  var l = document.getElementById('book-page-left'), r = document.getElementById('book-page-right');
  l.style.flex = ''; l.style.width = ''; l.style.padding = ''; l.style.overflow = ''; l.style.maxHeight = '';
  r.style.flex = ''; r.style.width = ''; r.style.padding = ''; r.style.overflow = ''; r.style.maxHeight = '';
  var w = document.getElementById('plot-canvas-wrap'); if (w) w.remove();
  var cr = document.querySelector('.open-book-crease'); if (cr) cr.style.display = '';
  var tb = document.getElementById('page-tabs'); if (tb) tb.style.zIndex = '';
}

// ── 翻页 ──

window.addPagination = function (totalSpreads) {
  var bar = document.getElementById('pagination-bar'); bar.innerHTML = '';
  if (AppState.currentSpread > 0) {
    var prev = ce('a', 'page-turn', '← 上一页'); prev.href = '#';
    prev.addEventListener('click', function (e) { e.preventDefault(); if (AppState.currentSpread > 0) { AppState.currentSpread--; renderContent(); } });
    bar.appendChild(prev);
  }
  bar.appendChild(ce('span', 'page-indicator', (AppState.currentSpread + 1) + ' / ' + totalSpreads));
  if (AppState.currentSpread < totalSpreads - 1) {
    var next = ce('a', 'page-turn', '下一页 →'); next.href = '#';
    next.addEventListener('click', function (e) { e.preventDefault(); if (AppState.currentSpread < totalSpreads - 1) { AppState.currentSpread++; renderContent(); } });
    bar.appendChild(next);
  }
};

// ── 拖拽排序辅助 ──

function getOrdered(list, key) {
  var stored = localStorage.getItem(key);
  if (stored) {
    try {
      var ord = JSON.parse(stored);
      var o = [];
      var rem = list.slice();
      ord.forEach(function (id) {
        var i = rem.findIndex(function (x) { return x.id === id; });
        if (i >= 0) { o.push(rem[i]); rem.splice(i, 1); }
      });
      return o.concat(rem);
    } catch (e) {}
  }
  return list;
}

function saveOrder(key, list) { localStorage.setItem(key, JSON.stringify(list.map(function (x) { return x.id; }))); }

function makeDraggable(container, list, key, rebuildFn) {
  var dragIdx = -1;
  container.querySelectorAll('.draggable-card').forEach(function (card, i) {
    card.addEventListener('dragstart', function (e) { dragIdx = i; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', function (e) { this.classList.remove('dragging'); container.querySelectorAll('.draggable-card').forEach(function (c) { c.classList.remove('drag-over'); }); });
    card.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; this.classList.add('drag-over'); });
    card.addEventListener('dragleave', function (e) { this.classList.remove('drag-over'); });
    card.addEventListener('drop', function (e) {
      e.preventDefault(); this.classList.remove('drag-over');
      if (dragIdx < 0 || dragIdx === i) return;
      var item = list.splice(dragIdx, 1)[0];
      list.splice(i, 0, item);
      saveOrder(key, list);
      rebuildFn();
    });
  });
}

// ── 时间线渲染 ──

function renderPlot(searchQ) {
  var sq = (searchQ || '').toLowerCase();
  window.canvasState.searchQ = sq;
  var addUrl = '/plots/' + AppState.currentBook.id + '/create';
  window.renderPlotCanvas(AppState.currentBook, addUrl, AppState.pendingHL, esc, getSearchBox, searchPlotFn, sq);
}

// ── 内容路由 ──

function renderContent() {
  if (!AppState.currentBook) return;
  switch (AppState.currentTab) {
    case 'char': renderChars(); break;
    case 'plot': renderPlot(); break;
    case 'world': renderWorld(); break;
  }
}

// ── HTML 转义 ──

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── 工具 ──

function ce(tag, cls, txt) {
  var e = document.createElement(tag);
  e.className = cls;
  if (txt) e.textContent = txt;
  return e;
}
