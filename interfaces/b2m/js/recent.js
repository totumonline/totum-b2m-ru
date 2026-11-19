/**
 * Recent Products Section
 * Скрывает секцию .recent если в localStorage нет недавно просмотренных товаров
 */

/**
 * Возвращает массив id недавно просмотренных товаров из localStorage
 */
function getRecentIds() {
  const raw = localStorage.getItem('recent');
  if (!raw) return [];

  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Проверяет наличие недавно просмотренных товаров в localStorage
 */
function hasRecentItems() {
  return getRecentIds().length > 0;
}

/**
 * Запрашивает карточки недавно просмотренных товаров с /get-endpoints/getRecentItems
 * и подменяет содержимое .scrollable-line--list внутри секции .recent
 */
function loadRecentItems(section) {
  const ids = getRecentIds();
  if (ids.length === 0) return;

  const list = section.querySelector('.scrollable-line--list');
  if (!list) return;

  const params = new URLSearchParams();
  params.set('LIST', ids.join(','));

  fetch('/get-endpoints/getRecentItems?' + params.toString(), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { 'Accept': 'text/html' }
  })
    .then((response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    })
    .then((html) => {
      const temp = document.createElement('div');
      temp.innerHTML = html.trim();

      list.innerHTML = '';
      Array.from(temp.childNodes).forEach((node) => list.appendChild(node));

      // Реинициализация ресурсов новых карточек, скоупим в list:
      // - .item--scroller (lazy-картинки + превью + точки) — initScrollers
      // - img[lazy-src] вне скроллеров — initLazyLoad
      // - .item--buy-button → __mobile-button на тач-устройствах
      if (typeof window.initScrollers === 'function') {
        window.initScrollers(list);
      }
      if (typeof window.initLazyLoad === 'function') {
        window.initLazyLoad(list);
      }
      if (typeof window.applyMobileButtonClass === 'function') {
        window.applyMobileButtonClass(list);
      }
    })
    .catch(() => {});
}

/**
 * Показывает секцию с fade-in анимацией:
 * 1. Убираем __hidden (display:none -> элемент в потоке)
 * 2. Добавляем __visible — @starting-style задает начальный opacity 0 для transition
 */
function showRecentSection(section) {
  section.classList.remove('__hidden');
  section.classList.add('__visible');
}

/**
 * Скрывает секцию: если уже видима — fade-out и потом display:none, иначе сразу
 */
function hideRecentSection(section) {
  if (!section.classList.contains('__visible')) {
    section.classList.add('__hidden');
    return;
  }

  section.classList.remove('__visible');

  const onTransitionEnd = (e) => {
    if (e.target !== section || e.propertyName !== 'opacity') return;
    section.classList.add('__hidden');
    section.removeEventListener('transitionend', onTransitionEnd);
  };

  section.addEventListener('transitionend', onTransitionEnd);
}

/**
 * Применяет состояние видимости к секции .recent
 */
function updateRecentSectionVisibility() {
  const section = document.querySelector('.recent');
  if (!section) return;

  if (hasRecentItems()) {
    loadRecentItems(section);
    showRecentSection(section);
  } else {
    hideRecentSection(section);
  }
}

/**
 * Инициализация секции недавно просмотренных
 */
function initRecentSection() {
  updateRecentSectionVisibility();

  window.addEventListener('storage', (e) => {
    if (e.key === 'recent') updateRecentSectionVisibility();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRecentSection);
} else {
  initRecentSection();
}
