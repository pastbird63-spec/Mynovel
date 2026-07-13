// ═════════════════════════════════════════════════════════════════════════
// 章节列表 — 新建、删除、拖拽排序、导入、导出
// ═════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var bookId = window.CHAPTER_BOOK_ID;
  var chapters = [];
  var dragIdx = -1;
  var selectedFile = null;

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

    removeItems(container, [empty, formEl]);
    container.insertAdjacentHTML('beforeend', h);

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

  // ── 导出下拉菜单 ──────────────────────────────────────────────────

  function initExportDropdown() {
    var toggle = document.getElementById('btn-export-toggle');
    var menu = document.getElementById('export-menu');

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    document.addEventListener('click', function () {
      menu.classList.remove('open');
    });
  }

  // ── 导入 ──────────────────────────────────────────────────────────

  function initImport() {
    var modal = document.getElementById('import-modal');
    var fileInput = document.getElementById('import-file-input');
    var dropZone = document.getElementById('file-drop-zone');
    var dropText = document.getElementById('file-drop-text');
    var fileInfo = document.getElementById('file-info');
    var fileName = document.getElementById('file-name');
    var fileSize = document.getElementById('file-size');
    var optionGroup = document.getElementById('import-option-group');
    var optionSplitBlank = document.getElementById('option-split-blank');
    var optionSplitHeading = document.getElementById('option-split-heading');
    var confirmBtn = document.getElementById('btn-import-confirm');
    var msgEl = document.getElementById('import-msg');

    function resetModal() {
      selectedFile = null;
      fileInput.value = '';
      fileInfo.style.display = 'none';
      dropText.style.display = '';
      optionGroup.style.display = 'none';
      optionSplitBlank.style.display = 'none';
      optionSplitHeading.style.display = 'none';
      document.getElementById('chk-split-blank').checked = false;
      document.getElementById('chk-split-heading').checked = false;
      confirmBtn.disabled = true;
      msgEl.textContent = '';
      document.querySelector('input[name="import-format"][value="txt"]').checked = true;
    }

    function showModal() {
      resetModal();
      modal.style.display = 'flex';
    }

    function hideModal() {
      modal.style.display = 'none';
    }

    function updateOptions() {
      var format = document.querySelector('input[name="import-format"]:checked').value;
      optionGroup.style.display = 'block';
      optionSplitBlank.style.display = (format === 'txt') ? '' : 'none';
      optionSplitHeading.style.display = (format === 'docx') ? '' : 'none';
      if (format === 'txt') {
        document.getElementById('chk-split-heading').checked = false;
      } else {
        document.getElementById('chk-split-blank').checked = false;
      }
    }

    function selectFile(file) {
      if (!file) return;
      var ext = file.name.split('.').pop().toLowerCase();
      var expectedFormat = document.querySelector('input[name="import-format"]:checked').value;
      if ((expectedFormat === 'txt' && ext !== 'txt') ||
          (expectedFormat === 'docx' && ext !== 'docx')) {
        msgEl.textContent = '文件格式与所选类型不匹配';
        return;
      }
      selectedFile = file;
      fileName.textContent = file.name;
      fileSize.textContent = formatBytes(file.size);
      fileInfo.style.display = '';
      dropText.style.display = 'none';
      confirmBtn.disabled = false;
      msgEl.textContent = '';
      updateOptions();
    }

    function doImport() {
      if (!selectedFile) return;

      var format = document.querySelector('input[name="import-format"]:checked').value;
      var formData = new FormData();
      formData.append('file', selectedFile);

      if (format === 'txt') {
        var split = document.getElementById('chk-split-blank').checked;
        if (split) formData.append('split', 'true');
      }
      if (format === 'docx') {
        var splitH = document.getElementById('chk-split-heading').checked;
        if (splitH) formData.append('split_by_heading', 'true');
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = '…';
      msgEl.textContent = '导入中…';
      msgEl.className = 'modal-msg';

      var url = '/import/' + bookId + '/' + format;

      fetch(url, { method: 'POST', body: formData })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            msgEl.textContent = data.error;
            msgEl.className = 'modal-msg modal-msg-error';
            confirmBtn.disabled = false;
            confirmBtn.textContent = '导入';
            return;
          }
          msgEl.textContent = '已创建 ' + data.created.length + ' 个章节，共 ' + data.total_word_count + ' 字';
          msgEl.className = 'modal-msg modal-msg-ok';
          confirmBtn.textContent = '完成';
          setTimeout(function () {
            hideModal();
            loadChapters();
          }, 1500);
        })
        .catch(function (err) {
          msgEl.textContent = '导入失败：' + err.message;
          msgEl.className = 'modal-msg modal-msg-error';
          confirmBtn.disabled = false;
          confirmBtn.textContent = '导入';
        });
    }

    // 事件绑定
    document.getElementById('btn-import').addEventListener('click', showModal);
    document.getElementById('btn-import-close').addEventListener('click', hideModal);
    document.getElementById('btn-import-cancel').addEventListener('click', hideModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideModal();
    });

    confirmBtn.addEventListener('click', doImport);

    // 格式切换
    document.querySelectorAll('input[name="import-format"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        resetModal();
        updateOptions();
      });
    });

    // 文件选择
    dropZone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) selectFile(fileInput.files[0]);
    });

    // 拖拽
    dropZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
    });
  }

  // ── HTML 转义 ─────────────────────────────────────────────────────

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  // ── 初始化 ────────────────────────────────────────────────────────

  document.getElementById('btn-new-chapter').addEventListener('click', showNewChapterForm);
  initExportDropdown();
  initImport();
  loadChapters();

})();
