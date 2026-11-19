/**
 * Product Image Gallery Component
 * Синхронизирует активную картинку в главной галерее с миниатюрами
 * Позволяет переключать картинки кликом на миниатюры
 */

class ProductImageGallery {
  constructor(element) {
    this.container = element;
    this.mainImageList = element.querySelector('.---large-image--main-image ul');
    this.thumbnails = Array.from(element.querySelectorAll('.---large-image--images img'));
    this.mainImages = Array.from(element.querySelectorAll('.---large-image--main-image li'));
    this.prevButton = element.querySelector('.---large-image--nav--prev');
    this.nextButton = element.querySelector('.---large-image--nav--next');
    this.panelButton = element.querySelector('.---large-image--panel--button');
    this.currentIndex = 0;
    this.popup = null;
    this.popupCurrentIndex = 0;
    this.navHintDismissed = false;
    this.navTapTimer = null;
    
    // Видео элементы
    this.videoThumbnails = Array.from(element.querySelectorAll('.---large-image--video li'));
    this.videoIframes = Array.from(element.querySelectorAll('.---large-image--video--iframe li'));
    this.mobileVideoPanel = null;
    this.mobileVideoPanelClickHandler = null;
    
    // Очередь видео в главной галерее (li с непустым data-video)
    this.mainVideoQueue = null;
    // Режим, в котором создана очередь: true — все картинки сразу, false — карусель
    this.mainVideosShowAll = null;
    // Слушатели play / pause для __paused (снимаются при пересоздании очереди)
    this.mainVideoPausedListeners = [];
    // Отписка от ResizeDispatcher (initMainVideosResize)
    this.mainVideosResizeUnsubscribe = null;
    
    if (!this.mainImageList || this.thumbnails.length === 0 || this.mainImages.length === 0) {
      return;
    }
    
    this.init();
  }
  
  init() {
    // Инициализируем обработчики событий
    this.initScrollTracking();
    this.initThumbnailClicks();
    this.initNavButtons();
    this.initPanelButton();
    this.initClickOutside();
    this.initMainImageClick();
    this.initVideoClicks();
    this.initNavTap();
    this.initMainVideos();
    this.initMainVideosResize();
    
    // Устанавливаем начальное состояние
    this.updateActiveImage();
    this.showNavHint();
  }
  
  /**
   * Видео в главной галерее
   * У li может быть непустой data-video — тогда поверх картинки играет видео.
   * Одновременно играет только одно (см. VideoQueue в video.js):
   * в карусели это долистанный слайд.
   * preloadAll — грузим все видео товара последовательно сразу после загрузки
   * страницы, чтобы долистанный слайд играл без ожидания.
   * ignoreVisibility — в режиме __spv (шире 860px все картинки показаны сразу)
   * видео крутятся общим лупом по всей галерее, без привязки к зоне видимости.
   * В карусели (без __spv или __spv при 860px и меньше) на li с видео на паузе
   * ставится __paused (см. initMainVideoPausedState).
   * root — список карусели: листание слайдов отслеживается внутри него, а прокрутка
   * страницы только приостанавливает видео, при возврате оно продолжается с места остановки.
   * При смене режима на ресайзе очередь пересоздаётся (см. initMainVideosResize)
   */
  initMainVideos() {
    if (typeof VideoQueue === 'undefined') return;
    
    const showsAllImages = this.isMainVideosShowAll();
    this.mainVideosShowAll = showsAllImages;
    
    this.mainVideoQueue = VideoQueue.create(this.mainImages, {
      preloadAll: true,
      ignoreVisibility: showsAllImages,
      carousel: !showsAllImages,
      root: this.mainImageList
    });
    
    if (this.mainVideoQueue && !showsAllImages) {
      this.initMainVideoPausedState();
    }
  }
  
  /**
   * Класс __paused на li, пока его активное видео стоит на паузе (в CSS — значок play).
   * Медиасобытия не всплывают, поэтому слушаем их на li в фазе перехвата.
   * Остановка на конце ролика паузой не считается — очередь сразу запускает его снова
   */
  initMainVideoPausedState() {
    this.mainVideoQueue.players.forEach((player) => {
      const li = player.element;
      const sync = () => {
        const video = player.getVideo();
        li.classList.toggle('__paused', !!video && video.paused && !video.ended);
      };
      
      li.addEventListener('play', sync, true);
      li.addEventListener('pause', sync, true);
      this.mainVideoPausedListeners.push({ li, sync });
    });
  }
  
  /**
   * Режим галереи: true — все картинки показаны сразу (__spv шире 860px),
   * false — карусель
   */
  isMainVideosShowAll() {
    return document.body.classList.contains('__spv') && window.innerWidth > 860;
  }
  
  /**
   * Переопределение режима видео на ресайзе: если карусель сменилась на показ
   * всех картинок или наоборот — очередь пересоздаётся в новом режиме.
   * Режим меняется только в __spv, поэтому без него (и без видео) не подписываемся
   */
  initMainVideosResize() {
    if (!this.mainVideoQueue || !document.body.classList.contains('__spv')) return;
    
    this.mainVideosResizeUnsubscribe = ResizeDispatcher.onResizeDebounced(() => {
      if (this.isMainVideosShowAll() === this.mainVideosShowAll) return;
      
      this.destroyMainVideos();
      this.initMainVideos();
    });
  }
  
  /**
   * Уничтожение очереди видео главной галереи: снимаем слушатели __paused,
   * классы __paused / __by_user и убираем video-элементы
   */
  destroyMainVideos() {
    this.mainVideoPausedListeners.forEach(({ li, sync }) => {
      li.removeEventListener('play', sync, true);
      li.removeEventListener('pause', sync, true);
      li.classList.remove('__paused', '__by_user');
    });
    this.mainVideoPausedListeners = [];
    
    if (this.mainVideoQueue) {
      this.mainVideoQueue.destroy();
      this.mainVideoQueue = null;
    }
  }
  
  /**
   * Пауза / запуск видео в li по клику — только в карусели
   * (без __spv или __spv при 860px и меньше).
   * Решение принимается по реальному состоянию video: играет — ставим на паузу,
   * стоит (пользователем, очередью или браузером) — делаем слайд текущим
   * в очереди и запускаем (VideoQueue.playByUser).
   * Пауза пользователем (pauseByUser) помечает li классом __by_user и сохраняется
   * при прокрутке страницы и листании слайдов — её не снимают очередь, pinch-zoom
   * и смена desktop/mobile, только повторный клик.
   * Возвращает false, если в li нет видео
   */
  toggleMainVideo(li) {
    if (!this.mainVideoQueue || !this.mainVideoQueue.carousel) return false;
    
    const player = this.mainVideoQueue.getPlayerByContainer(li);
    if (!player) return false;
    
    const video = player.getVideo();
    const isPlaying = !!video && !video.paused && !video.ended;
    
    if (isPlaying) {
      player.pauseByUser();
    } else {
      this.mainVideoQueue.playByUser(player);
    }
    
    li.classList.toggle('__by_user', player.isPausedByUser);
    
    return true;
  }
  
  /**
   * Отслеживание прокрутки главной галереи
   */
  initScrollTracking() {
    this.mainImageList.addEventListener('scroll', () => {
      this.hideNavHint();
      this.updateActiveImage();
    }, { passive: true });
  }
  
