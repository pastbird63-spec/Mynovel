// ═══════════════════════════════════════════════════════════════════════
// 人物标签 — 塔罗牌渲染
// 依赖：search.js, book-view.js
// ═══════════════════════════════════════════════════════════════════════

var AppState = window.AppState;
var DATA = window.BOOKS_DATA || [];
var LS_CHAR_ORDER = 'mynovel-char-order-';

function renderChars(searchQ) {
  var q = (searchQ || '').toLowerCase();
  var key = LS_CHAR_ORDER + AppState.currentBook.id;
  var chars = getOrdered(AppState.currentBook.characters.slice(), key);
  if (q) chars = chars.filter(function (c) { return searchCharsFn(c, q); });
  var addUrl = '/characters/create?book_id=' + AppState.currentBook.id;
  var L = document.getElementById('page-left-content'), R = document.getElementById('page-right-content');
  var origChars = getOrdered(AppState.currentBook.characters.slice(), key);
  var searchBox = getSearchBox('char', '搜索人物...', origChars, searchCharsFn, renderChars);
  var leftHtml = '<div class="book-page-title">' + (AppState.currentSpread === 0 ? '人物' : '') + '</div>';
  if (AppState.currentSpread === 0) leftHtml += '<a href="' + addUrl + '" class="book-page-add">+ 添加</a>';
  leftHtml += '<div id="char-search-slot"></div>';
  if (chars.length === 0) {
    leftHtml += '<p style="color:#999;font-size:0.82rem;">' + (q ? '没有匹配项' : '暂无人物') + '</p>';
    L.innerHTML = leftHtml; R.innerHTML = '';
    document.getElementById('char-search-slot').appendChild(searchBox);
    addPagination(1);
    return;
  }
  if (AppState.pendingHL) {
    var idx = chars.findIndex(function (c) { return c.id === AppState.pendingHL; });
    if (idx >= 0) AppState.currentSpread = Math.floor(idx / (AppState.PP * 2));
  }
  var totalSpreads = Math.ceil(chars.length / (AppState.PP * 2));
  if (AppState.currentSpread >= totalSpreads) AppState.currentSpread = totalSpreads - 1;
  var start = AppState.currentSpread * AppState.PP * 2;
  var pageItems = chars.slice(start, start + AppState.PP * 2);
  leftHtml += buildTarot(pageItems.slice(0, AppState.PP), '', '');
  L.innerHTML = leftHtml;
  R.innerHTML = buildTarot(pageItems.slice(AppState.PP), '', '');
  document.getElementById('char-search-slot').appendChild(searchBox);
  addPagination(totalSpreads);
  if (AppState.pendingHL) {
    setTimeout(function () {
      var el = document.querySelector('.tarot-card[data-id="' + AppState.pendingHL + '"]');
      if (el) { el.classList.add('highlight-flash'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      AppState.pendingHL = 0;
    }, 200);
  }
  [L, R].forEach(function (el) { makeDraggable(el, chars, key, function () { renderChars(q); }); });
}

function buildTarot(items, title, addUrl) {
  var h = '';
  if (title) h += '<div class="book-page-title">' + title + '</div>';
  if (addUrl) h += '<a href="' + addUrl + '" class="book-page-add">+ 添加</a>';
  h += '<div class="tarot-grid">';
  items.forEach(function (c) {
    var img = (c.images && c.images.length) ? '<img src="/static/uploads/' + c.images[0].filename + '" alt="" loading="lazy">' : '<span class="tarot-placeholder">' + esc(c.name[0]) + '</span>';
    h += '<a href="/characters/' + c.id + '" class="tarot-card draggable-card" draggable="true" data-id="' + c.id + '"><div class="tarot-image">' + img + '</div><div class="tarot-divider"></div><div class="tarot-info"><div class="tarot-name">' + esc(c.name) + '</div>' + (c.alias ? '<div class="tarot-alias">' + esc(c.alias) + '</div>' : '') + '<div class="tarot-book-tag">' + esc(AppState.currentBook.title) + '</div></div></a>';
  });
  h += '</div>';
  return h;
}
