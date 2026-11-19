/**
 * Signup
 * Морда регистрации витрины:
 *   POST /post-endpoints/signup — EMAIL, PASSWORD и CAPCHA (токен SmartCaptcha); всегда отвечает текстом:
 *                                 'redirect: /путь' — регистрация прошла, уводим по адресу,
 *                                 любой другой текст — ошибка, показываем её как есть
 *   GET  /Auth/Login             — HTML-страница входа, из неё берём список подключённых OpenId-провайдеров
 *   POST /Auth/OpenId            — method=getOpenIdRedirectData + id; отдаёт JSON с адресом редиректа
 *
 * Если на корневом элементе стоит __token_auth, пароль при регистрации не запрашивается
 * и PASSWORD не отправляется: вход в кабинет идёт по ссылке, отправленной на Email.
 */

const SIGNUP_CONFIG = {
  signupEndpoint: '/post-endpoints/signup',
  loginEndpoint: '/Auth/Login',
  openIdEndpoint: '/Auth/OpenId',
  redirectPrefix: 'redirect:'
};

/**
 * Проверка формата Email перед регистрацией
 */
const SIGNUP_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Токен SmartCaptcha со страницы регистрации
 * На странице виджет рендерится сам и кладет токен в скрытое поле smart-token
 */
function getSignupCapchaToken() {
  const tokenField = document.querySelector('.smart-captcha input[name="smart-token"]');

  return tokenField ? tokenField.value : '';
}

/**
 * Сброс виджета после отправки токена на бек
 * Токен одноразовый — без сброса в поле останется старое значение, и бек ответит token has already been used
 * Виджет рендерится сам, его id неизвестен — reset без id сбрасывает единственный виджет страницы
 */
function resetSignupCapcha() {
  if (!window.smartCaptcha) return;

  window.smartCaptcha.reset();
}

/**
 * Signup Api
 * Запросы к ядровым эндпойнтам, нужные странице регистрации
 */

/**
 * Регистрация
 * Ответ всегда текст: с префиксом redirect: — адрес перехода, без него — текст ошибки
 */
async function requestSignup(email, password, capchaToken) {
  const params = new URLSearchParams();

  params.set('EMAIL', email);

  if (password) {
    params.set('PASSWORD', password);
  }

  if (capchaToken) {
    params.set('CAPCHA', capchaToken); // одноразовый токен, его проверяет темплет на сервере
  }

  const response = await fetch(SIGNUP_CONFIG.signupEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Accept': 'text/plain' },
    body: params.toString()
  });

  const answer = (await response.text()).trim();

  if (!answer.startsWith(SIGNUP_CONFIG.redirectPrefix)) {
    return { ok: false, message: answer };
  }

  return { ok: true, target: sanitizeSignupRedirect(answer.slice(SIGNUP_CONFIG.redirectPrefix.length).trim()) };
}

/**
 * Список подключённых OpenId-провайдеров с ядровой страницы входа
 * Авторизованному пользователю ядро отдаёт редирект — тогда провайдеров нет
 */
async function requestSignupOpenIds() {
  const response = await fetch(SIGNUP_CONFIG.loginEndpoint, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual'
  });

  if (response.type === 'opaqueredirect' || response.redirected === true || (response.status >= 300 && response.status < 400)) {
    return [];
  }

  return parseSignupOpenIds(await response.text());
}

/**
 * Разбор кнопок внешних провайдеров из ядровой страницы входа
 */