  /**
   * Обработка кликов на миниатюры
   */
  initThumbnailClicks() {
    this.thumbnails.forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        this.scrollToImage(index);
      });
    });
  }
  
  /**
   * Обработка кликов на кнопки навигации
   */
  initNavButtons() {
    if (this.prevButton) {
      this.prevButton.addEventListener('click', () => {
        if (isPinchZoomed()) return;
        this.hideNavHint();
        this.goToPrev();
      });
    }
    
    if (this.nextButton) {
      this.nextButton.addEventListener('click', () => {
        if (isPinchZoomed()) return;
        this.hideNavHint();
        this.goToNext();
      });
    }
  }
  
  /**
   * Обработка клика на кнопку панели (показ миниатюр)
   */
  initPanelButton() {
    if (this.panelButton) {
      this.panelButton.addEventListener('click', () => {
        this.hideNavHint();
        this.container.classList.add('__show-images');
      });
    }
  }
  
  /**
   * Скрытие миниатюр при клике в любом месте
   */
  initClickOutside() {
    const imagesPanel = this.container.querySelector('.---large-image--images');
    const navPanel = this.container.querySelector('.---large-image--nav');
    
    this.clickOutsideHandler = (e) => {
      // Не скрываем если кликнули на кнопку panel
      if (this.panelButton && this.panelButton.contains(e.target)) {
        return;
      }
      
      // Не скрываем если кликнули на панель изображений
      if (imagesPanel && imagesPanel.contains(e.target)) {
        return;
      }
      
      // Не скрываем если кликнули на кнопки навигации
      if (navPanel && navPanel.contains(e.target)) {
        return;
      }
      
      // Скрываем панель
      this.container.classList.remove('__show-images');
    };
    document.addEventListener('click', this.clickOutsideHandler);
  }
  
  /**
   * Переход к предыдущей картинке
   */
  goToPrev() {
    const newIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.mainImages.length - 1;
    this.scrollToImage(newIndex);
  }
  
  /**
   * Переход к следующей картинке
   */
  goToNext() {
    const newIndex = this.currentIndex < this.mainImages.length - 1 ? this.currentIndex + 1 : 0;
    this.scrollToImage(newIndex);
  }
  
  /**
   * Определяет активную картинку по позиции скролла
   */
  updateActiveImage() {
    const scrollLeft = this.mainImageList.scrollLeft;
    const containerWidth = this.mainImageList.offsetWidth;
    const newIndex = Math.round(scrollLeft / containerWidth);
    
    // Обновляем только если индекс изменился
    if (newIndex !== this.currentIndex && newIndex >= 0 && newIndex < this.thumbnails.length) {
      this.currentIndex = newIndex;
      this.updateThumbnails(newIndex);
    }
  }
  
  /**
   * Показывает подсказку навигации при загрузке (если картинок больше 1)
   */
  showNavHint() {
    if (this.mainImages.length > 1 && !this.navHintDismissed) {
      this.container.classList.add('__show-nav');
    }
  }
  
  /**
   * Скрывает подсказку навигации (при первом клике на навигацию)
   */
  hideNavHint() {
    if (!this.navHintDismissed) {
      this.navHintDismissed = true;
      this.container.classList.remove('__show-nav');
    }
  }
  
  /**
   * Прокручивает галерею к указанной картинке
   */
  scrollToImage(index) {
    const targetImage = this.mainImages[index];
    if (!targetImage) return;
    
    targetImage.scrollIntoView({ 
      behavior: 'instant', 
      block: 'nearest', 
      inline: 'start' 
    });
    
    // Прокрутка мгновенная — очередь видео не увидит движения слайдов
    // и не определит направление, поэтому активный слайд задаём явно
    if (this.mainVideoQueue) {
      this.mainVideoQueue.setCurrentSlide(targetImage);
    }
  }
  
  /**
   * Обновляет класс __active на миниатюрах
   */
  updateThumbnails(index) {
    // Убираем активный класс со всех миниатюр
    this.thumbnails.forEach((thumb) => {
      thumb.classList.remove('__active');
    });
    
    // Добавляем активный класс к текущей миниатюре
    if (this.thumbnails[index]) {
      this.thumbnails[index].classList.add('__active');
    }
  }
  
  /**
   * Обработка клика на главное изображение (открытие popup на десктопе).
   * Без __spv и в __spv при 860px и меньше клик по li с видео вместо попапа
   * ставит видео на паузу / запускает его
   */
  initMainImageClick() {
    const mainImageContainer = this.container.querySelector('.---large-image--main-image');
    if (!mainImageContainer) return;
    
    if (document.body.classList.contains('__spv')) {
      // В режиме __spv — клик на каждый li, открываем попап на нужной картинке
      this.mainImages.forEach((li, index) => {
        li.addEventListener('click', (e) => {
          if (window.innerWidth <= 860 && this.toggleMainVideo(li)) return;
          
          if (window.innerWidth > 600) {
            e.preventDefault();
            this.openPopup(index);
          }
        });
      });
    } else {
      mainImageContainer.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li && this.toggleMainVideo(li)) return;
        
        if (window.innerWidth > 600) {
          e.preventDefault();
          this.openPopup();
        }
      });
    }
  }
  
  /**
   * Обработка кликов на миниатюры видео
   * < 600px — всегда мобильная панель
   * 600-1120px — тап = мобильная панель, клик = попап
   * >= 1120px — всегда попап
   */
  initVideoClicks() {
    let wasTouchEvent = false;
    this.videoListeners = [];
    
    this.videoThumbnails.forEach((thumb, index) => {
      // Отслеживаем touch для различения тапа и клика
      const touchHandler = () => {
        wasTouchEvent = true;
      };
      
      const clickHandler = () => {
        const width = window.innerWidth;
        
        if (width < 600) {
          // Мобильная панель всегда
          this.openMobileVideoPanel(index);
        } else if (width < 1120) {
          // Тап — мобильная панель, клик — попап
          if (wasTouchEvent) {
            this.openMobileVideoPanel(index);
          } else {
            this.openVideoPopup(index);
          }
        } else {
          // Попап всегда
          this.openVideoPopup(index);
        }
        
        // Сбрасываем флаг после обработки
        wasTouchEvent = false;
      };
      
      thumb.addEventListener('touchstart', touchHandler, { passive: true });
      thumb.addEventListener('click', clickHandler);
      this.videoListeners.push({ thumb, touchHandler, clickHandler });
    });
  }
  
  /**
   * Открытие мобильной панели с видео
   */
  openMobileVideoPanel(index) {
    // Закрываем существующую панель если есть
    if (this.mobileVideoPanel) {
      this.closeMobileVideoPanel();
      return;
    }
    
    const videoLi = this.videoThumbnails[index];
    if (!videoLi) return;
    
    const iframe = videoLi.querySelector('.---large-image--video--iframe iframe');
    if (!iframe) return;
    
    const iframeSrc = iframe.getAttribute('data-src') || iframe.getAttribute('src');
    if (!iframeSrc) return;
    
    // Закрываем другие панели
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
    
    // Закрываем мобильное меню если открыто
    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }
    
    window.lockScroll();
    document.body.classList.add('__pinch-allowed');
    
    // Показываем header
    const siteHeader = document.querySelector('header');
    if (siteHeader) {
      siteHeader.classList.remove('__mobile-hidden');
    }
    
    // Создаём панель
    const panel = document.createElement('section');
    panel.className = 'mobile-panel __scrollable __right-panel __video-panel';
    
    const header = document.createElement('div');
    header.className = 'mobile-panel--header';
    
    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = 'Видео';
    titleButton.setAttribute('aria-label', 'Закрыть: Видео');
    
    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.textContent = '';
    
    header.appendChild(titleButton);
    header.appendChild(closeButton);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-panel--content __video';
    
    const videoContainer = document.createElement('div');
    videoContainer.className = 'mobile-panel--video-container';
    
    const videoIframe = document.createElement('iframe');
    videoIframe.setAttribute('src', iframeSrc);
    videoIframe.setAttribute('title', 'Video');
    videoIframe.setAttribute('frameborder', '0');
    videoIframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    videoIframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    videoIframe.setAttribute('allowfullscreen', '');
    
    videoContainer.appendChild(videoIframe);
    contentWrapper.appendChild(videoContainer);
    
    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    
    document.body.appendChild(panel);
    
    this.mobileVideoPanel = panel;
    
    // Регистрируем глобальную функцию закрытия
    window.closeMobileVideoPanel = () => this.closeMobileVideoPanel();
    
    // Обработчики закрытия
    titleButton.addEventListener('click', () => this.closeMobileVideoPanel());
    closeButton.addEventListener('click', () => this.closeMobileVideoPanel());
    
    // Закрытие по клику вне панели
    this.mobileVideoPanelClickHandler = (e) => {
      if (this.mobileVideoPanel && !this.mobileVideoPanel.contains(e.target) && !e.target.closest('.---large-image--video')) {
        this.closeMobileVideoPanel();
      }
    };
    document.addEventListener('click', this.mobileVideoPanelClickHandler);
    
    this.mobileVideoPanel.classList.add('__active');
  }
  
  /**
   * Закрытие мобильной панели с видео
   */
  closeMobileVideoPanel() {
    if (!this.mobileVideoPanel) return;
    
    this.mobileVideoPanel.classList.remove('__active');
    
    window.unlockScroll();
    document.body.classList.remove('__pinch-allowed');
    
    if (this.mobileVideoPanelClickHandler) {
      document.removeEventListener('click', this.mobileVideoPanelClickHandler);
      this.mobileVideoPanelClickHandler = null;
    }
    
    // Удаляем глобальную функцию закрытия
    window.closeMobileVideoPanel = null;
    
    setTimeout(() => {
      if (this.mobileVideoPanel) {
        this.mobileVideoPanel.remove();
        this.mobileVideoPanel = null;
      }
    }, 300);
  }
  
  /**
   * Обработка тапов и свайпов для показа/скрытия навигации на тач-устройствах
   */
  initNavTap() {
    const navPanel = this.container.querySelector('.---large-image--nav');
    
    if (!navPanel) return;
    
    // Тап по кнопкам навигации — показать nav и сбросить таймер
    navPanel.querySelectorAll('button').forEach(button => {
      button.addEventListener('touchstart', () => {
        this.setNavTapped(navPanel);
      }, { passive: true });
    });
    
    // Тап или свайп по списку изображений — показать nav и сбросить таймер
    this.mainImageList.addEventListener('touchstart', () => {
      this.setNavTapped(navPanel);
    }, { passive: true });
    
    this.mainImageList.addEventListener('scroll', () => {
      this.setNavTapped(navPanel);
    }, { passive: true });
  }
  
  /**
   * Установить состояние __tapped и запустить таймер на 2 секунды
   */
  setNavTapped(navPanel) {
    // Сбросить предыдущий таймер
    if (this.navTapTimer) {
      clearTimeout(this.navTapTimer);
    }
    
    navPanel.classList.add('__tapped');
    
    // Запустить новый таймер на 2 секунды
    this.navTapTimer = setTimeout(() => {
      navPanel.classList.remove('__tapped');
      this.navTapTimer = null;
    }, 2000);
  }
  
  /**
   * Открытие popup для видео
   */
  openVideoPopup(index) {
    if (this.popup) {
      this.popup.remove();
    }
    
    const videoLi = this.videoThumbnails[index];
    if (!videoLi) return;
    
    const iframe = videoLi.querySelector('.---large-image--video--iframe iframe');
    if (!iframe) return;
    
    const iframeSrc = iframe.getAttribute('data-src') || iframe.getAttribute('src');
    if (!iframeSrc) return;
    
    this.popup = document.createElement('div');
    this.popup.className = 'popup __video-mode';
    
    this.popup.innerHTML = `
      <button class="popup--close" aria-label="Закрыть"></button>
      <div class="popup--images--block">
        <div class="popup--main-video">
          <iframe src="${iframeSrc}" title="Video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.popup);
    document.body.style.overflow = 'hidden';
    this.initVideoPopupHandlers();
    
    this.popup.classList.add('__visible');
  }
  
  /**
   * Обработчики popup для видео
   */
  initVideoPopupHandlers() {
    const closeBtn = this.popup.querySelector('.popup--close');
    
    closeBtn.addEventListener('click', () => this.closePopup());
    
    this.popupKeyHandler = (e) => {
      if (e.key === 'Escape') {
        this.closePopup();
      }
    };
    document.addEventListener('keydown', this.popupKeyHandler);
    
    this.popup.addEventListener('click', (e) => {
      if (e.target === this.popup) {
        this.closePopup();
      }
    });
  }
  
  /**
   * Создание и открытие popup
   */
  openPopup(startIndex) {
    // Если popup уже существует, удаляем его
    if (this.popup) {
      this.popup.remove();
    }
    
    // Запоминаем текущий индекс
    this.popupCurrentIndex = startIndex !== undefined ? startIndex : this.currentIndex;
    
    // Создаём popup
    this.popup = document.createElement('div');
    this.popup.className = 'popup';
    
    // Получаем изображения
    const images = this.mainImages.map((li) => {
      const img = li.querySelector('img');
      return {
        src: img.getAttribute('src') || img.getAttribute('lazy-src'),
        alt: img.getAttribute('alt') || '',
        isCover: img.classList.contains('__cover')
      };
    });
    
    // Формируем HTML popup
    this.popup.innerHTML = `
      <button class="popup--close" aria-label="Закрыть"></button>
      <button class="popup--nav--prev" aria-label="Предыдущее изображение"></button>
      <div class="popup--images--block">
        <div class="popup--main-image">
          <img src="${images[this.popupCurrentIndex].src}" alt="${images[this.popupCurrentIndex].alt}" ${images[this.popupCurrentIndex].isCover ? 'class="__cover"' : ''}>
        </div>
        <div class="popup--images">
          <ul>
            ${images.map((img, i) => {
              const classes = [];
              if (i === this.popupCurrentIndex) classes.push('__active');
              if (img.isCover) classes.push('__cover');
              return `<li><img src="${img.src}" alt="${img.alt}"${classes.length ? ` class="${classes.join(' ')}"` : ''}></li>`;
            }).join('')}
          </ul>
        </div>
      </div>
      <button class="popup--nav--next" aria-label="Следующее изображение"></button>
    `;
    
    // Добавляем popup в body
    document.body.appendChild(this.popup);
    
    // Блокируем скролл body
    document.body.style.overflow = 'hidden';
    
    // Инициализируем обработчики popup
    this.initPopupHandlers();
    
    // Анимация появления
    this.popup.classList.add('__visible');
  }
  
  /**
   * Инициализация обработчиков событий popup
   */
  initPopupHandlers() {
    const closeBtn = this.popup.querySelector('.popup--close');
    const prevBtn = this.popup.querySelector('.popup--nav--prev');
    const nextBtn = this.popup.querySelector('.popup--nav--next');
    const thumbnails = this.popup.querySelectorAll('.popup--images img');
    
    // Закрытие по кнопке
    closeBtn.addEventListener('click', () => this.closePopup());
    
    // Закрытие по Escape, навигация стрелками и пробелом
    this.popupKeyHandler = (e) => {
      if (e.key === 'Escape') {
        this.closePopup();
      } else if (e.key === 'ArrowLeft') {
        this.popupGoPrev();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        this.popupGoNext();
      }
    };
    document.addEventListener('keydown', this.popupKeyHandler);
    
    // Закрытие по клику на фон
    this.popup.addEventListener('click', (e) => {
      if (e.target === this.popup) {
        this.closePopup();
      }
    });
    
    // Навигация
    prevBtn.addEventListener('click', () => {
      if (isPinchZoomed()) return;
      this.popupGoPrev();
    });
    nextBtn.addEventListener('click', () => {
      if (isPinchZoomed()) return;
      this.popupGoNext();
    });
    
    // Клик на миниатюры
    thumbnails.forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        this.popupGoToImage(index);
      });
    });
  }
  
  /**
   * Переход к предыдущему изображению в popup
   */
  popupGoPrev() {
    const newIndex = this.popupCurrentIndex > 0 
      ? this.popupCurrentIndex - 1 
      : this.mainImages.length - 1;
    this.popupGoToImage(newIndex);
  }
  
  /**
   * Переход к следующему изображению в popup
   */
  popupGoNext() {
    const newIndex = this.popupCurrentIndex < this.mainImages.length - 1 
      ? this.popupCurrentIndex + 1 
      : 0;
    this.popupGoToImage(newIndex);
  }
  
  /**
   * Переход к конкретному изображению в popup
   */
  popupGoToImage(index) {
    this.popupCurrentIndex = index;
    
    const mainImage = this.popup.querySelector('.popup--main-image img');
    const thumbnails = this.popup.querySelectorAll('.popup--images img');
    
    // Получаем данные изображения
    const li = this.mainImages[index];
    const img = li.querySelector('img');
    const src = img.getAttribute('src') || img.getAttribute('lazy-src');
    const alt = img.getAttribute('alt') || '';
    const isCover = img.classList.contains('__cover');
    
    // Обновляем главное изображение
    mainImage.src = src;
    mainImage.alt = alt;
    if (isCover) {
      mainImage.classList.add('__cover');
    } else {
      mainImage.classList.remove('__cover');
    }
    
    // Обновляем активную миниатюру
    thumbnails.forEach((thumb, i) => {
      thumb.classList.toggle('__active', i === index);
    });
  }
  
  /**
   * Закрытие popup
   */
  closePopup() {
    if (!this.popup) return;
    
    // Удаляем обработчик клавиш
    document.removeEventListener('keydown', this.popupKeyHandler);
    
    // Анимация скрытия
    this.popup.classList.remove('__visible');
    
    // Удаляем popup после анимации
    setTimeout(() => {
      if (this.popup) {
        this.popup.remove();
        this.popup = null;
      }
      // Восстанавливаем скролл body
      document.body.style.overflow = '';
    }, 300);
  }
  
  /**
   * Уничтожение экземпляра: снятие глобальных слушателей, таймеров и открытых панелей
   * Слушатели на элементах внутри контейнера умирают вместе с заменой узлов при реините
   */
  destroy() {
    // Снимаем глобальный слушатель клика (initClickOutside)
    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    
    // Снимаем слушатели миниатюр видео (они вне пересоздаваемого блока)
    if (this.videoListeners) {
      this.videoListeners.forEach(({ thumb, touchHandler, clickHandler }) => {
        thumb.removeEventListener('touchstart', touchHandler);
        thumb.removeEventListener('click', clickHandler);
      });
      this.videoListeners = null;
    }
    
    // Сбрасываем таймер подсказки навигации
    if (this.navTapTimer) {
      clearTimeout(this.navTapTimer);
      this.navTapTimer = null;
    }
    
    // Закрываем открытый popup (снимает keydown-слушатель)
    if (this.popup) {
      document.removeEventListener('keydown', this.popupKeyHandler);
      this.popup.remove();
      this.popup = null;
      document.body.style.overflow = '';
    }
    
    // Закрываем открытую мобильную панель видео
    if (this.mobileVideoPanel) {
      this.closeMobileVideoPanel();
    }
    
    // Снимаем подписку на ресайз (initMainVideosResize)
    if (this.mainVideosResizeUnsubscribe) {
      this.mainVideosResizeUnsubscribe();
      this.mainVideosResizeUnsubscribe = null;
    }
    
    // Останавливаем и убираем видео главной галереи
    this.destroyMainVideos();
  }
}

/**
 * Инициализация галереи товара
 */
let productGalleryInstance = null;

function initProductGallery() {
  const galleryContainer = document.querySelector('.---large-image');
  
  if (galleryContainer) {
    productGalleryInstance = new ProductImageGallery(galleryContainer);
  }
}

/**
 * Переинициализация галереи после подмены изображений SKU
 * Пересоздаём только блок .---large-image--main-image--block (клон без
 * навешанных слушателей) — видео, хлебные крошки и перенесённые опции
 * остаются на месте. Видео- и document-слушатели старого экземпляра снимаем
 * через destroy(), остальные умирают вместе со старым блоком.
 * Картинку плавающей кнопки покупки обновляем по новому первому изображению.
 */
function reinitProductGallery() {
  const galleryContainer = document.querySelector('.---large-image');
  if (!galleryContainer) return;
  
  // В режиме __spv или на узких экранах (<= 860px) при смене картинок
  // прокручиваем страницу в самый верх
  if (document.body.classList.contains('__spv') || window.innerWidth <= 860) {
    window.scrollTo(0, 0);
  }
  
  // Снимаем глобальные слушатели и таймеры старого экземпляра
  if (productGalleryInstance && typeof productGalleryInstance.destroy === 'function') {
    productGalleryInstance.destroy();
    productGalleryInstance = null;
  }
  
  // Пересоздаём только блок с картинками: в нём меняется содержимое и на нём
  // висят обработчики галереи. Клон не содержит навешанных слушателей.
  const imageBlock = galleryContainer.querySelector('.---large-image--main-image--block');
  let freshBlock = null;
  if (imageBlock) {
    freshBlock = imageBlock.cloneNode(true);
    imageBlock.parentNode.replaceChild(freshBlock, imageBlock);
  }
  
  // Новый экземпляр на том же .---large-image
  productGalleryInstance = new ProductImageGallery(galleryContainer);
  
  updateFloatingBuyButtonImage();
  
  // Догружаем ленивые изображения новых узлов (img[lazy-src])
  if (freshBlock && typeof window.initLazyLoad === 'function') {
    window.initLazyLoad(freshBlock);
  }
  
  // Пересчитываем, какой колонке назначен __sticky — высота колонок
  // изменилась после подмены изображений
  if (typeof updateProductColumnsSticky === 'function') {
    updateProductColumnsSticky();
  }
  
  // Снимаем зафиксированную ширину через 0.3 сек после пересчёта sticky
  setTimeout(unfixMainImageWidth, 300);
}

window.reinitProductGallery = reinitProductGallery;

/**
 * Фиксирует текущую ширину ---large-image--main-image как inline-стиль,
 * чтобы колонка не схлопывалась во время подмены и догрузки изображений
 */
function fixMainImageWidth() {
  const mainImage = document.querySelector('.---large-image--main-image');
  if (!mainImage) return;
  mainImage.style.width = mainImage.offsetWidth + 'px';
}

/**
 * Снимает ранее зафиксированную ширину ---large-image--main-image
 */
function unfixMainImageWidth() {
  const mainImage = document.querySelector('.---large-image--main-image');
  if (!mainImage) return;
  mainImage.style.width = '';
}

// Ждём загрузки шрифтов
let productGalleryInitDone = false;

function startProductGallery() {
  if (productGalleryInitDone) return;
  productGalleryInitDone = true;
  initProductGallery();
}

if (document.fonts) {
  document.fonts.ready.then(startProductGallery);
  
  // Страховка на случай если промис не разрешится
  setTimeout(startProductGallery, 1000);
} else {
  startProductGallery();
}

/**
 * Product Options Selector
 * Переключение активности опций при клике
 */
function initProductOptions() {
  const optionContainers = document.querySelectorAll('.---option.__block-option .---option--option-data ul');
  
  optionContainers.forEach((ul) => {
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li || !ul.contains(li)) return;
      
      // Ранний выход: клик по уже выбранному элементу — ничего не меняем,
      // чтобы не триггерить повторный запрос тех же данных SKU
      if (li.classList.contains('__checked')) return;
      
      // Убираем __checked со всех li в этом ul
      ul.querySelectorAll('li').forEach((item) => {
        item.classList.remove('__checked');
      });
      
      // Добавляем __checked на кликнутый элемент
      li.classList.add('__checked');
    });
  });
}

/**
 * Block Option Wide Detector
 * Если в .---option.__block-option более 30% li занимают строку в одиночку
 * (рядом с ними нет других li) — на .---option добавляется __wide
 * (вертикальный список на всю ширину)
 */
function updateBlockOptionWide(option) {
  const ul = option.querySelector('.---option--option-data ul');
  if (!ul) return;
  
  const items = Array.from(ul.children).filter((el) => el.tagName === 'LI');
  
  if (items.length === 0) {
    option.classList.remove('__wide');
    return;
  }
  
  // Замер делаем без __wide: в вертикальном режиме каждый li всегда на своей строке
  option.classList.remove('__wide');
  
  const allHaveImgAndText = items.every((li) => li.querySelector(':scope > img') && li.querySelector(':scope > span'));
  if (!allHaveImgAndText) return;
  
  if (items.length === 1) {
    option.classList.add('__wide');
    return;
  }
  
  // Группируем li по строкам: ключ — верхняя граница строки с допуском 2px
  const rows = new Map();
  
  items.forEach((li) => {
    const top = li.offsetTop;
    let rowKey = null;
    
    rows.forEach((count, key) => {
      if (rowKey === null && Math.abs(key - top) <= 2) rowKey = key;
    });
    
    if (rowKey === null) rowKey = top;
    rows.set(rowKey, (rows.get(rowKey) || 0) + 1);
  });
  
  // Если всё уместилось в одну строку — расширение не нужно
  if (rows.size < 2) return;
  
  let aloneCount = 0;
  rows.forEach((count) => {
    if (count === 1) aloneCount += 1;
  });
  
  if (aloneCount > items.length * 0.3) {
    option.classList.add('__wide');
  }
}

/**
 * Пересчёт __wide для всех block-option на странице
 */
function updateAllBlockOptionsWide() {
  document.querySelectorAll('.---option.__block-option').forEach(updateBlockOptionWide);
}

/**
 * Инициализация детектора: первичный замер + отслеживание изменения ширины
 */
function initBlockOptionWide() {
  const options = document.querySelectorAll('.---option.__block-option');
  if (options.length === 0) return;
  
  // Ширина последнего замера, чтобы не реагировать на изменение высоты
  const lastWidths = new WeakMap();
  
  let resizeTimer;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      options.forEach((option) => {
        const width = Math.round(option.getBoundingClientRect().width);
        if (lastWidths.get(option) === width) return;
        lastWidths.set(option, width);
        updateBlockOptionWide(option);
      });
    }, RESIZE_DEBOUNCE_MS);
  });
  
  options.forEach((option) => {
    lastWidths.set(option, Math.round(option.getBoundingClientRect().width));
    updateBlockOptionWide(option);
    if (observer) observer.observe(option);
  });
  
  // Ширина текста зависит от шрифтов — пересчитываем после их загрузки
  if (!document.fonts) return;
  document.fonts.ready.then(updateAllBlockOptionsWide);
}

window.updateAllBlockOptionsWide = updateAllBlockOptionsWide;

/**
 * Toggle Option Selector
 * Переключатель включено/выключено
 */
function initToggleOptions() {
  const toggleContainers = document.querySelectorAll('.---option.__toggle-option .---option--option-data');
  
  toggleContainers.forEach((toggle) => {
    // Создаём track (пилюлю)
    const track = document.createElement('div');
    track.className = '---option--option-data--track';
    
    // Создаём slider (ползунок) внутри track
    const slider = document.createElement('div');
    slider.className = '---option--option-data--slider';
    track.appendChild(slider);
    
    // Создаём элемент для текста
    const label = document.createElement('div');
    label.className = '---option--option-data--label';
    
    // Добавляем элементы в toggle
    toggle.appendChild(track);
    toggle.appendChild(label);
    
    // Устанавливаем начальное состояние
    updateToggleState(toggle);
    
    // Обработчик клика
    toggle.addEventListener('click', () => {
      const currentState = toggle.getAttribute('data-key') === 'true';
      toggle.setAttribute('data-key', !currentState);
      toggle.classList.toggle('__checked', !currentState);
      updateToggleState(toggle);
    });
  });
}

/**
 * Обновляет текст состояния toggle
 */
function updateToggleState(toggle) {
  const isChecked = toggle.getAttribute('data-key') === 'true';
  const trueText = toggle.getAttribute('data-str-true') || 'Да';
  const falseText = toggle.getAttribute('data-str-false') || 'Нет';
  
  const label = toggle.querySelector('.---option--option-data--label');
  if (label) {
    label.textContent = isChecked ? trueText : falseText;
  }
  toggle.classList.toggle('__checked', isChecked);
}

/**
 * Получить значение опции по data-option-id
 * @param {string} optionId - значение data-option-id
 * @returns {string|boolean|string[]|null} - значение опции или null если не найдена
 */
function getOptionValue(optionId) {
  const option = document.querySelector(`.---option[data-option-id="${optionId}"]`);
  if (!option) return null;
  
  // Toggle option - возвращает boolean
  if (option.classList.contains('__toggle-option')) {
    const data = option.querySelector('.---option--option-data');
    return data ? data.getAttribute('data-key') === 'true' : null;
  }
  
  // List option - возвращает массив выбранных data-key
  if (option.classList.contains('__list-option')) {
    const checked = option.querySelectorAll('.---option--option-data li.__checked');
    return Array.from(checked).map(li => li.getAttribute('data-key'));
  }
  
  // Block option / Select option - возвращает один data-key
  const checked = option.querySelector('.---option--option-data li.__checked');
  return checked ? checked.getAttribute('data-key') : null;
}

/**
 * Установить значение опции по data-option-id
 * @param {string} optionId - значение data-option-id
 * @param {string|boolean|string[]} value - новое значение
 */
function setOptionValue(optionId, value) {
  const option = document.querySelector(`.---option[data-option-id="${optionId}"]`);
  if (!option) return;
  
  // Toggle option
  if (option.classList.contains('__toggle-option')) {
    const data = option.querySelector('.---option--option-data');
    if (data) {
      data.setAttribute('data-key', value ? 'true' : 'false');
      updateToggleState(data);
    }
    return;
  }
  
  // List option - value должен быть массивом
  if (option.classList.contains('__list-option')) {
    const values = Array.isArray(value) ? value : [value];
    option.querySelectorAll('.---option--option-data li').forEach(li => {
      li.classList.toggle('__checked', values.includes(li.getAttribute('data-key')));
    });
    return;
  }
  
  // Block option / Select option - value должен быть строкой
  option.querySelectorAll('.---option--option-data li').forEach(li => {
    li.classList.toggle('__checked', li.getAttribute('data-key') === value);
  });
}

/**
 * Select Option Selector
 * Выпадающий список с одним выбранным элементом
 * Исходный ul остаётся нетронутым, dropdown генерируется динамически
 * При тапе (touch) на мобильных <= 600px открывается mobile-panel
 */
function initSelectOptions() {
  const selectContainers = document.querySelectorAll('.---option.__select-option');
  
  selectContainers.forEach((select) => {
    const optionData = select.querySelector('.---option--option-data');
    const sourceUl = optionData.querySelector('ul');
    if (!sourceUl) return;
    
    const isNullable = select.classList.contains('__null');
    
    // Локальный флаг для различения тапа и клика (для каждого select свой)
    let wasTouchEvent = false;
    
    // Создаём header (кнопку) для отображения выбранного значения
    const header = document.createElement('div');
    header.className = '---option--select-header';
    
    const valueElement = document.createElement('div');
    valueElement.className = '---option--select-header--value';
    
    // Кнопка очистки (только для __null)
    let clearButton = null;
    if (isNullable) {
      clearButton = document.createElement('button');
      clearButton.className = '__clear';
      clearButton.setAttribute('aria-label', 'Очистить выбор');
      
      clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Снимаем выбор со всех элементов в исходном ul
        sourceUl.querySelectorAll('li').forEach((item) => {
          item.classList.remove('__checked');
        });
        
        // Обновляем отображаемое значение
        updateSelectValue(select);
        
        // Закрываем dropdown если открыт
        select.classList.remove('__open');
        select.querySelector('.---option--select-dropdown').innerHTML = '';
      });
    }
    
    const arrow = document.createElement('div');
    arrow.className = '---option--select-header--arrow';
    
    header.appendChild(valueElement);
    if (clearButton) {
      header.appendChild(clearButton);
    }
    header.appendChild(arrow);
    
    // Создаём контейнер для выпадающего списка (изначально пустой)
    const dropdown = document.createElement('div');
    dropdown.className = '---option--select-dropdown';
    
    // Добавляем header и dropdown в optionData
    optionData.appendChild(header);
    optionData.appendChild(dropdown);
    
    // Устанавливаем начальное значение
    updateSelectValue(select);
    
    // Отслеживаем touch для различения тапа и клика
    header.addEventListener('touchstart', () => {
      wasTouchEvent = true;
    }, { passive: true });
    
    // Обработчик клика на header (открытие/закрытие)
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const width = window.innerWidth;
      
      // При тапе на мобильных <= 600px открываем mobile-panel
      if (width <= 600 && wasTouchEvent) {
        wasTouchEvent = false;
        selectOptionMobilePanelInstance.openPanel(select);
        return;
      }
      
      // Сбрасываем флаг
      wasTouchEvent = false;
      
      // Закрываем все другие открытые select
      document.querySelectorAll('.---option.__select-option.__open').forEach((other) => {
        if (other !== select) {
          other.classList.remove('__open');
          // Очищаем dropdown у закрытого
          other.querySelector('.---option--select-dropdown').innerHTML = '';
        }
      });
      
      const isOpen = select.classList.toggle('__open');
      
      if (isOpen) {
        // Генерируем содержимое dropdown из исходного ul
        renderSelectDropdown(select);
      } else {
        // Очищаем dropdown при закрытии
        dropdown.innerHTML = '';
      }
    });
  });
  
  // Document-слушатели вешаются один раз — initSelectOptions вызывается повторно для панели
  if (selectOptionsDocumentListenersBound) return;
  selectOptionsDocumentListenersBound = true;
  
  // Закрытие dropdown при клике вне элемента
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.---option.__select-option')) {
      document.querySelectorAll('.---option.__select-option.__open').forEach((select) => {
        select.classList.remove('__open');
        select.querySelector('.---option--select-dropdown').innerHTML = '';
      });
    }
  });
  
  // Закрытие dropdown при нажатии Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.---option.__select-option.__open').forEach((select) => {
        select.classList.remove('__open');
        select.querySelector('.---option--select-dropdown').innerHTML = '';
      });
    }
  });
}

let selectOptionsDocumentListenersBound = false;

/**
 * Генерирует содержимое dropdown из исходного ul
 */
function renderSelectDropdown(select) {
  const sourceUl = select.querySelector('.---option--option-data > ul');
  const dropdown = select.querySelector('.---option--select-dropdown');
  if (!sourceUl || !dropdown) return;
  
  const isLinks = select.classList.contains('__links');
  
  // Создаём ul для dropdown
  const dropdownUl = document.createElement('ul');
  
  // Копируем элементы из исходного ul
  sourceUl.querySelectorAll('li').forEach((sourceLi) => {
    const li = document.createElement('li');
    li.innerHTML = sourceLi.innerHTML;
    
    // Устанавливаем data-key только если он есть (у __links его нет)
    const dataKey = sourceLi.getAttribute('data-key');
    if (dataKey !== null) {
      li.setAttribute('data-key', dataKey);
    }
    
    // Обрабатываем изображения: если нет src, берём lazy-src
    li.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      const lazySrc = img.getAttribute('lazy-src');
      if ((!src || src === '') && lazySrc) {
        img.setAttribute('src', lazySrc);
      }
    });
    
    // Копируем классы __checked и __disabled
    if (sourceLi.classList.contains('__checked')) {
      li.classList.add('__checked');
    }
    if (sourceLi.classList.contains('__disabled')) {
      li.classList.add('__disabled');
    }
    
    // Обработчик клика
    if (isLinks) {
      // Для __links: переход по ссылке (если есть) или ничего (для __checked)
      li.addEventListener('click', (e) => {
        const link = li.querySelector('a');
        if (link) {
          // Есть ссылка — переходим по ней
          window.location.href = link.getAttribute('href');
        }
        // Если нет ссылки (элемент __checked) — ничего не делаем
        // Закрываем dropdown
        select.classList.remove('__open');
        dropdown.innerHTML = '';
      });
    } else {
      // Обычный select: обработчик выбора
      li.addEventListener('click', () => {
        const key = li.getAttribute('data-key');
        
        // Обновляем __checked в исходном ul
        sourceUl.querySelectorAll('li').forEach((item) => {
          item.classList.toggle('__checked', item.getAttribute('data-key') === key);
        });
        
        // Обновляем отображаемое значение
        updateSelectValue(select);
        
        // Закрываем dropdown
        select.classList.remove('__open');
        dropdown.innerHTML = '';
      });
    }
    
    dropdownUl.appendChild(li);
  });
  
  dropdown.innerHTML = '';
  dropdown.appendChild(dropdownUl);
}

/**
 * Обновляет отображаемое значение в select
 */
function updateSelectValue(select) {
  const valueElement = select.querySelector('.---option--select-header--value');
  const checkedItem = select.querySelector('.---option--option-data > ul li.__checked');
  const isNullable = select.classList.contains('__null');
  
  if (valueElement) {
    if (checkedItem) {
      // Есть выбранное значение
      // Заменяем lazy-src на src в HTML перед вставкой
      let html = checkedItem.innerHTML;
      html = html.replace(/lazy-src="/g, 'src="');
      valueElement.innerHTML = html;
      
      valueElement.classList.remove('__null');
      select.classList.add('__has-value');
    } else if (isNullable) {
      // Нет выбранного значения, показываем placeholder
      const nullText = select.getAttribute('data-str-null') || 'Выберите...';
      valueElement.textContent = nullText;
      valueElement.classList.add('__null');
      select.classList.remove('__has-value');
    }
  }
}

/**
 * Мобильная панель для select-option (при тапе на <= 600px)
 */
class SelectOptionMobilePanel {
  constructor() {
    this.panel = null;
    this.activeSelectOption = null;
  }
  
  /**
   * Открытие мобильной панели для select-option
   */
  openPanel(select) {
    // Закрываем существующую панель если есть
    if (this.panel) {
      this.closePanel();
      return;
    }
    
    const titleElement = select.querySelector('.---option--title');
    const sourceUl = select.querySelector('.---option--option-data > ul');
    if (!sourceUl) return;
    
    const title = titleElement ? titleElement.textContent.trim() : 'Выберите';
    const isNullable = select.classList.contains('__null');
    const isLinks = select.classList.contains('__links');
    
    // Закрываем другие панели
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
    
    if (typeof window.closeMobileVideoPanel === 'function') {
      window.closeMobileVideoPanel();
    }
    
    // Закрываем мобильное меню если открыто
    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }
    
    window.lockPanelScroll(); // счётчиковая блокировка — панель может открываться поверх панели покупки (cart.js)
    
    // Показываем header
    const siteHeader = document.querySelector('header');
    if (siteHeader) {
      siteHeader.classList.remove('__mobile-hidden');
    }
    
    this.activeSelectOption = select;
    this.isLinks = isLinks;
    
    // Создаём панель
    const panel = document.createElement('section');
    panel.className = 'mobile-panel __scrollable __select-option-panel';
    if (isLinks) {
      panel.classList.add('__links');
    }
    
    const header = document.createElement('div');
    header.className = 'mobile-panel--header';
    
    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = title;
    titleButton.setAttribute('aria-label', 'Закрыть: ' + title);
    
    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.textContent = '';
    
    header.appendChild(titleButton);
    header.appendChild(closeButton);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-panel--content __select __only-one';
    
    // Клонируем ul и обрабатываем изображения
    const clonedUl = sourceUl.cloneNode(true);
    clonedUl.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      const lazySrc = img.getAttribute('lazy-src');
      if ((!src || src === '') && lazySrc) {
        img.setAttribute('src', lazySrc);
      }
    });
    
    contentWrapper.appendChild(clonedUl);
    
    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    
    // Блок с кнопками внизу панели (не для __links)
    if (!isLinks) {
      const acceptClearBlock = document.createElement('div');
      acceptClearBlock.className = 'mobile-panel--accept-clear--block';
      
      const clearButton = document.createElement('button');
      clearButton.className = 'mobile-panel--clear';
      clearButton.setAttribute('type', 'button');
      clearButton.textContent = 'Сбросить';
      clearButton.setAttribute('aria-label', 'Сбросить');
      // Скрываем кнопку сброса если не __null
      if (!isNullable) {
        clearButton.style.visibility = 'hidden';
      }
      
      const acceptButton = document.createElement('button');
      acceptButton.className = 'mobile-panel--accept';
      acceptButton.setAttribute('type', 'button');
      acceptButton.textContent = 'Применить';
      acceptButton.setAttribute('aria-label', 'Применить');
      
      acceptClearBlock.appendChild(clearButton);
      acceptClearBlock.appendChild(acceptButton);
      panel.appendChild(acceptClearBlock);
      
      // Обработчик сброса (только для __null)
      if (isNullable) {
        clearButton.addEventListener('click', () => {
          const selectItems = contentWrapper.querySelectorAll('ul > li');
          selectItems.forEach(i => i.classList.remove('__checked'));
          this.closePanel();
        });
      }
      
      acceptButton.addEventListener('click', () => this.closePanel());
    }
    
    document.body.appendChild(panel);
    
    this.panel = panel;
    
    // Регистрируем глобальную функцию закрытия
    window.closeSelectOptionMobilePanel = () => this.closePanel();
    
    // Обработчики выбора элемента
    const selectItems = contentWrapper.querySelectorAll('ul > li');
    
    if (isLinks) {
      // Для __links: переход по ссылке или ничего для __checked
      selectItems.forEach(item => {
        item.addEventListener('click', () => {
          const link = item.querySelector('a');
          if (link) {
            // Есть ссылка — переходим по ней
            window.location.href = link.getAttribute('href');
          }
          // Для __checked (без ссылки) — просто закрываем
          this.closePanel();
        });
      });
    } else {
      // Обычный select: только один может быть выбран
      selectItems.forEach(item => {
        item.addEventListener('click', () => {
          selectItems.forEach(i => i.classList.remove('__checked'));
          item.classList.add('__checked');
        });
      });
    }
    
    // Обработчики закрытия
    titleButton.addEventListener('click', () => this.closePanel());
    closeButton.addEventListener('click', () => this.closePanel());
    
    this.panel.classList.add('__active');
  }
  
  /**
   * Закрытие мобильной панели select-option
   */
  closePanel() {
    if (!this.panel) return;
    
    // Сохраняем выбранное значение обратно в источник (только для обычных select, не для __links)
    if (this.activeSelectOption && !this.isLinks) {
      const contentWrapper = this.panel.querySelector('.mobile-panel--content.__select');
      const sourceUl = this.activeSelectOption.querySelector('.---option--option-data > ul');
      
      if (contentWrapper && sourceUl) {
        const checkedItem = contentWrapper.querySelector('ul > li.__checked');
        const checkedKey = checkedItem ? checkedItem.getAttribute('data-key') : null;
        
        // Обновляем источник
        sourceUl.querySelectorAll('li').forEach(li => {
          const key = li.getAttribute('data-key');
          if (checkedKey && key === checkedKey) {
            li.classList.add('__checked');
          } else {
            li.classList.remove('__checked');
          }
        });
        
        // Обновляем отображаемое значение
        updateSelectValue(this.activeSelectOption);
      }
    }
    
    this.panel.classList.remove('__active');
    
    window.unlockPanelScroll();
    
    // Удаляем глобальную функцию закрытия
    window.closeSelectOptionMobilePanel = null;
    
    this.activeSelectOption = null;
    this.isLinks = false;
    
    setTimeout(() => {
      if (this.panel) {
        this.panel.remove();
        this.panel = null;
      }
    }, 300);
  }
}

// Глобальный экземпляр панели select-option
const selectOptionMobilePanelInstance = new SelectOptionMobilePanel();

/**
 * List Option Selector
 * Список с множественным выбором (или одиночным при __only-one)
 */
function initListOptions() {
  const listContainers = document.querySelectorAll('.---option.__list-option');
  
  listContainers.forEach((list) => {
    const ul = list.querySelector('.---option--option-data ul');
    if (!ul) return;
    
    const isOnlyOne = list.classList.contains('__only-one');
    const isNullable = list.classList.contains('__null');
    
    ul.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li || !ul.contains(li)) return;
      
      if (isOnlyOne) {
        // Режим одиночного выбора (radio)
        const isCurrentlyChecked = li.classList.contains('__checked');
        
        if (isCurrentlyChecked && isNullable) {
          // Если __null — можно снять выбор
          li.classList.remove('__checked');
        } else if (!isCurrentlyChecked) {
          // Снимаем выбор со всех и выбираем текущий
          ul.querySelectorAll('li').forEach((item) => {
            item.classList.remove('__checked');
          });
          li.classList.add('__checked');
        }
        // Если уже выбран и не __null — ничего не делаем
      } else {
        // Режим множественного выбора (checkbox)
        const isCurrentlyChecked = li.classList.contains('__checked');
        const checkedCount = ul.querySelectorAll('li.__checked').length;
        
        if (isCurrentlyChecked) {
          // Снимаем выбор только если __null или есть другие выбранные
          if (isNullable || checkedCount > 1) {
            li.classList.remove('__checked');
          } else {
            // Анимация shake при попытке снять последний выбор
            li.classList.remove('__shake');
            // Перезапуск анимации через reflow
            void li.offsetWidth;
            li.classList.add('__shake');
          }
        } else {
          li.classList.add('__checked');
        }
      }
    });
  });
}

/**
 * SKU Options Sync
 * Отслеживает изменения __checked на li внутри опций с классом __sku
 * и запрашивает актуальный набор значений опций у сервера,
 * после чего переставляет __checked в соответствии с ответом.
 */
function initSkuSync(options) {
  const syncUrl = !options || options.syncUrl !== false;

  const productEl = document.querySelector('main.product');
  if (!productEl) return;

  const productId = productEl.getAttribute('data-product-id');
  if (!productId) return;

  const skuImagesEnabled = productEl.getAttribute('data-sku-images') === 'true';

  const skuOptions = Array.from(document.querySelectorAll('.---option.__sku'));
  if (skuOptions.length === 0) return;

  let isApplyingServerData = false;
  let requestTimer = null;
  let observer = null;
  // Последнее переключение: с какого li ушёл __checked и на какой пришёл
  let previousLi = null;
  let targetLi = null;

  function collectSkuValues() {
    const values = {};
    skuOptions.forEach((opt) => {
      const optionId = opt.getAttribute('data-option-id');
      if (!optionId) return;
      const checkedLi = opt.querySelector('.---option--option-data li.__checked');
      if (checkedLi) {
        const valueKey = checkedLi.getAttribute('data-value-key');
        if (valueKey !== null) {
          values[optionId] = valueKey;
        }
      }
    });
    return values;
  }

  function applyServerOptions(options) {
    if (!options || typeof options !== 'object') return;

    isApplyingServerData = true;
    try {
      Object.keys(options).forEach((optionId) => {
        const valueKey = options[optionId];
        const opt = document.querySelector(
          `.---option.__sku[data-option-id="${optionId}"]`
        );
        if (!opt) return;

        const items = opt.querySelectorAll('.---option--option-data li');
        items.forEach((li) => {
          li.classList.toggle(
            '__checked',
            li.getAttribute('data-value-key') === valueKey
          );
        });

        // Для select-option обновляем отображаемое значение
        if (
          opt.classList.contains('__select-option') &&
          typeof updateSelectValue === 'function'
        ) {
          updateSelectValue(opt);
        }
      });
    } finally {
      // Отбрасываем накопленные записи мутаций от наших собственных изменений,
      // чтобы колбэк MutationObserver не отправил повторный запрос.
      if (observer) observer.takeRecords();
      isApplyingServerData = false;
    }
  }

  function isEmptyOptions(options) {
    if (options == null) return true;
    if (Array.isArray(options)) return options.length === 0;
    if (typeof options === 'object') return Object.keys(options).length === 0;
    return true;
  }

  function setText(selector, value) {
    if (value === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = value == null ? '' : String(value);
  }

  function toggleHidden(selector, hidden) {
    if (hidden === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.toggle('__hidden', !!hidden);
  }

  function toggleClass(selector, className, active) {
    if (active === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.toggle(className, !!active);
  }

  function setAttr(selector, name, value) {
    if (value === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.setAttribute(name, value == null ? '' : String(value));
  }

  function switchClass(selector, classNames, value) {
    if (value === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.remove(...classNames);
    if (classNames.includes(value)) el.classList.add(value);
  }

  // Заменяет допклассы (__*) элемента на value, пустой value — без допкласса
  function replaceModifierClass(selector, value) {
    if (value === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    Array.from(el.classList)
      .filter((name) => name.startsWith('__'))
      .forEach((name) => el.classList.remove(name));
    const className = value == null ? '' : String(value).trim();
    if (className) el.classList.add(className);
  }

  function setTextAnimated(selector, value) {
    if (value === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    setPriceText(el, value == null ? '' : String(value), true);
  }

  function setHTML(selector, value) {
    if (value === undefined) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = value == null ? '' : String(value);
  }

  // Возвращает упорядоченный список ссылок изображений из DOM-узла
  function extractImageUrls(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('img')).map(
      (img) => img.getAttribute('src') || img.getAttribute('lazy-src') || ''
    );
  }

  // Возвращает упорядоченный список ссылок изображений из HTML-строки
  function extractImageUrlsFromHtml(html) {
    if (html == null || html === '') return [];
    const template = document.createElement('template');
    template.innerHTML = String(html);
    return extractImageUrls(template.content);
  }

  // Сравнивает два упорядоченных списка ссылок
  function sameUrls(a, b) {
    return a.length === b.length && a.every((url, i) => url === b[i]);
  }

  function applyProductInfo(data) {
    if (!data || typeof data !== 'object') return;

    // Заголовок, артикул
    setText('.---params--title h1', data.product_title);
    setText('.---params--sku', data.product_sku);

    // Скидка (маркер)
    setText('.---params--markers .__item-discount', data.discount_value);
    toggleHidden('.---params--markers .__item-discount', data.hide_discount);

    // Цена
    setTextAnimated('.---buy-box--price', data.price);
    toggleHidden('.---buy-box--price', data.price_hidden);
    toggleClass('.---buy-box--price', '__on_request', data.by_request);

    // Старая цена
    setTextAnimated('.---buy-box--oldprice', data.oldprice);
    toggleHidden('.---buy-box--oldprice', data.oldprice_hidden);

    // Описание цены
    setHTML('.---buy-box--price-description', data.price_description);
    toggleHidden('.---buy-box--price-description', data.price_description_hidden);

    // Баллы
    setTextAnimated('.---buy-box--points', data.product_points);
    toggleHidden('.---buy-box--points', data.points_hidden);

    // Упаковка
    setText('.---buy-box--packaging--packaging-unit', data.packaging_unit);
    setText('.---buy-box--packaging--unit-price', data.unit_price);
    setText('.---buy-box--packaging--minimum-order', data.minimum_order);
    toggleHidden('.---buy-box--packaging', data.packaging_hidden);
    toggleHidden('.---buy-box--packaging--unit-price', data.unit_price_hidden);
    toggleHidden('.---buy-box--packaging--minimum-order', data.minimum_order_hidden);

    // Кастомное описание
    setHTML('.---buy-box--custom-description', data.custom_description);
    toggleHidden('.---buy-box--custom-description', data.custom_description_hidden);

    setAttr('.---buy-box--buy-button', 'data-button-text', data.buy_button_text);
    toggleClass('.---buy-box--buy-button', '__not_in_stock', data.not_in_stock);
    switchClass('.---buy-box--buy-button', ['__short_1_click', '__block'], data.not_in_stock_type);
    toggleHidden('.---buy-box--buy-in-one-click', data.buy_in_1_click_hidden);

    // Наличие
    setText('.---in-stock--status', data.in_stock_status);
    replaceModifierClass('.---in-stock--status', data.in_stock_color_class);
    setHTML('.---in-stock--info', data.in_stock_info);
    toggleHidden('.---in-stock--info', data.in_stock_info_hidden);

    // Изображения SKU — обрабатываем только если запрошены через SKUIMAGES=true
    // (иначе все связанные ключи в ответе пустые и их нужно пропустить)
    if (skuImagesEnabled) {
      toggleHidden('.---large-image--images', data.product_images_preview);
      toggleHidden('.---large-image--panel', data.product_images_panel);
      toggleHidden('.---large-image--nav', data.product_images_nav);

      // Сравниваем набор ссылок текущих изображений с пришедшими в list_images.
      // Если они совпадают — подмену и переинициализацию не запускаем.
      const currentUrls = extractImageUrls(
        document.querySelector('.---large-image--main-image ul')
      );
      const newUrls = extractImageUrlsFromHtml(data.list_images);
      const imagesChanged =
        data.list_images !== undefined && !sameUrls(currentUrls, newUrls);

      if (imagesChanged) {
        setHTML('.---large-image--main-image ul', data.list_images);
        setHTML('.---large-image--images ul', data.list_images_preview);

        // Пересоздаём галерею, чтобы навигация/скролл/клики работали с новыми узлами
        if (typeof window.reinitProductGallery === 'function') {
          window.reinitProductGallery();
        }
      } else {
        // Картинки те же — обновления не будет, снимаем зафиксированную ширину
        unfixMainImageWidth();
      }
    }

    // Обновляем базовую цену/баллы для диких опций и переприменяем модификаторы:
    // сервер возвращает немодифицированные значения SKU, поверх них накладываем
    // изменения от выбранных диких опций (с slot-анимацией).
    if (typeof window.updateProductBasePrice === 'function') {
      window.updateProductBasePrice(data.price, data.oldprice, data.product_points, true);
    }

    // Характеристики SKU — подменяем значения в блоке ---large-params
    applySkuFeatures(data.sku_features);

    updateSkuUrl(data.sku_id);

    // Склады — после updateSkuUrl, запросу нужен новый data-sku-id
    applyProductWarehousesStatus(data.warehouses_status);
  }

  /**
   * Apply SKU Features
   * Подменяет значения характеристик в блоке ---large-params данными SKU.
   * features — массив объектов вида { feature, shown_value, ... }.
   * Проходим по всем li с data-feature-key внутри
   * ---large-params > ul > li > ul > li:
   *   - если ключ есть в features — ставим shown_value и класс __sku;
   *   - если ключа нет — возвращаем значение из data-base-value и снимаем __sku.
   */
  function applySkuFeatures(features) {
    const largeParams = document.querySelector('.---large-params');
    if (!largeParams) return;

    // Индекс отображаемых значений по ключу характеристики
    const valueByKey = {};
    if (Array.isArray(features)) {
      features.forEach((feature) => {
        if (feature && feature.feature != null) {
          valueByKey[feature.feature] = feature.shown_value;
        }
      });
    }

    const items = largeParams.querySelectorAll(
      ':scope > ul > li > ul > li[data-feature-key]'
    );
    items.forEach((li) => {
      const valueEl = li.querySelector('.---large-params--param-value');
      if (!valueEl) return;

      const key = li.getAttribute('data-feature-key');
      if (key in valueByKey) {
        const shown = valueByKey[key];
        valueEl.textContent = shown == null ? '' : String(shown);
        valueEl.classList.add('__sku');
      } else {
        const base = li.getAttribute('data-base-value');
        valueEl.textContent = base == null ? '' : String(base);
        valueEl.classList.remove('__sku');
      }
    });
  }

  function updateSkuUrl(id) {
    if (id == null) return;
    productEl.setAttribute('data-sku-id', String(id));
    if (!syncUrl) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('SKU', String(id));
      window.history.replaceState(
        window.history.state,
        '',
        url.pathname + url.search + url.hash
      );
    } catch (_) {}
  }

  function revertLastSwitch() {
    if (!targetLi && !previousLi) return;

    isApplyingServerData = true;
    try {
      if (targetLi) targetLi.classList.remove('__checked');
      if (previousLi) previousLi.classList.add('__checked');

      // Обновляем header для select-option
      const opt = (targetLi || previousLi).closest('.---option');
      if (
        opt &&
        opt.classList.contains('__select-option') &&
        typeof updateSelectValue === 'function'
      ) {
        updateSelectValue(opt);
      }

      // Шейк на элементе, куда переключались.
      // Для select-option исходный ul скрыт, а dropdown уже закрыт — шейкаем header
      if (targetLi) {
        const shakeEl =
          (opt &&
            opt.classList.contains('__select-option') &&
            opt.querySelector('.---option--select-header')) ||
          targetLi;
        shakeEl.classList.remove('__shake');
        void shakeEl.offsetWidth;
        shakeEl.classList.add('__shake');
      }
    } finally {
      if (observer) observer.takeRecords();
      isApplyingServerData = false;
    }
  }

  function requestSkuData() {
    // Фиксируем текущую ширину главного изображения на время подмены картинок,
    // чтобы колонка не схлопывалась (снимется после переинициализации)
    if (skuImagesEnabled) {
      fixMainImageWidth();
    }

    const params = new URLSearchParams();
    const values = collectSkuValues();
    Object.keys(values).forEach((key) => {
      params.set(key, values[key]);
    });
    params.set('PRODUCT', productId);

    if (skuImagesEnabled) {
      params.set('SKUIMAGES', 'true');
    }

    fetch('/get-endpoints/getSkuData?' + params.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((data) => {
        // SKU не существует — откатываем последнее переключение
        if (!data || typeof data !== 'object' || data.exist === false) {
          revertLastSwitch();
          // Переинициализации не будет — снимаем зафиксированную ширину сразу
          if (skuImagesEnabled) unfixMainImageWidth();
          return;
        }

        applyProductInfo(data);
      })
      .catch(() => {
        // Ошибка запроса — переинициализации не будет, снимаем ширину
        if (skuImagesEnabled) unfixMainImageWidth();
      });
  }

  function scheduleRequest() {
    if (isApplyingServerData) return;
    if (requestTimer) clearTimeout(requestTimer);
    requestTimer = setTimeout(requestSkuData, 30);
  }

  observer = new MutationObserver((mutations) => {
    if (isApplyingServerData) return;

    let prev = null;
    let target = null;

    for (const m of mutations) {
      if (
        m.type !== 'attributes' ||
        m.attributeName !== 'class' ||
        m.target.tagName !== 'LI'
      ) {
        continue;
      }
      const wasChecked = (m.oldValue || '').split(/\s+/).indexOf('__checked') !== -1;
      const isChecked = m.target.classList.contains('__checked');
      if (wasChecked && !isChecked) prev = m.target;
      else if (!wasChecked && isChecked) target = m.target;
    }

    if (prev || target) {
      previousLi = prev;
      targetLi = target;
      scheduleRequest();
    }
  });

  skuOptions.forEach((opt) => {
    const optionData = opt.querySelector('.---option--option-data');
    if (!optionData) return;
    observer.observe(optionData, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true
    });
  });
}

/**
 * Price String Parse
 * Разбирает строку цены в число. Русский формат: пробел (или nbsp) —
 * разделитель тысяч, запятая — десятичный разделитель.
 * Возвращает null, если разобрать не удалось (например, «По запросу»).
 */
function parsePriceString(str) {
  if (str == null) return null;
  let s = String(str).replace(/[^\d.,\-]/g, '');
  if (s === '' || s === '-') return null;

  // Если есть запятая — считаем её десятичным разделителем, точки — тысячными
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Price Number Format
 * Форматирует число по образцу строки-цены: разделитель тысяч и наличие
 * копеек берутся из образца (likeStr).
 */
function formatPriceLike(num, likeStr) {
  const sample = likeStr == null ? '' : String(likeStr);
  const sep = /\u00A0/.test(sample) ? '\u00A0' : ' ';
  const cleaned = sample.replace(/[^\d.,\u00A0 ]/g, '');
  const hasDecimals = /[.,]\d{1,2}\s*$/.test(cleaned);

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const fixed = hasDecimals ? abs.toFixed(2) : String(Math.round(abs));
  const parts = fixed.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);

  return sign + intPart + (parts[1] ? ',' + parts[1] : '');
}

/**
 * Wild Options Price Modifier
 * Дикие опции — это ---option без класса __sku. Их выбранные li могут
 * модифицировать цену товара (---buy-box--price и ---buy-box--oldprice).
 *
 * У каждого li читаются атрибуты:
 *   data-price-mod-type — тип модификации: "rel" (относительная, в процентах)
 *                         или "fix" (фиксированная, в рублях)
 *   data-price-mod      — величина модификации (может быть отрицательной)
 *
 * Все rel рассчитываются от базовой цены и суммируются с fix — на полученную
 * величину изменяются и --price, и --oldprice.
 *
 * Баллы (---buy-box--points) модифицируются атрибутами li:
 *   data-change-points="true" + число в data-points-mod — изменить баллы на это число
 *   data-change-points="true" + data-points-mod="" + data-price-mod-type="rel" —
 *     изменить баллы на процент из data-price-mod
 *   data-change-points="true" + data-points-mod="" + data-price-mod-type="fix" —
 *     не применять
 *
 * После расчета (или сразу, если диких опций нет) показывает
 * ---buy-box--price-inner--block через showPriceInner().
 *
 * При переключении диких опций и обновлении по SKU значения выводятся через slot-анимацию.
 * При загрузке (пока у price-inner нет __calculated, в т.ч. перестановка из OPTIONS) — без анимации.
 */
function initWildOptionsPrice() {
  const priceInner = document.querySelector('.---buy-box--price-inner--block');
  const priceEl = document.querySelector('.---buy-box--price');
  const oldpriceEl = document.querySelector('.---buy-box--oldprice');
  const pointsEl = document.querySelector('.---buy-box--points');

  // Дикие опции (---option без __sku), у которых есть модификаторы цены/баллов на li
  const wildOptions = Array.from(
    document.querySelectorAll('.---option:not(.__sku)')
  ).filter((opt) =>
    opt.querySelector(
      '.---option--option-data > ul > li[data-price-mod-type], .---option--option-data > ul > li[data-change-points]'
    )
  );

  if (!priceEl || wildOptions.length === 0) {
    showPriceInner();
    return;
  }

  // Базовые (немодифицированные) значения цен и баллов: точная строка и число
  let basePriceStr = priceEl.textContent;
  let basePriceNum = parsePriceString(basePriceStr);
  let baseOldpriceStr = oldpriceEl ? oldpriceEl.textContent : null;
  let baseOldpriceNum = oldpriceEl ? parsePriceString(baseOldpriceStr) : null;
  let basePointsStr = pointsEl ? pointsEl.textContent : null;
  let basePointsNum = pointsEl ? parsePriceString(basePointsStr) : null;

  // Собирает суммарные модификаторы по всем отмеченным диким li:
  //   relPercent / fixSum             — для цены (---price, ---oldprice)
  //   pointsRelPercent / pointsFixSum — для баллов (---points)
  function collectMods() {
    let relPercent = 0;
    let fixSum = 0;
    let pointsRelPercent = 0;
    let pointsFixSum = 0;

    wildOptions.forEach((opt) => {
      const items = opt.querySelectorAll(
        '.---option--option-data > ul > li.__checked'
      );
      items.forEach((li) => {
        const type = li.getAttribute('data-price-mod-type');
        const mod = parseFloat((li.getAttribute('data-price-mod') || '').replace(',', '.'));

        // Модификация цены
        if (!isNaN(mod)) {
          if (type === 'rel') relPercent += mod;
          else if (type === 'fix') fixSum += mod;
        }

        // Модификация баллов
        if (li.getAttribute('data-change-points') === 'true') {
          const pointsModStr = (li.getAttribute('data-points-mod') || '').trim().replace(',', '.');
          const pointsMod = parseFloat(pointsModStr);

          if (pointsModStr !== '' && !isNaN(pointsMod)) {
            // Задано число — фиксированное изменение баллов
            pointsFixSum += pointsMod;
          } else if (pointsModStr === '' && type === 'rel' && !isNaN(mod)) {
            // Пусто + rel — процент из data-price-mod
            pointsRelPercent += mod;
          }
          // Пусто + fix — не применяем
        }
      });
    });

    return { relPercent, fixSum, pointsRelPercent, pointsFixSum };
  }

  // Применяет модификации к --price, --oldprice и --points
  // animate — вывести значения через slot-анимацию (дикие опции, обновление по SKU)
  function applyMods(animate) {
    const mods = collectMods();

    if (basePriceNum != null) {
      // Дельта цены считается один раз от базовой --price и применяется к обеим ценам
      const delta = basePriceNum * (mods.relPercent / 100) + mods.fixSum;

      setPriceText(
        priceEl,
        delta === 0 ? basePriceStr : formatPriceLike(basePriceNum + delta, basePriceStr),
        animate
      );

      if (oldpriceEl && baseOldpriceNum != null) {
        setPriceText(
          oldpriceEl,
          delta === 0 ? baseOldpriceStr : formatPriceLike(baseOldpriceNum + delta, baseOldpriceStr),
          animate
        );
      }
    }

    if (pointsEl && basePointsNum != null) {
      // Дельта баллов считается от базовых --points.
      // Баллы всегда целые и без разделителя тысяч.
      const pointsDelta = basePointsNum * (mods.pointsRelPercent / 100) + mods.pointsFixSum;

      setPriceText(
        pointsEl,
        pointsDelta === 0
          ? basePointsStr
          : String(Math.round(basePointsNum + pointsDelta)),
        animate
      );
    }

    // Обновляем per-li подписи с величиной изменения цены (только __list-option)
    renderListModSpans();
  }

  // Возвращает валютный суффикс из строки-цены (например, "₽")
  function priceSuffix(str) {
    const m = String(str == null ? '' : str).match(/[^\d.,\s\u00A0-]+.*$/);
    return m ? m[0].trim() : '';
  }

  // Форматирует величину изменения цены со знаком и валютой по образцу базовой цены
  function formatMod(delta) {
    if (delta == null || isNaN(delta)) return '';
    const suffix = priceSuffix(basePriceStr);
    const sign = delta > 0 ? '+' : '';
    return sign + formatPriceLike(delta, basePriceStr) + (suffix ? '\u00A0' + suffix : '');
  }

  // Проставляет в каждый li диких __list-option span.__price-mod с величиной,
  // на которую этот вариант изменит цену товара:
  //   rel — процент от базовой цены, fix — фиксированная сумма.
  // Позиция span: после последнего существующего span, иначе перед img, иначе в конец li.
  function renderListModSpans() {
    wildOptions.forEach((opt) => {
      if (!opt.classList.contains('__list-option')) return;

      opt.querySelectorAll('.---option--option-data > ul > li').forEach((li) => {
        const type = li.getAttribute('data-price-mod-type');
        const mod = parseFloat((li.getAttribute('data-price-mod') || '').replace(',', '.'));
        if (isNaN(mod)) return;

        let delta;
        if (type === 'rel') delta = (basePriceNum || 0) * (mod / 100);
        else if (type === 'fix') delta = mod;
        else return;

        let span = li.querySelector(':scope > .__price-mod');
        if (!span) {
          span = document.createElement('span');
          span.className = '__price-mod';

          const spans = li.querySelectorAll(':scope > span');
          const img = li.querySelector(':scope > img');
          if (spans.length) {
            spans[spans.length - 1].insertAdjacentElement('afterend', span);
          } else if (img) {
            img.insertAdjacentElement('beforebegin', span);
          } else {
            li.appendChild(span);
          }
        }

        span.textContent = formatMod(delta);
      });
    });
  }

  // Обновляет базовые цены (например, после смены SKU) и переприменяет модификации.
  // Значения передаются в том же виде, что вернул сервер (немодифицированные).
  // animate — вывести новые значения через slot-анимацию.
  function updateBase(priceStr, oldpriceStr, pointsStr, animate) {
    if (typeof priceStr === 'string' && priceStr !== '') {
      basePriceStr = priceStr;
      basePriceNum = parsePriceString(priceStr);
    }
    if (typeof oldpriceStr === 'string' && oldpriceStr !== '') {
      baseOldpriceStr = oldpriceStr;
      baseOldpriceNum = parsePriceString(oldpriceStr);
    }
    if (typeof pointsStr === 'string' && pointsStr !== '') {
      basePointsStr = pointsStr;
      basePointsNum = parsePriceString(pointsStr);
    }
    applyMods(animate);
  }

  window.updateProductBasePrice = updateBase;

  // Следим за переключением __checked в диких опциях
  // (slot-анимация — только после показа price-inner, чтобы не анимировать перестановку из OPTIONS)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (
        m.type === 'attributes' &&
        m.attributeName === 'class' &&
        m.target.tagName === 'LI'
      ) {
        applyMods(!priceInner || priceInner.classList.contains('__calculated'));
        return;
      }
    }
  });

  wildOptions.forEach((opt) => {
    const optionData = opt.querySelector('.---option--option-data');
    if (!optionData) return;
    observer.observe(optionData, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  });

  // Применяем модификации при загрузке
  applyMods();
  showPriceInner();
}

/**
 * Price Text Set
 * Выводит текст цены/баллов через setOrAnimate из slot.js (animate — slot-анимация).
 * Если slot.js еще не загружен (первичная инициализация product.js) — просто ставит текст.
 */
function setPriceText(el, text, animate) {
  if (typeof setOrAnimate === 'function') {
    setOrAnimate(el, text, !!animate);
  } else {
    el.textContent = text;
  }
}

/**
 * Price Inner Show
 * Показывает ---buy-box--price-inner--block (класс __calculated, opacity в CSS)
 * после расчета диких опций при загрузке. Двойной requestAnimationFrame —
 * чтобы успели отработать отложенные пересчеты MutationObserver
 * (в т.ч. перестановка __checked из initWildOptionsUrlSync) и прошла раскладка.
 */
function showPriceInner() {
  const block = document.querySelector('.---buy-box--price-inner--block');
  if (!block) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      block.classList.add('__calculated');
    });
  });
}

/**
 * Wild Options URL Sync
 * Дикие опции (---option без __sku и __links) <-> get-параметр OPTIONS
 * При загрузке: если в адресе есть OPTIONS (data-value-key через запятую) —
 *   в опциях, где есть хотя бы одно совпадение, __checked переставляется на эти значения
 * При переключении __checked: список data-value-key отмеченных li пишется в OPTIONS
 *   через replaceState (без записи в историю); пустой список — параметр удаляется
 */
function initWildOptionsUrlSync() {
  const wildOptions = Array.from(
    document.querySelectorAll('main.product .---option:not(.__sku):not(.__links)')
  );
  if (wildOptions.length === 0) return;

  function collectValueKeys() {
    const keys = [];
    wildOptions.forEach((opt) => {
      opt.querySelectorAll('.---option--option-data > ul > li.__checked[data-value-key]').forEach((li) => {
        keys.push(li.getAttribute('data-value-key'));
      });
    });
    return keys;
  }

  function writeUrl() {
    const keys = collectValueKeys();
    try {
      const url = new URL(window.location.href);
      if (keys.length > 0) {
        url.searchParams.set('OPTIONS', keys.join(','));
      } else {
        url.searchParams.delete('OPTIONS');
      }
      window.history.replaceState(
        window.history.state,
        '',
        url.pathname + url.search + url.hash
      );
    } catch (e) {
      return;
    }
  }

  function applyFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('OPTIONS');
    if (!raw) return;

    const keys = raw.split(',').map((k) => k.trim()).filter((k) => k !== '');
    if (keys.length === 0) return;

    wildOptions.forEach((opt) => {
      const items = Array.from(opt.querySelectorAll('.---option--option-data > ul > li[data-value-key]'));
      if (!items.some((li) => keys.includes(li.getAttribute('data-value-key')))) return;

      items.forEach((li) => {
        li.classList.toggle('__checked', keys.includes(li.getAttribute('data-value-key')));
      });

      if (opt.classList.contains('__select-option') && typeof updateSelectValue === 'function') {
        updateSelectValue(opt);
      }
    });
  }

  applyFromUrl();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (
        m.type === 'attributes' &&
        m.attributeName === 'class' &&
        m.target.tagName === 'LI' &&
        m.target.hasAttribute('data-value-key')
      ) {
        writeUrl();
        return;
      }
    }
  });

  wildOptions.forEach((opt) => {
    const optionData = opt.querySelector('.---option--option-data');
    if (!optionData) return;
    observer.observe(optionData, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  });
}

/**
 * Product Columns Sticky
 * При ширинах >= 1301px определяет самую высокую колонку
 * и назначает остальным класс __sticky
 * В режиме body.__spv при ширинах > 860px сравнивает высоты
 * ---large-image и ---params — короткому назначает __sticky
 * (перемещение DOM выполняется в initBuyBoxRelocate)
 */
function updateProductColumnsSticky() {
  const block = document.querySelector('.product--main-item--image-params-buy--block');
  if (!block) return;
  
  const largeImage = block.querySelector('.---large-image');
  const params = block.querySelector('.---params');
  
  // Убираем класс __sticky со всех потенциальных колонок
  Array.from(block.children).forEach(col => col.classList.remove('__sticky'));
  if (largeImage) largeImage.classList.remove('__sticky');
  if (params) params.classList.remove('__sticky');
  
  const isSpv = document.body.classList.contains('__spv');
  const width = window.innerWidth;
  
  // Режим __spv при ширине > 860px:
  // определяем кому поставить __sticky — ---large-image или ---params
  if (isSpv && width > 860 && largeImage && params) {
    const largeImageHeight = largeImage.offsetHeight;
    const paramsHeight = params.offsetHeight;
    
    if (paramsHeight > largeImageHeight) {
      largeImage.classList.add('__sticky');
    } else if (largeImageHeight > paramsHeight) {
      params.classList.add('__sticky');
    }
    return;
  }
  
  // Иначе — работаем только при ширинах >= 1301px
  if (width < 1301) return;
  
  // Определяем высоту каждой колонки
  const columns = Array.from(block.children);
  if (columns.length === 0) return;
  const heights = columns.map(col => col.offsetHeight);
  
  // Находим максимальную высоту
  const maxHeight = Math.max(...heights);
  
  // Назначаем __sticky всем колонкам, кроме самой высокой
  columns.forEach((col, index) => {
    if (heights[index] < maxHeight) {
      col.classList.add('__sticky');
    }
  });
}

/**
 * Инициализация sticky колонок при загрузке и ресайзе
 */
function initProductColumnsSticky() {
  // При загрузке
  updateProductColumnsSticky();
  
  // При ресайзе с debounce
  ResizeDispatcher.onResizeDebounced(updateProductColumnsSticky);
}

/**
 * Картинка плавающей кнопки покупки
 * Берёт первое изображение из ---large-image--main-image и передаёт его кнопке
 * через --floating-buy-button-image (и --floating-buy-button-image-size для __cover).
 * Картинка рисуется слева через ::before только в режиме __floating (см. CSS);
 * __with_image ставится, если изображение найдено.
 * <img> внутрь кнопки не вставляется: cart.js перезаписывает её textContent.
 * Вызывается из initFloatingBuyButton и после подмены изображений SKU (reinitProductGallery)
 */
function updateFloatingBuyButtonImage() {
  const buyButton = document.querySelector('.---buy-box--buy-button.main-button');
  if (!buyButton) return;
  
  const img = document.querySelector('.---large-image--main-image ul li img');
  const src = img && (img.getAttribute('src') || img.getAttribute('lazy-src'));
  
  if (src) {
    buyButton.style.setProperty('--floating-buy-button-image', `url("${src.replace(/["\\]/g, '\\$&')}")`);
    buyButton.style.setProperty('--floating-buy-button-image-size', img.classList.contains('__cover') ? 'cover' : 'contain');
  } else {
    buyButton.style.removeProperty('--floating-buy-button-image');
    buyButton.style.removeProperty('--floating-buy-button-image-size');
  }
  
  buyButton.classList.toggle('__with_image', !!src);
}

