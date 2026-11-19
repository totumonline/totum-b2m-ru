
/**
 * Панель выбора города:
 * - из корзины: mobile-right-panel __wide __city __subpanel (без тени)
 * - из чекаута: mobile-right-panel __wide __city __checkout (с тенью)
 * - из товара: mobile-right-panel __wide __city __product (с тенью)
 * - из панели адреса: mobile-right-panel __wide __city __address __half __subpanel (без тени)
 * - открытие по клику на блок города или кнопку;
 * - закрытие по клику на city--header--close или выбор города;
 * - результат выбора сохраняется в localStorage.
 */

const CITY_SEARCH_DEBOUNCE_MS = 200;
const CITY_SEARCH_MAX_LENGTH = 100;

const CITY_TEMPLATE_URL = `/interfaces/${window.interface}/fetch/city.html`;

let cityTemplateCache = null;
let citySearchDebounceTimer = null;
let citySearchAbortController = null;

/**
 * Загрузка шаблона города из city.html
 * Кешируется после первого запроса
 */
async function loadCityTemplate(panel) {
  if (!cityTemplateCache) {
    const response = await fetch(CITY_TEMPLATE_URL);
    cityTemplateCache = await response.text();
  }

  panel.innerHTML = cityTemplateCache;

  const closeButton = panel.querySelector('.city--header--close');
  if (closeButton) {
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      closeCityPanel(panel);
    });
  }

  initCitySearch(panel);
}

/**
 * Создание панели выбора города
 */
function createCityPanel(source) {
  const panel = document.createElement('section');

  if (source === 'checkout') {
    panel.className = 'mobile-right-panel __wide __city __checkout __scrollable';
  } else if (source === 'product') {
    panel.className = 'mobile-right-panel __wide __city __product __scrollable';
  } else if (source === 'address') {
    panel.className = 'mobile-right-panel __wide __city __subpanel __half __address __scrollable';
  } else {
    panel.className = 'mobile-right-panel __wide __city __subpanel __scrollable';
  }

  panel.dataset.citySource = source || 'cart';
  document.body.appendChild(panel);

  return panel;
}

/**
 * Открытие панели выбора города
 */
async function openCityPanel(source) {
  const selectorMap = {
    'checkout': '.mobile-right-panel.__checkout',
    'product': '.mobile-right-panel.__product',
    'address': '.mobile-right-panel.__address'
  };
  const selector = selectorMap[source] || '.mobile-right-panel.__subpanel';
  const existing = document.querySelector(selector);
  if (existing) return;

  window.lockPanelScroll(); // общая блокировка страницы из header.js — для подпанели корзины только увеличит счётчик, так что блокировка корзины сохранится

  const panel = createCityPanel(source);
  await loadCityTemplate(panel);

  panel.classList.add('__active');
  const input = panel.querySelector('#city-search-input');
  if (input) input.focus();
}

/**
 * Закрытие панели выбора города
 */
function closeCityPanel(panel) {
  if (!panel) {
    panel = document.querySelector('.mobile-right-panel.__subpanel') ||
            document.querySelector('.mobile-right-panel.__checkout') ||
            document.querySelector('.mobile-right-panel.__product') ||
            document.querySelector('.mobile-right-panel.__address');
  }
  if (!panel) return;

  if (citySearchDebounceTimer) {
    clearTimeout(citySearchDebounceTimer);
    citySearchDebounceTimer = null;
  }
  if (citySearchAbortController) {
    citySearchAbortController.abort();
    citySearchAbortController = null;
  }

  window.unlockPanelScroll();

  panel.classList.remove('__active');

  setTimeout(() => {
    panel.remove();
  }, 300);
}

/**
 * Инициализация обработчика кнопки выбора города
 */
function initCityPanel(cartPanel) {
  const selectCityButton = cartPanel.querySelector('.cart--delivery--select-city');
  if (selectCityButton) {
    selectCityButton.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel();
    });
  }

  const citySelectedBlock = cartPanel.querySelector('.cart--delivery--city--selected--block');
  if (citySelectedBlock) {
    citySelectedBlock.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel();
    });
  }
}

