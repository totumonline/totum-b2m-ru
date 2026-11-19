/**
 * City Panel (checkout):
 * Закрытие панели выбора города по клику вне панели
 */
document.addEventListener('click', (e) => {
  const cityPanel = document.querySelector('.mobile-right-panel.__checkout');
  if (!cityPanel) return;

  if (!cityPanel.contains(e.target)) {
    closeCityPanel(cityPanel);
  }
});

/**
 * Short Checkout
 * .checkout.__short_checkout — короткий чекаут: доставка, оплата и суммы скрыты,
 * summary не считается, надпись на summary--checkout не меняется, ---steps--delivery всегда __filled,
 * для summary--checkout и summary--info отслеживаются только ---steps--customer и summary--terms,
 * getDeliveryMethods и setPoints не вызываются
 */
function isShortCheckout() {
  return !!document.querySelector('.checkout.__short_checkout');
}

/**
 * Blocked Checkout
 * .checkout.__blocked — чекаут уже является заказом и открыт из ЛК покупателя:
 * ---steps--delivery, ---steps--customer, ---steps--payment приходят с __filled и не перепроверяются,
 * summary--info не активируется, тип покупателя не переключается, инпуты только для чтения,
 * short--header--close ведет на /account/orders
 */
const CHECKOUT_BLOCKED_CLOSE_URL = '/account/orders';

function isBlockedCheckout() {
  return !!document.querySelector('.checkout.__blocked');
}

/**
 * Blocked Checkout Close
 * В фазе перехвата, раньше делегированного обработчика short--header из header.js
 */
document.addEventListener('click', (e) => {
  if (!e.target || !e.target.closest || !e.target.closest('.short--header--close')) return;
  if (!isBlockedCheckout()) return;

  e.preventDefault();
  e.stopPropagation();
  window.location.assign(CHECKOUT_BLOCKED_CLOSE_URL);
}, true);

/**
 * Blocked Checkout Order Costs
 * В режиме __blocked непустой data-order-delivery-cost у ---steps--delivery--items ставится в ---shipping-methods--results--price
 * выбранного способа доставки (с него снимается __null_price), непустой data-order-payment-fee — в data-transaction-cost
 * выбранного способа оплаты; выполняется до первого пересчета summary
 */
function initBlockedCheckoutOrderCosts() {
  if (!isBlockedCheckout()) return;

  const items = document.querySelector('.---steps--delivery--items');
  if (!items) return;

  const deliveryCost = (items.dataset.orderDeliveryCost || '').trim();
  const paymentFee = (items.dataset.orderPaymentFee || '').trim();

  if (deliveryCost !== '') {
    const priceEl = document.querySelector('.checkout.__blocked .---shipping-methods--results li.__checked .---shipping-methods--results--price');
    if (priceEl) {
      priceEl.textContent = formatCheckoutPrice(parseCheckoutPrice(deliveryCost));
      priceEl.classList.remove('__null_price');
    }
  }

  if (paymentFee !== '') {
    const paymentLi = document.querySelector('.checkout.__blocked .---steps--payment--methods li.__checked');
    if (paymentLi) paymentLi.dataset.transactionCost = paymentFee;
  }
}

document.addEventListener('DOMContentLoaded', initBlockedCheckoutOrderCosts);

/**
 * Customer Type Selector
 * Переключение между физическим и юридическим лицом
 * Устанавливает __active на кнопку и показывает нужный блок полей
 */
document.addEventListener('DOMContentLoaded', () => {
  const selector = document.querySelector('.---steps--customer--selector');
  if (!selector) return;

  function applyCustomerType(type) {
    const companyBlock = document.querySelector('.---steps--customer--company');
    if (companyBlock) {
      companyBlock.classList.toggle('__active', type === 'company');
    }

    checkCustomerFilled();
    updateCheckoutBlock();
  }

  selector.querySelectorAll('.---steps--customer--selector--button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isBlockedCheckout()) return;

      const changed = !btn.classList.contains('__active');

      selector.querySelectorAll('.---steps--customer--selector--button').forEach(b => b.classList.remove('__active'));
      btn.classList.add('__active');
      applyCustomerType(btn.dataset.customer);

      if (changed) scheduleCheckoutDataSend();
    });
  });

  // активная кнопка могла прийти с сервера, клика не было
  const activeBtn = selector.querySelector('.---steps--customer--selector--button.__active');
  if (activeBtn) applyCustomerType(activeBtn.dataset.customer);
});

/**
 * Input Clear Buttons
 * Показ/скрытие кнопки __clear во всех инпутах ---checkout-input--block
 * Очистка поля по клику на кнопку
 */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.---checkout-input--block input').forEach(input => {
    const block = input.closest('.---checkout-input--block');

    // __block приходит с сервера — поле показываем, но менять его нельзя
    if (block.classList.contains('__block') || isBlockedCheckout()) input.readOnly = true;

    const clearBtn = block.querySelector('.__clear');
    if (!clearBtn) return;

    function updateClear() {
      if (input.value.trim().length > 0) {
        clearBtn.classList.add('__active');
      } else {
        clearBtn.classList.remove('__active');
      }
    }

    input.addEventListener('input', () => {
      updateClear();
      checkDeliveryFilled();
      checkCustomerFilled();
      updateCheckoutBlock();
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      updateClear();
      checkDeliveryFilled();
      checkCustomerFilled();
      updateCheckoutBlock();
      input.focus();
    });

    // формат телефона из telephone.js, в том числе для значения, пришедшего с сервера
    if (input.type === 'tel') {
      input.value = formatTelephone(input.value);
      input.placeholder = '+7 (000) 000-00-00';
      initTelephoneFormat(input);
    }

    // value пришёл с сервера, события input не было — активируем как после ввода
    if (input.value.trim().length > 0) updateClear();
  });

  checkDeliveryFilled();
  checkCustomerFilled();
  updateCheckoutBlock();
});

/**
 * Comment Tab Focus
 * Tab в #comment переводит фокус в #customer-name, минуя кнопки между ними
 */
document.addEventListener('DOMContentLoaded', () => {
  const commentInput = document.querySelector('#comment input');
  const customerNameInput = document.querySelector('#customer-name input');
  if (!commentInput || !customerNameInput) return;

  commentInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    customerNameInput.focus();
  });
});

/**
 * Customer Email Check
 * Проверка формата email в #customer-email по SIGNUP_EMAIL_PATTERN из signup.js, как для subscribe-email
 * Запускается через 0.5 сек после последнего изменения, неверный email отмечается __invalid на input
 * Пустое поле ошибкой не считается — его отмечает __required
 */
const CHECKOUT_EMAIL_MAX_LENGTH = 300;
const CHECKOUT_EMAIL_CHECK_DELAY = 500;

function isCustomerEmailValid(input) {
  const email = input.value.trim();
  return email.length === 0 || (SIGNUP_EMAIL_PATTERN.test(email) && email.length <= CHECKOUT_EMAIL_MAX_LENGTH);
}

function checkCustomerEmail(input) {
  input.classList.toggle('__invalid', !isCustomerEmailValid(input));
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('#customer-email input');
  if (!input) return;

  let emailCheckTimer = null;

  input.addEventListener('input', () => {
    input.classList.remove('__invalid');
    clearTimeout(emailCheckTimer);
    emailCheckTimer = setTimeout(() => checkCustomerEmail(input), CHECKOUT_EMAIL_CHECK_DELAY);
  });

  const clearBtn = document.querySelector('#customer-email .__clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearTimeout(emailCheckTimer);
      input.classList.remove('__invalid');
    });
  }
});

/**
 * Checkout Busy
 * Пока идет запрос к эндпойнтам чекаута или ждет отложенная отправка данных — summary--checkout получает __loading,
 * чтобы нельзя было оформить заказ раньше, чем бэк получит актуальные данные
 * Счетчик позволяет нескольким запросам идти одновременно — __loading снимается после последнего
 */
let checkoutBusyCount = 0;

function updateCheckoutBusy() {
  const btn = document.querySelector('.summary--checkout');
  if (btn) btn.classList.toggle('__loading', checkoutBusyCount > 0);
}

