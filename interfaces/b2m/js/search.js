/**
 * Search Items
 * Отслеживание ввода в поля поиска (#catalog-search и #mobile-search-panel-input) с дебоунсом 200 мс.
 * Отправляет GET-запрос на /get-endpoints/getSearchItems (SEARCH=строка до 100 символов).
 * Из ответа берёт ключи products и categories (html):
 * - десктоп: подставляет их в .---search-content после блока .---search-suggestions;
 * - мобильная панель: преобразует в структуру .mobile-search-panel--results--items.
 * Предыдущие результаты удаляются:
 * если ключа в ответе нет — соответствующего блока в DOM не будет.
 */

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_MAX_LENGTH = 100;
const MOBILE_SEARCH_CATEGORIES_LIMIT = 5;

let searchDebounceTimer = null;
let mobileSearchDebounceTimer = null;
let searchAbortController = null;

/**
 * Удаляет из .---search-content всё, что идёт после .---search-suggestions
 */
function clearSearchResults(searchContent, suggestionsBlock) {
  let node = suggestionsBlock.nextElementSibling;
  while (node) {
    const next = node.nextElementSibling;
    searchContent.removeChild(node);
    node = next;
  }
}

/**
 * Полный сброс: отменяет запрос в полёте и удаляет блоки результатов из DOM
 */
function resetSearchResults() {
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
  
  const searchContent = document.querySelector('.---search-content');
  const suggestionsBlock = document.querySelector('.---search-suggestions');
  if (searchContent && suggestionsBlock) {
    clearSearchResults(searchContent, suggestionsBlock);
  }
}

// Экспорт для header.js: перед показом дропдауна при пустой строке
// поиска надо удалить залипшие блоки результатов
window.resetSearchResults = resetSearchResults;

/**
 * Подстановка результатов в десктопный дропдаун после .---search-suggestions
 */
function applyDesktopResults(data) {
  const searchContent = document.querySelector('.---search-content');
  const suggestionsBlock = document.querySelector('.---search-suggestions');
  
  if (!searchContent || !suggestionsBlock) return;
  
  clearSearchResults(searchContent, suggestionsBlock);
  
  let html = '';
  if (typeof data.products === 'string') html += data.products;
  if (typeof data.categories === 'string') html += data.categories;
  
  if (html) {
    suggestionsBlock.insertAdjacentHTML('afterend', html);
  }
}

/**
 * Запрос результатов поиска и обновление десктопного и мобильного блоков
 */
function fetchSearchItems(query) {
  if (searchAbortController) {
    searchAbortController.abort();
  }
  searchAbortController = new AbortController();
  
  const params = new URLSearchParams();
  params.set('SEARCH', query);
  
  fetch('/get-endpoints/getSearchItems?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' },
    signal: searchAbortController.signal
  })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      if (!data || typeof data !== 'object') return;
      
      applyDesktopResults(data);
      applyMobileResults(data);
    })
    .catch(error => {
      if (error.name === 'AbortError') return;
      console.error('Search request failed:', error);
    });
}

/**
 * Переход на страницу результатов поиска /search?SEARCH=...
 */
function goToSearchPage(searchInput) {
  const query = searchInput.value.trim().slice(0, SEARCH_MAX_LENGTH);
  
  if (!query) return;
  
  const params = new URLSearchParams();
  params.set('SEARCH', query);
  
  window.location.href = '/search?' + params.toString();
}

/**
 * Инициализация обработчика поиска
 */
function initSearchItems() {
  const searchInput = document.getElementById('catalog-search');
  
  if (!searchInput) return;
  
  const searchForm = searchInput.closest('form');
  
  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      goToSearchPage(searchInput);
    });
  }
  
  // Кнопка «Посмотреть все» в футере дропдауна работает аналогично __submit:
  // переход на /search?SEARCH=...
  const footerResultsButton = document.querySelector('.---search-content--footer--results');
  
  if (footerResultsButton) {
    footerResultsButton.addEventListener('click', (event) => {
      event.preventDefault();
      goToSearchPage(searchInput);
    });
  }
  
  // Кнопка очистки меняет value напрямую (без события input),
  // поэтому удаляем блоки результатов отдельным обработчиком
  const clearButton = document.querySelector('.header--main--catalog--search .__clear');
  
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }
      resetSearchResults();
    });
  }
  
  searchInput.addEventListener('input', () => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    
    searchDebounceTimer = setTimeout(() => {
      const query = searchInput.value.trim().slice(0, SEARCH_MAX_LENGTH);
      
      if (!query) {
        // Поле очищено — отменяем запрос в полёте и убираем результаты
        resetSearchResults();
        return;
      }
      
      fetchSearchItems(query);
    }, SEARCH_DEBOUNCE_MS);
  });
}

