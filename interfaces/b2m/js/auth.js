/**
 * Auth
 * Морда авторизации витрины. Работает напрямую с эндпойнтами ядра Тотума:
 *   GET  /Auth/Login          — отдаёт страницу входа; если в сессии реальный пользователь — 302
 *   POST /Auth/Login          — login, pass, [type], [recover]; успех — 302, ошибка — HTML со текстом
 *   GET  /Auth/Verification   — генерирует и отправляет одноразовый код (если включён h_pro_auth_on_off)
 *   POST /Auth/Verification   — login=ok + secret, либо resend=ok
 *   GET  /Auth/Logout         — уничтожает сессию
 *   POST /Auth/OpenId         — method=getOpenIdRedirectData + id; единственный эндпойнт, отдающий JSON
 *
 * Плюс витринный эндпойнт:
 *   GET  /get-endpoints/sendAuthToken?EMAIL=... — отправка ссылки для входа, ответ всегда готовый текст
 *
 * JSON по логину ядро не отдаёт (isAjax в AuthController не выставляется), поэтому ответы
 * разбираются из HTML, а факт успеха определяется по редиректу (fetch с redirect: 'manual').
 */

const AUTH_CONFIG = {
  loginEndpoint: '/Auth/Login',
  verificationEndpoint: '/Auth/Verification',
  logoutEndpoint: '/Auth/Logout',
  openIdEndpoint: '/Auth/OpenId',
  authTokenEndpoint: '/get-endpoints/sendAuthToken',
  defaultRedirect: '/account',
  defaultLogoutRedirect: '/',
  errorParam: 'ERROR',
  messageParam: 'MESSAGE',
  urlTextMaxLength: 120
};

/**
 * Проверка формата Email перед запросом ссылки для входа
 */
const AUTH_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Сообщения ядра, которые по смыслу являются успехом, а не ошибкой
 * Ядро отдаёт их в том же контейнере .panel-danger, поэтому классифицируем по тексту
 */
const AUTH_INFO_MESSAGES = [
  'письмо с новым паролем отправлено',
  'the email with your new password has been sent',
  'an email with a new password has been sent',
  'die e-mail mit ihrem neuen passwort wurde gesendet',
  'новый секретный код',
  'new secret code',
  'neuer geheimer code'
];

/**
 * Тексты ядра, по которым понятно, какое поле подсветить
 */
const AUTH_FIELD_MARKERS = [
  { field: 'login', patterns: ['логин/email', 'login/email', 'login/e-mail'] },
  { field: 'pass', patterns: ['поле пароль', 'enter password', 'passwort eingeben', 'пароль не верен', 'password is incorrect', 'passwort ist falsch'] }
];

/**
 * Transport
 * Тонкая обёртка над fetch для ядровых эндпойнтов
 */

/**
 * Определяет, ответило ли ядро редиректом
 * При redirect: 'manual' тело редиректа недоступно, но сам факт редиректа читается по типу ответа
 */
function isCoreRedirect(response) {
  if (response.type === 'opaqueredirect') {
    return true;
  }
  if (response.redirected === true) {
    return true;
  }
  return response.status >= 300 && response.status < 400;
}

/**
 * GET к ядру без следования за редиректом
 */
function coreGet(url) {
  return fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual'
  });
}

/**
 * POST формы к ядру со следованием за редиректом
 * Ядро при успехе отвечает 302, поэтому конечный адрес читается из response.url,
 * а на шаге второго фактора вместе с редиректом сразу приходит и нужный HTML
 */
function corePost(url, fields) {
  const body = new URLSearchParams();

  Object.keys(fields).forEach(name => {
    if (fields[name] !== null && fields[name] !== undefined && fields[name] !== '') {
      body.set(name, fields[name]);
    }
  });

  return fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: body.toString()
  });
}

/**
 * Относительный путь, если адрес того же origin
 */
function getSameOriginPath(url) {
  try {
    const parsed = new URL(url, window.location.origin);

    if (parsed.origin !== window.location.origin) {
      return '';
    }
    return parsed.pathname + parsed.search;
  } catch (e) {
    return '';
  }
}