/**
 * Плавающая кнопка покупки при ширине <= 860px — сразу при загрузке, без порога скролла
 * Внизу страницы скрывается через __hidden
 * Слева на кнопке показывается основная картинка товара (updateFloatingBuyButtonImage)
 * Плашка ---buy-box--open-cart (showBuyButtonOpenCart в cart.js) переносится вместе с кнопкой и остается сразу после нее
 */
function initFloatingBuyButton() {
  const buyButton = document.querySelector('.---buy-box--buy-button.main-button');
  if (!buyButton) return;
  
  updateFloatingBuyButtonImage();
  
  // Плейсхолдер для возврата кнопки на исходное место в DOM.
  // Пока кнопка fixed, она выносится в body, чтобы выйти из stacking-контекста
  // sticky-родителя (.__sticky / .---buy-box-delivery-brand--block). Иначе
  // последующие блоки страницы (например .---review.__active) перекрывают её,
  // и z-index на самой кнопке не помогает — она заперта в чужом контексте.
  const placeholder = document.createComment('floating-buy-button');
  let movedToBody = false;
  
  function getOpenCartPlate() {
    const next = buyButton.nextElementSibling;
    return next && next.classList.contains('---buy-box--open-cart') ? next : null;
  }
  
  function moveToBody() {
    if (movedToBody) return;
    const plate = getOpenCartPlate();
    buyButton.parentNode.insertBefore(placeholder, buyButton);
    document.body.appendChild(buyButton);
    if (plate) buyButton.after(plate);
    movedToBody = true;
  }
  
  function moveBack() {
    if (!movedToBody) return;
    const plate = getOpenCartPlate();
    placeholder.parentNode.insertBefore(buyButton, placeholder);
    if (plate) buyButton.after(plate);
    placeholder.remove();
    movedToBody = false;
  }
  
  function updateFloatingState() {
    // Не обновляем состояние если открыто мобильное меню (scrollY может быть некорректным)
    if (document.body.classList.contains('__mobile-menu-open')) return;
    
    if (!buyButton.classList.contains('__block') && window.innerWidth <= 860) {
      buyButton.classList.add('__floating');
    } else {
      buyButton.classList.remove('__floating');
    }
    
    // Выносим в body только когда кнопка реально fixed (position:fixed приходит из CSS).
    // Проверяем через computed style, чтобы автоматически совпадать с брейкпоинтом стилей.
    if (getComputedStyle(buyButton).position === 'fixed') {
      moveToBody();
    } else {
      moveBack();
    }
    
    const isAtBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight;
    buyButton.classList.toggle('__hidden', isAtBottom);
  }
  
  // При загрузке
  updateFloatingState();
  
  // При скролле
  window.addEventListener('scroll', updateFloatingState, { passive: true });
  
  // При ресайзе
  ResizeDispatcher.onResize(updateFloatingState);

  let isBlocked = buyButton.classList.contains('__block');

  new MutationObserver(() => {
    const blocked = buyButton.classList.contains('__block');
    if (blocked === isBlocked) return;
    isBlocked = blocked;
    updateFloatingState();
  }).observe(buyButton, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Перемещение блока цены при ширине <= 860px
 * Перемещает .---buy-box--price--block после .---params--one-word-sku--block
 */
function initPriceBlockRelocate() {
  const priceBlock = document.querySelector('.---buy-box--price--block');
  const targetBlock = document.querySelector('.---params--one-word-sku--block');
  if (!priceBlock || !targetBlock) return;
  
  // Запоминаем исходное положение
  const originalParent = priceBlock.parentNode;
  const originalNextSibling = priceBlock.nextElementSibling;
  
  let isMoved = false;
  
  function updatePriceBlockPosition() {
    if (window.innerWidth <= 860 && !isMoved) {
      priceBlock.classList.add('__mooving');
      priceBlock.offsetHeight;
      setTimeout(() => {
        targetBlock.after(priceBlock);
        isMoved = true;
        priceBlock.offsetHeight;
        priceBlock.classList.remove('__mooving');
      }, 300);
    } else if (window.innerWidth > 860 && isMoved) {
      priceBlock.classList.add('__mooving');
      priceBlock.offsetHeight;
      setTimeout(() => {
        if (originalNextSibling) {
          originalParent.insertBefore(priceBlock, originalNextSibling);
        } else {
          originalParent.appendChild(priceBlock);
        }
        isMoved = false;
        priceBlock.offsetHeight;
        priceBlock.classList.remove('__mooving');
      }, 300);
    }
  }
  
  // При загрузке
  updatePriceBlockPosition();
  
  // При ресайзе
  ResizeDispatcher.onResizeDebounced(updatePriceBlockPosition);
}

/**
 * Points Under Oldprice
 * Если ---buy-box--oldprice скрыта (__hidden), переносит ---buy-box--points
 * в ---buy-box--price-oldprice--block сразу после старой цены (под цену).
 * Если старая цена показана — возвращает баллы на исходное место
 * в ---buy-box--price--block (перед ---buy-box--custom-description).
 * Класс старой цены отслеживается через MutationObserver (смена SKU и т.п.)
 */
function initPointsUnderOldprice() {
  const oldpriceEl = document.querySelector('.---buy-box--oldprice');
  const pointsEl = document.querySelector('.---buy-box--points');
  if (!oldpriceEl || !pointsEl) return;

  // Запоминаем исходное положение
  const originalParent = pointsEl.parentNode;
  const originalNextSibling = pointsEl.nextElementSibling;

  function updatePointsPosition() {
    if (oldpriceEl.classList.contains('__hidden')) {
      if (pointsEl.previousElementSibling !== oldpriceEl) oldpriceEl.after(pointsEl);
    } else if (pointsEl.parentNode !== originalParent) {
      originalParent.insertBefore(pointsEl, originalNextSibling);
    }
  }

  // При загрузке
  updatePointsPosition();

  // При смене класса старой цены
  new MutationObserver(updatePointsPosition).observe(oldpriceEl, {
    attributes: true,
    attributeFilter: ['class']
  });
}

/**
 * Проверка наличия секций и установка классов
 */
function initProductDescriptionSections() {
  const block = document.querySelector('.product--main-item--product-description--large-description-params--block');
  if (!block) return;
  
  const largeDescription = block.querySelector('.---large-description');
  const largeParams = block.querySelector('.---large-params');
  const largeFiles = block.querySelector('.---large-files');
  
  // Если нет ---large-params но есть ---large-files, добавить для ---large-files класс __active
  if (!largeParams && largeFiles) {
    largeFiles.classList.add('__active');
  }
  
  // Если нет ---large-params И (нет ---large-files ИЛИ нет ---large-description), поставить __one-column
  if (!largeParams && (!largeFiles || !largeDescription)) {
    block.classList.add('__one-column');
  }
}

/**
 * Product Tabs
 * Переключение табов в описании товара
 * При клике на button переставляет __active на него
 * и активирует контентные блоки из data-tab (через запятую)
 */
function initProductTabs() {
  const tabsContainer = document.querySelector('.---product-tabs');
  if (!tabsContainer) return;
  
  const tabButtons = tabsContainer.querySelectorAll('.---product-tab');
  if (tabButtons.length === 0) return;
  
  const contentBlock = document.querySelector('.product--main-item--product-description--large-description-params--block');
  
  // Собираем все возможные контентные блоки (классы из всех data-tab)
  const allContentClasses = new Set();
  
  tabButtons.forEach(btn => {
    const dataTab = btn.getAttribute('data-tab');
    if (dataTab) {
      dataTab.split(',').forEach(cls => {
        allContentClasses.add(cls.trim());
      });
    }
  });
  
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Убираем __active со всех кнопок
      tabButtons.forEach(b => b.classList.remove('__active'));
      
      // Ставим __active на кликнутую кнопку
      btn.classList.add('__active');
      
      // Убираем __active со всех контентных блоков
      allContentClasses.forEach(cls => {
        const element = document.querySelector('.' + cls);
        if (element) {
          element.classList.remove('__active');
        }
      });
      
      // Ставим __active на блоки из data-tab
      const dataTab = btn.getAttribute('data-tab');
      if (dataTab) {
        const tabClasses = dataTab.split(',').map(cls => cls.trim());
        
        tabClasses.forEach(trimmedCls => {
          const element = document.querySelector('.' + trimmedCls);
          if (element) {
            element.classList.add('__active');
          }
        });
        
        // Если активируется ---large-description и нет ---large-params, активируем ---large-files
        if (tabClasses.includes('---large-description')) {
          const largeParams = document.querySelector('.---large-params');
          const largeFiles = document.querySelector('.---large-files');
          
          if (!largeParams && largeFiles) {
            largeFiles.classList.add('__active');
          }
        }
      }
      
      // Обрабатываем data-tab-mode
      if (contentBlock) {
        const dataTabMode = btn.getAttribute('data-tab-mode');
        
        if (dataTabMode) {
          // Ставим mode-класс
          contentBlock.classList.add(dataTabMode.trim());
        } else {
          // Убираем __one-column только если не выполняется условие из initProductDescriptionSections
          const largeParams = contentBlock.querySelector('.---large-params');
          const largeFiles = contentBlock.querySelector('.---large-files');
          const largeDescription = contentBlock.querySelector('.---large-description');
          
          if (!((!largeParams) && (!largeFiles || !largeDescription))) {
            contentBlock.classList.remove('__one-column');
          }
        }
      }
    });
  });
}

