/**
 * Favorites
 * Избранное витрины
 * Клик по .item--like-button в карточке товара или по .---params--buttons--like-button на странице товара:
 *   /get-endpoints/whoami отдаёт json-список ролей текущего пользователя (["2"] — гость/webuser)
 *   для гостя id товара из data-product-id (.item или main.product) уходит в localStorage.delayed_favorite,
 *   а пользователь — на /auth с сообщением о необходимости авторизации
 *   для авторизованного id проверяется в localStorage.favorites:
 *   при отсутствии отправляется addFavorite и после успеха ставится __active,
 *   при наличии отправляется deleteFavorite и после успеха __active снимается
 *   успех addFavorite/deleteFavorite — валидный json-список, он записывается в localStorage.favorites
 * Клик по .header--main--actions--favorites в шапке:
 *   гость уходит на /auth, авторизованный пользователь — на /favorites
 * На /account авторизованным:
 *   POST /auth-endpoints/user/getFavorites возвращает json-список id товаров для localStorage.favorites
 *   delayed_favorite, которого нет в списке, отправляется POST /auth-endpoints/user/addFavorite (PRODUCT=id)
 *   валидный список из ответа заменяет localStorage.favorites, delayed_favorite удаляется
 * При загрузке и из initScrollers сердечки карточек и страницы товара с id из localStorage.favorites получают __active
 * При выходе localStorage.favorites очищается через resetLocalCartOnLogout из cart.js
 */

const FAVORITES_CONFIG = {
  whoamiEndpoint: '/get-endpoints/whoami',
  getFavoritesEndpoint: '/auth-endpoints/user/getFavorites',
  addFavoriteEndpoint: '/auth-endpoints/user/addFavorite',
  deleteFavoriteEndpoint: '/auth-endpoints/user/deleteFavorite',
  authPath: '/auth',
  favoritesPath: '/favorites',
  accountPath: '/account',
  messageParam: 'MESSAGE',
  guestRole: '2',
  storageKey: 'favorites',
  delayedKey: 'delayed_favorite',
  guestMessage: 'Авторизуйтесь или зарегистрируйтесь, что бы добавлять товары в избранное',
  likeTargets: [
    { container: '.item[data-product-id]', button: '.item--like-button' },
    { container: '.product[data-product-id]', button: '.---params--buttons--like-button' }
  ]
};

const FAVORITES_LIKE_BUTTON_SELECTOR = FAVORITES_CONFIG.likeTargets.map(target => target.button).join(', ');
const FAVORITES_CONTAINER_SELECTOR = FAVORITES_CONFIG.likeTargets.map(target => target.container).join(', ');

/**
 * Whoami
 * Роли текущего пользователя
 */

/**
 * Приводит ответ эндпойнта к массиву строк
 * Ответ может прийти как список ["2"], так и как строка со списком внутри
 */
function parseFavoritesRoles(data) {
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
      return parseFavoritesRoles(JSON.parse(data));
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
async function getFavoritesRoles() {
  const response = await fetch(FAVORITES_CONFIG.whoamiEndpoint, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return parseFavoritesRoles(await response.text());
}

/**
 * Гость ли это — в списке ролей есть роль webuser
 */
function isFavoritesGuest(roles) {
  return roles.includes(FAVORITES_CONFIG.guestRole);
}

/**
 * Favorites Api
 * Запросы избранного авторизованного пользователя
 * abortFavoritesSync вызывается из cart.js перед логаутом
 */

let favoritesSyncController = new AbortController();

function abortFavoritesSync() {
  favoritesSyncController.abort();
  favoritesSyncController = new AbortController();
}

window.abortFavoritesSync = abortFavoritesSync;

/**
 * Получение списка id товаров
 * Ответ — json-список
 */
async function requestGetFavorites() {
  const response = await fetch(FAVORITES_CONFIG.getFavoritesEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Accept': 'application/json' },
    signal: favoritesSyncController.signal
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return (await response.text()).trim();
}

/**
 * Добавление или удаление товара
 * Успех — валидный json-список id, как у getFavorites; другой ответ вызывает ошибку разбора
 */
async function requestFavoriteMutation(endpoint, productId) {
  const params = new URLSearchParams();
  params.set('PRODUCT', productId);

  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: params.toString(),
    signal: favoritesSyncController.signal
  });

  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }

  return parseLocalFavorites((await response.text()).trim());
}

