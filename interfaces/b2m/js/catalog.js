
/* Sticky фильтры каталога при прокрутке вверх:
   - при прокрутке вниз фильтры уезжают за край естественно;
   - при прокрутке вверх на 30px (когда фильтры не видны) - появляются sticky под header;
   - при прокрутке вниз - отключаются и возвращаются на своё место. */

document.addEventListener('DOMContentLoaded', function() {
  const filters = document.querySelector('.catalog--filters');
  if (!filters) return;
  
  const SHOW_THRESHOLD = 20;  // Прокрутка вверх для показа
  const HIDE_THRESHOLD = 150; // Прокрутка вниз для скрытия
  
  let lastScrollY = window.scrollY;
  let scrollUpAccumulator = 0;
  let scrollDownAccumulator = 0;
  let isFiltersSticky = false;
  let isHiding = false;
  let filtersPlaceholder = null;
  let ticking = false;
  let pendingShowTimer = null; // Таймер отложенного показа на мобиле
  
  // Получаем высоту header-main из CSS переменной
  function getHeaderHeight() {
    const value = getComputedStyle(document.body).getPropertyValue('--header-main-height');
    return parseFloat(value) || 60;
  }
  
  // Создаём placeholder для сохранения места в DOM
  function createPlaceholder() {
    if (filtersPlaceholder) return;
    filtersPlaceholder = document.createElement('div');
    filtersPlaceholder.className = 'catalog--filters-placeholder';
    filtersPlaceholder.style.display = 'none';
    filters.parentNode.insertBefore(filtersPlaceholder, filters.nextSibling);
  }
  
  // Проверяем, ушли ли фильтры за верхний край
  function areFiltersOutOfView() {
    if (isFiltersSticky) {
      // Когда sticky - проверяем позицию placeholder
      if (filtersPlaceholder) {
        const placeholderRect = filtersPlaceholder.getBoundingClientRect();
        const headerHeight = getHeaderHeight();
        return placeholderRect.bottom < headerHeight;
      }
      return true;
    }
    
    const rect = filters.getBoundingClientRect();
    const headerHeight = getHeaderHeight();
    // Фильтры "ушли" когда их нижняя граница выше верхней видимой области (под header)
    return rect.bottom < headerHeight;
  }
  
  // Проверяем, вернулись ли мы к естественной позиции фильтров
  function areFiltersBackInPosition() {
    if (!filtersPlaceholder) return true;
    const placeholderRect = filtersPlaceholder.getBoundingClientRect();
    const headerHeight = getHeaderHeight();
    // Фильтры вернулись когда placeholder опустился ниже header
    return placeholderRect.top >= headerHeight;
  }
  
  // Проверяем виден ли на экране низ страницы (catalog--text / footer--main-menu / footer--bottom)
  // Если виден - sticky фильтры не нужны, чтобы не перекрывать описание/футер
  function isPageBottomVisible() {
    const selectors = ['.catalog--text', '.footer--main-menu', '.footer--bottom'];
    const viewportHeight = window.innerHeight;
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top < viewportHeight && rect.bottom > 0) return true;
    }
    return false;
  }
  
  function canShowStickyFilters() {
    const header = document.querySelector('header');
    if (!header) return false;
    
    // Не показываем sticky если в видимости низ страницы (описание каталога или футер)
    if (isPageBottomVisible()) return false;
    
    // На десктопе (>= 1121px) показываем только если header в режиме __quick-hidden
    if (window.innerWidth >= 1121) {
      return header.classList.contains('__quick-hidden');
    }
    
    // На мобиле - показываем только если header видим (нет __mobile-hidden)
    return !header.classList.contains('__mobile-hidden');
  }
  
  function cancelPendingShow() {
    if (pendingShowTimer) {
      clearTimeout(pendingShowTimer);
      pendingShowTimer = null;
    }
  }
  
  function scheduleShowFilters() {
    // Если уже показаны или в процессе показа - ничего не делаем
    if (isFiltersSticky || isHiding || pendingShowTimer) return;
    
    // На десктопе показываем сразу
    if (window.innerWidth >= 1121) {
      if (canShowStickyFilters()) {
        enableStickyFilters();
      }
      return;
    }
    
    // На мобиле - проверяем header и ждём 100мс
    if (canShowStickyFilters()) {
      pendingShowTimer = setTimeout(() => {
        pendingShowTimer = null;
        // Перепроверяем условие перед показом
        if (canShowStickyFilters() && !isFiltersSticky && !isHiding) {
          enableStickyFilters();
        }
      }, 180);
    }
  }
  
  function enableStickyFilters() {
    if (isFiltersSticky || isHiding || !canShowStickyFilters()) return;
    
    createPlaceholder();
    
    // Сохраняем размеры для placeholder
    const rect = filters.getBoundingClientRect();
    filtersPlaceholder.style.height = rect.height + 'px';
    filtersPlaceholder.style.display = 'block';
    
    filters.classList.remove('__hiding');
    filters.classList.add('__sticky-filters');
    isFiltersSticky = true;
  }
  
  function disableStickyFilters(immediate = false) {
    if (!isFiltersSticky || isHiding) return;
    
    if (immediate) {
      // Мгновенное скрытие (для верха страницы)
      filters.classList.remove('__sticky-filters', '__hiding');
      isFiltersSticky = false;
      if (filtersPlaceholder) {
        filtersPlaceholder.style.display = 'none';
      }
      return;
    }
    
    // Анимированное скрытие
    isHiding = true;
    filters.classList.add('__hiding');
    
    setTimeout(() => {
      filters.classList.remove('__sticky-filters', '__hiding');
      isFiltersSticky = false;
      isHiding = false;
      if (filtersPlaceholder) {
        filtersPlaceholder.style.display = 'none';
      }
    }, 200);
  }
  
  function updateFiltersState() {
    // Игнорируем прокрутку при открытии/закрытии панелей (флаг из header.js)
    if (window.ignoreScrollTracking) {
      lastScrollY = window.scrollY;
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      cancelPendingShow();
      ticking = false;
      return;
    }
    
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;
    
    // В верхней части страницы (первые 100px) - sticky фильтры не нужны,
    // они и так видны на своём естественном месте
    if (currentScrollY < 100) {
      if (isFiltersSticky) {
        disableStickyFilters(true);
      }
      cancelPendingShow();
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }
    
    // Защита от резкой прокрутки вверх: если фильтры sticky, но уже на своём месте -
    // отключаем мгновенно, независимо от направления scrollDelta
    if (isFiltersSticky && areFiltersBackInPosition()) {
      disableStickyFilters(true);
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      cancelPendingShow();
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }
    
    const filtersOutOfView = areFiltersOutOfView();
    
    if (scrollDelta > 0) {
      // Прокрутка вниз
      scrollUpAccumulator = 0;
      cancelPendingShow(); // Отменяем отложенный показ
      
      if (isFiltersSticky) {
        // Накапливаем прокрутку вниз
        scrollDownAccumulator += scrollDelta;
        
        if (scrollDownAccumulator >= HIDE_THRESHOLD) {
          disableStickyFilters();
          scrollDownAccumulator = 0;
        }
      }
    } else if (scrollDelta < 0) {
      // Прокрутка вверх
      scrollDownAccumulator = 0;
      
      // Если мы вернулись к естественной позиции фильтров - отключаем sticky мгновенно
      if (isFiltersSticky && areFiltersBackInPosition()) {
        disableStickyFilters(true);
        scrollUpAccumulator = 0;
        cancelPendingShow();
      } else if (filtersOutOfView && !isFiltersSticky && !pendingShowTimer) {
        // Фильтры за пределами экрана - накапливаем прокрутку вверх
        scrollUpAccumulator += Math.abs(scrollDelta);
        
        if (scrollUpAccumulator >= SHOW_THRESHOLD) {
          scheduleShowFilters();
        }
      }
    }
    
    lastScrollY = currentScrollY;
    ticking = false;
  }
  
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateFiltersState);
      ticking = true;
    }
  }
  
  window.addEventListener('scroll', onScroll, { passive: true });
  
  // Синхронизация с header: при снятии __sticky-block-hide снимаем __sticky-filters
  window.addEventListener('stickyBlockHideRemoved', () => {
    if (isFiltersSticky) {
      disableStickyFilters();
    }
    cancelPendingShow();
    scrollUpAccumulator = 0;
    scrollDownAccumulator = 0;
  });
  
  // Обработка resize
  ResizeDispatcher.onResizeDebounced(() => {
    // Обновляем размер placeholder если sticky активен
    if (isFiltersSticky && filtersPlaceholder) {
      const rect = filters.getBoundingClientRect();
      filtersPlaceholder.style.height = rect.height + 'px';
    }
    scrollUpAccumulator = 0;
    scrollDownAccumulator = 0;
    lastScrollY = window.scrollY;
  });
});



/* Кнопка возврата в заголовке каталога и страницы
   (catalog--catalog-title--back-button, page--page-title--back-button)
   Переносит GET-параметры фильтров и SORT с текущей страницы в целевой URL —
   аналогично инжекторам ссылок в header.js, но кнопка back не <a>, поэтому
   capture-обработчики на неё не срабатывают и логику дублируем здесь. */

document.addEventListener('click', (e) => {
  const backButton = e.target.closest('.catalog--catalog-title--back-button, .page--page-title--back-button');
  if (!backButton) return;

  const backLink = backButton.getAttribute('data-back-link');
  if (!backLink) return;

  let targetUrl;
  try {
    targetUrl = new URL(backLink, window.location.href);
  } catch (_) {
    window.location.href = backLink;
    return;
  }
  
  // Переносим параметры только если целевой URL — это /catalog/ или /p/
  const isCatalogTarget = targetUrl.pathname.indexOf('/catalog/') !== -1 ||
                         targetUrl.pathname.indexOf('/p/') !== -1;
  
  if (isCatalogTarget) {
    // Копируем GET-параметры с текущей страницы (кроме SORT и utm_*) — собственные параметры целевого URL приоритетны.
    // SORT обрабатывается отдельно (см. ниже). utm_* не переносим: маркетинговые метки специфичны
    // для конкретного перехода и при навигации на другую страницу должны сбрасываться.
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.forEach((value, key) => {
      if (key === 'SORT') return;
      if (key === 'SKU') return;
      if (key.startsWith('utm_')) return;
      if (targetUrl.searchParams.has(key)) return;
      targetUrl.searchParams.set(key, value);
    });
    
    // SORT добавляем из sessionStorage только для /catalog/, если он там есть и не задан явно
    if (targetUrl.pathname.indexOf('/catalog/') !== -1 && !targetUrl.searchParams.has('SORT')) {
      try {
        const sort = sessionStorage.getItem('order-by');
        if (sort) targetUrl.searchParams.set('SORT', sort);
      } catch (_) {}
    }
  }
  
  // Сохраняем относительность ссылки, если она была относительной
  const isAbsolute = /^([a-z]+:)?\/\//i.test(backLink);
  window.location.href = isAbsolute
    ? targetUrl.toString()
    : targetUrl.pathname + targetUrl.search + targetUrl.hash;
});



/* Кнопка "Показать ещё" (.catalog--items--more, .page--items--more, .brands--items--more):
   Перехватываем клик по ссылке внутри блока и вместо перехода грузим
   следующую партию элементов:
     - .catalog--items--more → /get-endpoints/getFitredCatalogItems (товары в .items-grid);
     - .page--items--more    → /get-endpoints/getPageItems (страницы в .page-items-grid);
     - .brands--items--more  → /get-endpoints/getBrandsItems (бренды в .brands-items-grid).

   Параметры запроса для .catalog--items--more и .page--items--more:
     - все GET-параметры из текущей адресной строки;
     - URL = pathname ссылки (без хоста и query);
     - PAGE = значение PAGE из ссылки;
     - COUNT = false;
     - BRAND = true, если URL содержит /brands/.

   Отдельные ветки:
     - если href ведёт на /search (страница результатов поиска),
       вместо /get-endpoints/getFitredCatalogItems зовём /get-endpoints/getMoreSearchItems
       с параметрами PAGE (из ссылки) и SEARCH — значение
       .search--fixed--search--block input, обрезанное до 100 символов;
     - если href ведёт на /favorites, зовём /get-endpoints/getMoreFavoriteItems
       только с параметром PAGE из ссылки.

   Параметры запроса для .brands--items--more:
     - PAGE = значение PAGE из ссылки;
     - FILTER — только если есть в текущей адресной строке.

   Ответ — JSON { html: string, more: boolean }:
     - html добавляется в конец сетки;
     - more === true  — в href ссылки увеличиваем PAGE на 1;
     - more === false — блок получает класс __hidden, href обнуляется;
     - в обоих случаях с блока снимается __paused (см. Autoload ниже).

   После успешной вставки карточек (включая ветки /search и /favorites) PAGE загруженной партии пишется в адресную
   строку через replaceState (syncPageParam в конфиге) — без записи в историю.
   По этому параметру header.js при возврате на страницу понимает, что нужно
   восстановить позицию скролла (sessionStorage top_item_id), а не отдавать её
   системному восстановлению.

   Ограничение страниц в сетке (maxPages + backButtonClass в конфиге, .catalog--items--more и .page--items--more):
   после вставки партии PAGE=N смотрим data-page первой карточки сетки (пустой — механизм не работает).
   Если N - первая >= maxPages, все карточки с data-page <= N - maxPages удаляются, а перед сеткой
   ставится (или обновляется) кнопка backButtonClass с data-link = текущий адрес с PAGE последней
   удалённой страницы. Так в браузере остаётся не больше maxPages страниц (лимит × maxPages карточек).
*/

const ITEMS_MORE_SELECTOR = '.catalog--items--more, .page--items--more, .brands--items--more';

const ITEMS_MORE_CONFIGS = [
  {
    blockSelector: '.catalog--items--more',
    endpoint: '/get-endpoints/getFitredCatalogItems',
    gridSelectors: ['.catalog--items .items-grid', '.items-grid'],
    itemSelector: '.item',
    fixGrid: true,
    syncPageParam: true,
    maxPages: 4,
    backButtonClass: 'catalog--items--back',
    backButtonText: 'Показать товары на предыдущей странице'
  },
  {
    blockSelector: '.page--items--more',
    endpoint: '/get-endpoints/getPageItems',
    gridSelectors: ['.page--items .page-items-grid', '.page-items-grid'],
    itemSelector: '.page-item',
    fixGrid: true,
    syncPageParam: true,
    maxPages: 4,
    backButtonClass: 'page--items--back',
    backButtonText: 'Показать элементы на предыдущей странице'
  },
  {
    blockSelector: '.brands--items--more',
    endpoint: '/get-endpoints/getBrandsItems',
    gridSelectors: ['.brands--items .brands-items-grid', '.brands-items-grid'],
    itemSelector: '.brands-item',
    fixGrid: false,
    // Из адресной строки пробрасываем только FILTER, URL/COUNT/BRAND не нужны
    locationParams: ['FILTER']
  }
];

function getItemsMoreConfig(moreBlock) {
  return ITEMS_MORE_CONFIGS.find(config => moreBlock.matches(config.blockSelector)) || null;
}

/**
 * Items Pages Trim
 * Удаляет из сетки ранние страницы, если загруженная PAGE отстоит от первой (data-page первой карточки)
 * на config.maxPages и более, и ставит перед сеткой кнопку config.backButtonClass
 * с data-link на последнюю удалённую страницу (текущий адрес с заменой PAGE).
 * Скролл компенсируется по первой оставшейся карточке — на случай, если браузер
 * не поддерживает overflow-anchor (при поддержке смещение уже нулевое).
 */
function trimItemsPages(config, itemsGrid, loadedPage) {
  if (!config.maxPages || !config.backButtonClass) return;

  const page = parseInt(loadedPage, 10);
  if (isNaN(page)) return;

  const items = Array.from(itemsGrid.querySelectorAll(':scope > ' + config.itemSelector));
  if (items.length === 0) return;

  const firstPageRaw = (items[0].dataset.page || '').trim();
  if (firstPageRaw === '') return;

  const firstPage = parseInt(firstPageRaw, 10);
  if (isNaN(firstPage) || page - firstPage < config.maxPages) return;

  const lastRemovedPage = page - config.maxPages;
  const removeItems = items.filter(item => {
    const itemPage = parseInt((item.dataset.page || '').trim(), 10);
    return !isNaN(itemPage) && itemPage <= lastRemovedPage;
  });
  if (removeItems.length === 0) return;

  const removeSet = new Set(removeItems);
  const anchorItem = items.find(item => !removeSet.has(item)) || null;
  const anchorTopBefore = anchorItem ? anchorItem.getBoundingClientRect().top : 0;

  window.ignoreScrollTracking = true;

  removeItems.forEach(item => item.remove());

  let backUrl;
  try {
    backUrl = new URL(window.location.href);
  } catch (_) {
    backUrl = null;
  }

  if (backUrl) {
    backUrl.searchParams.set('PAGE', String(lastRemovedPage));

    let backButton = document.querySelector('.' + config.backButtonClass);
    if (!backButton) {
      backButton = document.createElement('button');
      backButton.className = config.backButtonClass + ' outline-button';
      backButton.textContent = config.backButtonText || '';
      backButton.setAttribute('aria-label', config.backButtonText || 'Показать предыдущую страницу');
      itemsGrid.before(backButton);
    }
    backButton.setAttribute('data-link', backUrl.pathname + backUrl.search);
  }

  if (anchorItem) {
    const delta = anchorItem.getBoundingClientRect().top - anchorTopBefore;
    if (Math.abs(delta) >= 1) {
      window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.ignoreScrollTracking = false;
    });
  });
}