function checkoutBusyStart() {
  checkoutBusyCount++;
  updateCheckoutBusy();
}

function checkoutBusyEnd() {
  checkoutBusyCount = Math.max(0, checkoutBusyCount - 1);
  updateCheckoutBusy();
}

/**
 * Checkout Data Save
 * Любое изменение инпута в ---checkout-input--block (ввод, очистка __clear, выбор сохраненного адреса)
 * через 0.5 сек после последнего изменения отправляет значения всех инпутов на /post-endpoints/checkout/setCheckoutData
 * Ключ — id блока инпута заглавными с - замененным на _ (customer-name → CUSTOMER_NAME), плюс CHECKOUT_NUM
 * и CUSTOMER_TYPE — data-customer активной ---steps--customer--selector--button, смена __active тоже запускает отправку
 * Значения, пришедшие с сервера, сами по себе не отправляются — только после изменения
 */
const CHECKOUT_SET_DATA_URL = '/post-endpoints/checkout/setCheckoutData';
const CHECKOUT_SET_DATA_DELAY = 500;

let checkoutDataTimer = null;

async function sendCheckoutData() {
  const checkoutNum = getCheckoutNum();
  if (!checkoutNum) return;

  const body = new FormData();
  body.append('CHECKOUT_NUM', checkoutNum);

  const activeCustomerBtn = document.querySelector('.---steps--customer--selector--button.__active');
  if (activeCustomerBtn) body.append('CUSTOMER_TYPE', activeCustomerBtn.dataset.customer || '');

  document.querySelectorAll('.---checkout-input--block[id] input').forEach(input => {
    const block = input.closest('.---checkout-input--block');
    if (block.id === 'customer-email' && !isCustomerEmailValid(input)) return;
    body.append(block.id.toUpperCase().replace(/-/g, '_'), input.value.trim());
  });

  try {
    const response = await fetch(CHECKOUT_SET_DATA_URL, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error('Ошибка сохранения данных чекаута:', error);
  }
}

function scheduleCheckoutDataSend() {
  if (!checkoutDataTimer) checkoutBusyStart();
  clearTimeout(checkoutDataTimer);
  checkoutDataTimer = setTimeout(async () => {
    checkoutDataTimer = null;
    try {
      await sendCheckoutData();
    } finally {
      checkoutBusyEnd();
    }
  }, CHECKOUT_SET_DATA_DELAY);
}

document.addEventListener('input', (e) => {
  if (!e.target.closest('.---checkout-input--block[id] input')) return;
  scheduleCheckoutDataSend();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.---checkout-input--block[id] .__clear')) return;
  scheduleCheckoutDataSend();
});

/**
 * Checkout Delivery / Payment Save
 * Смена __checked в ---shipping-methods--results отправляет DELIVERY (data-delivery-id) на /post-endpoints/checkout/setDelivery,
 * в ---steps--payment--methods — PAYMENT (data-payment-id) на /post-endpoints/checkout/setPayment, плюс CHECKOUT_NUM
 * Клик по уже выбранному li ничего не отправляет
 * Ответ — json {items, summary_products, summary_all_discount}, как у setPoints, после него пересчитывается summary
 */
const CHECKOUT_ENDPOINT_BASE_URL = '/post-endpoints/checkout/';

async function sendCheckoutSelection(operation, key, value) {
  const checkoutNum = getCheckoutNum();
  if (!checkoutNum || !value) return;

  const body = new FormData();
  body.append('CHECKOUT_NUM', checkoutNum);
  body.append(key, value);

  checkoutBusyStart();

  try {
    const response = await fetch(CHECKOUT_ENDPOINT_BASE_URL + operation, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    updateCheckoutItemPrices(data.items);
    updateCheckoutSummaryData(data);

    const shippingPayment = data.exec_shipping_payment;
    if (shippingPayment) {
      const paymentList = document.querySelector('.---steps--payment--methods ul');
      if (paymentList) paymentList.innerHTML = shippingPayment.payment ?? '';
      checkPaymentFilled();
      updateCheckoutBlock();
    }

    if (shippingPayment && document.querySelector('.---steps--payment--methods li.__checked')) {
      updateCheckoutPayment(true);
    } else {
      updateCheckoutSummary(true);
    }
  } catch (error) {
    console.error(`Ошибка ${operation}:`, error);
  } finally {
    checkoutBusyEnd();
  }
}

/**
 * Pay By Points
 * Если data-summary-canbepayd у ---steps--delivery--items больше 0 — summary--pay-by-points получает __active и текст с доступной суммой,
 * иначе блок скрыт и баллы в summary не учитываются
 * Клик по сумме summary--pay-by-points--text--amount подставляет ее в инпут
 * Инпут принимает только цифры, через 0.5 сек после последнего изменения отправляет CHECKOUT_NUM и POINTS
 * на /post-endpoints/checkout/setPoints, на время запроса ---checkout-input--block получает __block
 * Ответ — json {points, payment}: points — примененные баллы, если отличаются от введенных — ставятся в инпут,
 * payment — новые способы оплаты в ---steps--payment--methods ul (комиссия могла измениться), после чего пересчитывается summary
 * items — строки {sha, sum, old_price}: sum ставится в ---checkout-item--price товара с таким же data-sha (кроме __price_on_request),
 * old_price, если пришел, — в ---checkout-item--old-price
 * summary_products и summary_all_discount — пишутся в data-summary-products и data-summary-all-discount у ---steps--delivery--items,
 * summary пересчитывается по ним после ответа
 * У ---checkout-input--block нет id, поэтому инпут не попадает в setCheckoutData
 */
const CHECKOUT_SET_POINTS_URL = '/post-endpoints/checkout/setPoints';
const CHECKOUT_SET_POINTS_DELAY = 500;

function getCheckoutCanBePayd() {
  const items = document.querySelector('.---steps--delivery--items');
  return items ? parseCheckoutPrice(items.dataset.summaryCanbepayd || '') : 0;
}

function getCheckoutPayByPoints() {
  const block = document.querySelector('.summary--pay-by-points');
  if (!block || !block.classList.contains('__active')) return 0;

  const input = block.querySelector('input');
  return input ? parseInt(input.value, 10) || 0 : 0;
}

function updateCheckoutItemPrices(items) {
  if (!Array.isArray(items)) return;

  items.forEach(row => {
    if (!row || row.sha === undefined || row.sha === null) return;

    const article = document.querySelector(`.---checkout-item[data-sha="${CSS.escape(String(row.sha))}"]`);
    if (!article) return;

    const oldPriceEl = article.querySelector('.---checkout-item--old-price');
    if (oldPriceEl && row.old_price !== undefined && row.old_price !== null) {
      setOrAnimate(oldPriceEl, formatCheckoutPrice(parseCheckoutPrice(row.old_price)), true);
    }

    const priceEl = article.querySelector('.---checkout-item--price');
    if (!priceEl || priceEl.classList.contains('__price_on_request')) return;

    setOrAnimate(priceEl, formatCheckoutPrice(parseCheckoutPrice(row.sum)), true);
  });
}

function updateCheckoutSummaryData(data) {
  const items = document.querySelector('.---steps--delivery--items');
  if (!items) return;

  if (data.summary_products !== undefined && data.summary_products !== null) {
    items.dataset.summaryProducts = String(data.summary_products);
  }

  if (data.summary_all_discount !== undefined && data.summary_all_discount !== null) {
    items.dataset.summaryAllDiscount = String(data.summary_all_discount);
  }
}

async function sendCheckoutPoints(input) {
  const checkoutNum = getCheckoutNum();
  if (!checkoutNum) return;

  const inputBlock = input.closest('.---checkout-input--block');
  const points = parseInt(input.value, 10) || 0;

  const body = new FormData();
  body.append('CHECKOUT_NUM', checkoutNum);
  body.append('POINTS', points);

  inputBlock.classList.add('__block');
  input.readOnly = true;

  try {
    const response = await fetch(CHECKOUT_SET_POINTS_URL, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    const applied = parseInt(data.points, 10) || 0;
    if (applied !== points) {
      input.value = applied > 0 ? String(applied) : '';
      inputBlock.querySelector('.__clear')?.classList.toggle('__active', input.value.length > 0);
    }

    const paymentList = document.querySelector('.---steps--payment--methods ul');
    if (paymentList && typeof data.payment === 'string') {
      paymentList.innerHTML = data.payment;
      checkPaymentFilled();
    }

    updateCheckoutItemPrices(data.items);
    updateCheckoutSummaryData(data);
  } catch (error) {
    console.error('Ошибка setPoints:', error);
  } finally {
    inputBlock.classList.remove('__block');
    input.readOnly = false;
  }

  if (document.querySelector('.---steps--payment--methods li.__checked')) {
    updateCheckoutPayment(true);
  } else {
    updateCheckoutSummary(true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const block = document.querySelector('.summary--pay-by-points');
  if (!block || isShortCheckout()) return;

  if (isBlockedCheckout()) {
    const paidInput = block.querySelector('input');
    const paidText = block.querySelector('.summary--pay-by-points--text');
    block.classList.toggle('__active', !!paidInput && (parseInt(paidInput.value, 10) || 0) > 0);
    if (paidText) paidText.textContent = 'Оплачено баллами:';
    return;
  }

  const canBePayd = getCheckoutCanBePayd();
  block.classList.toggle('__active', canBePayd > 0);
  if (canBePayd <= 0) return;

  const text = block.querySelector('.summary--pay-by-points--text');
  const input = block.querySelector('input');

  if (text) {
    const amount = document.createElement('div');
    amount.className = 'summary--pay-by-points--text--amount';
    amount.textContent = `${formatCheckoutPrice(canBePayd)} ₽`;

    text.textContent = 'Вы можете оплатить до ';
    text.append(amount, ' баллами вашего бонусного счета:');

    if (input) {
      amount.addEventListener('click', () => {
        if (input.readOnly) return;
        input.value = String(Math.floor(canBePayd));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }

  if (!input) return;

  const clearBtn = block.querySelector('.__clear');
  let pointsTimer = null;

  function schedulePointsSend() {
    if (!pointsTimer) checkoutBusyStart();
    clearTimeout(pointsTimer);
    pointsTimer = setTimeout(async () => {
      pointsTimer = null;
      try {
        await sendCheckoutPoints(input);
      } finally {
        checkoutBusyEnd();
      }
    }, CHECKOUT_SET_POINTS_DELAY);
  }

  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    if (digits !== input.value) input.value = digits;
    if (clearBtn) clearBtn.classList.toggle('__active', digits.length > 0);
    schedulePointsSend();
  });

  if (clearBtn) clearBtn.addEventListener('click', schedulePointsSend);
});

/**
 * Customer Addresses
 * Клик по сохранённому адресу ---customer-address заполняет поля адреса доставки
 */
function setCheckoutInputValue(blockId, value) {
  const input = document.querySelector(`#${blockId} input`);
  if (!input || input.readOnly) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Address More Visibility
 * ---steps--delivery--address--more получает __hidden, если в ---steps--delivery--address--customer-addresses ul нет li
 */
function updateAddressMoreVisibility() {
  const more = document.querySelector('.---steps--delivery--address--more');
  if (!more) return;

  const hasAddresses = !!document.querySelector('.---steps--delivery--address--customer-addresses ul li');
  more.classList.toggle('__hidden', !hasAddresses);
}

document.addEventListener('DOMContentLoaded', () => {
  const addressBlock = document.querySelector('.---steps--delivery--address');
  const moreLink = document.querySelector('.---steps--delivery--address--more a');
  const addressList = document.querySelector('.---steps--delivery--address--customer-addresses');

  updateAddressMoreVisibility();

  if (addressBlock && moreLink) {
    moreLink.addEventListener('click', (e) => {
      e.preventDefault();
      addressBlock.classList.remove('__filled');
      if (addressList) addressList.classList.add('__expanded');
    });
  }

  const streetInput = document.querySelector('#street-and-building input');
  if (addressBlock && streetInput) {
    const markStreetFilled = () => {
      if (streetInput.value.trim().length > 0) addressBlock.classList.add('__filled');
    };

    streetInput.addEventListener('input', markStreetFilled);
    markStreetFilled();
  }

  if (!addressList) return;

  addressList.addEventListener('click', (e) => {
    const address = e.target.closest('.---customer-address');
    if (!address || !addressList.contains(address)) return;

    if (addressBlock) addressBlock.classList.add('__filled');
    addressList.classList.remove('__expanded');

    const street = address.querySelector('.---customer-address--street');
    const comment = address.querySelector('.---customer-address--comment');
    const moreValue = (marker) => address.querySelector(`.---customer-address--more.${marker}`)?.dataset.value || '';

    setCheckoutInputValue('street-and-building', street ? street.textContent.trim() : '');
    setCheckoutInputValue('unit', moreValue('__apartment_office'));
    setCheckoutInputValue('entrance', moreValue('__entrance'));
    setCheckoutInputValue('intercom', moreValue('__intercom'));
    setCheckoutInputValue('floor', moreValue('__floor'));
    setCheckoutInputValue('comment', comment ? comment.textContent.trim() : '');
  });
});

/**
 * Delivery Method Blocks
 * Читает data-delivery-date, data-delivery-time, data-delivery-pickup-point
 * у __checked способа доставки и ставит __active на соответствующие блоки
 */
function updateDeliveryBlocks() {
  const checked = document.querySelector('.---shipping-methods--results li.__checked');
  if (!checked) return;

  const map = {
    'deliveryAddress': '.---steps--delivery--address',
    'deliveryDate': '.---steps--delivery--date',
    'deliveryTime': '.---steps--delivery--date--time',
    'deliveryPickupPoint': '.---steps--delivery--pickup-point'
  };

  for (const [key, selector] of Object.entries(map)) {
    const block = document.querySelector(selector);
    if (block) {
      block.classList.toggle('__active', checked.dataset[key] === 'true');
    }
  }

  const pickupBlock = document.querySelector('.---steps--delivery--pickup-point');
  if (pickupBlock && pickupBlock.classList.contains('__active')) {
    const btn = pickupBlock.querySelector('.---steps--delivery--pickup-point--select-point');
    if (btn) {
      btn.textContent = pickupBlock.dataset.pickupPointId !== ''
        ? 'Изменить пункт выдачи'
        : 'Выбрать пункт выдачи';
    }
  }
}

/**
 * Checkout Item Flash
 * Перезапускает на li анимацию __flash (вспышка фона var(--li-background-hover), растворяется за 0.3s)
 * Используется для ---shipping-methods--results и ---steps--payment--methods, класс снимается по animationend
 */
function flashCheckoutItem(li) {
  li.classList.remove('__flash');
  void li.offsetWidth;
  li.classList.add('__flash');
  li.addEventListener('animationend', () => li.classList.remove('__flash'), { once: true });
}

document.addEventListener('DOMContentLoaded', () => {
  updateDeliveryBlocks();
  updateCheckoutPayment(false);

  const results = document.querySelector('.---shipping-methods--results');
  const moreLink = document.querySelector('.---shipping-methods--more');

  /**
   * Shipping Methods Expand
   * Клик по ---shipping-methods--more a раскрывает список способов доставки
   */
  if (moreLink && results) {
    moreLink.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      results.classList.remove('__collapsed');
      results.classList.add('__expanded');
      moreLink.classList.add('__hided');
    });
  }

  /**
   * Shipping Methods Select
   * Клик по li выбирает способ доставки, сворачивает список обратно и моргает фоном выбранного li
   */
  if (results) {
    results.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li || !results.contains(li)) return;

      const changed = !li.classList.contains('__checked');

      results.querySelectorAll('li').forEach(item => item.classList.remove('__checked'));
      li.classList.add('__checked');

      if (changed) sendCheckoutSelection('setDelivery', 'DELIVERY', li.dataset.deliveryId);

      results.classList.remove('__expanded');
      results.classList.add('__collapsed');
      flashCheckoutItem(li);
      if (moreLink) {
        moreLink.classList.remove('__hided');
      }

      updateDeliveryBlocks();
      checkDeliveryFilled();
      updateCheckoutBlock();
      updateCheckoutPayment(true);
    });
  }

  loadDeliveryMethods(results, moreLink);

  /**
   * Delivery Date Day Select
   * Переключение __checked на li в ---steps--delivery--date--day
   */
  document.querySelectorAll('.---steps--delivery--date--day li').forEach(li => {
    li.addEventListener('click', () => {
      document.querySelectorAll('.---steps--delivery--date--day li').forEach(item => item.classList.remove('__checked'));
      li.classList.add('__checked');
    });
  });

  /**
   * Delivery Date Time Select
   * Переключение __checked на li в ---steps--delivery--date--time
   */
  document.querySelectorAll('.---steps--delivery--date--time li').forEach(li => {
    li.addEventListener('click', () => {
      document.querySelectorAll('.---steps--delivery--date--time li').forEach(item => item.classList.remove('__checked'));
      li.classList.add('__checked');
    });
  });

  /**
   * Payment Method Select
   * Переключение __checked на li в ---steps--payment--methods с вспышкой фона
   * Обновление summary: название, кнопка, комиссия
   */
  const paymentList = document.querySelector('.---steps--payment--methods ul');
  if (paymentList) {
    paymentList.addEventListener('click', (e) => {
      if (isBlockedCheckout()) return;

      const li = e.target.closest('li');
      if (!li || !paymentList.contains(li)) return;

      const changed = !li.classList.contains('__checked');

      paymentList.querySelectorAll('li').forEach(item => item.classList.remove('__checked'));
      li.classList.add('__checked');
      flashCheckoutItem(li);
      updateCheckoutPayment(true);

      if (changed) sendCheckoutSelection('setPayment', 'PAYMENT', li.dataset.paymentId);
    });
  }

  checkPaymentFilled();

  /**
   * Summary Terms Toggle
   * Переключение __checked на li в summary--terms по клику
   */
  document.querySelectorAll('.summary--terms li').forEach(li => {
    li.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      li.classList.toggle('__checked');
      updateCheckoutBlock();
    });
  });

  updateCheckoutBlock();
});

