/**
 * Subscribe
 * Правая панель «Рассылка», открывается кнопкой footer--newsletter-button,
 * разметка панели берется из fetch/subscribe.html
 *
 *   GET  /get-endpoints/whoami       — json-список ролей текущего пользователя ("2" — гость/webuser)
 *   GET  /get-endpoints/yandexCapcha — публичный ключ Яндекс SmartCaptcha, пустой ответ — капчи нет
 *   POST /post-endpoints/signup      — гостю: регистрация по Email, ответ разбирает requestSignup из signup.js
 *   POST /auth-endpoints/user/getData и /auth-endpoints/user/setData — авторизованному: только флаги email,
 *                                      запросы делают requestAccountUserData и requestAccountUserSetData из account.js
 *
 * Гость видит поле Email, авторизованный — блок «Настройки email»;
 * режим отмечается подклассом __guest или __user на mobile-right-panel--content
 */

const SUBSCRIBE_CONFIG = {
  whoamiEndpoint: '/get-endpoints/whoami',
  capchaEndpoint: '/get-endpoints/yandexCapcha',
  panelTemplateUrl: `/interfaces/${window.interface}/fetch/subscribe.html`,
  guestRole: '2',
  noneValue: '*NONE*', // имя и телефон в setData не редактируются из этой панели
  guestAcceptText: 'Подписаться', // гость оформляет подписку, а не сохраняет настройки
  userAcceptText: 'Применить',
  maxValueLength: 300, // совпадает с лимитом post_guard.php и с maxlength поля шаблона
  loadError: 'Не удалось получить данные подписки',
  emailError: 'Email указан неверно. Проверьте формат: name@example.com',
  signupError: 'Не удалось оформить подписку. Попробуйте еще раз'
};

let subscribeTemplateCache = null;

/**
 * Subscribe Captcha
 * SmartCaptcha сама ищет .smart-captcha только один раз — при загрузке страницы,
 * разметка панели приезжает позже, поэтому виджет создается вручную через smartCaptcha.render
 */

/**
 * Ждет загрузки captcha.js — скрипт подключен с defer и может быть еще не готов
 */
