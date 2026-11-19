/**
 * Comparison
 * Сравнение товаров витрины
 * Работает только если в шапке есть .header--main--actions--comparison (сравнение может быть отключено),
 * без него .---params--buttons--compare-button скрывается в CSS
 * Клик по .---params--buttons--compare-button на странице товара:
 *   sku из data-sku-id у main.product добавляется в localStorage.comparison (json-список) и ставится __active,
 *   в списке не более 10 sku — при добавлении сверх лимита исключается самый старый,
 *   если sku уже есть в списке — удаляется из него и __active снимается
 *   клик по ::after (иконка перехода под лампочкой, видна только при __active) — переход на /comparison
 * Клик по .comparison--grid .__clear на странице сравнения — sku из data-sku удаляется из localStorage.comparison,
 *   со страницы удаляются все элементы .comparison--grid с этим data-sku, из SKUC в адресной строке
 *   sku убирается без записи в историю
 * Клик по .comparison--grid--image — переход по href следующего за изображением элемента a
 * Клик по .header--main--actions--comparison в шапке — переход по data-link
 * При переходе на сравнение в get-параметре SKUC передаются sku из localStorage.comparison через «.»
 * На .header--main--actions--comparison бейдж: __has-badge и --badge-content = число sku в списке
 * При загрузке, возврате из bfcache и изменении списка в другой вкладке синхронизируются бейдж и __active кнопки,
 * при смене sku опциями (data-sku-id) — __active кнопки
 * При выходе localStorage.comparison очищается через resetLocalCartOnLogout из cart.js
 */

const COMPARISON_CONFIG = {
  storageKey: 'comparison',
  comparisonPath: '/comparison',
  skuParam: 'SKUC',
  skuSeparator: '.',
  maxItems: 10,
  headerSelector: '.header--main--actions--comparison',
  headerButtonSelector: '.header--main--actions--comparison [data-link]',
  productSelector: 'main.product[data-sku-id]',
  compareButtonSelector: '.---params--buttons--compare-button',
  gridSelector: '.comparison--grid',
  imageSelector: '.comparison--grid--image',
  clearButtonSelector: '.comparison--grid .__clear[data-sku]'
};

/**
 * Local Storage Comparison
 * Список sku хранится json-строкой в localStorage.comparison
 * При записи обновляется бейдж в шапке
 */

/**
 * Читает список sku из localStorage и приводит их к строкам
 * Невалидное содержимое считается пустым списком
 */
function readLocalComparison() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPARISON_CONFIG.storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.map(sku => String(sku)) : [];
  } catch (e) {
    return [];
  }
}

function writeLocalComparison(list) {
  localStorage.setItem(COMPARISON_CONFIG.storageKey, JSON.stringify(list));
  updateComparisonBadge(list);
}

/**
 * Добавляет отсутствующий sku в конец списка или удаляет имеющийся
 * При превышении maxItems из начала списка исключаются самые старые sku
 * Возвращает true, если sku после переключения есть в списке
 */
function toggleLocalComparison(skuId) {
  const list = readLocalComparison();
  const isAdded = !list.includes(skuId);

  writeLocalComparison(isAdded ? [...list, skuId].slice(-COMPARISON_CONFIG.maxItems) : list.filter(sku => sku !== skuId));
  return isAdded;
}

function removeLocalComparison(skuId) {
  writeLocalComparison(readLocalComparison().filter(sku => sku !== skuId));
}

/**
 * Очистка при любом выходе через resetLocalCartOnLogout из cart.js
 * Бейдж и __active кнопки синхронизируются сразу: при протухшей сессии сброс идет из initCartAuthState
 * на DOMContentLoaded, уже после initComparison
 */
function resetLocalComparisonOnLogout() {
  try {
    localStorage.removeItem(COMPARISON_CONFIG.storageKey);
  } catch (e) {
    return;
  }

  syncComparisonState();
}

window.resetLocalComparisonOnLogout = resetLocalComparisonOnLogout;

