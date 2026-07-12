// ═══════════════════════════════════════════════════════════════════════
// 世界观标签 — 设定面板渲染
// 依赖：search.js, book-view.js
// ═══════════════════════════════════════════════════════════════════════

var AppState = window.AppState;
var DATA = window.BOOKS_DATA || [];
var LS_WORLD_ORDER = 'mynovel-world-order-';

function renderWorld(searchQ) {
  var q = (searchQ || '').toLowerCase();
  var key = LS_WORLD_ORDER + AppState.currentBook.id;
  var settings = getOrdered(AppState.currentBook.world_settings.slice(), key);
  if (q) settings = settings.filter(function (s) { return searchWorldFn({ item: s }, q); });
  var addUrl = '/world/create?book_id=' + AppState.currentBook.id;
  var L = document.getElementById('page-left-content'), R = document.getElementById('page-right-content');
  var grp = {};
  settings.forEach(function (s) { if (!grp[s.category]) grp[s.category] = []; grp[s.category].push(s); });
  var flat = [];
  Object.keys(grp).forEach(function (cat) { grp[cat].forEach(function (s) { flat.push({ cat: cat, item: s }); }); });
  var searchBox = getSearchBox('world', '搜索设定...', settings, searchWorldFn, renderWorld);
  var leftHtml = '<div class="book-page-title">' + (AppState.currentSpread === 0 ? '世界观' : '') + '</div>';
  if (AppState.currentSpread === 0) leftHtml += '<a href="' + addUrl + '" class="book-page-add">+ 添加</a>';
  leftHtml += '<div id="world-search-slot"></div>';
  if (settings.length === 0) {
    leftHtml += '<p style="color:#999;font-size:0.82rem;">' + (q ? '没有匹配项' : '暂无设定') + '</p>';
    L.innerHTML = leftHtml; R.innerHTML = '';
    document.getElementById('world-search-slot').appendChild(searchBox);
    addPagination(1);
    return;
  }
  if (AppState.pendingHL) {
    var idx = flat.findIndex(function (x) { return x.item.id === AppState.pendingHL; });
    if (idx >= 0) AppState.currentSpread = Math.floor(idx / (AppState.PP * 2));
  }
  var totalSpreads = Math.ceil(flat.length / (AppState.PP * 2));
  if (AppState.currentSpread >= totalSpreads) AppState.currentSpread = totalSpreads - 1;
  var start = AppState.currentSpread * AppState.PP * 2;
  var pageItems = flat.slice(start, start + AppState.PP * 2);
  leftHtml += buildWorldPanel(pageItems.slice(0, AppState.PP), '', '');
  L.innerHTML = leftHtml;
  R.innerHTML = buildWorldPanel(pageItems.slice(AppState.PP), '', '');
  document.getElementById('world-search-slot').appendChild(searchBox);
  addPagination(totalSpreads);
  if (AppState.pendingHL) {
    setTimeout(function () {
      var el = document.querySelector('.world-item[data-id="' + AppState.pendingHL + '"]');
      if (el) { el.classList.add('highlight-flash'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      AppState.pendingHL = 0;
    }, 200);
  }
  [L, R].forEach(function (el) { makeDraggable(el, settings, key, function () { renderWorld(q); }); });
}

function buildWorldPanel(items, title, addUrl) {
  if (items.length === 0) return '';
  var g = {};
  items.forEach(function (x) { if (!g[x.cat]) g[x.cat] = []; g[x.cat].push(x.item); });
  var h = '';
  if (title) h += '<div class="book-page-title">' + title + '</div>';
  if (addUrl) h += '<a href="' + addUrl + '" class="book-page-add">+ 添加</a>';
  Object.keys(g).forEach(function (cat) {
    h += '<div style="margin-bottom:0.5rem;"><div style="font-size:0.66rem;color:#999;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.2rem;">' + esc(cat) + '</div><div class="world-grid">';
    g[cat].forEach(function (s) {
      h += '<div class="world-item draggable-card" draggable="true" data-id="' + s.id + '"><div class="world-item-title"><a href="/world/setting/' + s.id + '" style="text-decoration:none;color:inherit;">' + esc(s.title) + '</a></div>';
      if (s.content) h += '<div class="world-item-content">' + esc(s.content).substring(0, 100) + (s.content.length > 100 ? '...' : '') + '</div>';
      if (s.fields && s.fields.length) {
        h += '<div style="margin-top:0.3rem;display:flex;flex-wrap:wrap;gap:0.2rem;">';
        s.fields.forEach(function (f) {
          h += '<span style="background:#f5f5f5;padding:0.1rem 0.4rem;border-radius:2px;font-size:0.65rem;">' + esc(f.name) + ': ' + esc(f.value).substring(0, 40) + (f.value && f.value.length > 40 ? '...' : '') + '</span>';
        });
        h += '</div>';
      }
      h += '</div>';
    });
    h += '</div></div>';
  });
  return h;
}