/**
 * Local Storage Favorites
 * Список id товаров хранится json-строкой в localStorage.favorites
 */

/**
 * Разбирает json-список id из ответа эндпойнта или localStorage и приводит id к строкам
 */
function parseLocalFavorites(raw) {
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Favorites response is not a list');
  }

  return parsed.map(id => String(id));
}

function readLocalFavorites() {
  try {
    return parseLocalFavorites(localStorage.getItem(FAVORITES_CONFIG.storageKey) || '[]');
  } catch (e) {
    return [];
  }
}

function writeLocalFavorites(favorites) {
  localStorage.setItem(FAVORITES_CONFIG.storageKey, JSON.stringify(favorites));
}

/**
 * Возвращает true, если id уже есть в списке или addFavorite вернул валидный список
 * В localStorage.favorites записывается список из ответа без локального добавления id
 */
async function addFavoriteToList(productId, favorites) {
  if (favorites.includes(productId)) {
    return true;
  }

  const updatedFavorites = await requestFavoriteMutation(FAVORITES_CONFIG.addFavoriteEndpoint, productId);
  writeLocalFavorites(updatedFavorites);
  return true;
}

/**
 * Возвращает true, если id уже отсутствует или deleteFavorite вернул валидный список
 * В localStorage.favorites записывается список из ответа без локального удаления id
 */
async function deleteFavoriteFromList(productId, favorites) {
  if (!favorites.includes(productId)) {
    return true;
  }

  const updatedFavorites = await requestFavoriteMutation(FAVORITES_CONFIG.deleteFavoriteEndpoint, productId);
  writeLocalFavorites(updatedFavorites);
  return true;
}

/**
 * Очистка при любом выходе через resetLocalCartOnLogout из cart.js
 */
function resetLocalFavoritesOnLogout() {
  try {
    localStorage.removeItem(FAVORITES_CONFIG.storageKey);
  } catch (e) {
    return;
  }
}

window.resetLocalFavoritesOnLogout = resetLocalFavoritesOnLogout;

/**
 * Item Favorites State
 * Проставляет __active сердечкам карточек (.item--like-button) и страницы товара
 * (.---params--buttons--like-button), чьи id есть в localStorage.favorites
 * Вызывается при загрузке страницы и из initScrollers после добавления новых карточек
 */
function syncFavoritesItems(root) {
  const scope = root || document;
  const favoriteIds = new Set(readLocalFavorites());

  FAVORITES_CONFIG.likeTargets.forEach(target => {
    scope.querySelectorAll(target.container).forEach(container => {
      if (!favoriteIds.has(container.getAttribute('data-product-id'))) return;

      const button = container.querySelector(target.button);
      if (button) button.classList.add('__active');
    });
  });
}

window.syncFavoritesItems = syncFavoritesItems;

/**
 * Delayed Favorite
 * Товар, отложенный до авторизации
 */

/**
 * id товара ближайшей карточки или страницы товара, в которой нажата кнопка
 */
function getFavoritesProductId(button) {
  const container = button.closest(FAVORITES_CONTAINER_SELECTOR);

  if (!container) {
    return '';
  }

  return container.getAttribute('data-product-id') || '';
}

/**
 * Сохраняет id товара до авторизации
 */
function saveDelayedFavorite(productId) {
  try {
    localStorage.setItem(FAVORITES_CONFIG.delayedKey, productId);
  } catch (e) {
    return;
  }
}

