/**
 * Horizontal List Nav
 * Кнопки прокрутки для горизонтальных списков (related products, recent, reviews, comparison)
 * Показывает nav--prev / nav--next если есть элементы за пределами экрана
 */
class HorizontalListNav {
  constructor(listElement) {
    this.list = listElement;
    this.section = listElement.parentElement;

    if (!this.list || !this.section) return;

    this.init();
  }

  init() {
    this.createButtons();
    this.updateButtons();
    this.initScrollTracking();
    this.initResizeTracking();
  }

  createButtons() {
    this.prevButton = document.createElement('button');
    this.prevButton.className = 'nav--prev';
    this.prevButton.type = 'button';
    this.prevButton.setAttribute('aria-label', 'Прокрутить назад');

    this.nextButton = document.createElement('button');
    this.nextButton.className = 'nav--next';
    this.nextButton.type = 'button';
    this.nextButton.setAttribute('aria-label', 'Прокрутить вперёд');

    this.section.appendChild(this.prevButton);
    this.section.appendChild(this.nextButton);

    this.prevButton.addEventListener('click', () => this.scrollPrev());
    this.nextButton.addEventListener('click', () => this.scrollNext());
  }

  updateButtons() {
    const scrollLeft = this.list.scrollLeft;
    const maxScroll = this.list.scrollWidth - this.list.clientWidth;

    if (maxScroll <= 0) {
      this.prevButton.style.display = 'none';
      this.nextButton.style.display = 'none';
      return;
    }

    this.prevButton.style.display = scrollLeft > 5 ? '' : 'none';
    this.nextButton.style.display = scrollLeft < maxScroll - 5 ? '' : 'none';
  }

  scrollPrev() {
    if (isPinchZoomed()) return;
    this.list.scrollBy({ left: -this.list.clientWidth * 0.8, behavior: 'smooth' });
  }

  scrollNext() {
    if (isPinchZoomed()) return;
    this.list.scrollBy({ left: this.list.clientWidth * 0.8, behavior: 'smooth' });
  }

  initScrollTracking() {
    this.list.addEventListener('scroll', () => this.updateButtons(), { passive: true });
  }

  initResizeTracking() {
    ResizeDispatcher.onResizeDebounced(() => this.updateButtons());
  }
}

/**
 * Инициализация навигации горизонтальных списков
 */
function initHorizontalListNav() {
  const selectors = ['.scrollable-line--list', '.reviews--images ul', '.reviews--list', '.comparison--grid'];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(list => {
      new HorizontalListNav(list);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHorizontalListNav);
} else {
  initHorizontalListNav();
}