/**
 * Куда именно увело ядро после запроса
 */
function classifyAuthUrl(url) {
  const path = getSameOriginPath(url);

  if (!path) {
    return 'target';
  }
  if (path.startsWith(AUTH_CONFIG.verificationEndpoint)) {
    return 'verification';
  }
  if (path.startsWith(AUTH_CONFIG.loginEndpoint)) {
    return 'login';
  }
  return 'target';
}

/**
 * Core Answer Parser
 * Разбор HTML-ответа ядровых страниц /Auth/Login и /Auth/Verification
 */

/**
 * Вытаскивает из ядровой страницы всё, что нужно морде
 */
function parseCoreAnswer(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const messageNode = doc.querySelector('.panel-danger .panel-body');
  const sentNode = doc.querySelector('#sent_message');
  const timeMatch = html.match(/let\s+time\s*=\s*(-?\d+)\s*;/);

  return {
    message: messageNode ? messageNode.textContent.trim() : '',
    codeSent: sentNode ? sentNode.textContent.trim() : '',
    isVerification: Boolean(doc.querySelector('input[name="secret"]')),
    resendSeconds: timeMatch ? parseInt(timeMatch[1], 10) : 0,
    withPassRecover: Boolean(doc.querySelector('#recover')),
    domains: parseCoreDomains(doc),
    openIds: parseCoreOpenIds(doc)
  };
}

/**
 * Список доменов авторизации (LDAP), если селектор включён в настройках
 */
function parseCoreDomains(doc) {
  const options = doc.querySelectorAll('#auth_type_select option');

  return Array.from(options).map(option => ({
    value: option.value,
    title: option.textContent.trim()
  }));
}

/**
 * Список подключённых OpenId-провайдеров
 */
function parseCoreOpenIds(doc) {
  const nodes = doc.querySelectorAll('[onclick^="openIdAuth("]');

  return Array.from(nodes).map(node => {
    const idMatch = (node.getAttribute('onclick') || '').match(/openIdAuth\((\d+)\)/);
    const image = node.querySelector('img');
    const title = node.querySelector('span');

    return {
      id: idMatch ? idMatch[1] : '',
      title: title ? title.textContent.trim() : '',
      image: image ? image.getAttribute('src') : ''
    };
  }).filter(openId => openId.id);
}

/**
 * Относит сообщение ядра к успеху или к ошибке
 */
function classifyCoreMessage(text) {
  const lower = (text || '').toLowerCase();
  const isInfo = AUTH_INFO_MESSAGES.some(pattern => lower.includes(pattern));

  return isInfo ? 'info' : 'error';
}

/**
 * Определяет поле формы, к которому относится сообщение ядра
 */
function detectCoreMessageField(text) {
  const lower = (text || '').toLowerCase();
  const marker = AUTH_FIELD_MARKERS.find(item => item.patterns.some(pattern => lower.includes(pattern)));

  return marker ? marker.field : '';
}

/**
 * Auth Api
 * Сценарии авторизации поверх ядровых эндпойнтов
 */

/**
 * Проверка сессии по куке: реальный пользователь или анонимный webuser
 * Ядро в actionLogin отдаёт 302, если в сессии не webuser, и HTML-страницу входа во всех остальных случаях
 */
async function resolveAuthState() {
  const response = await coreGet(AUTH_CONFIG.loginEndpoint);

  if (isCoreRedirect(response)) {
    return { authorized: true, withPassRecover: false, domains: [], openIds: [] };
  }

  const parsed = parseCoreAnswer(await response.text());

  return {
    authorized: false,
    withPassRecover: parsed.withPassRecover,
    domains: parsed.domains,
    openIds: parsed.openIds
  };
}

/**
 * Вход по логину и паролю
 * Отсутствие редиректа означает ошибку, редирект на /Auth/Verification — включённый второй фактор,
 * любой другой редирект — готовую сессию
 */