document.addEventListener('DOMContentLoaded', initSearchItems);

/**
 * Mobile Search Panel
 * Поиск в мобильной панели (.mobile-search-panel):
 * - подсказки строятся из десктопного .---search-suggestions;
 * - результаты ответа преобразуются в .mobile-search-panel--results--items;
 * - кнопки __clear и __submit, дебоунс ввода, Enter — переход на /search.
 */

/**
 * Извлекает содержимое блока ответа эндпойнта для мобильной панели:
 * заголовок получает класс mobileClass--title, дальше внутренности --list
 * или всего блока; maxItems — ограничение количества li
 */
function extractMobileListContent(html, baseClass, mobileClass, maxItems) {
  if (typeof html !== 'string' || !html) return '';
  
  const template = document.createElement('template');
  template.innerHTML = html;
  
  const block = template.content.querySelector('.' + baseClass);
  if (!block) return '';
  
  const title = block.querySelector('.' + baseClass + '--title');
  let titleHtml = '';
  if (title) {
    titleHtml = '<div class="' + mobileClass + '--title">' + title.innerHTML + '</div>';
    title.remove();
  }
  
  if (maxItems) {
    const listItems = block.querySelectorAll('li');
    for (let i = maxItems; i < listItems.length; i++) {
      listItems[i].remove();
    }
  }
  
  const list = block.querySelector('.' + baseClass + '--list');
  return titleHtml + (list || block).innerHTML;
}

/**
 * Подстановка результатов в мобильную панель:
 * блок .mobile-search-panel--results--items пересоздаётся из ответа
 */
function applyMobileResults(data) {
  const results = document.querySelector('.mobile-search-panel--results');
  
  if (!results) return;
  
  const oldItems = results.querySelector('.mobile-search-panel--results--items');
  if (oldItems) oldItems.remove();
  
  const categoriesContent = extractMobileListContent(data.categories, '---search-content--categories', 'mobile-search-panel--results--items--categories', MOBILE_SEARCH_CATEGORIES_LIMIT);
  const productsContent = extractMobileListContent(data.products, '---search-content--products', 'mobile-search-panel--results--items--products');
  
  let html = '';
  if (categoriesContent) {
    html += '<div class="mobile-search-panel--results--items--categories">' + categoriesContent + '</div>';
  }
  if (productsContent) {
    html += '<div class="mobile-search-panel--results--items--products">' + productsContent + '</div>';
  }
  
  if (html) {
    const items = document.createElement('div');
    items.className = 'mobile-search-panel--results--items __scrollable';
    items.innerHTML = html;
    
    const suggestions = results.querySelector('.mobile-search-panel--results--suggestions');
    if (suggestions) {
      results.insertBefore(items, suggestions);
    } else {
      results.appendChild(items);
    }
  }
  
  updateMobileSearchVisibility();
}

/**
 * Удаляет блок результатов мобильной панели
 */
function resetMobileSearchResults() {
  const results = document.querySelector('.mobile-search-panel--results');
  
  if (!results) return;
  
  const items = results.querySelector('.mobile-search-panel--results--items');
  if (items) items.remove();
}

/**
 * Переключение suggestions/items и кнопки очистки по состоянию поля ввода
 */