/**
 * Hide Product Tabs Without Content
 * Скрывает вкладки, если соответствующих контентных блоков не существует
 * Проверяет все классы из data-tab (через запятую)
 * Вкладка скрывается только если ВСЕ блоки отсутствуют
 * 
 * Особая логика для ---large-files:
 * Если нет ---large-params, но есть ---large-description, 
 * то вкладка ---large-files скрывается (файлы показываются автоматически с описанием)
 */
function initHideEmptyProductTabs() {
  const tabsContainer = document.querySelector('.---product-tabs');
  if (!tabsContainer) return;
  
  const descriptionContainer = document.querySelector('.product--main-item--product-description');
  if (!descriptionContainer) return;
  
  // Проверяем наличие ключевых блоков
  const largeParams = descriptionContainer.querySelector('.---large-params');
  const largeDescription = descriptionContainer.querySelector('.---large-description');
  
  // Перебираем все li с кнопками вкладок
  const tabItems = tabsContainer.querySelectorAll('li');
  
  tabItems.forEach(li => {
    const button = li.querySelector('.---product-tab');
    if (!button) return;
    
    const dataTab = button.getAttribute('data-tab');
    if (!dataTab) return;
    
    // Разбиваем data-tab по запятой
    const classNames = dataTab.split(',').map(cls => cls.trim());
    
    // Особая логика для вкладки с ---large-files
    if (classNames.length === 1 && classNames[0] === '---large-files') {
      // Скрываем если нет ---large-params, но есть ---large-description
      if (!largeParams && largeDescription) {
        li.style.display = 'none';
        return;
      }
    }
    
    // Проверяем, существует ли хотя бы один блок из data-tab
    let anyExists = false;
    
    for (const className of classNames) {
      const element = descriptionContainer.querySelector('.' + className);
      if (element) {
        anyExists = true;
        break;
      }
    }
    
    // Скрываем вкладку только если НЕТ ни одного блока
    if (!anyExists) {
      li.style.display = 'none';
    }
  });
}