async function requestLogin(credentials, redirectTo) {
  const url = AUTH_CONFIG.loginEndpoint + '?from=' + encodeURIComponent(redirectTo);
  const response = await corePost(url, {
    login: credentials.login,
    pass: credentials.pass,
    type: credentials.type
  });
  const parsed = parseCoreAnswer(await response.text());

  if (!response.redirected) {
    return { ok: false, message: parsed.message, field: detectCoreMessageField(parsed.message) };
  }

  const kind = classifyAuthUrl(response.url);

  if (kind === 'verification' || parsed.isVerification) {
    return { ok: true, pending: true, codeSent: parsed.codeSent, resendSeconds: parsed.resendSeconds, message: parsed.message };
  }

  if (kind === 'login') {
    return { ok: false, message: parsed.message, field: detectCoreMessageField(parsed.message) };
  }

  return { ok: true, pending: false, target: getSameOriginPath(response.url) };
}

/**
 * Подтверждение входа одноразовым кодом
 */
async function requestSecret(secret) {
  const response = await corePost(AUTH_CONFIG.verificationEndpoint, { login: 'ok', secret: secret });
  const parsed = parseCoreAnswer(await response.text());

  if (!response.redirected) {
    return { ok: false, pending: parsed.isVerification, message: parsed.message, resendSeconds: parsed.resendSeconds };
  }

  if (classifyAuthUrl(response.url) === 'target') {
    return { ok: true, target: getSameOriginPath(response.url) };
  }

  return { ok: false, pending: false, expired: true, message: parsed.message };
}

/**
 * Повторная отправка одноразового кода
 */
async function requestSecretResend() {
  const response = await corePost(AUTH_CONFIG.verificationEndpoint, { resend: 'ok' });
  const parsed = parseCoreAnswer(await response.text());

  if (response.redirected) {
    return { ok: false, expired: true, message: parsed.message };
  }

  return { ok: true, message: parsed.message || parsed.codeSent, resendSeconds: parsed.resendSeconds };
}

/**
 * Отправка нового пароля на Email
 * Ядро возвращает и успех, и ошибку одним и тем же способом, поэтому классифицируем по тексту
 */
async function requestPassRecover(login) {
  const response = await corePost(AUTH_CONFIG.loginEndpoint, { login: login, recover: '1' });
  const parsed = parseCoreAnswer(await response.text());

  return {
    ok: classifyCoreMessage(parsed.message) === 'info',
    message: parsed.message,
    field: detectCoreMessageField(parsed.message)
  };
}

/**
 * Отправка ссылки для входа на Email
 * Витринный эндпойнт отвечает готовым текстом сообщения, поэтому текст показываем как есть
 */
async function requestAuthToken(email) {
  const params = new URLSearchParams();

  params.set('EMAIL', email);

  const response = await fetch(AUTH_CONFIG.authTokenEndpoint + '?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'text/plain' }
  });

  if (!response.ok) {
    throw new Error('sendAuthToken: ' + response.status);
  }

  return (await response.text()).trim();
}

/**
 * Выход
 * Ядро после logout уводит на /totum, поэтому редирект не отдаём браузеру, а уходим сами
 */
async function requestLogout() {
  try {
    await coreGet(AUTH_CONFIG.logoutEndpoint);
  } catch (e) {
    return false;
  }
  return true;
}

/**
 * Получение адреса редиректа для входа через OpenId
 */
async function requestOpenIdRedirect(openIdId) {
  const response = await fetch(AUTH_CONFIG.openIdEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ method: 'getOpenIdRedirectData', id: openIdId }).toString()
  });

  const json = await response.json();

  return { uri: json.uri || '', message: json.error || '' };
}

/**
 * Auth Page
 * Управление состояниями карточки авторизации
 */