let catalogItemsMoreLoading = false;

document.addEventListener('click', (e) => {
  const moreBlock = e.target.closest(ITEMS_MORE_SELECTOR);
  if (!moreBlock) return;

  const config = getItemsMoreConfig(moreBlock);
  if (!config) return;

  const link = moreBlock.querySelector('a');
  if (!link) return;

  const originalHref = link.getAttribute('href');
  if (!originalHref) return;

  e.preventDefault();

  // Реальный клик пользователя (e.isTrusted=true) во время активного autoload
  // (таймер крутится / ::after анимируется) ТОЛЬКО ставит autoload на паузу (__paused),
  // AJAX не запускаем — пользователь сам кликнет повторно, когда захочет подгрузить партию.
  // Программный клик из autoload-таймера (e.isTrusted=false) — не трогает паузу.
  const isUserClick = e.isTrusted;
  if (isUserClick && autoloadTimer !== null) {
    pauseAutoload(moreBlock);
    return;
  }

  // Защита от повторных кликов пока запрос в полёте
  if (catalogItemsMoreLoading) return;
  catalogItemsMoreLoading = true;

  let linkUrl;
  try {
    linkUrl = new URL(originalHref, window.location.href);
  } catch (_) {
    catalogItemsMoreLoading = false;
    return;
  }

  // Загрузка запущена — паузу больше не ставим: пока карточки вставляются и отрисовываются,
  // кнопка может пройти через верхние 30% viewport. Observer пересоздаётся в finally
  // и проверяет уже новую позицию кнопки.
  stopAutoloadObserver();

  // Собираем параметры: адресная строка (полностью или по белому списку) + PAGE из ссылки
  const locationParams = new URLSearchParams(window.location.search);
  const isSearchMore = linkUrl.pathname === '/search';
  const isFavoritesMore = linkUrl.pathname === '/favorites';
  let endpoint = config.endpoint;
  let params;

  if (isSearchMore) {
    // Страница результатов поиска: свой эндпойнт, из параметров только
    // PAGE (из ссылки) и SEARCH (из поля поиска, максимум 100 символов)
    endpoint = '/get-endpoints/getMoreSearchItems';
    params = new URLSearchParams();

    const searchInput = document.querySelector('.search--fixed--search--block input');
    const searchValue = searchInput ? searchInput.value.trim().slice(0, 100) : '';
    params.set('SEARCH', searchValue);
  } else if (isFavoritesMore) {
    // Страница избранного: свой эндпойнт, из параметров только PAGE из ссылки
    endpoint = '/get-endpoints/getMoreFavoriteItems';
    params = new URLSearchParams();
  } else if (Array.isArray(config.locationParams)) {
    params = new URLSearchParams();
    for (const name of config.locationParams) {
      const value = locationParams.get(name);
      if (value !== null) params.set(name, value);
    }
  } else {
    params = locationParams;
    params.set('URL', linkUrl.pathname);
    params.set('COUNT', 'false');

    if (linkUrl.pathname.indexOf('/brands/') !== -1) {
      params.set('BRAND', 'true');
    }
  }

  const pageFromLink = linkUrl.searchParams.get('PAGE');
  if (pageFromLink !== null) {
    params.set('PAGE', pageFromLink);
  }

  fetch(endpoint + '?' + params.toString(), {
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

      // Добавляем новые карточки в конец сетки
      let itemsGrid = null;
      for (const gridSelector of config.gridSelectors) {
        itemsGrid = document.querySelector(gridSelector);
        if (itemsGrid) break;
      }
      if (itemsGrid && typeof data.html === 'string' && data.html !== '') {
        // Запоминаем количество существующих карточек до вставки, чтобы
        // потом определить ровно те, что добавились этим вызовом.
        const beforeCount = itemsGrid.querySelectorAll(':scope > ' + config.itemSelector).length;
        itemsGrid.insertAdjacentHTML('beforeend', data.html);
        const allAfter = Array.from(itemsGrid.querySelectorAll(':scope > ' + config.itemSelector));
        const newItems = allAfter.slice(beforeCount);

        // Реинициализация подгружаемых ресурсов и UI новых карточек
        // (initScrollers / initLazyLoad / applyMobileButtonClass идемпотентны
        // относительно уже инициализированных элементов).
        if (typeof window.initScrollers === 'function') {
          window.initScrollers(itemsGrid);
        }
        // Partial wide-item fix — назначаем __wide-item только новой партии.
        // Полный safeFixAllGrids здесь не зовём: массовый appendChild и
        // переразметка существующих карточек ломают overflow-anchor на мобиле
        // и приводят к подскоку скролла вверх.
        // Идёт до постеров и lazy: постер выбирается по __wide-item, а lazy
        // должен получить уже финальный url и не грузить обложку зря.
        if (config.fixGrid && typeof window.fixNewItemsInGrid === 'function') {
          window.fixNewItemsInGrid(itemsGrid, newItems);
        }
        if (typeof window.applyPagePosters === 'function') {
          window.applyPagePosters(itemsGrid);
        }
        if (typeof window.initLazyLoad === 'function') {
          window.initLazyLoad(itemsGrid);
        }
        if (typeof window.applyMobileButtonClass === 'function') {
          window.applyMobileButtonClass(itemsGrid);
        }

        if (pageFromLink !== null) {
          trimItemsPages(config, itemsGrid, pageFromLink);
        }

        // PAGE загруженной партии — в адресную строку, без записи в историю.
        // Страница результатов поиска тоже входит: там тот же .catalog--items--more
        // и та же .items-grid, а SEARCH в адресной строке ведёт search.js — параметры не конфликтуют.
        if (config.syncPageParam && pageFromLink !== null) {
          try {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('PAGE', pageFromLink);
            window.history.replaceState(window.history.state, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
          } catch (_) {}
        }
      }

      // Модифицируем ссылку или прячем блок
      if (data.more === true) {
        const currentPage = parseInt(linkUrl.searchParams.get('PAGE'), 10) || 1;
        linkUrl.searchParams.set('PAGE', String(currentPage + 1));

        // Сохраняем относительность ссылки
        const isAbsolute = /^([a-z]+:)?\/\//i.test(originalHref);
        link.setAttribute('href', isAbsolute
          ? linkUrl.toString()
          : linkUrl.pathname + linkUrl.search + linkUrl.hash);
      } else {
        moreBlock.classList.add('__hidden');
        link.setAttribute('href', '');
      }

      // Партия загружена реальным кликом — снимаем паузу, autoload снова работает
      if (isUserClick) {
        resumeAutoload(moreBlock);
      }
    })
    .catch(() => {
      // тихо игнорируем — UI остаётся прежним
    })
    .finally(() => {
      catalogItemsMoreLoading = false;
      // После завершения запроса (если autoload не на паузе) —
      // перенастраиваем observer: кнопка могла получить новый href, потерять/получить
      // __hidden, либо просто остаться на месте — пересоздание IO заставит
      // его повторно проверить isIntersecting и при необходимости запустить
      // новый цикл анимации.
      if (!autoloadPaused) {
        setupAutoloadObserver();
      }
    });
});



/* Autoload для .catalog--items--more / .page--items--more / .brands--items--more с __autoload_NNNN:
   автоматический дозапрос следующей страницы товаров при попадании
   кнопки в viewport, после анимации заполнения за NNNN миллисекунд.

   - Класс __autoload_NNNN (где NNNN — миллисекунды) на блоке.
   - При попадании в viewport блок получает __autoloading, и ::after
     анимируется слева направо за NNNN мс (CSS var --autoload-duration).
   - По истечении срока — программный клик по ссылке (e.isTrusted=false),
     обычный обработчик клика дальше делает AJAX и обновляет href.
   - Уход блока из viewport — таймер сбрасывается, ::after скрывается;
     возврат в viewport — цикл начинается заново.
   - Пауза: блок получает __paused, autoload отключён, пока класс стоит,
     даже если анимация уже шла — следующую партию можно загрузить только кликом.
     Ставится, когда:
       - прокрутка достигла низа страницы;
       - блок зашёл в верхние 30% viewport (AUTOLOAD_PAUSE_ZONE, или проскочил выше) —
         второй IO с rootMargin -70% снизу, уход за верх viewport ловит основной IO;
         блок без размеров (__hidden) паузу не вызывает;
       - реальный клик (e.isTrusted=true) пришёлся на активную анимацию autoload.
   - Отслеживание взводится только после отрисовки сетки: у .items-grid / .page-items-grid —
     когда revealGrid ставит __wide-ready (он же вызывает setupAutoloadObserver),
     у сеток без расстановки wide (бренды) — сразу.
   - Пока идёт запрос партии (autoload или клик), observer отключён и пауза не ставится;
     после ответа он пересоздаётся и проверяет новую позицию кнопки.
   - Успешная загрузка партии реальным кликом снимает __paused и снова включает autoload.
*/

// Верхняя зона viewport в процентах: верх блока в ней — пауза autoload
const AUTOLOAD_PAUSE_ZONE = 35;

let autoloadPaused = false;
let autoloadTimer = null;
let autoloadIO = null;
let autoloadPauseIO = null;
let autoloadObservedBlock = null;

function parseAutoloadDuration(block) {
  for (const cls of block.classList) {
    const match = cls.match(/^__autoload_(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function clearAutoloadTimer() {
  if (autoloadTimer) {
    clearTimeout(autoloadTimer);
    autoloadTimer = null;
  }
}

function disarmAutoload(block) {
  clearAutoloadTimer();
  if (block) block.classList.remove('__autoloading');
}

/**
 * Пауза autoload: блок отрисован (не __hidden) и либо его верх
 * в верхних AUTOLOAD_PAUSE_ZONE процентах viewport, либо прокрутка достигла низа страницы
 */
function shouldPauseAutoload(rect) {
  if (rect.width === 0 && rect.height === 0) return false;
  const isPageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
  return isPageBottom || rect.top < window.innerHeight * AUTOLOAD_PAUSE_ZONE / 100;
}

/**
 * Сетка блока отрисована: для сеток с расстановкой wide (fixGrid) — есть __wide-ready,
 * до него карточки ещё раскладываются и позиция блока не окончательная
 */
function isAutoloadGridReady(block) {
  const config = getItemsMoreConfig(block);
  if (!config || !config.fixGrid) return true;

  for (const gridSelector of config.gridSelectors) {
    const grid = document.querySelector(gridSelector);
    if (grid) return grid.classList.contains('__wide-ready');
  }
  return true;
}

function pauseAutoload(block) {
  autoloadPaused = true;
  block.classList.add('__paused');
  stopAutoloadObserver();
}

function resumeAutoload(block) {
  autoloadPaused = false;
  block.classList.remove('__paused');
}

function armAutoload(block) {
  if (autoloadPaused) return;
  if (!block || block.classList.contains('__hidden')) return;

  const duration = parseAutoloadDuration(block);
  if (!duration || duration <= 0) return;

  // Перезапускаем анимацию ::after: снимаем класс, форсируем reflow,
  // ставим длительность в CSS-переменной и добавляем класс снова —
  // так transition стартует заново от width=0.
  disarmAutoload(block);
  block.style.setProperty('--autoload-duration', duration + 'ms');
  void block.offsetWidth;
  block.classList.add('__autoloading');

  autoloadTimer = setTimeout(() => {
    autoloadTimer = null;
    block.classList.remove('__autoloading');
    // IO доставляет записи с задержкой до кадра — перед кликом сверяем позицию сами
    if (shouldPauseAutoload(block.getBoundingClientRect())) {
      pauseAutoload(block);
      return;
    }
    const link = block.querySelector('a');
    if (link && link.getAttribute('href')) {
      link.click();
    }
  }, duration);
}

function stopAutoloadObserver() {
  if (autoloadObservedBlock) {
    disarmAutoload(autoloadObservedBlock);
  }
  if (autoloadIO) {
    autoloadIO.disconnect();
    autoloadIO = null;
  }
  if (autoloadPauseIO) {
    autoloadPauseIO.disconnect();
    autoloadPauseIO = null;
  }
  autoloadObservedBlock = null;
}

function setupAutoloadObserver() {
  if (autoloadPaused) return;

  stopAutoloadObserver();

  const block = document.querySelector(ITEMS_MORE_SELECTOR);
  if (!block) return;
  if (block.classList.contains('__hidden')) return;
  if (!parseAutoloadDuration(block)) return;
  if (!isAutoloadGridReady(block)) return;

  autoloadObservedBlock = block;

  autoloadIO = new IntersectionObserver((entries) => {
    if (autoloadPaused) return;
    for (const entry of entries) {
      if (shouldPauseAutoload(entry.boundingClientRect)) {
        pauseAutoload(entry.target);
        return;
      }
      if (entry.isIntersecting) {
        armAutoload(entry.target);
      } else {
        disarmAutoload(entry.target);
      }
    }
  });

  autoloadPauseIO = new IntersectionObserver((entries) => {
    if (autoloadPaused) return;
    for (const entry of entries) {
      if (entry.isIntersecting && shouldPauseAutoload(entry.boundingClientRect)) {
        pauseAutoload(entry.target);
        return;
      }
    }
  }, { rootMargin: '0px 0px -' + (100 - AUTOLOAD_PAUSE_ZONE) + '% 0px' });

  autoloadIO.observe(block);
  autoloadPauseIO.observe(block);
}

document.addEventListener('DOMContentLoaded', setupAutoloadObserver);



/* Мобильная панель фильтров:
   - открытие/закрытие по клику на кнопки фильтров при ширине <= 1120px;
   - панель выдвигается слева;
   - содержимое берётся из скрытых div в HTML. */

window.closeMobileFilterPanel = null;

document.addEventListener('DOMContentLoaded', () => {
  const filtersSection = document.querySelector('.catalog--filters');
  if (!filtersSection) return;
  
  let filterPanel = null;
  let activeFilterButton = null;
  let activePositionButton = null; // Видимая кнопка на десктопе (для ---filter из catalog--filters--second)
  let openedFromAllFilters = false;
  let allFiltersPanel = null; // Ссылка на панель всех фильтров
  let nestedFilterPanel = null; // Вложенная панель (открытая из all-filters)
  let panelOpenedAt = 0; // Время последнего открытия (для защиты от ложного resize на iOS)
  
  function createFilterPanel(title, content, filterTypeClass, triggerButton) {
    const panel = document.createElement('section');
    const isDesktop = window.innerWidth > 1120;
    panel.className = 'mobile-panel __scrollable' + (isDesktop ? ' __desktop-dropdown' : '');
    
    const header = document.createElement('div');
    header.className = 'mobile-panel--header';
    
    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = title;
    titleButton.setAttribute('aria-label', 'Закрыть: ' + title);
    
    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.textContent = '';
    
    header.appendChild(titleButton);
    header.appendChild(closeButton);
    
    // Описание фильтра (если есть)
    const description = triggerButton ? triggerButton.getAttribute('data-description') : null;
    let descriptionBlock = null;
    if (description) {
      descriptionBlock = document.createElement('div');
      descriptionBlock.className = 'mobile-panel--description';
      descriptionBlock.textContent = description;
    }
    
    const contentWrapper = document.createElement('div');
    let contentClasses = 'mobile-panel--content';
    if (filterTypeClass) {
      contentClasses += ' ' + filterTypeClass;
    }
    if (triggerButton && triggerButton.classList.contains('---all-filtres')) {
      contentClasses += ' __all-filters-panel';
    }
    contentWrapper.className = contentClasses;
    
    const clonedContent = content.cloneNode(true);
    
    while (clonedContent.firstChild) {
      contentWrapper.appendChild(clonedContent.firstChild);
    }
    
    // Блок с кнопками внизу панели
    const acceptClearBlock = document.createElement('div');
    acceptClearBlock.className = 'mobile-panel--accept-clear--block';
    
    const clearButton = document.createElement('button');
    clearButton.className = 'mobile-panel--clear';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Сбросить';
    clearButton.setAttribute('aria-label', 'Сбросить');
    
    const acceptButton = document.createElement('button');
    acceptButton.className = 'mobile-panel--accept';
    acceptButton.setAttribute('type', 'button');
    acceptButton.textContent = 'Применить';
    acceptButton.setAttribute('aria-label', 'Применить');
    
    acceptClearBlock.appendChild(clearButton);
    acceptClearBlock.appendChild(acceptButton);
    
    panel.appendChild(header);
    if (descriptionBlock) {
      panel.appendChild(descriptionBlock);
    }
    panel.appendChild(contentWrapper);
    panel.appendChild(acceptClearBlock);
    
    document.body.appendChild(panel);
    
    // Обработка кликов для чекбоксов в __select
    if (filterTypeClass === '__select') {
      const selectItems = contentWrapper.querySelectorAll('ul > li');
      
      function updateMarkedCount() {
        const checkedCount = contentWrapper.querySelectorAll('ul > li.__checked').length;
        contentWrapper.setAttribute('data-marked', checkedCount);
      }
      
      selectItems.forEach(item => {
        item.addEventListener('click', () => {
          item.classList.toggle('__checked');
          updateMarkedCount();
        });
      });
      
      // Начальный подсчёт
      updateMarkedCount();
    }
    
    // Обработка toggle
    if (filterTypeClass === '__toggle') {
      // Получаем текущее значение из контента
      const valueDiv = contentWrapper.querySelector('div');
      const currentValue = valueDiv ? valueDiv.textContent.trim() : 'true';
      
      // Очищаем контент и создаём переключатель
      contentWrapper.innerHTML = '';
      contentWrapper.setAttribute('data-value', currentValue);
      
      const toggleContainer = document.createElement('div');
      toggleContainer.className = '---filter-toggle' + (currentValue === '*ALL*' ? ' __all' : '');
      
      const optionAll = document.createElement('div');
      optionAll.className = '---filter-toggle--all';
      optionAll.textContent = 'Все';
      optionAll.setAttribute('data-toggle-value', '*ALL*');
      
      const optionEnabled = document.createElement('div');
      optionEnabled.className = '---filter-toggle--true';
      optionEnabled.textContent = 'Фильтровать';
      optionEnabled.setAttribute('data-toggle-value', 'true');
      
      toggleContainer.appendChild(optionAll);
      toggleContainer.appendChild(optionEnabled);
      contentWrapper.appendChild(toggleContainer);
    }
    
    // Обработка range
    if (filterTypeClass === '__range' && triggerButton) {
      const rangeMin = parseInt(triggerButton.dataset.filterRangeMin) || 0;
      const rangeMax = parseInt(triggerButton.dataset.filterRangeMax) || 100;
      const rangeType = triggerButton.dataset.filterRangeType || '';
      const rangeUnit = triggerButton.dataset.filterRangeUnit || '';
      
      // Получаем текущие значения из контента
      const fromDiv = contentWrapper.querySelector('.---filter-range--from');
      const toDiv = contentWrapper.querySelector('.---filter-range--to');
      const currentFrom = fromDiv ? parseInt(fromDiv.textContent) : rangeMin;
      const currentTo = toDiv ? parseInt(toDiv.textContent) : rangeMax;
      
      // Очищаем контент
      contentWrapper.innerHTML = '';
      contentWrapper.setAttribute('data-from', currentFrom);
      contentWrapper.setAttribute('data-to', currentTo);
      
      // Заголовок с min и max
      const headerDiv = document.createElement('div');
      headerDiv.className = '---filter-range--header' + (rangeType === 'after' ? ' __after' : '');
      if (rangeUnit) {
        headerDiv.style.setProperty('--range-unit', `"${rangeUnit}"`);
      }
      
      const minSpan = document.createElement('span');
      minSpan.className = '---filter-range--min';
      minSpan.textContent = rangeMin;
      
      const maxSpan = document.createElement('span');
      maxSpan.className = '---filter-range--max';
      maxSpan.textContent = rangeMax;
      
      headerDiv.appendChild(minSpan);
      headerDiv.appendChild(maxSpan);
      
      // Поля ввода
      const inputsDiv = document.createElement('div');
      inputsDiv.className = '---filter-range--inputs';
      
      const inputFromWrapper = document.createElement('div');
      inputFromWrapper.className = '---filter-range--input--block';
      const inputFrom = document.createElement('input');
      inputFrom.type = 'text';
      inputFrom.className = '---filter-range--input-from';
      inputFrom.value = currentFrom;
      inputFrom.setAttribute('data-raw', currentFrom);
      inputFromWrapper.appendChild(inputFrom);
      
      const inputToWrapper = document.createElement('div');
      inputToWrapper.className = '---filter-range--input--block';
      const inputTo = document.createElement('input');
      inputTo.type = 'text';
      inputTo.className = '---filter-range--input-to';
      inputTo.value = currentTo;
      inputTo.setAttribute('data-raw', currentTo);
      inputToWrapper.appendChild(inputTo);
      
      inputsDiv.appendChild(inputFromWrapper);
      inputsDiv.appendChild(inputToWrapper);
      
      // Слайдер
      const sliderDiv = document.createElement('div');
      sliderDiv.className = '---filter-range--slider';
      
      const sliderTrack = document.createElement('div');
      sliderTrack.className = '---filter-range--track';
      
      const sliderRange = document.createElement('div');
      sliderRange.className = '---filter-range--active';
      
      const thumbFrom = document.createElement('div');
      thumbFrom.className = '---filter-range--thumb-from';
      
      const thumbTo = document.createElement('div');
      thumbTo.className = '---filter-range--thumb-to';
      
      sliderDiv.appendChild(sliderTrack);
      sliderDiv.appendChild(sliderRange);
      sliderDiv.appendChild(thumbFrom);
      sliderDiv.appendChild(thumbTo);
      
      contentWrapper.appendChild(headerDiv);
      contentWrapper.appendChild(sliderDiv);
      contentWrapper.appendChild(inputsDiv);
      
      // Функция обновления слайдера
      function updateSlider() {
        const fromVal = parseInt(inputFrom.getAttribute('data-raw')) || rangeMin;
        const toVal = parseInt(inputTo.getAttribute('data-raw')) || rangeMax;
        const fromPercent = ((fromVal - rangeMin) / (rangeMax - rangeMin)) * 100;
        const toPercent = ((toVal - rangeMin) / (rangeMax - rangeMin)) * 100;
        
        thumbFrom.style.left = fromPercent + '%';
        thumbTo.style.left = toPercent + '%';
        sliderRange.style.left = fromPercent + '%';
        sliderRange.style.width = (toPercent - fromPercent) + '%';
        
        minSpan.textContent = fromVal;
        maxSpan.textContent = toVal;
        
        contentWrapper.setAttribute('data-from', fromVal);
        contentWrapper.setAttribute('data-to', toVal);
      }
      
      // Функция обновления инпута из слайдера
      function updateInputFromSlider(input, value) {
        input.setAttribute('data-raw', value);
        input.value = value;
      }
      
      // Обработка ввода (цифры и минус)
      function handleInput(e) {
        const input = e.target;
        const value = input.value;
        const isNegative = value.startsWith('-');
        const raw = value.replace(/[^\d]/g, '');
        const num = (parseInt(raw) || 0) * (isNegative ? -1 : 1);
        input.setAttribute('data-raw', num);
      }
      
      // Обработка blur - ограничения и обновление слайдера
      function handleBlurFrom(e) {
        let num = parseInt(inputFrom.getAttribute('data-raw')) || 0;
        const toVal = parseInt(inputTo.getAttribute('data-raw')) || rangeMax;
        
        if (num < rangeMin) num = rangeMin;
        if (num > toVal) num = toVal;
        
        inputFrom.setAttribute('data-raw', num);
        inputFrom.value = num;
        updateSlider();
      }
      
      function handleBlurTo(e) {
        let num = parseInt(inputTo.getAttribute('data-raw')) || 0;
        const fromVal = parseInt(inputFrom.getAttribute('data-raw')) || rangeMin;
        
        if (num > rangeMax) num = rangeMax;
        if (num < fromVal) num = fromVal;
        
        inputTo.setAttribute('data-raw', num);
        inputTo.value = num;
        updateSlider();
      }
      
      function handleKeydown(e) {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      }
      
      inputFrom.addEventListener('input', handleInput);
      inputFrom.addEventListener('blur', handleBlurFrom);
      inputFrom.addEventListener('keydown', handleKeydown);
      inputTo.addEventListener('input', handleInput);
      inputTo.addEventListener('blur', handleBlurTo);
      inputTo.addEventListener('keydown', handleKeydown);
      
      // Drag для ползунков
      function setupThumbDrag(thumb, isFrom) {
        let isDragging = false;
        
        function onMove(e) {
          if (!isDragging) return;
          e.preventDefault();
          
          const rect = sliderDiv.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          let percent = ((clientX - rect.left) / rect.width) * 100;
          percent = Math.max(0, Math.min(100, percent));
          
          const value = Math.round(rangeMin + (percent / 100) * (rangeMax - rangeMin));
          
          if (isFrom) {
            const toVal = parseInt(inputTo.getAttribute('data-raw')) || rangeMax;
            if (value <= toVal) {
              updateInputFromSlider(inputFrom, value);
              updateSlider();
            }
          } else {
            const fromVal = parseInt(inputFrom.getAttribute('data-raw')) || rangeMin;
            if (value >= fromVal) {
              updateInputFromSlider(inputTo, value);
              updateSlider();
            }
          }
        }
        
        function onEnd() {
          isDragging = false;
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onEnd);
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onEnd);
        }
        
        function onStart(e) {
          isDragging = true;
          e.preventDefault();
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onEnd);
          document.addEventListener('touchmove', onMove, { passive: false });
          document.addEventListener('touchend', onEnd);
        }
        
        thumb.addEventListener('mousedown', onStart);
        thumb.addEventListener('touchstart', onStart, { passive: false });
      }
      
      setupThumbDrag(thumbFrom, true);
      setupThumbDrag(thumbTo, false);
      
      // Инициализация слайдера
      updateSlider();
    }
    
    return panel;
  }
  
  // Позиционирует десктопную панель под кнопкой с зазором 20px от правого края экрана
  function positionDesktopFilterPanel(panel, button) {
    const buttonRect = button.getBoundingClientRect();
    const viewportGap = 20;
    panel.style.top = buttonRect.bottom + 'px';

    const panelWidth = panel.getBoundingClientRect().width;
    const maxLeft = window.innerWidth - panelWidth - viewportGap;
    panel.style.left = Math.min(buttonRect.left, maxLeft) + 'px';
  }

  function openFilterPanel(title, content, triggerButton, pageFilterId = null, positionButton = null) {
    const isDesktop = window.innerWidth > 1120;
    const buttonForPosition = positionButton || triggerButton;
    
    // Если есть вложенная панель - закрываем её (сохраняем данные в allFiltersPanel)
    if (nestedFilterPanel) {
      const filterId = nestedFilterPanel.getAttribute('data-filter-id');
      if (filterId && allFiltersPanel) {
        saveFilterDataToContainer(nestedFilterPanel, allFiltersPanel, filterId);
        updateFilterActiveState(filterId, true, allFiltersPanel);
      }
      nestedFilterPanel.remove();
      nestedFilterPanel = null;
      openedFromAllFilters = false;
      
      // Показываем контент all-filters-panel обратно
      if (isDesktop && allFiltersPanel) {
        allFiltersPanel.classList.remove('__content-hidden');
      }
    }
    
    // Если есть all-filters-panel - синхронизируем в источник и закрываем
    if (filterPanel && filterPanel.classList.contains('__all-filters-panel')) {
      syncAllFiltersToSource(filterPanel);
      updateAllFiltersActiveState(false, null);
      
      if (activeFilterButton) {
        activeFilterButton.classList.remove('__filter-opened');
      }
      if (activePositionButton) {
        activePositionButton.classList.remove('__filter-opened');
        activePositionButton = null;
      }
      filterPanel.remove();
      filterPanel = null;
      activeFilterButton = null;
      allFiltersPanel = null;
    }
    
    // Если панель уже открыта (обычная, не all-filters)
    if (filterPanel) {
      // На десктопе - закрываем текущую и открываем новую (если это другая кнопка)
      if (isDesktop) {
        const currentFilterId = filterPanel.getAttribute('data-filter-id');
        const newFilterId = pageFilterId || (triggerButton && triggerButton.dataset.filterId);
        
        // Если кликнули на ту же кнопку - просто закрываем
        if (currentFilterId === newFilterId) {
          closeFilterPanel();
          return;
        }
        
        // Мгновенно удаляем текущую панель
        if (activeFilterButton) {
          activeFilterButton.classList.remove('__filter-opened');
        }
        if (activePositionButton) {
          activePositionButton.classList.remove('__filter-opened');
          activePositionButton = null;
        }
        filterPanel.remove();
        filterPanel = null;
      } else {
        return;
      }
    }
    
    // Закрываем другие панели
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    if (typeof window.closeMobileOrderByPanel === 'function') {
      window.closeMobileOrderByPanel();
    }
    
    if (typeof window.closeMobileSubmenuPanels === 'function') {
      window.closeMobileSubmenuPanels();
    }
    
    if (typeof window.closeMobileSearchPanel === 'function') {
      window.closeMobileSearchPanel();
    }
    
    // Закрываем мобильное меню если открыто (только на мобиле)
    if (!isDesktop) {
      const mobileMenuButton = document.getElementById('mobile-menu');
      const topMenu = document.querySelector('.header--top-menu');
      if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
        mobileMenuButton.click();
      }
      
      window.lockScroll();
    }
    
    // Отмечаем активную кнопку
    activeFilterButton = triggerButton;
    if (activeFilterButton) {
      activeFilterButton.classList.add('__filter-opened');
    }
    
    // На десктопе также отмечаем видимую кнопку (если это другая кнопка)
    if (isDesktop && positionButton && positionButton !== triggerButton) {
      positionButton.classList.add('__filter-opened');
      activePositionButton = positionButton;
    } else {
      activePositionButton = null;
    }
    
    // Получаем тип фильтра из атрибута filter-type
    let filterTypeClass = null;
    if (triggerButton) {
      const filterType = triggerButton.dataset.filterType;
      if (filterType) {
        filterTypeClass = '__' + filterType;
      }
    }
    
    filterPanel = createFilterPanel(title, content, filterTypeClass, triggerButton);
    
    // Записываем id кнопки и тип фильтра в панель
    // Если передан pageFilterId - используем его (для фильтров из catalog--filters--second)
    const idToStore = pageFilterId || (triggerButton && triggerButton.dataset.filterId);
    if (idToStore) {
      filterPanel.setAttribute('data-filter-id', idToStore);
    }
    if (filterTypeClass) {
      filterPanel.setAttribute('data-filter-type', filterTypeClass);
    }
    
    // Добавляем спецкласс для панели всех фильтров
    if (triggerButton && triggerButton.classList.contains('---all-filtres')) {
      filterPanel.classList.add('__all-filters-panel');
      
      // Определяем __active для всех фильтров в панели на основе данных из клона
      updateAllFiltersActiveState(true, filterPanel);
    }
    
    // Отмечаем если панель открыта из all-filters
    if (openedFromAllFilters) {
      filterPanel.setAttribute('data-opened-from-all-filters', 'true');
    }
    
    // На десктопе позиционируем панель под кнопкой
    if (isDesktop && buttonForPosition) {
      positionDesktopFilterPanel(filterPanel, buttonForPosition);
    }
    
    // Для защиты от ложного resize на iOS при lockScroll
    panelOpenedAt = Date.now();

    filterPanel.classList.add('__active');
  }
  
  // Сохраняет данные из панели в указанный контейнер (клон или источник).
  // Если container — это источник (---all-filtres--block) и происходит фактическое изменение,
  // помечаем filtersChanged=true, чтобы fetchFilteredCatalogItems сделал запрос.
  function saveFilterDataToContainer(panel, container, allFilterId) {
    const panelFilterType = panel.getAttribute('data-filter-type');
    const contentWrapper = panel.querySelector('.mobile-panel--content');
    if (!contentWrapper || !container) return;
    
    const targetFilterButton = container.querySelector(`[data-filter-id="${allFilterId}"]`);
    if (!targetFilterButton) return;
    
    const targetLi = targetFilterButton.closest('li');
    if (!targetLi) return;
    
    const targetData = targetLi.querySelector('.mobile-panel--filter-data');
    if (!targetData) return;
    
    const isSource = container.classList.contains('---all-filtres--block');
    
    if (panelFilterType === '__select') {
      // Для select - отмечаем выбранные li по data-key
      const checkedItems = contentWrapper.querySelectorAll('ul > li.__checked');
      const checkedKeys = new Set();
      checkedItems.forEach(item => {
        const key = item.dataset.key;
        if (key) checkedKeys.add(key);
      });
      
      // Обновляем li в целевом контейнере.
      // Gray li (__gray, отрицательный data-key) — если пользователь снял галочку,
      // удаляем их полностью: эти значения пришли из URL и должны исчезнуть из списка,
      // если их сняли. Обычные li просто получают/теряют __checked.
      const targetLis = targetData.querySelectorAll('ul > li');
      targetLis.forEach(li => {
        const key = li.dataset.key;
        const isChecked = checkedKeys.has(key);
        const wasChecked = li.classList.contains('__checked');
        
        if (isChecked) {
          if (!wasChecked) {
            li.classList.add('__checked');
            if (isSource) filtersChanged = true;
          }
        } else {
          if (wasChecked) {
            li.classList.remove('__checked');
            if (isSource) filtersChanged = true;
          }
          if (li.classList.contains('__gray')) {
            // Удаление gray li из источника — это тоже изменение
            li.remove();
            if (isSource) filtersChanged = true;
          }
        }
      });
    } else if (panelFilterType === '__range') {
      // Для range - сравниваем числовые значения (а не сырые строки), чтобы пробелы/лидирующие нули
      // в textContent не вызывали ложное определение изменения при закрытии панели без фактических изменений.
      const currentFrom = parseInt(contentWrapper.getAttribute('data-from'));
      const currentTo = parseInt(contentWrapper.getAttribute('data-to'));
      
      const fromDiv = targetData.querySelector('.---filter-range--from');
      const toDiv = targetData.querySelector('.---filter-range--to');
      
      if (fromDiv && !isNaN(currentFrom)) {
        const sourceFrom = parseInt(fromDiv.textContent);
        if (sourceFrom !== currentFrom) {
          fromDiv.textContent = String(currentFrom);
          if (isSource) filtersChanged = true;
        }
      }
      if (toDiv && !isNaN(currentTo)) {
        const sourceTo = parseInt(toDiv.textContent);
        if (sourceTo !== currentTo) {
          toDiv.textContent = String(currentTo);
          if (isSource) filtersChanged = true;
        }
      }
    } else if (panelFilterType === '__toggle') {
      // Для toggle - сравниваем триммированные значения, чтобы пробелы/переносы в textContent источника
      // не вызывали ложное определение изменения при закрытии панели без фактических изменений.
      const toggleValue = (contentWrapper.getAttribute('data-value') || '').trim();
      const valueDiv = targetData.querySelector('div');
      
      if (valueDiv && toggleValue) {
        const sourceValue = (valueDiv.textContent || '').trim();
        if (sourceValue !== toggleValue) {
          valueDiv.textContent = toggleValue;
          if (isSource) filtersChanged = true;
        }
      }
    }
  }
  
  // Синхронизирует данные из клона all-filters-panel в источник ---all-filtres--block
  function syncAllFiltersToSource(clonePanel) {
    const allFiltersBlock = document.querySelector('.---all-filtres--block');
    if (!allFiltersBlock || !clonePanel) return;
    
    const cloneFilterButtons = clonePanel.querySelectorAll('.---filter[data-filter-id]');
    
    cloneFilterButtons.forEach(cloneButton => {
      const allFilterId = cloneButton.dataset.filterId;
      const sourceButton = allFiltersBlock.querySelector(`[data-filter-id="${allFilterId}"]`);
      if (!sourceButton) return;
      
      const filterType = cloneButton.dataset.filterType;
      const cloneLi = cloneButton.closest('li');
      const sourceLi = sourceButton.closest('li');
      if (!cloneLi || !sourceLi) return;
      
      const cloneData = cloneLi.querySelector('.mobile-panel--filter-data');
      const sourceData = sourceLi.querySelector('.mobile-panel--filter-data');
      if (!cloneData || !sourceData) return;
      
      if (filterType === 'select') {
        // Синхронизируем __checked по data-key.
        // Gray li (__gray) — если в клоне его уже нет или он не __checked,
        // удаляем и из источника. Эти значения пришли из URL и должны исчезнуть, если их сняли.
        const checkedKeys = new Set();
        cloneData.querySelectorAll('ul > li.__checked').forEach(item => {
          const key = item.dataset.key;
          if (key) checkedKeys.add(key);
        });
        
        sourceData.querySelectorAll('ul > li').forEach(li => {
          const key = li.dataset.key;
          const isChecked = checkedKeys.has(key);
          const wasChecked = li.classList.contains('__checked');
          
          if (isChecked) {
            if (!wasChecked) {
              li.classList.add('__checked');
              filtersChanged = true;
            }
          } else {
            if (wasChecked) {
              li.classList.remove('__checked');
              filtersChanged = true;
            }
            if (li.classList.contains('__gray')) {
              li.remove();
              filtersChanged = true;
            }
          }
        });
      } else if (filterType === 'range') {
        // Синхронизируем значения from/to. Сравниваем числовые значения, чтобы пробелы/лидирующие
        // нули в textContent не помечали фильтры как изменённые.
        const cloneFrom = cloneData.querySelector('.---filter-range--from');
        const cloneTo = cloneData.querySelector('.---filter-range--to');
        const sourceFrom = sourceData.querySelector('.---filter-range--from');
        const sourceTo = sourceData.querySelector('.---filter-range--to');
        
        if (cloneFrom && sourceFrom) {
          const cloneFromNum = parseInt(cloneFrom.textContent);
          const sourceFromNum = parseInt(sourceFrom.textContent);
          if (!isNaN(cloneFromNum) && cloneFromNum !== sourceFromNum) {
            sourceFrom.textContent = String(cloneFromNum);
            filtersChanged = true;
          }
        }
        if (cloneTo && sourceTo) {
          const cloneToNum = parseInt(cloneTo.textContent);
          const sourceToNum = parseInt(sourceTo.textContent);
          if (!isNaN(cloneToNum) && cloneToNum !== sourceToNum) {
            sourceTo.textContent = String(cloneToNum);
            filtersChanged = true;
          }
        }
      } else if (filterType === 'toggle') {
        // Синхронизируем значение тоггла. Сравниваем триммированные значения, чтобы пробелы/переносы
        // в textContent не помечали фильтры как изменённые.
        const cloneValue = cloneData.querySelector('div');
        const sourceValue = sourceData.querySelector('div');
        
        if (cloneValue && sourceValue) {
          const cloneTrimmed = (cloneValue.textContent || '').trim();
          const sourceTrimmed = (sourceValue.textContent || '').trim();
          if (cloneTrimmed !== sourceTrimmed) {
            sourceValue.textContent = cloneTrimmed;
            filtersChanged = true;
          }
        }
      }
    });
  }
  
  // Проверяет активен ли фильтр, читая данные из mobile-panel--filter-data
  // container - необязательный параметр, если не передан - используем источник ---all-filtres--block
  function isFilterActive(allFilterId, container = null) {
    const targetContainer = container || document.querySelector('.---all-filtres--block');
    if (!targetContainer) return false;
    
    const filterButton = targetContainer.querySelector(`[data-filter-id="${allFilterId}"]`);
    if (!filterButton) return false;
    
    const filterType = filterButton.dataset.filterType;
    const targetLi = filterButton.closest('li');
    if (!targetLi) return false;
    
    const targetData = targetLi.querySelector('.mobile-panel--filter-data');
    if (!targetData) return false;
    
    if (filterType === 'select') {
      // Проверяем есть ли выбранные li
      const checkedCount = targetData.querySelectorAll('ul > li.__checked').length;
      return checkedCount > 0;
    } else if (filterType === 'range') {
      // Проверяем отличаются ли значения от min/max
      const rangeMin = parseInt(filterButton.dataset.filterRangeMin) || 0;
      const rangeMax = parseInt(filterButton.dataset.filterRangeMax) || 100;
      
      const fromDiv = targetData.querySelector('.---filter-range--from');
      const toDiv = targetData.querySelector('.---filter-range--to');
      
      const currentFrom = fromDiv ? parseInt(fromDiv.textContent) : rangeMin;
      const currentTo = toDiv ? parseInt(toDiv.textContent) : rangeMax;
      
      return currentFrom !== rangeMin || currentTo !== rangeMax;
    } else if (filterType === 'toggle') {
      // Проверяем значение toggle
      const valueDiv = targetData.querySelector('div');
      const value = valueDiv ? valueDiv.textContent.trim() : '*ALL*';
      return value === 'true';
    }
    
    return false;
  }
  
  // Сбрасывает данные фильтра в mobile-panel--filter-data.
  // container - необязательный параметр, если не передан - используем источник ---all-filtres--block.
  // Если container — это источник и происходит фактическое изменение, ставим filtersChanged=true.
  function clearFilterData(allFilterId, container = null) {
    const targetContainer = container || document.querySelector('.---all-filtres--block');
    if (!targetContainer) return;
    
    const filterButton = targetContainer.querySelector(`[data-filter-id="${allFilterId}"]`);
    if (!filterButton) return;
    
    const filterType = filterButton.dataset.filterType;
    const targetLi = filterButton.closest('li');
    if (!targetLi) return;
    
    const targetData = targetLi.querySelector('.mobile-panel--filter-data');
    if (!targetData) return;
    
    const isSource = targetContainer.classList.contains('---all-filtres--block');
    
    if (filterType === 'select') {
      // Убираем __checked со всех li
      const checkedItems = targetData.querySelectorAll('ul > li.__checked');
      checkedItems.forEach(item => {
        item.classList.remove('__checked');
        if (isSource) filtersChanged = true;
      });
    } else if (filterType === 'range') {
      // Сбрасываем значения на min/max
      const rangeMin = filterButton.dataset.filterRangeMin || '0';
      const rangeMax = filterButton.dataset.filterRangeMax || '100';
      
      const fromDiv = targetData.querySelector('.---filter-range--from');
      const toDiv = targetData.querySelector('.---filter-range--to');
      
      if (fromDiv && fromDiv.textContent !== rangeMin) {
        fromDiv.textContent = rangeMin;
        if (isSource) filtersChanged = true;
      }
      if (toDiv && toDiv.textContent !== rangeMax) {
        toDiv.textContent = rangeMax;
        if (isSource) filtersChanged = true;
      }
    } else if (filterType === 'toggle') {
      // Устанавливаем значение *ALL*
      const valueDiv = targetData.querySelector('div');
      if (valueDiv && valueDiv.textContent !== '*ALL*') {
        valueDiv.textContent = '*ALL*';
        if (isSource) filtersChanged = true;
      }
    }
  }
  
  // Обновляет состояние __active для ---filter-clear на основе данных фильтра
  // isNested = true: обновляем внутри __all-filters-panel (клона)
  // isNested = false: обновляем на странице (в catalog--filters--second)
  function updateFilterActiveState(filterId, isNested = false, targetPanel = null) {
    // Читаем данные из соответствующего контейнера:
    // - для nested-panel: из клона (targetPanel)
    // - для простой панели: из источника (---all-filtres--block)
    const shouldBeActive = isFilterActive(filterId, isNested ? targetPanel : null);
    
    if (isNested && targetPanel) {
      // Для __nested-panel - обновляем ---filter-clear внутри __all-filters-panel (клона)
      const filterButton = targetPanel.querySelector(`[data-filter-id="${filterId}"]`);
      if (filterButton) {
        const li = filterButton.closest('li');
        if (li) {
          const clearButton = li.querySelector('.---filter-clear');
          if (clearButton) {
            if (shouldBeActive) {
              clearButton.classList.add('__active');
            } else {
              clearButton.classList.remove('__active');
            }
          }
        }
      }
    } else {
      // Для простой панели - обновляем ---filter-clear на странице (в catalog--filters--second)
      const secondFilters = document.querySelector('.catalog--filters--second');
      if (secondFilters) {
        const filterButton = secondFilters.querySelector(`[data-filter-id="${filterId}"]`);
        if (filterButton) {
          const li = filterButton.closest('li');
          if (li) {
            const clearButton = li.querySelector('.---filter-clear');
            if (clearButton) {
              if (shouldBeActive) {
                clearButton.classList.add('__active');
              } else {
                clearButton.classList.remove('__active');
              }
            }
          }
        }
      }
      
      // Обновляем состояние ---filter-clear-all--block и badge
      updateClearAllBlockState();
      updateAllFiltersBadge();
      updateUrlFromFilters();
    }
  }
  
  // Обновляет состояние ---filter-clear-all--block на основе данных из mobile-panel--filter-data
  function updateClearAllBlockState() {
    const clearAllBlock = document.querySelector('.---filter-clear-all--block');
    if (!clearAllBlock) return;
    
    // Проверяем есть ли хоть один активный фильтр на основе данных
    const hasActiveFilter = countActiveFilters() > 0;
    
    if (hasActiveFilter) {
      clearAllBlock.classList.add('__active');
      clearAllBlock.classList.remove('__disactivated');
    } else {
      clearAllBlock.classList.remove('__active');
      clearAllBlock.classList.add('__disactivated');
    }
  }
  
  // Обновляет состояние __active для всех фильтров на основе данных
  // isNested = true: обновляем внутри переданного контейнера (клона __all-filters-panel)
  // isNested = false: обновляем на странице (в catalog--filters--second) на основе данных из ---all-filtres--block
  // writeUrl = false подавляет вызов updateUrlFromFilters (используется при инициализации
  // из URL, когда мы не хотим затереть невалидные GET-параметры, которые могут пригодиться
  // при возврате на страницу, где эти фильтры существуют).
  function updateAllFiltersActiveState(isNested = false, targetPanel = null, writeUrl = true) {
    // Определяем откуда читать данные и где обновлять __active
    const dataContainer = isNested ? targetPanel : document.querySelector('.---all-filtres--block');
    const uiContainer = isNested ? targetPanel : document.querySelector('.catalog--filters--second');
    
    if (!dataContainer || !uiContainer) return;
    
    // Находим все кнопки фильтров в контейнере данных
    const filterButtons = dataContainer.querySelectorAll('.---filter[data-filter-id]');
    
    filterButtons.forEach(filterButton => {
      const filterId = filterButton.dataset.filterId;
      const shouldBeActive = isFilterActive(filterId, dataContainer);
      
      // Находим соответствующую кнопку очистки в UI-контейнере
      const uiFilterButton = uiContainer.querySelector(`[data-filter-id="${filterId}"]`);
      if (uiFilterButton) {
        const li = uiFilterButton.closest('li');
        if (li) {
          const clearButton = li.querySelector('.---filter-clear');
          if (clearButton) {
            if (shouldBeActive) {
              clearButton.classList.add('__active');
            } else {
              clearButton.classList.remove('__active');
            }
          }
        }
      }
    });
    
    // Для страницы также обновляем ---filter-clear-all--block и badge
    if (!isNested) {
      updateClearAllBlockState();
      updateAllFiltersBadge();
      if (writeUrl) updateUrlFromFilters();
    }
  }
  
  // Считает количество активных фильтров на основе данных из контейнера
  function countActiveFilters(container = null) {
    const targetContainer = container || document.querySelector('.---all-filtres--block');
    if (!targetContainer) return 0;
    
    const filterButtons = targetContainer.querySelectorAll('.---filter[data-filter-id]');
    let count = 0;
    
    filterButtons.forEach(filterButton => {
      if (isFilterActive(filterButton.dataset.filterId, targetContainer)) {
        count++;
      }
    });
    
    return count;
  }
  
  // Обновляет badge на кнопке ---all-filtres на основе данных из mobile-panel--filter-data
  function updateAllFiltersBadge() {
    const allFiltresButton = document.querySelector('.---all-filtres');
    if (!allFiltresButton) return;
    
    // Считаем активные фильтры на основе данных из источника
    const activeCount = countActiveFilters();
    
    if (activeCount > 0) {
      allFiltresButton.classList.add('__has-badge');
      allFiltresButton.style.setProperty('--badge-content', `'${activeCount}'`);
    } else {
      allFiltresButton.classList.remove('__has-badge');
    }
  }
  
  // Обновляет адресную строку GET-параметрами на основе данных из ---all-filtres--block.
  // Каждый фильтр - отдельный get-параметр, ключ берётся из data-filter-id.
  // Значение для URL — это видимый текст li (а не data-key), для тильды/точки выбраны
  // незарезервированные символы по RFC 3986, чтобы не было %2C / %7E в адресной строке.
  // Тип фильтра определяется data-filter-type:
  //   - toggle: записываем 'true' если значение true, иначе удаляем параметр
  //   - range: записываем '[значение_от]~[значение_до]' если отличается от min/max, иначе удаляем
  //   - select: записываем выбранные значения через точку, если выбраны; иначе удаляем
  function updateUrlFromFilters() {
    const allFiltersBlock = document.querySelector('.---all-filtres--block');
    if (!allFiltersBlock) return;
    
    let url;
    try {
      url = new URL(window.location.href);
    } catch (_) {
      return;
    }
    
    const filterButtons = allFiltersBlock.querySelectorAll('.---filter[data-filter-id]');
    
    filterButtons.forEach(filterButton => {
      const filterId = filterButton.dataset.filterId;
      const filterType = filterButton.dataset.filterType;
      if (!filterId || !filterType) return;
      
      const li = filterButton.closest('li');
      if (!li) return;
      
      const filterData = li.querySelector('.mobile-panel--filter-data');
      if (!filterData) return;
      
      if (filterType === 'select') {
        const checkedItems = filterData.querySelectorAll('ul > li.__checked');
        const values = [];
        checkedItems.forEach(item => {
          const value = item.textContent.trim();
          if (value) values.push(value);
        });
        
        if (values.length > 0) {
          url.searchParams.set(filterId, values.join('.'));
        } else {
          url.searchParams.delete(filterId);
        }
      } else if (filterType === 'range') {
        const rangeMin = parseInt(filterButton.dataset.filterRangeMin) || 0;
        const rangeMax = parseInt(filterButton.dataset.filterRangeMax) || 100;
        
        const fromDiv = filterData.querySelector('.---filter-range--from');
        const toDiv = filterData.querySelector('.---filter-range--to');
        
        const currentFrom = fromDiv ? parseInt(fromDiv.textContent) : rangeMin;
        const currentTo = toDiv ? parseInt(toDiv.textContent) : rangeMax;
        
        if (currentFrom !== rangeMin || currentTo !== rangeMax) {
          url.searchParams.set(filterId, `${currentFrom}~${currentTo}`);
        } else {
          url.searchParams.delete(filterId);
        }
      } else if (filterType === 'toggle') {
        const valueDiv = filterData.querySelector('div');
        const value = valueDiv ? valueDiv.textContent.trim() : '*ALL*';
        
        if (value === 'true') {
          url.searchParams.set(filterId, 'true');
        } else {
          url.searchParams.delete(filterId);
        }
      }
    });
    
    try {
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (_) {}
    
    // Подтягиваем отфильтрованные товары с сервера (count + html карточек)
    fetchFilteredCatalogItems();
  }
  
  // Убирает PAGE из адресной строки (его пишет обработчик "Показать ещё").
  // Любой перезапрос сетки по фильтрам или сортировке возвращает её к первой
  // странице, так что накопленный PAGE становится неактуальным.
  function deletePageParamFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('PAGE')) return;
      url.searchParams.delete('PAGE');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  }
  
  // Удаляет кнопку возврата на предыдущую страницу каталога: сетка заменяется
  // первой страницей, и переход "назад" по накопленному PAGE теряет смысл.
  function removeCatalogItemsBackButton() {
    const backButton = document.querySelector('.catalog--items--back');
    if (backButton) {
      backButton.remove();
    }
  }
  
  /**
   * Флаг фактического изменения источника фильтров/сортировки.
   * Ставится в true внутри функций, которые модифицируют ---all-filtres--block
   * (saveFilterDataToContainer / syncAllFiltersToSource / clearFilterData для источника,
   * а также source-блок order-by) — только если реально что-то поменялось.
   * Сбрасывается в false внутри fetchFilteredCatalogItems после старта запроса.
   */
  let filtersChanged = false;
  
  // Помечает что в источнике произошло реальное изменение. Вызывается из мест
  // мутации source-DOM, в т.ч. из внешних DOMContentLoaded-блоков через window.markFiltersChanged.
  function markFiltersChanged() {
    filtersChanged = true;
  }
  
  // Прокручивает страницу так, чтобы верх .catalog--filters оказался на уровне --header-main-height.
  // Работает только когда .catalog--filters в sticky-режиме (__sticky-filters) — это значит
  // пользователь уже прокрутил страницу вниз настолько, что естественная позиция фильтров
  // ушла за пределы экрана. В этом случае берём rect плейсхолдера (он занимает место фильтров в
  // потоке документа) и скроллим к нему.
  //
  // На мобиле в close-функциях панелей body заблокирован через lockScroll (position: fixed + top: -X):
  // прямой scrollTo не работает, и unlockScroll в конце close-функции всё равно вызовет
  // window.scrollTo(0, restorePosition). Поэтому вместо собственного scrollTo переписываем
  // restorePosition через window.setLockedScrollPosition — unlockScroll сам прокрутит куда нужно.
  function scrollToCatalogFiltersTop() {
    const filters = document.querySelector('.catalog--filters');
    if (!filters) return;
    
    // Скроллим только если фильтры сейчас sticky (пользователь прокрутил вниз)
    if (!filters.classList.contains('__sticky-filters')) return;
    
    const placeholder = document.querySelector('.catalog--filters-placeholder');
    if (!placeholder) return;
    
    const headerHeightRaw = getComputedStyle(document.documentElement).getPropertyValue('--header-main-height');
    const headerHeight = parseFloat(headerHeightRaw) || 60;
    
    const rect = placeholder.getBoundingClientRect();
    
    // Body заблокирован (мобильная панель открыта) - передаём целевую позицию в unlockScroll.
    // body имеет position: fixed; top: -X, где X - изначальная scrollY на момент lockScroll.
    // Реальная позиция плейсхолдера в документе = X + rect.top.
    if (document.body.classList.contains('__mobile-menu-open')) {
      const bodyTop = parseFloat(document.body.style.top) || 0;
      const lockedScrollY = -bodyTop;
      const target = Math.max(0, lockedScrollY + rect.top - headerHeight);
      
      if (typeof window.setLockedScrollPosition === 'function') {
        window.setLockedScrollPosition(target);
      }
      return;
    }
    
    // Body не заблокирован (десктоп) - скроллим напрямую
    const currentScroll = window.scrollY || window.pageYOffset || 0;
    const target = Math.max(0, currentScroll + rect.top - headerHeight);
    window.scrollTo({ top: target, behavior: 'smooth' });
  }
  
  /**
   * Запрос отфильтрованных товаров каталога
   * Собирает текущие фильтры и SORT из ---all-filtres--block (источника), вызывает
   * GET /get-endpoints/getFitredCatalogItems и обновляет .catalog--filters--main--counter
   * и .items-grid.
   *
   * Отличия от updateUrlFromFilters при сборке параметров:
   *   - __gray li (значения, пришедшие из URL и отсутствующие в базовом списке) пропускаем,
   *     т.к. на бэкенде их в базе нет и они только дадут пустой результат;
   *   - SORT добавляется отдельно из .mobile-panel--order-by если он отличается от
   *     значения по умолчанию ('3');
   *   - BRAND = true добавляется, если window.location.pathname содержит /brands/.
   *
   * URL для запроса — window.location.pathname (без хоста и query).
   *
   * Запрос делается только если filtersChanged=true (т.е. была фактическая
   * модификация источника). Открытие/закрытие панели без изменений не дёргает сервер.
   */
  let filteredItemsAbortController = null;
  function fetchFilteredCatalogItems() {
    if (!filtersChanged) return;
    filtersChanged = false;
    
    // Сетка будет заменена первой страницей — сбрасываем PAGE.
    // Место общее для всех вызовов: смена фильтров, смена и сброс сортировки
    deletePageParamFromUrl();
    removeCatalogItemsBackButton();
    
    const allFiltersBlock = document.querySelector('.---all-filtres--block');
    if (!allFiltersBlock) return;
    
    const params = new URLSearchParams();
    params.set('URL', window.location.pathname);
    
    // Фильтры из источника
    const filterButtons = allFiltersBlock.querySelectorAll('.---filter[data-filter-id]');
    filterButtons.forEach(filterButton => {
      const filterId = filterButton.dataset.filterId;
      const filterType = filterButton.dataset.filterType;
      if (!filterId || !filterType) return;
      
      const li = filterButton.closest('li');
      if (!li) return;
      
      const filterData = li.querySelector('.mobile-panel--filter-data');
      if (!filterData) return;
      
      if (filterType === 'select') {
        // __gray li пропускаем — значения из URL, которых нет в базовом списке
        const checkedItems = filterData.querySelectorAll('ul > li.__checked:not(.__gray)');
        const values = [];
        checkedItems.forEach(item => {
          const value = item.textContent.trim();
          if (value) values.push(value);
        });
        if (values.length > 0) {
          params.set(filterId, values.join('.'));
        }
      } else if (filterType === 'range') {
        const rangeMin = parseInt(filterButton.dataset.filterRangeMin) || 0;
        const rangeMax = parseInt(filterButton.dataset.filterRangeMax) || 100;
        
        const fromDiv = filterData.querySelector('.---filter-range--from');
        const toDiv = filterData.querySelector('.---filter-range--to');
        
        const currentFrom = fromDiv ? parseInt(fromDiv.textContent) : rangeMin;
        const currentTo = toDiv ? parseInt(toDiv.textContent) : rangeMax;
        
        if (currentFrom !== rangeMin || currentTo !== rangeMax) {
          params.set(filterId, `${currentFrom}~${currentTo}`);
        }
      } else if (filterType === 'toggle') {
        const valueDiv = filterData.querySelector('div');
        const value = valueDiv ? valueDiv.textContent.trim() : '*ALL*';
        if (value === 'true') {
          params.set(filterId, 'true');
        }
      }
    });
    
    // SORT — берём из источника order-by, добавляем только если отличается от '3' (по умолчанию)
    const sourceOrderBy = allFiltersBlock.querySelector('.mobile-panel--order-by');
    if (sourceOrderBy) {
      const checkedSort = sourceOrderBy.querySelector('ul > li.__checked');
      const sortKey = checkedSort ? checkedSort.dataset.key : null;
      if (sortKey && sortKey !== '3') {
        params.set('SORT', sortKey);
      }
    }
    
    if (window.location.pathname.indexOf('/brands/') !== -1) {
      params.set('BRAND', 'true');
    }

    // Отменяем предыдущий запрос, если он ещё в полёте
    if (filteredItemsAbortController) {
      filteredItemsAbortController.abort();
    }
    filteredItemsAbortController = new AbortController();
    
    // Прокручиваем страницу так, чтобы верх .catalog--filters оказался на отметке --header-main-height
    // (сразу под шапкой). Если .catalog--filters в sticky-режиме — берём позицию плейсхолдера,
    // т.к. он занимает естественное место фильтров в потоке документа.
    scrollToCatalogFiltersTop();
    
    fetch('/get-endpoints/getFitredCatalogItems?' + params.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
      signal: filteredItemsAbortController.signal
    })
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(data => {
        if (!data || typeof data !== 'object') return;
        
        const counter = document.querySelector('.catalog--filters--main--counter');
        if (counter && data.count !== undefined && data.count !== null) {
          counter.textContent = data.count;
        }
        
        const itemsGrid = document.querySelector('.items-grid');
        if (itemsGrid && typeof data.html === 'string') {
          // Старые карточки удаляются целиком — снимаем __wide-ready, чтобы новая
          // партия проявилась с анимацией после расстановки wide (revealGrid).
          itemsGrid.classList.remove('__wide-ready');
          itemsGrid.innerHTML = data.html;
          
          // Реинициализация подгружаемых ресурсов и UI новых карточек:
          // - .item--scroller (lazy-картинки внутри + превью + точки) — initScrollers
          // - img[lazy-src] вне скроллеров — initLazyLoad
          // - .item--buy-button → __mobile-button на тач-устройствах
          // Скоупим всё в itemsGrid, чтобы не задеть уже инициализированные элементы
          // в других местах страницы (recent / related / etc).
          if (typeof window.initScrollers === 'function') {
            window.initScrollers(itemsGrid);
          }
          if (typeof window.initLazyLoad === 'function') {
            window.initLazyLoad(itemsGrid);
          }
          if (typeof window.applyMobileButtonClass === 'function') {
            window.applyMobileButtonClass(itemsGrid);
          }
          // Wide-item fix для полностью заменённой сетки.
          // В отличие от пути "Показать ещё" (incremental fixNewItemsInGrid),
          // здесь innerHTML заменён целиком — все карточки новые, и нужен полноценный
          // пересчёт __wide-item / __wide-inline по всему гриду.
          if (typeof window.safeFixAllGrids === 'function') {
            window.safeFixAllGrids();
          }
        }
        
        // Кнопка "Показать ещё" — показываем/прячем по флагу more
        const moreBlock = document.querySelector('.catalog--items--more');
        if (moreBlock) {
          const moreLink = moreBlock.querySelector('a');
          if (data.more === true) {
            moreBlock.classList.remove('__hidden');
            if (moreLink) {
              moreLink.setAttribute('href', window.location.pathname + '?PAGE=2');
            }
          } else {
            moreBlock.classList.add('__hidden');
            if (moreLink) {
              moreLink.setAttribute('href', '');
            }
          }
          
          // Перенастраиваем autoload-observer: при смене фильтров кнопка
          // могла появиться или исчезнуть. Если autoload на паузе (__paused) —
          // setupAutoloadObserver сам вернётся (autoloadPaused=true).
          if (typeof setupAutoloadObserver === 'function') {
            setupAutoloadObserver();
          }
        }
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        // тихо игнорируем — UI остаётся прежним
      });
  }
  
  // Расставляет значения фильтров в ---all-filtres--block на основе GET-параметров адресной строки.
  //
  // Если в URL есть параметр, которому НЕ соответствует никакой фильтр на странице (нет
  // .---filter[data-filter-id="..."]) — такой параметр удаляется из URL. Исключение:
  // системные/маркетинговые параметры SORT и utm_*, они никогда не относятся к фильтрам.
  //
  // PAGE и FROM удаляем всегда: PAGE нужен только серверу при первичной отдаче для выбора
  // страницы каталога, дальше пагинация ведётся через кнопку "Показать ещё" на клиенте.
  // FROM — маркер источника перехода, используется для аналитики и не должен сохраняться в URL.
  //
  // По типу фильтра (data-filter-type) парсим значение:
  //   - select: ['Турники', 'Брусья'] из 'Турники.Брусья', сопоставляем по textContent li
  //   - range: [from, to] из 'from~to', записываем в .---filter-range--from / --to
  //   - toggle: 'true' — записываем 'true' в div, остальное игнорируем
  //
  // Исключение: если блок с фильтрами на странице есть, но ни одно значение не подошло —
  // считаем что пользователь перешёл в совсем другую категорию, и старые фильтр-параметры
  // в URL устаревшие. Очищаем все GET-параметры кроме SORT и utm_* (это системные/маркетинговые,
  // не относятся к фильтрам каталога).
  function applyFiltersFromUrl() {
    const allFiltersBlock = document.querySelector('.---all-filtres--block');
    if (!allFiltersBlock) return;
    
    let url;
    try {
      url = new URL(window.location.href);
    } catch (_) {
      return;
    }
    
    let matchedAny = false; // хоть одно значение применилось
    const keysToDelete = []; // ключи URL-параметров, которые нужно стереть из адресной строки
    let typeOrBrandReset = false; // сбросили TYPE/BRAND из-за того, что URL-значения не нашлись в базовом списке
    
    // FROM всегда удаляем из URL — он нужен только аналитике на этапе перехода,
    // после отработки applyFiltersFromUrl в адресной строке ему делать нечего.
    // PAGE сохраняем: по нему сервер отдаёт подгруженные партии, а header.js
    // восстанавливает позицию скролла (sessionStorage top_item_id).
    if (url.searchParams.has('FROM')) keysToDelete.push('FROM');
    
    url.searchParams.forEach((paramValue, paramKey) => {
      // FROM уже помечен на удаление выше, PAGE — не фильтр, а состояние
      // подгрузки сетки: ни тот, ни другой к фильтрам не применяем
      if (paramKey === 'PAGE' || paramKey === 'FROM') return;
      
      const filterButton = allFiltersBlock.querySelector(`.---filter[data-filter-id="${CSS.escape(paramKey)}"]`);
      if (!filterButton) {
        // Фильтра с таким data-filter-id на странице нет — параметр устаревший
        // (фильтр существовал в другом разделе каталога), удаляем из URL.
        // SORT/utm_* — системные, не фильтры, оставляем.
        if (paramKey === 'SORT') return;
        if (paramKey.startsWith('utm_')) return;
        keysToDelete.push(paramKey);
        return;
      }
      
      const filterType = filterButton.dataset.filterType;
      if (!filterType) return;
      
      const li = filterButton.closest('li');
      if (!li) return;
      
      const filterData = li.querySelector('.mobile-panel--filter-data');
      if (!filterData) return;
      
      if (filterType === 'select') {
        // Разбиваем по точке и санитайзим каждое значение: значения пришли из GET-параметра,
        // в DOM попадают через textContent (XSS-safe), но визуально мусор не нужен.
        // Допустимы: латиница, кириллица, цифры, пробельные, дефис и подчёркивание.
        const valuesFromUrl = paramValue.split('.')
          .map(v => v.replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s\-_]/g, '').trim())
          .filter(Boolean);
        if (valuesFromUrl.length === 0) return;
        
        const ul = filterData.querySelector('ul');
        if (!ul) return;
        
        const valuesSet = new Set(valuesFromUrl);
        const existingValues = new Set();
        let minKey = 0; // для определения следующего отрицательного data-key (gray li)
        let matchedExistingCount = 0; // сколько URL-значений сматчилось с реальными li (не gray)
        
        // Якорь для вставки gray li в начало списка — первый существующий li.
        // Запоминаем ДО активации, чтобы новые gray встали перед "Турники" / "Брусья" и т.д.
        const insertAnchor = ul.querySelector(':scope > li');
        
        // Активируем существующие li, чьи значения есть в URL.
        // Параллельно собираем существующие значения и минимальный key.
        ul.querySelectorAll(':scope > li').forEach(item => {
          const itemValue = item.textContent.trim();
          existingValues.add(itemValue);
          
          const k = parseInt(item.dataset.key);
          if (!isNaN(k) && k < minKey) minKey = k;
          
          if (valuesSet.has(itemValue)) {
            item.classList.add('__checked');
            matchedAny = true;
            matchedExistingCount++;
          }
        });
        
        // TYPE и BRAND: если ни одно URL-значение не сматчилось с базовым списком —
        // в фильтре остались бы только __gray элементы, что не имеет смысла (бэкенд их игнорирует
        // через :not(.__gray) в getFiltredCatalogItems). Сбрасываем фильтр: gray не добавляем,
        // помечаем param на удаление из URL. Поднимаем флаг — после очистки URL
        // понадобится перезапросить items с эндпойнта, т.к. server-side рендер шёл
        // с применением этого (теперь сброшенного) фильтра.
        if ((paramKey === 'TYPE' || paramKey === 'BRAND') && matchedExistingCount === 0) {
          keysToDelete.push(paramKey);
          typeOrBrandReset = true;
          return;
        }
        
        // Для URL-значений, которых нет в базовом списке, добавляем gray li с отрицательным data-key.
        // Они считаются активными (__checked), и __gray помечает их как "значение из URL, не из базы".
        // Вставляем перед первым существующим li, чтобы gray шли в начале списка
        // в том же порядке, в котором были в URL.
        let nextNegKey = minKey - 1;
        valuesFromUrl.forEach(value => {
          if (existingValues.has(value)) return;
          const grayLi = document.createElement('li');
          grayLi.setAttribute('data-key', String(nextNegKey));
          grayLi.className = '__gray __checked';
          grayLi.textContent = value;
          ul.insertBefore(grayLi, insertAnchor); // если anchor === null — equivalent of appendChild
          nextNegKey--;
          matchedAny = true;
        });
      } else if (filterType === 'range') {
        // Санитайзинг: допустимы только цифры и ровно один разделитель ~ (формат "from~to").
        // Любые другие символы (буквы, пробелы, несколько ~, отрицательные числа и т.п.) отбрасываем.
        if (!/^\d+~\d+$/.test(paramValue)) return;
        
        const parts = paramValue.split('~');
        if (parts.length !== 2) return;
        
        const rangeMin = parseInt(filterButton.dataset.filterRangeMin) || 0;
        const rangeMax = parseInt(filterButton.dataset.filterRangeMax) || 100;
        
        let fromVal = parseInt(parts[0]);
        let toVal = parseInt(parts[1]);
        
        if (isNaN(fromVal) || isNaN(toVal)) return;
        
        // Ограничиваем значения границами фильтра
        if (fromVal < rangeMin) fromVal = rangeMin;
        if (toVal > rangeMax) toVal = rangeMax;
        if (fromVal > toVal) return;
        
        // Если значения совпадают с min/max — фильтр эффективно пуст, не считаем за совпадение
        if (fromVal === rangeMin && toVal === rangeMax) return;
        
        const fromDiv = filterData.querySelector('.---filter-range--from');
        const toDiv = filterData.querySelector('.---filter-range--to');
        
        if (fromDiv) fromDiv.textContent = fromVal;
        if (toDiv) toDiv.textContent = toVal;
        matchedAny = true;
      } else if (filterType === 'toggle') {
        // Активируем только при явном 'true'
        if (paramValue === 'true') {
          const valueDiv = filterData.querySelector('div');
          if (valueDiv) valueDiv.textContent = 'true';
          matchedAny = true;
        }
      }
    });
    
    // Обновляем __active на странице, badge и ---filter-clear-all--block,
    // но НЕ переписываем URL — иначе будут стёрты неподошедшие параметры,
    // которые могут пригодиться при возврате в раздел, где они применимы.
    updateAllFiltersActiveState(false, null, false);
    
    // Если ни одно значение не подошло — считаем что пользователь перешёл в другую категорию
    // каталога, и все фильтр-параметры в URL устарели. Сносим всё кроме SORT, PAGE и utm_*
    // (системные параметры, не относящиеся к фильтрам каталога). FROM уже помечен
    // на удаление в начале функции.
    if (!matchedAny) {
      url.searchParams.forEach((_, key) => {
        if (key === 'SORT') return;
        if (key === 'PAGE') return;
        if (key.startsWith('utm_')) return;
        keysToDelete.push(key);
      });
    }
    
    // Применяем накопленные удаления одним replaceState:
    // - параметры, для которых нет соответствующего фильтра на странице
    // - TYPE/BRAND, если у них в фильтре остались бы только __gray
    // - bulk cleanup при matchedAny=false
    if (keysToDelete.length > 0) {
      const uniqueKeys = Array.from(new Set(keysToDelete));
      uniqueKeys.forEach(key => url.searchParams.delete(key));
      try {
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch (_) {}
    }
    
    // Если сбросили TYPE/BRAND — server-side рендер каталога шёл с применением этого
    // фильтра (бэкенд не знает про __gray-fallback и применяет переданное значение).
    // Перезапрашиваем items с эндпойнта, чтобы UI отразил реально применённый набор фильтров.
    if (typeOrBrandReset) {
      markFiltersChanged();
      fetchFilteredCatalogItems();
    }
  }
  
  function closeFilterPanel(isClear = false, discardChanges = false) {
    // Определяем какую панель закрываем - вложенную или основную
    const panelToClose = nestedFilterPanel || filterPanel;
    if (!panelToClose) return;
    
    const isClosingNested = !!nestedFilterPanel;
    
    // Обновляем данные и состояние (если не очистка и не отмена изменений)
    if (!isClear && !discardChanges) {
      let filterId = panelToClose.getAttribute('data-filter-id');
      
      if (filterId) {
        if (isClosingNested) {
          // Для __nested-panel - сохраняем данные в клон allFiltersPanel
          saveFilterDataToContainer(panelToClose, allFiltersPanel, filterId);
          // Обновляем состояние __active в клоне
          updateFilterActiveState(filterId, true, allFiltersPanel);
        } else if (!panelToClose.classList.contains('__all-filters-panel')) {
          // Для обычной панели (из catalog--filters--second) - сохраняем в источник
          const allFiltersBlock = document.querySelector('.---all-filtres--block');
          saveFilterDataToContainer(panelToClose, allFiltersBlock, filterId);
          // Обновляем состояние __active на странице
          updateFilterActiveState(filterId, false, null);
        }
        // Для __all-filters-panel - данные синхронизируются ниже через syncAllFiltersToSource
      }
    }
    
    panelToClose.classList.remove('__active');
    
    if (isClosingNested) {
      // Закрываем только вложенную панель, оставляем all-filters
      openedFromAllFilters = false;
      
      // Показываем контент all-filters-panel обратно
      if (window.innerWidth > 1120 && allFiltersPanel) {
        allFiltersPanel.classList.remove('__content-hidden');
      }
      
      setTimeout(() => {
        if (nestedFilterPanel) {
          nestedFilterPanel.remove();
          nestedFilterPanel = null;
        }
      }, 300);
    } else {
      // Закрываем основную панель
      
      // Если это панель all-filters и не отменяем изменения - синхронизируем данные в источник и обновляем страницу
      if (panelToClose.classList.contains('__all-filters-panel') && !discardChanges) {
        // Синхронизируем данные из клона в источник
        syncAllFiltersToSource(panelToClose);
        
        // Обновляем __active для всех фильтров на странице на основе данных из источника
        // Также обновляет badge и ---filter-clear-all--block
        updateAllFiltersActiveState(false, null);
      }
      
      // Убираем активное состояние с кнопок
      if (activeFilterButton) {
        activeFilterButton.classList.remove('__filter-opened');
        activeFilterButton = null;
      }
      if (activePositionButton) {
        activePositionButton.classList.remove('__filter-opened');
        activePositionButton = null;
      }
      
      // Сбрасываем флаг и ссылку на all-filters панель
      openedFromAllFilters = false;
      allFiltersPanel = null;
      
      // Разблокируем скролл только если это не десктоп-дропдаун
      if (!panelToClose.classList.contains('__desktop-dropdown')) {
        window.unlockScroll();
      }
      
      setTimeout(() => {
        if (filterPanel) {
          filterPanel.remove();
          filterPanel = null;
        }
      }, 300);
    }
  }
  
  window.closeMobileFilterPanel = closeFilterPanel;
  window.clearFilterData = clearFilterData;
  window.isFilterActive = isFilterActive;
  window.countActiveFilters = countActiveFilters;
  window.updateFilterActiveState = updateFilterActiveState;
  window.updateAllFiltersActiveState = updateAllFiltersActiveState;
  window.updateClearAllBlockState = updateClearAllBlockState;
  window.updateAllFiltersBadge = updateAllFiltersBadge;
  window.updateUrlFromFilters = updateUrlFromFilters;
  window.applyFiltersFromUrl = applyFiltersFromUrl;
  window.fetchFilteredCatalogItems = fetchFilteredCatalogItems;
  window.markFiltersChanged = markFiltersChanged;
  
  // Инициализация фильтров из адресной строки при загрузке страницы.
  // Внутри также пересчитываются __active, badge, ---filter-clear-all--block и нормализуется URL.
  applyFiltersFromUrl();
  
  // Закрывает все панели фильтров корректно (вложенную и основную)
  // discardChanges = true: закрывает без применения внесённых изменений
  window.closeAllFilterPanels = function(discardChanges = false) {
    if (filterPanel && filterPanel.classList.contains('__all-filters-panel')) {
      const isDesktop = window.innerWidth > 1120;
      
      // Если есть вложенная панель - сначала закрываем её (с сохранением данных, если не отмена изменений)
      if (nestedFilterPanel) {
        if (!discardChanges) {
          const filterId = nestedFilterPanel.getAttribute('data-filter-id');
          if (filterId && allFiltersPanel) {
            saveFilterDataToContainer(nestedFilterPanel, allFiltersPanel, filterId);
            updateFilterActiveState(filterId, true, allFiltersPanel);
          }
        }
        nestedFilterPanel.remove();
        nestedFilterPanel = null;
        openedFromAllFilters = false;
        
        if (isDesktop && allFiltersPanel) {
          allFiltersPanel.classList.remove('__content-hidden');
        }
      }
      
      // Закрываем основную панель фильтров
      closeFilterPanel(false, discardChanges);
    }
  };
  
  // Обработчик клика на кнопку "Все фильтры"
  const allFiltersButton = filtersSection.querySelector('.---all-filtres');
  if (allFiltersButton) {
    allFiltersButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Если открыта панель всех фильтров - закрываем всё корректно
      if (filterPanel && filterPanel.classList.contains('__all-filters-panel')) {
        window.closeAllFilterPanels();
        return;
      }
      
      // Иначе - открываем панель
      const allFiltersBlock = allFiltersButton.closest('.---all-filtres--block');
      const content = allFiltersBlock ? allFiltersBlock.querySelector('.mobile-panel--filter-data') : null;
      if (content) {
        const title = allFiltersButton.textContent.trim();
        openFilterPanel(title, content, allFiltersButton);
      }
    });
  }
  
  // Обработчик кликов на кнопки отдельных фильтров
  const filterButtons = filtersSection.querySelectorAll('.catalog--filters--second .---filter');
  filterButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Находим данные фильтра в ---all-filtres--block по data-filter-id (data-filter-id одинаковые)
      const filterId = button.dataset.filterId;
      const allFiltersBlock = filtersSection.querySelector('.---all-filtres--block');
      
      if (allFiltersBlock) {
        const sourceFilterButton = allFiltersBlock.querySelector(`[data-filter-id="${filterId}"]`);
        if (sourceFilterButton) {
          const sourceLi = sourceFilterButton.closest('li');
          if (sourceLi) {
            const content = sourceLi.querySelector('.mobile-panel--filter-data');
            if (content) {
              const title = button.textContent.trim();
              // Передаём sourceFilterButton для чтения атрибутов, button для позиционирования
              openFilterPanel(title, content, sourceFilterButton, filterId, button);
            }
          }
        }
      }
    });
  });
  
  // Обработчик кликов на фильтры внутри панели всех фильтров
  document.addEventListener('click', (e) => {
    const filterButton = e.target.closest('.mobile-panel--content.__all-filters-panel .---filter');
    if (!filterButton) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const li = filterButton.closest('li');
    if (!li) return;
    
    const content = li.querySelector('.mobile-panel--filter-data');
    if (!content) return;
    
    // Сохраняем ссылку на панель all-filters
    allFiltersPanel = filterButton.closest('.mobile-panel.__all-filters-panel');
    
    // Устанавливаем флаг
    openedFromAllFilters = true;
    
    // Получаем тип фильтра
    const filterType = filterButton.dataset.filterType;
    const filterTypeClass = filterType ? '__' + filterType : null;
    
    // Создаём вложенную панель
    const title = filterButton.textContent.trim();
    nestedFilterPanel = createFilterPanel(title, content, filterTypeClass, filterButton);
    
    // Записываем id и тип фильтра
    if (filterButton.dataset.filterId) {
      nestedFilterPanel.setAttribute('data-filter-id', filterButton.dataset.filterId);
    }
    if (filterTypeClass) {
      nestedFilterPanel.setAttribute('data-filter-type', filterTypeClass);
    }
    nestedFilterPanel.setAttribute('data-opened-from-all-filters', 'true');
    
    // Добавляем класс для вложенной панели
    nestedFilterPanel.classList.add('__nested-panel');
    
    // На десктопе скрываем контент all-filters-panel
    if (window.innerWidth > 1120 && allFiltersPanel) {
      allFiltersPanel.classList.add('__content-hidden');
    }
    
    // На десктопе позиционируем вложенную панель так же, как основную панель (под ---all-filtres)
    if (window.innerWidth > 1120 && activeFilterButton) {
      positionDesktopFilterPanel(nestedFilterPanel, activeFilterButton);
    }
    
    panelOpenedAt = Date.now();
    // Анимируем появление
    nestedFilterPanel.classList.add('__active');
  });
  
  // Закрытие по клику вне панели
  document.addEventListener('click', (e) => {
    if (!filterPanel && !nestedFilterPanel) return;
    
    // Если есть вложенная панель - проверяем клик вне неё
    if (nestedFilterPanel) {
      if (!nestedFilterPanel.contains(e.target) && 
          !e.target.closest('.mobile-panel.__all-filters-panel .---filter')) {
        closeFilterPanel();
      }
      return;
    }
    
    // Иначе проверяем клик вне основной панели
    if (!filterPanel.contains(e.target) && 
        !e.target.closest('.---all-filtres') &&
        !e.target.closest('.---filter')) {
      closeFilterPanel();
    }
  });
  
  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (filterPanel || nestedFilterPanel)) {
      e.stopImmediatePropagation();
      closeFilterPanel();
    }
  });
  
  // Закрытие панелей при resize
  ResizeDispatcher.onResizeDebounced((resizeStartedAt) => {
    // На iOS lockScroll (position:fixed + top) может вызывать resize из-за смены viewport.
    // Игнорируем resize, начавшийся раньше чем через 400ms после открытия — это артефакт, не реальная смена ориентации.
    if (resizeStartedAt - panelOpenedAt < 400) return;
    // Закрываем все панели при resize
    if (nestedFilterPanel) {
      closeFilterPanel();
    }
    if (filterPanel) {
      closeFilterPanel();
    }
  });
  
  // Закрытие десктоп-дропдаунов при прокрутке страницы
  window.addEventListener('scroll', () => {
    if (window.innerWidth <= 1120) return;
    
    // Сначала закрываем вложенную панель
    if (nestedFilterPanel && nestedFilterPanel.classList.contains('__desktop-dropdown')) {
      closeFilterPanel();
    }
    // Потом основную
    if (filterPanel && filterPanel.classList.contains('__desktop-dropdown')) {
      closeFilterPanel();
    }
  });
});



