/**
 * Account
 * Личный кабинет витрины:
 *   POST /auth-endpoints/user/getData — данные профиля; отвечает json-строкой
 *   POST /auth-endpoints/user/setData — сохранение профиля; параметры NAME, TEL, NOTIFICATIONS и NEWSLETTER (строковые true/false),
 *                                       а также PASSWORD, если поле нового пароля заполнено,
 *                                       отвечает обновленным профилем той же json-строкой
 *
 * Кнопка account--account-title--edit открывает правую панель «Профиль»
 * (mobile-right-panel __wide __half __scrollable __active), разметка панели берется из fetch/profile.html
 *
 * Клик по account--info--addresses--list li открывает такую же панель «Адрес» из fetch/address.html;
 * город адреса выбирается панелью города из city.js (source address)
 *   POST /auth-endpoints/user/getAddress — данные адреса; параметр ADDRESS_ID — data-address-id того li, на котором кликнули,
 *                                          отвечает json-строкой с полями fias_id, city, region, street_and_building_number,
 *                                          apartment_office, entrance, intercom, floor и comment
 *   POST /auth-endpoints/user/setAddress — сохранение адреса; параметры ADDRESS_ID, CITY, STREET, APARTMENT, ENTRANCE, INTERCOM, FLOOR и COMMENT,
 *                                          отвечает обновленным адресом тем же набором полей — им обновляется li в списке адресов
 *   POST /auth-endpoints/user/addAddress — новый адрес кнопкой account--info--addresses--add-button; параметры те же, что у setAddress, кроме ADDRESS_ID,
 *                                          в ответе есть еще id — с ним адрес добавляется в конец списка через __added
 *   POST /auth-endpoints/user/deleteAddress — удаление адреса кнопкой mobile-right-panel--delete; параметр ADDRESS_ID,
 *                                          панель закрывается, а li списка гаснет через __deleting и удаляется
 * ADDRESS_ID для запросов кладется в data-address-id блока mobile-right-panel--content при открытии панели,
 * CITY — это data-city-id блока города: при открытии туда ложится fias_id, а потом — id выбранного в панели города
 *
 * Кнопка ---notifications-list--item--read-more открывает такую же панель «Нотификация» из fetch/notification.html без accept/cansel
 *   POST /auth-endpoints/user/getNotification — данные нотификации; параметр NOTIF_ID — data-notification-id того li, в котором кнопка,
 *                                               отвечает json-строкой с полями title и additional_text — они выводятся в теле панели
 *
 * Кнопка ---reviews-list--show-review открывает панель «Отзыв» (mobile-right-panel __wide __scrollable __active, без __half) из fetch/review.html
 *   заголовок панели, товар и звезды берутся из разметки того li, в котором кнопка (---reviews-list--type, --image, --name, --rating)
 *   POST /auth-endpoints/user/getReview — данные отзыва; параметр REVIEW_ID — data-review-id того же li,
 *                                         отвечает json-строкой с полями text, answer, signature и images (список адресов картинок) — они выводятся в теле панели
 *
 * Кнопка account--info--profile-buttons--logout выходит из аккаунта через accountLogout (внутри requestLogout из auth.js)
 * accountLogout доступна глобально — ее же вызывает header--main--actions--user в режиме __exit (header.js)
 */

const ACCOUNT_CONFIG = {
  userDataEndpoint: '/auth-endpoints/user/getData',
  userSetDataEndpoint: '/auth-endpoints/user/setData',
  panelTemplateUrl: `/interfaces/${window.interface}/fetch/profile.html`,
  addressPanelTemplateUrl: `/interfaces/${window.interface}/fetch/address.html`,
  userAddressEndpoint: '/auth-endpoints/user/getAddress',
  userSetAddressEndpoint: '/auth-endpoints/user/setAddress',
  userAddAddressEndpoint: '/auth-endpoints/user/addAddress',
  userDeleteAddressEndpoint: '/auth-endpoints/user/deleteAddress',
  notificationPanelTemplateUrl: `/interfaces/${window.interface}/fetch/notification.html`,
  userNotificationEndpoint: '/auth-endpoints/user/getNotification',
  reviewPanelTemplateUrl: `/interfaces/${window.interface}/fetch/review.html`,
  userReviewEndpoint: '/auth-endpoints/user/getReview',
  maxValueLength: 300, // совпадает с лимитом post_guard.php и с maxlength полей шаблона
  maxAddresses: 5, // совпадает с подписью account--info--addresses--add-description в шаблоне кабинета
  logoutRedirect: '/', // после выхода в кабинете делать нечего, уходим на главную
  orderPagePath: '/account/order/',
  loadError: 'Не удалось получить данные профиля',
  addressLoadError: 'Не удалось получить данные адреса',
  notificationLoadError: 'Не удалось получить нотификацию',
  reviewLoadError: 'Не удалось получить отзыв',
  citySelectPlaceholder: 'Выберите город', // совпадает с текстом блока города в шаблоне address.html
  addressDeleteAnimationMs: 500 // совпадает с transition opacity у li списка адресов
};

/**
 * Проверка нового пароля: только a-zA-Z0-9, пробел, -, _, ! и *, не менее 8 символов
 */
const ACCOUNT_PASSWORD_PATTERN = /^[a-zA-Z0-9 \-_!*]{8,}$/;

let accountProfileTemplateCache = null;
let accountAddressTemplateCache = null;
let accountNotificationTemplateCache = null;
let accountReviewTemplateCache = null;

/**
 * Загрузка разметки панели из profile.html
 * Кешируется после первого запроса
 */
async function loadAccountProfileTemplate() {
  if (!accountProfileTemplateCache) {
    const response = await fetch(ACCOUNT_CONFIG.panelTemplateUrl);
    accountProfileTemplateCache = await response.text();
  }

  return accountProfileTemplateCache;
}

/**
 * Загрузка разметки панели из address.html
 * Кешируется после первого запроса
 */
async function loadAccountAddressTemplate() {
  if (!accountAddressTemplateCache) {
    const response = await fetch(ACCOUNT_CONFIG.addressPanelTemplateUrl);
    accountAddressTemplateCache = await response.text();
  }

  return accountAddressTemplateCache;
}

/**
 * Загрузка разметки панели из notification.html
 * Кешируется после первого запроса
 */