/**
 * Comparison Redirect
 * Переход на страницу сравнения с sku из localStorage.comparison в SKUC
 */

/**
 * Формирует адрес сравнения: к baseUrl добавляется SKUC со списком sku через «.»
 * При пустом списке SKUC не передается
 */
function buildComparisonUrl(baseUrl) {
  const url = new URL(baseUrl || COMPARISON_CONFIG.comparisonPath, window.location.origin);
  const list = readLocalComparison();

  if (list.length) {
    url.searchParams.set(COMPARISON_CONFIG.skuParam, list.join(COMPARISON_CONFIG.skuSeparator));
  } else {
    url.searchParams.delete(COMPARISON_CONFIG.skuParam);
  }

  return url.pathname + url.search + url.hash;
}

function redirectToComparison(baseUrl) {
  window.location.assign(buildComparisonUrl(baseUrl));
}

/**
 * Header Comparison Badge
 * __has-badge и --badge-content с числом sku у .header--main--actions--comparison, при пустом списке снимаются
 */
function updateComparisonBadge(list) {
  const header = document.querySelector(COMPARISON_CONFIG.headerSelector);
  if (!header) return;

  if (list.length > 0) {
    header.classList.add('__has-badge');
    header.style.setProperty('--badge-content', `'${list.length}'`);
  } else {
    header.classList.remove('__has-badge');
    header.style.removeProperty('--badge-content');
  }
}

/**
 * Compare Button State
 * __active у .---params--buttons--compare-button, если sku текущего товара есть в localStorage.comparison
 */
function syncComparisonButton() {
  const productEl = document.querySelector(COMPARISON_CONFIG.productSelector);
  const button = productEl && productEl.querySelector(COMPARISON_CONFIG.compareButtonSelector);
  if (!button) return;

  button.classList.toggle('__active', readLocalComparison().includes(productEl.getAttribute('data-sku-id')));
}

/**
 * Comparison State
 * Синхронизирует бейдж в шапке и __active кнопки товара с localStorage.comparison
 */
function syncComparisonState() {
  updateComparisonBadge(readLocalComparison());
  syncComparisonButton();
}

/**
 * Следит за data-sku-id у main.product — при смене sku опциями (updateSkuUrl в product.js)
 * __active переставляется под новый sku
 */
function observeComparisonSku() {
  const productEl = document.querySelector(COMPARISON_CONFIG.productSelector);
  if (!productEl) return;

  new MutationObserver(syncComparisonButton).observe(productEl, {
    attributes: true,
    attributeFilter: ['data-sku-id']
  });
}

/**
 * Compare Button
 * Обработка клика по кнопке сравнения на странице товара
 */

/**
 * У активной кнопки снизу padding-bottom под ::after с иконкой перехода,
 * поэтому клик в зоне нижнего padding — клик по иконке
 * Клик с клавиатуры приходит с clientY = 0 и считается кликом по самой кнопке
 */
function isComparisonLinkClick(button, e) {
  if (!button.classList.contains('__active')) return false;

  const linkTop = button.getBoundingClientRect().bottom - parseFloat(getComputedStyle(button).paddingBottom);
  return e.clientY > linkTop;
}

/**
 * Клик по ::after уводит на сравнение, клик по кнопке переключает sku текущего товара в списке
 */
function handleComparisonButtonClick(button, e) {
  if (isComparisonLinkClick(button, e)) {
    redirectToComparison(COMPARISON_CONFIG.comparisonPath);
    return;
  }

  const productEl = button.closest(COMPARISON_CONFIG.productSelector);
  const skuId = productEl && productEl.getAttribute('data-sku-id');
  if (!skuId) return;

  button.classList.toggle('__active', toggleLocalComparison(skuId));
}

/**
 * Comparison Page Clear
 * Удаление товара со страницы сравнения кнопкой .comparison--grid .__clear
 */