class AuthPage {
  constructor(root) {
    this.root = root;
    this.card = root.querySelector('.auth-signup--card');
    this.message = root.querySelector('.auth-signup--card--message');
    this.loginForm = root.querySelector('.auth-signup--card--login-form');
    this.recoverForm = root.querySelector('.auth-signup--card--recover-form');
    this.secretForm = root.querySelector('.auth-signup--card--secret-form');
    this.authorized = root.querySelector('.auth-signup--card--authorized');
    this.openIdBlock = root.querySelector('.auth-signup--card--openid');
    this.openIdList = root.querySelector('.auth-signup--card--openid--list ul');
    this.domainBlock = root.querySelector('.---login-form--domain');
    this.domainSelect = root.querySelector('#auth-type');
    this.recoverLink = root.querySelector('.---login-form--links--recover');
    this.tokenButton = root.querySelector('.---login-form--email--token');
    this.resendButton = root.querySelector('.---secret-form--links--resend');
    this.resendTimer = null;

    this.steps = {
      login: this.loginForm,
      recover: this.recoverForm,
      secret: this.secretForm,
      authorized: this.authorized
    };

    this.bindForms();
    this.bindInputs();
    this.bindAuthorized();
    this.bindUrlMessageCleanup();
  }

  /**
   * Адрес, куда уходим после успешного входа
   */
  getRedirectTarget() {
    const fromQuery = new URLSearchParams(window.location.search).get('from');
    const fromAttribute = this.root.dataset.authRedirect;

    return sanitizeAuthPath(fromQuery) || sanitizeAuthPath(fromAttribute) || AUTH_CONFIG.defaultRedirect;
  }

  /**
   * Адрес, куда уходим после выхода
   */
  getLogoutTarget() {
    return sanitizeAuthPath(this.root.dataset.authLogoutRedirect) || AUTH_CONFIG.defaultLogoutRedirect;
  }

  /**
   * Показывает один из шагов карточки
   */
  showStep(name) {
    Object.keys(this.steps).forEach(step => {
      if (this.steps[step]) {
        this.steps[step].classList.toggle('__active', step === name);
      }
    });

    this.card.classList.remove('__loading');
    this.root.dataset.authStep = name;

    const focusable = this.steps[name] ? this.steps[name].querySelector('input') : null;

    if (focusable) {
      focusable.focus();
    }
  }

  /**
   * Выводит сообщение над формой
   */
  showMessage(text, type) {
    this.message.textContent = text || '';
    this.message.classList.toggle('__error', Boolean(text) && type === 'error');
    this.message.classList.toggle('__info', Boolean(text) && type === 'info');
  }

  /**
   * Убирает сообщение и подсветку полей
   */
  clearMessage() {
    this.showMessage('', '');
    this.root.querySelectorAll('input.__invalid').forEach(input => input.classList.remove('__invalid'));
  }

  /**
   * Подсвечивает поле, к которому относится ошибка ядра
   */
  markField(form, field) {
    if (!form || !field) {
      return;
    }

    const input = form.querySelector('[name="' + field + '"]');

    if (input) {
      input.classList.add('__invalid');
      input.focus();
    }
  }

  /**
   * Блокирует форму на время запроса
   */
  setBusy(form, isBusy) {
    if (!form) {
      return;
    }

    form.classList.toggle('__busy', isBusy);
    form.querySelectorAll('input, select, button').forEach(node => {
      node.disabled = isBusy;
    });

    if (!isBusy && this.resendButton && form === this.secretForm) {
      this.resendButton.disabled = this.resendTimer !== null;
    }
  }

  /**
   * Отрисовывает селектор домена авторизации
   */
  renderDomains(domains) {
    if (!this.domainBlock || !this.domainSelect || domains.length < 2) {
      return;
    }

    this.domainSelect.innerHTML = '';
    domains.forEach(domain => {
      const option = document.createElement('option');

      option.value = domain.value;
      option.textContent = domain.title;
      this.domainSelect.appendChild(option);
    });

    const saved = localStorage.getItem('bitum_auth_domain');

    if (saved !== null && Array.from(this.domainSelect.options).some(option => option.value === saved)) {
      this.domainSelect.value = saved;
    }

    this.domainBlock.classList.add('__active');
  }