async function loadAccountNotificationTemplate() {
  if (!accountNotificationTemplateCache) {
    const response = await fetch(ACCOUNT_CONFIG.notificationPanelTemplateUrl);
    accountNotificationTemplateCache = await response.text();
  }

  return accountNotificationTemplateCache;
}

/**
 * Загрузка разметки панели из review.html
 * Кешируется после первого запроса
 */
async function loadAccountReviewTemplate() {
  if (!accountReviewTemplateCache) {
    const response = await fetch(ACCOUNT_CONFIG.reviewPanelTemplateUrl);
    accountReviewTemplateCache = await response.text();
  }

  return accountReviewTemplateCache;
}

/**
 * Account Panels
 * Панели кабинета открываются поверх страницы, поэтому остальные панели витрины закрываются перед открытием
 * Закрытие самой открываемой панели безопасно: ее экземпляр к этому моменту уже без panel
 */
function closePanelsBeforeAccountPanel() {
  if (typeof window.closeAccountProfilePanel === 'function') {
    window.closeAccountProfilePanel();
  }

  if (typeof window.closeAccountAddressPanel === 'function') {
    window.closeAccountAddressPanel();
  }

  if (typeof window.closeAccountNotificationPanel === 'function') {
    window.closeAccountNotificationPanel();
  }

  if (typeof window.closeAccountReviewPanel === 'function') {
    window.closeAccountReviewPanel();
  }

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

  if (typeof window.closeMobileOrderByPanel === 'function') {
    window.closeMobileOrderByPanel();
  }

  if (typeof window.closeSelectOptionMobilePanel === 'function') {
    window.closeSelectOptionMobilePanel();
  }

  const mobileMenuButton = document.getElementById('mobile-menu');
  const topMenu = document.querySelector('.header--top-menu');
  if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
    mobileMenuButton.click();
  }

  if (typeof window.closeMobileCartPanel === 'function') {
    window.closeMobileCartPanel();
  }
}

/**
 * Account Api
 * Запросы к post-эндпойнтам кабинета
 */

/**
 * Данные профиля
 * Ответ — json-строка, отдаём её как текст, разбором занимается вызывающий код
 */
async function requestAccountUserData() {
  const response = await fetch(ACCOUNT_CONFIG.userDataEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: ''
  });

  return (await response.text()).trim();
}

/**
 * Сохранение профиля
 * Эндпойнт сам фильтрует значения, отправляем как есть
 */
