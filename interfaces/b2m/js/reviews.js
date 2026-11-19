/* Попап с отзывами:
- клик по картинкам reviews--images или по карточкам ---review.__active
  открывает popup.__reviews-mode с двумя колонками: картинка слева, отзыв справа;
- навигация стрелками, клавиатурой и свайпом. */

class ReviewsPopup {
  constructor(section) {
    this.section = section;
    this.popup = null;
    this.popupKeyHandler = null;
    this.images = [];
    this.currentIndex = 0;

    this.init();
  }

  init() {
    this.collectImages();
    if (this.images.length === 0) return;
    this.initImageClicks();
    this.initReviewClicks();
  }

  collectImages() {
    this.section.querySelectorAll('.reviews--images li').forEach(li => {
      const img = li.querySelector('img');
      if (!img) return;
      this.images.push({
        src: img.getAttribute('src') || img.getAttribute('lazy-src'),
        alt: img.getAttribute('alt') || '',
        reviewId: img.getAttribute('data-review-id'),
        element: li
      });
    });
  }

  initImageClicks() {
    this.images.forEach((data, index) => {
      data.element.addEventListener('click', () => this.openPopup(index));
    });
  }

  initReviewClicks() {
    this.section.querySelectorAll('.---review.__active').forEach(article => {
      article.addEventListener('click', () => {
        const reviewId = article.getAttribute('data-review-id');
        const index = this.images.findIndex(img => img.reviewId === reviewId);
        if (index >= 0) {
          this.openPopup(index);
        }
      });
    });
  }

  findReview(reviewId) {
    return this.section.querySelector(`.---review.__active[data-review-id="${reviewId}"]`)
      || this.section.querySelector(`.---review[data-review-id="${reviewId}"]`);
  }

  buildReviewDetail(reviewId) {
    const article = this.findReview(reviewId);
    if (!article) return '';

    const clone = article.cloneNode(true);
    const imgBlock = clone.querySelector('.---review--main--image');
    if (imgBlock) imgBlock.remove();

    const moreLink = clone.querySelector('.---review--more-link');
    if (moreLink) moreLink.remove();

    const text = clone.querySelector('.---review--main--text');
    if (text) text.classList.add('__expanded');

    return clone.innerHTML;
  }

  openPopup(index) {
    if (this.popup) {
      this.popup.remove();
    }

    this.currentIndex = index;
    const data = this.images[index];

    this.popup = document.createElement('div');
    this.popup.className = 'popup __reviews-mode';

    this.popup.innerHTML = `
      <button class="popup--close" aria-label="Закрыть"></button>
      <button class="popup--nav--prev" aria-label="Предыдущее изображение"></button>
      <div class="popup--images--block">
        <div class="popup--review-content">
          <div class="popup--main-image">
            <img src="${data.src}" alt="${data.alt}" class="__cover">
          </div>
          <div class="popup--review-detail">
            ${this.buildReviewDetail(data.reviewId)}
          </div>
        </div>
        <div class="popup--images">
          <ul>
            ${this.images.map((img, i) => {
              const cls = ['__cover'];
              if (i === index) cls.push('__active');
              return `<li><img src="${img.src}" alt="${img.alt}" class="${cls.join(' ')}"></li>`;
            }).join('')}
          </ul>
        </div>
      </div>
      <button class="popup--nav--next" aria-label="Следующее изображение"></button>
    `;

    document.body.appendChild(this.popup);
    document.body.style.overflow = 'hidden';
    this.initPopupHandlers();

    this.popup.classList.add('__visible');
  }

  initPopupHandlers() {
    const closeBtn = this.popup.querySelector('.popup--close');
    const prevBtn = this.popup.querySelector('.popup--nav--prev');
    const nextBtn = this.popup.querySelector('.popup--nav--next');
    const thumbnails = this.popup.querySelectorAll('.popup--images img');

    closeBtn.addEventListener('click', () => this.closePopup());

    this.popupKeyHandler = (e) => {
      if (e.key === 'Escape') {
        this.closePopup();
      } else if (e.key === 'ArrowLeft') {
        this.goPrev();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        this.goNext();
      }
    };
    document.addEventListener('keydown', this.popupKeyHandler);

    this.popup.addEventListener('click', (e) => {
      if (e.target === this.popup) {
        this.closePopup();
      }
    });

    prevBtn.addEventListener('click', () => {
      if (isPinchZoomed()) return;
      this.goPrev();
    });
    nextBtn.addEventListener('click', () => {
      if (isPinchZoomed()) return;
      this.goNext();
    });

    thumbnails.forEach((thumb, i) => {
      thumb.addEventListener('click', () => this.goToImage(i));
    });

    this.initSwipe();
  }

