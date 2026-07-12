window.canvasState = { scale: 1, ox: 40, oy: 40, collapsed: {} };

window.renderPlotCanvas = function(currentBook, addUrl, pendingHL, esc, getSearchBox, searchPlotFn, searchQ) {
  var allNodes = (currentBook.plot_nodes || []).slice().sort(function(a,b){ return a.order - b.order; });
  var q = (searchQ || '').toLowerCase();
  if (q) allNodes = allNodes.filter(function(n){ return searchPlotFn(n, q); });
  var roots = allNodes.filter(function(n){ return !n.parent_id; });
  var childMap = {};
  allNodes.forEach(function(n){ if (n.parent_id) { if (!childMap[n.parent_id]) childMap[n.parent_id] = []; childMap[n.parent_id].push(n); } });

  var pgL = document.getElementById('book-page-left');
  var pgR = document.getElementById('book-page-right');
  pgL.style.flex = '0'; pgL.style.width = '0'; pgL.style.padding = '0'; pgL.style.overflow = 'hidden';
  pgR.style.flex = '0'; pgR.style.width = '0'; pgR.style.padding = '0'; pgR.style.overflow = 'hidden';
  document.getElementById('page-left-content').innerHTML = '';
  document.getElementById('page-right-content').innerHTML = '';
  var crease = document.querySelector('.open-book-crease'); if (crease) crease.style.display = 'none';
  var tabs = document.getElementById('page-tabs'); if (tabs) tabs.style.zIndex = '20';
  var old = document.getElementById('plot-canvas-wrap'); if (old) old.remove();

  var wrap = document.createElement('div'); wrap.className = 'plot-canvas-wrap'; wrap.id = 'plot-canvas-wrap';
  var inner = document.createElement('div'); inner.className = 'plot-canvas-inner'; inner.id = 'plot-canvas-inner';
  var svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('class','plot-svg'); svg.id = 'plot-svg';
  inner.appendChild(svg);

  var toolbar = document.createElement('div'); toolbar.className = 'plot-canvas-toolbar';
  var ts = document.createElement('span'); ts.className = 'book-page-title'; ts.textContent = '时间线';
  toolbar.appendChild(ts);
  if (getSearchBox && searchPlotFn) {
    var plotSearch = getSearchBox('plot', '搜索情节...', currentBook.plot_nodes || [], searchPlotFn, function(sq) {
      window.canvasState.searchQ = sq;
      window.renderPlotCanvas(currentBook, addUrl, 0, esc, getSearchBox, searchPlotFn, sq);
    });
    toolbar.appendChild(plotSearch);
  }
  var al = document.createElement('a'); al.className = 'book-page-add'; al.href = addUrl; al.textContent = '+ 添加';
  toolbar.appendChild(al);
  wrap.appendChild(toolbar);

  var ctrls = document.createElement('div'); ctrls.className = 'plot-zoom-controls';
  ctrls.innerHTML = '<button class="plot-zoom-btn" id="btn-zoomin">+</button><button class="plot-zoom-btn" id="btn-zoomout">-</button><button class="plot-zoom-btn" id="btn-zoomfit">fit</button>';
  wrap.appendChild(inner); wrap.appendChild(ctrls);
  document.getElementById('open-book').appendChild(wrap);

  if (allNodes.length === 0) {
    inner.innerHTML = '<div style="padding:4rem 2rem;text-align:center;color:#999;">暂无节点<br><a href="'+addUrl+'" style="font-size:0.85rem;">添加</a></div>';
    window.addPagination(1); return;
  }

  var GAP_X = 210;
  var positions = [60];
  roots.forEach(function(root, i){
    var cc = (childMap[root.id] || []).length;
    var needW = Math.max(180, cc * 170) + 50;
    if (i > 0) positions[i] = positions[i-1] + needW;
    root._x = positions[i] + 20; root._y = 60;
    var children = childMap[root.id] || [];
    var startX = root._x - (children.length * 170) / 2 + 80;
    children.forEach(function(child, ci){
      child._x = startX + ci * 170;
      child._y = root._y + 130;
    });
  });
  var lastRoot = roots[roots.length-1];
  var scrollW = Math.max(1200, (lastRoot ? lastRoot._x : 0) + 400);
  var maxRows = 1;
  roots.forEach(function(r){ var c = childMap[r.id]; if (c && c.length+1 > maxRows) maxRows = c.length+1; });
  var scrollH = Math.max(900, maxRows * 150 + 200);
  inner.style.width = scrollW + 'px'; inner.style.height = scrollH + 'px';

  var indicator = document.createElement('div');
  indicator.style.cssText = 'position:absolute;width:3px;background:#333;z-index:20;pointer-events:none;display:none;border-radius:2px;';
  inner.appendChild(indicator);

  var allFlat = [].concat(roots);
  roots.forEach(function(r){ if (childMap[r.id]) allFlat = allFlat.concat(childMap[r.id]); });
  var dragRootId = null;

  allFlat.forEach(function(node){
    var x = node._x, y = node._y;
    var hasChildren = childMap[node.id] && childMap[node.id].length > 0;
    var isCollapsed = window.canvasState.collapsed[node.id];
    var isChild = !!node.parent_id;
    var div = document.createElement('div');
    div.className = 'plot-node-card' + (isChild ? ' child-node' : ' root-node');
    div.setAttribute('data-node-id', node.id);
    div.style.left = x + 'px'; div.style.top = y + 'px';
    div.draggable = true;
    var timeLabel = node.time_in_story ? esc(node.time_in_story) : '';
    var chars = ''; if (node.characters && node.characters.length) chars = '<div class="pn-chars">' + node.characters.map(function(c){ return '<span class="pn-badge">'+esc(c.name)+'</span>'; }).join('') + '</div>';
    var flags = ''; if (node.custom_fields) { var ff = node.custom_fields.filter(function(f){ return f.is_flagged; }); if (ff.length) flags = ff.map(function(f){ return '<span class="pn-badge" style="background:#fff3cd;">'+esc(f.name)+'</span>'; }).join(''); }
    div.innerHTML = '<div class="pn-title"><a href="/plots/node/'+node.id+'">'+esc(node.title)+'</a></div>' + (timeLabel ? '<div class="pn-meta">'+timeLabel+'</div>' : '') + (node.summary ? '<div style="font-size:0.68rem;color:#666;margin-top:0.15rem;line-height:1.4;">'+esc(node.summary).substring(0,45)+(node.summary.length>45?'...':'')+'</div>' : '') + chars + flags;
    if (hasChildren && isCollapsed) div.innerHTML += '<div class="pn-children-indicator">+'+childMap[node.id].length+' 子节点</div>';

    div.addEventListener('click', function(e){
      if (hasChildren) { e.stopPropagation(); window.canvasState.collapsed[node.id] = !window.canvasState.collapsed[node.id]; window.renderPlotCanvas(currentBook, addUrl, 0, esc, getSearchBox, searchPlotFn, window.canvasState.searchQ); }
    });
    div.addEventListener('dblclick', function(e){
      e.stopPropagation();
      if (isChild) {
        var nd = allNodes.find(function(n){ return n.id === node.id; });
        if (nd) { nd.parent_id = null; }
        window.renderPlotCanvas(currentBook, addUrl, 0, esc, getSearchBox, searchPlotFn, window.canvasState.searchQ);
        fetch('/plots/node/'+node.id+'/unparent', { method: 'POST' });
      } else if (!hasChildren) {
        window.location.href = '/plots/node/'+node.id;
      }
    });
    div.addEventListener('dragstart', function(e){
      e.dataTransfer.setData('text/plain', node.id); div.classList.add('dragging');
      if (!isChild) { dragRootId = node.id; }
    });
    div.addEventListener('dragend', function(e){
      div.classList.remove('dragging'); indicator.style.display = 'none';
      if (!isChild && dragRootId === node.id) {
        var wr = wrap.getBoundingClientRect();
        var cx = e.clientX - wr.left - window.canvasState.ox;
        var newRoots = roots.filter(function(r){ return r.id !== node.id; });
        var newIdx = 0, inserted = false;
        for (var ri = 0; ri < newRoots.length; ri++) { if (cx < newRoots[ri]._x + 90) { newIdx = ri; inserted = true; break; } }
        if (!inserted) newIdx = newRoots.length;
        var oldIdx = roots.findIndex(function(r){ return r.id === node.id; });
        if (oldIdx >= 0 && newIdx !== oldIdx) {
          var moved = roots.splice(oldIdx, 1)[0];
          roots.splice(newIdx, 0, moved);
          roots.forEach(function(r, i){ r.order = (i+1)*10; });
          var curTime = node.time_in_story || '';
          var newTime = prompt('修改故事时间？（留空不变）', curTime);
          if (newTime !== null && newTime !== curTime) { node.time_in_story = newTime;
            var fd3 = new FormData(); fd3.append('field','time_in_story'); fd3.append('value',newTime);
            fetch('/plots/node/'+node.id+'/update-field',{method:'POST',body:fd3}); }
          window.renderPlotCanvas(currentBook, addUrl, 0, esc, getSearchBox, searchPlotFn, window.canvasState.searchQ);
          roots.forEach(function(r, i){ var fd2 = new FormData(); fd2.append('order',r.order); fetch('/plots/node/'+r.id+'/reorder',{method:'POST',body:fd2}); });
        }
        dragRootId = null;
      }
    });
    div.addEventListener('dragover', function(e){
      if (dragRootId && dragRootId !== node.id && !isChild) {
        e.preventDefault();
        var wr = wrap.getBoundingClientRect();
        indicator.style.left = (node._x - 5) + 'px'; indicator.style.top = (node._y - 10) + 'px';
        indicator.style.height = '90px'; indicator.style.display = 'block';
      }
    });
    div.addEventListener('drop', function(e){
      e.preventDefault(); e.stopPropagation(); div.classList.remove('drag-over');
      var childId = parseInt(e.dataTransfer.getData('text/plain'));
      if (childId === node.id) return;
      var childNode = allNodes.find(function(n){ return n.id === childId; });
      if (childNode) { childNode.parent_id = node.id; }
      window.renderPlotCanvas(currentBook, addUrl, 0, esc, getSearchBox, searchPlotFn, window.canvasState.searchQ);
      var fd = new FormData(); fd.append('parent_id', node.id);
      fetch('/plots/node/'+childId+'/reparent',{method:'POST',body:fd});
    });
    inner.appendChild(div);

    if (isChild && !isCollapsed) {
      var parent = allNodes.find(function(p){ return p.id === node.parent_id; });
      if (parent && parent._x !== undefined) {
        var px = parent._x + 70, py = parent._y + 70, cx = x + 70, cy = y;
        var p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d','M'+px+','+py+' C'+px+','+(py+30)+' '+cx+','+(cy-30)+' '+cx+','+cy);
        p.setAttribute('stroke','#bbb'); p.setAttribute('stroke-width','1.5'); p.setAttribute('fill','none');
        svg.appendChild(p);
      }
    }
  });

  for (var ri = 0; ri < roots.length - 1; ri++) {
    var a = roots[ri], b = roots[ri+1];
    var ax = a._x + 90, ay = a._y + 40, bx = b._x, by = b._y + 40, mx = (ax+bx)/2;
    var p2 = document.createElementNS('http://www.w3.org/2000/svg','path');
    p2.setAttribute('d','M'+ax+','+ay+' C'+mx+','+ay+' '+mx+','+by+' '+bx+','+by);
    p2.setAttribute('stroke','#999'); p2.setAttribute('stroke-width','2'); p2.setAttribute('fill','none');
    p2.setAttribute('stroke-dasharray','1200'); p2.setAttribute('stroke-dashoffset','1200');
    p2.style.animation = 'branchDraw 0.6s '+(0.1+ri*0.12)+'s ease-out forwards';
    svg.appendChild(p2);
  }
  svg.style.width = scrollW + 'px'; svg.style.height = scrollH + 'px';
  applyTransform();

  wrap.addEventListener('wheel', function(e){ e.preventDefault(); window.canvasState.scale = Math.max(0.3, Math.min(2, window.canvasState.scale - e.deltaY*0.001)); applyTransform(); });
  var dragging = false, sx = 0, sy = 0;
  wrap.addEventListener('mousedown', function(e){ if (e.target === wrap || e.target === inner || e.target === svg) { dragging = true; sx = e.clientX - window.canvasState.ox; sy = e.clientY - window.canvasState.oy; } });
  window.addEventListener('mousemove', function(e){ if (dragging) { window.canvasState.ox = e.clientX - sx; window.canvasState.oy = e.clientY - sy; applyTransform(); } });
  window.addEventListener('mouseup', function(){ dragging = false; });

  wrap.addEventListener('dragover', function(e){ if (!dragRootId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  wrap.addEventListener('drop', function(e){
    if (!dragRootId && (e.target === wrap || e.target === inner || e.target === svg)) {
      e.preventDefault(); var childId = parseInt(e.dataTransfer.getData('text/plain'));
      if (childId) { var nd = allNodes.find(function(n){ return n.id === childId; }); if (nd && nd.parent_id) { nd.parent_id = null; } }
      window.renderPlotCanvas(currentBook, addUrl, 0, esc, getSearchBox, searchPlotFn, window.canvasState.searchQ);
      fetch('/plots/node/'+childId+'/unparent',{method:'POST'});
    }
  });

  document.getElementById('btn-zoomin').addEventListener('click', function(){ window.canvasState.scale = Math.min(2, window.canvasState.scale+0.15); applyTransform(); });
  document.getElementById('btn-zoomout').addEventListener('click', function(){ window.canvasState.scale = Math.max(0.3, window.canvasState.scale-0.15); applyTransform(); });
  document.getElementById('btn-zoomfit').addEventListener('click', function(){ window.canvasState.scale = 1; window.canvasState.ox = 40; window.canvasState.oy = 40; applyTransform(); });

  window.addPagination(1);
  if (pendingHL) { setTimeout(function(){ var el = inner.querySelector('[data-node-id="'+pendingHL+'"]'); if (el) el.classList.add('highlight-flash'); }, 300); }
};

function applyTransform() {
  var inner = document.getElementById('plot-canvas-inner');
  if (inner) inner.style.transform = 'translate('+window.canvasState.ox+'px,'+window.canvasState.oy+'px) scale('+window.canvasState.scale+')';
}