/**
 * Search Cities
 * Отслеживание ввода в #city-search-input с дебоунсом 200 мс.
 * Отправляет GET-запрос на /get-endpoints/getSearchCities (SEARCH=строка до 100 символов).
 * Если в строке есть пробел — первое слово уходит в SEARCH, второе в SECOND, остальное отбрасывается.
 * Эндпойнт возвращает готовый html — .city--results--items или .city--nothing-found,
 * который подставляется после блока подсказок.
 * Предыдущие результаты удаляются: пустой ответ — блока в DOM не будет.
 */

/**
 * Удаляет из панели блоки результатов предыдущего запроса
 */
function clearCityResults(panel) {
  panel.querySelectorAll('.city--results--items, .city--nothing-found').forEach((node) => node.remove());
}

/**
 * Полный сброс: отменяет запрос в полёте и удаляет блоки результатов из DOM
 */
function resetCityResults(panel) {
  if (citySearchAbortController) {
    citySearchAbortController.abort();
    citySearchAbortController = null;
  }

  clearCityResults(panel);
}

/**
 * Подстановка html ответа в панель после .city--results--suggestions
 */
function applyCityResults(panel, html) {
  const suggestionsBlock = panel.querySelector('.city--results--suggestions');

  if (!suggestionsBlock) return;

  clearCityResults(panel);

  if (typeof html !== 'string' || !html.trim()) return;

  suggestionsBlock.insertAdjacentHTML('afterend', html);

  const itemsBlock = panel.querySelector('.city--results--items');
  if (itemsBlock) itemsBlock.classList.add('__active');
}

/**
 * Запрос списка городов и обновление блока результатов
 */
function fetchSearchCities(panel, query) {
  if (citySearchAbortController) {
    citySearchAbortController.abort();
  }
  citySearchAbortController = new AbortController();

  const words = query.split(/\s+/).filter(Boolean);

  const params = new URLSearchParams();
  params.set('SEARCH', words[0] || query);
  if (words.length > 1) {
    params.set('SECOND', words[1]);
  }

  fetch('/get-endpoints/getSearchCities?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { 'Accept': 'text/html' },
    signal: citySearchAbortController.signal
  })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    })
    .then(html => {
      // Панель могли закрыть, пока шёл запрос
      if (!panel.isConnected) return;

      applyCityResults(panel, html);
    })
    .catch(error => {
      if (error.name === 'AbortError') return;
      console.error('City search request failed:', error);
    });
}

/**
 * Поиск города:
 * - показ/скрытие кнопки очистки при наличии текста в input;
 * - переключение __active блока подсказок при вводе;
 * - клик по городу: закрытие панели и обновление данных в корзине;
 * - при смене города витрины из sessionStorage удаляется cart_delivery_id (выбранная доставка корзины);
 * - при смене data-city-id у cart--delivery--city на нем вызывается событие cart-city-change (корзина перезапрашивает рассчитанную доставку в фоне);
 * - при смене data-city-id у ---delivery--city на нем вызывается событие product-city-change (товар перезапрашивает рассчитанную доставку в фоне).
 */
