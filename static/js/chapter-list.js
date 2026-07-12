// ═════════════════════════════════════════════════════════════════════════
// 章节列表 — 新建、删除、拖拽排序、进入编辑器
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

    if (chapters.length === 0) {
      empty.style.display = '';
      // 清除除空状态外的其他子元素
      var children = container.children;
      for (var i = children.length - 1; i >= 0; i--) {
        if (children[i] !== empty) container.removeChild(children[i]);
      }
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

    // 保留空状态元素
    container.innerHTML = h;
    container.appendChild(empty);

    // 绑定事件
    bindEvents(container);
  }

  function bindEvents(container) {
    // 拖拽事件
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

    // 删除按钮
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
    var orderList = chapters.map(function (c, i) {
      return { id: c.id, order: i };
    });
    fetch('/api/chapters/' + chapters[0].id + '/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_list: orderList }),
    });
  }

  // ── 新建章节 ──────────────────────────────────────────────────────

  function newChapter() {
    var title = prompt('章节标题：');
    if (!title || !title.trim()) return;
    fetch('/api/books/' + bookId + '/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (ch) {
        if (ch.id) {
          window.location.href = '/chapters/' + ch.id + '/write';
        } else {
          loadChapters();
        }
      });
  }

  // ── HTML 转义 ─────────────────────────────────────────────────────

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── 初始化 ────────────────────────────────────────────────────────

  document.getElementById('btn-new-chapter').addEventListener('click', newChapter);
  loadChapters();

})();