async function requestAccountUserSetData(name, tel, password, notifications, newsletter) {
  const params = new URLSearchParams();
  params.set('NAME', name);
  params.set('TEL', tel);
  params.set('NOTIFICATIONS', notifications ? 'true' : 'false'); // эндпойнт ждет строковые true/false
  params.set('NEWSLETTER', newsletter ? 'true' : 'false');

  if (password) {
    params.set('PASSWORD', password); // пустое поле пароль не меняет, поэтому ключ не отправляем
  }

  const response = await fetch(ACCOUNT_CONFIG.userSetDataEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Данные адреса
 * Ответ — json-строка, отдаём её как текст, разбором занимается вызывающий код
 */
async function requestAccountUserAddress(addressId) {
  const params = new URLSearchParams();
  params.set('ADDRESS_ID', addressId);

  const response = await fetch(ACCOUNT_CONFIG.userAddressEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Сохранение адреса
 * Эндпойнт сам фильтрует значения, отправляем как есть; ответ — такая же json-строка, как у getAddress
 */
async function requestAccountUserSetAddress(addressId, city, street, apartment, entrance, intercom, floor, comment) {
  const params = new URLSearchParams();
  params.set('ADDRESS_ID', addressId);
  params.set('CITY', city);
  params.set('STREET', street);
  params.set('APARTMENT', apartment);
  params.set('ENTRANCE', entrance);
  params.set('INTERCOM', intercom);
  params.set('FLOOR', floor);
  params.set('COMMENT', comment);

  const response = await fetch(ACCOUNT_CONFIG.userSetAddressEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Добавление адреса
 * Те же параметры, что у setAddress, только без ADDRESS_ID — его вернет сам эндпойнт в ключе id
 */
async function requestAccountUserAddAddress(city, street, apartment, entrance, intercom, floor, comment) {
  const params = new URLSearchParams();
  params.set('CITY', city);
  params.set('STREET', street);
  params.set('APARTMENT', apartment);
  params.set('ENTRANCE', entrance);
  params.set('INTERCOM', intercom);
  params.set('FLOOR', floor);
  params.set('COMMENT', comment);

  const response = await fetch(ACCOUNT_CONFIG.userAddAddressEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Удаление адреса
 */
async function requestAccountUserDeleteAddress(addressId) {
  const params = new URLSearchParams();
  params.set('ADDRESS_ID', addressId);

  const response = await fetch(ACCOUNT_CONFIG.userDeleteAddressEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Данные нотификации
 * Ответ — json-строка, отдаём её как текст, разбором занимается вызывающий код
 */
async function requestAccountUserNotification(notificationId) {
  const params = new URLSearchParams();
  params.set('NOTIF_ID', notificationId);

  const response = await fetch(ACCOUNT_CONFIG.userNotificationEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Данные отзыва
 * Ответ — json-строка, отдаём её как текст, разбором занимается вызывающий код
 */
async function requestAccountUserReview(reviewId) {
  const params = new URLSearchParams();
  params.set('REVIEW_ID', reviewId);

  const response = await fetch(ACCOUNT_CONFIG.userReviewEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'application/json' },
    body: params.toString()
  });

  return (await response.text()).trim();
}

/**
 * Ответ адресных эндпойнтов
 * Не json — значит пришел текст ошибки, отдаем null
 */
function parseAccountAddressResponse(response) {
  try {
    return JSON.parse(response);
  } catch (_) {
    return null;
  }
}

/**
 * Флаги профиля
 * h_notifications и h_newsletter приходят строковыми true/false, но допускаем и boolean
 */
function isAccountFlagOn(value) {
  return value === true || value === 'true';
}

/**
 * Account Title
 * Заголовок кабинета: имя, email и телефон обновляются данными профиля после сохранения
 */
function updateAccountTitle(userData) {
  const titleBlock = document.querySelector('.account--account-title--h1--block');

  if (!titleBlock || !userData) return;

  const nameElement = titleBlock.querySelector('h1');
  const emailElement = titleBlock.querySelector('.account--account-title--user-email');
  const telElement = titleBlock.querySelector('.account--account-title--user-tel');

  if (nameElement) nameElement.textContent = userData.h_customer_name || '';
  if (emailElement) emailElement.textContent = userData.h_totum_user_email || '';
  if (telElement) telElement.textContent = userData.h_customer_tel || '';
}

/**
 * Account Profile Panel
 * Правая панель профиля: разметка из profile.html, закрывается по заголовку, close, accept и cansel
 */
class AccountProfilePanel {
  constructor(triggerButton) {
    this.triggerButton = triggerButton;
    this.panel = null;
    this.contentWrapper = null;
    this.emailInput = null;
    this.nameInput = null;
    this.telInput = null;
    this.passwordInput = null;
    this.notificationsToggle = null;
    this.newsletterToggle = null;
    this.dataLoaded = false;
  }

  /**
   * Пустая панель — разметка приезжает отдельным запросом
   */
  createPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __half __scrollable';

    document.body.appendChild(panel);

    this.panel = panel;
  }

  /**
   * Разметка из profile.html и привязка обработчиков
   */
  async fillPanel() {
    const template = await loadAccountProfileTemplate();

    if (!this.panel) return false;

    this.panel.innerHTML = template;

    this.contentWrapper = this.panel.querySelector('.mobile-right-panel--content');
    this.emailInput = this.panel.querySelector('#profile-email');
    this.nameInput = this.panel.querySelector('#profile-name');
    this.telInput = this.panel.querySelector('#profile-tel');
    this.passwordInput = this.panel.querySelector('#profile-password');
    this.notificationsToggle = this.panel.querySelector('#profile-notifications');
    this.newsletterToggle = this.panel.querySelector('#profile-newsletter');

    if (!this.contentWrapper || !this.emailInput || !this.nameInput || !this.telInput || !this.passwordInput) return false;
    if (!this.notificationsToggle || !this.newsletterToggle) return false;

    const titleButton = this.panel.querySelector('.mobile-right-panel--header--title');
    const closeButton = this.panel.querySelector('.mobile-right-panel--close');
    const canselButton = this.panel.querySelector('.mobile-right-panel--cansel');
    const acceptButton = this.panel.querySelector('.mobile-right-panel--accept');

    if (titleButton) titleButton.addEventListener('click', () => this.closePanel());
    if (closeButton) closeButton.addEventListener('click', () => this.saveAndClosePanel());
    if (canselButton) canselButton.addEventListener('click', () => this.closePanel()); // cansel закрывает панель без сохранения
    if (acceptButton) acceptButton.addEventListener('click', () => this.saveAndClosePanel());

    this.panel.querySelectorAll('.mobile-right-panel--input input').forEach(input => {
      input.addEventListener('input', () => input.classList.remove('__invalid')); // правка снимает отметку ошибки
    });

    this.passwordInput.addEventListener('input', () => {
      const password = this.passwordInput.value;

      this.passwordInput.classList.toggle('__invalid', Boolean(password) && !ACCOUNT_PASSWORD_PATTERN.test(password)); // пустое поле пароль не меняет и ошибкой не считается
    });

    this.panel.querySelectorAll('.mobile-right-panel--input .__reveal').forEach(button => {
      const input = button.parentElement.querySelector('input');

      button.addEventListener('click', () => {
        const isHidden = input.type === 'password';

        input.type = isHidden ? 'text' : 'password';
        button.classList.toggle('__active', isHidden);
        button.innerHTML = isHidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        input.focus();
      });
    });

    this.panel.querySelectorAll('.mobile-right-panel--toggle').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('__checked'));
    });

    initTelephoneFormat(this.telInput); // формат телефона из telephone.js

    return true;
  }

  /**
   * Открытие панели с загрузкой данных профиля
   */
  async openPanel() {
    if (this.panel) {
      this.closePanel();
      return;
    }

    closePanelsBeforeAccountPanel();

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    this.createPanel();

    this.panel.classList.add('__active');

    const dataRequest = requestAccountUserData().catch(() => ''); // разметка и данные едут параллельно

    let panelFilled = false;
    try {
      panelFilled = await this.fillPanel();
    } catch (_) {
      panelFilled = false;
    }

    if (!this.panel || !panelFilled) return;

    let userData = null;
    try {
      userData = JSON.parse(await dataRequest);
    } catch (_) {
      userData = null;
    }

    if (!this.panel) return;

    if (!userData) {
      const error = document.createElement('div');
      error.className = 'mobile-right-panel--input--description';
      error.textContent = ACCOUNT_CONFIG.loadError;
      this.contentWrapper.appendChild(error);
      return;
    }

    this.emailInput.value = userData.h_totum_user_email || '';
    this.nameInput.value = userData.h_customer_name || '';
    this.telInput.value = formatTelephone(userData.h_customer_tel || '');
    this.notificationsToggle.classList.toggle('__checked', isAccountFlagOn(userData.h_notifications));
    this.newsletterToggle.classList.toggle('__checked', isAccountFlagOn(userData.h_newsletter));

    this.dataLoaded = true;
  }

  /**
   * Проверка полей: имя обязательно, имя и телефон не длиннее maxValueLength,
   * заполненный пароль проверяется по ACCOUNT_PASSWORD_PATTERN
   * Неверные поля отмечаются __invalid
   */
  validateFields() {
    const name = this.nameInput.value.trim();
    const tel = this.telInput.value.trim();
    const password = this.passwordInput.value;

    this.nameInput.classList.remove('__invalid');
    this.telInput.classList.remove('__invalid');
    this.passwordInput.classList.remove('__invalid');

    let firstInvalid = null;

    if (!name || name.length > ACCOUNT_CONFIG.maxValueLength) {
      this.nameInput.classList.add('__invalid');
      firstInvalid = this.nameInput;
    }

    if (tel.length > ACCOUNT_CONFIG.maxValueLength) {
      this.telInput.classList.add('__invalid');
      if (!firstInvalid) firstInvalid = this.telInput;
    }

    if (password && (!ACCOUNT_PASSWORD_PATTERN.test(password) || password.length > ACCOUNT_CONFIG.maxValueLength)) {
      this.passwordInput.classList.add('__invalid');
      if (!firstInvalid) firstInvalid = this.passwordInput;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }

    return true;
  }

  /**
   * Сохранение и закрытие: закрываем сразу, запрос уходит в фоне
   * При неверных данных панель не закрывается — выйти без сохранения можно через cansel
   */
  saveAndClosePanel() {
    if (!this.panel) return;

    if (this.dataLoaded) {
      if (!this.validateFields()) return;

      const name = this.nameInput.value.trim();
      const tel = this.telInput.value.trim();
      const password = this.passwordInput.value;
      const notifications = this.notificationsToggle.classList.contains('__checked');
      const newsletter = this.newsletterToggle.classList.contains('__checked');

      requestAccountUserSetData(name, tel, password, notifications, newsletter)
        .then(response => {
          let savedData = null;
          try {
            savedData = JSON.parse(response);
          } catch (_) {
            savedData = null; // ответом пришел текст ошибки — заголовок не трогаем
          }

          updateAccountTitle(savedData);
        })
        .catch(() => {});
    }

    this.closePanel();
  }

  /**
   * Закрытие панели
   */
  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;

    closingPanel.classList.remove('__active');

    this.panel = null;
    this.contentWrapper = null;
    this.emailInput = null;
    this.nameInput = null;
    this.telInput = null;
    this.passwordInput = null;
    this.notificationsToggle = null;
    this.newsletterToggle = null;
    this.dataLoaded = false;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Инициализация панели профиля
 */
function initAccountProfilePanel() {
  const editButton = document.querySelector('.account--account-title--edit');
  if (!editButton) return;

  const profilePanel = new AccountProfilePanel(editButton);

  window.closeAccountProfilePanel = () => profilePanel.closePanel();

  editButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    profilePanel.openPanel();
  });

  document.addEventListener('click', (e) => {
    if (!profilePanel.panel) return;

    if (!profilePanel.panel.contains(e.target) && !e.target.closest('.account--account-title--edit')) {
      profilePanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && profilePanel.panel) {
      e.stopImmediatePropagation();
      profilePanel.closePanel();
    }
  });
}

/**
 * Account Addresses List
 * Обновление адреса в списке кабинета данными, которые вернул setAddress
 */

/**
 * Подписи дополнительных частей адреса в том же порядке, в каком их отдает темплейт списка
 */
const ACCOUNT_ADDRESS_MORE_LABELS = [
  ['apartment_office', 'квартира/офис'],
  ['entrance', 'подъезд'],
  ['intercom', 'домофон'],
  ['floor', 'этаж']
];

/**
 * Кнопка добавления адреса
 * На пределе maxAddresses она получает __disabled, а под ней показывается подпись про лимит
 * Адреса, которые гаснут после удаления, не считаются — они еще в разметке, но их уже нет
 */
function updateAccountAddressesAddButton() {
  const addButton = document.querySelector('.account--info--addresses--add-button');
  if (!addButton) return;

  const items = document.querySelectorAll('.account--info--addresses--list > ul > li:not(.__deleting)');

  addButton.classList.toggle('__disabled', items.length >= ACCOUNT_CONFIG.maxAddresses);
}

/**
 * Иконка редактирования — такая же, как в темплейте списка
 */
function createAccountAddressEditIcon() {
  const editIcon = document.createElement('div');
  editIcon.className = '---addresses-list--edit-icon';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-pencil';
  editIcon.appendChild(icon);

  return editIcon;
}

/**
 * Строка списка адресов
 * li собирается заново: пустые значения в разметку не попадают, иначе пустые блоки дадут лишние отступы
 * Иконка редактирования переносится из старой разметки, а у нового адреса создается
 */
function updateAccountAddressItem(item, addressData) {
  const editIcon = item.querySelector('.---addresses-list--edit-icon') || createAccountAddressEditIcon();

  item.textContent = '';

  if (addressData.city) {
    const city = document.createElement('div');
    city.className = '---addresses-list--city';
    city.textContent = addressData.city;
    item.appendChild(city);
  }

  if (addressData.region) {
    const region = document.createElement('div');
    region.className = '---addresses-list--region';
    region.textContent = addressData.region;
    item.appendChild(region);
  }

  const streetBlock = document.createElement('div');
  streetBlock.className = '---addresses-list--street--block';

  if (addressData.street_and_building_number) {
    const street = document.createElement('div');
    street.className = '---addresses-list--street';
    street.textContent = addressData.street_and_building_number;
    streetBlock.appendChild(street);
  }

  ACCOUNT_ADDRESS_MORE_LABELS.forEach(([field, label]) => {
    if (!addressData[field]) return;

    const more = document.createElement('div');
    more.className = '---addresses-list--more';
    more.textContent = label + ' ' + addressData[field];
    streetBlock.appendChild(more);
  });

  if (streetBlock.children.length) item.appendChild(streetBlock);

  if (addressData.comment) {
    const comment = document.createElement('div');
    comment.className = '---addresses-list--comment';
    comment.textContent = addressData.comment;
    item.appendChild(comment);
  }

  item.appendChild(editIcon);
}

/**
 * Новый адрес в конце списка
 * __added задает конечную opacity, а @starting-style в CSS запускает появление с opacity 0
 */
function addAccountAddressItem(addressData) {
  const list = document.querySelector('.account--info--addresses--list ul');
  if (!list) return;

  const item = document.createElement('li');
  item.dataset.addressId = addressData.id || '';
  item.classList.add('__added');

  updateAccountAddressItem(item, addressData);

  list.appendChild(item);

  updateAccountAddressesAddButton();
}

/**
 * Удаление строки списка
 * Сначала __deleting — он гасит адрес опасити, и только после анимации li убирается из разметки
 * Пустое состояние списка покажется само: addresses--zero выводится по :not(:has(> ul > li))
 */
function removeAccountAddressItem(item) {
  item.classList.add('__deleting');

  updateAccountAddressesAddButton();

  setTimeout(() => {
    item.remove();
  }, ACCOUNT_CONFIG.addressDeleteAnimationMs);
}

/**
 * Account Address Panel
 * Правая панель адреса: разметка из address.html, город выбирается панелью города из city.js
 * Панель одна на весь список, открывается кликом по адресу, закрывается по заголовку, close, accept, cansel и delete
 * Кнопка добавления открывает ту же панель пустой: данные не грузятся, сохранение уходит в addAddress, а корзина убирается
 */
class AccountAddressPanel {
  constructor() {
    this.panel = null;
    this.item = null;
    this.contentWrapper = null;
    this.cityBlock = null;
    this.streetInput = null;
    this.apartmentInput = null;
    this.entranceInput = null;
    this.intercomInput = null;
    this.floorInput = null;
    this.commentInput = null;
    this.dataLoaded = false;
    this.isNewAddress = false;
  }

  /**
   * Пустая панель — разметка приезжает отдельным запросом
   */
  createPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __half __scrollable';

    document.body.appendChild(panel);

    this.panel = panel;
  }

  /**
   * Разметка из address.html и привязка обработчиков
   */
  async fillPanel() {
    const template = await loadAccountAddressTemplate();

    if (!this.panel) return false;

    this.panel.innerHTML = template;

    this.contentWrapper = this.panel.querySelector('.mobile-right-panel--content');
    this.cityBlock = this.panel.querySelector('.mobile-right-panel--city');
    this.streetInput = this.panel.querySelector('#address-street-and-building-number');
    this.apartmentInput = this.panel.querySelector('#address-apartment-office');
    this.entranceInput = this.panel.querySelector('#address-entrance');
    this.intercomInput = this.panel.querySelector('#address-intercom');
    this.floorInput = this.panel.querySelector('#address-floor');
    this.commentInput = this.panel.querySelector('#address-comment');

    if (!this.contentWrapper || !this.cityBlock || !this.streetInput) return false;
    if (!this.apartmentInput || !this.entranceInput || !this.intercomInput || !this.floorInput || !this.commentInput) return false;

    const titleButton = this.panel.querySelector('.mobile-right-panel--header--title');
    const closeButton = this.panel.querySelector('.mobile-right-panel--close');
    const canselButton = this.panel.querySelector('.mobile-right-panel--cansel');
    const acceptButton = this.panel.querySelector('.mobile-right-panel--accept');
    const deleteButton = this.panel.querySelector('.mobile-right-panel--delete');

    if (titleButton) titleButton.addEventListener('click', () => this.closePanel());
    if (closeButton) closeButton.addEventListener('click', () => this.saveAndClosePanel());
    if (canselButton) canselButton.addEventListener('click', () => this.closePanel()); // cansel закрывает панель без сохранения
    if (acceptButton) acceptButton.addEventListener('click', () => this.saveAndClosePanel());

    if (deleteButton) {
      if (this.isNewAddress) {
        deleteButton.remove(); // у нового адреса удалять нечего
      } else {
        deleteButton.addEventListener('click', () => this.deleteAndClosePanel());
      }
    }

    this.panel.querySelectorAll('.mobile-right-panel--input input').forEach(input => {
      input.addEventListener('input', () => input.classList.remove('__invalid')); // правка снимает отметку ошибки
    });

    this.panel.querySelectorAll('.mobile-right-panel--input textarea').forEach(textarea => {
      textarea.addEventListener('input', () => textarea.classList.remove('__invalid'));
    });

    // клик по городу открывает выбор и снимает отметку ошибки; перехват нужен, потому что обработчики city.js гасят всплытие
    this.cityBlock.addEventListener('click', () => this.cityBlock.classList.remove('__invalid'), true);

    initCityPanelAddress(this.panel); // кнопка и блок города открывают панель выбора города из city.js

    return true;
  }

  /**
   * Данные адреса в поля панели
   * fias_id ложится в data-city-id блока города — оттуда его берет сохранение, выбор в панели города его перезапишет
   */
  applyAddressData(addressData) {
    const citySelectedElement = this.cityBlock.querySelector('.mobile-right-panel--city--selected');
    const cityRegionElement = this.cityBlock.querySelector('.mobile-right-panel--city--region');

    this.cityBlock.dataset.cityId = addressData.fias_id || '';

    if (citySelectedElement) citySelectedElement.textContent = addressData.city || ACCOUNT_CONFIG.citySelectPlaceholder;
    if (cityRegionElement) cityRegionElement.textContent = addressData.region || '';

    this.streetInput.value = addressData.street_and_building_number || '';
    this.apartmentInput.value = addressData.apartment_office || '';
    this.entranceInput.value = addressData.entrance || '';
    this.intercomInput.value = addressData.intercom || '';
    this.floorInput.value = addressData.floor || '';
    this.commentInput.value = addressData.comment || '';
  }

  /**
   * Открытие панели по клику на адрес с загрузкой его данных
   * Повторный клик по тому же адресу закрывает панель, клик по другому — переоткрывает
   */
  async openPanel(item) {
    const sameItem = this.panel && this.item === item;

    if (this.panel) {
      this.closePanel();

      if (sameItem) return;
    }

    closePanelsBeforeAccountPanel();

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    this.item = item;
    this.isNewAddress = false;
    this.createPanel();

    this.panel.classList.add('__active');

    const addressId = item.dataset.addressId || '';
    const dataRequest = requestAccountUserAddress(addressId).catch(() => ''); // разметка и данные едут параллельно

    let panelFilled = false;
    try {
      panelFilled = await this.fillPanel();
    } catch (_) {
      panelFilled = false;
    }

    if (!this.panel || !panelFilled) return;

    this.contentWrapper.dataset.addressId = addressId; // id адреса живет в разметке панели — из него его берет сохранение

    const addressData = parseAccountAddressResponse(await dataRequest);

    if (!this.panel) return; // панель закрыли, пока шел запрос

    if (!addressData) {
      const error = document.createElement('div');
      error.className = 'mobile-right-panel--input--description';
      error.textContent = ACCOUNT_CONFIG.addressLoadError;
      this.contentWrapper.appendChild(error);
      return;
    }

    this.applyAddressData(addressData);

    this.dataLoaded = true;
  }

  /**
   * Открытие пустой панели для нового адреса
   * Повторный клик по кнопке добавления закрывает панель, как и повторный клик по адресу
   */
  async openAddPanel() {
    const sameMode = this.panel && this.isNewAddress;

    if (this.panel) {
      this.closePanel();

      if (sameMode) return;
    }

    closePanelsBeforeAccountPanel();

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    this.isNewAddress = true;
    this.createPanel();

    this.panel.classList.add('__active');

    let panelFilled = false;
    try {
      panelFilled = await this.fillPanel();
    } catch (_) {
      panelFilled = false;
    }

    if (!this.panel || !panelFilled) return;

    this.dataLoaded = true; // грузить нечего, пустые поля и есть данные нового адреса
  }

  /**
   * Проверка полей: улица с номером дома обязательна, все значения не длиннее maxValueLength
   * Город тоже обязателен: пустой data-city-id значит, что город не выбран
   * Неверные поля и блок города отмечаются __invalid
   */
  validateFields() {
    const fields = [this.streetInput, this.apartmentInput, this.entranceInput, this.intercomInput, this.floorInput, this.commentInput];

    fields.forEach(field => field.classList.remove('__invalid'));
    this.cityBlock.classList.remove('__invalid');

    let firstInvalid = null;
    let cityInvalid = false;

    if (!this.cityBlock.dataset.cityId) {
      this.cityBlock.classList.add('__invalid');
      cityInvalid = true;
    }

    if (!this.streetInput.value.trim()) {
      this.streetInput.classList.add('__invalid');
      firstInvalid = this.streetInput;
    }

    fields.forEach(field => {
      if (field.value.trim().length <= ACCOUNT_CONFIG.maxValueLength) return;

      field.classList.add('__invalid');
      if (!firstInvalid) firstInvalid = field;
    });

    if (cityInvalid) {
      this.cityBlock.scrollIntoView({ block: 'nearest' }); // фокусироваться не на чем — просто показываем блок города
      return false;
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }

    return true;
  }

  /**
   * Сохранение и закрытие: закрываем сразу, запрос уходит в фоне и правит список адресов
   * Новый адрес уходит в addAddress и добавляется в конец списка, старый — в setAddress и обновляет свою строку
   * При неверных данных панель не закрывается — выйти без сохранения можно через cansel
   */
  saveAndClosePanel() {
    if (!this.panel) return;

    if (this.dataLoaded) {
      if (!this.validateFields()) return;

      const item = this.item; // строка списка нужна после закрытия панели, а оно обнулит ссылки
      const addressId = this.contentWrapper.dataset.addressId || '';
      const city = this.cityBlock.dataset.cityId || '';
      const street = this.streetInput.value.trim();
      const apartment = this.apartmentInput.value.trim();
      const entrance = this.entranceInput.value.trim();
      const intercom = this.intercomInput.value.trim();
      const floor = this.floorInput.value.trim();
      const comment = this.commentInput.value.trim();

      const saveRequest = this.isNewAddress
        ? requestAccountUserAddAddress(city, street, apartment, entrance, intercom, floor, comment)
        : requestAccountUserSetAddress(addressId, city, street, apartment, entrance, intercom, floor, comment);

      const isNewAddress = this.isNewAddress;

      saveRequest
        .then(response => {
          const savedData = parseAccountAddressResponse(response);
          if (!savedData) return; // ответом пришел текст ошибки — список не трогаем

          if (isNewAddress) {
            addAccountAddressItem(savedData);
            return;
          }

          if (item) updateAccountAddressItem(item, savedData);
        })
        .catch(() => {});
    }

    this.closePanel();
  }

  /**
   * Удаление и закрытие: закрываем панель и гасим адрес в списке, запрос уходит в фоне
   */
  deleteAndClosePanel() {
    if (!this.panel) return;
    if (!this.dataLoaded) return; // данные не загрузились — удалять нечего

    const item = this.item; // строка списка нужна после закрытия панели, а оно обнулит ссылки
    const addressId = this.contentWrapper.dataset.addressId || '';

    requestAccountUserDeleteAddress(addressId).catch(() => {});

    this.closePanel();

    if (item) removeAccountAddressItem(item);
  }

  /**
   * Закрытие панели вместе с открытой над ней панелью выбора города
   */
  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;
    const cityPanel = document.querySelector('.mobile-right-panel.__address');

    if (cityPanel) closeCityPanel(cityPanel);

    closingPanel.classList.remove('__active');

    this.panel = null;
    this.item = null;
    this.contentWrapper = null;
    this.cityBlock = null;
    this.streetInput = null;
    this.apartmentInput = null;
    this.entranceInput = null;
    this.intercomInput = null;
    this.floorInput = null;
    this.commentInput = null;
    this.dataLoaded = false;
    this.isNewAddress = false;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Инициализация панели адреса
 */
function initAccountAddressPanel() {
  const addressesList = document.querySelector('.account--info--addresses--list');
  if (!addressesList) return;

  const addressPanel = new AccountAddressPanel();

  window.closeAccountAddressPanel = () => addressPanel.closePanel();

  addressesList.addEventListener('click', (e) => {
    const item = e.target.closest('li');
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();

    addressPanel.openPanel(item);
  });

  const addButton = document.querySelector('.account--info--addresses--add-button');

  if (addButton) {
    addButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // иначе обработчик клика вне панели закроет только что открытую панель

      if (addButton.classList.contains('__disabled')) return; // адресов уже максимум

      addressPanel.openAddPanel();
    });
  }

  updateAccountAddressesAddButton();

  document.addEventListener('click', (e) => {
    if (!addressPanel.panel) return;

    if (e.target.closest('.mobile-right-panel.__city')) return; // клик в панели выбора города панель адреса не закрывает

    if (!addressPanel.panel.contains(e.target) && !e.target.closest('.account--info--addresses--list li')) {
      addressPanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addressPanel.panel) {
      e.stopImmediatePropagation();
      addressPanel.closePanel();
    }
  });
}

/**
 * Account Notification Panel
 * Правая панель нотификации: разметка из notification.html, только чтение — закрывается по заголовку и close
 * Панель одна на весь список, открывается кнопкой «Подробнее» в li нотификации
 */
class AccountNotificationPanel {
  constructor() {
    this.panel = null;
    this.item = null;
    this.contentWrapper = null;
    this.titleElement = null;
    this.textElement = null;
  }

  /**
   * Пустая панель — разметка приезжает отдельным запросом
   */
  createPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __half __scrollable';

    document.body.appendChild(panel);

    this.panel = panel;
  }

  /**
   * Разметка из notification.html и привязка обработчиков
   */
  async fillPanel() {
    const template = await loadAccountNotificationTemplate();

    if (!this.panel) return false;

    this.panel.innerHTML = template;

    this.contentWrapper = this.panel.querySelector('.mobile-right-panel--content');
    this.titleElement = this.panel.querySelector('.mobile-right-panel--notification--title');
    this.textElement = this.panel.querySelector('.mobile-right-panel--notification--text');

    if (!this.contentWrapper || !this.titleElement || !this.textElement) return false;

    const titleButton = this.panel.querySelector('.mobile-right-panel--header--title');
    const closeButton = this.panel.querySelector('.mobile-right-panel--close');

    if (titleButton) titleButton.addEventListener('click', () => this.closePanel());
    if (closeButton) closeButton.addEventListener('click', () => this.closePanel());

    return true;
  }

  /**
   * Открытие панели по кнопке «Подробнее» с загрузкой нотификации
   * Повторный клик по той же кнопке закрывает панель, клик по другой — переоткрывает
   */
  async openPanel(item) {
    const sameItem = this.panel && this.item === item;

    if (this.panel) {
      this.closePanel();

      if (sameItem) return;
    }

    closePanelsBeforeAccountPanel();

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    this.item = item;
    this.createPanel();

    this.panel.classList.add('__active');

    const notificationId = item.dataset.notificationId || '';
    const dataRequest = requestAccountUserNotification(notificationId).catch(() => ''); // разметка и данные едут параллельно

    let panelFilled = false;
    try {
      panelFilled = await this.fillPanel();
    } catch (_) {
      panelFilled = false;
    }

    if (!this.panel || !panelFilled) return;

    const notificationData = parseAccountAddressResponse(await dataRequest);

    if (!this.panel) return; // панель закрыли, пока шел запрос

    if (!notificationData) {
      const error = document.createElement('div');
      error.className = 'mobile-right-panel--input--description';
      error.textContent = ACCOUNT_CONFIG.notificationLoadError;
      this.contentWrapper.appendChild(error);
      return;
    }

    this.titleElement.textContent = notificationData.title || '';
    this.textElement.textContent = notificationData.additional_text || '';
  }

  /**
   * Закрытие панели
   */
  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;

    closingPanel.classList.remove('__active');

    this.panel = null;
    this.item = null;
    this.contentWrapper = null;
    this.titleElement = null;
    this.textElement = null;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Инициализация панели нотификации
 */
function initAccountNotificationPanel() {
  const notificationsList = document.querySelector('.account--info--notifications--list');
  if (!notificationsList) return;

  const notificationPanel = new AccountNotificationPanel();

  window.closeAccountNotificationPanel = () => notificationPanel.closePanel();

  notificationsList.addEventListener('click', (e) => {
    const button = e.target.closest('.---notifications-list--item--read-more');
    if (!button) return;

    const item = button.closest('li');
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();

    notificationPanel.openPanel(item);
  });

  document.addEventListener('click', (e) => {
    if (!notificationPanel.panel) return;

    if (!notificationPanel.panel.contains(e.target) && !e.target.closest('.---notifications-list--item--read-more')) {
      notificationPanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notificationPanel.panel) {
      e.stopImmediatePropagation();
      notificationPanel.closePanel();
    }
  });
}

/**
 * Account Review Panel
 * Правая панель отзыва: разметка из review.html, только чтение — закрывается по заголовку и close
 * Панель одна на весь список, открывается кнопкой «Посмотреть целиком» в li отзыва, заголовок — тип отзыва из ---reviews-list--type
 */
class AccountReviewPanel {
  constructor() {
    this.panel = null;
    this.item = null;
    this.contentWrapper = null;
    this.imagesElement = null;
    this.imagesList = null;
    this.textElement = null;
    this.answerElement = null;
    this.signatureElement = null;
  }

  /**
   * Пустая панель — разметка приезжает отдельным запросом
   */
  createPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __scrollable';

    document.body.appendChild(panel);

    this.panel = panel;
  }

  /**
   * Разметка из review.html и привязка обработчиков
   */
  async fillPanel() {
    const template = await loadAccountReviewTemplate();

    if (!this.panel) return false;

    this.panel.innerHTML = template;

    this.contentWrapper = this.panel.querySelector('.mobile-right-panel--content');
    this.imagesElement = this.panel.querySelector('.mobile-right-panel--review--images');
    this.imagesList = this.panel.querySelector('.mobile-right-panel--review--images ul');
    this.textElement = this.panel.querySelector('.mobile-right-panel--review--text');
    this.answerElement = this.panel.querySelector('.mobile-right-panel--review--answer');
    this.signatureElement = this.panel.querySelector('.mobile-right-panel--review--answer--signature');

    if (!this.contentWrapper || !this.imagesElement || !this.imagesList) return false;
    if (!this.textElement || !this.answerElement || !this.signatureElement) return false;

    const titleButton = this.panel.querySelector('.mobile-right-panel--header--title');
    const closeButton = this.panel.querySelector('.mobile-right-panel--close');

    if (titleButton) {
      const typeElement = this.item ? this.item.querySelector('.---reviews-list--type') : null;
      if (typeElement && typeElement.textContent.trim()) titleButton.textContent = typeElement.textContent.trim();

      titleButton.addEventListener('click', () => this.closePanel());
    }
    if (closeButton) closeButton.addEventListener('click', () => this.closePanel());

    this.fillProduct();

    return true;
  }

  /**
   * Товар в панели: картинка из ---reviews-list--image, название и ссылка из ---reviews-list--name того li, по которому кликнули
   * Звезды — из ---reviews-list--rating: класс __star-NN рисует звезды через ::before, текст — числовая оценка; без рейтинга в li блок из панели убирается
   * Картинка списка может быть еще не догружена lazy.js — тогда адрес берется из lazy-src
   */
  fillProduct() {
    if (!this.panel || !this.item) return;

    const listImage = this.item.querySelector('.---reviews-list--image img');
    const listLink = this.item.querySelector('.---reviews-list--name a');

    const panelImage = this.panel.querySelector('.mobile-right-panel--review--image img');
    const panelImageLink = this.panel.querySelector('.mobile-right-panel--review--image a');
    const panelNameLink = this.panel.querySelector('.mobile-right-panel--review--name a');
    const listRating = this.item.querySelector('.---reviews-list--rating');
    const panelRating = this.panel.querySelector('.mobile-right-panel--review--rating');

    if (listImage && panelImage) {
      panelImage.src = listImage.getAttribute('src') || listImage.getAttribute('lazy-src') || '';
      panelImage.alt = listImage.alt || '';
    }

    if (listLink) {
      if (panelImageLink) panelImageLink.href = listLink.href;
      if (panelNameLink) {
        panelNameLink.href = listLink.href;
        panelNameLink.textContent = listLink.textContent.trim();
      }
    }

    if (panelRating) {
      if (listRating) {
        panelRating.className = 'mobile-right-panel--review--rating';
        listRating.classList.forEach(className => {
          if (className.startsWith('__star-')) panelRating.classList.add(className);
        });
        panelRating.textContent = listRating.textContent.trim();
      } else {
        panelRating.classList.add('__hide');
      }
    }
  }

  /**
   * Картинки, текст, ответ и подпись из ответа getReview
   * images — список адресов, каждый становится li с img; пустой список прячет весь блок картинок через __hide
   * Текст ответа встает перед подписью отдельным текстовым узлом; пустой ответ или подпись прячутся через __hide
   */
  fillReview(reviewData) {
    const images = Array.isArray(reviewData.images) ? reviewData.images.filter(Boolean) : [];

    this.imagesList.textContent = '';
    images.forEach(imageUrl => {
      const item = document.createElement('li');
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      item.appendChild(image);
      this.imagesList.appendChild(item);
    });
    this.imagesElement.classList.toggle('__hide', !images.length);

    this.textElement.textContent = reviewData.text || '';

    const answer = reviewData.answer || '';
    const signature = reviewData.signature || '';

    this.answerElement.textContent = '';
    this.answerElement.appendChild(document.createTextNode(answer));
    this.answerElement.appendChild(this.signatureElement);
    this.answerElement.classList.toggle('__hide', !answer);

    this.signatureElement.textContent = signature;
    this.signatureElement.classList.toggle('__hide', !signature);
  }

  /**
   * Открытие панели по кнопке «Посмотреть целиком» с загрузкой отзыва
   * Повторный клик по той же кнопке закрывает панель, клик по другой — переоткрывает
   */
  async openPanel(item) {
    const sameItem = this.panel && this.item === item;

    if (this.panel) {
      this.closePanel();

      if (sameItem) return;
    }

    closePanelsBeforeAccountPanel();

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    this.item = item;
    this.createPanel();

    this.panel.classList.add('__active');

    const reviewId = item.dataset.reviewId || '';
    const dataRequest = requestAccountUserReview(reviewId).catch(() => ''); // разметка и данные едут параллельно

    let panelFilled = false;
    try {
      panelFilled = await this.fillPanel();
    } catch (_) {
      panelFilled = false;
    }

    if (!this.panel || !panelFilled) return;

    const reviewData = parseAccountAddressResponse(await dataRequest);

    if (!this.panel) return; // панель закрыли, пока шел запрос

    if (!reviewData) {
      const error = document.createElement('div');
      error.className = 'mobile-right-panel--input--description';
      error.textContent = ACCOUNT_CONFIG.reviewLoadError;
      this.contentWrapper.appendChild(error);
      return;
    }

    this.fillReview(reviewData);
  }

  /**
   * Закрытие панели
   */
  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;

    closingPanel.classList.remove('__active');

    this.panel = null;
    this.item = null;
    this.contentWrapper = null;
    this.imagesElement = null;
    this.imagesList = null;
    this.textElement = null;
    this.answerElement = null;
    this.signatureElement = null;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Инициализация панели отзыва
 */
function initAccountReviewPanel() {
  const reviewsList = document.querySelector('.account--info--reviews--list');
  if (!reviewsList) return;

  const reviewPanel = new AccountReviewPanel();

  window.closeAccountReviewPanel = () => reviewPanel.closePanel();

  reviewsList.addEventListener('click', (e) => {
    const button = e.target.closest('.---reviews-list--show-review');
    if (!button) return;

    const item = button.closest('li');
    if (!item) return;

    e.preventDefault();
    e.stopPropagation();

    reviewPanel.openPanel(item);
  });

  document.addEventListener('click', (e) => {
    if (!reviewPanel.panel) return;

    if (!reviewPanel.panel.contains(e.target) && !e.target.closest('.---reviews-list--show-review')) {
      reviewPanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && reviewPanel.panel) {
      e.stopImmediatePropagation();
      reviewPanel.closePanel();
    }
  });
}

/**
 * Account Orders List
 * Клик по заказу в account--info--orders--list ведет на страницу заказа /account/order/{uid}
 * uid берется из data-order-uid того li заказа, по которому кликнули; пустой uid — переход не делается
 * li с классом __blocked не кликабелен — переход не делается
 */
function initAccountOrdersList() {
  document.querySelectorAll('.account--info--orders--list').forEach(ordersList => {
    ordersList.addEventListener('click', (e) => {
      const item = e.target.closest('.account--info--orders--list > ul > li');
      if (!item || item.classList.contains('__blocked')) return;

      const orderUid = (item.dataset.orderUid || '').trim();
      if (!orderUid) return;

      window.location.assign(ACCOUNT_CONFIG.orderPagePath + encodeURIComponent(orderUid));
    });
  });
}

/**
 * Account Logout
 * Выход из аккаунта — так же, как auth-signup--card--authorized--logout:
 * выход делает requestLogout из auth.js, а редирект ядра на /totum мы не отдаем браузеру и уходим сами
 * Корзина в LS очищается всегда — resetLocalCartOnLogout из cart.js (в cart возвращается только гостевая корзина из cart_history)
 * Перед выходом отменяются фоновые getCart из cart.js (abortCartSync) — иначе их поздний ответ перезаписывает очищенный LS.cart
 * Повторные вызовы, пока идет выход, игнорируются
 * Вызывается кнопкой account--info--profile-buttons--logout и header--main--actions--user в режиме __exit (header.js)
 */
let accountLogoutInProgress = false;

async function accountLogout() {
  if (accountLogoutInProgress) return;

  accountLogoutInProgress = true;

  if (typeof window.abortCartSync === 'function') {
    window.abortCartSync();
  }

  if (typeof requestLogout === 'function') {
    await requestLogout();
  }

  if (typeof window.resetLocalCartOnLogout === 'function') {
    window.resetLocalCartOnLogout();
  }

  window.location.assign(ACCOUNT_CONFIG.logoutRedirect);
}

window.accountLogout = accountLogout;

/**
 * Кнопка выхода в кабинете account--info--profile-buttons--logout
 * Блокируется на время запроса и вызывает accountLogout
 */
function initAccountLogout() {
  const logoutButton = document.querySelector('.account--info--profile-buttons--logout');
  if (!logoutButton) return;

  logoutButton.addEventListener('click', () => {
    if (logoutButton.disabled) return; // повторные клики пока идет запрос

    logoutButton.disabled = true;
    accountLogout();
  });
}

document.addEventListener('DOMContentLoaded', initAccountProfilePanel);
document.addEventListener('DOMContentLoaded', initAccountAddressPanel);
document.addEventListener('DOMContentLoaded', initAccountNotificationPanel);
document.addEventListener('DOMContentLoaded', initAccountReviewPanel);
document.addEventListener('DOMContentLoaded', initAccountOrdersList);
document.addEventListener('DOMContentLoaded', initAccountLogout);
