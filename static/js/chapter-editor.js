// ═════════════════════════════════════════════════════════════════════════
// 稿纸编辑器 — 自动保存、稿纸样式、翻页、缩放、参考书
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
    zoom: 1.0,
    currentPage: 1,
    totalPages: 1,
    charsPerPage: 500,
    dirty: false,
    saveTimer: null,
    refOpen: false,
    refTab: 'char',
    refData: {},
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

  // ── 字数与分页 ────────────────────────────────────────────────

  function updateStats() {
    var text = textarea.value || '';
    var len = text.length;
    wordCountEl.textContent = len;

    var cp = state.charsPerPage;
    state.totalPages = Math.max(1, Math.ceil(len / cp));
    if (state.currentPage > state.totalPages) state.currentPage = state.totalPages;
    pageIndicator.textContent = state.currentPage + '/' + state.totalPages;

    // 更新翻页按钮状态
    var prevBtn = $('btn-prev-page');
    var nextBtn = $('btn-next-page');
    if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalPages;
  }

  function getPageStart(pageNum) {
    return (pageNum - 1) * state.charsPerPage;
  }

  function scrollToPage(pageNum) {
    var start = getPageStart(pageNum);
    var text = textarea.value || '';
    // 找到分页点（优先在换行处断页）
    if (start > 0 && start < text.length) {
      var slice = text.substring(Math.max(0, start - 50), start);
      var nl = slice.lastIndexOf('\n');
      if (nl >= 0) {
        start = Math.max(0, start - 50) + nl + 1;
      }
    }
    textarea.focus();
    textarea.setSelectionRange(start, start);
    // 滚动到光标位置
    var lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    var padding = parseInt(getComputedStyle(textarea).paddingTop) || 64;
    var lines = text.substring(0, start).split('\n').length - 1;
    textarea.scrollTop = lines * lineHeight - padding;
  }

  // ── 翻页动画 ──────────────────────────────────────────────────

  function flipPage(direction) {
    var newPage = state.currentPage + direction;
    if (newPage < 1 || newPage > state.totalPages) return;

    // 播放动画
    var paperRect = paperSheet.getBoundingClientRect();
    flipCard.style.left = paperRect.left + 'px';
    flipCard.style.top = paperRect.top + 'px';
    flipCard.style.width = paperRect.width + 'px';
    flipCard.style.height = paperRect.height + 'px';
    flipCard.style.transformOrigin = direction > 0 ? 'right bottom' : 'left bottom';

    flipOverlay.style.display = 'block';
    // 强制回流
    flipCard.offsetHeight;

    // 翻动方向
    var angle = direction > 0 ? -180 : 180;
    flipCard.style.transition = 'transform 0.5s ease-in-out';
    flipCard.style.transform = 'rotateY(' + angle + 'deg)';

    state.currentPage = newPage;
    updateStats();

    setTimeout(function () {
      scrollToPage(state.currentPage);
      // 复位
      flipCard.style.transition = 'none';
      flipCard.style.transform = 'rotateY(0deg)';
      flipOverlay.style.display = 'none';
    }, 480);
  }

  // ── 自动保存 ──────────────────────────────────────────────────

  function autoSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      saveNow();
    }, 2000);
  }

  function saveNow() {
    var content = textarea.value;
    fetch('/api/chapters/' + chapterId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content,
        paper_style: state.paperStyle,
        paper_color: state.paperColor,
      }),
    }).then(function (r) { return r.json(); })
      .then(function () {
        state.dirty = false;
      });
  }

  // ── 稿纸样式 ──────────────────────────────────────────────────

  function setPaperStyle(style) {
    state.paperStyle = style;
    paperSheet.classList.remove('style-lined', 'style-grid');
    paperSheet.classList.add('style-' + style);
    $('btn-paper-lined').classList.toggle('active', style === 'lined');
    $('btn-paper-grid').classList.toggle('active', style === 'grid');
    autoSave();
  }

  function setPaperColor(color) {
    state.paperColor = color;
    paperSheet.classList.remove('color-white', 'color-cream');
    paperSheet.classList.add('color-' + color);
    $('btn-color-white').classList.toggle('active', color === 'white');
    $('btn-color-cream').classList.toggle('active', color === 'cream');
    autoSave();
  }

  // ── 缩放 ──────────────────────────────────────────────────────

  function setZoom(delta) {
    state.zoom = Math.max(0.5, Math.min(2.0, +(state.zoom + delta).toFixed(1)));
    paperScale.style.transform = 'scale(' + state.zoom + ')';
    $('editor-zoom-val').textContent = Math.round(state.zoom * 100) + '%';
  }

  // ── 参考书 ────────────────────────────────────────────────────

  function toggleRef() {
    state.refOpen = !state.refOpen;
    if (state.refOpen) {
      refSidebar.classList.add('expanded');
      loadRefData(state.refTab);
    } else {
      refSidebar.classList.remove('expanded');
    }
  }

  function switchRefTab(tab) {
    if (state.refTab === tab && state.refOpen) {
      toggleRef();
      return;
    }
    state.refTab = tab;
    state.refOpen = true;
    refSidebar.classList.add('expanded');
    // 更新标签 active
    refSidebar.querySelectorAll('.ref-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.ref === tab);
    });
    // 更新标题
    var titles = { char: '人物', plot: '情节', world: '世界观' };
    refPanelTitle.textContent = titles[tab] || '';
    loadRefData(tab);
  }

  function loadRefData(tab) {
    if (state.refData[tab]) {
      renderRefData(tab, state.refData[tab]);
      return;
    }
    refPanelBody.innerHTML = '<div class="ref-loading">加载中...</div>';

    var endpoints = {
      char: '/api/books/' + bookId + '/reference/characters',
      plot: '/api/books/' + bookId + '/reference/plots',
      world: '/api/books/' + bookId + '/reference/world',
    };
    var url = endpoints[tab];
    if (!url) return;

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.refData[tab] = data;
        renderRefData(tab, data);
      });
  }

  function renderRefData(tab, data) {
    if (tab === 'world') {
      var h = '';
      for (var cat in data) {
        if (!data.hasOwnProperty(cat)) continue;
        h += '<div class="ref-cat-title" style="font-size:0.7rem;color:#999;padding:0.4rem 0.5rem 0.15rem;text-transform:uppercase;letter-spacing:.05em">' + esc(cat) + '</div>';
        data[cat].forEach(function (s) {
          h += '<div class="ref-item">'
            + '<div class="ref-item-name">' + esc(s.title) + '</div>'
            + (s.content ? '<div class="ref-item-content">' + esc(s.content) + '</div>' : '')
            + '</div>';
        });
      }
      refPanelBody.innerHTML = h || '<div class="ref-loading">暂无数据</div>';
    } else if (tab === 'char') {
      if (!data.length) { refPanelBody.innerHTML = '<div class="ref-loading">暂无数据</div>'; return; }
      var h = '';
      data.forEach(function (c) {
        h += '<div class="ref-item">'
          + '<div class="ref-item-name">' + esc(c.name)
          + (c.alias ? '<span class="ref-item-alias">' + esc(c.alias) + '</span>' : '')
          + '</div>'
          + (c.age || c.gender ? '<div class="ref-item-meta">' + [c.age, c.gender].filter(Boolean).join(' · ') + '</div>' : '')
          + (c.description ? '<div class="ref-item-desc">' + esc(c.description) + '</div>' : '')
          + '</div>';
      });
      refPanelBody.innerHTML = h;
    } else if (tab === 'plot') {
      if (!data.length) { refPanelBody.innerHTML = '<div class="ref-loading">暂无数据</div>'; return; }
      var h = '';
      data.forEach(function (n) {
        h += '<div class="ref-item">'
          + '<div class="ref-item-name">' + esc(n.title) + '</div>'
          + (n.time_in_story || n.location ? '<div class="ref-item-meta">' + [n.time_in_story, n.location].filter(Boolean).join(' · ') + '</div>' : '')
          + (n.summary ? '<div class="ref-item-desc">' + esc(n.summary) + '</div>' : '')
          + '</div>';
      });
      refPanelBody.innerHTML = h;
    }
  }

  // ── HTML 转义 ─────────────────────────────────────────────────

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── 键盘快捷键 ────────────────────────────────────────────────

  function onKeydown(e) {
    // Ctrl+S / Cmd+S → 立即保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNow();
    }
    // Esc → 关闭参考书
    if (e.key === 'Escape' && state.refOpen) {
      toggleRef();
    }
  }

  // ── 初始化 ────────────────────────────────────────────────────

  function init() {
    // 初始样式
    setPaperStyle(state.paperStyle);
    setPaperColor(state.paperColor);
    paperScale.style.transform = 'scale(' + state.zoom + ')';
    updateStats();

    // 文本输入 → 自动保存
    textarea.addEventListener('input', function () {
      state.dirty = true;
      updateStats();
      autoSave();
    });
    textarea.addEventListener('keydown', onKeydown);

    // 工具栏按钮
    $('btn-paper-lined').addEventListener('click', function () { setPaperStyle('lined'); });
    $('btn-paper-grid').addEventListener('click', function () { setPaperStyle('grid'); });
    $('btn-color-white').addEventListener('click', function () { setPaperColor('white'); });
    $('btn-color-cream').addEventListener('click', function () { setPaperColor('cream'); });
    $('btn-zoom-out').addEventListener('click', function () { setZoom(-0.1); });
    $('btn-zoom-in').addEventListener('click', function () { setZoom(0.1); });

    // 翻页按钮
    $('btn-prev-page').addEventListener('click', function () { flipPage(-1); });
    $('btn-next-page').addEventListener('click', function () { flipPage(1); });

    // 参考书标签点击
    refSidebar.querySelectorAll('.ref-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchRefTab(tab.dataset.ref);
      });
    });

    // 稿纸空白处点击 → 关闭参考书
    $('paper-stage').addEventListener('click', function (e) {
      if (state.refOpen && e.target === this) {
        toggleRef();
      }
    });

    // 缩放支持 Ctrl+滚轮
    $('paper-stage').addEventListener('wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(e.deltaY < 0 ? 0.1 : -0.1);
      }
    }, { passive: false });

    // 页面离开前保存
    window.addEventListener('beforeunload', function () {
      if (state.dirty) saveNow();
    });

    // 初始聚焦
    if (!textarea.value) {
      textarea.focus();
    }
  }

  init();

})();