/**
 * Async Delivery Methods
 * Если у ---shipping-methods--results есть __have_to_get_methods — способы доставки
 * запрашиваются с /post-endpoints/checkout/getDeliveryMethods (CHECKOUT_NUM — номер из url после checkout/)
 * На время запроса ---shipping-methods--more получает __loading и текст "Загружаем способы доставки"
 * Ответ — json {shipping, payment}: shipping вставляется в ---shipping-methods--results ul,
 * payment — в ---steps--payment--methods ul, __have_to_get_methods снимается
 */
const CHECKOUT_DELIVERY_METHODS_URL = '/post-endpoints/checkout/getDeliveryMethods';

function getCheckoutNum() {
  const match = window.location.pathname.match(/\/checkout\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function loadDeliveryMethods(results, moreLink) {
  if (isShortCheckout()) return;
  if (!results || !results.classList.contains('__have_to_get_methods')) return;

  const list = results.querySelector('ul');
  const checkoutNum = getCheckoutNum();
  if (!list || !checkoutNum) return;

  const moreText = moreLink ? moreLink.querySelector('a') : null;
  const initialText = moreText ? moreText.textContent : '';

  if (moreLink) moreLink.classList.add('__loading');
  if (moreText) moreText.textContent = 'Загружаем способы доставки';

  checkoutBusyStart();

  try {
    const body = new FormData();
    body.append('CHECKOUT_NUM', checkoutNum);

    const response = await fetch(CHECKOUT_DELIVERY_METHODS_URL, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    list.innerHTML = data.shipping ?? '';
    results.classList.remove('__have_to_get_methods');

    const paymentList = document.querySelector('.---steps--payment--methods ul');
    if (paymentList) paymentList.innerHTML = data.payment ?? '';
    checkPaymentFilled();

    updateDeliveryBlocks();
    checkDeliveryFilled();
    updateCheckoutBlock();
    updateCheckoutPayment(false);
  } catch (error) {
    console.error('Ошибка загрузки способов доставки:', error);
  } finally {
    if (moreLink) moreLink.classList.remove('__loading');
    if (moreText) moreText.textContent = initialText;
    checkoutBusyEnd();
  }
}

/**
 * Checkout City Change
 * При смене города в чекауте отправляет CHECKOUT_NUM и CITY (fias-id из data-city-id) на /post-endpoints/checkout/setCity
 * Ответ — json {city, customer_addresses}: city — id примененного города, должен совпасть с отправленным, функция возвращает true/false
 * Если совпал — li из ---shipping-methods--results ul и ---steps--payment--methods ul удаляются,
 * customer_addresses записывается в ---steps--delivery--address--customer-addresses ul, блок получает __expanded, если customer_addresses непустой,
 * ---shipping-methods--results получает __have_to_get_methods и через 0.5 сек запускается loadDeliveryMethods
 */
const CHECKOUT_SET_CITY_URL = '/post-endpoints/checkout/setCity';

async function setCheckoutCity(cityId) {
  const checkoutNum = getCheckoutNum();
  if (!checkoutNum || !cityId) return false;

  let data;

  checkoutBusyStart();

  try {
    const body = new FormData();
    body.append('CHECKOUT_NUM', checkoutNum);
    body.append('CITY', cityId);

    const response = await fetch(CHECKOUT_SET_CITY_URL, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    data = await response.json();
    if (String(data.city) !== String(cityId)) throw new Error(`Применен другой город: ${data.city}`);
  } catch (error) {
    console.error('Ошибка смены города:', error);
    return false;
  } finally {
    checkoutBusyEnd();
  }

  const addressList = document.querySelector('.---steps--delivery--address--customer-addresses');
  const addressListUl = addressList ? addressList.querySelector('ul') : null;
  if (addressListUl) {
    const customerAddresses = String(data.customer_addresses ?? '').trim();
    addressListUl.innerHTML = customerAddresses;
    addressList.classList.toggle('__expanded', customerAddresses !== '');
    if (customerAddresses !== '') document.querySelector('.---steps--delivery--address')?.classList.remove('__filled');
  }
  updateAddressMoreVisibility();

  const results = document.querySelector('.---shipping-methods--results');
  const moreLink = document.querySelector('.---shipping-methods--more');
  if (!results) return true;

  results.querySelectorAll('ul li').forEach(li => li.remove());
  document.querySelectorAll('.---steps--payment--methods ul li').forEach(li => li.remove());
  results.classList.add('__have_to_get_methods');

  checkPaymentFilled();
  checkDeliveryFilled();
  updateCheckoutBlock();

  setTimeout(() => loadDeliveryMethods(results, moreLink), 500);

  return true;
}

/**
 * Ссылка на товар из позиции заказа
 * К href добавляется SKU= из data-item-id позиции и OPTIONS= — список data-option-values
 * у ---checkout-item--info--option--title через запятую, если он не пуст
 * href и target меняются до перехода, ссылка открывается в новой вкладке
 */
document.addEventListener('click', (e) => {
  const link = e.target.closest('.---checkout-item--image-info--block a');
  if (!link) return;

  const item = link.closest('.---checkout-item');
  if (!item || !item.dataset.itemId) return;

  const url = new URL(link.getAttribute('href'), window.location.origin);
  url.searchParams.set('SKU', item.dataset.itemId);

  const options = Array.from(item.querySelectorAll('.---checkout-item--info--option--title[data-option-values]'))
    .map(title => title.dataset.optionValues.trim())
    .filter(value => value !== '');

  if (options.length > 0) {
    url.searchParams.set('OPTIONS', options.join(','));
  } else {
    url.searchParams.delete('OPTIONS');
  }

  link.setAttribute('href', url.pathname + url.search + url.hash);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener');
});

/**
 * Summary Calculation
 * Читает data-summary-* из ---steps--delivery--items, цену доставки из __checked,
 * проставляет __active и значения в summary--cart-rows, считает итого
 * Если data-delivery-inside / data-fee-inside у ---steps--delivery--items равен true — ненулевые доставка / комиссия
 * не суммируются, в summary--row--value пишется текст и ставится __text
 */
const CHECKOUT_INSIDE_TEXT = 'включена в стоимость';

function formatCheckoutPrice(value) {
  const [integer, fraction] = (Math.round(value * 100) / 100).toFixed(2).split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + fraction;
}

function parseCheckoutPrice(str) {
  return parseFloat(String(str).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}

function updateCheckoutSummary(animate) {
  if (isShortCheckout()) return;

  const items = document.querySelector('.---steps--delivery--items');
  if (!items) return;

  const dataKeys = ['summary-products', 'summary-all-discount'];
  const discountKeys = ['summary-all-discount'];

  dataKeys.forEach(key => {
    const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = parseCheckoutPrice(items.dataset[camelKey] || '');
    const li = document.getElementById(key);
    if (!li) return;

    const valueEl = li.querySelector('.summary--row--value');
    if (value > 0) {
      li.classList.add('__active');
      const prefix = discountKeys.includes(key) ? '−' : '';
      if (valueEl) setOrAnimate(valueEl, prefix + formatCheckoutPrice(value), animate);
    } else {
      li.classList.remove('__active');
      if (valueEl) valueEl.textContent = '';
    }
  });

  const deliveryInside = items.dataset.deliveryInside === 'true';
  const feeInside = items.dataset.feeInside === 'true';

  const checkedMethod = document.querySelector('.---shipping-methods--results li.__checked');
  const deliveryLi = document.getElementById('summary-delivery');
  let deliveryPrice = 0;

  if (checkedMethod) {
    const nameEl = checkedMethod.querySelector('.---shipping-methods--results--name');
    const selectedSpan = document.querySelector('.summary--selected--delivery span');
    if (nameEl && selectedSpan) selectedSpan.textContent = nameEl.textContent;
  }

  if (checkedMethod && deliveryLi) {
    const priceEl = checkedMethod.querySelector('.---shipping-methods--results--price');
    deliveryPrice = priceEl ? parseCheckoutPrice(priceEl.textContent) : 0;
    const valueEl = deliveryLi.querySelector('.summary--row--value');

    if (deliveryPrice > 0) {
      deliveryLi.classList.add('__active');
      if (valueEl) {
        valueEl.classList.toggle('__text', deliveryInside);
        setOrAnimate(valueEl, deliveryInside ? CHECKOUT_INSIDE_TEXT : formatCheckoutPrice(deliveryPrice), animate);
      }
      if (deliveryInside) deliveryPrice = 0;
    } else {
      deliveryLi.classList.remove('__active');
      if (valueEl) {
        valueEl.classList.remove('__text');
        valueEl.textContent = '';
      }
    }
  }

  const products = parseCheckoutPrice(items.dataset.summaryProducts || '');
  const allDiscount = Math.max(0, parseCheckoutPrice(items.dataset.summaryAllDiscount || ''));
  const subtotal = products - allDiscount + deliveryPrice;

  const checkedPayment = document.querySelector('.---steps--payment--methods li.__checked');
  let paymentFee = checkedPayment ? parseCheckoutPrice(checkedPayment.dataset.transactionCost || '') : 0;

  const paymentFeeLi = document.getElementById('summary-payment-fee');

  if (paymentFee > 0 && paymentFeeLi) {
    paymentFeeLi.classList.add('__active');
    const feeValueEl = paymentFeeLi.querySelector('.summary--row--value');
    if (feeValueEl) {
      feeValueEl.classList.toggle('__text', feeInside);
      setOrAnimate(feeValueEl, feeInside ? CHECKOUT_INSIDE_TEXT : formatCheckoutPrice(paymentFee), animate);
    }
  } else if (paymentFeeLi) {
    paymentFeeLi.classList.remove('__active');
    const feeValueEl = paymentFeeLi.querySelector('.summary--row--value');
    if (feeValueEl) {
      feeValueEl.classList.remove('__text');
      feeValueEl.textContent = '';
    }
  }

  if (feeInside) paymentFee = 0;

  const payByPoints = getCheckoutPayByPoints();
  const payByPointsLi = document.getElementById('summary-pay-by-points');

  if (payByPointsLi) {
    const pointsValueEl = payByPointsLi.querySelector('.summary--row--value');
    if (payByPoints > 0) {
      payByPointsLi.classList.add('__active');
      if (pointsValueEl) setOrAnimate(pointsValueEl, '−' + formatCheckoutPrice(payByPoints), animate);
    } else {
      payByPointsLi.classList.remove('__active');
      if (pointsValueEl) pointsValueEl.textContent = '';
    }
  }

  const total = subtotal + paymentFee - payByPoints;
  const totalEl = document.querySelector('.summary--total--value');
  if (totalEl) setOrAnimate(totalEl, formatCheckoutPrice(total), animate);

  const totalBlock = document.querySelector('.summary--total');
  if (totalBlock) totalBlock.classList.toggle('__hidden', !(total > 0));

  const summaryPoints = parseCheckoutPrice(items.dataset.summaryPoints || '');
  const totalPointsEl = document.querySelector('.summary--points');
  if (totalPointsEl) {
    if (summaryPoints > 0) {
      totalPointsEl.classList.remove('__hidden');
      setOrAnimate(totalPointsEl, String(summaryPoints), animate);
    } else {
      totalPointsEl.classList.add('__hidden');
    }
  }
}

/**
 * Payment Method Update
 * Обновляет название оплаты в summary, текст и картинку кнопки, пересчитывает summary
 */
function updateCheckoutPayment(animate) {
  const checkedPayment = document.querySelector('.---steps--payment--methods li.__checked');
  if (!checkedPayment) return;

  const nameEl = checkedPayment.querySelector('.---payment--method--name');
  const selectedSpan = document.querySelector('.summary--selected--payment span');
  if (nameEl && selectedSpan) selectedSpan.textContent = nameEl.textContent;

  const btn = document.querySelector('.summary--checkout');
  const onRequest = !!document.querySelector('.---steps--delivery--items--block article[data-on-request="true"]');
  if (btn && !onRequest && !isShortCheckout()) {
    const checkedDelivery = document.querySelector('.---shipping-methods--results li.__checked');
    const managerVerification = checkedDelivery && checkedDelivery.dataset.managerVerification === 'true';
    const buttonText = managerVerification
      ? checkedDelivery.dataset.verificationButtonText || ''
      : checkedPayment.dataset.buttonText || '';
    const imageBlock = checkedPayment.querySelector('.---payment--method--image img');

    if (imageBlock) {
      const img = imageBlock.cloneNode(true);
      btn.textContent = buttonText;
      btn.appendChild(img);
    } else {
      btn.textContent = buttonText;
    }
  }

  updateCheckoutSummary(animate);
}

/**
 * Delivery Filled Check
 * Ставит __filled на ---steps--delivery:
 * — data-delivery-address="true": все __required в адресе заполнены
 * — data-delivery-pickup-point="true": data-pickup-point-id непустой
 */
function checkDeliveryFilled() {
  if (isBlockedCheckout()) return;

  const delivery = document.querySelector('.---steps--delivery');
  if (!delivery) return;

  if (isShortCheckout()) {
    delivery.classList.add('__filled');
    return;
  }

  const checked = document.querySelector('.---shipping-methods--results li.__checked');
  const needAddress = checked && checked.dataset.deliveryAddress === 'true';
  const needPickup = checked && checked.dataset.deliveryPickupPoint === 'true';

  const results = document.querySelector('.---shipping-methods--results');
  let filled = !(results && results.classList.contains('__have_to_get_methods'));

  if (needAddress) {
    const address = document.querySelector('.---steps--delivery--address');
    const required = address ? address.querySelectorAll('.---checkout-input--block.__required input') : [];
    filled = filled && Array.from(required).every(input => input.value.trim().length > 0);
  }

  if (needPickup) {
    const pickupBlock = document.querySelector('.---steps--delivery--pickup-point');
    filled = filled && pickupBlock && pickupBlock.dataset.pickupPointId !== '';
  }

  delivery.classList.toggle('__filled', filled);
}

/**
 * Payment Filled Check
 * Ставит __filled на ---steps--payment, если в ---steps--payment--methods ul есть способы оплаты
 */
function checkPaymentFilled() {
  if (isBlockedCheckout()) return;

  const payment = document.querySelector('.---steps--payment');
  if (!payment) return;

  const list = payment.querySelector('.---steps--payment--methods ul');
  payment.classList.toggle('__filled', !!list && list.children.length > 0);
}

/**
 * Customer Filled Check
 * Ставит __filled на ---steps--customer в зависимости от активного селектора:
 * — data-customer="user": все __required в ---steps--customer--user
 * — data-customer="company": все __required в ---steps--customer--user и ---steps--customer--company
 * и email в #customer-email проходит isCustomerEmailValid
 */
function checkCustomerFilled() {
  if (isBlockedCheckout()) return;

  const customer = document.querySelector('.---steps--customer');
  if (!customer) return;

  const activeBtn = customer.querySelector('.---steps--customer--selector--button.__active');
  if (!activeBtn) return;

  const type = activeBtn.dataset.customer;
  const userBlock = customer.querySelector('.---steps--customer--user');
  let containers = [userBlock];

  if (type === 'company') {
    const companyBlock = customer.querySelector('.---steps--customer--company');
    if (companyBlock) containers.push(companyBlock);
  }

  const allFilled = containers.every(container => {
    if (!container) return true;
    const required = container.querySelectorAll('.---checkout-input--block.__required input');
    return Array.from(required).every(input => input.value.trim().length > 0);
  });

  const emailInput = customer.querySelector('#customer-email input');
  const emailValid = !emailInput || isCustomerEmailValid(emailInput);

  customer.classList.toggle('__filled', allFilled && emailValid);
}

/**
 * Checkout Block Check
 * Управляет __blocked на summary--checkout и сообщением в summary--info
 * Блокировка снимается когда delivery и customer __filled и все terms __checked
 */
function updateCheckoutBlock() {
  if (isBlockedCheckout()) return;

  const btn = document.querySelector('.summary--checkout');
  const info = document.querySelector('.summary--info');
  if (!btn) return;

  const deliveryFilled = document.querySelector('.---steps--delivery')?.classList.contains('__filled');
  const customerFilled = document.querySelector('.---steps--customer')?.classList.contains('__filled');
  const requiredTerms = document.querySelectorAll('.summary--terms li.__required');
  const termsChecked = requiredTerms.length === 0 || Array.from(requiredTerms).every(li => li.classList.contains('__checked'));

  const blocked = !deliveryFilled || !customerFilled || !termsChecked;
  btn.classList.toggle('__blocked', blocked);

  if (info) {
    const icon = info.querySelector('i');
    const existingText = info.querySelector('div');
    if (existingText) existingText.remove();

    info.classList.toggle('__active', blocked);
    if (!blocked) {
    } else {
      const div = document.createElement('div');
      if (!deliveryFilled) {
        div.innerHTML = '<b>Заполните параметры доставки:</b> заполните поля Адреса отмеченные <i class="fa-solid fa-asterisk"></i> или выберите Пункт выдачи, если ваш тип доставки предполагает доставку до него';
      } else if (!customerFilled) {
        div.innerHTML = '<b>Заполните данные покупателя:</b> заполните поля отмеченные <i class="fa-solid fa-asterisk"></i> в разделе Покупатель';
      } else if (!termsChecked) {
        div.innerHTML = '<b>Поставьте галочки:</b> на согласия отмеченные <i class="fa-solid fa-asterisk"></i> в блоке ниже';
      }
      info.appendChild(div);
    }
  }
}

/**
 * Checkout Timer
 * data-time-valid у .checkout — сколько минут осталось до окончания чекаута (запас уже вычтен на сервере)
 * При загрузке по часам компьютера считается момент окончания checkoutDeadline, остаток каждый раз считается от него,
 * поэтому замедление таймеров в фоновой вкладке и сон компьютера на точность не влияют
 * Если осталось меньше 15 минут — с summary--timer снимается __hidden, в summary--timer--value пишется м:сс
 * По истечении страница перезагружается — сервер отдаст 404
 * Если время вышло уже к загрузке — перезагрузки нет, чтобы не зациклиться
 */
const CHECKOUT_TIMER_SHOW_FROM = 15 * 60 * 1000;
const CHECKOUT_TIMER_TICK = 1000;

let checkoutDeadline = null;
let checkoutTimerInterval = null;

function formatCheckoutTimer(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateCheckoutTimer() {
  if (checkoutDeadline === null) return;

  const timer = document.querySelector('.summary--timer');
  const value = document.querySelector('.summary--timer--value');
  const remaining = Math.max(0, checkoutDeadline - Date.now());

  if (timer && value) {
    timer.classList.toggle('__hidden', remaining >= CHECKOUT_TIMER_SHOW_FROM);
    value.textContent = formatCheckoutTimer(remaining);
  }

  if (remaining > 0) return;

  clearInterval(checkoutTimerInterval);
  checkoutTimerInterval = null;
  checkoutDeadline = null;
  window.location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  const checkout = document.querySelector('.checkout');
  if (!checkout) return;

  const minutesLeft = parseFloat(checkout.dataset.timeValid);
  if (Number.isNaN(minutesLeft)) return;

  if (minutesLeft <= 0) {
    const timer = document.querySelector('.summary--timer');
    const value = document.querySelector('.summary--timer--value');
    if (timer && value) {
      timer.classList.remove('__hidden');
      value.textContent = formatCheckoutTimer(0);
    }
    return;
  }

  checkoutDeadline = Date.now() + minutesLeft * 60 * 1000;

  updateCheckoutTimer();
  checkoutTimerInterval = setInterval(updateCheckoutTimer, CHECKOUT_TIMER_TICK);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateCheckoutTimer();
  });
});

/**
 * Checkout Push To Order
 * Клик по summary--checkout без __blocked, __loading и __error отправляет CHECKOUT_NUM на /post-endpoints/checkout/pushToOrder
 * Ответ — json {order, sha}: order из 8 букв-цифр (например 6b4c7ace) — успех, sha — список sha оформленных позиций,
 * они удаляются из LS.cart, примененный промокод удаляется из sessionStorage.cart_promo (CART_PROMO_STORAGE_KEY из cart.js),
 * после чего переход на /order/CHECKOUT_NUM, кнопка остается заблокированной до перехода
 * Любой другой ответ — ошибка, ее текст (error или весь ответ) показывается на кнопке 5 сек
 */
const CHECKOUT_PUSH_TO_ORDER_URL = '/post-endpoints/checkout/pushToOrder';
const CHECKOUT_ORDER_PAGE_URL = '/order/';
const CHECKOUT_ORDER_ANSWER_PATTERN = /^[a-z0-9]{8}$/i;
const CHECKOUT_BUTTON_ERROR_DURATION = 5000;
const CHECKOUT_DELETE_FROM_CART_LIST_URL = '/auth-endpoints/user/deleteFromCartList';

function parseCheckoutOrderAnswer(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return { error: typeof parsed === 'string' ? parsed : text };
  } catch (e) {
    return { error: text };
  }
}

/**
 * Удаляет из корзины позиции, чьи sha пришли от pushToOrder
 * Роль (whoami) запрашивается один раз
 * Гость — строки убираются из LS одной записью через writeLocalCart из cart.js
 * Авторизованный — один вызов deleteFromCartList со списком sha в SHA_LIST, ответ пишется в LS
 */
async function removeOrderedFromLocalCart(shaList) {
  if (!Array.isArray(shaList) || shaList.length === 0) return;

  const ordered = shaList.map(String);

  try {
    const roles = await getCartRoles();

    if (isCartGuest(roles)) {
      await writeLocalCart(readLocalCart().filter(row => !ordered.includes(String(row.sha))), true);
      return;
    }

    const cartJson = await requestDeleteFromCartList(ordered);
    localStorage.setItem(ADD_TO_CART_CONFIG.storageKey, cartJson);
    updateCartBadge(parseLocalCart(cartJson));
  } catch (error) {
    console.error('Ошибка удаления оформленных позиций из корзины:', error);
  }
}

/**
 * Удаление списка позиций из корзины авторизованного пользователя на сервере
 * SHA_LIST — json-строка массива sha, ответ — json-строка нового списка позиций
 */
async function requestDeleteFromCartList(shaList) {
  const params = new URLSearchParams();
  params.set('SHA_LIST', JSON.stringify(shaList));

  const response = await fetch(CHECKOUT_DELETE_FROM_CART_LIST_URL, {
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

function showCheckoutButtonError(btn, text) {
  const originalNodes = Array.from(btn.childNodes);

  btn.classList.add('__error');
  btn.textContent = text;

  setTimeout(() => {
    btn.classList.remove('__error');
    btn.replaceChildren(...originalNodes);
  }, CHECKOUT_BUTTON_ERROR_DURATION);
}

async function pushCheckoutToOrder(btn) {
  const checkoutNum = getCheckoutNum();
  if (!checkoutNum) return;

  const body = new FormData();
  body.append('CHECKOUT_NUM', checkoutNum);

  checkoutBusyStart();

  let answer = {};

  try {
    const response = await fetch(CHECKOUT_PUSH_TO_ORDER_URL, { method: 'POST', body });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    answer = parseCheckoutOrderAnswer((await response.text()).trim());
  } catch (error) {
    console.error('Ошибка pushToOrder:', error);
  }

  const order = String(answer.order ?? '').trim();

  if (CHECKOUT_ORDER_ANSWER_PATTERN.test(order)) {
    await removeOrderedFromLocalCart(answer.sha);
    sessionStorage.removeItem(CART_PROMO_STORAGE_KEY);
    window.location.href = CHECKOUT_ORDER_PAGE_URL + encodeURIComponent(checkoutNum);
    return;
  }

  checkoutBusyEnd();
  showCheckoutButtonError(btn, String(answer.error ?? '').trim() || 'Ошибка оформления заказа');
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.summary--checkout');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();

    updateCheckoutBlock();
    if (btn.classList.contains('__blocked') || btn.classList.contains('__loading') || btn.classList.contains('__error')) return;

    pushCheckoutToOrder(btn);
  });
});

/**
 * Checkout BFCache Reload
 * Страница /checkout/[номер], восстановленная из bfcache (например, «Назад» с платежной системы), перезагружается,
 * чтобы состояние чекаута пришло с сервера, а не из сохраненного DOM
 */
window.addEventListener('pageshow', (e) => {
  if (e.persisted && getCheckoutNum()) window.location.reload();
});

/**
 * Agreement Popup / Panel
 * Открытие соглашений из summary--terms по клику на ссылку
 * >= 600px — popup.__agreement
 * < 600px — mobile-panel.__right-panel.__agreement
 */
(function() {
  let agreementPopup = null;
  let agreementPanel = null;
  let agreementPanelClickHandler = null;
  let agreementKeyHandler = null;
  let currentAgreementLi = null;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.summary--terms li a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();

        const li = link.closest('li');
        if (!li) return;

        currentAgreementLi = li;

        fetch('tmp-docs/agreement.html')
          .then(res => res.text())
          .then(html => {
            if (window.innerWidth < 600) {
              openAgreementPanel(html);
            } else {
              openAgreementPopup(html);
            }
          });
      });
    });
  });

  function acceptAgreement() {
    if (currentAgreementLi) {
      currentAgreementLi.classList.add('__checked');
      currentAgreementLi = null;
      updateCheckoutBlock();
    }
  }

  /**
   * Открытие popup соглашения (>= 600px)
   */
  function openAgreementPopup(html) {
    if (agreementPopup) {
      agreementPopup.remove();
    }

    agreementPopup = document.createElement('div');
    agreementPopup.className = 'popup __agreement';

    agreementPopup.innerHTML = `
      <button class="popup--close" aria-label="Закрыть"></button>
      <div class="popup--images--block">
        <div class="popup--agreement--content">${html}</div>
      </div>
      <button class="popup--agreement--accept main-button" aria-label="Согласен">Согласен</button>
    `;

    document.body.appendChild(agreementPopup);
    document.body.style.overflow = 'hidden';

    const closeBtn = agreementPopup.querySelector('.popup--close');
    const acceptBtn = agreementPopup.querySelector('.popup--agreement--accept');

    closeBtn.addEventListener('click', () => closeAgreementPopup());
    acceptBtn.addEventListener('click', () => {
      acceptAgreement();
      closeAgreementPopup();
    });

    agreementKeyHandler = (e) => {
      if (e.key === 'Escape') closeAgreementPopup();
    };
    document.addEventListener('keydown', agreementKeyHandler);

    agreementPopup.addEventListener('click', (e) => {
      if (e.target === agreementPopup) closeAgreementPopup();
    });

    agreementPopup.classList.add('__visible');
  }

  /**
   * Закрытие popup соглашения
   */
  function closeAgreementPopup() {
    if (!agreementPopup) return;

    document.removeEventListener('keydown', agreementKeyHandler);
    agreementPopup.classList.remove('__visible');

    setTimeout(() => {
      if (agreementPopup) {
        agreementPopup.remove();
        agreementPopup = null;
      }
      document.body.style.overflow = '';
    }, 300);
  }

  /**
   * Открытие панели соглашения (< 600px)
   */
  function openAgreementPanel(html) {
    if (agreementPanel) {
      closeAgreementPanel();
      return;
    }

    window.lockScroll();

    const panel = document.createElement('section');
    panel.className = 'mobile-panel __scrollable __right-panel __agreement';

    const header = document.createElement('div');
    header.className = 'mobile-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = 'Соглашение';
    titleButton.setAttribute('aria-label', 'Закрыть: Соглашение');

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.textContent = '';

    header.appendChild(titleButton);
    header.appendChild(closeButton);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-panel--content __agreement __scrollable';
    contentWrapper.innerHTML = html;

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'mobile-panel--agreement--accept main-button';
    acceptBtn.setAttribute('type', 'button');
    acceptBtn.textContent = 'Согласен';
    acceptBtn.setAttribute('aria-label', 'Согласен');

    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    panel.appendChild(acceptBtn);

    document.body.appendChild(panel);
    agreementPanel = panel;

    window.closeMobileAgreementPanel = () => closeAgreementPanel();

    titleButton.addEventListener('click', () => closeAgreementPanel());
    closeButton.addEventListener('click', () => closeAgreementPanel());
    acceptBtn.addEventListener('click', () => {
      acceptAgreement();
      closeAgreementPanel();
    });

    agreementPanelClickHandler = (e) => {
      if (agreementPanel && !agreementPanel.contains(e.target) && !e.target.closest('.summary--terms')) {
        closeAgreementPanel();
      }
    };
    document.addEventListener('click', agreementPanelClickHandler);

    agreementPanel.classList.add('__active');
  }

  /**
   * Закрытие панели соглашения
   */
  function closeAgreementPanel() {
    if (!agreementPanel) return;

    agreementPanel.classList.remove('__active');
    window.unlockScroll();

    if (agreementPanelClickHandler) {
      document.removeEventListener('click', agreementPanelClickHandler);
      agreementPanelClickHandler = null;
    }

    window.closeMobileAgreementPanel = null;

    setTimeout(() => {
      if (agreementPanel) {
        agreementPanel.remove();
        agreementPanel = null;
      }
    }, 300);
  }
})();