/* Кнопки очистки фильтров на странице (catalog--filters--second) */

document.addEventListener('DOMContentLoaded', () => {
  const secondFilters = document.querySelector('.catalog--filters--second');
  if (!secondFilters) return;
  
  secondFilters.addEventListener('click', (e) => {
    const clearButton = e.target.closest('.---filter-clear');
    if (!clearButton) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Находим id фильтра
    const li = clearButton.closest('li');
    if (!li) return;
    
    const filterButton = li.querySelector('.---filter');
    if (!filterButton || !filterButton.dataset.filterId) return;
    
    const filterId = filterButton.dataset.filterId;
    
    // Сбрасываем данные фильтра в источнике (mobile-panel--filter-data)
    if (typeof window.clearFilterData === 'function') {
      window.clearFilterData(filterId);
    }
    
    // Обновляем состояние __active на основе данных (уберёт __active, обновит badge и clear-all)
    if (typeof window.updateFilterActiveState === 'function') {
      window.updateFilterActiveState(filterId, false, null);
    }
  });
});



/* Кнопка очистки фильтра в панели всех фильтров (клоне) */

document.addEventListener('click', (e) => {
  const clearButton = e.target.closest('.mobile-panel--content.__all-filters-panel .---filter-clear');
  if (!clearButton) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Находим панель (клон)
  const panel = clearButton.closest('.mobile-panel.__all-filters-panel');
  const li = clearButton.closest('li');
  if (!li || !panel) return;
  
  const filterButton = li.querySelector('.---filter');
  if (!filterButton || !filterButton.dataset.filterId) return;
  
  const filterId = filterButton.dataset.filterId;
  
  // Сбрасываем данные фильтра в клоне
  if (typeof window.clearFilterData === 'function') {
    window.clearFilterData(filterId, panel);
  }
  
  // Обновляем состояние __active в клоне на основе данных
  if (typeof window.updateFilterActiveState === 'function') {
    window.updateFilterActiveState(filterId, true, panel);
  }
});



