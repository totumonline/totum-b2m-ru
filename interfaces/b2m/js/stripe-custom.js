/**
 * Stripe Custom Item — скрытие кнопок, не влезающих целиком в контейнер
 * Скрывает li целиком если его правый край выходит за границу ul
 */
function hideOverflowingButtons(ul) {
  const items = ul.querySelectorAll('li');
  items.forEach(item => item.style.display = '');
  const ulRight = ul.getBoundingClientRect().right - 30;
  items.forEach(item => {
    if (item.getBoundingClientRect().right > ulRight) {
      item.style.display = 'none';
    }
  });
  if (items.length > 1) {
    const visible = Array.from(items).filter(item => item.style.display !== 'none');
    if (visible.length === 1) {
      visible[0].style.display = 'none';
    }
  }
}

function initStripeCustomButtons() {
  const lists = document.querySelectorAll('.---stripe-custom-item--buttons ul');
  if (!lists.length) return;

  lists.forEach(ul => hideOverflowingButtons(ul));

  let resizeTimer;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      lists.forEach(ul => hideOverflowingButtons(ul));
    }, RESIZE_DEBOUNCE_MS);
  });
  lists.forEach(ul => observer.observe(ul.closest('.---stripe-custom-item--buttons')));
}

/**
 * Stripe Custom Padding
 * Рассчитывает отступы для центрирования контента в .stripe-custom
 * Если контент шире экрана — отступ 20px, если уже — центрируется
 */
function updateStripeCustomPadding(list) {
  const items = Array.from(list.children).filter(el => el.tagName === 'ARTICLE');
  if (!items.length) return;

  const gap = parseFloat(getComputedStyle(list).gap) || 0;
  let contentWidth = 0;
  items.forEach(item => contentWidth += item.offsetWidth);
  contentWidth += gap * (items.length - 1);

  list.style.setProperty('--stripe-content-width', contentWidth + 'px');
}

function initStripeCustomPadding() {
  const lists = document.querySelectorAll('.stripe-custom .scrollable-line--list');
  if (!lists.length) return;

  lists.forEach(list => updateStripeCustomPadding(list));

  let resizeTimer;
  const observer = new ResizeObserver(() => {
    // Пока страница грузится (шрифты, картинки) — обновляем сразу, чтобы не было прыжков
    if (document.readyState !== 'complete') {
      lists.forEach(list => updateStripeCustomPadding(list));
      return;
    }
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      lists.forEach(list => updateStripeCustomPadding(list));
    }, RESIZE_DEBOUNCE_MS);
  });
  lists.forEach(list => observer.observe(list));
}

document.addEventListener('DOMContentLoaded', () => {
  initStripeCustomButtons();
  initStripeCustomPadding();
});