/**
 * Large Params Accordion
 * При ширине > 1131px, если ---large-params выше ---large-description,
 * преобразует секции в разворачивающиеся блоки (аккордеон)
 */
function initLargeParamsAccordion() {
  const block = document.querySelector('.product--main-item--product-description--large-description-params--block');
  if (!block) return;
  
  const largeParams = block.querySelector('.---large-params');
  if (!largeParams) return;
  
  const largeDescription = block.querySelector('.---large-description');
  
  // Флаг состояния
  let isAccordionMode = false;
  
  // Считаем высоту контента по дочерним элементам
  function getContentHeight(element) {
    let height = 0;
    const children = element.children;
    for (let i = 0; i < children.length; i++) {
      height += children[i].offsetHeight;
    }
    // Добавляем gap между элементами (из CSS: gap: 20px)
    if (children.length > 1) {
      const style = getComputedStyle(element);
      const gap = parseFloat(style.gap) || parseFloat(style.rowGap) || 0;
      height += gap * (children.length - 1);
    }
    return height;
  }
  
  // Измеряем высоты
  // Оба блока — элементы одного grid-ряда и растянуты по его высоте,
  // поэтому сравниваем не сами блоки, а высоты их содержимого
  function measureHeights() {
    // Для description — высота текста
    const descText = largeDescription.querySelector('.---large-description--text');
    const descHeight = descText ? descText.offsetHeight : 0;
    // Для params — сумма высот секций списка + gap (25px), без скелетона ::before
    const paramsList = largeParams.querySelector(':scope > ul');
    const paramsHeight = paramsList ? getContentHeight(paramsList) : 0;
    return { descHeight, paramsHeight };
  }
  
  function applyAccordion() {
    if (isAccordionMode) return;
    
    isAccordionMode = true;
    largeParams.classList.add('__accordion');
    
    // Получаем все секции (li верхнего уровня)
    const sections = largeParams.querySelectorAll(':scope > ul > li');
    
    sections.forEach((section) => {
      const sectionTitle = section.querySelector('.---large-params--section-title');
      if (!sectionTitle) return;
      
      // Изначально все секции свёрнуты
      section.classList.add('__collapsed');
      
      // Обработчик клика
      if (!sectionTitle._accordionHandler) {
        sectionTitle._accordionHandler = () => {
          section.classList.toggle('__collapsed');
          section.classList.toggle('__expanded');
        };
        sectionTitle.addEventListener('click', sectionTitle._accordionHandler);
      }
    });
  }
  
  function removeAccordion() {
    if (!isAccordionMode) return;
    
    isAccordionMode = false;
    largeParams.classList.remove('__accordion');
    
    const sections = largeParams.querySelectorAll(':scope > ul > li');
    sections.forEach((section) => {
      section.classList.remove('__collapsed', '__expanded');
    });
  }
  
  // Считаем элементы второго уровня (li внутри вложенных ul)
  function countSecondLevelItems() {
    const nestedLists = largeParams.querySelectorAll(':scope > ul > li > ul');
    let count = 0;
    nestedLists.forEach(ul => {
      count += ul.querySelectorAll(':scope > li').length;
    });
    return count;
  }
  
  function checkAndApply() {
    const width = window.innerWidth;
    
    if (width <= 1120) {
      // Для узких экранов: аккордеон если элементов > 8
      const itemCount = countSecondLevelItems();
      
      if (itemCount > 8) {
        applyAccordion();
      } else {
        removeAccordion();
      }
    } else {
      // Для широких экранов: аккордеон если params выше description
      if (largeDescription) {
        const { descHeight, paramsHeight } = measureHeights();
        
        if (paramsHeight > descHeight) {
          applyAccordion();
        } else {
          removeAccordion();
        }
      } else {
        removeAccordion();
      }
    }
    
    // Показываем после расчёта
    largeParams.classList.add('__calculated');
  }
  
  // При загрузке — ждём отрисовку
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      checkAndApply();
    });
  });
}