  /**
   * Отрисовывает кнопки внешних провайдеров
   */
  renderOpenIds(openIds) {
    if (!this.openIdBlock || !this.openIdList || !openIds.length) {
      return;
    }

    this.openIdList.innerHTML = '';
    openIds.forEach(openId => {
      const item = document.createElement('li');
      const button = document.createElement('button');

      button.type = 'button';
      button.dataset.openidId = openId.id;
      button.setAttribute('aria-label', openId.title ? 'Войти через ' + openId.title : 'Войти');

      if (openId.image) {
        const image = document.createElement('img');

        image.src = openId.image;
        image.alt = openId.title;
        button.appendChild(image);
      }

      const title = document.createElement('div');

      title.textContent = openId.title || 'Войти';
      button.appendChild(title);

      button.addEventListener('click', () => this.handleOpenId(openId.id, button));

      item.appendChild(button);
      this.openIdList.appendChild(item);
    });

    this.openIdBlock.classList.add('__active');
  }

  /**
   * Скрывает ссылку восстановления, если оно отключено в настройках решения
   */
  renderPassRecover(isEnabled) {
    if (this.recoverLink) {
      this.recoverLink.classList.toggle('__active', Boolean(isEnabled));
    }
  }

  /**
   * Обратный отсчёт до повторной отправки кода
   */
  startResendCountdown(seconds) {
    if (!this.resendButton) {
      return;
    }

    this.stopResendCountdown();

    let left = Number(seconds) || 0;

    if (left <= 0) {
      this.resendButton.disabled = false;
      this.resendButton.textContent = 'Отправить код повторно';
      return;
    }

    const tick = () => {
      this.resendButton.disabled = true;
      this.resendButton.textContent = 'Отправить код повторно через ' + left + ' сек';
      left--;

      if (left < 0) {
        this.stopResendCountdown();
        this.resendButton.disabled = false;
        this.resendButton.textContent = 'Отправить код повторно';
      }
    };

    tick();
    this.resendTimer = setInterval(tick, 1000);
  }

  /**
   * Останавливает обратный отсчёт
   */
  stopResendCountdown() {
    if (this.resendTimer !== null) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }

