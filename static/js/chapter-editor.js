// ═════════════════════════════════════════════════════════════════════════
// 稿纸编辑器 — 自动保存、稿纸样式、翻页、缩放、参考书（列表→详情）
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
    currentPage: 1,
    totalPages: 1,
    charsPerPage: 500,
    dirty: false,
    saveTimer: null,
    refOpen: false,
    refTab: 'char',
    refData: {},
    refView: 'list',  // 'list' | 'detail'
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

  // ── 字数与分页 ────────────────────────────────────────────────

  function updateStats() {
    var text = textarea.value || '';
    var len = text.length;
    wordCountEl.textContent = len;

    var cp = state.charsPerPage;
    state.totalPages = Math.max(1, Math.ceil(len / cp));
    if (state.currentPage > state.totalPages) state.currentPage = state.totalPages;
    pageIndicator.textContent = state.currentPage + '/' + state.totalPages;

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
    if (start > 0 && start < text.length) {
      var slice = text.substring(Math.max(0, start - 50), start);
      var nl = slice.lastIndexOf('\n');
      if (nl >= 0) {
        start = Math.max(0, start - 50) + nl + 1;
      }
    }
    textarea.focus();
    textarea.setSelectionRange(start, start);
    var lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
    var padding = parseInt(getComputedStyle(textarea).paddingTop) || 64;
    var lines = text.substring(0, start).split('\n').length - 1;
    textarea.scrollTop = lines * lineHeight - padding;
  }

  // ── 翻页动画 ──────────────────────────────────────────────────

  function flipPage(direction) {
    var newPage = state.currentPage + direction;
    if (newPage < 1 || newPage > state.totalPages) return;

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
    updateStats();

    setTimeout(function () {
      scrollToPage(state.currentPage);
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
        paper_size: state.paperSize,
      }),
    }).then(function (r) { return r.json(); })
      .then(function () { state.dirty = false; });
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

  function setPaperSize(size) {
    state.paperSize = size;
    paperSheet.classList.toggle('size-a4', size === 'a4');
    $('btn-size-a5').classList.toggle('active', size === 'a5');
    $('btn-size-a4').classList.toggle('active', size === 'a4');
    autoSave();
  }

  // ── 缩放 ──────────────────────────────────────────────────────

  function setZoom(delta) {
    state.zoom = Math.max(0.5, Math.min(2.0, +(state.zoom + delta).toFixed(1)));
    paperScale.style.transform = 'scale(' + state.zoom + ')';
    $('editor-zoom-val').textContent = Math.round(state.zoom * 100) + '%';
  }

  // ═════════════════════════════════════════════════════════════
  // 参考书 — 列表视图 & 详情视图（面板内切换，不跳转）
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
    if (state.refTab === tab && state.refOpen) {
      toggleRef();
      return;
    }
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

  // ── 加载并渲染参考书列表 ──────────────────────────────────────

  function loadRefData(tab) {
    if (state.refData[tab]) {
      renderRefList(tab, state.refData[tab]);
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
        renderRefList(tab, data);
      });
  }

  function renderRefList(tab, data) {
    state.refView = 'list';
    state.refDetailItem = null;

    if (tab === 'world') {
      var h = '';
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
      var h = '';
      data.forEach(function (c) {
        h += '<div class="ref-item" data-type="char" data-id="' + c.id + '">'
          + '<div class="ref-item-name">' + esc(c.name)
          + (c.alias ? '<span class="ref-item-alias">' + esc(c.alias) + '</span>' : '')
          + '</div>'
          + (c.age || c.gender ? '<div class="ref-item-meta">' + [c.age, c.gender].filter(Boolean).join(' · ') + '</div>' : '')
          + (c.description ? '<div class="ref-item-desc">' + esc(c.description) + '</div>' : '')
          + '</div>';
      });
      refPanelBody.innerHTML = h;
    } else if (tab === 'plot') {
      if (!data || !data.length) { refPanelBody.innerHTML = '<div class="ref-loading">暂无数据</div>'; return; }
      var h = '';
      data.forEach(function (n) {
        h += '<div class="ref-item" data-type="plot" data-id="' + n.id + '">'
          + '<div class="ref-item-name">' + esc(n.title) + '</div>'
          + (n.time_in_story || n.location ? '<div class="ref-item-meta">' + [n.time_in_story, n.location].filter(Boolean).join(' · ') + '</div>' : '')
          + (n.summary ? '<div class="ref-item-desc">' + esc(n.summary) + '</div>' : '')
          + '</div>';
      });
      refPanelBody.innerHTML = h;
    }

    // 绑定列表项点击 → 进入详情
    refPanelBody.querySelectorAll('.ref-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var type = this.dataset.type;
        var id = parseInt(this.dataset.id);
        loadRefDetail(type, id);
      });
    });
  }

  // ── 加载并渲染参考书详情（面板内） ────────────────────────────

  function loadRefDetail(type, id) {
    refPanelBody.innerHTML = '<div class="ref-loading">加载中...</div>';

    var urls = {
      char: '/api/reference/character/',
      plot: '/api/reference/plot/',
      world: '/api/reference/world/',
    };
    fetch(urls[type] + id)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.refView = 'detail';
        state.refDetailItem = { type: type, data: data };
        renderRefDetail(type, data);
      });
  }

  function renderRefDetail(type, d) {
    var h = '';
    h += '<button class="ref-detail-back" id="ref-detail-back">&larr; 返回列表</button>';

    if (type === 'char') {
      h += '<div class="ref-detail-name">' + esc(d.name) + '</div>';
      if (d.alias) h += '<div class="ref-detail-alias">' + esc(d.alias) + '</div>';
      h += '<table class="ref-detail-table">';
      if (d.age) h += '<tr><td>年龄</td><td>' + esc(d.age) + '</td></tr>';
      if (d.gender) h += '<tr><td>性别</td><td>' + esc(d.gender) + '</td></tr>';
      h += '</table>';
      if (d.description) {
        h += '<div class="ref-detail-section">简介</div>';
        h += '<div class="ref-detail-desc">' + esc(d.description) + '</div>';
      }
      if (d.custom_fields && d.custom_fields.length) {
        h += '<div class="ref-detail-section">自定义字段</div>';
        d.custom_fields.forEach(function (f) {
          h += '<div class="ref-field-item"><div class="ref-field-name">' + esc(f.name) + '</div><div class="ref-field-value">' + esc(f.value || '—') + '</div></div>';
        });
      }
      if (d.images && d.images.length) {
        h += '<div class="ref-detail-section">图片 (' + d.images.length + ')</div>';
      }

    } else if (type === 'plot') {
      h += '<div class="ref-detail-name">' + esc(d.title) + '</div>';
      h += '<table class="ref-detail-table">';
      if (d.time_in_story) h += '<tr><td>时间</td><td>' + esc(d.time_in_story) + '</td></tr>';
      if (d.location) h += '<tr><td>地点</td><td>' + esc(d.location) + '</td></tr>';
      h += '</table>';
      if (d.summary) {
        h += '<div class="ref-detail-section">摘要</div>';
        h += '<div class="ref-detail-desc">' + esc(d.summary) + '</div>';
      }
      if (d.characters && d.characters.length) {
        h += '<div class="ref-detail-section">关联人物</div>';
        h += '<div class="ref-char-list">';
        d.characters.forEach(function (pc) {
          h += '<span class="ref-char-tag">' + esc(pc.name) + (pc.role ? '<span class="role"> ' + esc(pc.role) + '</span>' : '') + '</span>';
        });
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
      h += '<table class="ref-detail-table">';
      h += '<tr><td>类别</td><td>' + esc(d.category) + '</td></tr>';
      h += '</table>';
      if (d.content) {
        h += '<div class="ref-detail-section">内容</div>';
        h += '<div class="ref-detail-desc">' + esc(d.content) + '</div>';
      }
      if (d.custom_fields && d.custom_fields.length) {
        h += '<div class="ref-detail-section">描述字段</div>';
        d.custom_fields.forEach(function (f) {
          h += '<div class="ref-field-item"><div class="ref-field-name">' + esc(f.name) + '</div><div class="ref-field-value">' + esc(f.value || '—') + '</div></div>';
        });
      }
    }

    refPanelBody.innerHTML = h;

    // 返回按钮
    var backBtn = document.getElementById('ref-detail-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        renderRefList(state.refTab, state.refData[state.refTab]);
      });
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
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveNow();
    }
    // Esc → 如果在看参考书详情，先返回列表；否则关闭参考书
    if (e.key === 'Escape') {
      if (state.refOpen && state.refView === 'detail') {
        renderRefList(state.refTab, state.refData[state.refTab]);
      } else if (state.refOpen) {
        toggleRef();
      }
    }
  }

  // ── 初始化 ────────────────────────────────────────────────────

  function init() {
    setPaperStyle(state.paperStyle);
    setPaperColor(state.paperColor);
    setPaperSize(state.paperSize);
    paperScale.style.transform = 'scale(' + state.zoom + ')';
    updateStats();

    textarea.addEventListener('input', function () {
      state.dirty = true;
      updateStats();
      autoSave();
    });
    textarea.addEventListener('keydown', onKeydown);

    $('btn-paper-lined').addEventListener('click', function () { setPaperStyle('lined'); });
    $('btn-paper-grid').addEventListener('click', function () { setPaperStyle('grid'); });
    $('btn-color-white').addEventListener('click', function () { setPaperColor('white'); });
    $('btn-color-cream').addEventListener('click', function () { setPaperColor('cream'); });
    $('btn-size-a5').addEventListener('click', function () { setPaperSize('a5'); });
    $('btn-size-a4').addEventListener('click', function () { setPaperSize('a4'); });
    $('btn-zoom-out').addEventListener('click', function () { setZoom(-0.1); });
    $('btn-zoom-in').addEventListener('click', function () { setZoom(0.1); });

    $('btn-prev-page').addEventListener('click', function () { flipPage(-1); });
    $('btn-next-page').addEventListener('click', function () { flipPage(1); });

    refSidebar.querySelectorAll('.ref-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchRefTab(tab.dataset.ref);
      });
    });

    $('paper-stage').addEventListener('click', function (e) {
      if (state.refOpen && e.target === this) {
        toggleRef();
      }
    });

    $('paper-stage').addEventListener('wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoom(e.deltaY < 0 ? 0.1 : -0.1);
      }
    }, { passive: false });

    window.addEventListener('beforeunload', function () {
      if (state.dirty) saveNow();
    });

    if (!textarea.value) {
      textarea.focus();
    }
  }

  init();

})();