/**
 * Video Title Toggle
 * Сворачивает/разворачивает список видео по клику на заголовок
 */
function initVideoTitleToggle() {
  const title = document.querySelector('.---large-image--video--title');
  if (!title) return;

  title.addEventListener('click', () => {
    title.classList.toggle('__active');
  });
}

/**
 * Перемещение блоков покупки в режиме body.__spv при ширине > 860px:
 *   1) ---buy-box-delivery-brand--block переносится в конец ---params
 *   2) ---buy-box переносится после ---params--one-word-sku--block
 * После завершения перемещений обновляется sticky-классификация колонок.
 */
function initBuyBoxRelocate() {
  const block = document.querySelector('.product--main-item--image-params-buy--block');
  const params = document.querySelector('.---params');
  const buyBoxBlock = document.querySelector('.---buy-box-delivery-brand--block');
  const buyBox = document.querySelector('.---buy-box');
  const skuBlock = document.querySelector('.---params--one-word-sku--block');
  if (!block || !params || !buyBoxBlock || !buyBox || !skuBlock) return;
  
  // Запоминаем исходные позиции
  const buyBoxOriginalParent = buyBox.parentNode;
  const buyBoxOriginalNext = buyBox.nextElementSibling;
  const buyBoxBlockOriginalParent = buyBoxBlock.parentNode;
  const buyBoxBlockOriginalNext = buyBoxBlock.nextElementSibling;
  
  let isMoved = false;
  
  function refreshSticky() {
    if (typeof updateProductColumnsSticky === 'function') updateProductColumnsSticky();
  }
  
  function relocate() {
    const shouldMove = document.body.classList.contains('__spv') && window.innerWidth > 860;
    
    if (shouldMove && !isMoved) {
      // 1) Синхронно переносим весь ---buy-box-delivery-brand--block в конец ---params
      if (buyBoxBlock.parentNode !== params) {
        params.appendChild(buyBoxBlock);
      }
      // 2) С анимацией переносим ---buy-box после ---params--one-word-sku--block
      buyBox.classList.add('__mooving');
      buyBox.offsetHeight;
      setTimeout(() => {
        skuBlock.after(buyBox);
        isMoved = true;
        buyBox.offsetHeight;
        buyBox.classList.remove('__mooving');
        refreshSticky();
      }, 300);
    } else if (!shouldMove && isMoved) {
      // Обратный порядок: сначала ---buy-box, потом ---buy-box-delivery-brand--block
      buyBox.classList.add('__mooving');
      buyBox.offsetHeight;
      setTimeout(() => {
        if (buyBoxOriginalNext && buyBoxOriginalNext.parentNode === buyBoxOriginalParent) {
          buyBoxOriginalParent.insertBefore(buyBox, buyBoxOriginalNext);
        } else {
          buyBoxOriginalParent.appendChild(buyBox);
        }
        if (buyBoxBlockOriginalNext && buyBoxBlockOriginalNext.parentNode === buyBoxBlockOriginalParent) {
          buyBoxBlockOriginalParent.insertBefore(buyBoxBlock, buyBoxBlockOriginalNext);
        } else {
          buyBoxBlockOriginalParent.appendChild(buyBoxBlock);
        }
        isMoved = false;
        buyBox.offsetHeight;
        buyBox.classList.remove('__mooving');
        refreshSticky();
      }, 300);
    } else {
      // Условие не изменилось — просто пересчитываем sticky (например, при resize внутри диапазона)
      refreshSticky();
    }
  }
  
  relocate();
  ResizeDispatcher.onResize(relocate);
  window.updateBuyBoxPosition = relocate;
}

