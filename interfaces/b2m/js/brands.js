/**
 * Brands Selector
 * Клик по букве в .brands--selector--list li:
 *   - на выбранный li ставится __active, у остальных снимается;
 *   - повторный клик по активной букве сбрасывает фильтр;
 *   - в адресную строку пишется/удаляется GET-параметр FILTER;
 *   - запрос к /get-endpoints/getBrandsItems (тот же эндпойнт, что у .brands--items--more)
 *     с параметрами FILTER, PAGE=1;
 *   - ответ { html, more } полностью заменяет содержимое .brands-items-grid,
 *     кнопка "Показать еще" перенастраивается на PAGE=2 либо скрывается.
 */

const BRANDS_ITEMS_ENDPOINT = '/get-endpoints/getBrandsItems';
const BRANDS_GRID_SELECTORS = ['.brands--items .brands-items-grid', '.brands-items-grid'];
const BRANDS_MORE_SELECTOR = '.brands--items--more';

let brandsFilterLoading = false;

function getBrandsGrid() {
  for (const selector of BRANDS_GRID_SELECTORS) {
    const grid = document.querySelector(selector);
    if (grid) return grid;
  }
  return null;
}

/**
 * Синхронизация адресной строки с выбранным фильтром
 */
function setBrandsFilterInLocation(filter) {
  const url = new URL(window.location.href);
  if (filter) {
    url.searchParams.set('FILTER', filter);
  } else {
    url.searchParams.delete('FILTER');
  }
  url.searchParams.delete('PAGE');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/**
 * Перенастройка кнопки "Показать еще" под новый фильтр
 */
function updateBrandsMoreBlock(filter, hasMore) {
  const moreBlock = document.querySelector(BRANDS_MORE_SELECTOR);
  if (!moreBlock) return;

  const link = moreBlock.querySelector('a');
  if (!link) return;

  if (hasMore === true) {
    let pathname = '/brands';
    try {
      pathname = new URL(link.getAttribute('href') || '', window.location.href).pathname || pathname;
    } catch (_) {
      pathname = window.location.pathname;
    }

    const params = new URLSearchParams();
    params.set('PAGE', '2');
    if (filter) params.set('FILTER', filter);

    link.setAttribute('href', pathname + '?' + params.toString());
    moreBlock.classList.remove('__hidden');
  } else {
    moreBlock.classList.add('__hidden');
    link.setAttribute('href', '');
  }

  if (typeof window.setupAutoloadObserver === 'function') {
    window.setupAutoloadObserver();
  }
}

/**
 * Загрузка отфильтрованного списка брендов
 */
function loadBrandsByFilter(filter) {
  if (brandsFilterLoading) return;

  const grid = getBrandsGrid();
  if (!grid) return;

  brandsFilterLoading = true;

  const params = new URLSearchParams();
  if (filter) params.set('FILTER', filter);
  params.set('PAGE', '1');

  fetch(BRANDS_ITEMS_ENDPOINT + '?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      if (!data || typeof data !== 'object') return;
      if (typeof data.html !== 'string') return;

      grid.innerHTML = data.html;

      if (typeof window.initLazyLoad === 'function') {
        window.initLazyLoad(grid);
      }

      updateBrandsMoreBlock(filter, data.more);
    })
    .catch(() => {
      // тихо игнорируем — на экране остаётся предыдущий список
    })
    .finally(() => {
      brandsFilterLoading = false;
    });
}

/**
 * Инициализация селектора букв
 */
function initBrandsSelector() {
  const list = document.querySelector('.brands--selector--list');
  if (!list) return;

  const currentFilter = new URLSearchParams(window.location.search).get('FILTER');
  if (currentFilter) {
    for (const item of list.querySelectorAll('li')) {
      if (item.textContent.trim() === currentFilter) {
        item.classList.add('__active');
        break;
      }
    }
  }

  list.addEventListener('click', (e) => {
    const item = e.target.closest('li');
    if (!item || !list.contains(item)) return;
    if (brandsFilterLoading) return;

    const isActive = item.classList.contains('__active');

    for (const other of list.querySelectorAll('li.__active')) {
      other.classList.remove('__active');
    }

    const filter = isActive ? '' : item.textContent.trim();
    if (filter) item.classList.add('__active');

    setBrandsFilterInLocation(filter);
    loadBrandsByFilter(filter);
  });
}

document.addEventListener('DOMContentLoaded', initBrandsSelector);