  /**
   * Обработчики отправки форм
   */
  bindForms() {
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', event => {
        event.preventDefault();
        this.handleLogin();
      });
    }

    if (this.recoverForm) {
      this.recoverForm.addEventListener('submit', event => {
        event.preventDefault();
        this.handleRecover();
      });
    }

    if (this.secretForm) {
      this.secretForm.addEventListener('submit', event => {
        event.preventDefault();
        this.handleSecret();
      });
    }

    if (this.recoverLink) {
      this.recoverLink.addEventListener('click', () => {
        this.clearMessage();
        this.copyLoginValue(this.loginForm, this.recoverForm);
        this.showStep('recover');
      });
    }

    const backLink = this.root.querySelector('.---recover-form--links--back');

    if (backLink) {
      backLink.addEventListener('click', () => {
        this.clearMessage();
        this.copyLoginValue(this.recoverForm, this.loginForm);
        this.showStep('login');
      });
    }

    const cancelLink = this.root.querySelector('.---secret-form--links--cancel');

    if (cancelLink) {
      cancelLink.addEventListener('click', () => this.handleLogout(window.location.pathname));
    }

    if (this.resendButton) {
      this.resendButton.addEventListener('click', () => this.handleResend());
    }

    if (this.tokenButton) {
      this.tokenButton.addEventListener('click', () => this.handleAuthToken());
    }
  }

  /**
   * Кнопки очистки поля и показа пароля
   */
  bindInputs() {
    this.root.querySelectorAll('input').forEach(input => {
      const clearButton = input.parentElement.querySelector('.__clear');

      if (clearButton) {
        const sync = () => clearButton.classList.toggle('__active', input.value.length > 0);

        input.addEventListener('input', sync);
        clearButton.addEventListener('click', () => {
          input.value = '';
          input.classList.remove('__invalid');
          sync();
          input.focus();
        });
        sync();
      }

      input.addEventListener('input', () => input.classList.remove('__invalid'));
    });

    this.root.querySelectorAll('.__reveal').forEach(button => {
      const input = button.parentElement.querySelector('input');

      button.addEventListener('click', () => {
        const isHidden = input.type === 'password';

        input.type = isHidden ? 'text' : 'password';
        button.classList.toggle('__active', isHidden);
        button.innerHTML = isHidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        input.focus();
      });
    });

    if (this.domainSelect) {
      this.domainSelect.addEventListener('change', () => {
        localStorage.setItem('bitum_auth_domain', this.domainSelect.value);
      });
    }
  }

  /**
   * Кнопки состояния «уже авторизован»
   */
  bindAuthorized() {
    const logoutButton = this.root.querySelector('.auth-signup--card--authorized--logout');
    const accountLink = this.root.querySelector('.auth-signup--card--authorized--account');

    if (logoutButton) {
      logoutButton.addEventListener('click', () => this.handleLogout(this.getLogoutTarget(), true));
    }

    if (accountLink) {
      accountLink.href = this.getRedirectTarget();
    }
  }

  /**
   * Сообщение, с которым привели на страницу: /auth?ERROR=текст или /auth?MESSAGE=текст
   * ERROR показывается как ошибка, MESSAGE — как информация, при обоих параметрах выигрывает ERROR
   * Текст из адресной строки считается враждебным: показываем только после отбрасывания
   * всего, чем можно передать ссылку или контакт
   */
  showUrlMessage() {
    const params = new URLSearchParams(window.location.search);
    const error = sanitizeUrlText(params.get(AUTH_CONFIG.errorParam));

    if (error) {
      this.showMessage(error, 'error');
      return;
    }

    const info = sanitizeUrlText(params.get(AUTH_CONFIG.messageParam));

    if (!info) {
      return;
    }

    this.showMessage(info, 'info');
  }

  /**
   * Любое действие на странице снимает ERROR и MESSAGE с адресной строки
   * Само сообщение остаётся на экране, уходят только параметры
   */
  bindUrlMessageCleanup() {
    ['pointerdown', 'keydown', 'submit', 'change'].forEach(eventName => {
      document.addEventListener(eventName, removeUrlMessage, { capture: true, once: true });
    });
  }

  /**
   * Переносит введённый логин между шагами
   */
  copyLoginValue(fromForm, toForm) {
    if (!fromForm || !toForm) {
      return;
    }

    const source = fromForm.querySelector('[name="login"]');
    const target = toForm.querySelector('[name="login"]');

    if (source && target && source.value && !target.value) {
      target.value = source.value;
      const clearButton = target.parentElement.querySelector('.__clear');

      if (clearButton) {
        clearButton.classList.add('__active');
      }
    }
  }

  /**
   * Сценарий входа
   */
  async handleLogin() {
    const login = this.loginForm.querySelector('[name="login"]').value.trim();
    const pass = this.loginForm.querySelector('[name="pass"]').value;
    const type = this.domainSelect && this.domainBlock.classList.contains('__active') ? this.domainSelect.value : '';

    this.clearMessage();

    if (!login) {
      this.showMessage('Укажите Email', 'error');
      this.markField(this.loginForm, 'login');
      return;
    }

    if (!pass) {
      this.showMessage('Укажите пароль', 'error');
      this.markField(this.loginForm, 'pass');
      return;
    }

    this.setBusy(this.loginForm, true);

    try {
      const result = await requestLogin({ login: login, pass: pass, type: type }, this.getRedirectTarget());

      if (!result.ok) {
        this.setBusy(this.loginForm, false);
        this.showMessage(result.message || 'Не удалось войти. Попробуйте ещё раз', 'error');
        this.markField(this.loginForm, result.field);
        return;
      }

      if (result.pending) {
        this.setBusy(this.loginForm, false);
        this.showStep('secret');
        this.showMessage(result.message || result.codeSent || 'Код подтверждения отправлен', result.message ? 'error' : 'info');
        this.startResendCountdown(result.resendSeconds);
        return;
      }

      window.location.assign(sanitizeAuthPath(result.target) || this.getRedirectTarget());
    } catch (e) {
      this.setBusy(this.loginForm, false);
      this.showMessage('Сервис авторизации недоступен. Попробуйте позже', 'error');
    }
  }

  /**
   * Сценарий отправки ссылки для входа на Email
   */
  async handleAuthToken() {
    const login = this.loginForm.querySelector('[name="login"]').value.trim();

    this.clearMessage();

    if (!AUTH_EMAIL_PATTERN.test(login)) {
      this.showMessage('Email указан неверно. Проверьте формат: name@example.com', 'error');
      this.markField(this.loginForm, 'login');
      return;
    }

    this.setBusy(this.loginForm, true);

    try {
      const message = await requestAuthToken(login);

      this.setBusy(this.loginForm, false);
      this.showMessage(message || 'Не удалось отправить ссылку для входа. Попробуйте позже', 'error');
    } catch (e) {
      this.setBusy(this.loginForm, false);
      this.showMessage('Не удалось отправить ссылку для входа. Попробуйте позже', 'error');
    }
  }

  /**
   * Сценарий восстановления пароля
   */
  async handleRecover() {
    const login = this.recoverForm.querySelector('[name="login"]').value.trim();

    this.clearMessage();

    if (!login) {
      this.showMessage('Укажите Email', 'error');
      this.markField(this.recoverForm, 'login');
      return;
    }

    this.setBusy(this.recoverForm, true);

    try {
      const result = await requestPassRecover(login);

      this.setBusy(this.recoverForm, false);
      this.showMessage(result.message || 'Запрос отправлен', result.ok ? 'info' : 'error');

      if (result.ok) {
        this.copyLoginValue(this.recoverForm, this.loginForm);
        this.showStep('login');
      } else {
        this.markField(this.recoverForm, result.field);
      }
    } catch (e) {
      this.setBusy(this.recoverForm, false);
      this.showMessage('Сервис авторизации недоступен. Попробуйте позже', 'error');
    }
  }

  /**
   * Сценарий подтверждения одноразовым кодом
   */
  async handleSecret() {
    const secret = this.secretForm.querySelector('[name="secret"]').value.trim();

    this.clearMessage();

    if (!secret) {
      this.showMessage('Укажите код подтверждения', 'error');
      this.markField(this.secretForm, 'secret');
      return;
    }

    this.setBusy(this.secretForm, true);

    try {
      const result = await requestSecret(secret);

      if (result.ok) {
        this.stopResendCountdown();
        window.location.assign(sanitizeAuthPath(result.target) || this.getRedirectTarget());
        return;
      }

      this.setBusy(this.secretForm, false);

      if (!result.pending) {
        this.stopResendCountdown();
        this.showStep('login');
        this.showMessage(result.message || 'Сессия входа истекла. Введите логин и пароль заново', 'error');
        return;
      }

      this.showMessage(result.message || 'Код не подтверждён', 'error');
      this.markField(this.secretForm, 'secret');
      this.startResendCountdown(result.resendSeconds);
    } catch (e) {
      this.setBusy(this.secretForm, false);
      this.showMessage('Сервис авторизации недоступен. Попробуйте позже', 'error');
    }
  }

  /**
   * Повторная отправка кода
   */
  async handleResend() {
    this.clearMessage();
    this.setBusy(this.secretForm, true);

    try {
      const result = await requestSecretResend();

      this.setBusy(this.secretForm, false);

      if (result.expired) {
        this.stopResendCountdown();
        this.showStep('login');
        this.showMessage(result.message || 'Сессия входа истекла. Введите логин и пароль заново', 'error');
        return;
      }

      this.showMessage(result.message || 'Код отправлен повторно', classifyCoreMessage(result.message));
      this.startResendCountdown(result.resendSeconds);
    } catch (e) {
      this.setBusy(this.secretForm, false);
      this.showMessage('Сервис авторизации недоступен. Попробуйте позже', 'error');
    }
  }

  /**
   * Выход и переход на указанный адрес
   * resetCart — выход авторизованного (auth-signup--card--authorized--logout): отменяются фоновые getCart (abortCartSync)
   * и корзина в LS очищается через resetLocalCartOnLogout из cart.js
   * Отмена 2FA корзину не трогает — вход не состоялся, в LS гостевая корзина
   */
  async handleLogout(redirectTo, resetCart = false) {
    this.stopResendCountdown();

    if (resetCart && typeof window.abortCartSync === 'function') {
      window.abortCartSync();
    }

    await requestLogout();

    if (resetCart && typeof window.resetLocalCartOnLogout === 'function') {
      window.resetLocalCartOnLogout();
    }

    window.location.assign(redirectTo);
  }

  /**
   * Внешний провайдер
   */
  async handleOpenId(openIdId, button) {
    this.clearMessage();
    button.disabled = true;

    try {
      const result = await requestOpenIdRedirect(openIdId);

      if (result.uri) {
        window.location.assign(result.uri);
        return;
      }

      button.disabled = false;
      this.showMessage(result.message || 'Провайдер недоступен', 'error');
    } catch (e) {
      button.disabled = false;
      this.showMessage('Провайдер недоступен', 'error');
    }
  }

  /**
   * Сбрасывает состояния, выставленные на время запроса
   * Нужно при возврате из bfcache: браузер восстанавливает DOM ровно таким, каким он был
   * в момент ухода со страницы, поэтому заблокированные кнопки и формы остаются заблокированными
   */
  resetTransientState() {
    this.stopResendCountdown();
    this.clearMessage();

    Object.keys(this.steps).forEach(step => {
      this.setBusy(this.steps[step], false);
    });

    if (this.openIdList) {
      this.openIdList.querySelectorAll('button').forEach(button => {
        button.disabled = false;
      });
    }

    this.card.classList.add('__loading');
  }

  /**
   * Стартовая проверка сессии
   */
  async start() {
    try {
      const state = await resolveAuthState();

      if (state.authorized) {
        this.root.dataset.authUser = 'authorized';
        this.showStep('authorized');
        this.showUrlMessage();
        return;
      }

      this.root.dataset.authUser = 'anonymous';
      this.renderPassRecover(state.withPassRecover);
      this.renderDomains(state.domains);
      this.renderOpenIds(state.openIds);
      this.showStep('login');
      this.showUrlMessage();
    } catch (e) {
      this.root.dataset.authUser = 'unknown';
      this.showStep('login');
      this.showMessage('Не удалось проверить сессию. Попробуйте войти', 'error');
      this.showUrlMessage();
    }
  }
}

