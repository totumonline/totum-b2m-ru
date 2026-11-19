/**
 * HTML Sanitizer
 * Лёгкая клиентская очистка HTML от XSS-векторов
 */
function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;

  const dangerousTags = new Set([
    'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META',
    'FORM', 'BASE', 'FRAME', 'FRAMESET'
  ]);
  const urlAttrs = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc']);
  const badScheme = /^\s*(javascript|vbscript|data)\s*:/i;

  // 1. Удаление опасных тегов
  root.querySelectorAll([...dangerousTags].join(',')).forEach(n => n.remove());

  // 2. Удаление SVG с подозрительным содержимым
  root.querySelectorAll('svg').forEach(svg => {
    if (isDangerousSvg(svg)) svg.remove();
  });

  // 3. Очистка содержимого <style>-тегов
  root.querySelectorAll('style').forEach(styleEl => {
    const cleaned = cleanCss(styleEl.textContent).trim();
    if (cleaned === '') {
      styleEl.remove();
    } else {
      styleEl.textContent = cleaned;
    }
  });

  // 4. Чистка атрибутов
  root.querySelectorAll('*').forEach(node => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith('on')) {
        node.removeAttribute(attr.name);
      } else if (urlAttrs.has(name) && badScheme.test(value)) {
        node.removeAttribute(attr.name);
      } else if (name === 'style') {
        cleanStyleAttr(node, value);
      }
    }
  });

  return root.innerHTML;
}

/**
 * Проверка SVG на наличие атакующих векторов
 */
function isDangerousSvg(svgEl) {
  if (svgEl.querySelector('script, foreignObject')) return true;

  const badScheme = /^\s*(javascript|vbscript|data)\s*:/i;
  const all = [svgEl, ...svgEl.querySelectorAll('*')];

  for (const el of all) {
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) return true;
      if ((name === 'href' || name === 'xlink:href') && badScheme.test(attr.value)) return true;
    }
  }
  return false;
}

/**
 * Очистка CSS-строки от опасных конструкций
 * Удаляет внешние url(...), javascript:/vbscript:, expression(), @import
 * Оставляет относительные url() и data:image
 */
function cleanCss(css) {
  const externalUrl = /url\s*\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi;
  const codeVector  = /(javascript|vbscript)\s*:[^;]*/gi;
  const expression  = /expression\s*\([^)]*\)/gi;
  const cssImport   = /@import\s+[^;]+;?/gi;

  return css
    .replace(externalUrl, '')
    .replace(codeVector, '')
    .replace(expression, '')
    .replace(cssImport, '')
    .replace(/;\s*;/g, ';');
}

/**
 * Очистка style-атрибута через cleanCss
 */
function cleanStyleAttr(node, value) {
  const cleaned = cleanCss(value).trim();
  if (cleaned === value.trim()) return;
  if (cleaned === '' || /^[\s;]*$/.test(cleaned)) {
    node.removeAttribute('style');
  } else {
    node.setAttribute('style', cleaned);
  }
}