/**
 * Scroller Component
 * Переключение изображений с анимацией через CSS
 */

class Scroller {
  constructor(element) {
    this.container = element;
    this.items = Array.from(element.querySelectorAll(':scope > ul > li'));
    this.currentIndex = 0;
    this.isAnimating = false;
    this.autoScrollTimer = null;
    
    // Проверяем наличие автоскролла
    this.isAutoScroll = element.classList.contains('__autoscroll');
    
    // Получаем таймер из класса
    this.timerInterval = this.getTimerFromClass();
    
    // Флаги для управления автопрокруткой
    this.isMouseOver = false;
    this.slowIntervalPending = false; // Флаг для увеличенного интервала после клика/свайпа
    this.isHolding = false; // Флаг для отслеживания зажатия мыши/тача
    this.isTouchActive = false; // Флаг для блокировки кликов на тач-устройствах
    this.isInView = null; // Видимость баннера в зоне viewport (+/- 100px), null — ещё не определена
    
    if (this.items.length === 0) return;
    
    // Создаем индикаторы (точки)
    this.initDots();
    
    // Показываем первый элемент
    this.items[0].classList.add('__active');
    
    // Обновляем класс __white_poster для первого слайда
    this.updateWhitePoster(this.items[0]);
    
    // Инициализируем видео в слайдах (если у li есть data-video)
    this.initVideos();
    
    // Инициализируем управление
    this.initControls();
    
    // Останавливаем видео и автоскролл когда баннер вне зоны видимости
    this.initVisibilityObserver();
  }
  
  /**
   * Инициализация видео в слайдах
   * Плееры создаются для li с data-video и/или data-mobile-video (см. video.js).
   * Ресайз, переключение desktop/mobile и pinch-zoom обрабатывает сам плеер.
   * Загрузка ленивая: видео текущего слайда стартует только когда баннер
   * попадает в зону видимости (см. initVisibilityObserver), остальные — при переключении
   */
  initVideos() {
    if (typeof VideoPlayer === 'undefined') {
      this.videoPlayers = [];
      this.hasVideo = false;
      return;
    }
    
    this.videoPlayers = this.items.map((item) => VideoPlayer.create(item));
    this.hasVideo = this.videoPlayers.some((player) => player !== null);
    
    // Без IntersectionObserver зону видимости отследить нечем — грузим сразу
    if (typeof IntersectionObserver === 'undefined') {
      this.isInView = true;
      this.activateVideo(this.currentIndex);
    }
  }
  
  getVideoPlayer(index) {
    if (!this.videoPlayers) return null;
    return this.videoPlayers[index] || null;
  }
  
  activateVideo(index) {
    const player = this.getVideoPlayer(index);
    if (!player) return;
    // Вне зоны видимости видео не грузим и не играем
    if (!this.isInView) return;
    player.activate();
  }
  
  /**
   * Баннер в зоне видимости: первый раз — ленивый старт (загрузка и воспроизведение),
   * дальше — снятие паузы уже активного плеера
   */
  showVideo(index) {
    const player = this.getVideoPlayer(index);
    if (!player) return;
    
    if (player.isActive) {
      player.resume('scroller-visibility');
    } else {
      player.activate();
    }
  }
  
  deactivateVideo(index) {
    const player = this.getVideoPlayer(index);
    if (player) player.deactivate();
  }
  
  suspendVideo(index) {
    const player = this.getVideoPlayer(index);
    if (player) player.suspend('scroller-visibility');
  }
  
  initDots() {
    // Находим контейнер для точек
    this.dotsContainer = this.container.querySelector('.scroller--dots');
    if (!this.dotsContainer) return;
    
    // Если только один слайд - отключаем точки
    if (this.items.length <= 1) {
      this.dotsContainer.classList.add('__disabled');
      return;
    }
    
    // Очищаем контейнер на случай если там что-то есть
    this.dotsContainer.innerHTML = '';
    
    // Создаем точки для каждого слайда
    this.dots = [];
    this.items.forEach((item, index) => {
      const dot = document.createElement('div');
      dot.classList.add('scroller--dots--dot');
      if (index === 0) {
        dot.classList.add('__active');
      }
      this.dotsContainer.appendChild(dot);
      this.dots.push(dot);
    });
  }
  
  updateDots() {
    if (!this.dotsContainer) return;
    
    // Получаем точки напрямую из DOM каждый раз
    const dots = this.dotsContainer.querySelectorAll('.scroller--dots--dot');
    if (dots.length === 0) return;
    
    // Убираем активный класс и __slow со всех точек
    dots.forEach((dot) => {
      dot.classList.remove('__active', '__slow');
    });
    
    // Добавляем активный класс к текущей точке
    if (dots[this.currentIndex]) {
      dots[this.currentIndex].classList.add('__active');
      
      // Если зажата мышь/тач - добавляем __stop
      if (this.isHolding) {
        dots[this.currentIndex].classList.add('__stop');
      }
      // Иначе если мышка над баннером или установлен флаг медленного интервала - добавляем __slow
      else if (this.slowIntervalPending || this.isMouseOver) {
        dots[this.currentIndex].classList.add('__slow');
      }
    }
  }
  