/**
 * Options To Top
 * При ширине <= 860px переносит опцию ---option с классом __to-top
 * из ---params--options в ---large-image перед ---product--breadcrumbs.
 * При ширине > 860px возвращает её на исходное место.
 * root — корень поиска (main.product в панели покупки): там опция всегда наверху,
 * панель узкая — ширина окна не при чём и ресайз не отслеживается
 */
function initOptionsToTop(root) {
  const scope = root || document;

  const optionsContainer = scope.querySelector('.---params--options');
  const largeImage = scope.querySelector('.---large-image');
  if (!optionsContainer || !largeImage) return;

  // В top-часть переносится только одна опция __to-top
  const option = optionsContainer.querySelector('.---option.__to-top');
  if (!option) return;

  // Запоминаем исходную позицию (родитель и следующий сосед)
  const parent = option.parentNode;
  const next = option.nextElementSibling;

  let isMoved = false;

  function moveToTop() {
    const breadcrumbs = largeImage.querySelector('.---product--breadcrumbs');
    if (breadcrumbs) {
      largeImage.insertBefore(option, breadcrumbs);
    } else {
      largeImage.appendChild(option);
    }
    isMoved = true;
  }

  function restore() {
    if (next && next.parentNode === parent) {
      parent.insertBefore(option, next);
    } else {
      parent.appendChild(option);
    }
    isMoved = false;
  }

  // Панель: переносим сразу и навсегда
  if (root) {
    moveToTop();
    return;
  }

  function update() {
    const shouldMove = window.innerWidth <= 860;

    if (shouldMove && !isMoved) {
      moveToTop();
    } else if (!shouldMove && isMoved) {
      restore();
    }
  }

  update();
  ResizeDispatcher.onResize(update);
  window.updateOptionsToTop = update;
}

/**
 * Interesting Items
 * Динамическая подгрузка интересных позиций.
 * Отслеживает div.__dinamic_interesting_items: когда он оказывается менее чем
 * в 200px от области видимости, выполняет запрос на /get-endpoints/getRandomItems
 * и полностью заменяет блок пришедшим HTML.
 */
function initInterestingItems() {
  const blocks = document.querySelectorAll('.__dinamic_interesting_items');
  if (blocks.length === 0) return;

  const productEl = document.querySelector('main.product');
  const productId = productEl ? productEl.getAttribute('data-product-id') : null;

  // Без data-product-id подгружаем только независимые от товара блоки (all_random), с PRODUCT=0
  const targets = productId
    ? Array.from(blocks)
    : Array.from(blocks).filter((block) => block.textContent.trim() === 'all_random');
  if (targets.length === 0) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      loadInterestingItems(entry.target, productId || '0');
    });
  }, { rootMargin: '200px' });

  targets.forEach((block) => observer.observe(block));
}

/**
 * Запрос и подмена одного блока интересных позиций
 */
function loadInterestingItems(block, productId) {
  const type = block.textContent.trim();
  const isAll = type === 'all_random';
  const isBase = type === 'main_category_random';

  const params = new URLSearchParams();
  params.set('ALL', isAll ? 'true' : 'false');
  params.set('BASE', isBase ? 'true' : 'false');
  params.set('PRODUCT', productId);

  fetch('/get-endpoints/getRandomItems?' + params.toString(), {
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

      const fragment = document.createDocumentFragment();
      const newNodes = Array.from(temp.childNodes);
      newNodes.forEach((node) => fragment.appendChild(node));

      const parent = block.parentNode;
      if (!parent) return;
      parent.replaceChild(fragment, block);

      // Реинициализация ресурсов новых карточек, скоупим в parent (.items-grid):
      // - .item--scroller (lazy-картинки внутри + превью + точки) — initScrollers
      // - img[lazy-src] вне скроллеров — initLazyLoad
      // - .item--buy-button → __mobile-button на тач-устройствах
      if (typeof window.initScrollers === 'function') {
        window.initScrollers(parent);
      }
      if (typeof window.initLazyLoad === 'function') {
        window.initLazyLoad(parent);
      }
      if (typeof window.applyMobileButtonClass === 'function') {
        window.applyMobileButtonClass(parent);
      }
    })
    .catch(() => {});
}

/**
 * Загрузка сохранённого города из localStorage в блок ---delivery--city
 * Вызывается при загрузке страницы, после определения города по умолчанию (city.js) и при закрытии панели корзины (cart.js)
 * Если data-city-id изменился — на ---delivery--city вызывается product-city-change
 * (рассчитанная доставка товара перезапрашивается в фоне с лоадером, см. refreshProductDelivery в cart.js)
 */
function loadSavedCity() {
  const cityBlock = document.querySelector('.---delivery--city');
  if (!cityBlock) return;

  const cityId = localStorage.getItem('selected_city_id');
  const cityName = localStorage.getItem('selected_city');
  const cityAddress = localStorage.getItem('selected_city_address') || localStorage.getItem('selected_region');

  if (!cityId) return;

  const cityChanged = cityBlock.dataset.cityId !== cityId;
  cityBlock.dataset.cityId = cityId;

  const selectedEl = cityBlock.querySelector('.---delivery--city--selected');
  if (selectedEl) selectedEl.textContent = cityName || '';

  const regionEl = cityBlock.querySelector('.---delivery--city--region');
  if (regionEl) regionEl.textContent = cityAddress || '';

  if (cityChanged) cityBlock.dispatchEvent(new CustomEvent('product-city-change', { bubbles: true }));
}

/**
 * Recent Products Storage
 * Записывает id текущего товара в список недавно просмотренных (localStorage 'recent')
 * Товар помещается крайним слева, дубликат удаляется, хвост обрезается до 20 записей
 */
function saveRecentProduct() {
  const productEl = document.querySelector('main.product');
  if (!productEl) return;

  const productId = productEl.getAttribute('data-product-id');
  if (!productId) return;

  let list = [];
  try {
    const raw = localStorage.getItem('recent');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch (e) {
    list = [];
  }

  list = list.filter((id) => String(id) !== String(productId));
  list.unshift(productId);
  list = list.slice(0, 20);

  localStorage.setItem('recent', JSON.stringify(list));
}

/**
 * Brand All From Brand
 * Клик по кнопке ---brand--all-from-brand переводит на ссылку из data-brand-url
 */
function initBrandAllFromBrand() {
  const button = document.querySelector('.---brand--all-from-brand');
  if (!button) return;

  button.addEventListener('click', () => {
    const url = button.getAttribute('data-brand-url');
    if (url) window.location.href = url;
  });
}

/**
 * Large Image Back Button
 * Клик по кнопке ---large-image--back-button возвращает на предыдущую страницу
 * Делегируем на document: блок .---large-image--main-image--block
 * пересоздаётся при подмене изображений SKU (reinitProductGallery)
 */
function initLargeImageBackButton() {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('.---large-image--back-button');
    if (!button) return;
    
    e.preventDefault();
    window.history.back();
  });
}

/**
 * Product Warehouses
 * Склады запрашиваются на /post-endpoints/getWarehouses (см. loadProductWarehouses), если они включены для текущего sku
 * (block._warehousesEnabled): при загрузке — если у ---buy-box--in-stock--warehouse стоит __request,
 * при смене sku — по warehouses_status из getSkuData (см. applyProductWarehousesStatus)
 * Первый запрос — после полной загрузки страницы (load), ---in-stock--loading (движущиеся квадратики)
 * показывается сразу и до ответа эндпойнта
 * Если города нет (см. getProductWarehousesCityId) — запрос не уходит, лоадер скрывается
 * Смена города — тот же product-city-change на ---delivery--city, что и у доставки (refreshProductDelivery в cart.js):
 * после load, если склады включены, они перезапрашиваются с новым городом (в т.ч. первый запрос, если города не было)
 * В панели товара страница уже загружена — запрос уходит сразу; блока ---delivery--city в панели нет, город берется из localStorage
 */
function initProductWarehouses() {
  const productEl = document.querySelector('main.product');
  const block = document.querySelector('.---buy-box--in-stock--warehouse');
  if (!productEl || !block) return;

  block._warehousesEnabled = block.classList.contains('__request');

  const loading = productEl.querySelector('.---in-stock--loading');
  if (loading && block._warehousesEnabled) loading.classList.add('__active');

  const cityBlock = productEl.querySelector('.---delivery--city');
  let pageLoaded = false;

  if (cityBlock) {
    cityBlock.addEventListener('product-city-change', () => {
      if (!pageLoaded || !block._warehousesEnabled) return;

      const cityId = getProductWarehousesCityId(productEl);
      if (cityId) loadProductWarehouses(productEl, block, cityId);
    });
  }

  const run = () => {
    pageLoaded = true;
    if (!block._warehousesEnabled) return;

    const cityId = getProductWarehousesCityId(productEl);
    if (cityId) {
      loadProductWarehouses(productEl, block, cityId);
    } else if (loading) {
      loading.classList.remove('__active');
    }
  };

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }
}

/**
 * Город для запроса складов — data-city-id у ---delivery--city
 * Если блока нет (панель покупки из каталога, CatalogBuyPanel в cart.js) — selected_city_id из localStorage
 */
function getProductWarehousesCityId(productEl) {
  const cityBlock = productEl.querySelector('.---delivery--city');
  if (!cityBlock) return (localStorage.getItem('selected_city_id') || '').trim();

  return (cityBlock.dataset.cityId || '').trim();
}

/**
 * Склады при смене sku — warehouses_status из getSkuData (вызывается из applyProductInfo после обновления data-sku-id)
 *   __request — склады включены: запрос на /post-endpoints/getWarehouses как при смене города
 *   (лоадер, уже показанные склады остаются до ответа, см. loadProductWarehouses);
 *   если города нет — блок скрывается (__request), запрос уйдет при product-city-change
 *   __hidden — склады выключены: ответ запроса в полете игнорируется, лоадер и ---in-stock--error скрываются,
 *   ---buy-box--in-stock--warehouse ul очищается, блоку ставится __hidden
 */
function applyProductWarehousesStatus(status) {
  if (status !== '__request' && status !== '__hidden') return;

  const productEl = document.querySelector('main.product');
  const block = document.querySelector('.---buy-box--in-stock--warehouse');
  if (!productEl || !block) return;

  const loading = productEl.querySelector('.---in-stock--loading');

  if (status === '__request') {
    block._warehousesEnabled = true;

    const cityId = getProductWarehousesCityId(productEl);
    if (cityId) {
      loadProductWarehouses(productEl, block, cityId);
      return;
    }

    block._warehousesRequest = null;
    if (loading) loading.classList.remove('__active');
    block.classList.remove('__hidden');
    block.classList.add('__request');
    return;
  }

  block._warehousesEnabled = false;
  block._warehousesRequest = null;
  if (loading) loading.classList.remove('__active');

  const list = block.querySelector('ul');
  if (list) list.innerHTML = '';
  block.classList.remove('__request');
  block.classList.add('__hidden');

  const errorEl = productEl.querySelector('.---in-stock--error');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('__hidden');
  }
}