/* Кнопка очистки в мобильной панели фильтров */

document.addEventListener('click', (e) => {
  const clearButton = e.target.closest('.mobile-panel--clear');
  if (!clearButton) return;
  
  const panel = clearButton.closest('.mobile-panel');
  if (!panel) return;
  
  // Панель сортировки обрабатывается отдельно
  if (panel.classList.contains('__right-panel')) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Специальная обработка для панели __all-filters-panel (как ---filter-clear-all)
  if (panel.classList.contains('__all-filters-panel')) {
    // Сбрасываем данные всех фильтров В КЛОНЕ
    const filterButtons = panel.querySelectorAll('.---filter[data-filter-id]');
    filterButtons.forEach(btn => {
      if (typeof window.clearFilterData === 'function') {
        window.clearFilterData(btn.dataset.filterId, panel);
      }
    });
    
    // Пересчитываем __active для всех фильтров в клоне
    if (typeof window.updateAllFiltersActiveState === 'function') {
      window.updateAllFiltersActiveState(true, panel);
    }
    
    // Закрываем панель (с флагом очистки)
    if (typeof window.closeMobileFilterPanel === 'function') {
      window.closeMobileFilterPanel(true);
    }
    return;
  }
  
  const filterId = panel.getAttribute('data-filter-id');
  const isNestedPanel = panel.classList.contains('__nested-panel');
  
  if (filterId) {
    if (isNestedPanel) {
      // Для __nested-panel — сбрасываем данные в клоне __all-filters-panel
      const allFiltersPanel = document.querySelector('.mobile-panel.__all-filters-panel');
      if (allFiltersPanel) {
        if (typeof window.clearFilterData === 'function') {
          window.clearFilterData(filterId, allFiltersPanel);
        }
        
        // Пересчитываем __active в клоне
        if (typeof window.updateFilterActiveState === 'function') {
          window.updateFilterActiveState(filterId, true, allFiltersPanel);
        }
      }
    } else {
      // Для обычной панели — сбрасываем данные в источнике (как ---filter-clear)
      if (typeof window.clearFilterData === 'function') {
        window.clearFilterData(filterId);
      }
      
      // Пересчитываем __active на странице, badge и clear-all
      if (typeof window.updateFilterActiveState === 'function') {
        window.updateFilterActiveState(filterId, false, null);
      }
    }
  }
  
  // Закрываем панель (с флагом очистки)
  if (typeof window.closeMobileFilterPanel === 'function') {
    window.closeMobileFilterPanel(true);
  }
});



