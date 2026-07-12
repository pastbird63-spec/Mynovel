// ═══════════════════════════════════════════════════════════════════════
// 共享状态 & 搜索辅助函数
// 依赖：无（最先加载）
// ═══════════════════════════════════════════════════════════════════════

window.AppState = window.AppState || {};
var AppState = window.AppState;

// 共享状态初始化
if (AppState._init === undefined) {
  AppState.currentBook = null;
  AppState.currentTab = 'char';
  AppState.currentSpread = 0;
  AppState.pendingHL = 0;
  AppState.rows = [];
  AppState.spineColors = {};
  AppState.dragId = null;
  AppState.PP = 4;
  AppState.searchBoxes = {};
  AppState._init = true;
}

// ── 搜索匹配函数 ──

function searchCharsFn(c, q) {
  var t = (c.name + ' ' + (c.alias || '') + ' ' + (c.description || '') + ' ' + (c.age || '') + ' ' + (c.gender || '')).toLowerCase();
  if (c.custom_fields) c.custom_fields.forEach(function (f) { t += ' ' + (f.name || '') + ' ' + (f.value || ''); });
  return t.includes(q);
}

function searchWorldFn(w, q) {
  var item = w.item || w;
  var t = ((item.category || '') + ' ' + item.title + ' ' + (item.content || '')).toLowerCase();
  if (item.fields) item.fields.forEach(function (f) { t += ' ' + (f.name || '') + ' ' + (f.value || ''); });
  return t.includes(q);
}

function searchPlotFn(n, q) {
  var t = (n.title + ' ' + (n.time_in_story || '') + ' ' + (n.summary || '') + ' ' + (n.location || '')).toLowerCase();
  if (n.custom_fields) n.custom_fields.forEach(function (f) { t += ' ' + (f.name || '') + ' ' + (f.value || ''); });
  if (n.characters) n.characters.forEach(function (c) { t += ' ' + (c.name || ''); });
  return t.includes(q);
}

// ── 搜索框创建（缓存复用）──

function getSearchBox(tab, placeholder, allItems, searchFn, renderFn) {
  if (!AppState.searchBoxes[tab]) {
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:0.3rem;margin-bottom:0.5rem;';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'form-control form-control-sm';
    inp.placeholder = placeholder;
    inp.style.cssText = 'max-width:220px;font-size:0.75rem;';
    inp.addEventListener('compositionstart', function () { this._composing = true; });
    inp.addEventListener('compositionend', function () {
      this._composing = false;
      AppState.currentSpread = 0;
      var self = this;
      var val = self.value.trim().toLowerCase();
      renderFn(val);
      self.focus();
      self.setSelectionRange(self.value.length, self.value.length);
    });
    inp.addEventListener('input', function () {
      if (this._composing) return;
      AppState.currentSpread = 0;
      var self = this;
      var val = self.value.trim().toLowerCase();
      renderFn(val);
      self.focus();
      self.setSelectionRange(self.value.length, self.value.length);
    });
    bar.appendChild(inp);
    AppState.searchBoxes[tab] = { bar: bar, inp: inp };
  }
  return AppState.searchBoxes[tab].bar;
}
