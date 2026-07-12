// ═════════════════════════════════════════════════════════════════════════
// 章节列表 — 内联新建、删除、拖拽排序、进入编辑器
// ═════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var bookId = window.CHAPTER_BOOK_ID;
  var chapters = [];
  var dragIdx = -1;

  // ── 加载列表 ──────────────────────────────────────────────────────

  function loadChapters() {
    fetch('/api/books/' + bookId + '/chapters')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        chapters = data;
        render();
      });
  }

  // ── 渲染 ──────────────────────────────────────────────────────────

  function render() {
    var container = document.getElementById('chapter-items');
    var empty = document.getElementById('chapter-empty');

    // 保留空状态和新建表单
    var formEl = document.getElementById('new-chapter-form');

    if (chapters.length === 0) {
      empty.style.display = '';
      removeItems(container, [empty, formEl]);
      return;
    }

    empty.style.display = 'none';

    var h = '';
    chapters.forEach(function (ch, i) {
      h += '<div class="chapter-item draggable" draggable="true" data-index="' + i + '">'
        + '<span class="chapter-drag-handle" title="拖动排序">☰</span>'
        + '<a href="/chapters/' + ch.id + '/write" class="chapter-title-link">' + esc(ch.title) + '</a>'
        + '<span class="chapter-meta">' + (ch.word_count || 0) + ' 字</span>'
        + '<button class="chapter-delete-btn" data-id="' + ch.id + '" title="删除">×</button>'
        + '</div>';
    });

    // 清除旧列表项，保留表单和空状态
    removeItems(container, [empty, formEl]);
    container.insertAdjacentHTML('beforeend', h);

    // 绑定事件
    bindEvents(container);
  }

  function removeItems(container, keep) {
    for (var i = container.children.length - 1; i >= 0; i--) {
      var el = container.children[i];
      if (keep.indexOf(el) === -1) container.removeChild(el);
    }
  }

  function bindEvents(container) {
    var items = container.querySelectorAll('.chapter-item');
    items.forEach(function (item, i) {
      item.addEventListener('dragstart', function (e) {
        dragIdx = i;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', function (e) {
        this.classList.remove('dragging');
        container.querySelectorAll('.chapter-item').forEach(function (el) {
          el.classList.remove('drag-over');
        });
        dragIdx = -1;
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });
      item.addEventListener('dragleave', function (e) {
        this.classList.remove('drag-over');
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (dragIdx < 0 || dragIdx === i) return;
        var ch = chapters.splice(dragIdx, 1)[0];
        chapters.splice(i, 0, ch);
        chapters.forEach(function (c, idx) { c.order = idx; });
        render();
        saveOrder();
      });
    });

    container.querySelectorAll('.chapter-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var id = parseInt(this.dataset.id);
        if (!confirm('确定删除这一章吗？内容无法恢复。')) return;
        fetch('/api/chapters/' + id, { method: 'DELETE' })
          .then(function (r) { return r.json(); })
          .then(function () { loadChapters(); });
      });
    });
  }

  // ── 保存排序 ──────────────────────────────────────────────────────

  function saveOrder() {
    if (chapters.length === 0) return;
    var orderList = chapters.map(function (c, i) {
      return { id: c.id, order: i };
    });
    fetch('/api/chapters/' + chapters[0].id + '/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_list: orderList }),
    });
  }

  // ── 内联新建表单 ──────────────────────────────────────────────────

  function showNewChapterForm() {
    // 如果已有表单，聚焦即可
    var existing = document.getElementById('new-chapter-form');
    if (existing) {
      var input = existing.querySelector('input');
      if (input) { input.focus(); input.select(); }
      return;
    }

    var form = document.createElement('div');
    form.id = 'new-chapter-form';
    form.className = 'chapter-new-form';
    form.innerHTML = ''
      + '<input type="text" class="chapter-new-input" placeholder="章节标题…" autocomplete="off">'
      + '<div class="chapter-new-actions">'
      + '<button class="btn btn-sm btn-primary chapter-new-confirm">创建</button>'
      + '<button class="btn btn-sm btn-outline-secondary chapter-new-cancel">取消</button>'
      + '</div>';

    var container = document.getElementById('chapter-items');
    container.insertBefore(form, container.firstChild);

    var input = form.querySelector('input');
    var confirmBtn = form.querySelector('.chapter-new-confirm');
    var cancelBtn = form.querySelector('.chapter-new-cancel');

    input.focus();

    function submit() {
      var title = input.value.trim();
      if (!title) { input.focus(); return; }
      confirmBtn.disabled = true;
      confirmBtn.textContent = '…';
      fetch('/api/books/' + bookId + '/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title }),
      })
        .then(function (r) { return r.json(); })
        .then(function (ch) {
          if (ch.id) {
            window.location.href = '/chapters/' + ch.id + '/write';
          } else {
            form.remove();
            loadChapters();
          }
        });
    }

    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { form.remove(); }
    });
    cancelBtn.addEventListener('click', function () { form.remove(); });
  }

  // ── HTML 转义 ─────────────────────────────────────────────────────

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── 初始化 ────────────────────────────────────────────────────────

  document.getElementById('btn-new-chapter').addEventListener('click', showNewChapterForm);
  loadChapters();

})();