/**
 * Удаляет из .comparison--grid все элементы с data-sku товара (изображение, ссылку с заголовком, кнопку, значения)
 * После удаления колонки на сетке генерируется scroll — HorizontalListNav из nav.js пересчитывает nav--prev / nav--next
 */
function removeComparisonGridItems(grid, skuId) {
  grid.querySelectorAll(`[data-sku="${CSS.escape(skuId)}"]`).forEach(el => {
    const target = el.matches('.comparison--grid--title') && el.parentElement.tagName === 'A' ? el.parentElement : el;
    target.remove();
  });
  grid.dispatchEvent(new Event('scroll'));
}

/**
 * Убирает sku из SKUC в адресной строке через replaceState, без записи в историю
 * Если sku в SKUC не осталось — параметр удаляется
 */
function removeComparisonSkuFromUrl(skuId) {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(COMPARISON_CONFIG.skuParam);
  if (value === null) return;

  const list = value.split(COMPARISON_CONFIG.skuSeparator).filter(sku => sku && sku !== skuId);

  if (list.length) {
    url.searchParams.set(COMPARISON_CONFIG.skuParam, list.join(COMPARISON_CONFIG.skuSeparator));
  } else {
    url.searchParams.delete(COMPARISON_CONFIG.skuParam);
  }

  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/**
 * sku из data-sku кнопки удаляется из localStorage.comparison, со страницы и из адресной строки
 * После удаления последнего товара страница перезагружается
 */
function handleComparisonClearClick(button) {
  const skuId = button.getAttribute('data-sku');
  const grid = button.closest(COMPARISON_CONFIG.gridSelector);
  if (!skuId || !grid) return;

  removeLocalComparison(skuId);
  removeComparisonGridItems(grid, skuId);
  removeComparisonSkuFromUrl(skuId);

  if (!readLocalComparison().length) window.location.reload();
}

/**
 * Comparison Page Image
 * Клик по изображению товара на странице сравнения
 */

/**
 * Переходит по href следующего за изображением элемента a
 */
function handleComparisonImageClick(image) {
  const link = image.nextElementSibling;
  if (!link || link.tagName !== 'A' || !link.hasAttribute('href')) return;

  window.location.assign(link.href);
}

/**
 * Инициализация сравнения
 * Без .header--main--actions--comparison в шапке сравнение отключено и обработчики не ставятся
 * Кнопки товара, изображения и .__clear сетки сравнения обрабатываются одним делегированным обработчиком
 * Клик по шапке перехватывается на capture-фазе: обработчик data-link из header.js висит на document
 * на всплытии и иначе перешел бы по ссылке без SKUC
 */
function initComparison() {
  if (!document.querySelector(COMPARISON_CONFIG.headerSelector)) return;

  document.addEventListener('click', (e) => {
    const headerButton = e.target.closest(COMPARISON_CONFIG.headerButtonSelector);
    if (!headerButton) return;

    e.preventDefault();
    e.stopPropagation();
    redirectToComparison(headerButton.dataset.link);
  }, true);

  document.addEventListener('click', (e) => {
    const compareButton = e.target.closest(COMPARISON_CONFIG.compareButtonSelector);

    if (compareButton) {
      e.preventDefault();
      e.stopPropagation();
      handleComparisonButtonClick(compareButton, e);
      return;
    }

    const clearButton = e.target.closest(COMPARISON_CONFIG.clearButtonSelector);

    if (clearButton) {
      e.preventDefault();
      e.stopPropagation();
      handleComparisonClearClick(clearButton);
      return;
    }

    const image = e.target.closest(COMPARISON_CONFIG.imageSelector);
    if (!image) return;

    e.preventDefault();
    e.stopPropagation();
    handleComparisonImageClick(image);
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) syncComparisonState();
  });

  window.addEventListener('storage', (e) => {
    if (e.key === COMPARISON_CONFIG.storageKey) syncComparisonState();
  });

  syncComparisonState();
  observeComparisonSku();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initComparison);
} else {
  initComparison();
}
