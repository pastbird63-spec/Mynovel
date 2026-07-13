// ═══════════════════════════════════════════════════════════════════════
// 关系图初始化（vis-network）
// ═══════════════════════════════════════════════════════════════════════
function initGraph(nodes, edges) {
  const container = document.getElementById('relationship-graph');
  if (!container) return;

  const data = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges)
  };

  const options = {
    nodes: {
      shape: 'ellipse',
      color: {
        background: '#ffffff',
        border: '#555555',
        highlight: { background: '#f0f0f0', border: '#2a2a2a' },
        hover: { background: '#f5f5f5', border: '#555555' }
      },
      font: { face: 'Noto Sans SC, sans-serif', size: 14, color: '#1a1a1a' },
      borderWidth: 1.5,
      margin: 10,
    },
    edges: {
      color: { color: '#cccccc', highlight: '#555555', hover: '#888888' },
      font: { face: 'Noto Sans SC, sans-serif', size: 12, color: '#555555', align: 'middle' },
      smooth: { type: 'curvedCW', roundness: 0.2 },
      width: 1.5,
    },
    physics: {
      stabilization: { iterations: 100 },
      barnesHut: { gravitationalConstant: -3000, springLength: 160 }
    },
    interaction: { hover: true, tooltipDelay: 100 }
  };

  const network = new vis.Network(container, data, options);

  network.on('click', function (params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = data.nodes.get(nodeId);
      if (node && node.url) {
        window.location.href = node.url;
      }
    }
  });

  network.on('hoverNode', function () {
    container.style.cursor = 'pointer';
  });
  network.on('blurNode', function () {
    container.style.cursor = 'default';
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 动态添加自定义词条（人物 / 情节共用）
// ═══════════════════════════════════════════════════════════════════════
let fieldCount = 0;
function addField(containerId, showFlag) {
  containerId = containerId || 'fields-container';
  const hint = document.getElementById('no-fields-hint');
  if (hint) hint.style.display = 'none';
  fieldCount++;
  const container = document.getElementById(containerId);
  const div = document.createElement('div');
  div.className = 'field-row mb-3 p-3 border rounded';
  div.style.background = '#fafaf8';
  div.id = `field-${fieldCount}`;

  let flagHtml = '';
  if (showFlag) {
    flagHtml = `
      <div class="row mt-2" id="flag-section-${fieldCount}" style="display:none !important">
        <div class="col-md-4">
          <div class="form-check">
            <input class="form-check-input" type="checkbox"
                   name="field_flagged" value="${fieldCount - 1}"
                   id="flag-check-${fieldCount}"
                   onchange="toggleFlagNote(${fieldCount})">
            <label class="form-check-label flag-label" for="flag-check-${fieldCount}">
              🔖 标记为伏笔
            </label>
          </div>
        </div>
        <div class="col-md-8" id="flag-note-${fieldCount}" style="display:none">
          <input type="text" name="field_note" class="form-control form-control-sm"
                 placeholder="提醒备注，如：第五章需回收此伏笔">
        </div>
      </div>`;
  }

  div.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-md-3">
        <input type="text" name="field_name" class="form-control"
               placeholder="词条名" ${showFlag ? 'onchange="showFlagSection(' + fieldCount + ')"' : ''}>
      </div>
      <div class="col-md-8">
        <input type="text" name="field_value" class="form-control" placeholder="内容">
      </div>
      <div class="col-md-1">
        <button type="button" class="btn btn-outline-danger btn-sm w-100"
                onclick="this.closest('.field-row').remove()">×</button>
      </div>
    </div>
    ${flagHtml}
  `;
  container.appendChild(div);
}

function showFlagSection(id) {
  const section = document.getElementById(`flag-section-${id}`);
  if (section) section.style.removeProperty('display');
}

function toggleFlagNote(id) {
  const checkbox = document.getElementById(`flag-check-${id}`);
  const note = document.getElementById(`flag-note-${id}`);
  if (note) note.style.display = checkbox.checked ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════════════════
// Ctrl+S 全局快捷键：在任何有表单的页面均可快速保存
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    // 编辑器页面：阻止浏览器"另存为"，由编辑器自己的处理器保存
    if (document.getElementById('paper-textarea')) {
      e.preventDefault();
      return;
    }

    // 普通表单页：触发 submit 按钮
    var submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      e.preventDefault();
      submitBtn.click();
    }
  }
});