function parseSignupOpenIds(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
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
 * Получение адреса редиректа для входа через OpenId
 */
async function requestSignupOpenIdRedirect(openIdId) {
  const response = await fetch(SIGNUP_CONFIG.openIdEndpoint, {
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
 * Signup Page
 * Управление карточкой регистрации
 */
class SignupPage {
  constructor(root) {
    this.root = root;
    this.message = root.querySelector('.auth-signup--card--message');
    this.signupForm = root.querySelector('.auth-signup--card--signup-form');
    this.openIdBlock = root.querySelector('.auth-signup--card--openid');
    this.openIdList = root.querySelector('.auth-signup--card--openid--list ul');

    this.bindForm();
    this.bindInputs();
  }

  /**
   * Нужен ли пароль при регистрации
   */
  isTokenAuth() {
    return this.root.classList.contains('__token_auth');
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
   * Подсвечивает поле с ошибкой
   */
  markField(field) {
    const input = this.signupForm.querySelector('[name="' + field + '"]');

    if (input) {
      input.classList.add('__invalid');
      input.focus();
    }
  }

  /**
   * Блокирует форму на время запроса
   */
  setBusy(isBusy) {
    this.signupForm.classList.toggle('__busy', isBusy);
    this.signupForm.querySelectorAll('input, button').forEach(node => {
      node.disabled = isBusy;
    });
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
   * Обработчик отправки формы
   */
  bindForm() {
    if (!this.signupForm) {
      return;
    }

    this.signupForm.addEventListener('submit', event => {
      event.preventDefault();
      this.handleSignup();
    });
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
  }

  /**
   * Сценарий регистрации
   */
  async handleSignup() {
    const login = this.signupForm.querySelector('[name="login"]').value.trim();
    const pass = this.isTokenAuth() ? '' : this.signupForm.querySelector('[name="pass"]').value;

    this.clearMessage();

    if (!SIGNUP_EMAIL_PATTERN.test(login)) {
      this.showMessage('Email указан неверно. Проверьте формат: name@example.com', 'error');
      this.markField('login');
      return;
    }

    if (!this.isTokenAuth() && !pass) {
      this.showMessage('Укажите пароль', 'error');
      this.markField('pass');
      return;
    }

    this.setBusy(true);

    try {
      const result = await requestSignup(login, pass, getSignupCapchaToken());

      resetSignupCapcha(); // отправленный токен уже использован, для повторной попытки нужна новая проверка

      if (result.ok && result.target) {
        window.location.assign(result.target);
        return;
      }

      this.setBusy(false);
      this.showMessage(result.message || 'Не удалось завершить регистрацию. Попробуйте ещё раз', 'error');
    } catch (e) {
      resetSignupCapcha(); // запрос мог дойти до бека, поэтому токен считаем использованным
      this.setBusy(false);
      this.showMessage('Не удалось отправить запрос. Попробуйте ещё раз', 'error');
    }
  }

  /**
   * Внешний провайдер
   */
  async handleOpenId(openIdId, button) {
    this.clearMessage();
    button.disabled = true;

    try {
      const result = await requestSignupOpenIdRedirect(openIdId);

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
   * в момент ухода со страницы, поэтому заблокированные кнопки остаются заблокированными
   */
  resetTransientState() {
    this.clearMessage();
    this.setBusy(false);

    if (this.openIdList) {
      this.openIdList.querySelectorAll('button').forEach(button => {
        button.disabled = false;
      });
    }
  }

  /**
   * Стартовая загрузка провайдеров
   */
  async start() {
    try {
      this.renderOpenIds(await requestSignupOpenIds());
    } catch (e) {
      this.openIdBlock.classList.remove('__active');
    }
  }
}

/**
 * Helpers
 */

/**
 * Пропускает только относительные пути того же origin
 * Ответ эндпойнта — текст, поэтому адрес из него проверяем так же, как параметры адресной строки
 */
function sanitizeSignupRedirect(path) {
  if (!path || typeof path !== 'string') {
    return '';
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '';
  }
  return path;
}

/**
 * Инициализация морды регистрации
 */
function initSignup() {
  const root = document.querySelector('.auth-signup[data-auth-page="signup"]');

  if (!root) {
    return;
  }

  const page = new SignupPage(root);

  window.BitumSignup = {
    page: page
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
  document.addEventListener('DOMContentLoaded', initSignup);
} else {
  initSignup();
}