  updateStopClass() {
    if (!this.dotsContainer) return;
    
    const dots = this.dotsContainer.querySelectorAll('.scroller--dots--dot');
    if (dots.length === 0) return;
    
    if (this.isHolding) {
      // Убираем __slow, добавляем __stop
      dots[this.currentIndex]?.classList.remove('__slow');
      dots[this.currentIndex]?.classList.add('__stop');
    } else {
      // Убираем __stop, возвращаем __slow если нужно
      dots[this.currentIndex]?.classList.remove('__stop');
      if (this.slowIntervalPending || this.isMouseOver) {
        dots[this.currentIndex]?.classList.add('__slow');
      }
    }
  }
  
  clearSlowClass() {
    if (!this.dotsContainer) return;
    
    const dots = this.dotsContainer.querySelectorAll('.scroller--dots--dot');
    dots.forEach((dot) => {
      dot.classList.remove('__slow');
    });
  }
  
  clearStopClass() {
    if (!this.dotsContainer) return;
    
    const dots = this.dotsContainer.querySelectorAll('.scroller--dots--dot');
    dots.forEach((dot) => {
      dot.classList.remove('__stop');
    });
  }
  
  getTimerFromClass() {
    // Ищем класс вида __timer_1000
    const timerClass = Array.from(this.container.classList)
      .find(cls => cls.startsWith('__timer_'));
    
    if (timerClass) {
      const match = timerClass.match(/__timer_(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    return 3000; // По умолчанию 3 секунды
  }
  
  initControls() {
    // Курсоры, клики и свайпы подключаем только при наличии нескольких слайдов
    if (this.items.length > 1) {
      this.initCursorControls();
      this.initClickControls();
      this.initTouchControls();
    }
    
    // Автопрокрутка и пауза при зажатии/наведении только при __autoscroll
    if (this.isAutoScroll) {
      this.startAutoScroll();
      this.initAutoScrollControls();
    }
  }
  
  initCursorControls() {
    // Обработчик движения мыши для изменения курсора
    this.currentCursorZone = 'center';
    this.container.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const leftZone = width * 0.3;  // 30% слева
      const rightZone = width * 0.8; // 20% справа (80% от начала)
      
      let newZone = 'center';
      if (x < leftZone) {
        newZone = 'left';
      } else if (x > rightZone) {
        newZone = 'right';
      }
      
      if (newZone !== this.currentCursorZone) {
        this.container.classList.remove('__cursor-left', '__cursor-right');
        if (newZone === 'left') {
          this.container.classList.add('__cursor-left');
        } else if (newZone === 'right') {
          this.container.classList.add('__cursor-right');
        }
        this.currentCursorZone = newZone;
      }
    });
    
    // Очистка курсора при выходе мыши
    this.container.addEventListener('mouseleave', () => {
      this.container.classList.remove('__cursor-left', '__cursor-right');
      this.currentCursorZone = 'center';
    });
  }
  
  initClickControls() {
    // Обработчик кликов (только для мыши, не для тача)
    this.container.addEventListener('click', (e) => {
      // Игнорируем клики от тач-событий
      if (this.isTouchActive) return;
      
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const leftZone = width * 0.2;
      const rightZone = width * 0.8;
      
      if (x < leftZone) {
        this.previous(true);
      } else if (x > rightZone) {
        this.next(true);
      }
    });
  }
  
  initAutoScrollControls() {
    // Пауза при наведении мыши (только десктоп)
    this.container.addEventListener('mouseenter', () => {
      this.isMouseOver = true;
      this.updateDots();
      this.restartAutoScroll();
    });
    
    this.container.addEventListener('mouseleave', () => {
      this.isMouseOver = false;
      
      if (this.isHolding) {
        this.isHolding = false;
        this.updateStopClass();
      }
      
      this.updateDots();
      this.restartAutoScroll();
    });
    
    // Пауза при зажатии мыши
    this.container.addEventListener('mousedown', (e) => {
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const leftZone = width * 0.2;
      const rightZone = width * 0.8;
      
      // Если зажали в центральной области (не в зонах переключения)
      if (x >= leftZone && x <= rightZone) {
        this.isHolding = true;
        this.updateStopClass();
        this.stopAutoScroll();
      }
    });
    
    // Возобновление после отпускания
    this.container.addEventListener('mouseup', (e) => {
      if (this.isHolding) {
        this.isHolding = false;
        this.updateStopClass();
        this.restartAutoScroll();
      }
    });
  }
  
  initTouchControls() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    this.container.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      
      // Блокируем клики от тач-событий
      this.isTouchActive = true;
      
      // Логика паузы только для автоскролла
      if (this.isAutoScroll) {
        this.isMouseOver = false;
        this.isHolding = true;
        this.updateStopClass();
        this.stopAutoScroll();
      }
    }, { passive: true });
    
    this.container.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      
      if (this.isAutoScroll) {
        this.isMouseOver = false;
        this.isHolding = false;
        this.clearStopClass();
      }
      
      // Проверяем был ли свайп
      const wasSwipe = this.handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
      
      // Если не было свайпа - просто продолжаем автопрокрутку
      if (!wasSwipe) {
        this.restartAutoScroll();
      }
      
      // Сбрасываем флаг тача через небольшую задержку (чтобы click не сработал)
      setTimeout(() => {
        this.isTouchActive = false;
      }, 300);
    }, { passive: true });
    
    this.container.addEventListener('touchcancel', (e) => {
      this.isTouchActive = false;
      
      if (this.isAutoScroll) {
        this.isMouseOver = false;
        this.isHolding = false;
        this.clearStopClass();
        this.restartAutoScroll();
      }
    }, { passive: true });
  }
  
  handleSwipe(startX, startY, endX, endY) {
    // Блокируем свайпы во время pinch-zoom (iOS трактует pinch как touch и может дать ложный свайп)
    if (isPinchZoomed()) return false;
    
    const diffX = endX - startX;
    const diffY = endY - startY;
    const minSwipeDistance = 50; // Минимальная дистанция свайпа в пикселях
    
    // Проверяем что это горизонтальный свайп (а не вертикальный)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > minSwipeDistance) {
      if (diffX > 0) {
        // Свайп слева направо - предыдущий слайд
        this.previousSwipe();
      } else {
        // Свайп справа налево - следующий слайд
        this.nextSwipe();
      }
      return true; // Был свайп
    }
    return false; // Не был свайп
  }
  
  // Специальные методы для свайпа
  nextSwipe() {
    if (this.isAnimating) return;
    
    const nextIndex = (this.currentIndex + 1) % this.items.length;
    // Свайп справа налево - новый слайд выезжает справа, старый уезжает влево
    this.animateSlide(this.currentIndex, nextIndex, 'left', true);
    this.currentIndex = nextIndex;
    
    if (this.isAutoScroll) {
      this.slowIntervalPending = true;
    }
    
    this.updateDots();
    
    if (this.isAutoScroll) {
      this.restartAutoScroll(true);
    }
  }
  
  previousSwipe() {
    if (this.isAnimating) return;
    
    const prevIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    // Свайп слева направо - новый слайд выезжает слева, старый уезжает вправо
    this.animateSlide(this.currentIndex, prevIndex, 'right', true);
    this.currentIndex = prevIndex;
    
    if (this.isAutoScroll) {
      this.slowIntervalPending = true;
    }
    
    this.updateDots();
    
    if (this.isAutoScroll) {
      this.restartAutoScroll(true);
    }
  }
  
  startAutoScroll(setSlowInterval = false) {
    this.stopAutoScroll();
    
    // Если запрошен медленный интервал (после клика/свайпа) - сохраняем флаг
    if (setSlowInterval) {
      this.slowIntervalPending = true;
    }
    
    // Определяем интервал для следующей смены
    let interval = this.timerInterval;
    
    // Если мышка над баннером или ожидается медленный интервал - интервал x1.5
    if (this.isMouseOver || this.slowIntervalPending) {
      interval = this.timerInterval * 1.5;
    }
    
    this.autoScrollTimer = setTimeout(() => {
      // Сбрасываем флаг медленного интервала после использования
      if (this.slowIntervalPending) {
        this.slowIntervalPending = false;
        this.clearSlowClass();
      }
      this.next();
      // После смены запускаем следующий цикл
      this.startAutoScroll();
    }, interval);
  }
  
  restartAutoScroll(setSlowInterval = false) {
    if (!this.isAutoScroll) return;
    this.startAutoScroll(setSlowInterval);
  }
  
  stopAutoScroll() {
    if (this.autoScrollTimer) {
      clearTimeout(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
  }
  
  next(isManual = false) {
    if (this.isAnimating) return;
    
    const nextIndex = (this.currentIndex + 1) % this.items.length;
    this.animateSlide(this.currentIndex, nextIndex, 'right', isManual);
    this.currentIndex = nextIndex;
    
    // Если ручное переключение - устанавливаем флаг ДО updateDots
    if (isManual && this.isAutoScroll) {
      this.slowIntervalPending = true;
    }
    
    this.updateDots();
    
    // Перезапускаем таймер
    if (isManual && this.isAutoScroll) {
      this.restartAutoScroll(true);
    }
  }
  
  previous(isManual = false) {
    if (this.isAnimating) return;
    
    const prevIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    this.animateSlide(this.currentIndex, prevIndex, 'left', isManual);
    this.currentIndex = prevIndex;
    
    // Если ручное переключение - устанавливаем флаг ДО updateDots
    if (isManual && this.isAutoScroll) {
      this.slowIntervalPending = true;
    }
    
    this.updateDots();
    
    // Перезапускаем таймер
    if (isManual && this.isAutoScroll) {
      this.restartAutoScroll(true);
    }
  }
  
  animateSlide(fromIndex, toIndex, direction, isFast = false) {
    if (this.isAnimating) return;
    this.isAnimating = true;
    
    const fromItem = this.items[fromIndex];
    const toItem = this.items[toIndex];
    
    // Видео: пауза уходящего, загрузка/старт нового
    this.deactivateVideo(fromIndex);
    this.activateVideo(toIndex);
    
    // Убираем класс active
    fromItem.classList.remove('__active');
    
    // Добавляем классы анимации в зависимости от направления
    if (direction === 'right') {
      fromItem.classList.add('__animating-out-right');
      toItem.classList.add('__animating-in-right');
    } else {
      fromItem.classList.add('__animating-out-left');
      toItem.classList.add('__animating-in-left');
    }
    
    // Добавляем класс __fast для быстрой анимации при ручном переключении
    if (isFast) {
      fromItem.classList.add('__fast');
      toItem.classList.add('__fast');
    }
    
    // Ждем окончания in-анимации (входящий слайд)
    const onAnimationEnd = () => {
      toItem.removeEventListener('animationend', onAnimationEnd);
      this.finishAnimation(fromItem, toItem);
    };
    
    toItem.addEventListener('animationend', onAnimationEnd);
  }
  
  finishAnimation(fromItem, toItem) {
    // Очищаем все классы анимации
    fromItem.classList.remove(
      '__animating-out-right',
      '__animating-out-left',
      '__fast'
    );
    
    // Убираем __white_poster с уходящего слайда
    const fromContent = fromItem.querySelector('.scroller--content');
    if (fromContent) fromContent.classList.remove('__white_poster');
    
    toItem.classList.remove(
      '__animating-in-right',
      '__animating-in-left',
      '__fast'
    );
    
    // Устанавливаем новый активный элемент
    toItem.classList.add('__active');
    
    // Обновляем класс __white_poster
    this.updateWhitePoster(toItem);
    
    this.isAnimating = false;
  }
  
  updateWhitePoster(activeItem) {
    const content = activeItem.querySelector('.scroller--content');
    if (!content) return;
    
    const isWhite = activeItem.dataset.whitePoster === 'true';
    content.classList.toggle('__white_poster', isWhite);
  }
  
  /**
   * Отслеживание видимости баннера через IntersectionObserver.
   * Когда баннер уходит за пределы viewport (+/- 100px по вертикали) — ставим
   * активное видео на паузу и останавливаем автоскролл. При возврате в зону
   * видимости — возобновляем видео и перезапускаем автоскролл.
   * Подписка создаётся только если есть автоскролл или хотя бы одно видео.
   */
  initVisibilityObserver() {
    if (!this.isAutoScroll && !this.hasVideo) return;
    if (typeof IntersectionObserver === 'undefined') return;
    
    this._visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const isInView = entry.isIntersecting;
      if (isInView === this.isInView) return;
      this.isInView = isInView;
      
      if (isInView) {
        this.showVideo(this.currentIndex);
        if (this.isAutoScroll && !this.isHolding) {
          this.restartAutoScroll();
        }
      } else {
        this.suspendVideo(this.currentIndex);
        if (this.isAutoScroll) {
          this.stopAutoScroll();
        }
      }
    }, {
      rootMargin: '100px 0px 100px 0px',
      threshold: 0
    });
    
    this._visibilityObserver.observe(this.container);
  }
  
  destroy() {
    this.stopAutoScroll();
    if (this._visibilityObserver) {
      this._visibilityObserver.disconnect();
      this._visibilityObserver = null;
    }
    if (this.videoPlayers) {
      this.videoPlayers.forEach((player) => {
        if (player) player.destroy();
      });
      this.videoPlayers = [];
    }
  }
}

// Инициализация всех скроллеров на странице
document.addEventListener('DOMContentLoaded', () => {
  const scrollers = document.querySelectorAll('.scroller');
  scrollers.forEach(scroller => {
    new Scroller(scroller);
  });
});
