/* ==========================================================================
   拾光 · DAWN v2 — 原型交互脚本
   纯前端静态演示：不请求任何接口，全部数据来自页面内嵌快照。
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ 基础工具 ------------------------------ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const icon = (n, cls) => '<svg class="i ' + (cls || '') + '"><use href="#i-' + n + '"/></svg>';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rd = (id) => { try { return JSON.parse($('#' + id).textContent); } catch (e) { return null; } };
  const NOTES = rd('data-notes') || [];
  const TAGS = rd('data-tags') || [];
  const TREE = rd('data-tree') || [];
  const GRAPH = rd('data-graph') || { nodes: [], edges: [] };
  const NOTE_DATA = rd('data-note') || { slug: '', title: '', tags: [], aliases: [], backlinks: [] };
  const BACKLINKS = NOTE_DATA.backlinks || [];

  /* ------------------------------ 领域映射 ------------------------------ */
  const DOMAIN_DEFS = [
    ['前端', '前端', 'dom-frontend'],
    ['后端', '后端', 'dom-backend'],
    ['数据库', '数据库', 'dom-database'],
    ['运维', '运维', 'dom-devops'],
    ['计算机基础', '计算机基础', 'dom-cs'],
    ['软件工程', '软件工程', 'dom-se'],
    ['跨学科纵深', '跨学科', 'dom-cross'],
    ['02_Reading', '阅读摘录', 'dom-misc']
  ];
  const MISC = { key: '其他', label: '其他', cls: 'dom-misc' };

  function domainOf(slug) {
    const parts = String(slug || '').split('/');
    // 知识笔记的领域取 03_Knowledge 之后那一段；非知识类（02_Reading / 速记 / skills 等）
    // 取 vault 根之后的段，这样"阅读摘录"才不会被一律归到"其他"。
    const candidates = [];
    const i = parts.indexOf('03_Knowledge');
    if (i >= 0 && parts.length > i + 1) candidates.push(parts[i + 1]);
    const j = parts.indexOf('KnowledgeBase');
    if (j >= 0 && parts.length > j + 1) candidates.push(parts[j + 1]);
    for (const seg of candidates) {
      const f = DOMAIN_DEFS.find((d) => d[0] === seg);
      if (f) return { key: f[0], label: f[1], cls: f[2] };
    }
    return MISC;
  }
  function parentPath(slug) {
    const p = String(slug || '').split('/');
    p.pop();
    return p.join(' / ');
  }

  /* ------------------------------ 数据派生 ------------------------------ */
  const NOTES_ENRICHED = NOTES.map((n) => Object.assign({}, n, { domain: domainOf(n.slug) }));

  /*
    成熟度不是"写作进度"（那是 status/* 标签），而是「读者可依赖度」，
    按模板契约完成度自动判定（详见设计方案文档第 10 章）：
      幼苗   = 骨架未成形（缺区块 / 无关联上下文 / 正文 < 400 字）
      成长   = 结构已成，但关联未填满或缺跨学科溯源
      常青   = 五块齐全 + 关联≥4维无空缺 + 有溯源 + 内容充实 + 被引用 ≥2
      索引   = MOC 索引页，不参与成熟度评价（按收录完整度单独评价）
  */
  const MATURITY = {
    SEEDLING: { label: '幼苗', cls: 'badge-seedling', desc: '碎片阶段：骨架未成形（缺契约区块或无关联上下文）' },
    GROWING: { label: '成长', cls: 'badge-growing', desc: '结构已成、可读，但关联上下文未填满或缺跨学科溯源' },
    EVERGREEN: { label: '常青', cls: 'badge-evergreen', desc: '可依赖：结构自洽 + 关联≥4维无空缺 + 有溯源 + 被引用≥2' },
    INDEXED: { label: '索引', cls: 'badge-indexed', desc: 'MOC 索引页：不参与成熟度评价，按收录条数单独评价' },
    EXCLUDED: { label: '非笔记', cls: 'badge-indexed', desc: '模板 / 工具文件，不参与成熟度评价' }
  };
  const maturityOf = (m) => MATURITY[m] || MATURITY.SEEDLING;
  const maturityBadge = (m) => {
    const d = maturityOf(m);
    return '<span class="badge ' + d.cls + '" title="' + esc(d.desc) + '"><span class="dot"></span>' + d.label + '</span>';
  };
  const domainChip = (d) => '<span class="domain-chip ' + d.cls + '"><i></i>' + esc(d.label) + '</span>';

  const fmtDate = (s) => {
    const d = new Date(s);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };
  const fmtDateShort = (s) => {
    const d = new Date(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };
  const relTime = (s) => {
    const diff = (Date.now() - new Date(s).getTime()) / 86400000;
    if (diff < 1) return '今天';
    if (diff < 2) return '昨天';
    if (diff < 30) return Math.floor(diff) + ' 天前';
    if (diff < 365) return Math.floor(diff / 30) + ' 个月前';
    return Math.floor(diff / 365) + ' 年前';
  };

  /* 标签：按「命名空间前缀」分组（status / type / 前端 / 后端 …） */
  const GROUP_TITLES = {
    status: '状态', type: '类型', 前端: '前端', 后端: '后端', 数据库: '数据库',
    运维: '运维', 计算机基础: '计算机基础', Java: 'Java', 未分组: '其他'
  };
  const GROUP_ORDER = ['status', 'type', '前端', '后端', '计算机基础', '数据库', '运维', 'Java', '未分组'];

  function tagGroups() {
    const map = new Map();
    TAGS.forEach((t) => {
      const i = t.name.indexOf('/');
      const g = i > 0 ? t.name.slice(0, i) : '未分组';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push({ leaf: i > 0 ? t.name.slice(i + 1) : t.name, full: t.name, count: t.count });
    });
    return Array.from(map.entries())
      .map(([g, list]) => ({
        key: g,
        title: GROUP_TITLES[g] || g,
        list: list.sort((a, b) => b.count - a.count),
        total: list.reduce((a, b) => a + b.count, 0)
      }))
      .sort((a, b) => {
        const ia = GROUP_ORDER.indexOf(a.key); const ib = GROUP_ORDER.indexOf(b.key);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
  }
  const TAG_GROUPS = tagGroups();

  /* 领域分布（取自全量图谱的真实统计） */
  const DOMAIN_COUNTS = (function () {
    const c = {};
    GRAPH.nodes.forEach((n) => { const d = domainOf(n.slug); c[d.key] = (c[d.key] || 0) + 1; });
    return c;
  })();

  const TOTALS = { notes: 287, tags: 55, links: 278 };

  /* ------------------------------ 状态 ------------------------------ */
  const state = {
    screen: 'home',
    theme: 'dark',
    sidebarOpen: true,
    sidebarPanel: 'tree',
    query: '',
    tag: '',
    domain: '',
    maturity: '',
    page: 1,
    pageSize: 12,
    density: 'comfort',
    sort: 'updated',
    editor: false,
    expanded: {},
    paletteIndex: 0,
    paletteItems: [],
    emptyMode: false,
    role: 'root',
    renaming: null,          // { path, type } —— 树内联重命名
    renameErr: ''
  };

  const app = $('#app');
  const frame = $('#frame');
  const notePage = $('#notePage');

  /* ------------------------------ 主题 ------------------------------ */
  function setTheme(t, animate) {
    state.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    const ico = t === 'dark' ? 'sun' : 'moon';
    $$('#themeBtn .i, #railTheme .i, #umTheme .i').forEach((el) => el.setAttribute('href', '#i-' + ico));
    if (animate) {
      document.documentElement.classList.add('theme-switching');
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-switching')));
    }
  }

  /* ------------------------------ 提示 ------------------------------ */
  function toast(text, kind) {
    const k = kind || 'ok';
    const ic = k === 'ok' ? 'ok' : k === 'warn' ? 'alert' : 'alert';
    const el = document.createElement('div');
    el.className = 'toast ' + k;
    el.innerHTML = icon(ic) + '<span>' + esc(text) + '</span>';
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = 'all .2s'; }, 2400);
    setTimeout(() => el.remove(), 2700);
  }

  /* ------------------------------ 屏幕切换 ------------------------------ */
  const CRUMBS = {
    home: '首页',
    notes: '全部笔记',
    note: '笔记',
    graph: '知识图谱',
    keys: '我的密钥',
    admin: '访问控制',
    login: '访问验证'
  };
  function setScreen(name, opts) {
    state.screen = name;
    app.setAttribute('data-screen', name);
    $$('.preview-bar [data-screen-jump]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.screenJump === name)));
    $$('.rail-btn[data-goto]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.goto === name)));
    renderCrumbs();
    if (name !== 'note') { state.editor = false; $('#noteEditor').classList.add('hide'); $('#noteView').classList.remove('hide'); }
    if (name === 'admin') renderAdmin();
    if (name === 'keys') renderMyKeys();
    if (name === 'graph') requestAnimationFrame(fitGraph);
    if (!opts || !opts.keepScroll) { const p = $('.screen-' + name + ' .page'); if (p) p.scrollTop = 0; }
    closeDrawer();
  }
  function renderCrumbs() {
    const c = $('#crumbs');
    const root = '<a class="crumb-link crumb-root" data-goto="home">拾光</a>';
    const bits = [];
    if (state.screen === 'home') {
      bits.push('<b>拾光</b>');
      bits.push('<span class="sep">/</span><span>数字花园</span>');
    } else if (state.screen === 'notes') {
      bits.push(root);
      bits.push('<span class="sep">/</span><b>全部笔记</b>');
    } else if (state.screen === 'note') {
      bits.push(root);
      bits.push('<span class="sep">/</span><a class="crumb-link" data-goto="notes">全部笔记</a>');
      bits.push('<span class="sep">/</span><b class="truncate" style="max-width:280px">' + esc(NOTE.title) + '</b>');
    } else if (state.screen === 'graph') {
      bits.push(root);
      bits.push('<span class="sep">/</span><b>知识图谱</b>');
    } else if (state.screen === 'admin') {
      bits.push(root);
      bits.push('<span class="sep">/</span><b>管理后台</b>');
    } else {
      bits.push('<b>拾光</b>');
    }
    c.innerHTML = bits.join('');
  }

  /* ------------------------------ 侧栏：结构 / 领域 / 标签 ------------------------------ */
  function renderTreePanel() {
    const q = ($('#treeFilter').value || '').trim().toLowerCase();
    const box = $('#panelTree');
    // 别在渲染过程中被 blur 回调打断（见 bindRenameInput 的注释）

    // 唯一的根目录（本项目里是 KnowledgeBase）没有导航价值，直接提升其子目录为根，
    // 让每一层都少一级缩进、sidebar 里能完整显示中文目录名。
    const tree = treeRoots();

    function match(node) {
      if (!q) return true;
      if (node.type === 'file') return node.name.toLowerCase().includes(q);
      return true;
    }
    function walk(nodes, path, depth) {
      let html = '';
      nodes.forEach((n) => {
        if (n.type === 'dir') {
          const childHtml = walk(n.children || [], path + '/' + n.name, depth + 1);
          if (q && !n.name.toLowerCase().includes(q) && !childHtml) return;
          const key = path + '/' + n.name;
          // 折叠状态完全跟随用户点击：只有"从未被点过"的目录才按默认值（一级目录默认展开）。
          // 之前写成 `depth < 0 || expanded[key]`，导致一级目录永远无法收起。
          const open = state.expanded[key] === undefined ? depth < 1 : state.expanded[key];
          const ren = isRenaming(key);
          html += '<li><div class="tree-dir' + (open ? ' is-open' : '') + '" data-dir="' + esc(key) + '"'
            + ' data-path="' + esc(key) + '" data-type="dir"'
            + ' role="button" tabindex="0" aria-expanded="' + open + '"'
            + ' style="padding-left:' + (8 + depth * 12) + 'px">'
            + '<span class="tw">' + icon('chev-r') + '</span>'
            + '<span class="fw">' + icon('folder', 'fi') + '</span>'
            + (ren ? renameInput(n.name) : '<span class="nm truncate">' + esc(n.name) + '</span>')
            + '<span class="ct mono">' + (n.count != null ? n.count : '') + '</span>'
            + '</div>'
            + (open ? '<ul class="tree-kids">' + childHtml + '</ul>' : '')
            + '</li>';
        } else {
          if (!match(n)) return;
          const fpath = path + '/' + n.name;
          const fren = isRenaming(fpath);
          html += '<li><a class="tree-file" href="#" data-slug="' + esc(n.slug) + '"'
            + ' data-path="' + esc(fpath) + '" data-type="file"'
            + ' style="padding-left:' + (8 + depth * 12 + 16) + 'px">'
            + icon('file', 'fi')
            + (fren ? renameInput(n.name) : '<span class="nm truncate">' + esc(n.name) + '</span>')
            + '</a></li>';
        }
      });
      return html;
    }
    const html = walk(tree, '', 0);
    treeRendering = true;
    box.innerHTML = html ? '<ul class="tree">' + html + '</ul>' : '<div class="empty" style="padding:32px 8px">' + icon('search') + '<p>没有匹配的目录或笔记</p></div>';
    if (state.renameErr) {
      box.innerHTML += '<div class="tree-err">' + icon('alert') + '<span>' + esc(state.renameErr) + '</span></div>';
    }
    treeRendering = false;
    bindRenameInput(box);

    const toggleDir = (el) => {
      const k = el.dataset.dir;
      const now = el.classList.contains('is-open');
      state.expanded[k] = !now;
      renderTreePanel();
    };
    $$('.tree-dir', box).forEach((el) => {
      el.addEventListener('click', () => { if (el.querySelector('.tree-rename')) return; toggleDir(el); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDir(el); }
      });
    });
    $$('.tree-file', box).forEach((el) => el.addEventListener('click', (e) => {
      e.preventDefault();
      if (el.querySelector('.tree-rename')) return;      // 正在重命名，别打开笔记
      openNote(el.dataset.slug);
    }));
  }

  function renderDomainPanel() {
    const entries = Object.entries(DOMAIN_COUNTS).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, b) => a + b[1], 0);
    let html = '<div class="facet-list">';
    html += facetRow('', '全部领域', 'layers', total, '');
    entries.forEach(([key, count]) => {
      const d = DOMAIN_DEFS.find((x) => x[0] === key);
      const def = d ? { key: d[0], label: d[1], cls: d[2] } : MISC;
      html += facetRow(key, def.label, 'grid', count, def.cls, total);
    });
    html += '</div>';
    const box = $('#panelDomain');
    box.innerHTML = html;
    $$('.facet', box).forEach((el) => el.addEventListener('click', () => {
      state.domain = el.dataset.key;
      state.page = 1;
      renderDomainPanel();
      renderNotes();
      if (state.screen !== 'notes') setScreen('notes');
    }));
  }
  function facetRow(key, label, ic, count, cls, total) {
    const pct = total ? Math.round((count / total) * 100) : 100;
    return '<button class="facet' + (state.domain === key ? ' is-on' : '') + '" data-key="' + esc(key) + '">'
      + '<span class="fc-ic ' + (cls || '') + '"><i></i></span>'
      + '<span class="fc-nm">' + esc(label) + '</span>'
      + '<span class="fc-bar"><i style="width:' + pct + '%"></i></span>'
      + '<span class="fc-ct mono">' + count + '</span>'
      + '</button>';
  }

  function renderTagPanel() {
    let html = '';
    TAG_GROUPS.forEach((g) => {
      html += '<div class="tag-group">'
        + '<div class="tg-head"><span>' + esc(g.title) + '</span><span class="mono">' + g.total + '</span></div>'
        + '<div class="tag-cloud">'
        + g.list.map((t) => '<button class="chip" data-tag="' + esc(t.full) + '" aria-pressed="' + (state.tag === t.full) + '">'
          + esc(t.leaf) + '<span class="n">' + t.count + '</span></button>').join('')
        + '</div></div>';
    });
    const box = $('#panelTag');
    box.innerHTML = html || '<div class="empty" style="padding:32px 8px"><p>暂无标签</p></div>';
    $$('.chip', box).forEach((el) => el.addEventListener('click', () => {
      state.tag = state.tag === el.dataset.tag ? '' : el.dataset.tag;
      state.page = 1;
      renderTagPanel();
      renderNotes();
      renderHomeTags();
      if (state.screen !== 'notes') setScreen('notes');
    }));
  }

  function setSidePanel(name) {
    state.sidebarPanel = name;
    $$('#sidePanelSeg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === name)));
    $$('.side-panel').forEach((p) => p.classList.toggle('hide', p.dataset.panel !== name));
    syncSideActions();
  }

  /* ------------------------------ 笔记列表 ------------------------------ */
  function filteredNotes() {
    let list = NOTES_ENRICHED.slice();
    const q = state.emptyMode ? 'zzzzzz' : state.query.trim().toLowerCase();
    if (q) list = list.filter((n) => (n.title + ' ' + (n.summary || '') + ' ' + n.slug).toLowerCase().includes(q));
    if (state.tag) list = list.filter((n) => n.tags.includes(state.tag));
    if (state.domain) list = list.filter((n) => n.domain.key === state.domain);
    if (state.maturity) list = list.filter((n) => n.maturity === state.maturity);
    if (state.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    else if (state.sort === 'read') list.sort((a, b) => (b.readingTime || 0) - (a.readingTime || 0));
    else list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return list;
  }

  function noteRow(n, compact) {
    const hasSummary = n.summary && n.summary.trim();
    return '<a class="note-row ' + n.domain.cls + '" href="#" data-slug="' + esc(n.slug) + '">'
      + '<div class="top">'
      + maturityBadge(n.maturity)
      + domainChip(n.domain)
      + (n.readingTime ? '<span class="meta">' + icon('clock') + n.readingTime + ' min</span>' : '')
      + '<span class="meta" style="margin-left:auto">' + icon('calendar') + fmtDateShort(n.updatedAt) + '</span>'
      + '</div>'
      + '<span class="title">' + esc(n.title) + '</span>'
      + '<span class="path">' + icon('tree') + '<span class="truncate">' + esc(parentPath(n.slug)) + '</span></span>'
      + (compact || !hasSummary ? '' : '<div class="summary clamp-2">' + esc(n.summary) + '</div>')
      + '<div class="foot">'
      + n.tags.slice(0, 3).map((t) => '<span class="tag">#' + esc(t) + '</span>').join('')
      + (n.tags.length > 3 ? '<span class="tag" style="color:var(--ink-4)">+' + (n.tags.length - 3) + '</span>' : '')
      + '</div>'
      + '<span class="go">' + icon('arrow-r') + '</span>'
      + '</a>';
  }

  /* 成熟度筛选条：chip 计数 = 当前「除成熟度之外」的筛选结果（搜索/标签/领域）里的成熟度构成。
     这样计数永远与"点下去会看到什么"一致——无筛选时等于全库分布，选中 type/MOC 时索引档会涨满。
     之前写死全库总数，筛选类型后数字对不上，是评审时抓到的口径断裂。 */
  function renderMaturityBar() {
    const bar = $('#maturityBar');
    if (!bar) return;
    const q = state.emptyMode ? 'zzzzzz' : state.query.trim().toLowerCase();
    const base = NOTES_ENRICHED.filter((n) => {
      if (q && !(n.title + ' ' + (n.summary || '') + ' ' + n.slug).toLowerCase().includes(q)) return false;
      if (state.tag && !n.tags.includes(state.tag)) return false;
      if (state.domain && n.domain.key !== state.domain) return false;
      return true;
    });
    const counts = {};
    base.forEach((n) => { counts[n.maturity] = (counts[n.maturity] || 0) + 1; });
    const items = [['', '全部']].concat(Object.keys(MATURITY).filter((k) => k !== 'EXCLUDED').map((k) => [k, null]));
    bar.innerHTML = items.map(([k, lab]) => {
      const d = k ? maturityOf(k) : null;
      const n = k ? (counts[k] || 0) : base.length;
      const on = (state.maturity || '') === k;
      return '<button class="mat-chip' + (on ? ' is-on' : '') + '" data-mat="' + k + '"'
        + (d ? ' title="' + esc(d.desc) + '"' : '') + '>'
        + (d ? '<span class="dot"></span>' : '') + (lab || d.label) + '<b>' + n + '</b></button>';
    }).join('');
    $$('.mat-chip', bar).forEach((b) => b.addEventListener('click', () => {
      state.maturity = b.dataset.mat || '';
      state.page = 1; state.emptyMode = false;
      renderMaturityBar();
      renderNotes();
    }));
  }

  function renderNotes() {
    renderMaturityBar();
    const list = filteredNotes();
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const slice = list.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    const box = $('#noteList');
    box.className = 'note-list' + (state.density === 'compact' ? ' compact' : '');
    box.innerHTML = slice.length
      ? slice.map((n) => noteRow(n, state.density === 'compact')).join('')
      : '<div class="empty" style="padding:64px 24px">' + '<span class="ico">' + icon('search') + '</span>'
        + '<b>没有找到匹配的笔记</b><p>试着减少筛选条件，或用 ⌘K 直接搜索正文内容。</p>'
        + '<button class="btn btn-ghost btn-sm" id="resetFilters" style="margin-top:8px">清除全部筛选</button></div>';
    $$('.note-row', box).forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); openNote(el.dataset.slug); }));
    const reset = $('#resetFilters');
    if (reset) reset.addEventListener('click', clearFilters);

    // 结果计数
    $('#resultLine').innerHTML = '<span>匹配 <b>' + list.length + '</b> 篇'
      + (list.length !== NOTES.length ? ' · 已筛选' : '') + '</span>'
      + '<span class="dot-sep">·</span><span>快照 <b>' + NOTES.length + '</b> 篇（全量）</span>';

    // 活动筛选条
    const chunks = [];
    if (state.query) chunks.push(chipFilter('搜索：' + state.query, 'query'));
    if (state.tag) chunks.push(chipFilter('#' + state.tag, 'tag'));
    if (state.domain) {
      const d = DOMAIN_DEFS.find((x) => x[0] === state.domain);
      chunks.push(chipFilter('领域：' + (d ? d[1] : '其他'), 'domain'));
    }
    if (state.maturity) chunks.push(chipFilter('成熟度：' + maturityOf(state.maturity).label, 'maturity'));
    $('#activeFilters').innerHTML = chunks.length
      ? '<span class="label">当前筛选</span>' + chunks.join('') + '<button class="btn btn-quiet btn-sm" id="clearAll">全部清除</button>'
      : '';
    $$('#activeFilters .chip .x').forEach((el) => el.addEventListener('click', () => {
      const k = el.parentElement.dataset.clear;
      if (k === 'query') { state.query = ''; $('#qInput').value = ''; $('#qClear').classList.add('hide'); }
      if (k === 'tag') { state.tag = ''; renderTagPanel(); renderHomeTags(); }
      if (k === 'domain') { state.domain = ''; renderDomainPanel(); }
      if (k === 'maturity') { state.maturity = ''; renderMaturityBar(); }
      state.page = 1; state.emptyMode = false;
      renderNotes();
    }));
    const ca = $('#clearAll');
    if (ca) ca.addEventListener('click', clearFilters);

    // 分页
    const pager = $('#pager');
    if (totalPages <= 1) { pager.innerHTML = ''; }
    else {
      const nums = pageWindow(state.page, totalPages);
      pager.innerHTML = '<button data-p="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>上一页</button>'
        + nums.map((p) => p === '…'
          ? '<span class="gap">…</span>'
          : '<button data-p="' + p + '"' + (p === state.page ? ' aria-current="true"' : '') + '>' + p + '</button>').join('')
        + '<button data-p="' + (state.page + 1) + '"' + (state.page >= totalPages ? ' disabled' : '') + '>下一页</button>';
      $$('#pager button').forEach((b) => b.addEventListener('click', () => { state.page = Number(b.dataset.p); renderNotes(); $('.screen-notes .page').scrollTop = 0; }));
    }
  }
  function chipFilter(text, key) {
    return '<span class="chip" aria-pressed="true" data-clear="' + key + '">' + esc(text)
      + '<span class="x" role="button" aria-label="移除">' + icon('x') + '</span></span>';
  }
  function pageWindow(cur, total) {
    const out = [];
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || Math.abs(i - cur) <= 1) out.push(i);
      else if (out[out.length - 1] !== '…') out.push('…');
    }
    return out;
  }
  function clearFilters() {
    state.query = ''; state.tag = ''; state.domain = ''; state.maturity = ''; state.page = 1; state.emptyMode = false;
    $('#qInput').value = ''; $('#qClear').classList.add('hide');
    renderDomainPanel(); renderTagPanel(); renderHomeTags(); renderMaturityBar(); renderNotes();
  }

  /* ------------------------------ 首页 ------------------------------ */
  function renderHome() {
    const stats = [
      { k: '笔记总数', v: TOTALS.notes, s: '篇', i: 'file' },
      { k: '标签', v: TOTALS.tags, s: '个', i: 'tag' },
      { k: '双向链接', v: TOTALS.links, s: '条', i: 'link' },
      { k: '知识领域', v: Object.keys(DOMAIN_COUNTS).length, s: '个', i: 'layers' }
    ];
    $('#homeStats').innerHTML = stats.map((s) =>
      '<div class="stat"><span class="k">' + icon(s.i) + s.k + '</span>'
      + '<span class="v">' + s.v + '<small>' + s.s + '</small></span></div>').join('');

    const recent = NOTES_ENRICHED.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);
    $('#homeRecent').innerHTML = recent.map((n) => noteRow(n)).join('');
    $$('#homeRecent .note-row').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); openNote(el.dataset.slug); }));
    renderHomeTags();
  }
  function renderHomeTags() {
    const top = TAGS.slice().sort((a, b) => b.count - a.count).slice(0, 12);
    const box = $('#homeTags');
    if (!box) return;
    box.innerHTML = top.map((t) => {
      const leaf = t.name.includes('/') ? t.name.split('/').slice(1).join('/') : t.name;
      const on = state.tag === t.name;
      return '<button class="chip" data-tag="' + esc(t.name) + '" aria-pressed="' + on + '" title="' + esc(t.name) + '">' + esc(leaf) + '<span class="n">' + t.count + '</span></button>';
    }).join('');
    $$('.chip', box).forEach((el) => el.addEventListener('click', () => {
      state.tag = state.tag === el.dataset.tag ? '' : el.dataset.tag;
      state.page = 1;
      renderTagPanel(); renderHomeTags(); renderNotes();
      setScreen('notes');
    }));
  }

  /* ------------------------------ 笔记详情 ------------------------------ */
  const NOTE = {
    title: NOTE_DATA.title,
    slug: NOTE_DATA.slug,
    updatedAt: NOTE_DATA.updatedAt,
    readingTime: NOTE_DATA.readingTime || 5,
    maturity: NOTE_DATA.maturity || 'SEEDLING',
    tags: NOTE_DATA.tags || [],
    aliases: NOTE_DATA.aliases || [],
    isSample: true
  };

  function openNote(slug) {
    const meta = NOTES_ENRICHED.find((n) => n.slug === slug);
    NOTE.isSample = slug === NOTE_DATA.slug;
    NOTE.slug = slug;
    if (NOTE.isSample) {
      NOTE.title = NOTE_DATA.title;
      NOTE.updatedAt = NOTE_DATA.updatedAt;
      NOTE.readingTime = NOTE_DATA.readingTime || 5;
      NOTE.maturity = NOTE_DATA.maturity;
      NOTE.tags = NOTE_DATA.tags;
      NOTE.aliases = NOTE_DATA.aliases;
    } else {
      NOTE.title = meta ? meta.title : slug.split('/').pop();
      NOTE.updatedAt = meta ? meta.updatedAt : NOTE.updatedAt;
      NOTE.readingTime = meta && meta.readingTime ? meta.readingTime : 3;
      NOTE.maturity = meta ? meta.maturity : 'SEEDLING';
      NOTE.tags = meta ? meta.tags : [];
      NOTE.aliases = [];
    }
    renderNote();
    setScreen('note');
  }

  function renderNote() {
    const slugParts = NOTE.slug.split('/');
    const last = slugParts.pop();
    const d = domainOf(NOTE.slug);

    $('#noteCrumbs').innerHTML =
      '<a data-goto="home">Garden Vault</a>'
      + slugParts.map((p) => '<span class="sep">/</span><span>' + esc(p) + '</span>').join('')
      + '<span class="sep">/</span><span class="here">' + esc(last) + '</span>';

    $('#noteBadges').innerHTML = maturityBadge(NOTE.maturity) + domainChip(d)
      + '<span class="badge" style="color:var(--ink-3);background:var(--surface-3)">' + icon('book') + '未发布 / 私有</span>';
    $('#noteTitle').textContent = NOTE.title;
    $('#noteMeta').innerHTML =
      '<span class="m">' + icon('calendar') + '更新于 ' + fmtDate(NOTE.updatedAt) + '</span>'
      + '<span class="m">' + icon('clock') + '约 ' + NOTE.readingTime + ' 分钟读完</span>'
      + '<span class="m">' + icon('link') + BACKLINKS.length + ' 条反向链接</span>'
      + '<span class="m">' + icon('file') + '<span class="mono" style="font-size:12px">content/vault/' + esc(NOTE.slug) + '.md</span></span>';
    $('#noteTags').innerHTML = NOTE.tags.map((t) =>
      '<button class="tag" data-tag="' + esc(t) + '">#' + esc(t) + '</button>').join('')
      + (NOTE.aliases && NOTE.aliases.length ? '<span class="alias-hint">别名：' + NOTE.aliases.map(esc).join(' · ') + '</span>' : '');
    $$('#noteTags .tag').forEach((el) => el.addEventListener('click', () => {
      state.tag = el.dataset.tag; state.page = 1; renderTagPanel(); renderNotes(); setScreen('notes');
    }));

    // 动作按角色收敛：普通用户只能复制与定位，不出现编辑 / 删除
    const menuItems = [
      '<button class="menu-item" role="menuitem" data-act="copy-link">' + icon('link') + '复制笔记链接</button>',
      '<button class="menu-item" role="menuitem" data-act="copy-path">' + icon('file') + '复制文件路径</button>',
      '<button class="menu-item" role="menuitem" data-act="reveal">' + icon('tree') + '在结构树中定位</button>'
    ];
    if (canManage()) {
      menuItems.push('<div class="menu-sep"></div>',
        '<button class="menu-item danger" role="menuitem" data-act="delete">' + icon('trash') + '删除这篇笔记</button>');
    }
    $('#noteActions').innerHTML =
      (canManage() ? '<button class="btn btn-ghost btn-sm" id="btnEdit">' + icon('pencil') + '编辑</button>' : '')
      + '<div class="more-wrap">'
      + '<button class="btn btn-ghost btn-sm icon-only" id="btnMore" title="更多操作"'
      + ' aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">' + icon('dots') + '</button>'
      + '<div class="menu hide" id="moreMenu" role="menu">' + menuItems.join('') + '</div></div>';
    if ($('#btnEdit')) $('#btnEdit').addEventListener('click', startEdit);
    $('#btnMore').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('#moreMenu');
      const willOpen = menu.classList.contains('hide');
      closeAllMenus();
      if (willOpen) {
        menu.classList.remove('hide');
        $('#btnMore').setAttribute('aria-expanded', 'true');
      }
    });
    $$('#moreMenu .menu-item').forEach((el) => el.addEventListener('click', () => {
      const act = el.dataset.act;
      closeAllMenus();
      if (act === 'copy-link') {
        copyText('https://liutianle.cn/notes/' + NOTE.slug.split('/').map(encodeURIComponent).join('/'), '笔记链接已复制');
      } else if (act === 'copy-path') {
        copyText('content/vault/' + NOTE.slug + '.md', '文件路径已复制');
      } else if (act === 'reveal') {
        revealInTree();
      } else if (act === 'delete') {
        $('#delName').textContent = NOTE.title;
        $('#delPath').textContent = NOTE.slug + '.md';
        openModal('modalDelete');
      }
    }));

    const raw = ($('#tplNoteBody').innerHTML || '').trim();
    $('#noteBody').innerHTML = (NOTE.isSample
      ? ''
      : '<div class="article-note">' + icon('info')
        + '<span>原型说明：演示稿仅内置了一篇完整正文（<b>' + esc(NOTE_DATA.title) + '</b>）用于展示排版规范；'
        + '此处标题、标签、路径与日期均取自真实数据。</span></div>') + raw;

    $('#blCount').textContent = BACKLINKS.length + ' 条';
    $('#blGrid').innerHTML = BACKLINKS.map((b) => {
      const bd = domainOf(b.slug);
      return '<a class="bl-card ' + bd.cls + '" href="#" data-slug="' + esc(b.slug) + '">'
        + '<div class="dom">' + domainChip(bd) + '</div>'
        + '<b>' + esc(b.title) + '</b>'
        + '<span class="clamp-2">' + esc(b.summary || parentPath(b.slug)) + '</span></a>';
    }).join('') || '<div class="empty" style="padding:24px 8px">' + icon('link') + '<p>还没有笔记链接到这一篇</p></div>';
    $$('#blGrid .bl-card').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); openNote(el.dataset.slug); }));

    buildToc();
    $('#noteView').classList.remove('hide');
    $('#noteEditor').classList.add('hide');
    $('#readBar').style.width = '0%';
  }

  /* 下拉菜单：关闭所有菜单（点击空白 / ESC / 打开新菜单时调用） */
  function closeAllMenus() {
    $$('.menu').forEach((m) => m.classList.add('hide'));
    $$('[aria-haspopup="menu"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }

  function copyText(text, okMsg) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    toast(okMsg, 'ok');
  }

  /* 在结构树中定位当前笔记：展开全部祖先目录 → 切到「结构」面板 → 高亮并滚动到可见 */
  function revealInTree() {
    const parts = NOTE.slug.split('/');
    // 目录树渲染时会把唯一的根目录（KnowledgeBase）抬升，key 从根之后开始
    const segs = (TREE.length === 1 && TREE[0].type === 'dir') ? parts.slice(1) : parts;
    let path = '';
    for (let i = 0; i < segs.length - 1; i++) { path += '/' + segs[i]; state.expanded[path] = true; }
    setSidePanel('tree');
    renderTreePanel();
    if (frame.classList.contains('is-mobile') || window.innerWidth < 1024) openDrawer();
    const el = $$('#panelTree .tree-file').find((a) => a.dataset.slug === NOTE.slug);
    if (el) {
      el.classList.add('is-current');
      el.scrollIntoView({ block: 'center' });
      toast('已在结构树中定位「' + NOTE.title + '」', 'ok');
    } else {
      toast('该笔记不在结构树的当前层级中', 'warn');
    }
  }

  function buildToc() {
    const body = $('#noteBody');
    const heads = $$('h2, h3', body);
    heads.forEach((h, i) => { h.id = 'h-' + i; });
    const rail = $('#tocRail');
    if (!heads.length) { rail.innerHTML = ''; return; }
    rail.innerHTML =
      '<div class="toc-card">'
      + '<div class="toc-title">本篇目录</div>'
      + '<div class="toc-list">' + heads.map((h) =>
        '<button class="toc-item ' + (h.tagName === 'H3' ? 'lv3' : '') + '" data-t="' + h.id + '">'
        + '<span class="truncate">' + esc(h.textContent.trim()) + '</span></button>').join('') + '</div>'
      + '</div>'
      + '<div class="toc-card toc-progress">'
      + '<svg class="ring" viewBox="0 0 36 36"><circle class="track" cx="18" cy="18" r="15"></circle>'
      + '<circle class="bar" id="ringBar" cx="18" cy="18" r="15" stroke-dasharray="94.2" stroke-dashoffset="94.2"></circle></svg>'
      + '<div class="txt">阅读进度<br><b id="ringPct">0%</b></div>'
      + '</div>'
      + '<div class="toc-card" style="padding:14px 16px">'
      + '<div class="toc-title" style="padding:0 0 8px">属性</div>'
      + '<div class="props">'
      + '<div><span>成熟度</span><b>' + maturityOf(NOTE.maturity).label + '</b></div>'
      + '<div><span>领域</span><b>' + domainChip(domainOf(NOTE.slug)) + '</b></div>'
      + '<div><span>阅读时长</span><b class="mono">' + NOTE.readingTime + ' min</b></div>'
      + '<div><span>反链</span><b class="mono">' + BACKLINKS.length + '</b></div>'
      + '<div><span>最近更新</span><b class="mono">' + relTime(NOTE.updatedAt) + '</b></div>'
      + '</div></div>';

    $$('#tocRail .toc-item').forEach((el) => el.addEventListener('click', () => {
      const t = document.getElementById(el.dataset.t);
      if (t) notePage.scrollTo({ top: t.offsetTop - 90, behavior: 'smooth' });
    }));

    if (window.__tocIO) window.__tocIO.disconnect();
    window.__tocIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          $$('#tocRail .toc-item').forEach((x) => x.classList.toggle('is-active', x.dataset.t === en.target.id));
        }
      });
    }, { root: notePage, rootMargin: '-90px 0px -70% 0px', threshold: 0 });
    heads.forEach((h) => window.__tocIO.observe(h));
  }

  function onNoteScroll() {
    const sh = notePage.scrollHeight - notePage.clientHeight;
    const p = sh > 0 ? Math.min(100, (notePage.scrollTop / sh) * 100) : 0;
    $('#readBar').style.width = p + '%';
    const ring = $('#ringBar');
    if (ring) {
      ring.setAttribute('stroke-dashoffset', String(94.2 * (1 - p / 100)));
      $('#ringPct').textContent = Math.round(p) + '%';
    }
  }

  function startEdit() {
    if (!canManage()) { toast('当前身份为' + role().label + '，没有编辑权限', 'err'); return; }
    state.editor = true;
    $('#noteView').classList.add('hide');
    $('#noteEditor').classList.remove('hide');
    const area = $('#editorArea');
    area.value = '---\ntags: [' + NOTE.tags.join(', ') + ']\nupdated: ' + fmtDate(NOTE.updatedAt) + '\n---\n\n'
      + ($('#noteBody').innerText || '').trim();
    updateEditStat();
    area.focus();
  }
  function updateEditStat() {
    const v = $('#editorArea').value;
    $('#editStat').textContent = v.length + ' 字 · ' + Math.max(1, Math.round(v.length / 400)) + ' 分钟';
  }

  /* ------------------------------ 命令面板 ------------------------------ */
  function paletteData(q) {
    const ql = q.trim().toLowerCase();
    const out = [];
    let notes = NOTES_ENRICHED.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (ql) notes = notes.filter((n) => (n.title + ' ' + (n.summary || '') + ' ' + n.slug).toLowerCase().includes(ql));
    notes.slice(0, ql ? 40 : 5).forEach((n) => out.push({
      kind: 'note', title: n.title, sub: parentPath(n.slug), tag: n.maturity, domain: n.domain,
      action: () => { closePalette(); openNote(n.slug); }
    }));
    if (ql) {
      TAGS.filter((t) => t.name.toLowerCase().includes(ql)).slice(0, 5).forEach((t) => out.push({
        kind: 'tag', title: '#' + t.name, sub: t.count + ' 篇笔记', tag: 'TAG',
        action: () => { closePalette(); state.tag = t.name; state.page = 1; renderTagPanel(); renderNotes(); setScreen('notes'); }
      }));
      if (canManage() && (!ql || '导入笔记批量importupload文件夹'.indexOf(ql) >= 0)) out.push({
        kind: 'action', title: '导入笔记（批量）', sub: '从本地导入单个文件或整个文件夹',
        tag: 'DO', action: () => { closePalette(); openImport(); }
      });
      ['home', 'notes', 'graph', 'keys', 'admin'].filter((s) => s !== 'admin' || canManage()).filter((s) => (CRUMBS[s] + s).toLowerCase().includes(ql)).forEach((s) => out.push({
        kind: 'nav', title: '前往 · ' + CRUMBS[s], sub: '页面导航', tag: 'GO',
        action: () => { closePalette(); setScreen(s); }
      }));
    }
    return out;
  }
  function hl(text, q) {
    const t = esc(text);
    const ql = q.trim();
    if (!ql) return t;
    const i = t.toLowerCase().indexOf(ql.toLowerCase());
    if (i < 0) return t;
    return t.slice(0, i) + '<mark>' + t.slice(i, i + ql.length) + '</mark>' + t.slice(i + ql.length);
  }
  function renderPalette() {
    const q = $('#paletteInput').value;
    const items = paletteData(q);
    state.paletteItems = items;
    if (state.paletteIndex >= items.length) state.paletteIndex = Math.max(0, items.length - 1);
    const list = $('#paletteList');
    if (!items.length) {
      list.innerHTML = '<div class="empty" style="padding:40px 16px">' + '<span class="ico">' + icon('search') + '</span>'
        + '<b>没有找到「' + esc(q) + '」</b><p>试试更短的关键词，或直接搜索正文中的术语。</p></div>';
      $('#paletteCount').textContent = '0 条结果';
      return;
    }
    let html = '';
    let lastKind = '';
    items.forEach((it, i) => {
      if (it.kind !== lastKind) {
        const names = { note: '笔记', tag: '标签', nav: '页面', action: '动作' };
        html += '<div class="palette-group">' + names[it.kind] + '</div>';
        lastKind = it.kind;
      }
      html += '<div class="palette-item' + (i === state.paletteIndex ? ' is-active' : '') + '" data-i="' + i + '">'
        + '<span class="ico">' + icon(it.kind === 'note' ? 'file' : it.kind === 'tag' ? 'hash' : it.kind === 'action' ? 'upload' : 'compass') + '</span>'
        + '<span class="txt"><b>' + hl(it.title, q) + '</b><span class="truncate">' + esc(it.sub) + '</span></span>'
        + (it.kind === 'note' ? maturityBadge(it.tag) : '<span class="hint">' + esc(it.tag || '') + '</span>')
        + '</div>';
    });
    list.innerHTML = html;
    $('#paletteCount').textContent = items.length + ' 条结果';
    $$('.palette-item', list).forEach((el) => {
      el.addEventListener('mouseenter', () => { state.paletteIndex = Number(el.dataset.i); renderPalette(); });
      el.addEventListener('click', () => state.paletteItems[Number(el.dataset.i)].action());
    });
    const active = $('.palette-item.is-active', list);
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() {
    $('#palette').classList.remove('hide');
    $('#scrim').classList.remove('hide');
    const inp = $('#paletteInput');
    inp.value = '';
    state.paletteIndex = 0;
    renderPalette();
    setTimeout(() => inp.focus(), 20);
  }
  function closePalette() {
    $('#palette').classList.add('hide');
    if ($('#modalNew').classList.contains('hide') && $('#modalDelete').classList.contains('hide')) $('#scrim').classList.add('hide');
  }

  /* ------------------------------ 图谱 ------------------------------ */
  const G = {
    nodes: [], edges: [], groupBy: 'domain', sizeMode: 'degree', fixedSize: 14,
    zoom: 1, tx: 0, ty: 0, physics: true, alpha: 1, hover: null, query: '', pinned: {}
  };
  const DOMAIN_COLORS = {
    前端: '#16a34a', 后端: '#4f46e5', 数据库: '#9333ea', 运维: '#d97706',
    计算机基础: '#0891b2', 软件工程: '#e11d48', 跨学科纵深: '#65a30d',
    '02_Reading': '#0e7490', 其他: '#64748b'
  };
  /* 索引 / 非笔记用中性灰：它们不参与成熟度评价，不应挤进「琥珀→蓝→绿」的生长色阶 */
  const MATURITY_COLORS = { SEEDLING: '#d97706', GROWING: '#0284c7', EVERGREEN: '#16a34a',
    INDEXED: '#94a3b8', EXCLUDED: '#cbd5e1' };

  function initGraph() {
    const deg = {};
    GRAPH.edges.forEach((e) => { deg[e.source] = (deg[e.source] || 0) + 1; deg[e.target] = (deg[e.target] || 0) + 1; });
    const W = 1680, H = 1040;
    G.nodes = GRAPH.nodes.map((n, i) => {
      const a = (i / GRAPH.nodes.length) * Math.PI * 2;
      return {
        id: n.id, title: n.title, slug: n.slug, maturity: n.maturity,
        domain: domainOf(n.slug).key, domainLabel: domainOf(n.slug).label, deg: deg[n.id] || 0,
        x: W / 2 + Math.cos(a) * (140 + (i % 7) * 22) + (Math.random() - 0.5) * 60,
        y: H / 2 + Math.sin(a) * (140 + (i % 5) * 24) + (Math.random() - 0.5) * 60,
        vx: 0, vy: 0, r: 4
      };
    });
    const map = {};
    G.nodes.forEach((n) => { map[n.id] = n; });
    G.edges = GRAPH.edges.map((e) => ({ s: map[e.source], t: map[e.target] })).filter((e) => e.s && e.t);
    // 度 → 半径
    const maxDeg = Math.max(1, ...G.nodes.map((n) => n.deg));
    G.nodes.forEach((n) => { n.rBase = 3.4 + Math.sqrt(n.deg / maxDeg) * 9; });

    const conn = G.nodes.filter((n) => n.deg > 0);
    const iso = G.nodes.filter((n) => n.deg === 0);
    layoutForce(conn, W, H);
    // 孤立笔记（本库 9 篇，尚无任何双向链接）：力导向会把它们甩到画布边缘，造成大片空白与堆叠。
    // 改为在外围轨道上等距排布 —— 既保留存在感，又形成一组可被发现的「待连接笔记」。
    const R = 660;
    iso.forEach((n, i) => {
      const a = (i / Math.max(1, iso.length)) * Math.PI * 2 - Math.PI / 2;
      n.x = W / 2 + Math.cos(a) * R;
      n.y = H / 2 + Math.sin(a) * (R * 0.60);
      n.rBase = 4.6;
      n.iso = true;
    });
    G.W = W; G.H = H;
  }

  /**
   * 力导向迭代。
   * ticks —— 迭代次数；传入 fixedAlpha 时每轮都用同一个 alpha（供逐帧动画调用）。
   * 返回本批迭代中的最大位移，用于判断是否已收敛。
   */
  function layoutForce(nodes, W, H, ticks, fixedAlpha) {
    const N = nodes.length;
    const n = ticks || 320;
    const linkDist = {}; // 预取弹簧目标长度，避免每轮重复算
    G.edges.forEach((e, i) => { linkDist[i] = 62 + (e.s.rBase + e.t.rBase) * 1.6; });
    let maxMove = 0;
    for (let k = 0; k < n; k++) {
      const alpha = fixedAlpha != null ? fixedAlpha : Math.pow(1 - k / n, 1.6) * 0.9;
      // 斥力
      for (let i = 0; i < N; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < N; j++) {
          const b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
          if (d2 > 260000) continue;
          const f = (2400 * alpha) / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
      }
      // 弹簧：按端点度数归一化 —— 否则 MOC 这类高度数节点会被几十条边反复拉扯，
      // 即使整体已收敛也会持续抖动（本次修复的"节点持续跳动"根因之一）。
      G.edges.forEach((e, i) => {
        const a = e.s, b = e.t;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const raw = (d - linkDist[i]) * 0.055 * alpha;
        const f = raw / (1 + Math.log2(1 + Math.min(a.deg, b.deg)) * 0.45);
        const ux = dx / d, uy = dy / d;
        a.vx += ux * f; a.vy += uy * f;
        b.vx -= ux * f; b.vy -= uy * f;
      });
      // 向心 + 阻尼 + 限速
      for (let i = 0; i < N; i++) {
        const a = nodes[i];
        a.vx += (W / 2 - a.x) * 0.0022 * alpha;
        a.vy += (H / 2 - a.y) * 0.0026 * alpha;
        a.vx *= 0.80; a.vy *= 0.80;
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > 14) { a.vx = (a.vx / sp) * 14; a.vy = (a.vy / sp) * 14; }
        a.x += a.vx; a.y += a.vy;
        const moved = Math.abs(a.vx) + Math.abs(a.vy);
        if (moved > maxMove) maxMove = moved;
      }
    }
    return maxMove;
  }

  function nodeRadius(n) {
    if (G.sizeMode === 'fixed') return G.fixedSize;
    return n.rBase;
  }
  function nodeColor(n) {
    if (G.groupBy === 'maturity') return MATURITY_COLORS[n.maturity] || MATURITY_COLORS.SEEDLING;
    return DOMAIN_COLORS[n.domain] || DOMAIN_COLORS['其他'];
  }

  function buildGraphDom() {
    const edges = $('#gEdges');
    edges.innerHTML = G.edges.map((e, i) =>
      '<line data-i="' + i + '" x1="' + e.s.x.toFixed(1) + '" y1="' + e.s.y.toFixed(1) + '" x2="' + e.t.x.toFixed(1) + '" y2="' + e.t.y.toFixed(1) + '"/>').join('');
    const nodes = $('#gNodes');
    const labeled = G.nodes.slice().sort((a, b) => b.deg - a.deg).slice(0, 26).map((n) => n.id);
    nodes.innerHTML = G.nodes.map((n) => {
      const r = nodeRadius(n);
      const lab = labeled.indexOf(n.id) >= 0 || n.deg >= 6;
      return '<g class="gnode" data-id="' + n.id + '">'
        + '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + nodeColor(n) + '"'
        + ' fill-opacity="' + (n.iso ? 0.30 : 0.92) + '" stroke="' + nodeColor(n) + '"'
        + (n.iso ? ' stroke-opacity="0.7" stroke-dasharray="3 2.5"' : ' stroke-opacity="0.35"') + '/>'
        + (lab ? '<text class="glabel' + (r < 6 ? ' sm' : '') + '" x="' + (n.x + r + 5).toFixed(1) + '" y="' + (n.y + 4).toFixed(1) + '">' + esc(n.title) + '</text>' : '')
        + '</g>';
    }).join('');
    bindGraphNodes();
  }
  function syncGraphPositions() {
    const lines = $('#gEdges').children;
    for (let i = 0; i < G.edges.length; i++) {
      const e = G.edges[i], el = lines[i];
      el.setAttribute('x1', e.s.x.toFixed(1)); el.setAttribute('y1', e.s.y.toFixed(1));
      el.setAttribute('x2', e.t.x.toFixed(1)); el.setAttribute('y2', e.t.y.toFixed(1));
    }
    $$('#gNodes .gnode').forEach((g) => {
      const n = G.byId[g.dataset.id];
      if (!n) return;
      const r = nodeRadius(n);
      const c = g.firstChild;
      c.setAttribute('cx', n.x.toFixed(1)); c.setAttribute('cy', n.y.toFixed(1)); c.setAttribute('r', r.toFixed(1));
      const t = g.querySelector('text');
      if (t) { t.setAttribute('x', (n.x + r + 5).toFixed(1)); t.setAttribute('y', (n.y + 4).toFixed(1)); }
    });
  }

  function applyTransform() {
    $('#gRoot').setAttribute('transform', 'translate(' + G.tx.toFixed(1) + ',' + G.ty.toFixed(1) + ') scale(' + G.zoom.toFixed(3) + ')');
  }
  function fitGraph() {
    const stage = $('#graphStage');
    if (!stage.clientWidth || !G.W) return;
    const fit = Math.min(stage.clientWidth / G.W, stage.clientHeight / G.H) * 0.94;
    // 窄屏（手机）下整图缩放会小到看不清标签，因此设一个最小可读缩放，让用户平移探索
    const k = stage.clientWidth < 700 ? Math.max(fit, 0.34) : fit;
    G.zoom = k;
    G.tx = (stage.clientWidth - G.W * k) / 2;
    G.ty = (stage.clientHeight - G.H * k) / 2;
    applyTransform();
  }

  function bindGraphNodes() {
    G.byId = {};
    G.nodes.forEach((n) => { G.byId[n.id] = n; });
    const tip = $('#gTip');
    $$('#gNodes .gnode').forEach((g) => {
      g.addEventListener('mouseenter', () => {
        const n = G.byId[g.dataset.id];
        G.hover = n;
        tip.innerHTML = '<b>' + esc(n.title) + '</b><div class="p">' + esc(n.domain) + ' · ' + n.deg + ' 条链接 · ' + maturityOf(n.maturity).label + '</div>';
        tip.classList.remove('hide');
      });
      g.addEventListener('mousemove', (ev) => {
        const r = $('#graphStage').getBoundingClientRect();
        let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
        if (x + 250 > r.width) x = r.width - 256;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
      });
      g.addEventListener('mouseleave', () => { G.hover = null; tip.classList.add('hide'); });
      g.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        const n = G.byId[g.dataset.id];
        if (G.pinned[n.id]) { delete G.pinned[n.id]; n.fixed = false; }
        else { G.pinned[n.id] = true; n.fixed = true; }
        toast(G.pinned[n.id] ? '已固定「' + n.title + '」的位置' : '已解除固定', 'ok');
      });
      g.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        const n = G.byId[g.dataset.id];
        n.fixed = true; G.pinned[n.id] = true;
        let px = ev.clientX, py = ev.clientY;
        const move = (e2) => {
          n.x += (e2.clientX - px) / G.zoom;
          n.y += (e2.clientY - py) / G.zoom;
          px = e2.clientX; py = e2.clientY;
          syncGraphPositions();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          startSim(0.10);   // 拖完后让邻居轻微回弹，随后自行收敛静止
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    });
  }

  function renderLegend() {
    const counts = {};
    const labels = {};
    G.nodes.forEach((n) => {
      const k = G.groupBy === 'maturity' ? maturityOf(n.maturity).label : n.domain;
      labels[k] = labels[k] || (G.groupBy === 'maturity' ? k : (n.domainLabel || n.domain));
      counts[k] = (counts[k] || 0) + 1;
    });
    const colorOf = (k) => {
      if (G.groupBy !== 'maturity') return DOMAIN_COLORS[k] || '#64748b';
      const key = Object.keys(MATURITY).find((x) => MATURITY[x].label === k);
      return key ? (MATURITY_COLORS[key] || '#94a3b8') : '#94a3b8';
    };
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      '<div class="row"><i style="background:' + colorOf(k) + '"></i>' + esc(labels[k] || k) + '<span class="n">' + v + '</span></div>').join('');
    $('#gLegend').innerHTML = '<div class="t">' + (G.groupBy === 'maturity' ? '按成熟度着色' : '按领域着色') + '</div>' + rows
      + '<div class="row" style="color:var(--ink-4)"><i style="background:transparent;border:1px dashed var(--ink-4)"></i>虚线为未连接笔记</div>';
    $('#gStats').innerHTML =
      '<div><b>' + G.nodes.length + '</b>节点</div>'
      + '<div><b>' + G.edges.length + '</b>连接</div>'
      + '<div><b>' + G.nodes.filter((n) => n.deg === 0).length + '</b>孤立</div>';
  }

  function renderGraphSettings() {
    const box = $('#gSettings');
    const groups = G.groupBy === 'maturity'
      ? Object.entries(MATURITY_COLORS).map(([k, v]) => [maturityOf(k).label, v])
      : Object.entries(DOMAIN_COLORS);
    box.innerHTML =
      '<div class="grp"><span class="k">着色方式</span>'
      + '<div class="segmented fluid" id="gsGroupBy"><button data-v="domain" aria-selected="' + (G.groupBy === 'domain') + '">按领域</button>'
      + '<button data-v="maturity" aria-selected="' + (G.groupBy === 'maturity') + '">按成熟度</button></div></div>'
      + '<div class="grp"><span class="k">节点大小</span>'
      + '<div class="segmented fluid" id="gsSize"><button data-v="degree" aria-selected="' + (G.sizeMode === 'degree') + '">按链接数</button>'
      + '<button data-v="fixed" aria-selected="' + (G.sizeMode === 'fixed') + '">固定</button></div></div>'
      + '<div class="grp"><span class="k">固定尺寸</span><div class="range-row">'
      + '<input type="range" min="6" max="30" value="' + G.fixedSize + '" id="gsRange"><output id="gsOut">' + G.fixedSize + '</output></div></div>'
      + '<div class="grp"><span class="k">分组配色</span><div class="swatches">'
      + groups.slice(0, 12).map(([k, v]) => '<label class="sw"><input type="color" value="' + v + '" data-g="' + esc(k) + '" title="' + esc(k) + '">' + esc(k) + '</label>').join('')
      + '</div></div>'
      + '<div class="grp" style="display:flex;gap:8px">'
      + '<button class="btn btn-ghost btn-sm" id="gsReset" style="flex:1">' + icon('refresh') + '重置布局</button>'
      + '<button class="btn btn-ghost btn-sm" id="gsFit" style="flex:1">' + icon('maximize') + '适配视图</button></div>'
      + '<div class="grp" style="font-size:11px;color:var(--ink-3);line-height:1.7">提示：拖拽节点可直接固定位置（双击解除），滚轮缩放、空白处拖拽平移。所有设置保存在本地。</div>';

    $$('#gsGroupBy button').forEach((b) => b.addEventListener('click', () => { G.groupBy = b.dataset.v; refreshGraph(); }));
    $$('#gsSize button').forEach((b) => b.addEventListener('click', () => { G.sizeMode = b.dataset.v; refreshGraph(); }));
    $('#gsRange').addEventListener('input', (e) => { G.fixedSize = Number(e.target.value); $('#gsOut').textContent = G.fixedSize; if (G.sizeMode === 'fixed') { syncGraphPositions(); } });
    $$('#gSettings input[type=color]').forEach((el) => el.addEventListener('input', () => {
      const g = el.dataset.g;
      if (G.groupBy === 'maturity') {
        const key = Object.keys(MATURITY_COLORS).find((k) => maturityOf(k).label === g);
        if (key) MATURITY_COLORS[key] = el.value;
      } else DOMAIN_COLORS[g] = el.value;
      refreshGraph();
    }));
    $('#gsReset').addEventListener('click', () => { reheatGraph(true); startSim(0.9); toast('已重置力导向布局', 'ok'); });
    $('#gsFit').addEventListener('click', fitGraph);
  }
  function refreshGraph() { buildGraphDom(); renderLegend(); renderGraphSettings(); applyGraphQuery(); }

  function reheatGraph(full) {
    const conn = G.nodes.filter((n) => !n.iso);
    if (full) conn.forEach((n, i) => {
      const a = (i / conn.length) * Math.PI * 2;
      n.x = G.W / 2 + Math.cos(a) * 180 + (Math.random() - 0.5) * 40;
      n.y = G.H / 2 + Math.sin(a) * 180 + (Math.random() - 0.5) * 40;
      n.vx = 0; n.vy = 0;
    });
    layoutForce(conn, G.W, G.H, 180);
    syncGraphPositions();
  }

  /**
   * 逐帧力导向模拟：alpha 指数降温，收敛后自动停机。
   *
   * 这里修的是「图谱显示不稳定、几个 MOC 节点持续跳动」：
   * 旧实现用一个**永不停止**的 setTimeout 循环每 90ms 重跑一次模拟，
   * 而且每轮都从 alpha≈0.9 重新开始（`Math.pow(1-k/n,1.6)*0.9`，k 从 0 起），
   * 相当于不断给系统"加热"，节点自然永远在动；MOC 这种高度数节点被几十条边同时拉扯，抖动最明显。
   * 现在改为「点火一次、烧完即停」：alpha 一路衰减到 0.02 以下（或整图位移可忽略）就彻底冻结。
   */
  function startSim(alpha) {
    G.alpha = alpha == null ? 1 : alpha;
    if (G.raf) return;                       // 已在运行，只抬高热度
    const step = () => {
      G.raf = 0;
      if (!G.physics || G.alpha <= 0) return;
      const conn = G.nodes.filter((n) => !n.iso);
      const maxMove = layoutForce(conn, G.W, G.H, 1, G.alpha);
      syncGraphPositions();
      G.alpha *= 0.955;
      if (G.alpha < 0.02 || maxMove < 0.05) { G.alpha = 0; return; }
      G.raf = requestAnimationFrame(step);
    };
    G.raf = requestAnimationFrame(step);
  }

  function stopSim() {
    G.alpha = 0;
    if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; }
  }

  function applyGraphQuery() {
    const q = G.query.trim().toLowerCase();
    let hit = null;
    $$('#gNodes .gnode').forEach((g) => {
      const n = G.byId[g.dataset.id];
      const on = !q || n.title.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q);
      g.style.opacity = on ? '1' : '0.12';
      const c = g.firstChild;
      c.setAttribute('stroke-width', q && on ? '2.5' : '0');
      if (q && on && !hit) hit = n;
    });
    if (q && hit) {
      const stage = $('#graphStage');
      G.tx = stage.clientWidth / 2 - hit.x * G.zoom;
      G.ty = stage.clientHeight / 2 - hit.y * G.zoom;
      applyTransform();
    }
  }

  /* ------------------------------ 角色与权限 ------------------------------ */
  /*
    三级角色（需求边界）：
      · 禁用：普通管理员可禁用普通用户；初始管理员可禁用普通管理员与所有用户；
              初始管理员自身不可被禁用、不可被删除。
      · 查看：初始管理员可查看全部密钥；普通管理员仅可查看自己 + 全部普通用户；
              普通用户仅可查看自己。
      · 创建：初始管理员可为普通管理员与普通用户创建；普通管理员仅可为普通用户创建；
              普通用户不可见管理界面。
    所有判断都写成函数，界面层用它控制可见性与可操作性；
    真实实现里服务端必须做同样的校验（越权请求返回 403），界面隐藏只是第一道门。
  */
  const ROLES = {
    root: {
      label: '初始管理员', avatar: '初', badge: 'badge-root', icon: 'crown',
      desc: '可管理全部密钥与全部身份',
      canManage: true, creates: ['admin', 'user'], seesAll: true
    },
    admin: {
      label: '普通管理员', avatar: '管', badge: 'badge-admin', icon: 'shield',
      desc: '可管理普通用户，看不到初始管理员与其他管理员',
      canManage: true, creates: ['user'], seesAll: false
    },
    user: {
      label: '普通用户', avatar: '用', badge: 'badge-user', icon: 'user',
      desc: '只读访问，管理界面不可见',
      canManage: false, creates: [], seesAll: false
    }
  };

  const KEYS = [
    { id: 1, label: '初始管理员', role: 'root', key: 'grdn_seed_root', active: true, lastUsed: '2026-09-20T07:26:00.000Z', builtin: true, createdBy: null },
    { id: 2, label: '我的笔记本', role: 'admin', key: 'zhangw', active: true, lastUsed: '2026-09-20T07:22:41.000Z', createdBy: 1 },
    { id: 3, label: '读书会管理', role: 'admin', key: 'grdn_A7K2M4P9QX', active: true, lastUsed: '2026-09-14T02:10:00.000Z', createdBy: 1 },
    { id: 4, label: '朋友小明', role: 'user', key: 'grdn_8K2M4P7QX1VZ', active: true, lastUsed: '2026-09-20T06:58:00.000Z', createdBy: 2 },
    { id: 5, label: '读书会成员', role: 'user', key: 'grdn_3H9T5B2LQ8WD', active: true, lastUsed: '2026-09-18T12:40:00.000Z', createdBy: 3 },
    { id: 6, label: '旧手机', role: 'user', key: 'grdn_9F3K7R2MVQ4T', active: false, lastUsed: '2026-06-02T08:15:00.000Z', createdBy: 1 }
  ];
  let keySeq = 100;

  /* 每个身份当前登录所用的密钥（原型里由顶部「身份」开关切换） */
  const SESSION_KEY = { root: 1, admin: 2, user: 4 };

  const role = () => ROLES[state.role];
  const canManage = () => role().canManage;
  const me = () => KEYS.find((k) => k.id === SESSION_KEY[state.role]);

  /* —— 权限判定 —— */
  function visibleKeys() {
    if (state.role === 'root') return KEYS.slice();
    if (state.role === 'admin') return KEYS.filter((k) => k.role === 'user' || k.id === SESSION_KEY.admin);
    return KEYS.filter((k) => k.id === SESSION_KEY[state.role]);
  }
  function canToggleKey(t) {
    if (t.role === 'root') return { ok: false, why: '初始管理员不可被禁用或删除' };
    if (state.role === 'root') return { ok: true };
    if (state.role === 'admin') {
      if (t.id === SESSION_KEY.admin) return { ok: false, why: '不能变更自己的密钥状态' };
      if (t.role === 'admin') return { ok: false, why: '不能变更其他管理员' };
      return { ok: true };
    }
    return { ok: false, why: '普通用户无管理权限' };
  }
  function canDeleteKey(t) {
    if (t.role === 'root') return { ok: false, why: '初始管理员不可被删除' };
    if (t.id === SESSION_KEY[state.role]) return { ok: false, why: '不能删除自己正在使用的密钥' };
    return canToggleKey(t);
  }
  const canCreateRole = (rk) => role().creates.indexOf(rk) >= 0;

  /* —— 小工具 —— */
  const roleBadge = (rk) => '<span class="badge ' + ROLES[rk].badge + '">' + icon(ROLES[rk].icon) + ROLES[rk].label + '</span>';
  const maskKey = (k) => (k.length > 8 ? k.slice(0, 4) + '••••••' + k.slice(-3) : k);
  const byId = (id) => KEYS.find((x) => x.id === id) || null;
  const ownerName = (k) => { const o = k.createdBy ? byId(k.createdBy) : null; return o ? o.label : '内置身份'; };

  /* —— 侧栏：新建文件夹按钮的可见性 —— */
  function syncSideActions() {
    const on = state.sidebarPanel === 'tree' && canManage();
    ['#newFolderBtn', '#importBtn'].forEach((sel) => {
      const b = $(sel);
      if (b) b.classList.toggle('hide', !on);
    });
  }

  /* —— 角色切换 —— */
  function syncRoleUI() {
    const r = role();
    document.documentElement.setAttribute('data-role', state.role);
    $$('.only-manage').forEach((el) => el.classList.toggle('hide', !r.canManage));
    ['#userAvatar', '#umAvatar', '#railUserAvatar'].forEach((sel) => { const el = $(sel); if (el) el.textContent = r.avatar; });
    $('#umName').textContent = r.label;
    $('#umDesc').textContent = r.desc;
    $('#userBtn').setAttribute('title', r.label);
    $('#railUser').setAttribute('title', r.label);
    $$('.preview-bar [data-role-jump]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.roleJump === state.role)));
    syncSideActions();
  }
  function setRole(rk) {
    state.role = rk;
    syncRoleUI();
    renderNote();          // 详情页动作随角色收敛
    if (!$('#modalImport').classList.contains('hide')) closeImport();   // 降权时不留着越权浮层
    if (state.screen === 'keys' || state.screen === 'admin') { renderAdmin(); renderMyKeys(); }
    toast('已切换身份：' + ROLES[rk].label, 'ok');
  }

  /* —— 管理后台 —— */
  function renderAdmin() {
    const allowed = canManage();
    $('#adminBody').classList.toggle('hide', !allowed);
    $('#adminDenied').classList.toggle('hide', allowed);
    $('#deniedRole').textContent = role().label;
    if (!allowed) return;

    const list = visibleKeys();
    const mine = me();
    const opts = role().creates;

    $('#adminRoleChip').innerHTML = roleBadge(state.role);

    const cnt = (fn) => list.filter(fn).length;
    $('#keyOverview').innerHTML = [
      { k: '可见密钥', v: list.length, s: '个', i: 'key' },
      { k: '普通管理员', v: cnt((x) => x.role === 'admin'), s: '个', i: 'shield' },
      { k: '普通用户', v: cnt((x) => x.role === 'user'), s: '个', i: 'user' },
      { k: '已禁用', v: cnt((x) => !x.active), s: '个', i: 'ban' }
    ].map((x) => '<div class="stat"><span class="k">' + icon(x.i) + x.k + '</span>'
      + '<span class="v">' + x.v + '<small>' + x.s + '</small></span></div>').join('');

    /* 生成密钥：可选角色由当前身份决定 */
    $('#roleSeg').innerHTML = opts.length
      ? opts.map((rk, idx) => '<button data-role-opt="' + rk + '" aria-selected="' + (idx === 0) + '">' + ROLES[rk].label + '</button>').join('')
      : '<button disabled aria-selected="true">无创建权限</button>';
    $('#roleSegHint').textContent = state.role === 'root'
      ? '初始管理员可为普通管理员与普通用户创建；初始管理员为内置唯一身份，不可增删'
      : '普通管理员只能为普通用户创建密钥，不能创建管理员';
    $('#genHint').innerHTML = opts.length
      ? '当前身份可为 <b>' + opts.map((rk) => ROLES[rk].label).join(' / ') + '</b> 创建 · 密钥永久有效'
      : '当前身份没有创建权限';
    $('#genKey').disabled = !opts.length;

    /* 可见范围说明：把"看不到什么"讲清楚，而不是静默隐藏 */
    $('#scopeNote').innerHTML = icon(state.role === 'root' ? 'ok' : 'lock')
      + '<span>' + (state.role === 'root'
        ? '你是<b>初始管理员</b>，可查看<b>全部密钥</b>（含普通管理员与普通用户），并可禁用 / 删除普通管理员与普通用户。'
        : '你是<b>普通管理员</b>，只能看到<b>自己</b>与<b>普通用户</b>的密钥；<b>初始管理员</b>和<b>其他普通管理员</b>的密钥不在你的可见范围内（服务端同样会拒绝返回）。')
      + '</span>';

    $('#keyStats').innerHTML = '<div><b>' + list.length + '</b>可见</div><div><b>' + list.filter((k) => k.active).length + '</b>启用中</div>';

    const rows = list.map((k) => {
      const tg = canToggleKey(k);
      const dl = canDeleteKey(k);
      const isMe = mine && k.id === mine.id;
      const stateCell = k.role === 'root'
        ? '<span class="key-protected">' + icon('lock') + '内置身份</span>'
        : '<button class="switch" role="switch" aria-checked="' + k.active + '" data-toggle="' + k.id + '"'
          + ' aria-label="启用状态"' + (tg.ok ? '' : ' disabled') + '></button>';
      const act = (allow, act2, ic, title, danger) =>
        '<button class="icon-btn tiny' + (danger ? ' danger' : '') + '" data-act="' + act2 + '" data-id="' + k.id + '"'
        + ' title="' + title + '"' + (allow.ok ? '' : ' disabled') + '>' + icon(ic) + '</button>';
      return '<tr data-id="' + k.id + '"' + (k.role === 'root' ? ' class="is-protected"' : '') + '>'
        + '<td><span class="cell-owner"><b>' + esc(k.label) + '</b>' + (isMe ? '<span class="me-tag">我</span>' : '') + '</span>'
        + '<span class="act-reason">由 ' + esc(ownerName(k)) + ' 创建</span></td>'
        + '<td><span class="key-cell"><code class="cell-key" data-key="' + esc(k.key) + '">' + esc(maskKey(k.key)) + '</code>'
        + '<button class="icon-btn tiny reveal" title="显示 / 隐藏">' + icon('eye') + '</button>'
        + '<button class="icon-btn tiny copy" title="复制密钥">' + icon('copy') + '</button></span></td>'
        + '<td>' + roleBadge(k.role) + '</td>'
        + '<td>' + stateCell + '</td>'
        + '<td><span style="color:var(--ink-3)">' + (k.lastUsed ? relTime(k.lastUsed) : '从未使用') + '</span></td>'
        + '<td><div class="row-actions' + (tg.ok || dl.ok ? '' : ' is-locked') + '">'
        + act(tg, 'toggle', k.active ? 'ban' : 'check', tg.ok ? (k.active ? '禁用该密钥' : '启用该密钥') : tg.why)
        + act(dl, 'del', 'trash', dl.ok ? '删除该密钥' : dl.why, true)
        + '</div></td></tr>';
    }).join('');

    $('#keyTable').innerHTML = '<thead><tr><th>备注</th><th>密钥</th><th>角色</th><th>状态</th><th>最近使用</th>'
      + '<th style="text-align:right">操作</th></tr></thead><tbody>' + rows + '</tbody>';

    bindKeyTable();
  }

  function bindKeyTable() {
    $$('#keyTable .reveal').forEach((el) => el.addEventListener('click', () => {
      const code = el.parentElement.querySelector('code');
      const full = code.dataset.key;
      const masked = code.textContent.indexOf('••') >= 0;
      code.textContent = masked ? full : maskKey(full);
      el.innerHTML = icon(masked ? 'eye-off' : 'eye');
    }));
    $$('#keyTable .copy').forEach((el) => el.addEventListener('click', () => {
      const full = el.parentElement.querySelector('code').dataset.key;
      if (navigator.clipboard) navigator.clipboard.writeText(full).catch(() => {});
      toast('密钥已复制到剪贴板', 'ok');
    }));
    $$('#keyTable .switch').forEach((el) => el.addEventListener('click', () => toggleKeyById(Number(el.dataset.toggle))));
    $$('#keyTable [data-act]').forEach((el) => el.addEventListener('click', () => {
      const k = byId(Number(el.dataset.id));
      if (!k) return;
      if (el.dataset.act === 'toggle') toggleKeyById(k.id);
      else askDeleteKey(k);
    }));
  }

  function toggleKeyById(id) {
    const k = byId(id);
    if (!k) return;
    const allow = canToggleKey(k);
    if (!allow.ok) { toast('越权操作：' + allow.why, 'err'); return; }
    k.active = !k.active;
    renderAdmin();
    toast((k.active ? '已启用' : '已禁用') + '密钥「' + k.label + '」'
      + (k.active ? '' : '，该用户将立即失去访问权限'), k.active ? 'ok' : 'warn');
  }

  let pendingDelete = null;
  function askDeleteKey(k) {
    const allow = canDeleteKey(k);
    if (!allow.ok) { toast('越权操作：' + allow.why, 'err'); return; }
    pendingDelete = k;
    $('#delKeyName').textContent = k.label;
    $('#delKeyMeta').textContent = ROLES[k.role].label + ' · ' + maskKey(k.key);
    openModal('modalDeleteKey');
  }

  /* —— 我的密钥（所有角色可见） —— */
  const PERMS = {
    root: [
      { ok: true, t: '查看全部密钥', sub: '含普通管理员与普通用户' },
      { ok: true, t: '为普通管理员、普通用户创建密钥' },
      { ok: true, t: '禁用 / 启用普通管理员与普通用户' },
      { ok: true, t: '删除普通管理员与普通用户' },
      { ok: false, t: '初始管理员不可被禁用、不可被删除', sub: '内置唯一身份：界面上显示为受保护行，服务端同样拒绝变更' }
    ],
    admin: [
      { ok: true, t: '查看自己的密钥与全部普通用户的密钥' },
      { ok: true, t: '为普通用户创建密钥' },
      { ok: true, t: '禁用 / 启用普通用户' },
      { ok: true, t: '删除普通用户（二次确认）' },
      { ok: false, t: '看不到初始管理员与其他普通管理员的密钥' },
      { ok: false, t: '不能为管理员创建密钥' },
      { ok: false, t: '不能禁用 / 删除任何管理员，包括自己' }
    ],
    user: [
      { ok: true, t: '查看自己的访问密钥' },
      { ok: true, t: '阅读全部笔记、使用知识图谱与 ⌘K 搜索' },
      { ok: false, t: '不可见访问密钥管理界面', sub: '直接访问该地址会看到无权限页，服务端返回 403' },
      { ok: false, t: '不能新建 / 编辑 / 删除笔记，也不能新建文件夹' }
    ]
  };

  function renderMyKeys() {
    const mine = me();
    const r = role();
    $('#myRoleChip').innerHTML = roleBadge(state.role);
    $('#myIdentityHint').textContent = r.desc;

    const creator = mine && mine.createdBy ? byId(mine.createdBy) : null;
    const keyHtml = mine
      ? '<span class="id-key"><code data-key="' + esc(mine.key) + '" id="myKeyCode">' + esc(maskKey(mine.key)) + '</code>'
        + '<button class="icon-btn tiny" id="myKeyReveal" title="显示 / 隐藏">' + icon('eye') + '</button>'
        + '<button class="icon-btn tiny" id="myKeyCopy" title="复制密钥">' + icon('copy') + '</button></span>'
      : '<span style="color:var(--ink-3)">—</span>';

    $('#myIdentity').innerHTML =
      '<div class="id-row"><span>备注名</span><b>' + esc(mine ? mine.label : '—') + '</b></div>'
      + '<div class="id-row"><span>角色</span><b>' + roleBadge(state.role) + '</b></div>'
      + '<div class="id-row"><span>访问密钥</span><b>' + keyHtml + '</b></div>'
      + '<div class="id-row"><span>状态</span><b>' + (mine && mine.active
        ? '<span class="badge badge-evergreen"><span class="dot"></span>启用中</span>'
        : '<span class="badge" style="color:var(--danger);background:var(--danger-soft)">已禁用</span>') + '</b></div>'
      + '<div class="id-row"><span>最近使用</span><b class="mono">' + (mine && mine.lastUsed ? relTime(mine.lastUsed) : '—') + '</b></div>'
      + '<div class="id-row"><span>创建者</span><b>' + esc(creator ? creator.label + '（' + ROLES[creator.role].label + '）' : '内置身份') + '</b></div>';

    $('#myPerms').innerHTML = '<div class="perm-list">' + PERMS[state.role].map((x) =>
      '<div class="perm-item ' + (x.ok ? 'yes' : 'no') + '"><span class="mk">' + icon(x.ok ? 'check' : 'x') + '</span>'
      + '<span>' + x.t + (x.sub ? '<span class="perm-sub">' + x.sub + '</span>' : '') + '</span></div>').join('') + '</div>';

    const rv = $('#myKeyReveal');
    if (rv) {
      rv.addEventListener('click', () => {
        const code = $('#myKeyCode');
        const masked = code.textContent.indexOf('••') >= 0;
        code.textContent = masked ? mine.key : maskKey(mine.key);
        rv.innerHTML = icon(masked ? 'eye-off' : 'eye');
      });
      $('#myKeyCopy').addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(mine.key).catch(() => {});
        toast('密钥已复制到剪贴板', 'ok');
      });
    }
  }

  /* ------------------------------ 新建文件夹 ------------------------------ */
  /* 目录树渲染时会把唯一根目录（KnowledgeBase）抬升，这里的路径都用"相对根"的形式，
     与侧栏树的 data-dir key 保持一致。 */
  function treeRoots() {
    let t = TREE;
    if (t.length === 1 && t[0].type === 'dir') t = t[0].children || [];
    return t;
  }
  function allDirs() {
    const out = [];
    (function walk(nodes, path) {
      nodes.forEach((n) => {
        if (n.type !== 'dir') return;
        const p = path + '/' + n.name;
        out.push({ path: p, name: n.name });
        walk(n.children || [], p);
      });
    })(treeRoots(), '');
    return out;
  }
  function dirChildren(parentPath) {
    const segs = String(parentPath || '').split('/').filter(Boolean);
    let nodes = treeRoots();
    for (const seg of segs) {
      const n = nodes.find((x) => x.type === 'dir' && x.name === seg);
      if (!n) return null;
      n.children = n.children || [];
      nodes = n.children;
    }
    return nodes;
  }

  function openNewFolder(dir) {
    if (!canManage()) { toast('当前身份为' + role().label + '，不能新建文件夹', 'err'); return; }
    const dirs = allDirs();
    // 首项必须是「vault 根目录」：否则新建一级目录（如 07_Archive）时会被迫塞进第一个已有文件夹里
    $('#newFolderParent').innerHTML = '<option value="">/（vault 根目录）</option>'
      + dirs.map((d) => '<option value="' + esc(d.path) + '">' + esc(d.path) + '</option>').join('');
    const cur = typeof dir === 'string' ? dir
      : (state.screen === 'note' && NOTE.slug) ? NOTE.slug.split('/').slice(0, -1).join('/') : '';
    const hit = $$('#newFolderParent option').find((o) => o.value === cur);
    $('#newFolderParent').value = hit ? cur : '';
    $('#newFolderName').value = '';
    $('#newFolderHint').className = 'hint';
    $('#newFolderHint').textContent = '建议沿用现有命名风格（数字前缀便于排序）。创建后可直接在其中新建笔记。';
    updateFolderPath();
    openModal('modalNewFolder');
    setTimeout(() => $('#newFolderName').focus(), 30);
  }
  function updateFolderPath() {
    const parent = $('#newFolderParent').value || '';
    const name = ($('#newFolderName').value || '').trim();
    $('#newFolderPath').textContent = 'content/vault' + parent + '/' + (name || '…') + '/';
  }
  function createFolder() {
    if (!canManage()) { toast('无权新建文件夹', 'err'); return; }
    const parent = $('#newFolderParent').value || '';
    const name = ($('#newFolderName').value || '').trim();
    const hint = $('#newFolderHint');
    const fail = (msg) => { hint.className = 'hint err-text'; hint.textContent = msg; $('#newFolderName').focus(); };
    if (!name) return fail('请填写文件夹名称');
    if (/[\\/:*?"<>|]/.test(name)) return fail('名称不能包含 \\ / : * ? " < > | 等字符');
    if (name.length > 60) return fail('名称过长（建议 60 字符以内）');
    const siblings = dirChildren(parent);
    if (!siblings) return fail('父目录不存在，请重新选择');
    if (siblings.some((n) => n.name === name)) return fail('该目录下已存在同名文件夹或笔记');
    siblings.push({ name: name, type: 'dir', count: 0, children: [] });
    siblings.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'zh-CN') : (a.type === 'dir' ? -1 : 1)));
    if (parent) state.expanded[parent] = true;
    state.expanded[parent + '/' + name] = true;
    closeModal('modalNewFolder');
    setSidePanel('tree');
    renderTreePanel();
    toast('已创建文件夹 ' + parent + '/' + name, 'ok');
  }

  /* ------------------------------ 批量导入笔记 ------------------------------ */
  /*
    需求给定的两条硬限制：
      · 单个文件不得超过 5 MB
      · 单个文件夹总大小不得超过 100 MB
    约定：1 MB = 1024 × 1024 字节（与系统「文件属性」的显示口径一致）。

    校验分两道，缺一不可：
      ① 选择后立刻在本地预检（读 File.size，不产生任何上传）——用户在动手之前就知道能不能导，
         避免"传了 40 秒才被拒绝"；
      ② 真实实现里服务端必须拿文件的真实字节数再校验一次，并以服务端结论为准
         （前端传的 size 可被伪造，绕过页面直接请求接口就失效了）。
  */
  const IMPORT = {
    maxFile: 5 * 1024 * 1024,
    maxTotal: 100 * 1024 * 1024,
    maxCount: 500,
    accept: ['.md', '.markdown', '.txt']
  };

  function fmtBytes(n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
  }
  // 阈值是人为规定的整数（5 MB / 100 MB），显示时不该出现 "100.0 MB" 这种冗余精度；
  // 而实测体积保留小数，两者用不同的格式化函数。
  function fmtLimit(n) { return (n / 1048576) + ' MB'; }
  const extOf = (n) => { const i = String(n == null ? '' : n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i).toLowerCase(); };
  const stripExt = (n) => String(n == null ? '' : n).replace(/\.[^.]+$/, '');
  const INVALID_NAME = /[\/\\:*?"<>|\x00-\x1f]/;

  const imp = {
    items: [], source: '', parent: '', sub: '',
    keep: true,
    running: false, done: 0, result: null,
    // 导入完成后，"清单"必须停留在导入那一刻的校验结果：
    // 否则文件已落盘，再校验会全部变成"已存在同名笔记"，与上面的结果面板自相矛盾。
    frozenRows: null, frozenStats: null
  };
  const dropFrozen = () => { imp.frozenRows = null; imp.frozenStats = null; };

  /* —— 目录树写入工具（与侧栏树同一套路径口径：唯一根目录被提升） —— */
  function treeRootPrefix() {
    return (TREE.length === 1 && TREE[0].type === 'dir') ? '/' + TREE[0].name : '';
  }
  function sortTreeNodes(nodes) {
    nodes.sort((a, b) => (a.type === b.type
      ? String(a.name).localeCompare(String(b.name), 'zh-CN')
      : (a.type === 'dir' ? -1 : 1)));
  }
  function ensureDir(dirPath) {
    const segs = String(dirPath || '').split('/').filter(Boolean);
    let nodes = treeRoots();
    for (const seg of segs) {
      let d = nodes.find((x) => x.type === 'dir' && x.name === seg);
      if (!d) { d = { name: seg, type: 'dir', count: 0, children: [] }; nodes.push(d); sortTreeNodes(nodes); }
      d.children = d.children || [];
      nodes = d.children;
    }
    return nodes;
  }
  function bumpTreeCount(dirPath, n) {
    const segs = String(dirPath || '').split('/').filter(Boolean);
    let nodes = treeRoots();
    for (const seg of segs) {
      const d = nodes.find((x) => x.type === 'dir' && x.name === seg);
      if (!d) return;
      d.count = (d.count || 0) + n;
      nodes = d.children || [];
    }
  }

  /* —— 目标目录：父目录 + 子文件夹 +（保留结构时）来源子路径 —— */
  function impTargetDir(it) {
    const base = [imp.parent, imp.sub].filter(Boolean).join('/');
    if (imp.source === 'folder' && imp.keep && it && it.relPath) {
      const segs = it.relPath.split('/').slice(0, -1).filter((x) => x && x !== '.');
      if (segs.length) return base + '/' + segs.join('/');
    }
    return base;
  }
  function impTargetPath() {
    return 'content/vault' + treeRootPrefix() + [imp.parent, imp.sub].filter(Boolean).join('/') + '/';
  }

  /* —— 预检：单文件上限 / 文件夹总量上限 / 类型 / 同名冲突 —— */
  function impValidate() {
    const rows = [];
    const seen = {};
    let rawTotal = 0;
    let willTotal = 0;
    let maxSize = 0;

    imp.items.forEach((it) => {
      const dir = impTargetDir(it);
      const base = stripExt(it.name);
      const ext = extOf(it.name);
      const siblings = dirChildren(dir) || [];
      const dupKey = (dir + '/' + base).toLowerCase();
      const exists = siblings.some((n) => n.type === 'file' && n.name === base);
      const row = { it: it, dir: dir, ext: ext, exists: exists, target: base, note: '' };

      rawTotal += it.size;
      if (maxSize < it.size) maxSize = it.size;

      if (!it.name || INVALID_NAME.test(it.name)) {
        row.status = 'bad'; row.reason = 'name'; row.why = '文件名含非法字符';
      } else if (IMPORT.accept.indexOf(ext) < 0) {
        row.status = 'skip'; row.reason = 'type'; row.why = '类型不支持（' + (ext || '无扩展名') + '）';
      } else if (it.size === 0) {
        row.status = 'skip'; row.reason = 'empty'; row.why = '空文件';
      } else if (it.size > IMPORT.maxFile) {
        row.status = 'bad'; row.reason = 'size';
        row.over = it.size - IMPORT.maxFile;
        row.why = '超出 ' + fmtBytes(row.over);
      } else if (exists) {
        // 「文件名不可重复」是硬规则：与目标目录已有文件重名一律阻断，
        // 不再提供"跳过 / 自动重命名 / 覆盖"三选一（那三种都会让规则变得含糊）。
        row.status = 'bad'; row.reason = 'dup';
        row.why = '目标目录已存在同名笔记';
      } else if (seen[dupKey]) {
        row.status = 'bad'; row.reason = 'dup';
        row.why = '本次选择中已有同名文件';
      } else {
        row.status = 'ok';
      }
      if (row.status === 'ok') willTotal += it.size;
      seen[dupKey] = true;
      rows.push(row);
    });

    const overSize = rows.filter((r) => r.reason === 'size');
    const okRows = rows.filter((r) => r.status === 'ok');
    const skipRows = rows.filter((r) => r.status === 'skip');
    const badName = rows.filter((r) => r.reason === 'name');
    const dupRows = rows.filter((r) => r.reason === 'dup');

    const blocks = [];
    if (overSize.length) {
      blocks.push({
        kind: 'file', limit: IMPORT.maxFile,
        title: '单个文件不得超过 ' + fmtLimit(IMPORT.maxFile),
        rows: overSize
      });
    }
    if (willTotal > IMPORT.maxTotal) {
      blocks.push({
        kind: 'total', limit: IMPORT.maxTotal,
        title: '单个文件夹总大小不得超过 ' + fmtLimit(IMPORT.maxTotal),
        rows: [], over: willTotal - IMPORT.maxTotal
      });
    }
    if (dupRows.length) {
      blocks.push({ kind: 'dup', limit: null, title: '同一目录下不允许存在同名笔记', rows: dupRows });
    }
    if (badName.length) {
      blocks.push({ kind: 'name', limit: null, title: '文件名包含非法字符，无法写入 vault', rows: badName });
    }
    if (okRows.length > IMPORT.maxCount) {
      blocks.push({
        kind: 'count', limit: IMPORT.maxCount,
        title: '单次导入文件数不得超过 ' + IMPORT.maxCount + ' 个',
        rows: [], over: okRows.length - IMPORT.maxCount
      });
    }

    return {
      rows: rows, blocks: blocks,
      ok: blocks.length === 0,
      stats: {
        picked: rows.length, willImport: okRows.length, skipped: skipRows.length,
        rawTotal: rawTotal, willTotal: willTotal, maxSize: maxSize
      }
    };
  }

  /* —— 渲染 —— */
  const IMP_STATE = {
    ok: { cls: 'is-ok', ic: 'check', label: '可导入' },
    bad: { cls: 'is-bad', ic: 'alert', label: '超限' },
    skip: { cls: 'is-skip', ic: 'ban', label: '跳过' }
  };

  function renderImport() {
    const frozen = !!(imp.result && imp.frozenRows);
    const v = frozen
      ? { rows: imp.frozenRows, blocks: [], ok: true, stats: imp.frozenStats, frozen: true }
      : impValidate();
    const s = v.stats;
    const blocked = v.blocks.length > 0;

    $('#impSrcChip').innerHTML = s.picked
      ? '<span class="badge badge-admin">' + icon(imp.source === 'folder' ? 'folder' : 'file')
        + (imp.source === 'folder' ? '文件夹导入' : '选择文件') + ' · ' + s.picked + ' 个</span>'
      : '';

    /* 步骤 3 的结论徽章：把"通过 / 已阻止"提到步骤标题上，不滚动也能看到 */
    $('#impCheckChip').innerHTML = !s.picked ? ''
      : blocked
        ? '<span class="badge" style="color:var(--danger);background:var(--danger-soft)">'
          + icon('alert') + '已阻止</span>'
        : '<span class="badge badge-admin">' + icon('check') + '校验通过</span>';

    /* 目标路径预览 */
    $('#impPath').textContent = impTargetPath();

    /* 未选择：保持空态 */
    $('#impEmpty').classList.toggle('hide', s.picked > 0);
    $('#impMeters').classList.toggle('hide', s.picked === 0);
    $('#impListWrap').classList.toggle('hide', s.picked === 0);
    $('#impBlock').classList.toggle('hide', !blocked);

    /* 两条上限计量条 */
    if (s.picked) {
      const fPct = Math.min(100, (s.maxSize / IMPORT.maxFile) * 100);
      const tPct = Math.min(100, (s.willTotal / IMPORT.maxTotal) * 100);
      const fCls = s.maxSize > IMPORT.maxFile ? 'is-over' : (s.maxSize > IMPORT.maxFile * 0.8 ? 'is-warn' : '');
      const tCls = s.willTotal > IMPORT.maxTotal ? 'is-over' : (s.willTotal > IMPORT.maxTotal * 0.8 ? 'is-warn' : '');
      $('#impMeters').innerHTML =
        '<div class="meter ' + fCls + '">'
        + '<div class="meter-h"><b>最大单文件</b><span>上限 ' + fmtLimit(IMPORT.maxFile) + '</span></div>'
        + '<div class="meter-v">' + fmtBytes(s.maxSize) + '<small>/ ' + fmtLimit(IMPORT.maxFile) + '</small></div>'
        + '<div class="meter-bar"><i style="width:' + fPct.toFixed(1) + '%"></i></div></div>'
        + '<div class="meter ' + tCls + '">'
        + '<div class="meter-h"><b>待导入合计</b><span>上限 ' + fmtLimit(IMPORT.maxTotal) + '</span></div>'
        + '<div class="meter-v">' + fmtBytes(s.willTotal) + '<small>/ ' + fmtLimit(IMPORT.maxTotal) + '</small></div>'
        + '<div class="meter-bar"><i style="width:' + tPct.toFixed(1) + '%"></i></div>'
        + '<div class="meter-h" style="margin-top:6px"><span>选中 ' + fmtBytes(s.rawTotal)
        + (s.skipped ? ' · 已跳过 ' + s.skipped + ' 个不计入' : '') + '</span></div></div>';
    }

    /* 阻断横幅：把"挡在哪个阈值、超了多少、怎么解决"写全 */
    if (blocked) {
      $('#impBlock').innerHTML = v.blocks.map((b) => {
        let body = '';
        if (b.kind === 'file') {
          body = '<ul>' + b.rows.map((r) =>
            '<li><span class="nm">' + esc(r.it.relPath || r.it.name) + '</span>'
            + '<span class="bd">' + fmtBytes(r.it.size) + ' · 超出 ' + fmtBytes(r.over) + '</span></li>').join('') + '</ul>';
        } else if (b.kind === 'dup') {
          body = '<ul>' + b.rows.map((r) =>
            '<li><span class="nm">' + esc(r.it.relPath || r.it.name) + '</span>'
            + '<span class="bd">' + esc(r.why) + '</span></li>').join('') + '</ul>';
        } else if (b.kind === 'name') {
          body = '<ul>' + b.rows.map((r) =>
            '<li><span class="nm">' + esc(r.it.name) + '</span><span class="bd">含 \\ / : * ? " &lt; &gt; | 等字符</span></li>').join('') + '</ul>';
        } else if (b.kind === 'total') {
          body = '<ul><li><span class="nm">待导入合计 ' + fmtBytes(s.willTotal) + '</span>'
            + '<span class="bd">超出 ' + fmtBytes(b.over) + '</span></li></ul>';
        } else {
          body = '<ul><li><span class="nm">待导入 ' + s.willImport + ' 个文件</span>'
            + '<span class="bd">超出 ' + b.over + ' 个</span></li></ul>';
        }
        const fix = b.kind === 'file'
          ? '请先拆分或精简这些文件，再重新选择 —— 单个文件的体量由来源决定，无法通过分批绕过。'
          : b.kind === 'total'
            ? '建议按子目录分批导入（每次不超过 ' + fmtLimit(IMPORT.maxTotal) + '），或先移除不需要收录的文件。'
            : b.kind === 'dup'
              ? '在结构树里右键重命名已有笔记（或删掉它），或把这一批导入到另一个子文件夹后重试。'
              : b.kind === 'name'
                ? '请先在本地重命名这些文件（去掉非法字符）后重新选择。'
                : '建议分多次导入。';
        return '<div class="ib-ico">' + icon('alert') + '</div><div class="ib-body">'
          + '<div class="ib-t">已阻止导入：' + b.title + '</div>' + body
          + '<div class="ib-fix">' + icon('info') + '<span>' + fix + '</span></div></div>';
      }).join('');
    }

    /* 文件清单 */
    if (s.picked) {
      $('#impListSum').textContent = '可导入 ' + s.willImport + ' · 跳过 ' + s.skipped
        + ' · 不可导入 ' + v.rows.filter((r) => r.status === 'bad').length;
      $('#impList').innerHTML = v.rows.map((r) => {
        const st = IMP_STATE[r.status];
        // 同为"不可导入"，但原因不同：重名 / 超限 / 非法名要一眼可辨
        const stLabel = r.reason === 'size' ? '超限' : r.reason === 'dup' ? '重名' : r.reason === 'name' ? '非法' : st.label;
        const why = r.note || r.why;
        return '<div class="imp-file ' + st.cls + '">'
          + '<span class="if-ic">' + icon(extOf(r.it.name) === '.txt' ? 'file' : 'file') + '</span>'
          + '<span class="if-nm"><b title="' + esc(r.it.relPath || r.it.name) + '">' + esc(r.it.name) + '</b>'
          + '<span>' + esc(r.dir ? r.dir.replace(/^\//, '') + '/' : '（目标根目录）/')
          + (why ? ' · ' + esc(why) : '') + '</span></span>'
          + '<span class="if-sz">' + fmtBytes(r.it.size) + '</span>'
          + '<span class="if-st">' + icon(st.ic) + stLabel + '</span>'
          + '</div>';
      }).join('');
    } else {
      $('#impListSum').textContent = '';
      $('#impList').innerHTML = '';
    }

    /* 底部状态与主按钮 */
    let foot;
    if (frozen) {
      foot = '本次已导入 ' + imp.result.imported.length + ' 个文件 · 合计 ' + fmtBytes(imp.result.bytes)
        + (imp.result.skipped.length ? '（跳过 ' + imp.result.skipped.length + ' 个）' : '');
    } else if (!s.picked) foot = '请先选择要导入的文件或文件夹';
    else if (blocked) foot = '已阻止导入：' + v.blocks.map((b) => b.title).join('；');
    else foot = '待导入 ' + s.willImport + ' 个文件 · 合计 ' + fmtBytes(s.willTotal)
      + (s.skipped ? '（另有 ' + s.skipped + ' 个将被跳过）' : '');
    $('#impFoot').textContent = foot;

    const btn = $('#importStart');
    const canGo = s.picked > 0 && !blocked && s.willImport > 0 && !imp.running;
    btn.disabled = !canGo;
    btn.classList.toggle('btn-primary', canGo);
    btn.classList.toggle('btn-quiet', !canGo);
    $('#importStartLabel').textContent = imp.running
      ? '导入中…'
      : blocked ? '已达上限，无法导入'
        : s.picked && s.willImport === 0 ? '没有可导入的文件'
          : s.willImport ? '导入 ' + s.willImport + ' 个文件' : '开始导入';

    /* 结果区 */
    const showRes = imp.running || !!imp.result;
    $('#impStepRes').classList.toggle('hide', !showRes);
    if (imp.running) {
      const pct = Math.round((imp.done / Math.max(1, imp.willRun)) * 100);
      $('#impResSub').textContent = '正在写入 vault…';
      $('#impResult').innerHTML =
        '<div class="imp-progress"><div class="pg-h">' + icon('loader')
        + '<span>正在导入 <b>' + imp.done + ' / ' + imp.willRun + '</b></span></div>'
        + '<div class="meter-bar"><i id="impProgBar" style="width:' + pct + '%"></i></div></div>'
        + '<div class="imp-res-note">' + icon('info')
        + '<span>文件逐个写入 <code>' + esc(impTargetPath()) + '</code>，vault watcher 会在写入稳定后自动解析入库。</span></div>';
    } else if (imp.result) {
      const r = imp.result;
      $('#impResSub').textContent = '已写入 ' + r.dir + '，目录树与笔记列表已同步';
      $('#impResult').innerHTML =
        '<div class="imp-res-row">'
        + '<div class="imp-res ok"><span class="k">' + icon('check') + '成功导入</span>'
        + '<div class="v">' + r.imported.length + '<small>篇</small></div></div>'
        + '<div class="imp-res skip"><span class="k">' + icon('ban') + '已跳过</span>'
        + '<div class="v">' + r.skipped.length + '<small>个</small></div></div>'
        + '<div class="imp-res"><span class="k">' + icon('hard-drive') + '写入体积</span>'
        + '<div class="v">' + fmtBytes(r.bytes) + '</div></div>'
        + '<div class="imp-res"><span class="k">' + icon('folder') + '目标目录</span>'
        + '<div class="v" style="font-size:var(--fs-sm);font-weight:600;word-break:break-all">'
        + esc(r.dir.replace(/^\//, '')) + '</div></div></div>'
        + (r.skipped.length
          ? '<div class="imp-res-note">' + icon('ban') + '<span>跳过的 ' + r.skipped.length + ' 个：'
          + r.skipped.slice(0, 4).map((x) => esc(x.it.name) + '（' + esc(x.why) + '）').join('；')
          + (r.skipped.length > 4 ? ' 等' : '') + '</span></div>'
          : '')
        + '<div class="imp-res-note">' + icon('info')
        + '<span>本次限制：单文件 ≤ ' + fmtLimit(IMPORT.maxFile) + ' · 单个文件夹合计 ≤ '
        + fmtLimit(IMPORT.maxTotal) + '。服务端会以真实字节数复核一次，前端校验只是第一道门。</span></div>';
    }
  }

  /* —— 打开 / 重置 —— */
  function openImport(seedKey) {
    if (!canManage()) {
      toast('当前身份为' + role().label + '，没有导入权限', 'err');
      return;
    }
    if (seedKey) {
      seedImportDemo(seedKey);
    } else {
      imp.items = []; imp.source = ''; imp.result = null; imp.done = 0; imp.running = false;
    }
    const dirs = allDirs();
    $('#impParent').innerHTML = '<option value="">/（vault 顶层）</option>'
      + dirs.map((d) => '<option value="' + esc(d.path) + '">' + esc(d.path) + '</option>').join('');
    const cur = (state.screen === 'note' && NOTE.slug) ? NOTE.slug.split('/').slice(0, -1).join('/') : '';
    const hit = $$('#impParent option').find((o) => o.value === cur);
    $('#impParent').value = hit ? cur : '';
    imp.parent = $('#impParent').value;
    $('#impSub').value = '';
    $('#impKeep').checked = true;
    imp.keep = true;
    imp.sub = '';
    renderImport();
    openModal('modalImport');
  }
  function resetImport() {
    imp.items = []; imp.source = ''; imp.result = null; imp.done = 0; imp.running = false;
    $('#fileInput').value = '';
    $('#dirInput').value = '';
    $('#impSub').value = '';
  }
  function closeImport() {
    closeModal('modalImport');
    resetImport();
    renderImport();
  }

  /* —— 收集真实文件（File API 直接给出 size，无需上传即可预检） —— */
  function addFiles(list, source) {
    const arr = Array.from(list || []);
    if (!arr.length) return;
    dropFrozen(); imp.result = null;
    imp.source = source;
    arr.forEach((f) => {
      // webkitRelativePath 形如 "我的笔记/前端/Nuxt.md"（input[webkitdirectory]）；
      // 拖拽目录时由 readEntry 递归填到 f.relPath。二者都用来还原来源目录层级。
      const rel = f.relPath || f.webkitRelativePath || f.name;
      imp.items.push({ name: f.name, relPath: rel, size: f.size, real: true });
    });
    if (imp.items.length > IMPORT.maxCount * 2) imp.items = imp.items.slice(0, IMPORT.maxCount * 2);
    renderImport();
    const v = impValidate();
    if (v.ok) toast('已选择 ' + imp.items.length + ' 个文件，合计 ' + fmtBytes(v.stats.rawTotal) + '，校验通过', 'ok');
    else toast('已选择 ' + imp.items.length + ' 个文件 —— ' + v.blocks[0].title + '，已阻止导入', 'err');
  }

  /* —— 评审用示例：不准备真实文件也能看到三种关键状态 —— */
  const MB = 1048576;
  const DEMO_SETS = {
    ok: {
      source: 'folder', label: '合规集合',
      files: [
        ['Nuxt/框架概述与SSR原理.md', 0.4], ['Nuxt/数据获取与缓存策略.md', 1.2],
        ['Nuxt/路由与中间件.md', 2.8], ['TypeScript/泛型与类型体操.md', 4.6],
        ['Vue3/响应式系统源码笔记.md', 0.9], ['Vue3/组合式API实践.md', 1.6],
        ['读书/《认知觉醒》摘录.md', 0.7], ['读书/《代码整洁之道》摘录.md', 0.4],
        ['说明.txt', 0.2],
        ['插图/架构图.png', 1.1]
      ]
    },
    'over-file': {
      source: 'files', label: '单文件超限',
      files: [
        ['超大型单文件笔记.md', 6.2],
        ['Nuxt/框架概述与SSR原理.md', 0.5],
        ['TypeScript/泛型与类型体操.md', 1.4]
      ]
    },
    'over-folder': {
      source: 'folder', label: '文件夹超限',
      files: (function () {
        const out = [];
        for (let i = 1; i <= 26; i++) out.push(['批量归档/第' + (i < 10 ? '0' : '') + i + '章 - 学习笔记.md', 4.0]);
        return out;
      })()
    }
  };
  function seedImportDemo(key) {
    const set = DEMO_SETS[key];
    if (!set) return;
    dropFrozen();
    imp.source = set.source;
    imp.result = null; imp.done = 0; imp.running = false;
    imp.items = set.files.map((f) => ({ name: f[0].split('/').pop(), relPath: f[0], size: Math.round(f[1] * MB), real: false }));
  }

  /* —— 执行导入 —— */
  function impStart() {
    if (!canManage()) { toast('越权操作：' + role().label + '不能导入笔记', 'err'); return; }
    const v = impValidate();
    if (!v.ok) {
      toast('已阻止导入：' + v.blocks[0].title, 'err');
      return;
    }
    const todo = v.rows.filter((r) => r.status === 'ok');
    if (!todo.length) { toast('没有可导入的文件', 'err'); return; }
    dropFrozen();
    imp.running = true; imp.done = 0; imp.willRun = todo.length; imp.result = null;
    renderImport();
    const tick = () => {
      if (!imp.running) return;
      imp.done++;
      if (imp.done >= imp.willRun) {
        imp.running = false;
        impCommit(v, todo);
        return;
      }
      renderImport();
      setTimeout(tick, 80);
    };
    setTimeout(tick, 220);
  }

  function impCommit(v, todo) {
    const groups = {};
    todo.forEach((r) => { (groups[r.dir] = groups[r.dir] || []).push(r); });
    const imported = [];
    let bytes = 0;
    const now = new Date().toISOString();

    Object.keys(groups).forEach((dir) => {
      const nodes = ensureDir(dir);
      const list = groups[dir];
      list.forEach((r) => {
        // slug 必须与快照口径一致（含 KnowledgeBase 前缀），否则点开新笔记会查不到
        const slug = (treeRootPrefix() + '/' + [dir, r.target].filter(Boolean).join('/'))
          .replace(/\/+/g, '/').replace(/^\//, '');
        const hit = nodes.findIndex((n) => n.name === r.target && n.type === 'file');
        const node = { name: r.target, type: 'file', slug: slug };
        if (hit >= 0) nodes[hit] = node; else nodes.push(node);
        imported.push({ slug: slug, title: r.target, size: r.it.size });
        bytes += r.it.size;
        // 同步进笔记列表，让「全部笔记 / 首页最近更新」立刻可见
        if (!NOTES.some((n) => n.slug === slug)) {
          const rec = {
            slug: slug, title: r.target, maturity: 'SEEDLING',
            readingTime: Math.max(1, Math.round(r.it.size / 4096)),
            updatedAt: now, summary: null, tags: []
          };
          NOTES.unshift(rec);
          NOTES_ENRICHED.unshift(Object.assign({}, rec, { domain: domainOf(slug) }));
        }
      });
      sortTreeNodes(nodes);
      bumpTreeCount(dir, list.length);
      state.expanded[dir] = true;
    });

    const root = Object.keys(groups).sort((a, b) => a.length - b.length)[0] || '';
    TOTALS.notes += imported.length;
    $('#sideCount').textContent = TOTALS.notes;
    const meta = $('#metaNotes');
    if (meta) meta.textContent = TOTALS.notes;

    imp.result = { imported: imported, skipped: v.rows.filter((r) => r.status !== 'ok'), bytes: bytes, dir: root };
    imp.frozenRows = v.rows.slice();
    imp.frozenStats = v.stats;
    renderImport();
    syncSideActions();
    setSidePanel('tree');
    renderTreePanel();
    renderNotes();
    toast('已导入 ' + imported.length + ' 篇笔记到 ' + (root || 'vault 顶层'), 'ok');
  }

  /* ------------------------------ 结构树：右键操作菜单 ------------------------------ */
  /*
    操作 → 权限矩阵（与设计方案一致）
      · 初始管理员 root：重命名 / 在本目录新建文件夹 / 新建文件 / 删除（含非空文件夹）/ 复制 / 粘贴
      · 普通管理员 admin：重命名 / 新建 / 复制 / 粘贴；删除仅限「文件」与「空文件夹」
      · 普通用户 user：只读 —— 菜单只保留「复制笔记链接 / 复制路径」，写操作整组不出现
    另有一条对所有角色生效的**结构保护**：vault 一级目录（00_Inbox / 03_Knowledge …）
    不可重命名、不可删除 —— 它们是知识库的骨架，误删代价远大于收益。
    判定一律写成返回 {ok, why} 的纯函数，why 直接显示在菜单项右侧并进 title。
  */
  const ctx = { path: null, type: null, node: null, blank: false, items: [] };
  let treeRendering = false;     // 防重入：渲染树时不响应 blur 提交
  let clip = null;               // 剪贴板只存在于前端内存，不做任何写盘
  let pendingNode = null;

  const isStructDir = (p) => /^\/[^/]+$/.test(String(p || ''));
  const isRenaming = (path) => !!(state.renaming && state.renaming.path === path);
  const renameInput = (name) => '<input class="tree-rename' + (state.renameErr ? ' is-err' : '')
    + '" value="' + esc(name) + '" aria-label="重命名" spellcheck="false">';

  function slugFor(dirPath, name) {
    return (treeRootPrefix() + dirPath + '/' + name).replace(/\/+/g, '/').replace(/^\//, '');
  }
  function findNode(path) {
    const walk = (nodes, base) => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const p = base + '/' + n.name;
        if (p === path) return { node: n, arr: nodes, idx: i, parent: base };
        if (n.type === 'dir') { const hit = walk(n.children || [], p); if (hit) return hit; }
      }
      return null;
    };
    return walk(treeRoots(), '');
  }
  function countFiles(node) {
    if (!node) return 0;
    if (node.type === 'file') return 1;
    return (node.children || []).reduce((a, c) => a + countFiles(c), 0);
  }
  function recountNodes(nodes) {
    let total = 0;
    nodes.forEach((n) => {
      if (n.type === 'dir') { n.count = recountNodes(n.children || []); total += n.count; }
      else total += 1;
    });
    return total;
  }
  /* 目录计数与笔记总数直接从树结构重算，比"增删时加减"稳得多 */
  function recountTree() {
    const total = recountNodes(treeRoots());
    TOTALS.notes = total;
    $('#sideCount').textContent = total;
    const meta = $('#metaNotes');
    if (meta) meta.textContent = total;
    return total;
  }
  function addNoteRecord(slug) {
    if (NOTES.some((n) => n.slug === slug)) return false;
    const rec = {
      slug: slug, title: String(slug).split('/').pop(), maturity: 'SEEDLING', readingTime: 1,
      updatedAt: new Date().toISOString(), summary: null, tags: []
    };
    NOTES.unshift(rec);
    NOTES_ENRICHED.unshift(Object.assign({}, rec, { domain: domainOf(slug) }));
    return true;
  }
  function dropNoteRecord(slug) {
    [NOTES, NOTES_ENRICHED].forEach((arr) => {
      const i = arr.findIndex((n) => n.slug === slug);
      if (i >= 0) arr.splice(i, 1);
    });
  }
  /* 名称合法性：新建 / 重命名 / 粘贴共用同一条规则（文件名不可重复） */
  function nameProblem(name, parentDir, selfName) {
    if (!name) return '名称不能为空';
    if (INVALID_NAME.test(name)) return '名称不能包含 \\ / : * ? " < > | 等字符';
    if (name.length > 80) return '名称过长（建议 80 字符以内）';
    if (selfName && name === selfName) return '';
    const sibs = dirChildren(parentDir) || [];
    if (sibs.some((n) => n.name === name)) {
      return '「' + name + '」已存在 —— 同一目录下不允许同名（' + (parentDir || 'vault 顶层') + '）';
    }
    return '';
  }

  /* —— 重命名（树内联编辑） —— */
  function startRename(path) {
    const hit = findNode(path);
    if (!hit) return;
    const perm = permRename(path, hit.node.type);
    if (!perm.ok) { toast('越权操作：' + perm.why, 'err'); return; }
    state.renaming = { path: path, type: hit.node.type };
    state.renameErr = '';
    setSidePanel('tree');
    renderTreePanel();
  }
  function cancelRename() {
    state.renaming = null; state.renameErr = '';
    renderTreePanel();
  }
  function commitRename(value) {
    const r = state.renaming;
    if (!r) return;
    const hit = findNode(r.path);
    if (!hit) return cancelRename();
    const name = String(value == null ? '' : value).trim();
    if (name === hit.node.name) return cancelRename();
    const prob = nameProblem(name, hit.parent, hit.node.name);
    if (prob) { state.renameErr = prob; renderTreePanel(); return; }
    hit.node.name = name;
    sortTreeNodes(hit.arr);
    if (hit.node.type === 'dir') {
      // 目录改名了 → 折叠状态的 key 也要跟着搬，否则展开态会丢
      Object.keys(state.expanded).forEach((k) => {
        if (k === r.path || k.indexOf(r.path + '/') === 0) {
          state.expanded[r.path + '/' + name + k.slice(r.path.length)] = state.expanded[k];
          delete state.expanded[k];
        }
      });
    }
    state.renaming = null; state.renameErr = '';
    applySlugMap(reslugAll());
    recountTree();
    renderTreePanel();
    renderNotes();
    toast('已重命名为「' + name + '」', 'ok');
  }
  function bindRenameInput(box) {
    const ri = $('.tree-rename', box);
    if (!ri) return;
    setTimeout(() => { ri.focus(); ri.select(); }, 20);
    ri.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitRename(ri.value); }
      if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
    });
    ri.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    ri.addEventListener('pointerdown', (e) => e.stopPropagation());
    ri.addEventListener('blur', () => {
      if (treeRendering || !state.renaming || !ri.isConnected) return;
      commitRename(ri.value);
    });
  }
  /* 结构变了就按结构重算 slug，比"局部替换字符串"可靠 */
  function reslugAll() {
    const map = {};
    (function rec(nodes, base) {
      nodes.forEach((n) => {
        if (n.type === 'file') {
          const slug = slugFor(base, n.name);
          if (n.slug !== slug) { map[n.slug] = slug; n.slug = slug; }
        } else rec(n.children || [], base + '/' + n.name);
      });
    })(treeRoots(), '');
    return map;
  }
  function applySlugMap(map) {
    Object.keys(map).forEach((from) => {
      const to = map[from];
      [NOTES, NOTES_ENRICHED].forEach((arr) => {
        const hit = arr.find((n) => n.slug === from);
        if (hit) { hit.slug = to; hit.title = String(to).split('/').pop(); }
      });
      if (NOTE.slug === from) { NOTE.slug = to; NOTE.title = String(to).split('/').pop(); }
    });
  }
  function stampSlugs(node, dirPath) {
    if (node.type === 'file') { node.slug = slugFor(dirPath, node.name); return [node.slug]; }
    let out = [];
    (node.children || []).forEach((c) => { out = out.concat(stampSlugs(c, dirPath + '/' + node.name)); });
    return out;
  }

  /* —— 权限判定（纯函数，返回原因） —— */
  function permRename(path, type) {
    if (!canManage()) return { ok: false, why: '只读身份' };
    if (type === 'dir' && isStructDir(path)) return { ok: false, why: '结构目录受保护' };
    return { ok: true };
  }
  function permDelete(path, type) {
    if (!canManage()) return { ok: false, why: '只读身份' };
    if (type === 'dir' && isStructDir(path)) return { ok: false, why: '结构目录受保护' };
    if (type === 'dir') {
      const hit = findNode(path);
      const n = hit ? countFiles(hit.node) : 0;
      if (n > 0 && state.role !== 'root') return { ok: false, why: '需初始管理员' };
    }
    return { ok: true };
  }
  const permCreate = () => (canManage() ? { ok: true } : { ok: false, why: '只读身份' });
  function permPaste(dir) {
    if (!canManage()) return { ok: false, why: '只读身份' };
    if (!clip) return { ok: false, why: '剪贴板为空' };
    if (clip.type === 'dir' && (dir === clip.path || dir.indexOf(clip.path + '/') === 0)) {
      return { ok: false, why: '不能粘到自身' };
    }
    const sibs = dirChildren(dir) || [];
    if (sibs.some((n) => n.name === clip.name)) return { ok: false, why: '同名已存在' };
    return { ok: true };
  }

  /* —— 删除 —— */
  function askDeleteNode(path) {
    const hit = findNode(path);
    if (!hit) return;
    const perm = permDelete(path, hit.node.type);
    if (!perm.ok) { toast('越权操作：' + perm.why, 'err'); return; }
    pendingNode = { path: path, node: hit.node };
    const isDir = hit.node.type === 'dir';
    const n = isDir ? countFiles(hit.node) : 1;
    $('#nodeDelTitle').textContent = '删除「' + hit.node.name + '」？';
    $('#nodeDelName').textContent = hit.node.name + (isDir ? '（文件夹）' : '.md');
    $('#nodeDelPath').textContent = 'content/vault' + treeRootPrefix() + path + (isDir ? '/' : '.md');
    $('#nodeDelSub').textContent = isDir && n
      ? '该文件夹下有 ' + n + ' 篇笔记，将连同文件夹一起删除。'
      : '将从 vault 中移除，并在数据库中同步删除。';
    const warn = $('#nodeDelWarn');
    if (isDir && n) {
      warn.classList.remove('hide');
      $('#nodeDelWarnT').textContent = '将一并删除 ' + n + ' 篇笔记';
      $('#nodeDelWarnS').textContent = '这 ' + n + ' 篇笔记的正文与反向链接会同时消失，且不可恢复，请确认已备份。';
    } else warn.classList.add('hide');
    openModal('modalNodeDel');
  }
  function doDeleteNode() {
    const p = pendingNode;
    pendingNode = null;
    closeModal('modalNodeDel');
    if (!p) return;
    const hit = findNode(p.path);
    if (!hit) return;
    const removed = [];
    (function collect(node, base) {
      if (node.type === 'file') { removed.push(node.slug); return; }
      (node.children || []).forEach((c) => collect(c, base + '/' + node.name));
    })(hit.node, hit.parent);
    hit.arr.splice(hit.idx, 1);
    if (removed.indexOf(NOTE.slug) >= 0) setScreen('notes');   // 删掉的正是当前打开的笔记
    removed.forEach(dropNoteRecord);
    recountTree();
    renderTreePanel();
    renderNotes();
    toast('已删除「' + p.node.name + '」' + (removed.length > 1 ? '，含 ' + removed.length + ' 篇笔记' : ''), 'warn');
  }

  /* —— 复制 / 粘贴 —— */
  function renderClipBar() {
    const b = $('#clipBar');
    if (!clip) { b.classList.add('hide'); b.innerHTML = ''; return; }
    b.classList.remove('hide');
    b.innerHTML = icon('clipboard')
      + '<span>已复制 <b class="nm">' + esc(clip.name) + '</b></span>'
      + '<button class="link-btn" id="clipClear">取消</button>';
    $('#clipClear').addEventListener('click', () => { clip = null; renderClipBar(); });
  }
  function doCopy(path) {
    const hit = findNode(path);
    if (!hit) return;
    // 快照而非引用：复制后源再被改动，也不影响粘出来的内容
    clip = { type: hit.node.type, name: hit.node.name, path: path, snap: JSON.parse(JSON.stringify(hit.node)) };
    renderClipBar();
    toast('已复制「' + hit.node.name + '」—— 右键目标文件夹选「粘贴到此处」', 'ok');
  }
  function doPaste(dirPath) {
    const perm = permPaste(dirPath);
    if (!perm.ok) { toast('越权操作：' + perm.why, 'err'); return; }
    const arr = ensureDir(dirPath);
    const clone = JSON.parse(JSON.stringify(clip.snap));
    arr.push(clone);
    sortTreeNodes(arr);
    const slugs = stampSlugs(clone, dirPath);
    slugs.forEach(addNoteRecord);
    recountTree();
    state.expanded[dirPath] = true;
    renderTreePanel();
    renderNotes();
    renderClipBar();
    const n = countFiles(clone);
    toast('已粘贴「' + clip.name + '」' + (n > 1 ? '（' + n + ' 篇）' : '') + ' 到 ' + (dirPath || 'vault 顶层'), 'ok');
  }

  /* —— 菜单模型与渲染 —— */
  function ctxDirOf() {
    if (ctx.blank || !ctx.path) return '';
    if (ctx.type === 'dir') return ctx.path;
    const seg = String(ctx.path).split('/');
    seg.pop();
    return seg.join('/');
  }
  function ctxModel() {
    const dir = ctxDirOf();
    const RO = { ok: false, why: '只读身份' };
    const items = [];
    const what = ctx.type === 'dir' ? '文件夹' : '笔记';
    // 写操作对只读身份同样渲染，只是置灰并把原因写在右侧 ——
    // 同一菜单里"有的项消失、有的项置灰"会让人以为功能坏了；
    // 全部可见 + 逐项说明原因，权限边界才是自解释的。
    if (!ctx.blank) {
      items.push({ act: 'rename', ic: 'pencil', label: '重命名', kbd: 'F2', perm: permRename(ctx.path, ctx.type) });
      items.push({ sep: true });
    }
    items.push({ act: 'new-folder', ic: 'folder-plus', label: '在本目录下新建文件夹', perm: permCreate() });
    items.push({ act: 'new-file', ic: 'file-plus', label: '在本目录下新建文件', perm: permCreate() });
    items.push({ sep: true });
    items.push({
      act: 'copy', ic: 'copy', label: '复制' + what,
      perm: canManage() ? undefined : RO
    });
    items.push({
      act: 'paste', ic: 'clipboard',
      label: '粘贴到此处' + (canManage() && clip ? '（' + clip.name + '）' : ''),
      perm: canManage() ? permPaste(dir) : RO
    });
    if (!canManage() && !ctx.blank) {
      // 只读身份再给两个真正能用的动作（复制链接 / 路径不会改动任何数据）
      items.push({ sep: true });
      items.push({ act: 'copy-ref', ic: 'link', label: ctx.type === 'dir' ? '复制文件夹路径' : '复制笔记链接' });
      items.push({ act: 'copy-path', ic: 'file', label: '复制文件路径' });
    }
    if (!ctx.blank) {
      items.push({ sep: true });
      items.push({ act: 'del', ic: 'trash', label: '删除', kbd: '⌫', danger: true, perm: permDelete(ctx.path, ctx.type) });
    }
    return items;
  }
  function ctxItemHtml(it) {
    if (it.sep) return '<div class="ctx-sep"></div>';
    const dis = it.perm && !it.perm.ok;
    const right = dis && it.perm.why ? '<span class="why">' + esc(it.perm.why) + '</span>'
      : (it.kbd ? '<span class="kbd">' + it.kbd + '</span>' : '');
    return '<button class="ctx-item' + (it.danger ? ' danger' : '') + '" role="menuitem"'
      + ' data-act="' + it.act + '"' + (dis ? ' disabled' : '')
      + (dis && it.perm.why ? ' title="' + esc(it.perm.why) + '"' : '') + '>'
      + icon(it.ic) + '<span class="lbl">' + esc(it.label) + '</span>' + right + '</button>';
  }
  function openCtx(x, y, target) {
    ctx.blank = !target;
    ctx.path = target ? target.path : null;
    ctx.type = target ? target.type : null;
    ctx.node = target ? target.node : null;
    ctx.items = ctxModel();
    const menu = $('#ctxMenu');
    const head = ctx.blank
      ? icon('folder-open') + '<span class="nm">vault 顶层</span><span>空白处</span>'
      : icon(ctx.type === 'dir' ? 'folder' : 'file') + '<span class="nm">' + esc(ctx.node ? ctx.node.name : '') + '</span>'
        + '<span>' + (ctx.type === 'dir' ? '文件夹' : '笔记') + '</span>';
    const note = canManage()
      ? (clip ? '<div class="ctx-note plain">' + icon('clipboard')
        + '<span>剪贴板：' + esc(clip.name) + '（右键目标文件夹即可粘贴）</span></div>' : '')
      : '<div class="ctx-note">' + icon('lock')
        + '<span>普通用户为只读访问：文件与文件夹的改动需要管理员权限</span></div>';
    menu.innerHTML = '<div class="ctx-head">' + head + '</div>'
      + ctx.items.map(ctxItemHtml).join('') + note;
    menu.classList.remove('hide');
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    $$('.ctx-item', menu).forEach((el) => el.addEventListener('click', () => runCtxAct(el.dataset.act)));
  }
  function closeCtx() { $('#ctxMenu').classList.add('hide'); }
  function runCtxAct(act) {
    const dir = ctxDirOf();
    const path = ctx.path;
    const type = ctx.type;
    closeCtx();
    if (act === 'rename') return startRename(path);
    if (act === 'new-folder') return openNewFolder(dir);
    if (act === 'new-file') return openNewNote(dir);
    if (act === 'copy') return doCopy(path);
    if (act === 'paste') return doPaste(dir);
    if (act === 'del') return askDeleteNode(path);
    if (act === 'copy-path') {
      return copyText('content/vault' + treeRootPrefix() + path + (type === 'dir' ? '/' : '.md'),
        type === 'dir' ? '文件夹路径已复制' : '文件路径已复制');
    }
    if (act === 'copy-ref') {
      if (type === 'dir') return copyText('content/vault' + treeRootPrefix() + path + '/', '文件夹路径已复制');
      const hit = findNode(path);
      return copyText('https://liutianle.cn/notes/' + String(hit ? hit.node.slug : '').split('/').map(encodeURIComponent).join('/'),
        '笔记链接已复制');
    }
  }

  /* ------------------------------ 对话框 / 抽屉 ------------------------------ */
  function openModal(id) {
    $('#' + id).classList.remove('hide');
    $('#scrim').classList.remove('hide');
    const f = $('#' + id + ' input, #' + id + ' select');
    if (f) setTimeout(() => f.focus(), 20);
  }
  function closeModal(id) {
    $('#' + id).classList.add('hide');
    if ($('#palette').classList.contains('hide')) $('#scrim').classList.add('hide');
  }
  function openDrawer() {
    $('#sidebar').classList.add('is-open');
    $('#scrim').classList.remove('hide');
  }
  function closeDrawer() {
    $('#sidebar').classList.remove('is-open');
    if ($('#palette').classList.contains('hide')
      && ['modalNew', 'modalImport', 'modalDelete'].every((id) => $('#' + id).classList.contains('hide'))) {
      $('#scrim').classList.add('hide');
    }
  }

  /* ------------------------------ 事件绑定 ------------------------------ */
  document.addEventListener('click', (e) => {
    // 点击任意空白处收起下拉菜单（菜单自身与触发按钮会 stopPropagation）
    closeAllMenus();
    if (!$('#ctxMenu').contains(e.target)) closeCtx();
    const go = e.target.closest('[data-goto]');
    if (go) {
      e.preventDefault();
      setScreen(go.dataset.goto);
      $('#userMenu').classList.add('hide');
    }
  });

  $('#searchTrigger').addEventListener('click', openPalette);
  $('#heroSearch').addEventListener('click', openPalette);
  $('#drawerBtn').addEventListener('click', openDrawer);
  $('#scrim').addEventListener('click', () => {
    ['modalNew', 'modalNewFolder', 'modalImport', 'modalNodeDel', 'modalDelete', 'modalDeleteKey']
      .forEach((id) => closeModal(id));
    closeCtx();
    closePalette();
    closeDrawer();
  });

  $('#themeBtn').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark', true));
  $('#railTheme').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark', true));
  $('#umTheme').addEventListener('click', () => { setTheme(state.theme === 'dark' ? 'light' : 'dark', true); $('#userMenu').classList.add('hide'); });

  /* 侧栏折叠：入口全部在左侧 —— 展开态用侧栏头部右上角的收起键，
     收起态用图标栏顶部的展开键；原先顶栏右侧那枚按钮已移除（右侧控制左侧太割裂）。 */
  function setSidebarOpen(open) {
    if (frame.classList.contains('is-mobile') || window.innerWidth < 1024) {
      open ? openDrawer() : closeDrawer();
      return;
    }
    state.sidebarOpen = open;
    $('#sidebar').classList.toggle('is-collapsed', !open);
    app.setAttribute('data-sidebar', open ? 'open' : 'collapsed');
    const rb = $('#railExpand');
    rb.setAttribute('aria-expanded', String(open));
    rb.setAttribute('title', (open ? '收起' : '展开') + '侧栏（⌘\\）');
  }
  $('#sidebarCollapse').addEventListener('click', () => setSidebarOpen(false));
  $('#railExpand').addEventListener('click', () => setSidebarOpen(true));
  /* ======================== 结构树：右键菜单与文件操作 ======================== */
  const ctxTargetFrom = (el) => {
    const row = el && el.closest ? el.closest('.tree-dir, .tree-file') : null;
    if (!row) return null;
    const hit = findNode(row.dataset.path);
    return { path: row.dataset.path, type: row.dataset.type, node: hit ? hit.node : null };
  };
  $('#panelTree').addEventListener('contextmenu', (e) => {
    if (state.renaming) return;
    e.preventDefault();
    openCtx(e.clientX, e.clientY, ctxTargetFrom(e.target));
  });
  // 触屏：长按 500ms 等价于右键（桌面 pointerType 为 mouse 时忽略）
  (function () {
    let timer = null;
    const tree = $('#panelTree');
    tree.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || state.renaming) return;
      const target = ctxTargetFrom(e.target);
      const pt = { x: e.clientX, y: e.clientY };
      clearTimeout(timer);
      timer = setTimeout(() => openCtx(pt.x, pt.y, target), 500);
    });
    ['pointerup', 'pointermove', 'pointercancel', 'pointerleave'].forEach((ev) =>
      tree.addEventListener(ev, () => clearTimeout(timer)));
  })();
  // 任意方向滚动都收起菜单（菜单按视口坐标定位，滚动后就不该继续悬着）
  document.addEventListener('scroll', () => { if (!$('#ctxMenu').classList.contains('hide')) closeCtx(); }, true);
  $('#nodeDelCancel').addEventListener('click', () => { pendingNode = null; closeModal('modalNodeDel'); });
  $('#nodeDelConfirm').addEventListener('click', doDeleteNode);

  $('#userBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#userMenu').classList.toggle('hide'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.user-wrap')) $('#userMenu').classList.add('hide'); });

  // 侧栏拖拽
  (function resizer() {
    const rz = $('#resizer'), sb = $('#sidebar');
    let dragging = false;
    rz.addEventListener('pointerdown', (e) => {
      dragging = true; rz.classList.add('is-active');
      document.body.style.cursor = 'col-resize';
      const move = (ev) => {
        if (!dragging) return;
        const w = Math.min(440, Math.max(240, ev.clientX - (sb.getBoundingClientRect().left)));
        sb.style.width = w + 'px'; sb.style.flexBasis = w + 'px';
      };
      const up = () => { dragging = false; rz.classList.remove('is-active'); document.body.style.cursor = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
  })();

  $('#sidePanelSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-panel]');
    if (b) setSidePanel(b.dataset.panel);
  });
  $('#treeFilter').addEventListener('input', () => {
    $('#treeFilterClear').classList.toggle('hide', !$('#treeFilter').value);
    renderTreePanel();
  });
  $('#treeFilterClear').addEventListener('click', () => { $('#treeFilter').value = ''; $('#treeFilterClear').classList.add('hide'); renderTreePanel(); });

  $('#qInput').addEventListener('input', () => {
    $('#qClear').classList.toggle('hide', !$('#qInput').value);
  });
  $('#qInput').addEventListener('keyup', () => {
    state.query = $('#qInput').value; state.page = 1; state.emptyMode = false;
    renderNotes();
  });
  $('#qClear').addEventListener('click', () => {
    $('#qInput').value = ''; $('#qClear').classList.add('hide');
    state.query = ''; state.page = 1; state.emptyMode = false; renderNotes();
  });
  $('#sortSel').addEventListener('change', (e) => { state.sort = e.target.value; renderNotes(); });
  $('#densitySeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-density]');
    if (!b) return;
    state.density = b.dataset.density;
    $$('#densitySeg button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    renderNotes();
  });

  $('#notePage').addEventListener('scroll', onNoteScroll, { passive: true });
  $('#editCancel').addEventListener('click', () => { state.editor = false; $('#noteEditor').classList.add('hide'); $('#noteView').classList.remove('hide'); });
  $('#editorArea').addEventListener('input', updateEditStat);
  $('#editSave').addEventListener('click', () => { toast('已写入 vault，同步完成', 'ok'); state.editor = false; $('#noteEditor').classList.add('hide'); $('#noteView').classList.remove('hide'); });
  $('#editDelete').addEventListener('click', () => {
    $('#delName').textContent = NOTE.title;
    $('#delPath').textContent = NOTE.slug + '.md';
    openModal('modalDelete');
  });
  $('#delCancel').addEventListener('click', () => closeModal('modalDelete'));
  $('#delConfirm').addEventListener('click', () => { closeModal('modalDelete'); toast('笔记已删除，已返回首页', 'warn'); setScreen('home'); });

  // 命令面板
  $('#paletteInput').addEventListener('input', () => { state.paletteIndex = 0; renderPalette(); });
  $('#paletteInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1); renderPalette(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); state.paletteIndex = Math.max(0, state.paletteIndex - 1); renderPalette(); }
    if (e.key === 'Enter') { const it = state.paletteItems[state.paletteIndex]; if (it) it.action(); }
  });

  // 新建笔记（dir 由右键菜单传入时，直接定位到该目录）
  function openNewNote(dir) {
    if (!canManage()) { toast('当前身份为' + role().label + '，不能新建笔记', 'err'); return; }
    const dirs = allDirs();
    // 选项口径必须与侧栏树、右键菜单一致（单根提升后的一级目录）；
    // 原先遍历 TREE 会带出 /KnowledgeBase 前缀，和树里的路径对不上。
    $('#newNoteDir').innerHTML = '<option value="">/（vault 顶层）</option>'
      + dirs.map((d) => '<option value="' + esc(d.path) + '">' + esc(d.path) + '</option>').join('');
    const cur = typeof dir === 'string' ? dir
      : (state.screen === 'note' && NOTE.slug) ? NOTE.slug.split('/').slice(0, -1).join('/') : '';
    const hit = $$('#newNoteDir option').find((o) => o.value === cur);
    $('#newNoteDir').value = hit ? cur : '';
    $('#newNoteName').value = '';
    openModal('modalNew');
  }
  $('#newNoteBtn').addEventListener('click', () => openNewNote());
  /* ============================ 批量导入：事件绑定 ============================ */
  // 顶栏「新建」下拉：把"新建笔记 / 新建文件夹 / 导入"收进同一个动作组
  $('#newBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#newMenu');
    const willOpen = menu.classList.contains('hide');
    closeAllMenus();
    if (willOpen) { menu.classList.remove('hide'); $('#newBtn').setAttribute('aria-expanded', 'true'); }
  });
  $('#newFolderMenuBtn').addEventListener('click', () => { closeAllMenus(); openNewFolder(); });
  $('#importMenuBtn').addEventListener('click', () => { closeAllMenus(); openImport(); });
  $('#importBtn').addEventListener('click', () => openImport());

  // 来源选择
  $('#pickFiles').addEventListener('click', () => $('#fileInput').click());
  $('#pickDir').addEventListener('click', () => $('#dirInput').click());
  dzEventBind();

  function dzEventBind() {
    const dz = $('#dropzone');
    if (!dz) return;
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add('is-over');
    }));
    ['dragleave', 'dragend'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.target === dz || !dz.contains(e.relatedTarget)) dz.classList.remove('is-over');
    }));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.remove('is-over');
      const dt = e.dataTransfer;
      if (!dt) return;
      const entries = Array.from(dt.items || [])
        .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
      if (entries.some((x) => x.isDirectory)) {
        const out = [];
        await Promise.all(entries.map((en) => readEntry(en, '', out)));
        if (!out.length) { toast('拖入的文件夹里没有可识别的文件', 'warn'); return; }
        addFiles(out, 'folder');
      } else if (dt.files && dt.files.length) {
        addFiles(dt.files, 'files');
      }
    });
  }
  // 递归读取拖入的目录（Chromium FileSystemEntry API）
  function readEntry(entry, base, out) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => { f.relPath = (base ? base + '/' : '') + f.name; out.push(f); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const batch = [];
        const next = () => reader.readEntries((list) => {
          if (!list.length) {
            Promise.all(batch.map((en) => readEntry(en, (base ? base + '/' : '') + entry.name, out))).then(resolve);
            return;
          }
          batch.push.apply(batch, list);
          next();
        }, () => resolve());
        next();
      } else resolve();
    });
  }

  $('#fileInput').addEventListener('change', (e) => addFiles(e.target.files, 'files'));
  $('#dirInput').addEventListener('change', (e) => addFiles(e.target.files, 'folder'));

  // 目标位置
  $('#impParent').addEventListener('change', (e) => { imp.parent = e.target.value; dropFrozen(); renderImport(); });
  $('#impSub').addEventListener('input', (e) => { imp.sub = e.target.value.trim(); dropFrozen(); renderImport(); });
  $('#impKeep').addEventListener('change', (e) => { imp.keep = e.target.checked; dropFrozen(); renderImport(); });

  // 清单操作与示例
  $('#impClear').addEventListener('click', () => {
    imp.items = []; imp.source = ''; $('#fileInput').value = ''; $('#dirInput').value = '';
    dropFrozen(); imp.result = null;
    renderImport();
  });
  $$('.imp-demo [data-demo]').forEach((b) => b.addEventListener('click', () => {
    seedImportDemo(b.dataset.demo);
    dropFrozen();
    $('#impParent').value = imp.parent;
    $('#impSub').value = imp.sub;
    renderImport();
    const v = impValidate();
    if (v.ok) toast('已载入示例：' + v.stats.picked + ' 个文件，合计 ' + fmtBytes(v.stats.rawTotal) + '，校验通过', 'ok');
    else toast('已载入示例 —— ' + v.blocks[0].title + '，已阻止导入', 'err');
  }));

  // 执行 / 取消
  $('#importStart').addEventListener('click', impStart);
  $('#importCancel').addEventListener('click', closeImport);
  $('#importClose').addEventListener('click', closeImport);

  $('#newNoteCancel').addEventListener('click', () => closeModal('modalNew'));
  $('#newNoteCreate').addEventListener('click', () => {
    const name = $('#newNoteName').value.trim();
    const dir = $('#newNoteDir').value || '';
    if (!name) { toast('请先填写笔记标题', 'err'); $('#newNoteName').focus(); return; }
    // 文件名不可重复：同目录同名直接拒绝（与导入、重命名用同一条规则）
    const prob = nameProblem(name, dir, '');
    if (prob) { toast(prob, 'err'); $('#newNoteName').focus(); return; }
    const arr = ensureDir(dir);
    const node = { name: name, type: 'file', slug: slugFor(dir, name) };
    arr.push(node); sortTreeNodes(arr);
    addNoteRecord(node.slug);
    state.expanded[dir] = true;
    recountTree();
    closeModal('modalNew');
    setSidePanel('tree');
    renderTreePanel();
    renderNotes();
    toast('已在 ' + (dir || '顶层') + ' 创建「' + name + '」', 'ok');
    NOTE.slug = node.slug; NOTE.title = name; NOTE.tags = ['status/进行中']; NOTE.readingTime = 1;
    $('#noteBody').innerHTML = '<h2>开始记录</h2><p>这是新建笔记的初始内容，可以直接在下方继续书写。</p>';
    renderNote();
    setScreen('note');
  });

  // 登录
  $('#pwToggle').addEventListener('click', () => {
    const i = $('#loginKey');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    $('#pwToggle').innerHTML = icon(show ? 'eye-off' : 'eye');
  });
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#loginKey').value.trim();
    if (!v) { $('#loginError').classList.remove('hide'); return; }
    $('#loginError').classList.add('hide');
    $('#loginSubmit').textContent = '验证中…';
    setTimeout(() => { $('#loginSubmit').textContent = '进入花园'; setScreen('home'); toast('欢迎回来，初始管理员', 'ok'); }, 600);
  });
  $('#loginKey').addEventListener('input', () => $('#loginError').classList.add('hide'));
  $('#loginKey').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#loginError').classList.add('hide'); });

  // 后台
  $('#roleSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-role-opt]');
    if (!b) return;
    $$('#roleSeg button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  });
  $('#genKey').addEventListener('click', () => {
    const sel = $('#roleSeg button[aria-selected="true"]');
    const rk = sel && sel.dataset.roleOpt;
    if (!rk) { toast('当前身份没有可创建的密钥角色', 'err'); return; }
    if (!canCreateRole(rk)) { toast('越权操作：' + role().label + '不能创建「' + ROLES[rk].label + '」密钥', 'err'); return; }
    const label = ($('#keyLabel').value || '').trim() || '未命名用户';
    const key = 'grdn_' + Array.from({ length: 12 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
    $('#keyResult').classList.remove('hide');
    $('#keyResult').innerHTML =
      '<div class="t">' + icon('ok') + '密钥已生成 · ' + ROLES[rk].label + ' · 永久有效</div>'
      + '<div class="v"><code>' + key + '</code><button class="btn btn-ghost btn-sm" id="copyNew">' + icon('copy') + '复制</button></div>'
      + '<div class="note">由「' + esc(me().label) + '」（' + role().label + '）创建。请将该密钥发送给「' + esc(label) + '」；它可随时在下方列表中禁用或删除。</div>';
    $('#copyNew').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText(key).catch(() => {}); toast('密钥已复制到剪贴板', 'ok'); });
    KEYS.unshift({ id: keySeq++, label: label, key: key, role: rk, active: true, lastUsed: null, createdBy: me().id });
    $('#keyLabel').value = '';
    renderAdmin();
    toast('已为「' + label + '」创建' + ROLES[rk].label + '密钥', 'ok');
  });

  /* 删除密钥：二次确认（对话框）。pendingDelete 在权限章节声明，这里复用同一个变量 */
  $('#delKeyCancel').addEventListener('click', () => { pendingDelete = null; closeModal('modalDeleteKey'); });
  $('#delKeyConfirm').addEventListener('click', () => {
    if (!pendingDelete) return;
    const k = pendingDelete;
    pendingDelete = null;
    closeModal('modalDeleteKey');
    KEYS.splice(KEYS.indexOf(k), 1);
    renderAdmin();
    toast('已删除密钥「' + k.label + '」，该用户将立即失去访问权限', 'warn');
  });

  /* 新建文件夹 */
  $('#newFolderBtn').addEventListener('click', () => openNewFolder());
  $('#newFolderCancel').addEventListener('click', () => closeModal('modalNewFolder'));
  $('#newFolderName').addEventListener('input', updateFolderPath);
  $('#newFolderParent').addEventListener('change', updateFolderPath);
  $('#newFolderName').addEventListener('keydown', (e) => { if (e.key === 'Enter') createFolder(); });
  $('#newFolderCreate').addEventListener('click', createFolder);

  // 图谱交互
  (function graphInteractions() {
    const svg = $('#graphSvg');
    let panning = false, lx = 0, ly = 0;
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.gnode')) return;
      panning = true; lx = e.clientX; ly = e.clientY; svg.classList.add('is-panning');
    });
    window.addEventListener('pointermove', (e) => {
      if (!panning) return;
      G.tx += e.clientX - lx; G.ty += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      applyTransform();
    });
    window.addEventListener('pointerup', () => { panning = false; svg.classList.remove('is-panning'); });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = $('#graphStage').getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.min(4, Math.max(0.15, G.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      G.tx = mx - ((mx - G.tx) / G.zoom) * k;
      G.ty = my - ((my - G.ty) / G.zoom) * k;
      G.zoom = k;
      applyTransform();
    }, { passive: false });

    $('#gZoomIn').addEventListener('click', () => { G.zoom = Math.min(4, G.zoom * 1.25); applyTransform(); });
    $('#gZoomOut').addEventListener('click', () => { G.zoom = Math.max(0.15, G.zoom * 0.8); applyTransform(); });
    $('#gFit').addEventListener('click', fitGraph);
    $('#gPhysics').addEventListener('click', (e) => {
      G.physics = !G.physics;
      e.currentTarget.classList.toggle('is-on', G.physics);
      if (G.physics) {
        startSim(0.45);                     // 重新点火，冷却后自动停机
        toast('已启用力导向：布局将重新收敛并静止', 'ok');
      } else {
        stopSim();
        toast('已冻结布局，节点位置不再变化', 'warn');
      }
    });
    $('#gSettingsBtn').addEventListener('click', () => {
      const el = $('#gSettings');
      el.classList.toggle('hide');
      if (!el.classList.contains('hide')) renderGraphSettings();
    });
    $('#gSearch').addEventListener('input', (e) => { G.query = e.target.value; applyGraphQuery(); });
  })();

  // 预览工具条
  $('#barToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#previewBar').classList.toggle('is-min');
  });
  $('#previewBar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.id === 'barToggle') return;
    if (b.dataset.screenJump) { setScreen(b.dataset.screenJump); return; }
    if (b.dataset.roleJump) { setRole(b.dataset.roleJump); return; }
    if (b.dataset.toggle === 'theme') { setTheme(state.theme === 'dark' ? 'light' : 'dark', true); return; }
    if (b.dataset.toggle === 'device') {
      const on = frame.classList.toggle('is-mobile');
      b.setAttribute('aria-pressed', String(on));
      if (!on) { $('#sidebar').classList.remove('is-open'); $('#scrim').classList.add('hide'); }
      requestAnimationFrame(() => { fitGraph(); });
      return;
    }
    const st = b.dataset.state;
    if (st === 'palette') openPalette();
    if (st === 'new') { if (canManage()) $('#newNoteBtn').click(); else toast('当前身份为' + role().label + '，不能新建笔记', 'err'); }
    if (st === 'folder') openNewFolder();
    if (st === 'import') openImport();
    if (st === 'import-over') openImport('over-folder');
    if (st === 'delete') { $('#delName').textContent = NOTE.title; $('#delPath').textContent = NOTE.slug + '.md'; openModal('modalDelete'); }
    if (st === 'editor') { setScreen('note'); startEdit(); }
    if (st === 'empty') { state.emptyMode = true; setScreen('notes'); $('#qInput').value = '不存在的关键词'; $('#qClear').classList.remove('hide'); renderNotes(); }
  });

  // 全局快捷键
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#palette').classList.contains('hide') ? openPalette() : closePalette();
    }
    if (e.key === 'Escape') {
      if (!$('#ctxMenu').classList.contains('hide')) { closeCtx(); return; }
      if (state.renaming) { cancelRename(); return; }
      const anyMenuOpen = $$('.menu').some((m) => !m.classList.contains('hide'));
      if (anyMenuOpen) { closeAllMenus(); return; }
      if (!$('#palette').classList.contains('hide')) closePalette();
      else {
        const openModalId = ['modalImport', 'modalNewFolder', 'modalNew', 'modalNodeDel', 'modalDeleteKey', 'modalDelete']
          .find((id) => !$('#' + id).classList.contains('hide'));
        if (openModalId) { openModalId === 'modalImport' ? closeImport() : closeModal(openModalId); }
        else closeDrawer();
      }
    }
    if (mod && e.key === '\\') { e.preventDefault(); setSidebarOpen(!state.sidebarOpen); }
  });

  window.addEventListener('resize', () => { fitGraph(); });

  /* ------------------------------ 启动 ------------------------------ */
  initGraph();
  buildGraphDom();
  renderLegend();
  reheatGraph(false);
  renderGraphSettings();
  renderTreePanel();
  renderDomainPanel();
  renderTagPanel();
  renderHome();
  renderNotes();
  renderNote();
  renderClipBar();
  syncRoleUI();
  renderAdmin();
  renderMyKeys();
  setTheme('dark', false);
  setScreen('home');
  requestAnimationFrame(() => { fitGraph(); applyGraphQuery(); });
  // 首次入场：给图一点点"呼吸"，让它自己沉到稳定位置后彻底静止（不是永久抖动）
  startSim(0.16);
})();