/* Закрытие мобильной панели фильтров по кнопке заголовка, close или accept */

document.addEventListener('click', (e) => {
  const titleButton = e.target.closest('.mobile-panel--header--title');
  const closeButton = e.target.closest('.mobile-panel--close');
  const acceptButton = e.target.closest('.mobile-panel--accept');
  
  if (!titleButton && !closeButton && !acceptButton) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  if (typeof window.closeMobileFilterPanel === 'function') {
    window.closeMobileFilterPanel();
  }
});



/* Кнопка очистки всех фильтров */

document.addEventListener('DOMContentLoaded', () => {
  const clearAllButton = document.querySelector('.---filter-clear-all');
  if (!clearAllButton) return;
  
  clearAllButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Сбрасываем данные всех фильтров в источнике (mobile-panel--filter-data)
    const allFiltersBlock = document.querySelector('.---all-filtres--block');
    if (allFiltersBlock) {
      const allFilterButtons = allFiltersBlock.querySelectorAll('.---filter[data-filter-id]');
      allFilterButtons.forEach(btn => {
        if (typeof window.clearFilterData === 'function') {
          window.clearFilterData(btn.dataset.filterId);
        }
      });
    }
    
    // Удаляем из DOM __gray элементы (значения из URL, отсутствующие в базовом списке)
    document.querySelectorAll('li.__gray').forEach(el => el.remove());
    
    // Закрываем открытые панели фильтров без применения внесённых в них изменений
    const openPanel = document.querySelector('.mobile-panel.__scrollable.__desktop-dropdown.__active');
    if (openPanel) {
      if (openPanel.classList.contains('__all-filters-panel')) {
        if (typeof window.closeAllFilterPanels === 'function') {
          window.closeAllFilterPanels(true);
        }
      } else if (typeof window.closeMobileFilterPanel === 'function') {
        window.closeMobileFilterPanel(false, true);
      }
    }
    
    // Пересчитываем __active для всех фильтров, __has-badge и ---filter-clear-all--block
    if (typeof window.updateAllFiltersActiveState === 'function') {
      window.updateAllFiltersActiveState(false, null);
    }
  });
});