function initCitySearch(panel) {
  const input = panel.querySelector('#city-search-input');
  const clearButton = panel.querySelector('.city--search--block .__clear');
  const suggestionsBlock = panel.querySelector('.city--results--suggestions');

  if (!input || !clearButton || !suggestionsBlock) return;

  function updateVisibility() {
    const hasText = input.value.trim().length > 0;

    if (hasText) {
      suggestionsBlock.classList.remove('__active');
      clearButton.classList.add('__active');
    } else {
      suggestionsBlock.classList.add('__active');
      clearButton.classList.remove('__active');
    }
  }

  suggestionsBlock.classList.add('__active');

  input.addEventListener('input', () => {
    updateVisibility();

    if (citySearchDebounceTimer) {
      clearTimeout(citySearchDebounceTimer);
    }

    citySearchDebounceTimer = setTimeout(() => {
      citySearchDebounceTimer = null;

      const query = input.value.trim().slice(0, CITY_SEARCH_MAX_LENGTH);

      if (!query) {
        // Поле очищено — отменяем запрос в полёте и убираем результаты
        resetCityResults(panel);
        return;
      }

      fetchSearchCities(panel, query);
    }, CITY_SEARCH_DEBOUNCE_MS);
  });

  clearButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (citySearchDebounceTimer) {
      clearTimeout(citySearchDebounceTimer);
      citySearchDebounceTimer = null;
    }

    input.value = '';
    resetCityResults(panel);
    updateVisibility();
    input.focus();
  });

  panel.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-city-id]');
    if (!li) return;

    e.preventDefault();
    e.stopPropagation();

    const cityId = li.dataset.cityId;
    const cityName = li.dataset.city;
    const cityRegion = li.dataset.region;
    // В блоках города под названием показываем полный адрес, а не только регион
    const cityAddress = li.dataset.cityAddress || cityRegion;
    const source = panel.dataset.citySource;

    // у адреса и чекаута свой город, город витрины они не меняют
    if (source !== 'address' && source !== 'checkout') {
      if (localStorage.getItem('selected_city_id') !== cityId) {
        sessionStorage.removeItem('cart_delivery_id');
      }

      localStorage.setItem('selected_city_id', cityId);
      localStorage.setItem('selected_city', cityName);
      localStorage.setItem('selected_region', cityRegion);
      localStorage.setItem('selected_city_address', cityAddress);
    }

    if (source === 'checkout') {
      const cityBlock = document.querySelector('.---shipping-methods--city');
      if (cityBlock && cityBlock.dataset.cityId !== cityId) {
        setCheckoutCity(cityId).then(applied => {
          if (!applied) return;

          cityBlock.dataset.cityId = cityId;

          const selectedEl = cityBlock.querySelector('.---shipping-methods--city--selected');
          if (selectedEl) selectedEl.textContent = cityName;

          const regionEl = cityBlock.querySelector('.---shipping-methods--city--region');
          if (regionEl) regionEl.textContent = cityAddress;
        });
      }
    } else if (source === 'product') {
      const cityBlock = document.querySelector('.---delivery--city');
      if (cityBlock) {
        const cityChanged = cityBlock.dataset.cityId !== cityId;
        cityBlock.dataset.cityId = cityId;

        const selectedEl = cityBlock.querySelector('.---delivery--city--selected');
        if (selectedEl) selectedEl.textContent = cityName;

        const regionEl = cityBlock.querySelector('.---delivery--city--region');
        if (regionEl) regionEl.textContent = cityAddress;

        if (cityChanged) cityBlock.dispatchEvent(new CustomEvent('product-city-change', { bubbles: true }));
      }
    } else if (source === 'address') {
      const cityBlock = document.querySelector('.mobile-right-panel--city');
      if (cityBlock) {
        cityBlock.dataset.cityId = cityId;

        const selectedEl = cityBlock.querySelector('.mobile-right-panel--city--selected');
        if (selectedEl) selectedEl.textContent = cityName;

        const regionEl = cityBlock.querySelector('.mobile-right-panel--city--region');
        if (regionEl) regionEl.textContent = cityAddress;
      }
    } else {
      const cityContainer = document.querySelector('.cart--delivery--city');
      if (cityContainer) {
        const cityChanged = cityContainer.dataset.cityId !== cityId;
        cityContainer.dataset.cityId = cityId;

        const selectedEl = cityContainer.querySelector('.cart--delivery--city--selected');
        if (selectedEl) selectedEl.textContent = cityName;

        const regionEl = cityContainer.querySelector('.cart--delivery--city--region');
        if (regionEl) regionEl.textContent = cityAddress;

        if (cityChanged) cityContainer.dispatchEvent(new CustomEvent('cart-city-change', { bubbles: true }));
      }
    }

    closeCityPanel(panel);
  });
}

/**
 * Инициализация обработчика выбора города на странице чекаута
 */