  initSwipe() {
    const target = this.popup.querySelector('.popup--review-content');
    if (!target) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let inScrollable = false;

    target.addEventListener('touchstart', (e) => {
      if (isPinchZoomed()) {
        tracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      inScrollable = !!e.target.closest('.popup--review-detail, .popup--images');
    }, { passive: true });

    target.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;

      // Блокируем свайпы во время pinch-zoom (iOS трактует pinch как touch и может дать ложный свайп)
      if (isPinchZoomed()) return;

      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx >= 40 && absDx >= absDy) {
        // Горизонтальный свайп: влево — следующий, вправо — предыдущий
        if (dx < 0) {
          this.goNext();
        } else {
          this.goPrev();
        }
      } else if (absDy >= 40 && absDy > absDx && !inScrollable) {
        // Вертикальный свайп: вверх — следующий, вниз — предыдущий
        if (dy < 0) {
          this.goNext();
        } else {
          this.goPrev();
        }
      }
    }, { passive: true });
  }

  goPrev() {
    const i = this.currentIndex > 0 ? this.currentIndex - 1 : this.images.length - 1;
    this.goToImage(i);
  }

  goNext() {
    const i = this.currentIndex < this.images.length - 1 ? this.currentIndex + 1 : 0;
    this.goToImage(i);
  }

  goToImage(index) {
    this.currentIndex = index;
    const data = this.images[index];

    const mainImg = this.popup.querySelector('.popup--main-image img');
    mainImg.src = data.src;
    mainImg.alt = data.alt;
    mainImg.className = '__cover';

    const detail = this.popup.querySelector('.popup--review-detail');
    detail.innerHTML = this.buildReviewDetail(data.reviewId);

    this.popup.querySelectorAll('.popup--images img').forEach((thumb, i) => {
      thumb.classList.toggle('__active', i === index);
    });
  }

  closePopup() {
    if (!this.popup) return;

    document.removeEventListener('keydown', this.popupKeyHandler);

    this.popup.classList.remove('__visible');

    setTimeout(() => {
      if (this.popup) {
        this.popup.remove();
        this.popup = null;
      }
      document.body.style.overflow = '';
    }, 300);
  }
}

/* Сворачивание/разворачивание длинных текстов отзывов:
- добавляет ссылку «больше/меньше» к карточкам, текст которых обрезан. */

function initReviewTextToggle() {
  document.querySelectorAll('.---review--main--text').forEach(el => {
    if (el.scrollHeight <= el.clientHeight + 1) {
      el.classList.add('__no-clamp');
      return;
    }

    const link = document.createElement('div');
    link.className = '---review--more-link';
    link.textContent = 'больше';

    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = el.classList.toggle('__expanded');
      link.textContent = expanded ? 'меньше' : 'больше';
    });

    el.closest('.---review').appendChild(link);
  });
}

/* Переключатель вкладок отзывы / вопросы:
- клик по кнопкам reviews--selector--selector-button ставит __active
  на reviews--block или reviews--block.__questions. */

function initReviewsSelector() {
  const section = document.querySelector('.reviews');
  if (!section) return;

  const buttons = section.querySelectorAll('.reviews--selector--selector-button');
  const reviewsBlock = section.querySelector('.reviews--block:not(.__questions)');
  const questionsBlock = section.querySelector('.reviews--block.__questions');

  if (!buttons.length || !reviewsBlock || !questionsBlock) return;

  reviewsBlock.classList.add('__active');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('__active'));
      btn.classList.add('__active');

      if (btn.id === 'reviews') {
        reviewsBlock.classList.add('__active');
        questionsBlock.classList.remove('__active');
      } else {
        questionsBlock.classList.add('__active');
        reviewsBlock.classList.remove('__active');
      }
    });
  });
}

function initReviewsPopup() {
  const section = document.querySelector('.reviews');
  if (section) {
    new ReviewsPopup(section);
  }
}

function initReviews() {
  initReviewsSelector();
  initReviewsPopup();
  initReviewTextToggle();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReviews);
} else {
  initReviews();
}
