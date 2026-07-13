// ═══════════════════════════════════════════════════════════════════════
// 书架视图 — 行管理、书脊颜色、拖拽排序、搜索过滤
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
    var emptyClass = rowIds.length === 0 ? ' shelf-row-empty' : '';
    h += '<div class="shelf-row-wrap" data-row="' + ri + '"><div class="shelf-row-books' + emptyClass + '" data-row="' + ri + '">';
    if (rowIds.length === 0) {
      h += '<span class="shelf-empty-hint">空行</span>';
    }
    rowIds.forEach(function (id) {
      var bk = DATA.find(function (b) { return b.id === id; });
      if (!bk) return;
      var cl = AppState.spineColors[id] || '';
      var hid = filter && !bk.title.toLowerCase().includes(filter) ? ' filtered-out' : '';
      var typeClass = bk.type === 'reading' ? ' spine-reading' : ' spine-writing';
      var typeLabel = bk.type === 'reading' ? ' [阅读]' : '';
      h += '<div class="shelf-spine' + hid + typeClass + '" data-book-id="' + id + '" data-color="' + cl + '" draggable="true" title="' + esc(bk.title) + typeLabel + ' (右键切换颜色)">' + esc(bk.title) + '</div>';
    });
    h += '<a href="/books/create" class="shelf-spine-add">+</a>';
    if (rowIds.length === 0) {
      h += '<button class="shelf-row-delete" title="删除空行" data-row="' + ri + '">&times;</button>';
    }
    h += '</div><div class="shelf-row-line"></div></div>';
  });
  h += '<div class="shelf-row-add" id="btn-add-row-bottom">+ 添加一行书架</div>';
  c.innerHTML = h;

  // 删除空行按钮
  c.querySelectorAll('.shelf-row-delete').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var ri = parseInt(this.dataset.row);
      AppState.rows.splice(ri, 1);
      saveRows();
      renderShelf();
    });
  });

  // 书脊事件
  c.querySelectorAll('.shelf-spine').forEach(function (sp) {
    sp.addEventListener('click', function () {
      var self = this;
      var bk = DATA.find(function (b) { return b.id === parseInt(self.dataset.bookId); });
      if (bk) openBook(bk);
    });
    sp.addEventListener('contextmenu', function (e) { e.preventDefault(); cycleColor(this); });
    sp.addEventListener('dragstart', dragStart);
    sp.addEventListener('dragend', dragEnd);
    sp.addEventListener('dragover', spineDragOver);
    sp.addEventListener('drop', spineDrop);
  });

  // 行容器事件（接收放到行末）
  c.querySelectorAll('.shelf-row-books').forEach(function (rw) {
    rw.addEventListener('dragover', dragOver);
    rw.addEventListener('drop', onDrop);
  });

  var btnAdd = document.getElementById('btn-add-row-bottom');
  if (btnAdd) btnAdd.addEventListener('click', addRow);
  var btnAddTop = document.getElementById('btn-add-shelf-row');
  if (btnAddTop) btnAddTop.addEventListener('click', addRow);

  // 清理空行
  cleanEmptyRows();
}

function cleanEmptyRows() {
  AppState.rows = AppState.rows.filter(function (r) { return r.length > 0; });
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

// ── 拖拽 ──

function dragStart(e) {
  AppState.dragId = parseInt(this.dataset.bookId);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function dragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.shelf-spine').forEach(function (s) { s.classList.remove('drag-over', 'drag-before'); });
  AppState.dragId = null;
}

function dragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

// 放到行容器末尾
function onDrop(e) {
  e.preventDefault();
  var tr = parseInt(this.dataset.row);
  if (AppState.dragId === null || isNaN(tr)) return;
  removeFromRows(AppState.dragId);
  if (!AppState.rows[tr]) AppState.rows[tr] = [];
  AppState.rows[tr].push(AppState.dragId);
  cleanEmptyRows();
  saveRows();
  renderShelf();
}

// 放到书脊上 → 插入前方或后方
function spineDragOver(e) {
  if (AppState.dragId === parseInt(this.dataset.bookId)) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  var rect = this.getBoundingClientRect();
  var mid = rect.left + rect.width / 2;
  this.classList.remove('drag-before');
  if (e.clientX < mid) {
    this.classList.add('drag-before');
  } else {
    this.classList.add('drag-over');
  }
}

function spineDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over', 'drag-before');
  if (AppState.dragId === null) return;
  if (AppState.dragId === parseInt(this.dataset.bookId)) return;

  var targetRow = parseInt(this.closest('.shelf-row-books').dataset.row);
  var targetId = parseInt(this.dataset.bookId);
  var rect = this.getBoundingClientRect();
  var before = e.clientX < (rect.left + rect.width / 2);

  removeFromRows(AppState.dragId);

  // 确保目标行存在
  if (!AppState.rows[targetRow]) AppState.rows[targetRow] = [];

  var idx = AppState.rows[targetRow].indexOf(targetId);
  if (idx >= 0) {
    AppState.rows[targetRow].splice(before ? idx : idx + 1, 0, AppState.dragId);
  } else {
    AppState.rows[targetRow].push(AppState.dragId);
  }

  cleanEmptyRows();
  saveRows();
  renderShelf();
}

function removeFromRows(id) {
  AppState.rows.forEach(function (r) {
    var i = r.indexOf(id);
    if (i >= 0) r.splice(i, 1);
  });
}

function addRow() { AppState.rows.push([]); saveRows(); renderShelf(); }

function onSearch() {
  var q = document.getElementById('shelf-search').value.trim().toLowerCase();
  document.querySelectorAll('.shelf-spine').forEach(function (s) {
    s.classList.toggle('filtered-out', q.length > 0 && !(s.title || '').toLowerCase().includes(q));
  });
}

// ── EPUB 导入（书架页快捷入口）──────────────────────────────────

function initEpubImport() {
  var btn = document.getElementById('btn-import-epub');
  if (!btn) return;

  // 创建隐藏文件选择器
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.epub';
  input.style.display = 'none';
  document.body.appendChild(input);

  btn.addEventListener('click', function () {
    input.value = '';
    input.click();
  });

  input.addEventListener('change', function () {
    var file = input.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.epub')) {
      alert('请选择 .epub 格式的电子书文件');
      return;
    }

    btn.disabled = true;
    btn.textContent = '导入中…';

    var formData = new FormData();
    formData.append('file', file);

    fetch('/api/books/import-epub', {
      method: 'POST',
      body: formData,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          alert('导入失败：' + data.error);
          btn.disabled = false;
          btn.textContent = '导入';
          return;
        }
        // 刷新页面以显示新书
        window.location.reload();
      })
      .catch(function (err) {
        alert('导入失败：' + err.message);
        btn.disabled = false;
        btn.textContent = '导入';
      });
  });
}

// 在 renderShelf 中首次调用时初始化
var _epubImportInited = false;
var origRenderShelf = renderShelf;
renderShelf = function (filter) {
  origRenderShelf(filter);
  if (!_epubImportInited) {
    _epubImportInited = true;
    initEpubImport();
  }
};