/**
 * Helpers
 */

/**
 * Пропускает только относительные пути того же origin
 */
function sanitizeAuthPath(path) {
  if (!path || typeof path !== 'string') {
    return '';
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '';
  }
  if (path === '/totum' || path.startsWith('/totum/')) {
    return '';
  }
  return path;
}

/**
 * Оставляет в тексте из адресной строки только буквы, пробел и . , !
 * Подчёркивания превращаются в пробелы (invalid_request → invalid request)
 * Цифры, @, +, двоеточия и слеши отбрасываются, поэтому ни ссылку, ни телефон передать нельзя
 */
function sanitizeUrlText(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/_/g, ' ')
    .replace(/[^a-zA-Zа-яА-ЯёЁ .,!]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUTH_CONFIG.urlTextMaxLength)
    .trim();
}

/**
 * Убирает ERROR и MESSAGE из адресной строки, не перезагружая страницу
 */
function removeUrlMessage() {
  const url = new URL(window.location.href);
  const hasError = url.searchParams.has(AUTH_CONFIG.errorParam);
  const hasMessage = url.searchParams.has(AUTH_CONFIG.messageParam);

  if (!hasError && !hasMessage) {
    return;
  }

  url.searchParams.delete(AUTH_CONFIG.errorParam);
  url.searchParams.delete(AUTH_CONFIG.messageParam);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/**
 * Инициализация морды авторизации
 */
function initAuth() {
  const root = document.querySelector('.auth-signup[data-auth-page="auth"]');

  if (!root) {
    return;
  }

  const page = new AuthPage(root);

  window.BitumAuth = {
    page: page,
    resolveAuthState: resolveAuthState,
    requestLogout: requestLogout
  };

  /**
   * Возврат кнопкой «назад» от внешнего провайдера восстанавливает страницу из bfcache
   * без повторного выполнения скриптов, поэтому состояние карточки пересобираем вручную
   */
  window.addEventListener('pageshow', event => {
    if (!event.persisted) {
      return;
    }

    page.resetTransientState();
    page.start();
  });

  page.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