function initCityPanelCheckout() {
  if (document.querySelector('.checkout.__blocked')) return;

  const selectCityButton = document.querySelector('.---shipping-methods--select-city');
  if (selectCityButton) {
    selectCityButton.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel('checkout');
    });
  }

  const citySelectedBlock = document.querySelector('.---shipping-methods--city--selected--block');
  if (citySelectedBlock) {
    citySelectedBlock.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel('checkout');
    });
  }
}

/**
 * Инициализация обработчика выбора города на странице товара
 */
function initCityPanelProduct() {
  const selectCityButton = document.querySelector('.---delivery--select-city');
  if (selectCityButton) {
    selectCityButton.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel('product');
    });
  }

  const citySelectedBlock = document.querySelector('.---delivery--city--selected--block');
  if (citySelectedBlock) {
    citySelectedBlock.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel('product');
    });
  }
}

/**
 * City Panel (product):
 * Закрытие панели выбора города по клику вне панели
 */
document.addEventListener('click', (e) => {
  const cityPanel = document.querySelector('.mobile-right-panel.__product');
  if (!cityPanel) return;

  if (!cityPanel.contains(e.target)) {
    closeCityPanel(cityPanel);
  }
});

/**
 * Инициализация обработчика выбора города в панели адреса
 * Панель адреса приезжает фетчем, поэтому обработчики вешаются на переданный элемент
 */
function initCityPanelAddress(addressPanel) {
  const selectCityButton = addressPanel.querySelector('.mobile-right-panel--select-city');
  if (selectCityButton) {
    selectCityButton.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel('address');
    });
  }

  const citySelectedBlock = addressPanel.querySelector('.mobile-right-panel--city--selected--block');
  if (citySelectedBlock) {
    citySelectedBlock.addEventListener('click', (e) => {
      e.stopPropagation();
      openCityPanel('address');
    });
  }
}

/**
 * City Panel (address):
 * Закрытие панели выбора города по клику вне панели
 */
document.addEventListener('click', (e) => {
  const cityPanel = document.querySelector('.mobile-right-panel.__address');
  if (!cityPanel) return;

  if (!cityPanel.contains(e.target)) {
    closeCityPanel(cityPanel);
  }
});

/**
 * City Panel:
 * Закрытие панели выбора города по Escape
 */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  const cityPanel = document.querySelector('.mobile-right-panel.__subpanel') ||
                    document.querySelector('.mobile-right-panel.__checkout') ||
                    document.querySelector('.mobile-right-panel.__product') ||
                    document.querySelector('.mobile-right-panel.__address');
  if (!cityPanel) return;

  e.stopImmediatePropagation();
  closeCityPanel(cityPanel);
});

/**
 * Default City
 * Если в localStorage нет selected_city_id — город определяется по ip посетителя:
 * POST /post-endpoints/getCity (ip берется на бэке из REMOTE_ADDR и уходит в темплейт как $#user_ip),
 * ответ — json {fias_id, city, address}, который пишется в selected_city_id, selected_city и selected_city_address.
 * Если пока шел запрос город выбрали вручную — ответ не применяется.
 * После записи на странице товара блок ---delivery--city обновляется через loadSavedCity из product.js.
 */
function initDefaultCity() {
  if ((localStorage.getItem('selected_city_id') || '').trim()) return;

  fetch('/post-endpoints/getCity', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  })
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      // темплейт может вернуть уже закодированную json-строку — тогда она приходит закодированной дважды
      if (typeof data === 'string') data = JSON.parse(data);
      if (!data || !data.fias_id) return;

      if ((localStorage.getItem('selected_city_id') || '').trim()) return;

      localStorage.setItem('selected_city_id', data.fias_id);
      localStorage.setItem('selected_city', data.city || '');
      localStorage.setItem('selected_city_address', data.address || '');

      if (typeof loadSavedCity === 'function') loadSavedCity();
    })
    .catch(error => {
      console.error('Default city request failed:', error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  initDefaultCity();

  if (document.querySelector('.---shipping-methods--city')) {
    initCityPanelCheckout();
  }

  if (document.querySelector('.---delivery--city')) {
    initCityPanelProduct();
  }
});
