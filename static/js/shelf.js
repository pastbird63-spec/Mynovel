// ═══════════════════════════════════════════════════════════════════════
// 书架视图 — 行管理、书脊颜色、拖拽排序、搜索过滤
// 依赖：search.js（通用工具函数）
// ═══════════════════════════════════════════════════════════════════════

var AppState = window.AppState;
var DATA = window.BOOKS_DATA || [];
var LS_ROWS = 'mynovel-rows';
var LS_COLORS = 'mynovel-colors';

function saveRows() { localStorage.setItem(LS_ROWS, JSON.stringify(AppState.rows)); }
function saveColors() { localStorage.setItem(LS_COLORS, JSON.stringify(AppState.spineColors)); }

function renderShelf(filter) {
  var c = document.getElementById('shelf-all');
  if (DATA.length === 0) { c.innerHTML = ''; return; }
  var h = '';
  AppState.rows.forEach(function (rowIds, ri) {
    h += '<div class="shelf-row-wrap" data-row="' + ri + '"><div class="shelf-row-books" data-row="' + ri + '">';
    rowIds.forEach(function (id) {
      var bk = DATA.find(function (b) { return b.id === id; });
      if (!bk) return;
      var cl = AppState.spineColors[id] || '';
      var hid = filter && !bk.title.toLowerCase().includes(filter) ? ' filtered-out' : '';
      h += '<div class="shelf-spine' + hid + '" data-book-id="' + id + '" data-color="' + cl + '" draggable="true" title="' + esc(bk.title) + ' (右键切换颜色)">' + esc(bk.title) + '</div>';
    });
    h += '<a href="/books/create" class="shelf-spine-add">+</a></div><div class="shelf-row-line"></div></div>';
  });
  h += '<div class="shelf-row-add" id="btn-add-row-bottom">+ 添加一行书架</div>';
  c.innerHTML = h;
  c.querySelectorAll('.shelf-spine').forEach(function (sp) {
    sp.addEventListener('click', function () {
      var self = this;
      var bk = DATA.find(function (b) { return b.id === parseInt(self.dataset.bookId); });
      if (bk) openBook(bk);
    });
    sp.addEventListener('contextmenu', function (e) { e.preventDefault(); cycleColor(this); });
    sp.addEventListener('dragstart', dragStart);
    sp.addEventListener('dragend', dragEnd);
  });
  c.querySelectorAll('.shelf-row-books').forEach(function (rw) {
    rw.addEventListener('dragover', dragOver);
    rw.addEventListener('drop', onDrop);
  });
  var btnAdd = document.getElementById('btn-add-row-bottom');
  if (btnAdd) btnAdd.addEventListener('click', addRow);
  var btnAddTop = document.getElementById('btn-add-shelf-row');
  if (btnAddTop) btnAddTop.addEventListener('click', addRow);
}

function cycleColor(el) {
  var id = parseInt(el.dataset.bookId);
  var cy = ['', 'light', 'mid', 'dark'];
  var i = cy.indexOf(AppState.spineColors[id] || '');
  i = (i + 1) % cy.length;
  AppState.spineColors[id] = cy[i];
  el.dataset.color = cy[i];
  saveColors();
}

function dragStart(e) { AppState.dragId = parseInt(this.dataset.bookId); this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function dragEnd(e) { this.classList.remove('dragging'); AppState.dragId = null; }
function dragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

function onDrop(e) {
  e.preventDefault();
  var tr = parseInt(this.dataset.row);
  if (AppState.dragId === null || isNaN(tr)) return;
  AppState.rows.forEach(function (r) { var i = r.indexOf(AppState.dragId); if (i >= 0) r.splice(i, 1); });
  AppState.rows = AppState.rows.filter(function (r) { return r.length > 0; });
  if (!AppState.rows[tr]) AppState.rows[tr] = [];
  AppState.rows[tr].push(AppState.dragId);
  saveRows();
  renderShelf();
}

function addRow() { AppState.rows.push([]); saveRows(); renderShelf(); }

function onSearch() {
  var q = document.getElementById('shelf-search').value.trim().toLowerCase();
  document.querySelectorAll('.shelf-spine').forEach(function (s) {
    s.classList.toggle('filtered-out', q.length > 0 && !(s.title || '').toLowerCase().includes(q));
  });
}
