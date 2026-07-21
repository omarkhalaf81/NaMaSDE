(function () {
  console.log('tei-alexander-layout caricato');

  var lineMap = {};
  var running = false;

  function getXmlId(el) {
    if (!el) {
      return '';
    }

    return el.getAttribute('xml:id') ||
           el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id') ||
           el.getAttribute('id') ||
           '';
  }

  function getName(el) {
    return (el.localName || el.nodeName || '').replace(/^.*:/, '');
  }

  function loadText(url, callback) {
    var xhr = new XMLHttpRequest();

    xhr.open('GET', url, true);

    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
        callback(xhr.responseText);
      }
    };

    xhr.send();
  }

  function buildLineMap(xmlText) {
    var xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    var elements = xml.getElementsByTagName('*');

    var currentPage = '';
    var currentColumn = '';

    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var name = getName(el);

      if (name === 'pb') {
        currentPage = el.getAttribute('n') || getXmlId(el);
        currentColumn = '';
      }

      if (name === 'cb') {
        currentColumn = el.getAttribute('n') || currentColumn || '1';
      }

      if (name === 'lb') {
        var id = getXmlId(el);
        var n = el.getAttribute('n') || '';
        var facs = el.getAttribute('facs') || '';

        if (id && n && currentPage && currentColumn) {
          lineMap[id] = {
            page: currentPage,
            column: currentColumn,
            line: n,
            facs: facs
          };
        }
      }
    }

    console.log('lineMap costruita', Object.keys(lineMap).length);
    window.__teiLineMap = lineMap;
  }

  function hasClass(node, className) {
    if (!node || !node.className || typeof node.className !== 'string') {
      return false;
    }

    return (' ' + node.className + ' ').indexOf(' ' + className + ' ') !== -1;
  }

  function findElementByXmlId(xmlId) {
    var all = document.getElementsByTagName('*');

    for (var i = 0; i < all.length; i++) {
      var el = all[i];

      if (!el.getAttribute) {
        continue;
      }

      if (
        el.getAttribute('xml:id') === xmlId ||
        el.getAttribute('id') === xmlId
      ) {
        return el;
      }
    }

    return null;
  }

  function findByDataFacs(facs) {
  if (!facs) {
    return null;
  }

  var all = document.querySelectorAll('[data-facs]');

  for (var i = 0; i < all.length; i++) {
    if (all[i].getAttribute('data-facs') === facs) {
      return all[i];
    }
  }

  return null;
}

function findRenderedLine(lbId, info) {
  var lb = null;

  if (info && info.facs) {
    lb = findByDataFacs(info.facs);
  }

  if (!lb) {
    lb = document.getElementById(lbId);
  }

  if (!lb) {
    lb = findElementByXmlId(lbId);
  }

  if (!lb) {
    return null;
  }

  var node = lb;

  while (node && node !== document.body) {
    var nodeName = (node.localName || node.nodeName || '').toLowerCase();

    if (nodeName === 'l') {
      return node;
    }

    if (hasClass(node, 'l')) {
      return node;
    }

    node = node.parentNode;
  }

  return lb.parentNode;
}
  function insideColumns(node) {
    var current = node;

    while (current && current !== document.body) {
      if (hasClass(current, 'tei-page-columns')) {
        return true;
      }

      current = current.parentNode;
    }

    return false;
  }

 function applyColumns() {
  if (running) {
    return;
  }

  running = true;

  var pages = {};
  var ids = Object.keys(lineMap);

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var info = lineMap[id];
    var line = findRenderedLine(id, info);

    if (!line) {
      continue;
    }

    if (!pages[info.page]) {
      pages[info.page] = [];
    }

    pages[info.page].push({
      node: line,
      column: info.column,
      line: parseInt(info.line || '0', 10)
    });
  }

  var pageNames = Object.keys(pages);

  for (var p = 0; p < pageNames.length; p++) {
    var page = pageNames[p];
    var items = pages[page];

    items.sort(function (a, b) {
      return a.line - b.line;
    });

    if (!items.length) {
      continue;
    }

    var first = items[0].node;

    if (!first || !first.parentNode) {
      continue;
    }

    var container = first.parentNode;

    if (!hasClass(container, 'tei-column-layout')) {
      container.className += ' tei-column-layout';
    }

    container.setAttribute('data-tei-page', page);

    var secondColumnStarted = false;

    for (var j = 0; j < items.length; j++) {
      var item = items[j];

      if (!item.node) {
        continue;
      }

      if (!hasClass(item.node, 'tei-line')) {
        item.node.className += ' tei-line';
      }

      item.node.setAttribute('data-tei-column', item.column);

      if (hasClass(item.node, 'tei-column-break')) {
        item.node.className = item.node.className
          .replace(/\btei-column-break\b/g, '')
          .trim();
      }

      if (String(item.column) === '2' && !secondColumnStarted) {
        var previous = item.node.previousElementSibling;

        if (!previous || !hasClass(previous, 'tei-column-break-marker')) {
          var marker = document.createElement('span');
          marker.className = 'tei-column-break-marker';
          marker.setAttribute('aria-hidden', 'true');

          item.node.parentNode.insertBefore(marker, item.node);
        }

        if (!hasClass(item.node, 'tei-column-break')) {
          item.node.className += ' tei-column-break';
        }

        secondColumnStarted = true;
      }

      var lbInLine = item.node.querySelector('span.lb, lb, .lb');

      if (lbInLine && !lbInLine.querySelector('.lineN')) {
        var visibleNumber =
          item.line ||
          lbInLine.getAttribute('n') ||
          lbInLine.getAttribute('data-n') ||
          '';

        if (visibleNumber) {
          var br = document.createElement('br');

          var lineNumber = document.createElement('span');
          lineNumber.className = 'lineN';
          lineNumber.textContent = visibleNumber;

          lbInLine.appendChild(br);
          lbInLine.appendChild(lineNumber);
        }
      }
    }
  }

  console.log(
    'tei-column-layout create',
    document.querySelectorAll('.tei-column-layout').length
  );

  var main = document.getElementById('mainContentToTranform');

if (main) {
  main.classList.add('tei-columns-ready');
}

  running = false;
}
  function start() {
    loadText('config/config.json', function (configText) {
      var config = JSON.parse(configText);
      var teiUrl = config.dataUrl;

      loadText(teiUrl, function (teiText) {
        buildLineMap(teiText);

        setTimeout(applyColumns, 0);
        setTimeout(applyColumns, 50);
        setTimeout(applyColumns, 150);

        window.addEventListener('hashchange', function () {
          setTimeout(applyColumns, 0);
          setTimeout(applyColumns, 50);
          setTimeout(applyColumns, 150);
        });

        // setInterval(applyColumns, 2500);
      });
    });
  }

  window.addEventListener('load', start);
}());