function updateMobileSearchVisibility() {
  const searchInput = document.getElementById('mobile-search-panel-input');
  
  if (!searchInput) return;
  
  const hasText = searchInput.value.trim().length > 0;
  
  const suggestions = document.querySelector('.mobile-search-panel--results--suggestions');
  const items = document.querySelector('.mobile-search-panel--results--items');
  const clearButton = document.querySelector('.mobile-search-panel--fixed--search--block .__clear');
  
  if (hasText) {
    if (suggestions) suggestions.classList.remove('__active');
    if (items) items.classList.add('__active');
    if (clearButton) clearButton.classList.add('__active');
  } else {
    if (suggestions) suggestions.classList.add('__active');
    if (items) items.classList.remove('__active');
    if (clearButton) clearButton.classList.remove('__active');
  }
}

/**
 * Создаёт промо-блок мобильной панели (первым в .mobile-search-panel--results)
 */
function initMobileSearchPromo() {
  const results = document.querySelector('.mobile-search-panel--results');
  
  if (!results || results.querySelector('.mobile-search-panel--results--promo')) return;
  
  const promo = document.createElement('div');
  promo.className = 'mobile-search-panel--results--promo __scrollable';
  results.insertBefore(promo, results.firstChild);
}

/**
 * Создаёт блок подсказок мобильной панели из десктопного .---search-suggestions
 */
function initMobileSearchSuggestions() {
  const results = document.querySelector('.mobile-search-panel--results');
  
  if (!results || results.querySelector('.mobile-search-panel--results--suggestions')) return;
  
  const desktopList = document.querySelector('.---search-suggestions ul');
  
  if (!desktopList) return;
  
  const suggestions = document.createElement('div');
  suggestions.className = 'mobile-search-panel--results--suggestions __scrollable __active';
  suggestions.appendChild(desktopList.cloneNode(true));
  results.appendChild(suggestions);
}

/**
 * Инициализация поиска в мобильной панели
 */
function initMobileSearchPanel() {
  const searchInput = document.getElementById('mobile-search-panel-input');
  const searchPanel = document.querySelector('.mobile-search-panel');
  
  if (!searchInput || !searchPanel) return;
  
  initMobileSearchPromo();
  initMobileSearchSuggestions();
  
  const clearButton = document.querySelector('.mobile-search-panel--fixed--search--block .__clear');
  const submitButton = document.querySelector('.mobile-search-panel--fixed--search--block .__submit');
  
  searchInput.addEventListener('input', () => {
    updateMobileSearchVisibility();
    
    if (mobileSearchDebounceTimer) {
      clearTimeout(mobileSearchDebounceTimer);
    }
    
    mobileSearchDebounceTimer = setTimeout(() => {
      const query = searchInput.value.trim().slice(0, SEARCH_MAX_LENGTH);
      
      if (!query) {
        if (searchAbortController) {
          searchAbortController.abort();
          searchAbortController = null;
        }
        resetMobileSearchResults();
        return;
      }
      
      fetchSearchItems(query);
    }, SEARCH_DEBOUNCE_MS);
  });
  
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goToSearchPage(searchInput);
    }
  });
  
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (mobileSearchDebounceTimer) {
        clearTimeout(mobileSearchDebounceTimer);
      }
      if (searchAbortController) {
        searchAbortController.abort();
        searchAbortController = null;
      }
      searchInput.value = '';
      resetMobileSearchResults();
      updateMobileSearchVisibility();
      searchInput.focus();
    });
  }
  
  if (submitButton) {
    submitButton.addEventListener('click', (event) => {
      event.preventDefault();
      goToSearchPage(searchInput);
    });
  }
  
  // При открытии панели актуализируем видимость suggestions/items и кнопки очистки
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        if (searchPanel.classList.contains('__active')) {
          updateMobileSearchVisibility();
        }
      }
    });
  });
  
  observer.observe(searchPanel, { attributes: true });
}

document.addEventListener('DOMContentLoaded', initMobileSearchPanel);