/**
 * Pickup Point Popup / Panel
 * Открытие выбора пункта выдачи по клику на ---steps--delivery--pickup-point--select-point
 * >= 600px — popup.__pickup-point
 * < 600px — mobile-panel.__right-panel.__pickup-point
 */
(function() {
  let pickupPopup = null;
  let pickupPanel = null;
  let pickupPanelClickHandler = null;
  let pickupKeyHandler = null;

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('.---steps--delivery--pickup-point--select-point');
    if (!btn || isBlockedCheckout()) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();

      if (window.innerWidth < 600) {
        openPickupPanel();
      } else {
        openPickupPopup();
      }
    });
  });

  /**
   * Открытие popup пункта выдачи (>= 600px)
   */
  function openPickupPopup() {
    if (pickupPopup) {
      pickupPopup.remove();
    }

    pickupPopup = document.createElement('div');
    pickupPopup.className = 'popup __pickup-point';

    pickupPopup.innerHTML = `
      <button class="popup--close" aria-label="Закрыть"></button>
      <div class="popup--title">Пункт выдачи</div>
      <div class="popup--images--block">
        <iframe src="https://totum.online" class="popup--pickup-point--iframe"></iframe>
      </div>
      <button class="popup--pickup-point--select main-button" aria-label="Выбрать пункт выдачи">Выбрать</button>
    `;

    document.body.appendChild(pickupPopup);
    document.body.style.overflow = 'hidden';

    const closeBtn = pickupPopup.querySelector('.popup--close');
    const selectBtn = pickupPopup.querySelector('.popup--pickup-point--select');

    closeBtn.addEventListener('click', () => closePickupPopup());
    selectBtn.addEventListener('click', () => closePickupPopup());

    pickupKeyHandler = (e) => {
      if (e.key === 'Escape') closePickupPopup();
    };
    document.addEventListener('keydown', pickupKeyHandler);

    pickupPopup.classList.add('__visible');
  }

  /**
   * Закрытие popup пункта выдачи
   */
  function closePickupPopup() {
    if (!pickupPopup) return;

    document.removeEventListener('keydown', pickupKeyHandler);
    pickupPopup.classList.remove('__visible');

    setTimeout(() => {
      if (pickupPopup) {
        pickupPopup.remove();
        pickupPopup = null;
      }
      document.body.style.overflow = '';
    }, 300);
  }

  /**
   * Открытие панели пункта выдачи (< 600px)
   */
  function openPickupPanel() {
    if (pickupPanel) {
      closePickupPanel();
      return;
    }

    window.lockScroll();

    const panel = document.createElement('section');
    panel.className = 'mobile-panel __scrollable __right-panel __pickup-point';

    const header = document.createElement('div');
    header.className = 'mobile-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = 'Пункт выдачи';
    titleButton.setAttribute('aria-label', 'Закрыть: Пункт выдачи');

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.textContent = '';

    header.appendChild(titleButton);
    header.appendChild(closeButton);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-panel--content __pickup-point';

    const iframe = document.createElement('iframe');
    iframe.src = 'https://totum.online';
    iframe.className = 'mobile-panel--pickup-point--iframe';
    contentWrapper.appendChild(iframe);

    const selectBtn = document.createElement('button');
    selectBtn.className = 'mobile-panel--pickup-point--select main-button';
    selectBtn.setAttribute('type', 'button');
    selectBtn.textContent = 'Выбрать';
    selectBtn.setAttribute('aria-label', 'Выбрать пункт выдачи');

    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    panel.appendChild(selectBtn);

    document.body.appendChild(panel);
    pickupPanel = panel;

    titleButton.addEventListener('click', () => closePickupPanel());
    closeButton.addEventListener('click', () => closePickupPanel());
    selectBtn.addEventListener('click', () => closePickupPanel());

    pickupPanelClickHandler = (e) => {
      if (pickupPanel && !pickupPanel.contains(e.target) && !e.target.closest('.---steps--delivery--pickup-point')) {
        closePickupPanel();
      }
    };
    document.addEventListener('click', pickupPanelClickHandler);

    pickupPanel.classList.add('__active');
  }

  /**
   * Закрытие панели пункта выдачи
   */
  function closePickupPanel() {
    if (!pickupPanel) return;

    pickupPanel.classList.remove('__active');
    window.unlockScroll();

    if (pickupPanelClickHandler) {
      document.removeEventListener('click', pickupPanelClickHandler);
      pickupPanelClickHandler = null;
    }

    setTimeout(() => {
      if (pickupPanel) {
        pickupPanel.remove();
        pickupPanel = null;
      }
    }, 300);
  }
})();

