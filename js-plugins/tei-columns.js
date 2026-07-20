(function () {
  'use strict';

  const NS = 'http://www.tei-c.org/ns/1.0';
  const DEFAULT_CONFIGS = ['config/config.json', 'config/edition_config.json', 'edition_config.json'];
  let lineMap = null;
  let running = false;

  function qsa(root, selector) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function xmlAttr(el, name) {
    return el && (el.getAttribute(name) || el.getAttributeNS('http://www.w3.org/XML/1998/namespace', name.replace('xml:', '')));
  }

  function teiName(el) {
    return (el.localName || el.nodeName || '').replace(/^.*:/, '');
  }

  function pageFromPb(pb) {
    const id = xmlAttr(pb, 'xml:id') || '';
    const n = pb.getAttribute('n') || '';
    return n || id.replace(/^(BE_|CO_|IS_|MS_)/, '').replace(/^.*?_(\d+[rv]?)$/, '$1') || id;
  }

  async function fetchFirst(urls) {
    for (const url of urls) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) return { url, text: await r.text() };
      } catch (e) {}
    }
    throw new Error('Nessun config EVT trovato');
  }

  async function loadTeiUrl() {
    const cfg = await fetchFirst(DEFAULT_CONFIGS);
    let json;
    try { json = JSON.parse(cfg.text); } catch (e) { json = {}; }
    return json.dataUrl || 'data/text/Poetry_ParallelTranscription.xml';
  }

  async function buildLineMap() {
    const teiUrl = await loadTeiUrl();
    const r = await fetch(teiUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error('TEI non caricato: ' + teiUrl);
    const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
    const map = new Map();
    let page = '';
    let column = '';

    const walker = xml.createTreeWalker(xml.documentElement, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      const name = teiName(el);

      if (name === 'pb') {
        page = pageFromPb(el);
        column = '';
      }

      if (name === 'cb') {
        column = el.getAttribute('n') || column || '1';
      }

      if (name === 'lb') {
        const id = xmlAttr(el, 'xml:id');
        const n = el.getAttribute('n') || '';
        if (id && page && column) {
          map.set(id, { page, column, n });
        }
      }
    }
    return map;
  }

  function cssEscapeLoose(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');
  }

  function findRenderedLine(lineId) {
    const esc = cssEscapeLoose(lineId);
    const selectors = [
      '#' + esc,
      '[id="' + lineId + '"]',
      '[data-id="' + lineId + '"]',
      '[data-xmlid="' + lineId + '"]',
      '[data-xml-id="' + lineId + '"]',
      '[data-corresp="#' + lineId + '"]',
      '[facs="#' + lineId + '"]',
      '[href="#' + lineId + '"]',
      '[class*="' + lineId + '"]'
    ];
    for (const sel of selectors) {
      const found = document.querySelector(sel);
      if (found) return liftToLine(found);
    }
    return null;
  }

  function liftToLine(el) {
    return el.closest('.l, .line, .textLine, .evt-line, .evt_text_line, [data-tag="l"], [data-tei="l"], li, p, div') || el;
  }

  function textRootFor(nodes) {
    const panel = document.querySelector('.evt-text-panel, .text-panel, .editionText, .evt-text, .text, [class*="text-panel"], [class*="edition"]');
    if (panel) return panel;
    if (!nodes.length) return document.body;
    let root = nodes[0].parentElement;
    while (root && root !== document.body && nodes.some(n => !root.contains(n))) root = root.parentElement;
    return root || document.body;
  }

  function alreadyWrapped(node) {
    return node.closest && node.closest('.tei-page-columns');
  }

  function applyLayout() {
    if (!lineMap || running) return;
    running = true;
    try {
      const byPage = new Map();
      lineMap.forEach((info, lineId) => {
        const node = findRenderedLine(lineId);
        if (!node || alreadyWrapped(node)) return;
        node.classList.add('tei-line');
        node.dataset.teiColumn = info.column;
        node.dataset.teiPage = info.page;
        node.dataset.teiLine = info.n || '';
        if (!byPage.has(info.page)) byPage.set(info.page, []);
        byPage.get(info.page).push({ node, column: info.column, line: parseInt(info.n || '0', 10) });
      });

      byPage.forEach((items, page) => {
        items.sort((a, b) => (a.line || 0) - (b.line || 0));
        const usable = items.filter(x => x.node && x.node.parentNode && !alreadyWrapped(x.node));
        if (!usable.length) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'tei-page-columns';
        wrapper.dataset.teiPage = page;

        const col1 = document.createElement('div');
        col1.className = 'tei-column tei-column-1';
        col1.dataset.teiColumn = '1';

        const col2 = document.createElement('div');
        col2.className = 'tei-column tei-column-2';
        col2.dataset.teiColumn = '2';

        wrapper.appendChild(col1);
        wrapper.appendChild(col2);

        const first = usable[0].node;
        first.parentNode.insertBefore(wrapper, first);

        usable.forEach(item => {
          const target = String(item.column) === '2' ? col2 : col1;
          target.appendChild(item.node);
        });
      });
    } finally {
      running = false;
    }
  }

  async function init() {
    try {
      lineMap = await buildLineMap();
      applyLayout();
      const observer = new MutationObserver(function () {
        window.requestAnimationFrame(applyLayout);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener('hashchange', function () {
        setTimeout(applyLayout, 50);
        setTimeout(applyLayout, 250);
      });
    } catch (err) {
      console.warn('[tei-columns] disattivato:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