/**
 * Search Page
 * Поле поиска на странице результатов (.search--fixed--search--block input, #search-input):
 * - ввод с дебоунсом 400 мс, Enter и кнопка __submit — запрос сразу, без перезагрузки страницы;
 * - запрос GET /get-endpoints/getMoreSearchItems?SEARCH=строка до 100 символов;
 * - ответ { html, more }: html заменяет содержимое .items-grid,
 *   more управляет блоком .catalog--items--more (href /search?SEARCH=...&PAGE=2);
 * - адресная строка обновляется параметром SEARCH (replaceState, без перезагрузки);
 * - кнопка __clear очищает поле, сетку и адресную строку;
 * - класс __responded на .search--fixed--search--block: снимается при отправке запроса,
 *   ставится при получении ответа — по нему CSS показывает .catalog--items--nothing-found.
 */

const SEARCH_PAGE_DEBOUNCE_MS = 400;
const SEARCH_PAGE_REPEAT_MS = 1000;

let searchPageDebounceTimer = null;
let searchPageAbortController = null;
let searchPageLastQuery = null;
let searchPageLastRequestTime = 0;

/**
 * Значение поля поиска страницы результатов: trim + первые 100 символов
 */
function getSearchPageQuery(searchInput) {
  return searchInput.value.trim().slice(0, SEARCH_MAX_LENGTH);
}

/**
 * Обновление адресной строки: SEARCH=запрос (пустой — параметр удаляется)
 */
function updateSearchPageUrl(query) {
  const url = new URL(window.location.href);
  
  if (query) {
    url.searchParams.set('SEARCH', query);
  } else {
    url.searchParams.delete('SEARCH');
  }
  
  // Новый запрос заменяет сетку первой страницей результатов — накопленный PAGE
  // (его пишет обработчик "Показать ещё" в catalog.js) становится неактуальным
  url.searchParams.delete('PAGE');
  
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/**
 * На тач-устройствах снимаем фокус с поля, чтобы закрылась экранная клавиатура
 * (на десктопе фокус остаётся — можно продолжать печатать)
 */
function blurSearchInputOnTouch(searchInput) {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  
  searchInput.blur();
}

/**
 * Класс __responded на блоке поиска: есть ответ эндпойнта (или серверная отдача страницы)
 */
function setSearchPageResponded(responded) {
  const searchBlock = document.querySelector('.search--fixed--search--block');
  
  if (!searchBlock) return;
  
  if (responded) {
    searchBlock.classList.add('__responded');
  } else {
    searchBlock.classList.remove('__responded');
  }
}

/**
 * Показ/скрытие кнопки очистки по наличию текста в поле
 */
function updateSearchPageClearButton(searchInput) {
  const clearButton = document.querySelector('.search--fixed--search--block .__clear');
  
  if (!clearButton) return;
  
  if (searchInput.value.trim().length > 0) {
    clearButton.classList.add('__active');
  } else {
    clearButton.classList.remove('__active');
  }
}

/**
 * Блок "Показать ещё": href на следующую страницу результатов или скрытие
 */
function updateSearchPageMoreBlock(query, more) {
  const moreBlock = document.querySelector('.catalog--items--more');
  
  if (!moreBlock) return;
  
  const moreLink = moreBlock.querySelector('a');
  
  if (more === true) {
    moreBlock.classList.remove('__hidden');
    if (moreLink) {
      const params = new URLSearchParams();
      params.set('SEARCH', query);
      params.set('PAGE', '2');
      moreLink.setAttribute('href', '/search?' + params.toString());
    }
  } else {
    moreBlock.classList.add('__hidden');
    if (moreLink) {
      moreLink.setAttribute('href', '');
    }
  }
  
  // Кнопка могла появиться или исчезнуть — перенастраиваем autoload (catalog.js)
  if (typeof setupAutoloadObserver === 'function') {
    setupAutoloadObserver();
  }
}

/**
 * Замена карточек в .items-grid и реинициализация их UI
 */
function applySearchPageItems(html) {
  const itemsGrid = document.querySelector('.catalog--items .items-grid') || document.querySelector('.items-grid');
  
  if (!itemsGrid) return;
  
  itemsGrid.innerHTML = typeof html === 'string' ? html : '';
  
  if (typeof window.initScrollers === 'function') {
    window.initScrollers(itemsGrid);
  }
  if (typeof window.initLazyLoad === 'function') {
    window.initLazyLoad(itemsGrid);
  }
  if (typeof window.applyMobileButtonClass === 'function') {
    window.applyMobileButtonClass(itemsGrid);
  }
  // Сетка заменена целиком — нужен полный пересчёт __wide-item
  if (typeof window.safeFixAllGrids === 'function') {
    window.safeFixAllGrids();
  }
}

/**
 * Удаление кнопки возврата на предыдущую страницу каталога
 */
function removeSearchPageBackButton() {
  const backButton = document.querySelector('.catalog--items--back');
  
  if (backButton) {
    backButton.remove();
  }
}

/**
 * Запрос результатов поиска для страницы результатов
 */
function fetchSearchPageItems(query) {
  if (searchPageAbortController) {
    searchPageAbortController.abort();
  }
  searchPageAbortController = new AbortController();
  
  removeSearchPageBackButton();
  
  setSearchPageResponded(false);
  
  searchPageLastQuery = query;
  searchPageLastRequestTime = Date.now();
  
  const params = new URLSearchParams();
  params.set('SEARCH', query);
  
  fetch('/get-endpoints/getMoreSearchItems?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' },
    signal: searchPageAbortController.signal
  })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      if (!data || typeof data !== 'object') return;
      
      applySearchPageItems(data.html);
      updateSearchPageMoreBlock(query, data.more);
      setSearchPageResponded(true);
    })
    .catch(error => {
      if (error.name === 'AbortError') return;
      console.error('Search page request failed:', error);
    });
}

