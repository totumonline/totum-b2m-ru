
/**
 * Панель корзины (mobile-right-panel __wide):
 * - открытие/закрытие по клику;
 * - без ограничения по ширине экрана — работает и на десктопе;
 * - закрытие по клику вне панели, по Escape;
 * - анимация иконки (зеркальная);
 * - взаимное закрытие других мобильных панелей.
 */

const CART_ENDPOINT_URL = '/post-endpoints/cart';
const CHECKOUT_ENDPOINT_URL = '/post-endpoints/createCheckout';
const CART_DELIVERY_ENDPOINT_URL = '/post-endpoints/cartDelivery';
const CHECKOUT_PAGE_URL = '/checkout/';
const CART_EXCLUDED_STORAGE_KEY = 'cart_excluded';
const CART_PROMO_STORAGE_KEY = 'cart_promo';
const CART_DELIVERY_STORAGE_KEY = 'cart_delivery_id';
const DELIVERY_LOADING_MIN_MS = 1000;
const PROMO_DESCRIPTION_ENDPOINT_URL = '/get-endpoints/promoDescription';

window.closeMobileCartPanel = null;

document.addEventListener('DOMContentLoaded', () => {
  const basketButton = document.querySelector('.header--main--actions--basket button');

  if (!basketButton) return;

  const accountCartButton = document.querySelector('.account--info--links--cart');

  let cartPanel = null;
  let cartPromo = sessionStorage.getItem(CART_PROMO_STORAGE_KEY) || '';
  let iconElement = basketButton.querySelector('i');

  if (!iconElement) return;

  /**
   * Загрузка сохранённого города из localStorage в блок cart--delivery--city
   */
  function loadSavedCityCart(panel) {
    const cityBlock = panel.querySelector('.cart--delivery--city');
    if (!cityBlock) return;

    const cityId = localStorage.getItem('selected_city_id');
    const cityName = localStorage.getItem('selected_city');
    const cityAddress = localStorage.getItem('selected_city_address') || localStorage.getItem('selected_region');

    if (!cityId) return;

    cityBlock.dataset.cityId = cityId;

    const selectedEl = cityBlock.querySelector('.cart--delivery--city--selected');
    if (selectedEl) selectedEl.textContent = cityName || '';

    const regionEl = cityBlock.querySelector('.cart--delivery--city--region');
    if (regionEl) regionEl.textContent = cityAddress || '';
  }

  /**
   * Корзина для запросов cart и cartDelivery
   * Содержимое localStorage.cart, позициям из списка исключенных (sessionStorage) добавляется exclude: true
   */
  function buildCartWithExclude() {
    const excludedShas = readExcludedShas();
    return readLocalCart().map(row => excludedShas.includes(String(row.sha)) ? { ...row, exclude: true } : row);
  }

  /**
   * Запрос html корзины с эндпойнта /post-endpoints/cart по текущему localStorage.cart
   * Если применен промокод — он уходит в ключе PROMO
   */
  async function requestCartHtml() {
    const params = new URLSearchParams();
    params.set('CART', JSON.stringify(buildCartWithExclude()));
    if (cartPromo) params.set('PROMO', cartPromo);

    const response = await fetch(CART_ENDPOINT_URL, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params.toString()
    });

    return response.text();
  }

  /**
   * Загрузка html корзины с эндпойнта /post-endpoints/cart
   * В ключе CART передается содержимое localStorage.cart
   * Если доставка была рассчитана (корзина изменилась в другой вкладке или из cart_history) — она перезапрашивается
   */
  async function loadCartTemplate(panel) {
    await syncLocalCartFromServer();
    await renderCartTemplate(panel);
    refreshDeliveryResults(panel);
  }

  /**
   * Отрисовка html корзины в panel и инициализация её элементов
   * animate — цифры переходят от старых значений к новым через scramble-анимацию
   * Рассчитанная доставка переносится в новую разметку (промокод и другие перерисовки ее не сбрасывают)
   * Если summary--on-request-info уже был показан — после перерисовки он получает __static (без анимации появления)
   */
  async function renderCartTemplate(panel, animate = false) {
    const html = await requestCartHtml();
    const snapshot = animate ? snapshotCartNumbers(panel) : null;
    const promoWasActive = !!panel.querySelector('.cart--promo-result.__active');
    const bannersWereVisible = !!panel.querySelector('.cart--promo-banners:not(.__disabled) .---cart-promo-banner');
    const onRequestInfoWasActive = !!panel.querySelector('.summary--on-request-info.__active');
    const deliveryHtml = snapshotDeliveryResults(panel);

    panel.innerHTML = html;

    if (snapshot) restoreCartNumbers(panel, snapshot);
    restoreDeliveryResults(panel, deliveryHtml);

    loadSavedCityCart(panel);
    if (onRequestInfoWasActive) {
      const onRequestInfo = panel.querySelector('.summary--on-request-info');
      if (onRequestInfo) onRequestInfo.classList.add('__static');
    }
    initCartItems(panel, animate);
    initPromoInput(panel, promoWasActive);
    if (bannersWereVisible) {
      const banners = panel.querySelector('.cart--promo-banners');
      if (banners) banners.classList.add('__static');
    }
    initCityPanel(panel);
    initAddFromHistory(panel);
    initCheckoutButton(panel);
    initGetDeliveryButton(panel);

    const closeButton = panel.querySelector('.cart--header--close');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCartPanel();
      });
    }

    const returnButton = panel.querySelector('.summary--return');
    if (returnButton) {
      returnButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeCartPanel();
      });
    }
  }

  /**
   * Добавление товаров из cart_history
   * Кнопка cart--add-from-history показывается, только если в LS cart_history валидный непустой json-список (не added)
   * По клику содержимое cart_history уходит на updateCart, ответ пишется в LS.cart,
   * в cart_history пишется added, панель перерисовывается
   */
  function initAddFromHistory(panel) {
    const button = panel.querySelector('.cart--add-from-history');
    if (!button) return;

    if (!document.querySelector('.header--main--actions--user.__account_active')) return;

    const historyJson = localStorage.getItem(ADD_TO_CART_CONFIG.historyStorageKey);
    if (!isValidCartHistory(historyJson)) return;

    button.classList.remove('__hidden');

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (button.classList.contains('__disabled')) return;

      button.classList.add('__disabled');

      try {
        const cartJson = await requestUpdateCart(historyJson);
        localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
        localStorage.setItem(ADD_TO_CART_CONFIG.historyStorageKey, ADD_TO_CART_CONFIG.historyAddedValue);
        updateCartBadge(parseLocalCart(cartJson));
        await loadCartTemplate(panel);
      } catch (err) {
        button.classList.remove('__disabled');
        if (err && err.cartError) {
          showCartButtonError(button, err.cartError);
        }
      }
    });
  }

  /**
   * Оформление заказа
   * Кнопка summary--checkout отправляет на /post-endpoints/createCheckout содержимое LS.cart
   * без позиций с классом __exclude (сверка по data-sha)
   * Если у cart--delivery--city есть непустой data-city-id — он уходит в CITY
   * Если в cart--delivery--results есть li с __checked — его data-delivery-id уходит в DELIVERY
   * Так же работает и ---cart-item--buy-button (через runCheckout)
   * Ответ json: error — текст ошибки на кнопке на 5 секунд, checkout — номер заказа,
   * по нему уходим на /checkout/[номер]
   */
  function buildCheckoutCart(panel) {
    const excludedShas = Array.from(panel.querySelectorAll('.---cart-item.__exclude'))
      .map(item => item.dataset.sha)
      .filter(Boolean);

    return readLocalCart().filter(row => !excludedShas.includes(String(row.sha)));
  }

  function getCheckoutCityId(panel) {
    const cityBlock = panel.querySelector('.cart--delivery--city');
    if (!cityBlock) return '';

    return (cityBlock.dataset.cityId || '').trim();
  }

  function getCheckoutDeliveryId(panel) {
    const checkedItem = panel.querySelector('.cart--delivery--results li.__checked');
    if (!checkedItem) return '';

    return (checkedItem.dataset.deliveryId || '').trim();
  }

  async function runCheckout(panel, button, cart) {
    if (cart.length === 0) return;

    button.classList.add('__disabled');

    let result;

    try {
      result = await requestCheckout(JSON.stringify(cart), getCheckoutCityId(panel), cartPromo, getCheckoutDeliveryId(panel));
    } catch (err) {
      button.classList.remove('__disabled');
      showCartButtonError(button, err && err.cartError ? err.cartError : 'Ошибка оформления заказа');
      return;
    }

    button.classList.remove('__disabled');

    if (!result.checkout) {
      showCartButtonError(button, 'Ошибка оформления заказа');
      return;
    }

    window.location.href = CHECKOUT_PAGE_URL + encodeURIComponent(String(result.checkout));
  }

  function initCheckoutButton(panel) {
    const button = panel.querySelector('.summary--checkout');
    if (!button) return;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (button.classList.contains('__disabled') || button.classList.contains('__error')) return;

      await runCheckout(panel, button, buildCheckoutCart(panel));
    });
  }

  /**
   * Расчет доставки
   * Кнопка cart--delivery--get-delivery отправляет на /post-endpoints/cartDelivery
   * На время запроса кнопка получает __disabled и текст «Запрашиваю данные», cart--delivery--loading — __active (полоска прогресса)
   * CART — содержимое LS.cart с exclude у исключенных позиций, CITY — data-city-id у cart--delivery--city, если не пустой, FOR_CART=true
   * Ответ html вставляется в cart--delivery--results ul, кнопке ставится __hidden, cart--delivery--results — __active
   * __checked ставится на li с data-delivery-id из sessionStorage (cart_delivery_id), если такого нет — на первый
   * При ошибке текст ошибки показывается на кнопке
   */
  async function requestCartDelivery(panel) {
    const params = new URLSearchParams();
    params.set('CART', JSON.stringify(buildCartWithExclude()));

    const cityId = getCheckoutCityId(panel);
    if (cityId) params.set('CITY', cityId);
    params.set('FOR_CART', 'true');

    const response = await fetch(CART_DELIVERY_ENDPOINT_URL, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    return response.text();
  }

  function applyCheckedDelivery(deliveryList, preferredId = '') {
    const items = Array.from(deliveryList.querySelectorAll('li[data-delivery-id]'));
    if (items.length === 0) return;

    const targetId = preferredId || sessionStorage.getItem(CART_DELIVERY_STORAGE_KEY) || '';
    const checkedItem = items.find(li => li.dataset.deliveryId === targetId) || items[0];

    items.forEach(li => li.classList.remove('__checked'));
    checkedItem.classList.add('__checked');
  }

  function initGetDeliveryButton(panel) {
    const button = panel.querySelector('.cart--delivery--get-delivery');
    const results = panel.querySelector('.cart--delivery--results');
    const deliveryList = results ? results.querySelector('ul') : null;
    if (!button || !deliveryList) return;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (button.classList.contains('__disabled') || button.classList.contains('__error')) return;

      const buttonText = button.textContent;
      button.classList.add('__disabled');
      button.textContent = 'Запрашиваю данные';
      setDeliveryLoading(panel, true);

      const startedAt = Date.now();
      let html;

      try {
        html = await requestCartDelivery(panel);
        await waitDeliveryLoadingMin(startedAt);
      } catch (err) {
        await waitDeliveryLoadingMin(startedAt);
        setDeliveryLoading(panel, false);
        button.classList.remove('__disabled');
        button.textContent = buttonText;
        showCartButtonError(button, 'Ошибка расчета доставки');
        return;
      }

      setDeliveryLoading(panel, false);
      button.classList.remove('__disabled');
      button.textContent = buttonText;
      deliveryList.innerHTML = html;
      applyCheckedDelivery(deliveryList);
      button.classList.add('__hidden');
      results.classList.add('__active');
      updateAllItems(panel, true);
    });
  }

  /**
   * Сброс рассчитанной доставки
   * cart--delivery--results ul очищается, у cart--delivery--results снимается __active,
   * у кнопки cart--delivery--get-delivery снимается __hidden,
   * текущее обновление доставок отменяется и cart--delivery--loading скрывается
   * Вызывается при ошибке обновления доставок и при очистке корзины (cart--header--title--delete-all)
   */
  function resetDeliveryResults(panel) {
    panel._deliveryRefreshRequest = null;
    setDeliveryLoading(panel, false);

    const results = panel.querySelector('.cart--delivery--results');
    if (results) {
      results.classList.remove('__active');
      const deliveryList = results.querySelector('ul');
      if (deliveryList) deliveryList.innerHTML = '';
    }

    const button = panel.querySelector('.cart--delivery--get-delivery');
    if (button) button.classList.remove('__hidden');
  }

  /**
   * Обновление рассчитанной доставки при изменении состава корзины и смене города:
   * количество (---quantity--amount), удаление (---quantity--remove), постановка/снятие __exclude, перезагрузка корзины,
   * смена города (cart-city-change)
   * Если cart--delivery--results в __active — после обновления LS.cart (localCartUpdate, если передан)
   * асинхронно перезапрашивается /post-endpoints/cartDelivery, изменения корзины при этом не блокируются
   * На время запроса у cart--delivery--loading стоит __active (полоска прогресса и надпись)
   * Полученные li заменяют список, __checked ставится на вариант, который был выбран, если его нет — на первый
   * cart--delivery--results появляется заново с анимацией (__static снимается, анимация перезапускается)
   * Элементы ищутся в panel в момент ответа — корзина могла быть перерисована во время запроса
   * Ответ предыдущего запроса игнорируется, если уже ушел следующий; при ошибке доставка сбрасывается
   */
  async function refreshDeliveryResults(panel, localCartUpdate) {
    if (!panel.querySelector('.cart--delivery--results.__active ul')) return;

    const request = Symbol();
    panel._deliveryRefreshRequest = request;
    setDeliveryLoading(panel, true);

    const startedAt = Date.now();
    let html = null;

    try {
      await localCartUpdate;
      html = await requestCartDelivery(panel);
    } catch (err) {
      html = null;
    }

    await waitDeliveryLoadingMin(startedAt);

    if (panel._deliveryRefreshRequest !== request) return;

    panel._deliveryRefreshRequest = null;
    setDeliveryLoading(panel, false);

    if (html === null) {
      resetDeliveryResults(panel);
      updateAllItems(panel, true);
      return;
    }

    const deliveryList = panel.querySelector('.cart--delivery--results ul');
    if (!deliveryList) return;

    const checkedItem = deliveryList.querySelector('li.__checked');
    const previousId = checkedItem ? checkedItem.dataset.deliveryId || '' : '';

    deliveryList.innerHTML = html;
    applyCheckedDelivery(deliveryList, previousId);
    replayDeliveryResultsAnimation(panel);
    updateAllItems(panel, true);
  }

  function replayDeliveryResultsAnimation(panel) {
    const results = panel.querySelector('.cart--delivery--results');
    if (!results) return;

    results.classList.remove('__active', '__static');
    void results.offsetWidth;
    results.classList.add('__active');
  }

  /**
   * Ожидание данных по доставкам
   * cart--delivery--loading получает __active (полоска прогресса и надпись),
   * cart--delivery--free — __wait_data (полупрозрачный, логика бесплатной доставки не работает до получения новых li)
   * Ответ обрабатывается не раньше DELIVERY_LOADING_MIN_MS с начала запроса (см. waitDeliveryLoadingMin)
   */
  function setDeliveryLoading(panel, isLoading) {
    const loading = panel.querySelector('.cart--delivery--loading');
    if (loading) loading.classList.toggle('__active', isLoading);

    const freeEl = panel.querySelector('.cart--delivery--free');
    if (freeEl) freeEl.classList.toggle('__wait_data', isLoading);
  }

  /**
   * Сохранение рассчитанной доставки при перерисовке корзины
   * Если cart--delivery--results в __active — запоминается html списка li (вместе с __checked),
   * после перерисовки список возвращается, cart--delivery--results получает __active __static (без анимации появления),
   * кнопка cart--delivery--get-delivery — __hidden, если обновление доставок еще идет — cart--delivery--loading получает __active
   */
  function snapshotDeliveryResults(panel) {
    const deliveryList = panel.querySelector('.cart--delivery--results.__active ul');
    return deliveryList ? deliveryList.innerHTML : null;
  }

  function restoreDeliveryResults(panel, deliveryHtml) {
    if (deliveryHtml === null) return;

    const results = panel.querySelector('.cart--delivery--results');
    const deliveryList = results ? results.querySelector('ul') : null;
    if (!deliveryList) return;

    deliveryList.innerHTML = deliveryHtml;
    results.classList.add('__active', '__static');

    const button = panel.querySelector('.cart--delivery--get-delivery');
    if (button) button.classList.add('__hidden');

    if (panel._deliveryRefreshRequest) setDeliveryLoading(panel, true);
  }

  /**
   * Изменение количества позиции в LS.cart с запуском обновления доставок
   * Возвращает promise обновления LS.cart, обновление доставок идет параллельно и его не ждет
   */
  function updateItemQuantityWithDelivery(panel, item, quantity) {
    const localCartUpdate = updateLocalCartQuantity(item.dataset.sha, quantity);
    refreshDeliveryResults(panel, localCartUpdate);
    return localCartUpdate;
  }

  /**
   * Заказ одной позиции
   * Кнопка ---cart-item--buy-button внутри товара отправляет в чекаут только строку LS.cart
   * с ее data-sha — остальные позиции и классы __exclude не учитываются
   * CITY и DELIVERY (выбранная доставка корзины) уходят так же, как у summary--checkout
   */
  function initItemBuyButtons(panel) {
    panel.addEventListener('click', async (e) => {
      const button = e.target.closest('.---cart-item--buy-button');
      if (!button) return;

      e.preventDefault();
      e.stopPropagation();

      if (button.classList.contains('__disabled') || button.classList.contains('__error')) return;

      const item = button.closest('.---cart-item');
      if (!item || !item.dataset.sha) return;

      const row = readLocalCart().find(r => String(r.sha) === item.dataset.sha);
      if (!row) return;

      await runCheckout(panel, button, [row]);
    });
  }

  function createCartPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __scrollable __cart';

    document.body.appendChild(panel);

    return panel;
  }

  /**
   * Делегированные обработчики панели корзины
   * Вешаются на panel один раз при её создании — содержимое panel перерисовывается
   * через loadCartTemplate, а обработчики на самой panel переживают перерисовку
   */
  function initCartPanelDelegates(panel) {
    initCartItemsDelegates(panel);
    initPromoBanners(panel);
    initItemBuyButtons(panel);
    initCityChangeRefresh(panel);
  }

  /**
   * Смена города доставки
   * city.js вызывает cart-city-change на cart--delivery--city при смене data-city-id —
   * если доставка рассчитана, она перезапрашивается в фоне с лоадером без закрытия списка (refreshDeliveryResults)
   */
  function initCityChangeRefresh(panel) {
    panel.addEventListener('cart-city-change', () => {
      refreshDeliveryResults(panel);
    });
  }

  /**
   * Открытие панели корзины
   * options.getDelivery — после загрузки шаблона сразу запускается расчет доставки
   * (клик по cart--delivery--get-delivery, если она есть и не скрыта), если панель за это время не закрыли
   * Используется ---delivery--free--open-cart на странице товара (window.openMobileCartPanel({ getDelivery: true }))
   */
  function openCartPanel(options = {}) {
    if (cartPanel) return;

    const searchDropdown = document.querySelector('.header--main--catalog--search--dropdown');
    if (searchDropdown) searchDropdown.classList.remove('__active');

    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }

    if (typeof window.closeMobileSubmenuPanels === 'function') {
      window.closeMobileSubmenuPanels();
    }

    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }

    if (typeof window.closeMobileSearchPanel === 'function') {
      window.closeMobileSearchPanel();
    }

    if (typeof window.closeMobileFilterPanel === 'function') {
      window.closeMobileFilterPanel();
    }

    if (typeof window.closeMobileOrderByPanel === 'function') {
      window.closeMobileOrderByPanel();
    }

    if (typeof window.closeSelectOptionMobilePanel === 'function') {
      window.closeSelectOptionMobilePanel();
    }

    if (typeof window.closeMobileVideoPanel === 'function') {
      window.closeMobileVideoPanel();
    }

    if (typeof window.closeMobileConfiguratorPanel === 'function') {
      window.closeMobileConfiguratorPanel();
    }

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    const panel = createCartPanel();
    cartPanel = panel;
    initCartPanelDelegates(panel);
    loadCartTemplate(panel).then(() => {
      if (!options || !options.getDelivery || cartPanel !== panel) return;

      const getDeliveryButton = panel.querySelector('.cart--delivery--get-delivery');
      if (getDeliveryButton && !getDeliveryButton.classList.contains('__hidden')) getDeliveryButton.click();
    });

    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(-100%)';

    setTimeout(() => {
      iconElement.classList.remove('fa-cart-shopping');
      iconElement.classList.add('fa-xmark');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(100%)';

      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);

    cartPanel.classList.add('__active');
  }

  function closeCartPanel() {
    if (!cartPanel) return;

    cartPanel.classList.remove('__active');

    window.unlockPanelScroll();

    // город могли сменить в корзине — синхронизируем ---delivery--city на странице товара из LS
    if (typeof loadSavedCity === 'function') loadSavedCity();

    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(100%)';

    setTimeout(() => {
      iconElement.classList.remove('fa-xmark');
      iconElement.classList.add('fa-cart-shopping');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(-100%)';

      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);

    setTimeout(() => {
      if (cartPanel) {
        cartPanel.remove();
        cartPanel = null;
      }
    }, 300);
  }

  function toggleCartPanel() {
    if (cartPanel) {
      closeCartPanel();
    } else {
      openCartPanel();
    }
  }

  /**
   * Корзина: количество, цены, итого
   * Обработка кнопок increase / decrease / remove
   * Пересчёт стоимости позиций и общей суммы
   * Позиции с data-on-request="true" — в data-price текст, он ставится в ---cart-item--price с __on_request,
   * старая цена не показывается, итоговые суммы не считаются (см. hasOnRequestItems)
   */
  function formatPrice(value) {
    const [intPart, fracPart] = Number(value).toFixed(2).split('.');
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') + ',' + fracPart;
  }


  function getAmountValue(amountEl) {
    return parseInt(amountEl.tagName === 'INPUT' ? amountEl.value : amountEl.textContent, 10) || 0;
  }

  function setAmountValue(amountEl, val) {
    if (amountEl.tagName === 'INPUT') {
      amountEl.value = val;
    } else {
      amountEl.textContent = val;
    }
  }

  /**
   * Снимок цифр корзины для анимации при перерисовке
   * Перед заменой html значения запоминаются, после — подставляются в новые элементы,
   * чтобы updateAllItems анимировал только изменившиеся цифры
   * Значения товаров сопоставляются по data-sha
   */
  const CART_NUMBER_SELECTORS = [
    '.---cart-item--price',
    '.---cart-item--points',
    '.---cart-item--old-price',
    '.---cart-item--discount',
    '.cart--header--title--count',
    '#summary-products .summary--row--value',
    '#summary-all-discount .summary--row--value',
    '#summary-delivery .summary--row--value',
    '.summary--points',
    '.summary--total--value'
  ];

  function getCartNumberKey(el, selector) {
    const item = el.closest('.---cart-item');
    return (item ? item.dataset.sha : '') + '|' + selector;
  }

  function snapshotCartNumbers(panel) {
    const snapshot = new Map();

    CART_NUMBER_SELECTORS.forEach(selector => {
      panel.querySelectorAll(selector).forEach(el => {
        snapshot.set(getCartNumberKey(el, selector), el.textContent);
      });
    });

    return snapshot;
  }

  function restoreCartNumbers(panel, snapshot) {
    panel.querySelectorAll('.---cart-item').forEach(item => {
      if (snapshot.has(item.dataset.sha + '|.---cart-item--old-price')) ensureOldPriceBlock(item);
    });

    CART_NUMBER_SELECTORS.forEach(selector => {
      panel.querySelectorAll(selector).forEach(el => {
        const key = getCartNumberKey(el, selector);
        if (snapshot.has(key)) el.textContent = snapshot.get(key);
      });
    });
  }

  function ensureOldPriceBlock(item) {
    let oldBlock = item.querySelector('.---cart-item--old-price--block');
    if (oldBlock) return oldBlock;

    oldBlock = document.createElement('div');
    oldBlock.className = '---cart-item--old-price--block';
    oldBlock.innerHTML = '<div class="---cart-item--discount"></div><div class="---cart-item--old-price"></div>';
    const quantityOldBlock = item.querySelector('.---cart-item--price--quantity-old--block');
    quantityOldBlock.appendChild(oldBlock);

    return oldBlock;
  }

  function isOnRequestItem(item) {
    return item.dataset.onRequest === 'true';
  }

  function updateItemPrice(item, animate) {
    const onRequest = isOnRequestItem(item);
    const unitPrice = parseFloat(item.dataset.price);
    const fullPrice = parseFloat(item.dataset.fullPrice || item.dataset.price);
    const amountEl = item.querySelector('.---quantity--amount');
    const priceEl = item.querySelector('.---cart-item--price');
    const quantity = getAmountValue(amountEl);

    priceEl.classList.toggle('__on_request', onRequest);
    if (onRequest) {
      priceEl.textContent = item.dataset.price || '';
    } else {
      setOrAnimate(priceEl, formatPrice(unitPrice * quantity), animate);
    }

    const pointsEl = item.querySelector('.---cart-item--points');
    if (pointsEl) {
      const unitPoints = parseInt(item.dataset.points, 10) || 0;
      if (unitPoints > 0) {
        pointsEl.classList.remove('__hidden');
        setOrAnimate(pointsEl, String(unitPoints * quantity), animate);
      } else {
        pointsEl.classList.add('__hidden');
      }
    }

    let oldBlock = item.querySelector('.---cart-item--old-price--block');

    const priceBlock = item.querySelector('.---cart-item--price--block');

    if (!onRequest && fullPrice !== unitPrice) {
      oldBlock = ensureOldPriceBlock(item);

      const oldPriceEl = oldBlock.querySelector('.---cart-item--old-price');
      const discountEl = oldBlock.querySelector('.---cart-item--discount');

      setOrAnimate(oldPriceEl, formatPrice(fullPrice * quantity), animate);
      setOrAnimate(discountEl, 'скидка ' + formatPrice((fullPrice - unitPrice) * quantity), animate);

      if (priceBlock) priceBlock.classList.add('__discount');
    } else {
      if (oldBlock) oldBlock.remove();
      if (priceBlock) priceBlock.classList.remove('__discount');
    }
  }

  /**
   * Предупреждение промокода: нет подходящих товаров в корзине
   * Применимость промокода считает бэк: непустой data-scope на cart--promo-result — показывает cart--promo-alert,
   * пусто — плашка скрыта
   */
  function updatePromoAlert(panel) {
    const promoAlert = panel.querySelector('.cart--promo-alert');
    if (!promoAlert) return;

    const promoResult = panel.querySelector('.cart--promo-result');

    if (!promoResult || !promoResult.classList.contains('__active')) {
      promoAlert.classList.remove('__active');
      return;
    }

    promoAlert.classList.toggle('__active', (promoResult.dataset.scope || '').trim() !== '');
  }

  /**
   * Обновление цен всех товаров + summary
   */
  function updateAllItems(panel, animate) {
    panel.querySelectorAll('.---cart-item').forEach(item => {
      updateItemPrice(item, animate);
    });

    updateSummary(panel, animate);
    updateCheckoutButton(panel);
    updatePromoAlert(panel);
    updateZeroState(panel);
  }

  /**
   * Пустая корзина
   * Нет ни одного ---cart-item — summary получает __hidden, cart--zero получает __active
   */
  function updateZeroState(panel) {
    const isEmpty = panel.querySelectorAll('.---cart-item').length === 0;

    const summary = panel.querySelector('.summary');
    if (summary) summary.classList.toggle('__hidden', isEmpty);

    const checkout = panel.querySelector('.summary--checkout');
    if (checkout) checkout.classList.toggle('__hidden', isEmpty);

    const zero = panel.querySelector('.cart--zero');
    if (zero) zero.classList.toggle('__active', isEmpty);
  }

  /**
   * Режим «по запросу»
   * Включен, если среди доступных и не исключенных товаров есть ---cart-item с data-on-request="true"
   * summary--cart-rows, summary--total и summary--points получают __hidden, у cart--delivery--free снимается __active,
   * summary--on-request-info получает __active, итоговые суммы не считаются,
   * текст summary--checkout берется из data-on-request-checkout
   */
  function hasOnRequestItems(panel) {
    return !!panel.querySelector('.---cart-item:not(.__not-available):not(.__exclude)[data-on-request="true"]');
  }

  /**
   * Блокировка и текст кнопки оформления заказа
   * Исходный текст кнопки из темплейта запоминается в data-default-checkout
   * Если нет ни одного доступного товара — кнопка заблокирована с заменой текста
   * В режиме «по запросу» — текст из data-on-request-checkout, иначе — из data-default-checkout
   */
  function updateCheckoutButton(panel) {
    const btn = panel.querySelector('.summary--checkout');
    if (!btn) return;

    if (!btn.dataset.defaultCheckout) btn.dataset.defaultCheckout = btn.textContent.trim();

    const delivery = panel.querySelector('.cart--delivery');
    const deliveryRow = panel.querySelector('#summary-delivery');
    const availableItems = panel.querySelectorAll('.---cart-item:not(.__not-available):not(.__exclude)');

    if (availableItems.length === 0) {
      btn.classList.add('__disabled');
      btn.textContent = 'Нет доступных товаров';
      if (delivery) delivery.classList.add('__disabled');
    } else {
      btn.classList.remove('__disabled');
      btn.textContent = hasOnRequestItems(panel) && btn.dataset.onRequestCheckout
        ? btn.dataset.onRequestCheckout
        : btn.dataset.defaultCheckout;
      if (delivery) delivery.classList.remove('__disabled');
    }
  }

  function updateSummary(panel, animate) {
    const onRequest = hasOnRequestItems(panel);

    const cartRows = panel.querySelector('.summary--cart-rows');
    if (cartRows) cartRows.classList.toggle('__hidden', onRequest);

    const onRequestInfo = panel.querySelector('.summary--on-request-info');
    if (onRequestInfo) onRequestInfo.classList.toggle('__active', onRequest);

    const totalBlock = panel.querySelector('.summary--total');
    if (totalBlock) totalBlock.classList.toggle('__hidden', onRequest);

    if (onRequest) {
      const pointsBlock = panel.querySelector('.summary--points');
      if (pointsBlock) pointsBlock.classList.add('__hidden');

      const freeDelivery = panel.querySelector('.cart--delivery--free');
      if (freeDelivery) freeDelivery.classList.remove('__active');

      return;
    }

    const items = panel.querySelectorAll('.---cart-item:not(.__not-available):not(.__exclude)');
    let productsTotal = 0;
    let fullPriceTotal = 0;
    let pointsTotal = 0;

    items.forEach(item => {
      const unitPrice = parseFloat(item.dataset.price);
      const fullPrice = parseFloat(item.dataset.fullPrice || item.dataset.price);
      const quantity = getAmountValue(item.querySelector('.---quantity--amount'));
      productsTotal += unitPrice * quantity;
      fullPriceTotal += fullPrice * quantity;
      pointsTotal += (parseInt(item.dataset.points, 10) || 0) * quantity;
    });

    const pointsEl = panel.querySelector('.summary--points');
    if (pointsEl) {
      if (pointsTotal > 0) {
        pointsEl.classList.remove('__hidden');
        setOrAnimate(pointsEl, String(pointsTotal), animate);
      } else {
        pointsEl.classList.add('__hidden');
      }
    }

    const countEl = panel.querySelector('.cart--header--title--count');
    if (countEl) {
      const itemsCount = panel.querySelectorAll('.cart--items article.---cart-item').length;
      setOrAnimate(countEl, '/ ' + itemsCount + ' шт.', animate);
    }

    const productsRow = panel.querySelector('#summary-products');
    if (productsRow) {
      const productsValueEl = productsRow.querySelector('.summary--row--value');
      if (productsValueEl) {
        setOrAnimate(productsValueEl, formatPrice(fullPriceTotal), animate);
      }
    }

    const allDiscount = fullPriceTotal - productsTotal;
    const allDiscountRow = panel.querySelector('#summary-all-discount');
    if (allDiscountRow) {
      if (allDiscount > 0) {
        allDiscountRow.classList.add('__active');
        const valueEl = allDiscountRow.querySelector('.summary--row--value');
        if (valueEl) setOrAnimate(valueEl, '−' + formatPrice(allDiscount), animate);
      } else {
        allDiscountRow.classList.remove('__active');
      }
    }

    updateFreeDelivery(panel, fullPriceTotal, allDiscount);

    const deliveryTotal = calcDeliveryTotal(panel);
    const deliveryRow = panel.querySelector('#summary-delivery');
    if (deliveryRow) {
      const isNullPrice = !!panel.querySelector('.cart--delivery--results li.__checked .cart--delivery--results--price.__null_price');
      const isDeliveryCalculated = !!panel.querySelector('.cart--delivery--results.__active');
      deliveryRow.classList.toggle('__active', isDeliveryCalculated && !isNullPrice);

      const valEl = deliveryRow.querySelector('.summary--row--value');
      if (valEl) setOrAnimate(valEl, formatPrice(deliveryTotal), animate);
    }

    const totalEl = panel.querySelector('.summary--total--value');
    if (totalEl) {
      setOrAnimate(totalEl, formatPrice(productsTotal + deliveryTotal), animate);
    }
  }

  /**
   * Расчёт стоимости доставки
   * Возвращает цену выбранной доставки, 0 если нет доступных товаров
   */
  function calcDeliveryTotal(panel) {
    const availableItems = panel.querySelectorAll('.---cart-item:not(.__not-available):not(.__exclude)');
    if (availableItems.length === 0) return 0;

    const checkedLi = panel.querySelector('.cart--delivery--results li.__checked');
    if (!checkedLi) return 0;

    const priceEl = checkedLi.querySelector('.cart--delivery--results--price');
    if (!priceEl) return 0;

    return parseInt(priceEl.textContent.replace(/\s/g, ''), 10) || 0;
  }

  /**
   * Проверка лимитов количества товара
   * Минимум data-minimum-order (по умолчанию 1), максимум data-max-limit
   * Итоговое количество кратно data-multiplicity (по умолчанию 1),
   * некратные значения округляются вверх
   * При нарушении — анимация дрожания на ---cart-item
   */
  function shakeCartItem(item) {
    item.classList.remove('__shake');
    void item.offsetWidth;
    item.classList.add('__shake');
    item.addEventListener('animationend', () => {
      item.classList.remove('__shake');
    }, { once: true });
  }

  function getMinQuantity(item) {
    const min = parseInt(item.dataset.minimumOrder, 10);
    return min > 0 ? min : 1;
  }

  function getQuantityStep(item) {
    const step = parseInt(item.dataset.multiplicity, 10);
    return step > 0 ? step : 1;
  }

  function getMaxQuantity(item) {
    const max = parseInt(item.dataset.maxLimit, 10);
    return max > 0 ? max : 0;
  }

  function getEffectiveMinQuantity(item) {
    const step = getQuantityStep(item);

    return Math.ceil(getMinQuantity(item) / step) * step;
  }

  function nextQuantity(item, quantity) {
    const step = getQuantityStep(item);

    return Math.max(Math.ceil((quantity + 1) / step) * step, getEffectiveMinQuantity(item));
  }

  function prevQuantity(item, quantity) {
    const step = getQuantityStep(item);

    return Math.floor((quantity - 1) / step) * step;
  }

  function normalizeQuantity(item, quantity) {
    const step = getQuantityStep(item);
    const max = getMaxQuantity(item);
    const min = getEffectiveMinQuantity(item);

    let value = Math.max(Math.ceil((quantity || 0) / step) * step, min);

    if (max && value > max) value = Math.floor(max / step) * step;
    if (value < step) value = step;

    return value;
  }

  function checkQuantityLimit(item, newQuantity) {
    if (newQuantity < getEffectiveMinQuantity(item)) return false;

    const maxLimit = getMaxQuantity(item);
    if (maxLimit && newQuantity > maxLimit) return false;

    return true;
  }

  /**
   * Превышение остатка
   * Если количество доступной позиции больше data-max-limit — на ---cart-item ставятся __out_of_stock и __exclude
   * Под ---cart-item--price--quantity--block добавляется кнопка ---cart-item--available-limit
   * с максимальным доступным количеством в data-quantity: не больше data-max-limit, кратно data-multiplicity
   * и не меньше data-minimum-order; если такого количества нет — кнопка не добавляется
   * Склонение в тексте кнопки по последней цифре: 1 — единица, 2–4 — единицы, остальные и 11–14 — единиц
   */
  function getAvailableQuantity(item) {
    const step = getQuantityStep(item);
    const value = Math.floor(getMaxQuantity(item) / step) * step;

    return value >= getEffectiveMinQuantity(item) ? value : 0;
  }

  function getUnitsWord(quantity) {
    const lastDigit = quantity % 10;
    const lastTwoDigits = quantity % 100;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'единиц';
    if (lastDigit === 1) return 'единица';
    if (lastDigit >= 2 && lastDigit <= 4) return 'единицы';
    return 'единиц';
  }

  function applyOutOfStock(panel) {
    panel.querySelectorAll('.---cart-item:not(.__not-available)').forEach(item => {
      const amountEl = item.querySelector('.---quantity--amount');
      const maxLimit = getMaxQuantity(item);
      if (!amountEl || !maxLimit || getAmountValue(amountEl) <= maxLimit) return;

      item.classList.add('__out_of_stock', '__exclude');

      const quantityBlock = item.querySelector('.---cart-item--price--quantity--block');
      const available = getAvailableQuantity(item);
      if (!quantityBlock || !available) return;

      const button = document.createElement('button');
      button.className = '---cart-item--available-limit';
      button.type = 'button';
      button.dataset.quantity = available;
      button.textContent = 'К покупке доступно только ' + available + ' ' + getUnitsWord(available);
      button.setAttribute('aria-label', button.textContent);
      quantityBlock.after(button);
    });
  }

  /**
   * Плашка промо на картинке позиции
   * Если у ---cart-item--promo есть __active и __zero_d — текст «лимит скидок», иначе — «промо»
   * При отрисовке корзины текст выставляется всем плашкам,
   * при пересчётах из ответа эндпойнта в плашку переносятся __active и __zero_d с обновлением текста
   */
  function updateItemPromoLabel(promo) {
    const isZeroD = promo.classList.contains('__active') && promo.classList.contains('__zero_d');
    promo.textContent = isZeroD ? 'лимит скидок' : 'промо';
  }

  function updateItemPromoLabels(panel) {
    panel.querySelectorAll('.---cart-item--promo').forEach(updateItemPromoLabel);
  }

  function syncItemPromo(item, fresh) {
    const promo = item.querySelector('.---cart-item--promo');
    const freshPromo = fresh.querySelector('.---cart-item--promo');
    if (!promo || !freshPromo) return;

    ['__active', '__zero_d'].forEach(cls => promo.classList.toggle(cls, freshPromo.classList.contains(cls)));
    updateItemPromoLabel(promo);
  }

  /**
   * Пересчёт корзины по уровням количества
   * data-recalc-levels="10,50" на ---cart-item — количества, с которых меняется цена товара
   * Уровень — число порогов, которых достигло количество (0: <10, 1: 10–49, 2: >=50)
   * Если уровень отличается от уровня на момент отрисовки — LS.cart обновляется,
   * корзина пересчитывается на /post-endpoints/cart, из ответа в позицию переносятся
   * data-price и data-full-price, в ---cart-item--promo — __active и __zero_d (с обновлением текста плашки),
   * и только после этого запускается пересчёт цен с анимацией
   * На время запроса позиция получает __recalc
   * Пока ответ не пришёл, изменения количества этой позиции цены не пересчитывают,
   * ответ предыдущего запроса игнорируется, если уже ушёл следующий
   */
  function getRecalcLevel(item, quantity) {
    return (item.dataset.recalcLevels || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(level => level > 0 && quantity >= level)
      .length;
  }

  function initRecalcLevels(panel) {
    panel.querySelectorAll('.---cart-item').forEach(item => {
      item._recalcLevel = getRecalcLevel(item, getAmountValue(item.querySelector('.---quantity--amount')));
    });
  }

  async function refreshItemPrices(item) {
    try {
      const doc = new DOMParser().parseFromString(await requestCartHtml(), 'text/html');
      const fresh = doc.querySelector('.---cart-item[data-sha="' + CSS.escape(item.dataset.sha) + '"]');
      if (!fresh) return;

      ['price', 'fullPrice'].forEach(key => {
        if (fresh.dataset[key] !== undefined) item.dataset[key] = fresh.dataset[key];
      });

      syncItemPromo(item, fresh);
    } catch (err) {
      return;
    }
  }

  async function applyItemQuantity(panel, item, quantity) {
    if (isSumDependentPromo(panel)) return applySumDependentQuantity(panel, item, quantity);

    const level = getRecalcLevel(item, quantity);

    if (level === item._recalcLevel) {
      updateItemQuantityWithDelivery(panel, item, quantity);
      if (!item._recalcRequest) updateAllItems(panel, true);
      return;
    }

    item._recalcLevel = level;

    item.classList.add('__recalc');

    const request = Symbol();
    item._recalcRequest = request;

    await updateItemQuantityWithDelivery(panel, item, quantity);
    if (item._recalcRequest !== request) return;

    await refreshItemPrices(item);
    if (item._recalcRequest !== request) return;

    item._recalcRequest = null;
    item.classList.remove('__recalc');
    updateAllItems(panel, true);
  }

  /**
   * Пересчёт всей корзины через эндпойнт
   * Если промокод применен и у cart--promo-result data-sum-dependency="true" — любое изменение количества,
   * а удаление позиции и очистка корзины — всегда, независимо от промокода, обновляет LS.cart и пересчитывает корзину на /post-endpoints/cart, из ответа во все позиции
   * переносятся data-price и data-full-price, в ---cart-item--promo — __active и __zero_d (с обновлением текста плашки),
   * в cart--promo-result — data-scope,
   * и только после этого запускается пересчёт цен с анимацией
   * На время запроса все позиции получают __recalc, ответ предыдущего запроса игнорируется,
   * если уже ушёл следующий (с любой позиции)
   */
  function isSumDependentPromo(panel) {
    const promoResult = panel.querySelector('.cart--promo-result.__active');

    return !!cartPromo && !!promoResult && promoResult.dataset.sumDependency === 'true';
  }

  async function refreshAllItemPrices(panel) {
    try {
      const doc = new DOMParser().parseFromString(await requestCartHtml(), 'text/html');

      panel.querySelectorAll('.---cart-item').forEach(item => {
        const fresh = doc.querySelector('.---cart-item[data-sha="' + CSS.escape(item.dataset.sha) + '"]');
        if (!fresh) return;

        ['price', 'fullPrice'].forEach(key => {
          if (fresh.dataset[key] !== undefined) item.dataset[key] = fresh.dataset[key];
        });

        syncItemPromo(item, fresh);
      });

      const promoResult = panel.querySelector('.cart--promo-result');
      const freshPromoResult = doc.querySelector('.cart--promo-result');
      if (promoResult && freshPromoResult) promoResult.dataset.scope = freshPromoResult.dataset.scope || '';

      const promoAlert = panel.querySelector('.cart--promo-alert');
      const freshPromoAlert = doc.querySelector('.cart--promo-alert');
      if (promoAlert && freshPromoAlert) promoAlert.innerHTML = freshPromoAlert.innerHTML;

      const banners = panel.querySelector('.cart--promo-banners');
      const freshBanners = doc.querySelector('.cart--promo-banners');
      if (banners && freshBanners) banners.innerHTML = freshBanners.innerHTML;
    } catch (err) {
      return;
    }
  }

  async function applySumDependentQuantity(panel, item, quantity) {
    item._recalcLevel = getRecalcLevel(item, quantity);

    await runCartRecalc(panel, () => updateItemQuantityWithDelivery(panel, item, quantity));
  }

  async function runCartRecalc(panel, updateLocalCart) {
    panel.querySelectorAll('.---cart-item').forEach(el => el.classList.add('__recalc'));

    const request = Symbol();
    panel._cartRecalcRequest = request;

    await updateLocalCart();
    if (panel._cartRecalcRequest !== request) return;

    await refreshAllItemPrices(panel);
    if (panel._cartRecalcRequest !== request) return;

    panel._cartRecalcRequest = null;
    panel.querySelectorAll('.---cart-item').forEach(el => el.classList.remove('__recalc'));
    updateAllItems(panel, true);
  }

  /**
   * Бесплатная доставка: прогресс-бар и текст
   * data-multiple-limit="90000:2000,120000:3000" — порог:макс_цена_доставки
   * при достижении порога все доставки с ценой ≤ макс_цена становятся бесплатными (__free),
   * цены с __null_price в расчете не участвуют и __free не получают
   * пока у блока стоит __wait_data (идет обновление доставок) — ничего не меняется, логика отрабатывает после получения новых li
   * блок показывается, если data-multiple-limit непустой, есть недостигнутый порог
   * и в полученном списке доставок есть li без __free и __null_price (до расчета доставки блок скрыт),
   * .cart--delivery--free--text показывает остаток до следующего порога,
   * блок скрывается когда все пройдены
   */
  function updateFreeDelivery(panel, productsTotal, allDiscount) {
    const freeEl = panel.querySelector('.cart--delivery--free');
    if (!freeEl || freeEl.classList.contains('__wait_data')) return;

    const deliveryList = panel.querySelector('.cart--delivery--results ul');
    const priceEls = getDeliveryPriceEls(deliveryList);
    const levels = parseAdditionalLimits(freeEl.dataset.multipleLimit || '');
    const currentSum = productsTotal - allDiscount;

    applyAdditionalLevels(priceEls, levels, currentSum);

    const nextLevel = levels.find(level => currentSum < level.threshold);
    const hasPaidDelivery = priceEls.some(priceEl => !priceEl.classList.contains('__free'));

    if (!nextLevel || !hasPaidDelivery) {
      freeEl.classList.remove('__active');
      freeEl.querySelectorAll('.cart--delivery--free--text').forEach(el => el.classList.remove('__active'));
      return;
    }

    const prevThreshold = getPrevThreshold(levels, currentSum, 0);
    const remaining = nextLevel.threshold - currentSum;
    const progress = (currentSum - prevThreshold) / (nextLevel.threshold - prevThreshold);
    showFreeBlock(freeEl, remaining, progress);
  }

  function getDeliveryPriceEls(deliveryList) {
    if (!deliveryList) return [];
    return Array.from(deliveryList.querySelectorAll('li[data-delivery-id] .cart--delivery--results--price:not(.__null_price)'));
  }

  function getPrevThreshold(levels, currentSum, baseLimit) {
    let prev = baseLimit;
    for (const level of levels) {
      if (currentSum >= level.threshold) {
        prev = level.threshold;
      }
    }
    return prev;
  }

  function showFreeBlock(freeEl, remaining, progressRatio) {
    freeEl.classList.add('__active');

    const progressBar = freeEl.querySelector('.cart--delivery--free--progress-bar');
    if (progressBar) {
      progressBar.style.setProperty('--progress', Math.min(Math.round(progressRatio * 100), 100));
    }

    const textEl = freeEl.querySelector('.cart--delivery--free--text');
    if (textEl) {
      textEl.classList.add('__active');
      const sumEl = textEl.querySelector('.cart--delivery--free--text--sum');
      if (sumEl) sumEl.textContent = formatPrice(remaining).replace(/ /g, '\u00a0');
    }
  }

  /**
   * Выбор варианта доставки
   * Переключает __checked между элементами списка доставки
   * data-delivery-id выбранного варианта сохраняется в sessionStorage (cart_delivery_id)
   */
  function initDeliverySelection(panel) {
    const deliveryList = panel.querySelector('.cart--delivery--results ul');
    if (!deliveryList) return;

    deliveryList.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li) return;

      deliveryList.querySelectorAll('li').forEach(item => item.classList.remove('__checked'));
      li.classList.add('__checked');
      if (li.dataset.deliveryId) sessionStorage.setItem(CART_DELIVERY_STORAGE_KEY, li.dataset.deliveryId);

      updateAllItems(panel, true);
    });
  }

  /**
   * Исключённые позиции корзины
   * Список data-sha позиций с классом __exclude хранится в памяти вкладки (sessionStorage)
   * При открытии корзины список сверяется с позициями и __exclude проставляется обратно
   * Позициям с __not-available __exclude ставится всегда, в sessionStorage они не пишутся
   * Позиции с __out_of_stock (applyOutOfStock) пишутся как обычные исключенные
   */
  function readExcludedShas() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(CART_EXCLUDED_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (e) {
      return [];
    }
  }

  function saveExcludedShas(panel) {
    const shas = Array.from(panel.querySelectorAll('.---cart-item.__exclude:not(.__not-available)'))
      .map(item => item.dataset.sha)
      .filter(Boolean);

    sessionStorage.setItem(CART_EXCLUDED_STORAGE_KEY, JSON.stringify(shas));
  }

  function applyExcludedShas(panel) {
    const shas = readExcludedShas();

    if (shas.length) {
      panel.querySelectorAll('.---cart-item').forEach(item => {
        if (item.dataset.sha && shas.includes(item.dataset.sha)) {
          item.classList.add('__exclude');
        }
      });
    }

    panel.querySelectorAll('.---cart-item.__not-available').forEach(item => {
      item.classList.add('__exclude');
    });

    saveExcludedShas(panel);
  }

  function initCartItems(panel, animate = false) {
    applyOutOfStock(panel);
    applyExcludedShas(panel);
    initRecalcLevels(panel);
    updateItemPromoLabels(panel);
    updateAllItems(panel, animate);
    initDeliverySelection(panel);

    const clearAllBtn = panel.querySelector('.cart--header--title--delete-all');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        panel.querySelectorAll('.---cart-item').forEach(item => item.remove());
        saveExcludedShas(panel);
        resetDeliveryResults(panel);
        runCartRecalc(panel, clearLocalCart);
      });
    }

    /**
     * Ручной ввод количества
     * Для элементов ---quantity--amount с классом __allow-input
     * div преобразуется в input, ввод только цифрами, debounce 1000мс
     * У позиций с __out_of_stock input создается disabled
     */
    panel.querySelectorAll('.---cart-item:not(.__not-available) .---quantity--amount.__allow-input').forEach(amountDiv => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = amountDiv.className;
      input.value = amountDiv.textContent.trim();
      input.maxLength = 50;
      input.disabled = amountDiv.closest('.---cart-item').classList.contains('__out_of_stock');
      amountDiv.replaceWith(input);

      input.addEventListener('input', () => {
        input.value = input.value.replace(/\s/g, '').replace(/[^\d]/g, '');

        if (input._debounceTimer) clearTimeout(input._debounceTimer);

        input._debounceTimer = setTimeout(() => {
          input._debounceTimer = null;
          const item = input.closest('.---cart-item');
          const val = parseInt(input.value, 10);
          const normalized = normalizeQuantity(item, val);

          if (normalized !== val) {
            input.value = normalized;
            shakeCartItem(item);
          }

          applyItemQuantity(panel, item, normalized);
        }, 1000);
      });
    });
  }

  /**
   * Делегированные обработчики позиций корзины
   * Вешаются на panel один раз из initCartPanelDelegates
   */
  function initCartItemsDelegates(panel) {
    /**
     * Ссылка на товар из позиции корзины
     * К href добавляется SKU= из data-item-id позиции и OPTIONS= — список options
     * строки LS.cart (ищется по data-sha) через запятую, если он не пуст
     * href меняется до перехода, поэтому браузерное поведение (ctrl-клик, новая вкладка) сохраняется
     */
    panel.addEventListener('click', (e) => {
      const link = e.target.closest('.---cart-item--image-info--block a');
      if (!link) return;

      const item = link.closest('.---cart-item');
      if (!item || !item.dataset.itemId) return;

      const url = new URL(link.getAttribute('href'), window.location.origin);
      url.searchParams.set('SKU', item.dataset.itemId);

      const row = readLocalCart().find(r => r.sha === item.dataset.sha);
      if (row && Array.isArray(row.options) && row.options.length > 0) {
        url.searchParams.set('OPTIONS', row.options.map(String).join(','));
      } else {
        url.searchParams.delete('OPTIONS');
      }

      link.setAttribute('href', url.pathname + url.search + url.hash);
    });

    /**
     * Исключение позиции из заказа
     * Клик по картинке товара тоглит __exclude на .---cart-item
     * У позиций с __not-available и __out_of_stock __exclude стоит всегда, клик игнорируется
     * Без __exclude в левом верхнем углу картинки стоит галочка
     * Через 300мс после последнего клика корзина перерисовывается и обновляется рассчитанная доставка,
     * ожидание данных по доставкам включается сразу по клику, чтобы не пересчитывать бесплатную доставку по старым li
     */
    panel.addEventListener('click', (e) => {
      const image = e.target.closest('.---cart-item--image');
      if (!image) return;

      const item = image.closest('.---cart-item');
      if (!item || item.classList.contains('__not-available') || item.classList.contains('__out_of_stock')) return;

      item.classList.toggle('__exclude');
      saveExcludedShas(panel);
      if (panel.querySelector('.cart--delivery--results.__active')) setDeliveryLoading(panel, true);
      updateAllItems(panel, true);

      if (panel._excludeReloadTimer) clearTimeout(panel._excludeReloadTimer);

      panel._excludeReloadTimer = setTimeout(() => {
        panel._excludeReloadTimer = null;
        if (cartPanel !== panel) return;

        refreshDeliveryResults(panel);
        renderCartTemplate(panel, true);
      }, 300);
    });

    /**
     * Количество, доступное к покупке
     * Клик по ---cart-item--available-limit ставит позиции количество из data-quantity,
     * снимает __out_of_stock и __exclude, разблокирует input и удаляет кнопку
     * Всплытие останавливается: удаленная кнопка уже не в cartPanel, и клик по document закрыл бы корзину
     * После обновления LS.cart корзина перерисовывается, рассчитанная доставка обновляется
     */
    panel.addEventListener('click', async (e) => {
      const button = e.target.closest('.---cart-item--available-limit');
      if (!button) return;

      e.stopPropagation();

      const item = button.closest('.---cart-item');
      const amountEl = item ? item.querySelector('.---quantity--amount') : null;
      const quantity = parseInt(button.dataset.quantity, 10);
      if (!amountEl || !quantity) return;

      button.remove();
      item.classList.remove('__out_of_stock', '__exclude');
      if (amountEl.tagName === 'INPUT') amountEl.disabled = false;
      setAmountValue(amountEl, quantity);
      saveExcludedShas(panel);
      updateAllItems(panel, true);

      const localCartUpdate = updateLocalCartQuantity(item.dataset.sha, quantity);
      refreshDeliveryResults(panel, localCartUpdate);

      try {
        await localCartUpdate;
      } catch (err) {}

      if (cartPanel !== panel) return;
      renderCartTemplate(panel, true);
    });

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.---quantity--increase, .---quantity--decrease, .---quantity--remove');
      if (!btn) return;

      const item = btn.closest('.---cart-item');
      if (!item || item.classList.contains('__out_of_stock')) return;

      const amountEl = item.querySelector('.---quantity--amount');
      let quantity = getAmountValue(amountEl);
      const notAvailable = item.classList.contains('__not-available');

      if (amountEl._debounceTimer) {
        clearTimeout(amountEl._debounceTimer);
        amountEl._debounceTimer = null;
      }

      if (btn.classList.contains('---quantity--increase')) {
        if (notAvailable) return;
        const increased = nextQuantity(item, quantity);
        if (!checkQuantityLimit(item, increased)) {
          shakeCartItem(item);
          return;
        }
        quantity = increased;
      } else if (btn.classList.contains('---quantity--decrease')) {
        if (notAvailable) return;
        const decreased = prevQuantity(item, quantity);
        if (!checkQuantityLimit(item, decreased)) {
          shakeCartItem(item);
          return;
        }
        quantity = decreased;
      } else if (btn.classList.contains('---quantity--remove')) {
        e.stopPropagation();
        item.remove();
        saveExcludedShas(panel);
        runCartRecalc(panel, () => {
          const localCartUpdate = removeFromLocalCart(item.dataset.sha);
          refreshDeliveryResults(panel, localCartUpdate);
          return localCartUpdate;
        });
        return;
      }

      setAmountValue(amountEl, quantity);
      applyItemQuantity(panel, item, quantity);
    });
  }

  /**
   * Промокод: кнопка submit получает __disabled пока поле пустое
   * Применение (submit, Enter, клик по баннеру) и отмена перезапрашивают корзину
   * с PROMO в верхнем регистре (пустой при отмене) и перерисовывают ее
   */
  function initPromoInput(panel, promoWasActive = false) {
    const input = panel.querySelector('.cart--promo--input');
    const submit = panel.querySelector('.cart--promo--submit');
    const promoResult = panel.querySelector('.cart--promo-result');

    if (!input || !submit) return;

    restorePromoState(panel, input, submit, promoResult, promoWasActive);

    input.addEventListener('input', () => {
      submit.classList.toggle('__disabled', input.value.trim() === '');
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit.click();
    });

    submit.addEventListener('click', () => {
      applyCartPromo(panel, submit, input.value.trim().toUpperCase());
    });

    const cancel = panel.querySelector('.cart--promo-result--cancel');
    if (cancel && promoResult) {
      cancel.addEventListener('click', () => {
        applyCartPromo(panel, cancel, '');
      });
    }
  }

  /**
   * Восстановление примененного промокода после перерисовки корзины
   */
  function restorePromoState(panel, input, submit, promoResult, promoWasActive) {
    if (!cartPromo) return;

    input.value = cartPromo;
    submit.classList.remove('__disabled');

    if (promoResult) {
      const accent = promoResult.querySelector('.cart--promo-result--text--accent');
      if (accent) accent.textContent = cartPromo;
      if (accent) appendPromoDescription(panel, accent);
      if (promoWasActive) promoResult.classList.add('__static');
      promoResult.classList.add('__active');
    }

    const banners = panel.querySelector('.cart--promo-banners');
    if (banners) banners.classList.add('__disabled');

    updatePromoAlert(panel);
  }

  /**
   * Описание примененного промокода
   * Берется из ---cart-promo-banner--description баннера с data-key-word, совпадающим с cartPromo,
   * и вставляется после cart--promo-result--text--accent как cart--promo-result--text--description
   * Если баннер не найден — описание запрашивается с /get-endpoints/promoDescription (PROMO), пустой ответ не вставляется
   */
  function appendPromoDescription(panel, accent) {
    const banner = Array.from(panel.querySelectorAll('.---cart-promo-banner'))
      .find((item) => (item.dataset.keyWord || '').toUpperCase() === cartPromo);

    if (!banner) {
      requestPromoDescription(accent);
      return;
    }

    const source = banner.querySelector('.---cart-promo-banner--description');
    if (!source) return;

    insertPromoDescription(accent, source.innerHTML);
  }

  /**
   * Запрос описания промокода с /get-endpoints/promoDescription
   * Ответ игнорируется, если за время запроса промокод сменился или accent уже не в DOM
   */
  async function requestPromoDescription(accent) {
    const promo = cartPromo;
    const params = new URLSearchParams({ PROMO: promo });

    try {
      const response = await fetch(`${PROMO_DESCRIPTION_ENDPOINT_URL}?${params.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok || response.redirected) return;

      const html = await response.text();
      if (promo !== cartPromo || !accent.isConnected) return;

      insertPromoDescription(accent, html);
    } catch (err) {
      return;
    }
  }

  /**
   * Вставка cart--promo-result--text--description после accent, пустой html не вставляется
   */
  function insertPromoDescription(accent, html) {
    if (!html || !html.trim()) return;

    const description = document.createElement('div');
    description.className = 'cart--promo-result--text--description';
    description.innerHTML = html;
    accent.after(description);
  }

  /**
   * Применение / отмена промокода: запрос корзины с новым PROMO и перерисовка
   * При ошибке запроса промокод откатывается к предыдущему
   * Примененный промокод сохраняется в sessionStorage.cart_promo, при отмене — удаляется
   */
  async function applyCartPromo(panel, button, promo) {
    if (button.classList.contains('__disabled')) return;

    button.classList.add('__disabled');

    const prevPromo = cartPromo;
    cartPromo = promo;

    try {
      await renderCartTemplate(panel, true);
    } catch (err) {
      cartPromo = prevPromo;
      button.classList.remove('__disabled');
      return;
    }

    if (cartPromo) {
      sessionStorage.setItem(CART_PROMO_STORAGE_KEY, cartPromo);
    } else {
      sessionStorage.removeItem(CART_PROMO_STORAGE_KEY);
    }
  }

  /**
   * Промо-баннеры
   * Клик по ---cart-promo-banner (не по ссылке) подставляет data-key-word в поле промокода и применяет его
   * Вешается на panel один раз из initCartPanelDelegates, поле и кнопка ищутся на момент клика
   */
  function initPromoBanners(panel) {
    panel.addEventListener('click', (e) => {
      const banner = e.target.closest('.---cart-promo-banner');
      if (!banner) return;

      if (e.target.closest('a')) return;

      const keyWord = banner.dataset.keyWord;
      if (!keyWord) return;

      const input = panel.querySelector('.cart--promo--input');
      const submit = panel.querySelector('.cart--promo--submit');
      if (!input || !submit) return;

      input.value = keyWord;
      submit.classList.remove('__disabled');
      submit.click();
    });
  }

  /**
   * Cross-tab Cart Sync
   * storage по ключу cart приходит только в других вкладках
   * Если в этой вкладке открыта панель корзины (.mobile-right-panel.__wide.__cart) —
   * содержимое перерисовывается через loadCartTemplate (getCart + /post-endpoints/cart)
   */
  let cartPanelReloadTimer = null;

  window.addEventListener('storage', (e) => {
    if (e.key !== ADD_TO_CART_CONFIG.storageKey) return;
    if (!cartPanel || !cartPanel.classList.contains('__cart')) return;

    if (cartPanelReloadTimer) clearTimeout(cartPanelReloadTimer);

    cartPanelReloadTimer = setTimeout(() => {
      cartPanelReloadTimer = null;
      if (cartPanel) loadCartTemplate(cartPanel);
    }, 200);
  });

  window.closeMobileCartPanel = closeCartPanel;
  window.openMobileCartPanel = openCartPanel;

  basketButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCartPanel();
  });

  if (accountCartButton) {
    accountCartButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleCartPanel();
    });
  }

  document.addEventListener('click', (e) => {
    if (!cartPanel) return;

    const subpanel = document.querySelector('.mobile-right-panel.__subpanel');
    if (!cartPanel.contains(e.target) &&
        !basketButton.contains(e.target) &&
        !(accountCartButton && accountCartButton.contains(e.target)) &&
        !(subpanel && subpanel.contains(e.target))) {
      closeCartPanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cartPanel) {
      e.stopImmediatePropagation();
      closeCartPanel();
    }
  });
});

/**
 * Add To Cart
 * Кнопка ---buy-box--buy-button на странице товара
 *   /get-endpoints/whoami отдаёт json-список ролей текущего пользователя (["2"] — гость/webuser)
 *   позиция уходит в localStorage.cart — список строк { sku, quantity, options, sha }
 *   для авторизованного список сначала уходит POST /auth-endpoints/user/updateCart (CART=json),
 *   а в localStorage записывается json-строка из ответа
 *   sku — data-sku-id у main.product, options — data-value-key у li.__checked
 *   в ---option без классов __sku и __links
 *   если такая позиция уже есть — quantity увеличивается, на кнопке «В корзине N»
 *   sha — sha1-хеш строки «sku,list_data_value_key», где list_data_value_key —
 *   значения options, отсортированные по возрастанию как строки и склеенные через запятую
 */

const ADD_TO_CART_CONFIG = {
  whoamiEndpoint: '/get-endpoints/whoami',
  updateCartEndpoint: '/auth-endpoints/user/updateCart',
  deleteFromCartEndpoint: '/auth-endpoints/user/deleteFromCart',
  deleteAllFromCartEndpoint: '/auth-endpoints/user/deleteAllFromCart',
  getCartEndpoint: '/auth-endpoints/user/getCart',
  accountPath: '/account',
  guestRole: '2',
  storageKey: 'cart',
  historyStorageKey: 'cart_history',
  historyAddedValue: 'added', // история уже перенесена в корзину или переносить было нечего
  authorizedStorageKey: 'cart_authorized', // пишется initCartAuthState на первой странице после входа
  authorizedValue: 'true',
  inCartText: 'В корзине',
  openCartText: 'Открыть корзину',
  errorTextDuration: 5000,
  productEndpoint: '/get-endpoints/product',
  skuShowValue: 'sku_show',
  catalogPanelTitle: 'Выберите вариант',
  panelBuyCartDelay: 300 // пауза после смены надписи на кнопке перед открытием корзины
};

/**
 * Ответ updateCart с ключом error — {"error":"..."}
 * Возвращает текст ошибки или null
 */
function parseCartError(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error) {
      return String(parsed.error);
    }
  } catch (e) {
    return null;
  }

  return null;
}

/**
 * Показывает текст ошибки на кнопке на errorTextDuration, затем возвращает исходный текст
 * Пока ошибка показана — у кнопки класс __error
 */
function showCartButtonError(button, text) {
  const originalText = button.textContent;

  button.classList.add('__error');
  button.textContent = text;

  setTimeout(() => {
    button.classList.remove('__error');
    button.textContent = originalText;
  }, ADD_TO_CART_CONFIG.errorTextDuration);
}

/**
 * Приводит ответ whoami к массиву строк
 */
function parseCartRoles(data) {
  if (Array.isArray(data)) {
    return data.map(role => String(role));
  }

  if (typeof data === 'number') {
    return [String(data)];
  }

  if (typeof data === 'string') {
    if (!data) {
      return [];
    }

    try {
      return parseCartRoles(JSON.parse(data));
    } catch (e) {
      return [data];
    }
  }

  if (data && typeof data === 'object') {
    return Object.values(data).map(role => String(role));
  }

  return [];
}

/**
 * Запрашивает роли текущего пользователя
 */
async function getCartRoles() {
  const response = await fetch(ADD_TO_CART_CONFIG.whoamiEndpoint, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return parseCartRoles(await response.text());
}

/**
 * Гость ли это — в списке ролей есть роль webuser
 */
function isCartGuest(roles) {
  return roles.includes(ADD_TO_CART_CONFIG.guestRole);
}

/**
 * SHA-1
 * Хеш строки (UTF-8), hex в нижнем регистре
 */
async function sha1(str) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));

  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Хеш позиции корзины: sku,list_data_value_key
 */
function cartRowHash(row) {
  const listDataValueKey = (row.options || []).map(String).sort().join(',');

  return sha1([row.sku, listDataValueKey].join(','));
}

/**
 * Local Storage Cart
 * Чтение и запись списка позиций в localStorage.cart
 * Авторизованному список сначала отправляется на updateCart, в LS пишется ответ сервера
 * При записи и при сигнале storage из другой вкладки обновляет бейдж
 * на header--main--actions--basket: __has-badge и --badge-content = число строк
 */
function parseLocalCart(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function readLocalCart() {
  try {
    return parseLocalCart(localStorage.getItem(ADD_TO_CART_CONFIG.storageKey));
  } catch (e) {
    return [];
  }
}

/**
 * Валидная история — json-список позиций с хотя бы одной строкой
 * Маркер added, пустой список, мусор и отсутствие ключа — невалидны
 */
function isValidCartHistory(raw) {
  if (!raw || raw === ADD_TO_CART_CONFIG.historyAddedValue) return false;

  return parseLocalCart(raw).length > 0;
}

/**
 * Отправка корзины авторизованного пользователя на сервер
 * Ответ — json-строка списка позиций
 */
async function requestUpdateCart(cartJson) {
  const params = new URLSearchParams();
  params.set('CART', cartJson);

  const response = await fetch(ADD_TO_CART_CONFIG.updateCartEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  const responseJson = (await response.text()).trim();

  const errorText = parseCartError(responseJson);
  if (errorText) {
    const err = new Error(errorText);
    err.cartError = errorText;
    throw err;
  }

  return responseJson;
}

/**
 * Создание заказа на /post-endpoints/createCheckout
 * Ответ — json с ключом checkout (номер заказа) или error (текст ошибки)
 * CITY уходит только если uid города не пустой
 * PROMO уходит только если применен промокод
 * DELIVERY уходит только если выбран вариант доставки (data-delivery-id li с __checked)
 */
async function requestCheckout(cartJson, cityId, promo, deliveryId) {
  const params = new URLSearchParams();
  params.set('CART', cartJson);

  if (cityId) {
    params.set('CITY', cityId);
  }

  if (promo) {
    params.set('PROMO', promo);
  }

  if (deliveryId) {
    params.set('DELIVERY', deliveryId);
  }

  const response = await fetch(CHECKOUT_ENDPOINT_URL, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  const responseText = (await response.text()).trim();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch (e) {
    const err = new Error(responseText);
    err.cartError = responseText;
    throw err;
  }

  if (result && result.error) {
    const err = new Error(String(result.error));
    err.cartError = String(result.error);
    throw err;
  }

  return result || {};
}

/**
 * Удаление позиции из корзины авторизованного пользователя на сервере
 * Ответ — json-строка нового списка позиций
 */
async function requestDeleteFromCart(sha) {
  const params = new URLSearchParams();
  params.set('SHA', sha);

  const response = await fetch(ADD_TO_CART_CONFIG.deleteFromCartEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return (await response.text()).trim();
}

/**
 * Полная очистка корзины авторизованного пользователя на сервере
 * Ответ — json-строка нового списка позиций
 */
async function requestDeleteAllFromCart() {
  const response = await fetch(ADD_TO_CART_CONFIG.deleteAllFromCartEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return (await response.text()).trim();
}

/**
 * Cart Sync Abort
 * Один контроллер на все фоновые getCart (initAccountCartSync, syncLocalCartFromServer)
 * abortCartSync вызывается из account.js перед логаутом, чтобы поздний ответ getCart не перезаписал очищенный LS.cart
 * Также отменяет фоновые запросы избранного через abortFavoritesSync из favorites.js
 */
let cartSyncController = new AbortController();

function abortCartSync() {
  cartSyncController.abort();
  cartSyncController = new AbortController();

  if (typeof window.abortFavoritesSync === 'function') {
    window.abortFavoritesSync();
  }
}

window.abortCartSync = abortCartSync;

/**
 * Получение корзины авторизованного пользователя с сервера
 * Ответ — json-строка списка позиций
 * Запрос отменяется через abortCartSync
 */
async function requestGetCart() {
  const response = await fetch(ADD_TO_CART_CONFIG.getCartEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
    signal: cartSyncController.signal
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return (await response.text()).trim();
}

/**
 * Синхронизация LS с сервером перед открытием корзины
 * Гость — ничего не делает, авторизованный — в LS пишется ответ getCart
 */
async function syncLocalCartFromServer() {
  try {
    const roles = await getCartRoles();
    if (isCartGuest(roles)) return;

    const cartJson = await requestGetCart();
    localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
    updateCartBadge(parseLocalCart(cartJson));
  } catch (err) {
    return;
  }
}

/**
 * Вход в кабинет (/account) авторизованным — LS перезаписывается ответом getCart
 * Гостевая корзина к этому моменту уже сохранена в LS.cart_history (initCartAuthState)
 * Признак авторизации — класс __account_active у header--main--actions--user
 */
async function initAccountCartSync() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== ADD_TO_CART_CONFIG.accountPath) return;

  if (!document.querySelector('.header--main--actions--user.__account_active')) return;

  try {
    const cartJson = await requestGetCart();
    localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
    updateCartBadge(parseLocalCart(cartJson));
  } catch (err) {
    return;
  }
}

/**
 * Logout Cart Reset
 * Очистка корзины в LS при любом выходе — независимо от наличия cart_history и cart_authorized
 * LS cart обнуляется всегда; cart_history и cart_authorized уничтожаются; sessionStorage cart_excluded уничтожается
 * В cart возвращается только валидный непустой json-список из cart_history — гостевая корзина, сохраненная при входе
 * LS favorites очищается через resetLocalFavoritesOnLogout из favorites.js
 * LS comparison очищается через resetLocalComparisonOnLogout из comparison.js
 * Вызывается из accountLogout (account.js), handleLogout (auth.js) и initCartAuthState при протухшей сессии
 */
function resetLocalCartOnLogout() {
  if (typeof window.resetLocalFavoritesOnLogout === 'function') {
    window.resetLocalFavoritesOnLogout();
  }

  if (typeof window.resetLocalComparisonOnLogout === 'function') {
    window.resetLocalComparisonOnLogout();
  }

  try {
    const historyJson = localStorage.getItem(ADD_TO_CART_CONFIG.historyStorageKey);

    localStorage.removeItem(ADD_TO_CART_CONFIG.storageKey);
    localStorage.removeItem(ADD_TO_CART_CONFIG.historyStorageKey);
    localStorage.removeItem(ADD_TO_CART_CONFIG.authorizedStorageKey);
    sessionStorage.removeItem(CART_EXCLUDED_STORAGE_KEY);

    if (isValidCartHistory(historyJson)) {
      localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, historyJson);
    }
  } catch (e) {
    return;
  }
}

window.resetLocalCartOnLogout = resetLocalCartOnLogout;

/**
 * Cart Auth State
 * Отслеживание входа и выхода на любой странице по классу __account_active у header--main--actions--user
 * Авторизован, а в LS.cart_authorized еще нет true — первая страница после входа (в т.ч. через альтернативный интерфейс):
 * текущая гостевая LS.cart сохраняется в LS.cart_history, но только если в cart_history нет ни валидного списка, ни маркера added;
 * пустая корзина — пишется added; затем в LS.cart_authorized пишется true
 * Запускается до любых getCart, поэтому серверная корзина в cart_history не попадает
 * Гость, а в LS.cart_authorized true — сессия протухла или выход был в другом интерфейсе: resetLocalCartOnLogout
 */
function initCartAuthState() {
  try {
    const userBlock = document.querySelector('.header--main--actions--user');
    if (!userBlock) return;

    const isAuthorized = localStorage.getItem(ADD_TO_CART_CONFIG.authorizedStorageKey) === ADD_TO_CART_CONFIG.authorizedValue;

    if (!userBlock.classList.contains('__account_active')) {
      if (isAuthorized) resetLocalCartOnLogout();
      return;
    }

    if (isAuthorized) return;

    const historyJson = localStorage.getItem(ADD_TO_CART_CONFIG.historyStorageKey);
    if (historyJson !== ADD_TO_CART_CONFIG.historyAddedValue && !isValidCartHistory(historyJson)) {
      const localCart = readLocalCart();
      localStorage.setItem(
        ADD_TO_CART_CONFIG.historyStorageKey,
        localCart.length > 0 ? JSON.stringify(localCart) : ADD_TO_CART_CONFIG.historyAddedValue
      );
    }

    localStorage.setItem(ADD_TO_CART_CONFIG.authorizedStorageKey, ADD_TO_CART_CONFIG.authorizedValue);
  } catch (e) {
    return;
  }
}

async function writeLocalCart(cart, isGuest) {
  let cartJson = JSON.stringify(cart);

  if (!isGuest) {
    cartJson = await requestUpdateCart(cartJson);
    cart = parseLocalCart(cartJson);
  }

  try {
    localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
  } catch (e) {
    return;
  }

  updateCartBadge(cart);
}

function updateCartBadge(cart) {
  refreshBuyButtonLabels();

  if (cart.length === 0) {
    hideBuyButtonOpenCart();
  }

  const basket = document.querySelector('.header--main--actions--basket');
  if (!basket) return;

  if (cart.length > 0) {
    basket.classList.add('__has-badge');
    basket.style.setProperty('--badge-content', `'${cart.length}'`);
  } else {
    basket.classList.remove('__has-badge');
    basket.style.removeProperty('--badge-content');
  }
}

function initLocalCartBadge() {
  updateCartBadge(readLocalCart());

  window.addEventListener('storage', (e) => {
    if (e.key !== ADD_TO_CART_CONFIG.storageKey) return;
    updateCartBadge(parseLocalCart(e.newValue));
  });

  /**
   * Возврат по истории (bfcache или кеш страницы) не выполняет скрипты заново,
   * поэтому бейдж пересчитывается из LS на pageshow с persisted
   */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    updateCartBadge(readLocalCart());
  });
}

/**
 * Изменение количества позиции корзины по sha
 * Роли запрашиваются для выбора: гость — только LS, авторизованный — через updateCart
 */
async function updateLocalCartQuantity(sha, quantity) {
  if (!sha) return;

  const cart = readLocalCart();
  const row = cart.find(r => r.sha === sha);
  if (!row) return;

  row.quantity = quantity;

  try {
    const roles = await getCartRoles();
    await writeLocalCart(cart, isCartGuest(roles));
  } catch (err) {
    return;
  }
}

/**
 * Удаление позиции корзины по sha
 * Гость — строка убирается из LS, авторизованный — в LS пишется ответ deleteFromCart
 */
async function removeFromLocalCart(sha) {
  if (!sha) return;

  try {
    const roles = await getCartRoles();
    let cart;
    let cartJson;

    if (isCartGuest(roles)) {
      cart = readLocalCart().filter(r => r.sha !== sha);
      cartJson = JSON.stringify(cart);
    } else {
      cartJson = await requestDeleteFromCart(sha);
      cart = parseLocalCart(cartJson);
    }

    localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
    updateCartBadge(cart);
  } catch (err) {
    return;
  }
}

/**
 * Полная очистка корзины
 * Гость — LS чистится локально, авторизованный — в LS пишется ответ deleteAllFromCart
 */
async function clearLocalCart() {
  try {
    const roles = await getCartRoles();
    let cartJson;

    if (isCartGuest(roles)) {
      cartJson = '[]';
    } else {
      cartJson = await requestDeleteAllFromCart();
    }

    localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
    updateCartBadge(parseLocalCart(cartJson));
  } catch (err) {
    return;
  }
}

/**
 * Текущий sku со страницы товара
 */
function getProductSku(productEl) {
  return productEl.getAttribute('data-sku-id') || '';
}

/**
 * Выбранные значения диких опций (---option без __sku и __links)
 */
function getProductOptions(productEl) {
  const checked = productEl.querySelectorAll('.---option:not(.__sku):not(.__links) .---option--option-data li.__checked[data-value-key]');

  return Array.from(checked).map(li => li.getAttribute('data-value-key'));
}

/**
 * Сравнение списков опций без учёта порядка
 */
function isSameOptions(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;

  const sortedA = a.slice().sort();
  const sortedB = b.slice().sort();

  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Позиция корзины, совпадающая по sku и options
 */
function findLocalCartRow(cart, sku, options) {
  return cart.find(row => String(row.sku) === String(sku) && isSameOptions(row.options, options)) || null;
}

/**
 * Надпись на кнопке покупки по состоянию корзины
 */
function updateBuyButtonLabel(productEl, buyButton) {
  if (buyButton.classList.contains('__error')) return;

  let text;

  const row = findLocalCartRow(readLocalCart(), getProductSku(productEl), getProductOptions(productEl));

  if (row) {
    text = ADD_TO_CART_CONFIG.inCartText + ' ' + row.quantity;
  } else if ('buttonText' in buyButton.dataset) {
    text = buyButton.dataset.buttonText;
  }

  if (text !== undefined && buyButton.textContent !== text) {
    buyButton.textContent = text;
  }
}

/**
 * Правила количества товара
 * data-minimum-order — минимальный заказ (по умолчанию 1)
 * data-multiplicity — кратность итогового количества (по умолчанию 1)
 */
function getProductQuantityRules(el) {
  const min = el ? parseInt(el.getAttribute('data-minimum-order'), 10) : NaN;
  const step = el ? parseInt(el.getAttribute('data-multiplicity'), 10) : NaN;

  return {
    min: min > 0 ? min : 1,
    step: step > 0 ? step : 1
  };
}

/**
 * Округление количества вверх до кратного шагу и не менее минимума
 */
function alignQuantityUp(quantity, rules) {
  return Math.ceil(Math.max(quantity, rules.min) / rules.step) * rules.step;
}

/**
 * Добавление позиции в корзину
 */
async function addToLocalCart(productEl, isGuest) {
  const sku = getProductSku(productEl);
  if (!sku) return;

  await addRowToLocalCart(sku, getProductOptions(productEl), isGuest, getProductQuantityRules(productEl));
}

/**
 * Добавление позиции по sku и options в корзину
 * Общее для ---buy-box--buy-button и item--buy-button
 *   новая позиция — минимальный заказ, округленный вверх до кратного шагу (min=7, шаг 5 — 10)
 *   позиция уже есть — к количеству прибавляется только шаг кратности
 */
async function addRowToLocalCart(sku, options, isGuest, rules) {
  const quantityRules = rules || { min: 1, step: 1 };
  const cart = readLocalCart();
  let row = findLocalCartRow(cart, sku, options);

  if (row) {
    row.quantity = (parseInt(row.quantity, 10) || 0) + quantityRules.step;
  } else {
    row = { sku: sku, quantity: alignQuantityUp(quantityRules.min, quantityRules), options: options };
    row.sha = await cartRowHash(row);
    cart.push(row);
  }

  await writeLocalCart(cart, isGuest);
}

/**
 * Действия после успешного добавления товара в корзину
 * Общие для всех кнопок: ---buy-box--buy-button на странице товара и в панели, item--buy-button
 *   header получает __sticky-block-hide и теряет __mobile-hidden (на мобиле) — виден бейдж корзины;
 *   кроме добавления из панели товара (inPanel)
 *   корзина открывается только если до добавления она была пуста (wasEmpty)
 *   панель товара при этом не закрывается — корзина открывается поверх неё
 */
function afterAddToCart(wasEmpty, inPanel) {
  if (!inPanel && typeof window.setStickyBlockHide === 'function') {
    window.setStickyBlockHide();
  }

  if (!inPanel && typeof window.showMobileHeader === 'function') {
    window.showMobileHeader();
  }

  if (!wasEmpty) return;

  // Пауза, чтобы пользователь увидел изменившуюся надпись на кнопке
  setTimeout(() => {
    if (typeof window.openMobileCartPanel === 'function') {
      window.openMobileCartPanel();
    }
  }, ADD_TO_CART_CONFIG.panelBuyCartDelay);
}

const BUY_BUTTONS = new Map();

/**
 * Кнопка покупки ---buy-box--buy-button, привязанная к main.product в initAddToCart
 */
function getProductBuyButton(productEl) {
  for (const [buyButton, el] of BUY_BUTTONS) {
    if (el === productEl) return buyButton;
  }

  return null;
}

/**
 * Добавление текущего товара в корзину по кнопке покупки
 * Общее для клика по ---buy-box--buy-button и ---delivery--free--open-cart
 *   на время запроса кнопка получает __disabled, ошибка updateCart показывается на кнопке
 *   возвращает { wasEmpty } (корзина была пуста до добавления) или null при ошибке
 */
async function addProductToCart(productEl, buyButton) {
  buyButton.classList.add('__disabled');

  try {
    const roles = await getCartRoles();
    const wasEmpty = readLocalCart().length === 0;

    await addToLocalCart(productEl, isCartGuest(roles));
    return { wasEmpty };
  } catch (err) {
    if (err && err.cartError) {
      showCartButtonError(buyButton, err.cartError);
    }
    return null;
  } finally {
    buyButton.classList.remove('__disabled');
  }
}

/**
 * Buy Button Open Cart
 * Плашка ---buy-box--open-cart выдвигается из-под ---buy-box--buy-button после добавления товара,
 *   если корзина уже была не пуста и сама не открылась (первый товар открывает корзину — см. afterAddToCart)
 *   создается при первом показе и вставляется сразу после кнопки;
 *   уже показанная (__active) повторно не выдвигается
 *   клик по всей плашке открывает панель корзины (window.openMobileCartPanel);
 *   всплытие клика останавливается, иначе document-обработчик панели корзины сразу её закроет
 *   плавающая кнопка (__floating) переносит плашку вместе с собой — см. initFloatingBuyButton в product.js
 */
function showBuyButtonOpenCart(buyButton) {
  const next = buyButton.nextElementSibling;

  if (next && next.classList.contains('---buy-box--open-cart')) {
    next.classList.add('__active');
    return;
  }

  const plate = document.createElement('div');
  plate.className = '---buy-box--open-cart __active';
  plate.textContent = ADD_TO_CART_CONFIG.openCartText;

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-cart-shopping';
  plate.appendChild(icon);

  plate.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (typeof window.openMobileCartPanel === 'function') {
      window.openMobileCartPanel();
    }
  });

  buyButton.after(plate);
}

/**
 * Скрытие плашек ---buy-box--open-cart, когда корзина опустела (вызывается из updateCartBadge)
 * Следующее добавление снова откроет корзину, а плашка выдвинется только после него
 */
function hideBuyButtonOpenCart() {
  document.querySelectorAll('.---buy-box--open-cart.__active').forEach((plate) => {
    plate.classList.remove('__active');
  });
}

/**
 * Пересчёт надписей всех кнопок покупки на странице по текущему состоянию LS.cart
 */
function refreshBuyButtonLabels() {
  BUY_BUTTONS.forEach((productEl, buyButton) => {
    if (!productEl.isConnected) {
      BUY_BUTTONS.delete(buyButton);
      return;
    }

    updateBuyButtonLabel(productEl, buyButton);
  });
}

/**
 * Инициализация кнопки покупки
 * Следит за сменой sku и выбранных опций, чтобы обновлять надпись
 * Добавление в непустую корзину выдвигает из-под кнопки плашку «Открыть корзину» (showBuyButtonOpenCart)
 * Плавающая кнопка (__floating) может быть уже вынесена в body из initFloatingBuyButton (product.js) —
 *   тогда она ищется как прямой потомок body
 * Повторно на ту же кнопку обработчики не вешаются
 */
function initAddToCart() {
  const productEl = document.querySelector('main.product');
  if (!productEl) return;

  const buyButton = productEl.querySelector('.---buy-box--buy-button') || document.querySelector('body > .---buy-box--buy-button');
  if (!buyButton || BUY_BUTTONS.has(buyButton)) return;

  BUY_BUTTONS.set(buyButton, productEl);
  updateBuyButtonLabel(productEl, buyButton);

  const observer = new MutationObserver(() => {
    updateBuyButtonLabel(productEl, buyButton);
  });

  observer.observe(productEl, {
    attributes: true,
    attributeFilter: ['class', 'data-sku-id', 'data-button-text'],
    subtree: true
  });

  observer.observe(buyButton, {
    attributes: true,
    attributeFilter: ['class', 'data-button-text']
  });

  buyButton.addEventListener('click', async (e) => {
    e.preventDefault();

    if (buyButton.classList.contains('__disabled')) return;
    if (buyButton.classList.contains('__block')) return;

    if (buyButton.classList.contains('__not_in_stock') && buyButton.classList.contains('__short_1_click')) {
      await checkoutInOneClick(productEl, buyButton, 'REQUEST');
      return;
    }

    const result = await addProductToCart(productEl, buyButton);
    if (!result) return;

    afterAddToCart(result.wasEmpty, Boolean(productEl.closest('.mobile-right-panel')));

    if (!result.wasEmpty) {
      showBuyButtonOpenCart(buyButton);
    }
  });

  initBuyInOneClick(productEl);
  initProductDelivery(productEl);
}

/**
 * Количество товара для покупки в 1 клик, расчета доставки и суммы скидки на доставку
 *   data-minimum-order, округленный вверх до кратного data-multiplicity у main.product (min=7, шаг 5 — 10; min=1, шаг 5 — 5)
 */
function getProductOrderQuantity(productEl) {
  const rules = getProductQuantityRules(productEl);
  return alignQuantityUp(rules.min, rules);
}

/**
 * Позиция товара { sku, quantity, options, sha } для покупки в 1 клик и расчета доставки
 * quantity — getProductOrderQuantity, в LS.cart не пишется
 */
async function buildProductCartRow(productEl, sku) {
  const row = { sku: sku, quantity: getProductOrderQuantity(productEl), options: getProductOptions(productEl) };
  row.sha = await cartRowHash(row);
  return row;
}

/**
 * Buy In One Click
 * Кнопка ---buy-box--buy-in-one-click на странице товара и в панели
 *   товар в корзину не добавляется — позиция { sku, quantity, options, sha } сразу уходит
 *   на /post-endpoints/createCheckout, как у ---cart-item--buy-button
 *   quantity — минимальный заказ с учётом кратности (getProductOrderQuantity), CITY — selected_city_id из localStorage
 *   по номеру заказа уходим на /checkout/[номер]?1_CLICK=true
 *   ---buy-box--buy-button с __not_in_stock __short_1_click делает то же самое, но уходит на ?REQUEST=true
 */
async function checkoutInOneClick(productEl, button, flag) {
  if (button.classList.contains('__disabled') || button.classList.contains('__error')) return;

  const sku = getProductSku(productEl);
  if (!sku) return;

  button.classList.add('__disabled');

  let result;

  try {
    const row = await buildProductCartRow(productEl, sku);

    result = await requestCheckout(JSON.stringify([row]), (localStorage.getItem('selected_city_id') || '').trim());
  } catch (err) {
    button.classList.remove('__disabled');
    showCartButtonError(button, err && err.cartError ? err.cartError : 'Ошибка оформления заказа');
    return;
  }

  button.classList.remove('__disabled');

  if (!result.checkout) {
    showCartButtonError(button, 'Ошибка оформления заказа');
    return;
  }

  window.location.href = CHECKOUT_PAGE_URL + encodeURIComponent(String(result.checkout)) + '?' + flag + '=true';
}

function initBuyInOneClick(productEl) {
  const button = productEl.querySelector('.---buy-box--buy-in-one-click');
  if (!button) return;

  button.addEventListener('click', (e) => {
    e.preventDefault();
    checkoutInOneClick(productEl, button, '1_CLICK');
  });
}

/**
 * Delivery Loader
 * Минимальное время показа лоадера доставок (cart--delivery--loading в корзине, ---delivery--loading в товаре)
 *   промис разрешается, когда с startedAt прошло DELIVERY_LOADING_MIN_MS — до этого ответ эндпойнта не обрабатывается:
 *   лоадер не скрывается, список не заменяется, __wait_data не снимается, скидка на доставку не пересчитывается
 */
function waitDeliveryLoadingMin(startedAt) {
  const delay = DELIVERY_LOADING_MIN_MS - (Date.now() - startedAt);
  return delay > 0 ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
}

/**
 * Free Delivery Levels
 * Общие для корзины (cart--delivery--free) и товара (---delivery--free) функции порогов скидки на доставку
 *   data-multiple-limit="90000:2000,120000:3000" — порог:макс_цена_доставки
 *   при достижении порога все доставки с ценой ≤ макс_цена становятся бесплатными (__free, цена — 0, исходная сохраняется в data-original-price)
 */
function parseAdditionalLimits(str) {
  if (!str) return [];
  return str.split(',').map(part => {
    const [threshold, priceLimit] = part.split(':').map(s => parseInt(s.trim(), 10));
    return { threshold: threshold || 0, priceLimit: priceLimit || 0 };
  }).sort((a, b) => a.threshold - b.threshold);
}

function getOriginalPrice(priceEl) {
  return parseInt((priceEl.dataset.originalPrice || priceEl.textContent).replace(/\s/g, ''), 10) || 0;
}

function applyAdditionalLevels(priceEls, levels, currentSum) {
  priceEls.forEach(priceEl => {
    const origPrice = getOriginalPrice(priceEl);
    let shouldBeFree = false;

    for (const level of levels) {
      if (currentSum >= level.threshold && origPrice <= level.priceLimit) {
        shouldBeFree = true;
        break;
      }
    }

    if (shouldBeFree) {
      if (!priceEl.dataset.originalPrice) {
        priceEl.dataset.originalPrice = priceEl.textContent.trim();
      }
      priceEl.textContent = '0';
      priceEl.classList.add('__free');
    } else {
      if (priceEl.dataset.originalPrice) {
        priceEl.textContent = priceEl.dataset.originalPrice;
        delete priceEl.dataset.originalPrice;
      }
      priceEl.classList.remove('__free');
    }
  });
}

/**
 * Product Delivery
 * Кнопка ---delivery--get-delivery на странице товара и в панели отправляет на /post-endpoints/cartDelivery
 *   CART — список из одной позиции товара (buildProductCartRow, quantity — getProductOrderQuantity), CITY — data-city-id у ---delivery--city, если не пустой, FOR_CART=false
 *   на время запроса кнопка получает __disabled и текст «Запрашиваю данные», ---delivery--loading — __active (полоска прогресса),
 *   ответ обрабатывается не раньше DELIVERY_LOADING_MIN_MS с начала запроса (см. waitDeliveryLoadingMin),
 *   ---delivery--free — __wait_data (полупрозрачный, логика скидки на доставку не работает до получения новых li)
 *   ответ html вставляется в ---delivery--results ul, кнопке ставится __hidden, ---delivery--results — __active
 *   при ошибке текст ошибки показывается на кнопке
 *   city.js вызывает product-city-change на ---delivery--city при смене data-city-id — см. refreshProductDelivery
 *   при смене data-sku-id у main.product доставка сбрасывается к кнопке (resetProductDelivery), автоматически не перезапрашивается
 *   ---delivery--free--open-cart открывает панель корзины (как account--info--links--cart) и сразу запускает в ней расчет доставки;
 *   если текущего товара (sku + опции) нет в корзине — сначала добавляет его, как клик по ---buy-box--buy-button (addProductToCart),
 *   при ошибке добавления корзина не открывается; при __not_in_stock у ---buy-box--buy-button ничего не делает
 */
async function requestProductDelivery(productEl, delivery, sku) {
  const params = new URLSearchParams();
  params.set('CART', JSON.stringify([await buildProductCartRow(productEl, sku)]));

  const cityBlock = delivery.querySelector('.---delivery--city');
  const cityId = cityBlock ? (cityBlock.dataset.cityId || '').trim() : '';
  if (cityId) params.set('CITY', cityId);
  params.set('FOR_CART', 'false');

  const response = await fetch(CART_DELIVERY_ENDPOINT_URL, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return response.text();
}

function setProductDeliveryLoading(delivery, isLoading) {
  const loading = delivery.querySelector('.---delivery--loading');
  if (loading) loading.classList.toggle('__active', isLoading);

  const freeEl = delivery.querySelector('.---delivery--free');
  if (freeEl) freeEl.classList.toggle('__wait_data', isLoading);
}

/**
 * Скидка на доставку товара (по аналогии с cart--delivery--free, без прогресс-бара)
 *   сумма для порогов data-multiple-limit — число из ---buy-box--price, умноженное на getProductOrderQuantity
 *   (с __on_request или без числа блок скрыт)
 *   цены с __null_price в расчете не участвуют и __free не получают
 *   пока у блока стоит __wait_data (идет запрос доставок) — ничего не меняется
 *   блок показывается (__active), если у ---buy-box--buy-button нет __not_in_stock, есть недостигнутый порог
 *   и в полученном списке доставок есть li без __free и __null_price
 *   (до расчета доставки блок скрыт), остаток до следующего порога не выводится
 *   пересчитывается после получения доставок, при сбросе доставки, при изменении ---buy-box--price и классов ---buy-box--buy-button
 *   (во время slot-анимации ---buy-box--price — только после ее завершения)
 */
function getProductDeliverySum(productEl) {
  const priceEl = productEl.querySelector('.---buy-box--price');
  if (!priceEl || priceEl.classList.contains('__on_request')) return null;

  const price = parsePriceString(priceEl.textContent);
  if (price === null) return null;

  return price * getProductOrderQuantity(productEl);
}

function updateProductFreeDelivery(productEl, delivery) {
  const freeEl = delivery.querySelector('.---delivery--free');
  if (!freeEl || freeEl.classList.contains('__wait_data')) return;

  const priceEls = Array.from(delivery.querySelectorAll('.---delivery--results li .---delivery--results--price:not(.__null_price)'));
  const levels = parseAdditionalLimits(freeEl.dataset.multipleLimit || '');
  const productSum = getProductDeliverySum(productEl);
  const currentSum = productSum === null ? 0 : productSum;

  applyAdditionalLevels(priceEls, levels, currentSum);

  const nextLevel = productSum === null ? null : levels.find(level => currentSum < level.threshold);
  const hasPaidDelivery = priceEls.some(priceEl => !priceEl.classList.contains('__free'));
  const textEl = freeEl.querySelector('.---delivery--free--text');
  const buyButton = getProductBuyButton(productEl);
  const inStock = Boolean(buyButton) && !buyButton.classList.contains('__not_in_stock');

  if (!nextLevel || !hasPaidDelivery || !inStock) {
    freeEl.classList.remove('__active');
    if (textEl) textEl.classList.remove('__active');
    return;
  }

  freeEl.classList.add('__active');
  if (textEl) textEl.classList.add('__active');
}

/**
 * Обновление рассчитанной доставки товара при смене города (product-city-change)
 *   если ---delivery--results в __active или идет запрос по кнопке — /post-endpoints/cartDelivery перезапрашивается в фоне,
 *   список не закрывается, на время запроса ---delivery--loading — __active, ---delivery--free — __wait_data
 *   полученные li заменяют список, кнопке ---delivery--get-delivery ставится __hidden,
 *   ---delivery--results появляется заново с анимацией, скидка на доставку пересчитывается
 *   ответ предыдущего запроса игнорируется, если уже ушел следующий; при ошибке доставка сбрасывается к кнопке
 */
async function refreshProductDelivery(productEl, delivery) {
  const button = delivery.querySelector('.---delivery--get-delivery');
  const results = delivery.querySelector('.---delivery--results');
  const deliveryList = results ? results.querySelector('ul') : null;
  if (!button || !deliveryList) return;

  if (!results.classList.contains('__active') && !delivery._deliveryRequest) return;

  const sku = getProductSku(productEl);
  if (!sku) return;

  const request = Symbol();
  delivery._deliveryRequest = request;
  setProductDeliveryLoading(delivery, true);

  const startedAt = Date.now();
  let html = null;

  try {
    html = await requestProductDelivery(productEl, delivery, sku);
  } catch (err) {
    html = null;
  }

  await waitDeliveryLoadingMin(startedAt);

  if (delivery._deliveryRequest !== request) return;

  delivery._deliveryRequest = null;
  setProductDeliveryLoading(delivery, false);

  if (html === null) {
    resetProductDelivery(delivery);
    updateProductFreeDelivery(productEl, delivery);
    return;
  }

  deliveryList.innerHTML = html;
  button.classList.add('__hidden');
  results.classList.remove('__active');
  void results.offsetWidth;
  results.classList.add('__active');
  updateProductFreeDelivery(productEl, delivery);
}

/**
 * Сброс рассчитанной доставки товара к кнопке ---delivery--get-delivery
 * ---delivery--results ul очищается, с ---delivery--results снимается __active, ---delivery--loading скрывается,
 * скрытая кнопка теряет __hidden и получает __appear (анимация появления),
 * ответ запроса в полёте игнорируется
 * Вызывается при ошибке обновления доставок (refreshProductDelivery) и при смене data-sku-id у main.product
 */
function resetProductDelivery(delivery) {
  delivery._deliveryRequest = null;
  setProductDeliveryLoading(delivery, false);

  const results = delivery.querySelector('.---delivery--results');
  if (results) {
    results.classList.remove('__active');
    const deliveryList = results.querySelector('ul');
    if (deliveryList) deliveryList.innerHTML = '';
  }

  const button = delivery.querySelector('.---delivery--get-delivery');
  if (button && button.classList.contains('__hidden')) {
    button.classList.add('__appear');
    button.classList.remove('__hidden');
  }
}

function initProductDelivery(productEl) {
  const delivery = productEl.querySelector('.---delivery');
  if (!delivery) return;

  const button = delivery.querySelector('.---delivery--get-delivery');
  const results = delivery.querySelector('.---delivery--results');
  const deliveryList = results ? results.querySelector('ul') : null;
  if (!button || !deliveryList) return;

  delivery.addEventListener('product-city-change', () => {
    refreshProductDelivery(productEl, delivery);
  });

  new MutationObserver((mutations) => {
    const skuChanged = mutations.some(m => m.oldValue !== productEl.getAttribute('data-sku-id'));
    if (!skuChanged) return;

    resetProductDelivery(delivery);
    updateProductFreeDelivery(productEl, delivery);
  }).observe(productEl, {
    attributes: true,
    attributeFilter: ['data-sku-id'],
    attributeOldValue: true
  });

  const priceEl = productEl.querySelector('.---buy-box--price');
  if (priceEl) {
    new MutationObserver(() => {
      if (priceEl._scrambleRaf) return;
      updateProductFreeDelivery(productEl, delivery);
    }).observe(priceEl, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  const buyButton = getProductBuyButton(productEl);
  if (buyButton) {
    new MutationObserver(() => updateProductFreeDelivery(productEl, delivery)).observe(buyButton, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  const openCartSpan = delivery.querySelector('.---delivery--free--open-cart');
  if (openCartSpan) {
    openCartSpan.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!buyButton || buyButton.classList.contains('__not_in_stock')) return;

      const inCart = findLocalCartRow(readLocalCart(), getProductSku(productEl), getProductOptions(productEl));

      if (!inCart) {
        if (buyButton.classList.contains('__disabled') || buyButton.classList.contains('__block')) return;

        const result = await addProductToCart(productEl, buyButton);
        if (!result) return;

        afterAddToCart(false, Boolean(productEl.closest('.mobile-right-panel')));
      }

      if (typeof window.openMobileCartPanel === 'function') window.openMobileCartPanel({ getDelivery: true });
    });
  }

  button.addEventListener('click', async (e) => {
    e.preventDefault();

    if (button.classList.contains('__disabled') || button.classList.contains('__error')) return;

    const sku = getProductSku(productEl);
    if (!sku) return;

    const request = Symbol();
    delivery._deliveryRequest = request;

    const buttonText = button.textContent;
    button.classList.add('__disabled');
    button.textContent = 'Запрашиваю данные';
    setProductDeliveryLoading(delivery, true);

    const startedAt = Date.now();
    let html = null;

    try {
      html = await requestProductDelivery(productEl, delivery, sku);
    } catch (err) {
      html = null;
    }

    await waitDeliveryLoadingMin(startedAt);

    button.classList.remove('__disabled');
    button.textContent = buttonText;

    if (delivery._deliveryRequest !== request) return;

    delivery._deliveryRequest = null;
    setProductDeliveryLoading(delivery, false);

    if (html === null) {
      showCartButtonError(button, 'Ошибка расчета доставки');
      return;
    }

    deliveryList.innerHTML = html;
    button.classList.add('__hidden');
    results.classList.add('__active');
    updateProductFreeDelivery(productEl, delivery);
  });
}

/**
 * Catalog Item Buy
 * Кнопка item--buy-button в карточке товара каталога
 *   data-has-sku и data-options-inside оба "false" — опций нет, позиция сразу уходит в корзину по sku из data-sku
 *   data-has-sku="true" (sku-опции) или data-options-inside="true" (дикие опции внутри товара) —
 *   открывается панель добавления (mobile-right-panel __wide __half __scrollable),
 *   тело панели — html от /get-endpoints/product с параметрами PRODUCT (data-product-id) и SKU
 *   SKU — data-sku карточки, а если там sku_show — data-sku-id у li.__active в item--sku-show
 *   ответ — main.product; после вставки запускаются initLazyLoad, initProductPanel из product.js
 *   (галерея, опции, sku-синк, дикие опции) и initAddToCart для ---buy-box--buy-button
 *   в data-product-link на main.product копируется href ссылки карточки — по нему работает
 *   переход по клику на заголовок (initCatalogBuyPanelTitleLink)
 *   item--buy-button __order-button без панели — в корзину не добавляет, позиция сразу уходит
 *   на /post-endpoints/createCheckout и переход на /checkout/[номер]?REQUEST=true; с панелью — панель открывается как обычно
 */

/**
 * Текущий sku карточки каталога
 */
function getCatalogItemSku(article) {
  const dataSku = article.getAttribute('data-sku') || '';

  if (dataSku !== ADD_TO_CART_CONFIG.skuShowValue) return dataSku;

  const activeLi = article.querySelector('.item--sku-show li.__active');

  return activeLi ? (activeLi.getAttribute('data-sku-id') || '') : '';
}

/**
 * Загрузка html товара для панели добавления
 */
async function requestCatalogBuyProduct(productId, sku) {
  const params = new URLSearchParams();
  params.set('PRODUCT', productId);
  params.set('SKU', sku);

  const response = await fetch(ADD_TO_CART_CONFIG.productEndpoint + '?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return await response.text();
}

/**
 * Панель добавления товара в корзину из каталога
 */
class CatalogBuyPanel {
  constructor() {
    this.panel = null;
    this.article = null;
    this.contentWrapper = null;
    this.productPanel = null;
  }

  createPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __half __scrollable';

    const header = document.createElement('div');
    header.className = 'mobile-right-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-right-panel--header--title';
    titleButton.type = 'button';
    titleButton.textContent = ADD_TO_CART_CONFIG.catalogPanelTitle;
    titleButton.setAttribute('aria-label', 'Закрыть: ' + ADD_TO_CART_CONFIG.catalogPanelTitle);
    titleButton.addEventListener('click', () => this.closePanel());

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-right-panel--close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.addEventListener('click', () => this.closePanel());

    header.appendChild(titleButton);
    header.appendChild(closeButton);

    const content = document.createElement('div');
    content.className = 'mobile-right-panel--content';

    panel.appendChild(header);
    panel.appendChild(content);

    document.body.appendChild(panel);

    this.panel = panel;
    this.contentWrapper = content;
  }

  async openPanel(article) {
    const sameArticle = this.panel && this.article === article;

    if (this.panel) {
      this.closePanel();

      if (sameArticle) return;
    }

    if (typeof window.closeMobileCartPanel === 'function') {
      window.closeMobileCartPanel();
    }

    window.lockPanelScroll();

    this.article = article;
    this.createPanel();

    this.panel.classList.add('__active');

    const productId = article.getAttribute('data-product-id') || '';
    const sku = getCatalogItemSku(article);

    let html = '';
    try {
      html = await requestCatalogBuyProduct(productId, sku);
    } catch (err) {
      html = '';
    }

    if (!this.panel || this.article !== article) return;

    this.contentWrapper.innerHTML = html;

    if (typeof window.initLazyLoad === 'function') {
      window.initLazyLoad(this.contentWrapper);
    }

    const productEl = this.contentWrapper.querySelector('main.product');
    const articleLink = article.querySelector(':scope > a[href]');
    if (productEl && articleLink) {
      productEl.setAttribute('data-product-link', articleLink.getAttribute('href'));
    }

    if (typeof window.initProductPanel === 'function') {
      this.productPanel = window.initProductPanel(productEl);
    }

    initAddToCart();
  }

  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;

    closingPanel.classList.remove('__active');

    if (this.productPanel && typeof this.productPanel.destroy === 'function') {
      this.productPanel.destroy();
    }

    this.panel = null;
    this.article = null;
    this.contentWrapper = null;
    this.productPanel = null;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Анимация нажатия на item--buy-button — класс __pop с кейфреймами button-pop
 * Класс снимается по окончании анимации, чтобы срабатывала на каждый клик
 */
function playCatalogBuyPop(button) {
  button.classList.remove('__pop');
  void button.offsetWidth;
  button.classList.add('__pop');

  button.addEventListener('animationend', () => {
    button.classList.remove('__pop');
  }, { once: true });
}

/**
 * Клик по item--buy-button без sku — позиция сразу в корзину
 * Количество — по data-multiplicity и data-minimum-order карточки
 * При открытии панели эти атрибуты карточки не используются — работает main.product в панели
 */
async function handleCatalogBuyClick(article, button) {
  const sku = getCatalogItemSku(article);
  if (!sku) return;

  if (button.classList.contains('__disabled')) return;

  button.classList.add('__disabled');

  try {
    const roles = await getCartRoles();
    const wasEmpty = readLocalCart().length === 0;

    await addRowToLocalCart(sku, [], isCartGuest(roles), getProductQuantityRules(article));
    afterAddToCart(wasEmpty, false);
  } catch (err) {
    return;
  } finally {
    button.classList.remove('__disabled');
  }
}

/**
 * Клик по item--buy-button __order-button без sku — запрос товара
 * Позиция { sku, quantity, options, sha } в корзину не добавляется, сразу уходит на /post-endpoints/createCheckout
 * Количество — по data-multiplicity и data-minimum-order карточки, CITY — selected_city_id из localStorage
 * По номеру заказа уходим на /checkout/[номер]?REQUEST=true
 * У кнопки нет текста — ошибка только в консоль
 */
async function handleCatalogOrderClick(article, button) {
  const sku = getCatalogItemSku(article);
  if (!sku) return;

  if (button.classList.contains('__disabled')) return;

  button.classList.add('__disabled');

  let result;

  try {
    const rules = getProductQuantityRules(article);
    const row = { sku: sku, quantity: alignQuantityUp(rules.min, rules), options: [] };
    row.sha = await cartRowHash(row);

    result = await requestCheckout(JSON.stringify([row]), (localStorage.getItem('selected_city_id') || '').trim());
  } catch (err) {
    console.error('Ошибка оформления запроса:', err);
    button.classList.remove('__disabled');
    return;
  }

  if (!result.checkout) {
    console.error('Ошибка оформления запроса: нет номера чекаута');
    button.classList.remove('__disabled');
    return;
  }

  window.location.href = CHECKOUT_PAGE_URL + encodeURIComponent(String(result.checkout)) + '?REQUEST=true';
}

/**
 * Переход на страницу товара по клику на заголовок в панели покупки
 * Базовая ссылка — data-product-link на main.product (пишется из a карточки при открытии панели)
 * Не data-link: в header.js любой клик внутри [data-link] делает переход — сработало бы на всю панель
 * К ней добавляются SKU= из data-sku-id и OPTIONS= — выбранные дикие опции через запятую,
 * как в ссылке позиции корзины (---cart-item--image-info--block a)
 */
function initCatalogBuyPanelTitleLink() {
  document.addEventListener('click', (e) => {
    const title = e.target.closest('.mobile-right-panel .---params--title h1');
    if (!title) return;

    const productEl = title.closest('main.product');
    if (!productEl) return;

    const link = productEl.getAttribute('data-product-link');
    if (!link) return;

    const url = new URL(link, window.location.origin);

    const sku = getProductSku(productEl);
    if (sku) {
      url.searchParams.set('SKU', sku);
    }

    const options = getProductOptions(productEl);
    if (options.length > 0) {
      url.searchParams.set('OPTIONS', options.map(String).join(','));
    } else {
      url.searchParams.delete('OPTIONS');
    }

    window.location.href = url.pathname + url.search + url.hash;
  });
}

/**
 * Инициализация кнопки покупки в каталоге
 * Обработчик делегированный — карточки приходят и динамически (каталог, поиск, недавние)
 * Клики в панели select-опции, корзине, панелях склада и всех складов (__warehouse) панель покупки не закрывают,
 * Escape сначала закрывает вложенную панель select-опции, склада или всех складов
 */
function initCatalogBuy() {
  const buyPanel = new CatalogBuyPanel();

  window.closeCatalogBuyPanel = () => buyPanel.closePanel();

  document.addEventListener('click', (e) => {
    const button = e.target.closest('.item--buy-button');
    if (!button) return;

    const article = button.closest('article.item');
    if (!article) return;

    e.preventDefault();
    e.stopPropagation();

    playCatalogBuyPop(button);

    if (
      article.getAttribute('data-has-sku') === 'true' ||
      article.getAttribute('data-options-inside') === 'true'
    ) {
      buyPanel.openPanel(article);
    } else if (button.classList.contains('__order-button')) {
      handleCatalogOrderClick(article, button);
    } else {
      handleCatalogBuyClick(article, button);
    }
  });

  document.addEventListener('click', (e) => {
    if (!buyPanel.panel) return;

    if (e.target.closest('.mobile-panel.__select-option-panel')) return; // клик в мобильной панели select-опции панель покупки не закрывает

    if (e.target.closest('.mobile-right-panel.__cart')) return; // корзина открыта поверх панели покупки — панель остаётся открытой

    if (e.target.closest('.mobile-right-panel.__warehouse')) return; // панель склада или всех складов (product.js) открыта поверх панели покупки — панель остаётся открытой

    if (!buyPanel.panel.contains(e.target) && !e.target.closest('.item--buy-button')) {
      buyPanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !buyPanel.panel) return;

    e.stopImmediatePropagation();

    if (typeof window.closeSelectOptionMobilePanel === 'function') { // сначала закрывается вложенная панель select-опции
      window.closeSelectOptionMobilePanel();
      return;
    }

    if (typeof window.closeProductWarehousePanel === 'function') { // и вложенная панель склада
      window.closeProductWarehousePanel();
      return;
    }

    if (typeof window.closeProductWarehousesPanel === 'function') { // и вложенная панель всех складов
      window.closeProductWarehousesPanel();
      return;
    }

    buyPanel.closePanel();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCartAuthState();
  initLocalCartBadge();
  initAddToCart();
  initCatalogBuy();
  initCatalogBuyPanelTitleLink();
  initAccountCartSync();
});