/* Переключатель toggle в мобильной панели фильтров */

document.addEventListener('click', (e) => {
  const toggleOption = e.target.closest('.---filter-toggle > div');
  if (!toggleOption) return;
  
  const toggleContainer = toggleOption.closest('.---filter-toggle');
  if (!toggleContainer) return;
  
  const contentWrapper = toggleContainer.closest('.mobile-panel--content.__toggle');
  if (!contentWrapper) return;
  
  const newValue = toggleOption.getAttribute('data-toggle-value');
  if (newValue) {
    contentWrapper.setAttribute('data-value', newValue);
    if (newValue === '*ALL*') {
      toggleContainer.classList.add('__all');
    } else {
      toggleContainer.classList.remove('__all');
    }
  }
});



/* Панель сортировки для мобильных устройств (---order-by) */

window.closeMobileOrderByPanel = null;

document.addEventListener('DOMContentLoaded', () => {
  const filtersSection = document.querySelector('.catalog--filters');
  if (!filtersSection) return;
  
  const orderByButton = filtersSection.querySelector('.---order-by');
  if (!orderByButton) return;
  
  let orderByPanel = null;
  let panelOpenedAt = 0; // Время последнего открытия (для защиты от ложного resize на iOS)
  
  function createOrderByPanel(title, content) {
    const panel = document.createElement('section');
    panel.className = 'mobile-panel __scrollable __right-panel';
    
    const header = document.createElement('div');
    header.className = 'mobile-panel--header';
    
    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = title;
    titleButton.setAttribute('aria-label', 'Закрыть: ' + title);
    
    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.textContent = '';
    
    header.appendChild(titleButton);
    header.appendChild(closeButton);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-panel--content __select __only-one';
    
    const clonedContent = content.cloneNode(true);
    
    while (clonedContent.firstChild) {
      contentWrapper.appendChild(clonedContent.firstChild);
    }
    
    // Блок с кнопками внизу панели
    const acceptClearBlock = document.createElement('div');
    acceptClearBlock.className = 'mobile-panel--accept-clear--block';
    
    const clearButton = document.createElement('button');
    clearButton.className = 'mobile-panel--clear';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Сбросить';
    clearButton.setAttribute('aria-label', 'Сбросить');
    
    const acceptButton = document.createElement('button');
    acceptButton.className = 'mobile-panel--accept';
    acceptButton.setAttribute('type', 'button');
    acceptButton.textContent = 'Применить';
    acceptButton.setAttribute('aria-label', 'Применить');
    
    acceptClearBlock.appendChild(clearButton);
    acceptClearBlock.appendChild(acceptButton);
    
    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    panel.appendChild(acceptClearBlock);
    
    document.body.appendChild(panel);
    
    // Обработка кликов для выбора только одного значения (__only-one)
    const selectItems = contentWrapper.querySelectorAll('ul > li');
    
    selectItems.forEach(item => {
      item.addEventListener('click', () => {
        // Снимаем выделение со всех
        selectItems.forEach(i => i.classList.remove('__checked'));
        // Выделяем только текущий
        item.classList.add('__checked');
      });
    });
    
    return panel;
  }
  
  function openOrderByPanel() {
    const isDesktop = window.innerWidth > 1120;
    
    // Если панель уже открыта - закрываем
    if (orderByPanel) {
      if (isDesktop) {
        closeOrderByPanel();
        return;
      }
      return;
    }
    
    // Закрываем другие панели
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    if (typeof window.closeMobileFilterPanel === 'function') {
      window.closeMobileFilterPanel();
    }
    
    if (typeof window.closeMobileSubmenuPanels === 'function') {
      window.closeMobileSubmenuPanels();
    }
    
    if (typeof window.closeMobileSearchPanel === 'function') {
      window.closeMobileSearchPanel();
    }
    
    // Закрываем мобильное меню если открыто (только на мобиле)
    if (!isDesktop) {
      const mobileMenuButton = document.getElementById('mobile-menu');
      const topMenu = document.querySelector('.header--top-menu');
      if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
        mobileMenuButton.click();
      }
      
      window.lockScroll();
    }
    
    // Отмечаем кнопку как активную
    orderByButton.classList.add('__filter-opened');
    
    // Получаем данные из mobile-panel--order-by
    const allFiltersBlock = filtersSection.querySelector('.---all-filtres--block');
    const orderByData = allFiltersBlock ? allFiltersBlock.querySelector('.mobile-panel--order-by') : null;
    
    if (orderByData) {
      const title = 'Сортировка';
      orderByPanel = createOrderByPanel(title, orderByData);
      
      // На десктопе добавляем класс и позиционируем под кнопкой
      if (isDesktop) {
        orderByPanel.classList.add('__desktop-dropdown');
        const rect = orderByButton.getBoundingClientRect();
        orderByPanel.style.left = rect.left + 'px';
        orderByPanel.style.top = rect.bottom + 'px';
      }
      
      // Для защиты от ложного resize на iOS при lockScroll
      panelOpenedAt = Date.now();

      orderByPanel.classList.add('__active');
    }
  }
  
  function closeOrderByPanel(isClear = false) {
    if (!orderByPanel) return;
    
    // Сохраняем выбранное значение обратно в источник
    if (!isClear) {
      const contentWrapper = orderByPanel.querySelector('.mobile-panel--content.__select');
      const allFiltersBlock = filtersSection.querySelector('.---all-filtres--block');
      const sourceOrderBy = allFiltersBlock ? allFiltersBlock.querySelector('.mobile-panel--order-by') : null;
      
      if (contentWrapper && sourceOrderBy) {
        // Получаем выбранный ключ из панели
        const checkedItem = contentWrapper.querySelector('ul > li.__checked');
        const checkedKey = checkedItem ? checkedItem.dataset.key : null;
        
        // Обновляем источник, помечая filtersChanged при реальной смене __checked
        const sourceLis = sourceOrderBy.querySelectorAll('ul > li');
        sourceLis.forEach(li => {
          const key = li.dataset.key;
          const shouldBeChecked = checkedKey && key === checkedKey;
          const wasChecked = li.classList.contains('__checked');
          if (shouldBeChecked && !wasChecked) {
            li.classList.add('__checked');
            if (typeof window.markFiltersChanged === 'function') window.markFiltersChanged();
          } else if (!shouldBeChecked && wasChecked) {
            li.classList.remove('__checked');
            if (typeof window.markFiltersChanged === 'function') window.markFiltersChanged();
          }
        });
      }
    }
    
    orderByPanel.classList.remove('__active');
    orderByButton.classList.remove('__filter-opened');
    
    // Обновляем класс на кнопке и пишем SORT в URL/историю (при isClear это делает clear-handler)
    updateOrderByButtonClass(!isClear);
    
    // Подтягиваем отфильтрованные товары: SORT изменился пользователем.
    // При isClear источник ещё не обновлён (это делает внешний clear-handler),
    // поэтому фетч там делается отдельно после синхронизации источника.
    if (!isClear && typeof window.fetchFilteredCatalogItems === 'function') {
      window.fetchFilteredCatalogItems();
    }
    
    // Разблокируем скролл только если это не десктоп-дропдаун
    if (!orderByPanel.classList.contains('__desktop-dropdown')) {
      window.unlockScroll();
    }
    
    setTimeout(() => {
      if (orderByPanel) {
        orderByPanel.remove();
        orderByPanel = null;
      }
    }, 300);
  }
  
  // Синхронизирует выбор сортировки в источнике панели из GET-параметра SORT,
  // если он присутствует в URL и совпадает с одним из ключей в источнике.
  // Вызывается до updateOrderByButtonClass(), чтобы тот подхватил выбор и
  // обновил кнопку + localStorage в обычном потоке.
  function syncOrderByFromUrl() {
    let sortFromUrl;
    try {
      sortFromUrl = new URL(window.location.href).searchParams.get('SORT');
    } catch (_) {
      return;
    }
    if (!sortFromUrl) return;
    
    const allFiltersBlock = filtersSection.querySelector('.---all-filtres--block');
    const sourceOrderBy = allFiltersBlock ? allFiltersBlock.querySelector('.mobile-panel--order-by') : null;
    if (!sourceOrderBy) return;
    
    const allLis = sourceOrderBy.querySelectorAll('ul > li');
    const hasMatch = Array.from(allLis).some(li => li.dataset.key === sortFromUrl);
    if (!hasMatch) return;
    
    allLis.forEach(li => {
      if (li.dataset.key === sortFromUrl) {
        li.classList.add('__checked');
      } else {
        li.classList.remove('__checked');
      }
    });
  }
  
  // Обновляет класс __checked-N на кнопке ---order-by.
  // applyToUrl = true — сортировка применена пользователем: SORT подставляется в адресную
  // строку и пишется в историю (pushState). Без флага (инициализация) URL не трогаем.
  function updateOrderByButtonClass(applyToUrl = false) {
    const allFiltersBlock = filtersSection.querySelector('.---all-filtres--block');
    const sourceOrderBy = allFiltersBlock ? allFiltersBlock.querySelector('.mobile-panel--order-by') : null;
    
    if (!sourceOrderBy) return;
    
    // Находим выбранный элемент
    const checkedItem = sourceOrderBy.querySelector('ul > li.__checked');
    if (!checkedItem) return;
    
    // Получаем ключ из data-key
    const keyNumber = checkedItem.dataset.key;
    
    if (!keyNumber) return;
    
    // Убираем все старые классы __checked-N
    const classesToRemove = [];
    orderByButton.classList.forEach(cls => {
      if (cls.startsWith('__checked-')) {
        classesToRemove.push(cls);
      }
    });
    classesToRemove.forEach(cls => orderByButton.classList.remove(cls));
    
    // Добавляем новый класс
    orderByButton.classList.add('__checked-' + keyNumber);
    
    // Сохраняем выбранную сортировку в sessionStorage,
    // чтобы при переходах по каталогу подмешивать GET-параметр SORT
    try {
      sessionStorage.setItem('order-by', keyNumber);
    } catch (_) {}
    
    if (!applyToUrl) return;
    
    // Сортировка применена пользователем — подставляем SORT в адресную строку
    // и пишем в историю, если значение реально изменилось.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('SORT') === keyNumber) return;
      url.searchParams.set('SORT', keyNumber);
      window.history.pushState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  }
  
  window.closeMobileOrderByPanel = closeOrderByPanel;
  window.updateOrderByButtonClass = updateOrderByButtonClass;
  
  // Сначала синхронизируем выбор из GET-параметра SORT (если он есть в URL),
  // затем инициализируем класс кнопки — он подхватит обновлённое состояние источника.
  syncOrderByFromUrl();
  updateOrderByButtonClass();
  
  // Обработчик клика на кнопку ---order-by
  orderByButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Закрываем все панели фильтров корректно (вложенную и основную)
    if (typeof window.closeAllFilterPanels === 'function') {
      window.closeAllFilterPanels();
    }
    
    openOrderByPanel();
  });
  
  // Закрытие по клику на кнопки заголовка, close или accept
  document.addEventListener('click', (e) => {
    if (!orderByPanel) return;
    
    const titleButton = e.target.closest('.mobile-panel.__right-panel .mobile-panel--header--title');
    const closeButton = e.target.closest('.mobile-panel.__right-panel .mobile-panel--close');
    const acceptButton = e.target.closest('.mobile-panel.__right-panel .mobile-panel--accept');
    
    if (titleButton || closeButton || acceptButton) {
      e.preventDefault();
      e.stopPropagation();
      closeOrderByPanel();
    }
  });
  
  // Обработка кнопки сброса
  document.addEventListener('click', (e) => {
    const clearButton = e.target.closest('.mobile-panel.__right-panel .mobile-panel--clear');
    if (!clearButton || !orderByPanel) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Сбрасываем на значение по умолчанию (key='3' - Рекомендация магазина)
    const contentWrapper = orderByPanel.querySelector('.mobile-panel--content.__select');
    if (contentWrapper) {
      const allItems = contentWrapper.querySelectorAll('ul > li');
      allItems.forEach(li => {
        const key = li.dataset.key;
        if (key === '3') {
          li.classList.add('__checked');
        } else {
          li.classList.remove('__checked');
        }
      });
    }
    
    closeOrderByPanel(true);
    
    // Сбрасываем также в источнике, помечая filtersChanged при реальной смене __checked
    const allFiltersBlock = filtersSection.querySelector('.---all-filtres--block');
    const sourceOrderBy = allFiltersBlock ? allFiltersBlock.querySelector('.mobile-panel--order-by') : null;
    if (sourceOrderBy) {
      const sourceLis = sourceOrderBy.querySelectorAll('ul > li');
      sourceLis.forEach(li => {
        const key = li.dataset.key;
        const shouldBeChecked = key === '3';
        const wasChecked = li.classList.contains('__checked');
        if (shouldBeChecked && !wasChecked) {
          li.classList.add('__checked');
          if (typeof window.markFiltersChanged === 'function') window.markFiltersChanged();
        } else if (!shouldBeChecked && wasChecked) {
          li.classList.remove('__checked');
          if (typeof window.markFiltersChanged === 'function') window.markFiltersChanged();
        }
      });
    }
    
    // Обновляем класс на кнопке и пишем SORT в URL/историю
    updateOrderByButtonClass(true);
    
    // Подтягиваем отфильтрованные товары: SORT сброшен пользователем
    if (typeof window.fetchFilteredCatalogItems === 'function') {
      window.fetchFilteredCatalogItems();
    }
  });
  
  // Закрытие по клику вне панели
  document.addEventListener('click', (e) => {
    if (!orderByPanel) return;
    
    if (!orderByPanel.contains(e.target) && !e.target.closest('.---order-by')) {
      closeOrderByPanel();
    }
  });
  
  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && orderByPanel) {
      e.stopImmediatePropagation();
      closeOrderByPanel();
    }
  });
  
  // Закрытие при resize
  ResizeDispatcher.onResizeDebounced((resizeStartedAt) => {
    // На iOS lockScroll (position:fixed + top) может вызывать resize из-за смены viewport.
    // Игнорируем resize, начавшийся раньше чем через 400ms после открытия — это артефакт, не реальная смена ориентации.
    if (resizeStartedAt - panelOpenedAt < 400) return;
    if (orderByPanel) {
      closeOrderByPanel();
    }
  });
  
  // Закрытие десктоп-дропдауна при прокрутке страницы
  window.addEventListener('scroll', () => {
    if (window.innerWidth <= 1120) return;
    
    if (orderByPanel && orderByPanel.classList.contains('__desktop-dropdown')) {
      closeOrderByPanel();
    }
  });
});