/**
 * Public Order Autopay
 * Секция public-order приходит с __processing (скрыта по opacity)
 * Без __autopay на public-order--payment — __processing сразу снимается
 * С __autopay — POST CHECKOUT_NUM (номер из /order/[номер]) на /post-endpoints/checkout/autopay, ответ json {link, file}
 * На время запроса, но не меньше PUBLIC_ORDER_AUTOPAY_MIN_LOADING, показывается public-order--loader (__active)
 * link ставится в data-link, file — в data-file кнопки public-order--payment--button вместе с __active
 * При __redirect и непустом link после вставки уходим по ссылке, __processing не снимается
 * Ошибка запроса или пустые link и file — __processing снимается, вместо кнопки показывается public-order--payment--error
 */
const PUBLIC_ORDER_AUTOPAY_URL = '/post-endpoints/checkout/autopay';
const PUBLIC_ORDER_AUTOPAY_ERROR = 'Не удалось получить данные по оплате';
const PUBLIC_ORDER_AUTOPAY_MIN_LOADING = 2000;

function getPublicOrderNum() {
  const match = window.location.pathname.match(/\/order\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function requestPublicOrderAutopay(orderNum) {
  if (!orderNum) throw new Error('Не найден номер заказа');

  const body = new FormData();
  body.append('CHECKOUT_NUM', orderNum);

  const response = await fetch(PUBLIC_ORDER_AUTOPAY_URL, { method: 'POST', body });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  return (await response.json()) || {};
}

function finishPublicOrderProcessing(section) {
  const loader = section.querySelector('.public-order--loader');
  if (loader) loader.classList.remove('__active');

  section.classList.remove('__processing');
}

function showPublicOrderPaymentError(payment, text) {
  const error = payment.querySelector('.public-order--payment--error');
  if (!error) return;

  error.textContent = text;
  error.classList.add('__active');
}

async function initPublicOrderAutopay() {
  const section = document.querySelector('.public-order.__processing');
  if (!section) return;

  const payment = section.querySelector('.public-order--payment');
  if (!payment || !payment.classList.contains('__autopay')) {
    finishPublicOrderProcessing(section);
    return;
  }

  const button = payment.querySelector('.public-order--payment--button');
  const loader = section.querySelector('.public-order--loader');
  if (loader) loader.classList.add('__active');

  const minLoading = new Promise(resolve => setTimeout(resolve, PUBLIC_ORDER_AUTOPAY_MIN_LOADING));
  let answer = {};

  try {
    answer = await requestPublicOrderAutopay(getPublicOrderNum());
  } catch (error) {
    console.error('Ошибка autopay:', error);
  }

  await minLoading;

  const link = String(answer.link ?? '').trim();
  const file = String(answer.file ?? '').trim();

  if ((!link && !file) || !button) {
    showPublicOrderPaymentError(payment, String(answer.error ?? '').trim() || PUBLIC_ORDER_AUTOPAY_ERROR);
    finishPublicOrderProcessing(section);
    return;
  }

  button.dataset.link = link;
  button.dataset.file = file;
  button.classList.add('__active');

  if (link && payment.classList.contains('__redirect')) {
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) finishPublicOrderProcessing(section);
    });
    window.location.href = link;
    return;
  }

  finishPublicOrderProcessing(section);
}