/**
 * Запрос складов товара для ---buy-box--in-stock--warehouse (см. requestProductWarehouses)
 *   CITY — getProductWarehousesCityId (data-city-id у ---delivery--city, без него — selected_city_id из localStorage), SKU — data-sku-id у main.product
 *   на время запроса у ---in-stock--loading стоит __active, уже показанные склады и ошибка остаются до ответа
 *   ответ обрабатывается не раньше DELIVERY_LOADING_MIN_MS с начала запроса, как у ---delivery--loading (см. waitDeliveryLoadingMin в cart.js)
 *   ответ предыдущего запроса игнорируется, если уже ушел следующий (block._warehousesRequest)
 *   html ответа — заменяет содержимое ---buy-box--in-stock--warehouse ul,
 *   more — true: у ---warehouse--more снимается __hidden, иначе ставится,
 *   блок складов появляется заново с анимацией (__request ставится и снимается, __hidden снимается при любом ответе)
 *   ошибка показывается в ---in-stock--error (снимается __hidden)
 *   при ошибке блок складов скрывается (__request), в т.ч. если до этого склады были показаны
 */
async function loadProductWarehouses(productEl, block, cityId) {
  const loading = productEl.querySelector('.---in-stock--loading');
  const errorEl = productEl.querySelector('.---in-stock--error');
  const list = block.querySelector('ul');
  const more = block.querySelector('.---warehouse--more');

  const request = Symbol();
  block._warehousesRequest = request;

  if (loading) loading.classList.add('__active');

  const startedAt = Date.now();
  const { html, more: hasMore, error } = await requestProductWarehouses(cityId, productEl.getAttribute('data-sku-id') || '', false);

  await waitDeliveryLoadingMin(startedAt);

  if (block._warehousesRequest !== request) return;

  block._warehousesRequest = null;
  if (loading) loading.classList.remove('__active');

  block.classList.remove('__hidden');
  block.classList.add('__request');

  if (!error) {
    if (list) list.innerHTML = html;
    if (more) more.classList.toggle('__hidden', !hasMore);
    void block.offsetWidth;
    block.classList.remove('__request');
  }

  if (errorEl) {
    errorEl.textContent = error;
    errorEl.classList.toggle('__hidden', !error);
  }
}

/**
 * Запрос складов на /post-endpoints/getWarehouses
 *   CITY — uid города, SKU — id sku, all — добавляет ALL=true: все склады (панель «Наличие», см. ProductWarehousesPanel)
 *   возвращает { html, more, error }
 *   ответ json: html — li складов, more — true, если показаны не все склады
 *   ответ текстом без ключа html — error с этим текстом
 *   пустой html (или ошибка сети / пустой текст) — error «Подробная информация по остаткам недоступна»
 */
async function requestProductWarehouses(cityId, skuId, all) {
  const emptyText = 'Подробная информация по остаткам недоступна';

  const params = new URLSearchParams();
  params.set('CITY', cityId);
  params.set('SKU', skuId);
  if (all) params.set('ALL', 'true');

  let error = '';
  let html = '';
  let hasMore = false;

  try {
    const response = await fetch('/post-endpoints/getWarehouses', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params.toString()
    });

    const text = await response.text();

    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }

    if (!data || typeof data !== 'object' || !('html' in data)) {
      error = text.trim() || emptyText;
    } else {
      html = data.html == null ? '' : String(data.html);
      hasMore = data.more === true || data.more === 'true';
      if (!html.trim()) error = emptyText;
    }
  } catch (err) {
    console.error('Ошибка загрузки складов:', err);
    error = emptyText;
  }

  return { html, more: hasMore, error };
}

/**
 * Product Warehouse Panel
 * Информационная правая панель «Размещение», открывается кликом по li в ---buy-box--in-stock--warehouse ul
 * или в mobile-right-panel--content--warehouses ul (панель «Наличие», см. ProductWarehousesPanel) — тогда поверх нее
 *   GET /get-endpoints/getWarehouse?INDEX= — INDEX из data-warehouse-index li, ответ — готовый html,
 *   он вставляется в site-large-text внутри mobile-right-panel--content
 *   пустой ответ, редирект или ошибка сети — в site-large-text текст emptyText
 *   кнопок применения нет: заголовок и close только закрывают панель, повторный клик по тому же li — тоже,
 *   клик по другому li открывает панель с его складом
 *   __warehouse отмечает панель для cart.js — клик в ней не закрывает панель покупки (CatalogBuyPanel)
 */
const PRODUCT_WAREHOUSE_CONFIG = {
  endpoint: '/get-endpoints/getWarehouse',
  panelTitle: 'Размещение',
  emptyText: 'Информация по складу недоступна'
};

window.closeProductWarehousePanel = null;

class ProductWarehousePanel {
  constructor() {
    this.panel = null;
    this.item = null;
    this.textBlock = null;
  }

  createPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __half __scrollable __warehouse';

    const header = document.createElement('div');
    header.className = 'mobile-right-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-right-panel--header--title';
    titleButton.type = 'button';
    titleButton.textContent = PRODUCT_WAREHOUSE_CONFIG.panelTitle;
    titleButton.setAttribute('aria-label', 'Закрыть: ' + PRODUCT_WAREHOUSE_CONFIG.panelTitle);
    titleButton.addEventListener('click', () => this.closePanel());

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-right-panel--close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.addEventListener('click', () => this.closePanel());

    header.appendChild(titleButton);
    header.appendChild(closeButton);

    const content = document.createElement('div');
    content.className = 'mobile-right-panel--content';

    const textBlock = document.createElement('div');
    textBlock.className = 'site-large-text';

    content.appendChild(textBlock);

    panel.appendChild(header);
    panel.appendChild(content);

    document.body.appendChild(panel);

    this.panel = panel;
    this.textBlock = textBlock;
  }

  async openPanel(item) {
    const sameItem = this.panel && this.item === item;

    if (this.panel) {
      this.closePanel();

      if (sameItem) return;
    }

    window.lockPanelScroll(); // счётчиковая блокировка — панель может открываться поверх панели покупки (cart.js)

    this.item = item;
    this.createPanel();

    window.closeProductWarehousePanel = () => this.closePanel();

    const panel = this.panel;

    panel.classList.add('__active');

    const html = await requestProductWarehouse(item.getAttribute('data-warehouse-index') || '');

    if (this.panel !== panel) return;

    if (html.trim()) {
      this.textBlock.innerHTML = html;
    } else {
      this.textBlock.textContent = PRODUCT_WAREHOUSE_CONFIG.emptyText;
    }
  }

  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;

    closingPanel.classList.remove('__active');

    this.panel = null;
    this.item = null;
    this.textBlock = null;

    window.closeProductWarehousePanel = null;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Запрос информации по складу на /get-endpoints/getWarehouse
 * Возвращает html ответа, при ошибке или редиректе (неизвестный эндпойнт, ответ 404) — пустую строку
 */
async function requestProductWarehouse(index) {
  const params = new URLSearchParams({ INDEX: index });

  try {
    const response = await fetch(`${PRODUCT_WAREHOUSE_CONFIG.endpoint}?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    if (!response.ok || response.redirected) return '';

    return await response.text();
  } catch (err) {
    console.error('Ошибка загрузки склада:', err);
    return '';
  }
}

/**
 * Product Warehouses Panel
 * Правая панель «Наличие» со всеми складами, открывается кликом по ---warehouse--more button
 *   склады — тот же /post-endpoints/getWarehouses, что и у ---buy-box--in-stock--warehouse, с ALL=true (см. requestProductWarehouses)
 *   CITY — getProductWarehousesCityId (data-city-id у ---delivery--city, без него — selected_city_id из localStorage), SKU — data-sku-id у main.product, в котором нажата кнопка
 *   после mobile-right-panel--header ставится mobile-right-panel--in-stock--status-info--block с копиями ---in-stock--status и ---in-stock--info из этого main.product
 *   со своими стилями — mobile-right-panel--in-stock--status и mobile-right-panel--in-stock--info (модификаторы __green, __red, __hidden сохраняются)
 *   html ответа вставляется в mobile-right-panel--content--warehouses ul, ошибка — текстом вместо ul
 *   кнопок применения нет: заголовок и close закрывают панель, повторный клик по кнопке — тоже
 *   клик по li открывает поверх панель «Размещение» (ProductWarehousePanel)
 *   __warehouse отмечает панель для cart.js — клик в ней не закрывает панель покупки (CatalogBuyPanel)
 */
const PRODUCT_WAREHOUSES_CONFIG = {
  panelTitle: 'Наличие'
};

window.closeProductWarehousesPanel = null;

class ProductWarehousesPanel {
  constructor() {
    this.panel = null;
    this.button = null;
    this.warehousesBlock = null;
  }

  createPanel(productEl) {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __wide __half __scrollable __warehouse';

    const header = document.createElement('div');
    header.className = 'mobile-right-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-right-panel--header--title';
    titleButton.type = 'button';
    titleButton.textContent = PRODUCT_WAREHOUSES_CONFIG.panelTitle;
    titleButton.setAttribute('aria-label', 'Закрыть: ' + PRODUCT_WAREHOUSES_CONFIG.panelTitle);
    titleButton.addEventListener('click', () => this.closePanel());

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-right-panel--close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.addEventListener('click', () => this.closePanel());

    header.appendChild(titleButton);
    header.appendChild(closeButton);

    const content = document.createElement('div');
    content.className = 'mobile-right-panel--content';

    const warehousesBlock = document.createElement('div');
    warehousesBlock.className = 'mobile-right-panel--content--warehouses';

    content.appendChild(warehousesBlock);

    const statusInfoBlock = document.createElement('div');
    statusInfoBlock.className = 'mobile-right-panel--in-stock--status-info--block';

    const status = productEl.querySelector('.---in-stock--status');
    if (status) {
      const statusClone = status.cloneNode(true);
      statusClone.classList.replace('---in-stock--status', 'mobile-right-panel--in-stock--status');
      statusInfoBlock.appendChild(statusClone);
    }

    const info = productEl.querySelector('.---in-stock--info');
    if (info) {
      const infoClone = info.cloneNode(true);
      infoClone.classList.replace('---in-stock--info', 'mobile-right-panel--in-stock--info');
      statusInfoBlock.appendChild(infoClone);
    }

    panel.appendChild(header);
    panel.appendChild(statusInfoBlock);
    panel.appendChild(content);

    document.body.appendChild(panel);

    this.panel = panel;
    this.warehousesBlock = warehousesBlock;
  }

  async openPanel(button) {
    const sameButton = this.panel && this.button === button;

    if (this.panel) {
      this.closePanel();

      if (sameButton) return;
    }

    const productEl = button.closest('main.product');
    if (!productEl) return;

    window.lockPanelScroll(); // счётчиковая блокировка — панель может открываться поверх панели покупки (cart.js)

    this.button = button;
    this.createPanel(productEl);

    window.closeProductWarehousesPanel = () => this.closePanel();

    const panel = this.panel;

    panel.classList.add('__active');

    const { html, error } = await requestProductWarehouses(
      getProductWarehousesCityId(productEl),
      productEl.getAttribute('data-sku-id') || '',
      true
    );

    if (this.panel !== panel) return;

    if (error) {
      this.warehousesBlock.textContent = error;
      return;
    }

    const list = document.createElement('ul');
    list.innerHTML = html;
    this.warehousesBlock.appendChild(list);
  }

  closePanel() {
    if (!this.panel) return;

    const closingPanel = this.panel;

    closingPanel.classList.remove('__active');

    this.panel = null;
    this.button = null;
    this.warehousesBlock = null;

    window.closeProductWarehousesPanel = null;

    window.unlockPanelScroll();

    setTimeout(() => {
      closingPanel.remove();
    }, 300);
  }
}

/**
 * Инициализация панелей складов: «Размещение» (ProductWarehousePanel) и «Наличие» (ProductWarehousesPanel)
 * Обработчик клика делегированный — li складов перерисовываются (loadProductWarehouses),
 * а main.product приходит и в панели покупки, поэтому вешается на document один раз
 * Клик по ---warehouse--more button закрывает «Размещение» и открывает (или закрывает) «Наличие»
 * Клик вне панели закрывает ее, клик в «Размещении» «Наличие» не закрывает
 * Escape закрывает сначала «Размещение», затем «Наличие»
 */
function initProductWarehousePanel() {
  const warehousePanel = new ProductWarehousePanel();
  const warehousesPanel = new ProductWarehousesPanel();

  document.addEventListener('click', (e) => {
    const moreButton = e.target.closest('.---warehouse--more button');

    if (moreButton) {
      warehousePanel.closePanel();
      warehousesPanel.openPanel(moreButton);
      return;
    }

    const item = e.target.closest('.---buy-box--in-stock--warehouse li, .mobile-right-panel--content--warehouses li');

    if (item) {
      warehousePanel.openPanel(item);
      return;
    }

    if (warehousePanel.panel && !warehousePanel.panel.contains(e.target)) {
      warehousePanel.closePanel();
    }

    if (
      warehousesPanel.panel &&
      !warehousesPanel.panel.contains(e.target) &&
      !e.target.closest('.mobile-right-panel.__warehouse')
    ) {
      warehousesPanel.closePanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    if (warehousePanel.panel) {
      e.stopImmediatePropagation();
      warehousePanel.closePanel();
      return;
    }

    if (warehousesPanel.panel) {
      e.stopImmediatePropagation();
      warehousesPanel.closePanel();
    }
  });
}

/**
 * Product Panel Init
 * Инициализация main.product, подгруженного в панель (cart.js, CatalogBuyPanel)
 * Панель открывается только вне страницы товара — main.product на странице один,
 * поэтому document-скоуп функций выше подходит без изменений
 * Адрес страницы (SKU, OPTIONS) не трогается, галерея пересоздаётся
 * Возвращает destroy — снимает document-слушатели галереи при закрытии панели
 */
function initProductPanel(root) {
  if (productGalleryInstance && typeof productGalleryInstance.destroy === 'function') {
    productGalleryInstance.destroy();
    productGalleryInstance = null;
  }
  
  initProductGallery();
  initProductOptions();
  initBlockOptionWide();
  initToggleOptions();
  initSelectOptions();
  initListOptions();
  initSkuSync({ syncUrl: false });
  initWildOptionsPrice();
  initProductWarehouses();
  
  initOptionsToTop(root || document.querySelector('.mobile-right-panel main.product'));
  
  return {
    destroy() {
      if (productGalleryInstance && typeof productGalleryInstance.destroy === 'function') {
        productGalleryInstance.destroy();
        productGalleryInstance = null;
      }
    }
  };
}

window.initProductPanel = initProductPanel;

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initProductOptions();
    initBlockOptionWide();
    initToggleOptions();
    initSelectOptions();
    initListOptions();
    initSkuSync();
    initWildOptionsPrice();
    initWildOptionsUrlSync();
    initProductColumnsSticky();
    initFloatingBuyButton();
    initPriceBlockRelocate();
    initPointsUnderOldprice();
    initProductDescriptionSections();
    initHideEmptyProductTabs();
    initProductTabs();
    initLargeParamsAccordion();
    initVideoTitleToggle();
    loadSavedCity();
    initBuyBoxRelocate();
    initOptionsToTop();
    initInterestingItems();
    initBrandAllFromBrand();
    initLargeImageBackButton();
    initProductWarehouses();
    initProductWarehousePanel();
  });
} else {
  initProductOptions();
  initBlockOptionWide();
  initToggleOptions();
  initSelectOptions();
  initListOptions();
  initSkuSync();
  initWildOptionsPrice();
  initWildOptionsUrlSync();
  initProductColumnsSticky();
  initFloatingBuyButton();
  initPriceBlockRelocate();
  initPointsUnderOldprice();
  initProductDescriptionSections();
  initHideEmptyProductTabs();
  initProductTabs();
  initLargeParamsAccordion();
  initVideoTitleToggle();
  loadSavedCity();
  initBuyBoxRelocate();
  initOptionsToTop();
  initInterestingItems();
  saveRecentProduct();
  initBrandAllFromBrand();
  initLargeImageBackButton();
  initProductWarehouses();
  initProductWarehousePanel();
}