/**
 * Wide Item Grid Fix
 * Если __wide-item (span 2) оказывается в позиции где осталась 1 колонка в строке,
 * он переносится на следующую строку, оставляя пустое место.
 * Решение: предыдущему item назначаются __wide-item и __wide-inline для заполнения пробела.
 */

document.addEventListener('DOMContentLoaded', function() {
  const grids = document.querySelectorAll('.items-grid, .page-items-grid');
  if (!grids.length) return;

  function getColumnCount(grid) {
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  }

  function getItemSelector(grid) {
    return grid.classList.contains('page-items-grid') ? '.page-item' : '.item';
  }

  /**
   * Режим "на мобильном всегда одна карточка в линии"
   * Активен если на body стоит __all-wide и ширина экрана менее 600px
   */
  function isAllWideMode() {
    return document.body.classList.contains('__all-wide') && window.innerWidth < 600;
  }

  /**
   * Page Item Wide Poster
   * У .page-item--image может быть data-poster-url — отдельная картинка
   * для широкого формата. Если атрибут заполнен, то при получении
   * .page-item класса __wide-item картинка меняется на постер, а при
   * снятии класса возвращается исходная.
   * На экранах уже 640px постер не нужен — всегда обложка.
   * Подмена идёт через lazy-src, загрузку делает lazy.js.
   */
  function isPosterAllowed() {
    return window.innerWidth >= 640;
  }

  function setLazySrc(img, url) {
    const wasLoaded = img.hasAttribute('src');

    img.removeAttribute('src');
    img.classList.remove('__lazy-loaded');
    img.setAttribute('lazy-src', url);

    // Картинка уже была загружена — общий проход lazy.js её не подхватит
    if (wasLoaded && typeof window.initLazyLoad === 'function') {
      window.initLazyLoad(img.parentElement);
    }
  }

  function applyPagePoster(item) {
    const imageBlock = item.querySelector('.page-item--image');
    if (!imageBlock) return;

    const poster = (imageBlock.getAttribute('data-poster-url') || '').trim();
    if (!poster) return;

    const img = imageBlock.querySelector('img');
    if (!img) return;

    if (item.classList.contains('__wide-item') && isPosterAllowed()) {
      if (img.hasAttribute('data-default-url')) return;

      const current = img.getAttribute('src') || img.getAttribute('lazy-src') || '';
      if (current === poster) return;

      img.setAttribute('data-default-url', current);
      setLazySrc(img, poster);
      return;
    }

    if (!img.hasAttribute('data-default-url')) return;

    const original = img.getAttribute('data-default-url');
    img.removeAttribute('data-default-url');
    if (original) setLazySrc(img, original);
  }

  function applyPagePosters(root) {
    const scope = root || document;
    scope.querySelectorAll('.page-item').forEach(applyPagePoster);
  }

  /**
   * Auto Wide Items
   * Читает --auto-wide-items (число N). Делит товары на интервалы
   * по N штук и в каждом без __wide-item назначает один случайный
   * товар как __wide-item.
   */
  function autoWideItems(items) {
    // Снимаем ранее автоматически назначенные __wide-item
    items.forEach(item => {
      if (item.hasAttribute('data-auto-wide-added')) {
        item.classList.remove('__wide-item');
        item.removeAttribute('data-auto-wide-added');
      }
    });

    // Исключаем товары внутри .interesting-items (на любом уровне вложенности)
    items = items.filter(item => !item.closest('.interesting-items'));

    // Режим __all-wide: на узком экране все допустимые карточки становятся широкими
    if (isAllWideMode()) {
      items.forEach(item => {
        if (item.classList.contains('__wide-item')) return;
        item.classList.add('__wide-item');
        item.setAttribute('data-auto-wide-added', '');
      });
      return;
    }

    const value = getComputedStyle(document.documentElement).getPropertyValue('--auto-wide-items').trim();
    if (value === 'false' || value === '') return;

    const interval = parseInt(value);
    if (isNaN(interval) || interval < 1) return;

    // Разбиваем на интервалы по N штук
    for (let start = 0; start < items.length; start += interval) {
      const end = Math.min(start + interval, items.length);
      const chunk = items.slice(start, end);

      // Если в интервале уже есть __wide-item — пропускаем
      if (chunk.some(item => item.classList.contains('__wide-item'))) continue;

      // Приоритет товарам в наличии
      const available = chunk.filter(item => !item.querySelector('.__not-available'));
      const pool = available.length > 0 ? available : chunk;

      // Проверяем сохранённый выбор (стабильность при resize)
      const previouslyChosen = pool.find(item => item.hasAttribute('data-auto-wide-chosen'));

      let chosen;
      if (previouslyChosen) {
        chosen = previouslyChosen;
      } else {
        chunk.forEach(item => item.removeAttribute('data-auto-wide-chosen'));
        chosen = pool[Math.floor(Math.random() * pool.length)];
        chosen.setAttribute('data-auto-wide-chosen', '');
      }

      chosen.classList.add('__wide-item');
      chosen.setAttribute('data-auto-wide-added', '');
    }
  }

  function fixWideItems(grid) {
    const itemSelector = getItemSelector(grid);
    let items = Array.from(grid.querySelectorAll(`:scope > ${itemSelector}`));

    // Назначаем оригинальные индексы при первом проходе
    items.forEach((item, idx) => {
      if (!item.hasAttribute('data-original-index')) {
        item.setAttribute('data-original-index', idx);
      }
    });

    // Восстанавливаем оригинальный порядок в массиве перед пересчётом,
    // в DOM итоговый порядок переносится в конце через applyItemsOrder
    items.sort((a, b) => parseInt(a.getAttribute('data-original-index')) - parseInt(b.getAttribute('data-original-index')));

    // Снимаем ранее динамически добавленные классы
    items.forEach(item => {
      if (item.hasAttribute('data-wide-inline-added')) {
        item.classList.remove('__wide-item');
        item.removeAttribute('data-wide-inline-added');
      }
    });

    // Автоматическое назначение __wide-item по интервалам
    autoWideItems(items);

    const numColumns = getColumnCount(grid);
    if (numColumns < 2) {
      applyItemsOrder(grid, items);
      items.forEach(applyPagePosterIfPageItem);
      return;
    }

    let currentCol = 0;
    let rowStartIndex = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isWide = item.classList.contains('__wide-item');
      const span = isWide ? 2 : 1;

      if (currentCol + span > numColumns) {
        // Wide item не помещается — осталась 1 колонка в строке
        if (isWide) {
          // Ищем ближайший следующий не-wide item для перестановки
          let nextNonWide = -1;
          for (let k = i + 1; k < items.length; k++) {
            if (!items[k].classList.contains('__wide-item')) {
              nextNonWide = k;
              break;
            }
          }

          if (nextNonWide !== -1) {
            const moved = items.splice(nextNonWide, 1)[0];
            items.splice(i, 0, moved);
            i--;
            continue;
          }

          // Fallback: назначаем __wide-item на случайный элемент строки
          const candidates = [];
          for (let j = rowStartIndex; j < i; j++) {
            if (!items[j].classList.contains('__wide-item') && !items[j].closest('.interesting-items')) {
              candidates.push(j);
            }
          }

          if (candidates.length > 0) {
            const available = candidates.filter(j => !items[j].querySelector('.__not-available'));
            const pool = available.length > 0 ? available : candidates;

            let storedFiller = parseInt(item.getAttribute('data-wide-filler'));
            if (isNaN(storedFiller) || !pool.includes(storedFiller)) {
              storedFiller = pool[Math.floor(Math.random() * pool.length)];
              item.setAttribute('data-wide-filler', storedFiller);
            }

            items[storedFiller].classList.add('__wide-item');
            items[storedFiller].setAttribute('data-wide-inline-added', '');
          }
        }
        currentCol = 0;
        rowStartIndex = i;
      }

      currentCol += span;
      if (currentCol >= numColumns) {
        currentCol = 0;
        rowStartIndex = i + 1;
      }
    }

    applyItemsOrder(grid, items);
    items.forEach(applyPagePosterIfPageItem);
  }

  /**
   * Переносит порядок массива items в DOM грида.
   * Перемещаются только карточки не на своём месте: перемещённый узел заново
   * запускает @starting-style у .__wide-ready > * и проявляется с opacity 0,
   * поэтому полная перестановка при resize давала моргание всей сетки.
   */
  function applyItemsOrder(grid, items) {
    const current = Array.from(grid.querySelectorAll(`:scope > ${getItemSelector(grid)}`));

    items.forEach((item, i) => {
      if (current[i] === item) return;
      grid.insertBefore(item, current[i]);
      current.splice(current.indexOf(item), 1);
      current.splice(i, 0, item);
    });
  }

  function applyPagePosterIfPageItem(item) {
    if (!item.classList.contains('page-item')) return;
    applyPagePoster(item);
  }

  /**
   * Показ грида после расстановки wide.
   * Начальная opacity 0 задана через @starting-style в CSS,
   * поэтому класс ставится сразу после расстановки wide.
   * С __wide-ready раскладка готова — взводим autoload кнопки "Показать ещё".
   */
  function revealGrid(grid) {
    if (grid.classList.contains('__wide-ready')) return;
    grid.classList.add('__wide-ready');
    setupAutoloadObserver();
  }

  function fixAllGrids() {
    grids.forEach(grid => {
      fixWideItems(grid);
      revealGrid(grid);
    });
  }


  function safeFixAllGrids() {
    window.ignoreScrollTracking = true;
    fixAllGrids();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.ignoreScrollTracking = false;
      });
    });
  }
  
  /**
   * Partial Wide Item Fix для инкрементально подгруженных карточек.
   * Назначает __wide-item только новой партии без переразметки существующих,
   * чтобы не сдвигать layout выше viewport (overflow-anchor на мобиле).
   *
   *   - data-original-index: новым карточкам, продолжая нумерацию с максимума.
   *   - autoWideItems-разметка: обрабатываем только те глобальные чанки,
   *     которые состоят целиком из новых карточек. Чанки со старыми элементами
   *     пропускаем — там разметка уже стабильно проставлена и трогать её нельзя.
   *   - Wide placement fix: проходим грид с подсчётом колонок, но swap делаем
   *     только когда обе участвующие карточки — новые. Если новая wide
   *     не помещается и нет новой не-wide для swap — снимаем у неё __wide-item.
   */
  function fixNewItemsInGrid(grid, newItems) {
    if (!grid || !newItems || newItems.length === 0) return;
    
    const itemSelector = getItemSelector(grid);
    const allItems = Array.from(grid.querySelectorAll(`:scope > ${itemSelector}`));
    const newSet = new Set(newItems);
    
    // 1. data-original-index новым карточкам
    let maxIndex = -1;
    allItems.forEach(item => {
      const idx = parseInt(item.getAttribute('data-original-index'));
      if (!isNaN(idx) && idx > maxIndex) maxIndex = idx;
    });
    let nextIdx = maxIndex + 1;
    newItems.forEach(item => {
      if (!item.hasAttribute('data-original-index')) {
        item.setAttribute('data-original-index', nextIdx++);
      }
    });
    
    // 2. Режим __all-wide: все новые допустимые карточки становятся широкими
    if (isAllWideMode()) {
      newItems.forEach(item => {
        if (item.closest('.interesting-items')) return;
        if (item.classList.contains('__wide-item')) return;
        item.classList.add('__wide-item');
        item.setAttribute('data-auto-wide-added', '');
      });
      return;
    }

    // 3. Auto-wide для новых карточек в рамках глобального чанкования
    const autoWideRaw = getComputedStyle(document.documentElement).getPropertyValue('--auto-wide-items').trim();
    const autoWideInterval = (autoWideRaw === '' || autoWideRaw === 'false') ? 0 : parseInt(autoWideRaw);
    
    if (autoWideInterval > 0) {
      const itemsForAuto = allItems.filter(item => !item.closest('.interesting-items'));
      for (let start = 0; start < itemsForAuto.length; start += autoWideInterval) {
        const end = Math.min(start + autoWideInterval, itemsForAuto.length);
        const chunk = itemsForAuto.slice(start, end);

        // Только полностью новые чанки — иначе мы трогали бы существующие карточки
        if (chunk.some(item => !newSet.has(item))) continue;
        // Уже есть __wide-item (от бэкенда) — пропускаем
        if (chunk.some(item => item.classList.contains('__wide-item'))) continue;

        const available = chunk.filter(item => !item.querySelector('.__not-available'));
        const pool = available.length > 0 ? available : chunk;
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        chosen.classList.add('__wide-item');
        chosen.setAttribute('data-auto-wide-added', '');
        chosen.setAttribute('data-auto-wide-chosen', '');
      }
    }
    
    // 4. Wide placement fix — только для новых wide
    const numColumns = getColumnCount(grid);
    if (numColumns < 2) return;
    
    const itemsAll = Array.from(grid.querySelectorAll(`:scope > ${itemSelector}`));
    let currentCol = 0;
    
    for (let i = 0; i < itemsAll.length; i++) {
      const item = itemsAll[i];
      const isWide = item.classList.contains('__wide-item');
      const span = isWide ? 2 : 1;
      
      if (currentCol + span > numColumns) {
        if (isWide && newSet.has(item)) {
          // Ищем следующую НОВУЮ не-wide для swap (не трогаем существующие)
          let nextK = -1;
          for (let k = i + 1; k < itemsAll.length; k++) {
            if (newSet.has(itemsAll[k]) && !itemsAll[k].classList.contains('__wide-item')) {
              nextK = k;
              break;
            }
          }
          if (nextK !== -1) {
            grid.insertBefore(itemsAll[nextK], item);
            const moved = itemsAll.splice(nextK, 1)[0];
            itemsAll.splice(i, 0, moved);
            i--;
            continue;
          }
          // Нет swap-кандидата — снимаем __wide-item, чтобы не оставлять пустую ячейку
          item.classList.remove('__wide-item');
          item.removeAttribute('data-auto-wide-added');
          item.removeAttribute('data-auto-wide-chosen');
          currentCol += 1;
          if (currentCol >= numColumns) currentCol = 0;
          continue;
        }
        // Существующая карточка или не-wide — просто переходим на новую строку
        currentCol = 0;
      }
      
      currentCol += span;
      if (currentCol >= numColumns) currentCol = 0;
    }
  }

  safeFixAllGrids();
  window.fixAllGrids = fixAllGrids;
  window.safeFixAllGrids = safeFixAllGrids;
  window.fixNewItemsInGrid = fixNewItemsInGrid;
  window.applyPagePosters = applyPagePosters;

  let lastResizeWidth = window.innerWidth;
  ResizeDispatcher.onResizeDebounced(() => {
    // На iOS скрытие/показ адресной строки меняет только высоту viewport.
    // Пропускаем такой resize чтобы DOM-перестановки не вызывали layout shift
    // и ложный scroll, приводящий к показу header/фильтров.
    const currentWidth = window.innerWidth;
    if (currentWidth === lastResizeWidth) return;
    lastResizeWidth = currentWidth;
    safeFixAllGrids();
  });
});