function waitSmartCaptcha(timeout = 10000) {
  return new Promise(resolve => {
    if (window.smartCaptcha) {
      resolve(window.smartCaptcha);
      return;
    }

    const startTime = Date.now();

    const timer = setInterval(() => {
      if (window.smartCaptcha) {
        clearInterval(timer);
        resolve(window.smartCaptcha);
        return;
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

/**
 * Загрузка разметки панели из subscribe.html
 * Кешируется после первого запроса
 */
async function loadSubscribeTemplate() {
  if (!subscribeTemplateCache) {
    const response = await fetch(SUBSCRIBE_CONFIG.panelTemplateUrl);
    subscribeTemplateCache = await response.text();
  }

  return subscribeTemplateCache;
}

/**
 * Subscribe Api
 * Запросы, нужные панели подписки
 */

/**
 * Приводит ответ whoami к массиву строк
 * Ответ может прийти как список ["2"], так и как строка со списком внутри
 */
function parseSubscribeRoles(data) {
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
      return parseSubscribeRoles(JSON.parse(data));
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
 * Публичный ключ SmartCaptcha
 * Ответ — готовая строка ключа, пустая строка означает, что капчи нет
 */
async function requestSubscribeCapchaKey() {
  const response = await fetch(SUBSCRIBE_CONFIG.capchaEndpoint, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'text/plain' }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return (await response.text()).trim();
}

/**
 * Роли текущего пользователя
 */
async function requestSubscribeRoles() {
  const response = await fetch(SUBSCRIBE_CONFIG.whoamiEndpoint, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return parseSubscribeRoles(await response.text());
}

/**
 * Гость ли это — в списке ролей есть роль webuser
 */
function isSubscribeGuest(roles) {
  return roles.includes(SUBSCRIBE_CONFIG.guestRole);
}

/**
 * Адрес входа по токену из письма — по нему уходим
 */
function isSubscribeTokenRedirect(target) {
  return /^\/auth\/token(\/|$)/i.test(target);
}

/**
 * Адрес страницы входа — подписка уже оформлена, показываем галочку
 */
function isSubscribeAuthRedirect(target) {
  return /^\/auth(\/|\?|$)/i.test(target);
}

/**
 * Subscribe Panel
 * Правая панель подписки: разметка из subscribe.html, закрывается по заголовку, close и cansel
 */
class SubscribePanel {
  constructor(triggerButton) {
    this.triggerButton = triggerButton;
    this.panel = null;
    this.contentWrapper = null;
    this.messageBlock = null;
    this.emailInput = null;
    this.notificationsToggle = null;
    this.newsletterToggle = null;
    this.acceptButton = null;
    this.captchaContainer = null;
    this.captchaWidgetId = null;
    this.isGuest = true;
    this.dataLoaded = false;
    this.busy = false;
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
   * Разметка из subscribe.html и привязка обработчиков
   */
  async fillPanel() {
    const template = await loadSubscribeTemplate();

    if (!this.panel) return false;

    this.panel.innerHTML = template;

    this.contentWrapper = this.panel.querySelector('.mobile-right-panel--content');
    this.messageBlock = this.panel.querySelector('#subscribe-message');
    this.emailInput = this.panel.querySelector('#subscribe-email');
    this.notificationsToggle = this.panel.querySelector('#subscribe-notifications');
    this.newsletterToggle = this.panel.querySelector('#subscribe-newsletter');

    if (!this.contentWrapper || !this.messageBlock || !this.emailInput) return false;
    if (!this.notificationsToggle || !this.newsletterToggle) return false;

    const titleButton = this.panel.querySelector('.mobile-right-panel--header--title');
    const closeButton = this.panel.querySelector('.mobile-right-panel--close');
    const canselButton = this.panel.querySelector('.mobile-right-panel--cansel');
    const acceptButton = this.panel.querySelector('.mobile-right-panel--accept');
    const doneButton = this.panel.querySelector('.mobile-right-panel--close-button');

    if (titleButton) titleButton.addEventListener('click', () => this.closePanel());
    if (closeButton) closeButton.addEventListener('click', () => this.closePanel());
    if (canselButton) canselButton.addEventListener('click', () => this.closePanel()); // cansel закрывает панель без сохранения
    if (acceptButton) acceptButton.addEventListener('click', () => this.acceptPanel());
    if (doneButton) doneButton.addEventListener('click', () => this.closePanel());

    this.acceptButton = acceptButton;

    this.emailInput.addEventListener('input', () => {
      this.emailInput.classList.remove('__invalid'); // правка снимает отметку ошибки
      this.showMessage('', '');
    });

    this.panel.querySelectorAll('.mobile-right-panel--toggle').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('__checked'));
    });

    this.captchaContainer = this.panel.querySelector('.smart-captcha');

    if (this.captchaContainer) {
      this.captchaContainer.dataset.sitekey = ''; // до ответа эндпойнта ключа нет, шаблон подмены в разметке не оставляем
    }

    return true;
  }

  /**
   * Виджет SmartCaptcha в разметке панели
   * Ключ приезжает с эндпойнта, пустой ключ — капчи нет, контейнер прячет css
   */
  async renderCaptcha(sitekey) {
    if (!this.captchaContainer || !sitekey) return;

    this.captchaContainer.dataset.sitekey = sitekey;

    const container = this.captchaContainer;
    const smartCaptcha = await waitSmartCaptcha();

    if (!smartCaptcha || !this.panel || !this.panel.contains(container)) return;
    if (this.captchaWidgetId !== null) return;

    this.captchaWidgetId = smartCaptcha.render(container, {
      sitekey: sitekey,
      hl: 'ru'
    });
  }

  /**
   * Токен пройденной проверки, пустая строка — проверка не пройдена
   */
  getCaptchaToken() {
    if (this.captchaWidgetId === null || !window.smartCaptcha) return '';

    return window.smartCaptcha.getResponse(this.captchaWidgetId) || '';
  }

  /**
   * Сброс виджета после отправки токена на бек
   * Токен одноразовый — без сброса getResponse отдаст его же, и бек ответит token has already been used
   */
  resetCaptcha() {
    if (this.captchaWidgetId === null || !window.smartCaptcha) return;

    window.smartCaptcha.reset(this.captchaWidgetId);
  }

  /**
   * Снос виджета при закрытии панели
   */
  destroyCaptcha() {
    if (this.captchaWidgetId !== null && window.smartCaptcha) {
      window.smartCaptcha.destroy(this.captchaWidgetId);
    }

    this.captchaWidgetId = null;
    this.captchaContainer = null;
  }

  /**
   * Режим панели: гостю показываем Email, авторизованному — настройки email
   */
  setMode(isGuest) {
    this.isGuest = isGuest;

    this.contentWrapper.classList.toggle('__guest', isGuest);
    this.contentWrapper.classList.toggle('__user', !isGuest);

    if (this.acceptButton) {
      this.acceptButton.textContent = isGuest ? SUBSCRIBE_CONFIG.guestAcceptText : SUBSCRIBE_CONFIG.userAcceptText;
    }
  }

  /**
   * Сообщение над полем Email
   */
  showMessage(text, type) {
    if (!this.messageBlock) return;

    this.messageBlock.textContent = text || '';
    this.messageBlock.classList.toggle('__error', Boolean(text) && type === 'error');
    this.messageBlock.classList.toggle('__info', Boolean(text) && type === 'info');
  }

  /**
   * Подписка оформлена: вместо полей галочка по центру, вместо кнопок — одна «Закрыть»
   */
  showDone() {
    if (!this.panel) return;

    this.showMessage('', '');
    this.panel.classList.add('__done');
  }

  /**
   * Блокирует кнопки панели на время запроса
   */
  setBusy(isBusy) {
    this.busy = isBusy;

    if (!this.panel) return;

    this.panel.querySelectorAll('.mobile-right-panel--accept, .mobile-right-panel--cansel').forEach(button => {
      button.disabled = isBusy;
    });
  }

  /**
   * Открытие панели: разметка и роли едут параллельно, данные профиля — только авторизованному
   */
  async openPanel() {
    if (this.panel) {
      this.closePanel();
      return;
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

    if (typeof window.closeAccountProfilePanel === 'function') {
      window.closeAccountProfilePanel();
    }

    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }

    if (typeof window.closeMobileCartPanel === 'function') {
      window.closeMobileCartPanel();
    }

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом

    this.createPanel();

    this.panel.classList.add('__active');

    const rolesRequest = requestSubscribeRoles().catch(() => null);
    const capchaKeyRequest = requestSubscribeCapchaKey().catch(() => ''); // ключ не пришел — считаем, что капчи нет

    let panelFilled = false;
    try {
      panelFilled = await this.fillPanel();
    } catch (_) {
      panelFilled = false;
    }

    if (!this.panel || !panelFilled) return;

    const roles = await rolesRequest;

    if (!this.panel) return;

    if (!roles) {
      this.setMode(true); // роли не пришли — предлагаем подписаться по Email
      this.showMessage(SUBSCRIBE_CONFIG.loadError, 'error');
      return;
    }

    this.setMode(isSubscribeGuest(roles));

    if (this.isGuest) {
      this.renderCaptcha(await capchaKeyRequest); // капча нужна только гостю — он оформляет подписку через регистрацию
      this.dataLoaded = true;
      return;
    }

    await this.loadUserData();
  }

  /**
   * Флаги email авторизованного пользователя
   */
  async loadUserData() {
    let userData = null;

    try {
      userData = JSON.parse(await requestAccountUserData());
    } catch (_) {
      userData = null;
    }

    if (!this.panel) return;

    if (!userData) {
      this.showMessage(SUBSCRIBE_CONFIG.loadError, 'error');
      return;
    }

    this.notificationsToggle.classList.toggle('__checked', isAccountFlagOn(userData.h_notifications));
    this.newsletterToggle.classList.toggle('__checked', isAccountFlagOn(userData.h_newsletter));

    this.dataLoaded = true;
  }

  /**
   * Кнопка «Применить»
   */
  acceptPanel() {
    if (!this.panel || this.busy) return;

    if (this.isGuest) {
      this.signup();
      return;
    }

    this.saveAndClosePanel();
  }

  /**
   * Подписка гостя через регистрацию
   * Ответ с redirect на токен уводит в кабинет, redirect на вход показывает галочку успешной подписки,
   * ответ без redirect — текст ошибки над полем Email
   */
  async signup() {
    const email = this.emailInput.value.trim();

    this.showMessage('', '');
    this.emailInput.classList.remove('__invalid');

    if (!SIGNUP_EMAIL_PATTERN.test(email) || email.length > SUBSCRIBE_CONFIG.maxValueLength) {
      this.emailInput.classList.add('__invalid');
      this.emailInput.focus();
      this.showMessage(SUBSCRIBE_CONFIG.emailError, 'error');
      return;
    }

    this.setBusy(true);

    let result = null;
    try {
      result = await requestSignup(email, '', this.getCaptchaToken()); // без пароля — вход по ссылке из письма
    } catch (_) {
      result = null;
    }

    this.resetCaptcha(); // отправленный токен уже использован, для повторной попытки нужна новая проверка

    if (!this.panel) return;

    this.setBusy(false);

    if (!result) {
      this.showMessage(SUBSCRIBE_CONFIG.signupError, 'error');
      return;
    }

    if (!result.ok || !result.target) {
      this.showMessage(result.message || SUBSCRIBE_CONFIG.signupError, 'error');
      return;
    }

    if (isSubscribeTokenRedirect(result.target)) {
      window.location.assign(result.target);
      return;
    }

    if (isSubscribeAuthRedirect(result.target)) {
      this.showDone(); // подписка уже оформлена, уходить со страницы некуда
      return;
    }

    window.location.assign(result.target);
  }

  /**
   * Сохранение флагов email и закрытие: закрываем сразу, запрос уходит в фоне
   * Имя и телефон этой панелью не редактируются, поэтому уходят как *NONE*
   */
  saveAndClosePanel() {
    if (!this.panel) return;

    if (this.dataLoaded) {
      const notifications = this.notificationsToggle.classList.contains('__checked');
      const newsletter = this.newsletterToggle.classList.contains('__checked');

      requestAccountUserSetData(SUBSCRIBE_CONFIG.noneValue, SUBSCRIBE_CONFIG.noneValue, '', notifications, newsletter)
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

    this.destroyCaptcha();

    this.panel = null;
    this.contentWrapper = null;
    this.messageBlock = null;
    this.emailInput = null;
    this.notificationsToggle = null;
    this.newsletterToggle = null;
    this.acceptButton = null;
    this.dataLoaded = false;
    this.busy = false;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Инициализация панели подписки
 */
function initSubscribePanel() {
  const newsletterButton = document.querySelector('.footer--newsletter-button');
  if (!newsletterButton) return;

  const subscribePanel = new SubscribePanel(newsletterButton);

  window.closeSubscribePanel = () => subscribePanel.closePanel();

  newsletterButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    subscribePanel.openPanel();
  });

  document.addEventListener('click', (e) => {
    if (!subscribePanel.panel) return;

    if (!subscribePanel.panel.contains(e.target) && !e.target.closest('.footer--newsletter-button')) {
      subscribePanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && subscribePanel.panel) {
      e.stopImmediatePropagation();
      subscribePanel.closePanel();
    }
  });
}

document.addEventListener('DOMContentLoaded', initSubscribePanel);