/**
 * Добавляет отложенный товар после авторизации, если его еще нет в списке
 * При ошибке addFavorite delayed_favorite остается для повторной попытки
 */
async function syncDelayedFavorite(favorites) {
  const productId = localStorage.getItem(FAVORITES_CONFIG.delayedKey);

  if (!productId) {
    return;
  }

  const isSaved = await addFavoriteToList(productId, favorites);

  if (!isSaved) {
    return;
  }

  localStorage.removeItem(FAVORITES_CONFIG.delayedKey);
}

/**
 * Уводит гостя на страницу авторизации с сообщением
 */
function redirectFavoritesToAuth() {
  const params = new URLSearchParams();

  params.set(FAVORITES_CONFIG.messageParam, FAVORITES_CONFIG.guestMessage);
  window.location.assign(FAVORITES_CONFIG.authPath + '?' + params.toString());
}

/**
 * Account Favorites Sync
 * На /account авторизованным заменяет localStorage.favorites ответом getFavorites,
 * затем обрабатывает delayed_favorite
 * Признак авторизации — класс __account_active у header--main--actions--user
 */
async function initAccountFavoritesSync() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path !== FAVORITES_CONFIG.accountPath) return;

  if (!document.querySelector('.header--main--actions--user.__account_active')) return;

  try {
    const favorites = parseLocalFavorites(await requestGetFavorites());
    writeLocalFavorites(favorites);
    await syncDelayedFavorite(favorites);
    syncFavoritesItems();
  } catch (e) {
    return;
  }
}

/**
 * Like Button
 * Обработка клика по кнопке избранного в карточке товара и на странице товара
 */

/**
 * Гость сохраняет delayed_favorite и уходит на авторизацию
 * Авторизованный добавляет отсутствующий или удаляет имеющийся id, затем __active переключается
 */
async function handleFavoritesLikeClick(button) {
  const productId = getFavoritesProductId(button);
  let roles = [];
  let shouldActivate = false;

  try {
    roles = await getFavoritesRoles();
  } catch (e) {
    return;
  }

  if (isFavoritesGuest(roles)) {
    if (productId) {
      saveDelayedFavorite(productId);
    }

    redirectFavoritesToAuth();
    return;
  }

  if (!productId) {
    return;
  }

  try {
    const favorites = readLocalFavorites();
    shouldActivate = !favorites.includes(productId);
    const isSaved = shouldActivate
      ? await addFavoriteToList(productId, favorites)
      : await deleteFavoriteFromList(productId, favorites);

    if (!isSaved) {
      return;
    }
  } catch (e) {
    return;
  }

  button.classList.toggle('__active', shouldActivate);
}

/**
 * Header Favorites
 * Обработка клика по кнопке избранного в шапке
 */

/**
 * Уводит гостя на авторизацию, авторизованного пользователя — на страницу избранного
 */
async function handleFavoritesHeaderClick() {
  let roles = [];

  try {
    roles = await getFavoritesRoles();
  } catch (e) {
    return;
  }

  if (isFavoritesGuest(roles)) {
    redirectFavoritesToAuth();
    return;
  }

  window.location.assign(FAVORITES_CONFIG.favoritesPath);
}

/**
 * Инициализация избранного
 * Обработчики делегированные — карточки приходят и динамически (каталог, поиск, недавние)
 * При загрузке проставляются активные сердечки, на /account запускается синхронизация с сервером
 */
function initFavorites() {
  document.addEventListener('click', (e) => {
    const likeButton = e.target.closest(FAVORITES_LIKE_BUTTON_SELECTOR);

    if (likeButton) {
      e.preventDefault();
      e.stopPropagation();
      handleFavoritesLikeClick(likeButton);
      return;
    }

    const headerButton = e.target.closest('.header--main--actions--favorites button');

    if (!headerButton) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    handleFavoritesHeaderClick();
  });

  syncFavoritesItems();
  initAccountFavoritesSync();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFavorites);
} else {
  initFavorites();
}