document.addEventListener('DOMContentLoaded', initPublicOrderAutopay);

/**
 * Public Order Fail
 * При GET-параметре fail=true показывается public-order--payment--error с сообщением о неудачной оплате
 */
const PUBLIC_ORDER_FAIL_TEXT = 'Что-то пошло не так, попробуйте оплатить еще раз нажав на кнопку выше';

function initPublicOrderFail() {
  if (new URLSearchParams(window.location.search).get('fail') !== 'true') return;

  const payment = document.querySelector('.public-order--payment');
  if (!payment) return;

  showPublicOrderPaymentError(payment, PUBLIC_ORDER_FAIL_TEXT);
}

document.addEventListener('DOMContentLoaded', initPublicOrderFail);

/**
 * Delivery Link Copy
 * Кнопка ---delivery-link--copy копирует значение ---delivery-link--text в буфер обмена,
 * на 3 сек получает __copied (меняется иконка), затем возвращается обратно
 */
const DELIVERY_LINK_COPIED_DELAY = 3000;
const deliveryLinkCopiedTimers = new WeakMap();

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.---delivery-link--copy');
  if (!btn) return;

  const text = btn.closest('.---delivery-link').querySelector('.---delivery-link--text');
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text.textContent.trim());
  } catch (err) {
    return;
  }

  btn.classList.add('__copied');
  clearTimeout(deliveryLinkCopiedTimers.get(btn));
  deliveryLinkCopiedTimers.set(btn, setTimeout(() => btn.classList.remove('__copied'), DELIVERY_LINK_COPIED_DELAY));
});