/**
 * Немедленный запрос (Enter, __submit): дебоунс сбрасывается
 */
function runSearchPageRequest(searchInput) {
  if (searchPageDebounceTimer) {
    clearTimeout(searchPageDebounceTimer);
    searchPageDebounceTimer = null;
  }
  
  const query = getSearchPageQuery(searchInput);
  
  updateSearchPageUrl(query);
  
  if (!query) {
    if (searchPageAbortController) {
      searchPageAbortController.abort();
      searchPageAbortController = null;
    }
    setSearchPageResponded(false);
    applySearchPageItems('');
    updateSearchPageMoreBlock('', false);
    searchPageLastQuery = null;
    return;
  }
  
  // Такой же запрос уже ушёл меньше секунды назад (дебоунс успел отработать) — не дублируем
  if (query === searchPageLastQuery && Date.now() - searchPageLastRequestTime < SEARCH_PAGE_REPEAT_MS) return;
  
  fetchSearchPageItems(query);
}

/**
 * Инициализация поиска на странице результатов
 */
function initSearchPage() {
  const searchBlock = document.querySelector('.search--fixed--search--block');
  
  if (!searchBlock) return;
  
  const searchInput = searchBlock.querySelector('input');
  
  if (!searchInput) return;
  
  const clearButton = searchBlock.querySelector('.__clear');
  const submitButton = searchBlock.querySelector('.__submit');
  
  updateSearchPageClearButton(searchInput);
  // Страница отрисована сервером по SEARCH из адресной строки — это тоже ответ
  setSearchPageResponded(getSearchPageQuery(searchInput).length > 0);
  
  searchInput.addEventListener('input', () => {
    updateSearchPageClearButton(searchInput);
    
    if (searchPageDebounceTimer) {
      clearTimeout(searchPageDebounceTimer);
    }
    
    searchPageDebounceTimer = setTimeout(() => {
      searchPageDebounceTimer = null;
      runSearchPageRequest(searchInput);
    }, SEARCH_PAGE_DEBOUNCE_MS);
  });
  
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      blurSearchInputOnTouch(searchInput);
      runSearchPageRequest(searchInput);
    }
  });
  
  const searchForm = searchInput.closest('form');
  
  if (searchForm) {
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      blurSearchInputOnTouch(searchInput);
      runSearchPageRequest(searchInput);
    });
  }
  
  if (submitButton) {
    submitButton.addEventListener('click', (event) => {
      event.preventDefault();
      blurSearchInputOnTouch(searchInput);
      runSearchPageRequest(searchInput);
    });
  }
  
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      updateSearchPageClearButton(searchInput);
      runSearchPageRequest(searchInput);
      searchInput.focus();
    });
  }
}

document.addEventListener('DOMContentLoaded', initSearchPage);
