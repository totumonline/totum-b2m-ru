/**
 * Video
 * Управление видео для любого элемента с data-video и/или data-mobile-video:
 * создание video-элементов, ленивая загрузка, воспроизведение, пауза,
 * переключение desktop/mobile по ширине окна, пауза во время pinch-zoom
 *
 * Использование:
 *   const player = VideoPlayer.create(element); // null если у элемента нет data-video
 *   player.activate();                          // элемент показан: грузим и играем
 *   player.deactivate();                        // элемент скрыт: пауза
 *   player.suspend('visibility');               // временная пауза по причине
 *   player.resume('visibility');                // снятие временной паузы
 *   player.pauseByUser();                       // пауза пользователем (переживает deactivate / activate)
 *   player.resumeByUser();                      // снятие паузы пользователем
 *   player.observeVisibility();                 // автоматические activate/suspend по viewport
 *   player.destroy();
 *
 * data-атрибуты и место вставки video-элементов могут быть на разных элементах:
 *   VideoPlayer.create(main, { container: block });
 */

const VIDEO_MOBILE_BREAKPOINT = 900;
const VIDEO_CROSSFADE_DURATION = 2200;

// Индикатор загрузки видео
const VIDEO_BANNER_SELECTOR = 'section.banner';
const VIDEO_LOADING_SELECTOR = '.loading-video';
const VIDEO_LOADING_CLASS = '__loading';

class VideoPlayer {
  constructor(element, options = {}) {
    // Элемент с data-video / data-mobile-video
    this.element = element;
    // Элемент, в который вставляются video-элементы
    this.container = options.container || element;
    this.desktopUrl = (element.dataset.video || '').trim();
    this.mobileUrl = (element.dataset.mobileVideo || '').trim();

    // Зацикливание (выключается, когда нужно событие окончания)
    this.loop = options.loop !== false;
    // Коллбэк окончания воспроизведения, получает сам плеер
    this.onEnded = typeof options.onEnded === 'function' ? options.onEnded : null;
    // На паузе скрывать видео (показать картинку/постер под ним) вместо стоп-кадра
    this.hideWhenPaused = options.hideWhenPaused === true;
    // Показывать видео сразу после загрузки, не дожидаясь воспроизведения
    this.showWhenLoaded = options.showWhenLoaded === true;
    this.preload = options.preload || '';

    this.desktopVideo = null;
    this.mobileVideo = null;

    // Элемент показан (грузим и играем)
    this.isActive = false;
    // Причины временной паузы (вне зоны видимости, pinch-zoom и т.д.)
    this.suspendReasons = new Set();
    // Пауза пользователем — не снимается при deactivate / activate
    this.isPausedByUser = false;

    // Индикатор загрузки (может отсутствовать, в баннере общий для всех слайдов)
    this.loadingIndicator = VideoPlayer.findLoadingIndicator(element, this.container);

    if (this.desktopUrl) {
      this.desktopVideo = this.createVideoElement('desktop');
    }

    if (this.mobileUrl) {
      this.mobileVideo = this.createVideoElement('mobile');
      this.mobileVideo.classList.add('__mobile');
    }

    // Начальный режим по ширине окна
    this.mode = this.computeMode();

    VideoPlayer.register(this);
  }

  createVideoElement(mode) {
    const video = document.createElement('video');
    video.setAttribute('pip', 'false');
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.loop = this.loop;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    if (this.preload) video.preload = this.preload;

    video.addEventListener('loadeddata', () => this.handleLoaded(mode));
    video.addEventListener('playing', () => this.handlePlaying(mode));
    video.addEventListener('ended', () => this.handleEnded(mode));
    video.addEventListener('error', () => {
      video.classList.remove('__ready');
      this.setLoading(false);
    });

    this.container.insertBefore(video, this.container.firstChild);
    return video;
  }

  /**
   * Актуальный режим видео:
   * - 'mobile'  — если задано мобильное видео и ширина окна < брейкпоинта
   * - 'desktop' — во всех остальных случаях (если десктопного видео нет — покажется постер)
   */
  computeMode() {
    const isMobileWidth = window.innerWidth < VIDEO_MOBILE_BREAKPOINT;
    if (this.mobileVideo && isMobileWidth) return 'mobile';
    return 'desktop';
  }

  getVideo(mode = this.mode) {
    return mode === 'mobile' ? this.mobileVideo : this.desktopVideo;
  }

  getUrl(mode = this.mode) {
    return mode === 'mobile' ? this.mobileUrl : this.desktopUrl;
  }

  getOtherVideo(mode = this.mode) {
    return mode === 'mobile' ? this.desktopVideo : this.mobileVideo;
  }

  get isSuspended() {
    return this.isPausedByUser || this.suspendReasons.size > 0;
  }

  /**
   * Обработчик loadeddata: запускаем видео, только если режим совпадает
   * (мог переключиться во время загрузки) и плеер действительно должен играть.
   * Предзагруженное, но не активное видео остаётся скрытым — __ready ставится
   * в playActiveVideo вместе со стартом воспроизведения.
   * Исключение — showWhenLoaded: видео заменяет картинку сразу по загрузке
   * и дальше только играет или стоит на паузе
   */
  handleLoaded(mode) {
    if (this.mode !== mode) return;

    this.refreshLoading();

    if (this.showWhenLoaded) this.markReady();

    if (!this.isActive || this.isSuspended) return;

    this.playActiveVideo();
  }

  /**
   * Обработчик playing: показываем видео по факту старта воспроизведения —
   * на момент вызова play() данных могло не быть (например после перемотки в начало)
   */
  handlePlaying(mode) {
    if (this.mode !== mode) return;
    if (!this.isActive || this.isSuspended) return;

    this.markReady();
  }

  /**
   * Обработчик ended: срабатывает только без loop и только для активного видео
   */
  handleEnded(mode) {
    if (this.mode !== mode) return;
    if (!this.isActive || this.isSuspended) return;
    if (this.onEnded) this.onEnded(this);
  }
  
  /**
   * Ленивая загрузка: назначаем src только когда видео действительно нужно
   */
  load() {
    const video = this.getVideo();
    const url = this.getUrl();
    if (!video || !url) return;
    if (video.src) return; // уже грузится/загружено
    video.src = url;

    this.refreshLoading();

    if (this.showWhenLoaded) this.primeFirstFrame(video);
  }

  /**
   * Индикатор загрузки: пока активное видео не набрало данных для показа,
   * на .loading-video внутри section.banner стоит __loading
   */
  refreshLoading() {
    const video = this.getVideo();
    const isLoading = !!(
      video &&
      video.src &&
      this.isActive &&
      !this.isSuspended &&
      video.readyState < 2
    );

    this.setLoading(isLoading);
  }

  /**
   * Индикатор общий для всех слайдов, но относится только к текущему: включить его
   * может лишь активный слайд (проверка в refreshLoading), а снять — только тот,
   * кто включил. Фоновая загрузка соседних слайдов индикатор не трогает
   */
  setLoading(isLoading) {
    const indicator = this.loadingIndicator;
    if (!indicator) return;

    if (isLoading) {
      VideoPlayer.loadingOwners.set(indicator, this);
      indicator.classList.add(VIDEO_LOADING_CLASS);
      return;
    }

    if (VideoPlayer.loadingOwners.get(indicator) !== this) return;

    VideoPlayer.loadingOwners.delete(indicator);
    indicator.classList.remove(VIDEO_LOADING_CLASS);
  }

  /**
   * iOS не буферизует данные до вызова play() — без прогрева loadeddata не наступает
   * и видео заменяет картинку только когда слайд поехал.
   * Коротко запускаем воспроизведение (видео всегда muted + playsinline) и сразу
   * возвращаемся на первый кадр, если этот плеер не должен играть
   */
  primeFirstFrame(video) {
    video
      .play()
      .then(() => {
        if (this.isActive && !this.isSuspended) return;

        video.pause();
        video.currentTime = 0;
      })
      .catch(() => {});
  }

  /**
   * Элемент стал видимым: грузим и запускаем
   */
  activate() {
    this.isActive = true;
    this.suspendReasons.clear();
    this.load();
    this.playActiveVideo();
    this.refreshLoading();
  }

  /**
   * Запуск с начала: в очереди одно и то же видео получает свой ход снова,
   * а доигравший элемент стоит на конце — перематываем явно.
   * При паузе пользователем не перематываем — остаётся стоп-кадр, где остановили
   */
  restart() {
    const video = this.getVideo();
    if (!this.isPausedByUser && video && video.readyState >= 1 && video.currentTime > 0) {
      video.currentTime = 0;
    }

    this.activate();
  }

  /**
   * Элемент скрыт: ставим на паузу оба варианта видео
   */
  deactivate() {
    this.isActive = false;
    this.suspendReasons.clear();
    this.pauseAll();
    this.setLoading(false);
  }

  /**
   * Временная пауза с указанием причины (причин может быть несколько одновременно)
   */
  suspend(reason = 'default') {
    this.suspendReasons.add(reason);
    this.pauseAll();
    this.setLoading(false);
  }

  /**
   * Снятие временной паузы: воспроизведение возобновляется только когда снята
   * последняя причина и элемент активен
   */
  resume(reason = 'default') {
    this.suspendReasons.delete(reason);
    if (!this.isActive || this.isSuspended) return;
    this.playActiveVideo();
    this.refreshLoading();
  }

  /**
   * Пауза пользователем (клик по видео): в отличие от suspend переживает
   * deactivate / activate — видео остаётся на паузе после ухода с экрана
   * и возврата, пока пользователь сам не запустит его (resumeByUser)
   */
  pauseByUser() {
    this.isPausedByUser = true;
    this.pauseAll();
    this.setLoading(false);
  }

  /**
   * Снятие паузы пользователем: играем, если элемент активен и нет других причин паузы
   */
  resumeByUser() {
    this.isPausedByUser = false;
    if (!this.isActive || this.isSuspended) return;
    this.playActiveVideo();
    this.refreshLoading();
  }

  /**
   * Запуск активного видео (не играем при pinch-zoom и паузе пользователем)
   */
  playActiveVideo() {
    if (isPinchZoomed()) return;
    if (this.isPausedByUser) return;

    const video = this.getVideo();
    if (!video) return;

    video.play().catch(() => {});

    // Если данные уже загружены — показываем сразу, иначе ждём playing
    if (video.readyState >= 2) this.markReady();
  }

  /**
   * Показываем активное видео и снимаем показ со второго — кроссфейд делает CSS
   */
  markReady() {
    const video = this.getVideo();
    if (!video) return;

    this.setLoading(false);

    if (video.classList.contains('__ready')) return;

    video.classList.add('__ready');

    const otherVideo = this.getOtherVideo();
    if (otherVideo) otherVideo.classList.remove('__ready');
  }

  /**
   * Останавливаем оба варианта (во время кроссфейда могут играть оба)
   */
  pauseAll() {
    if (this.desktopVideo) {
      this.desktopVideo.pause();
      if (this.hideWhenPaused) this.desktopVideo.classList.remove('__ready');
    }
    if (this.mobileVideo) {
      this.mobileVideo.pause();
      if (this.hideWhenPaused) this.mobileVideo.classList.remove('__ready');
    }
  }

  handleResize() {
    // Реагируют на ресайз только элементы с мобильным видео
    // (если десктопного нет — переключаемся между mobile и постером)
    if (!this.mobileVideo) return;

    const newMode = this.computeMode();
    if (this.mode === newMode) return;

    this.switchMode(newMode);
  }

  /**
   * Переключает активное видео между desktop/mobile.
   * Для видимого элемента: грузит новое (если есть), запускает в фоне, после загрузки
   * CSS делает кроссфейд (1с задержка + 1с транзишн), старое ставится на паузу.
   * Если видео для нового режима нет (например задан только мобильный, а ширина
   * десктопная) — со старого снимается __ready и показывается постер.
   * Для невидимых элементов: только обновляет режим и ставит старое на паузу.
   */
  switchMode(newMode) {
    const oldVideo = this.getVideo(this.mode);
    const newVideo = this.getVideo(newMode);
    const newUrl = this.getUrl(newMode);

    this.mode = newMode;

    if (!this.isActive) {
      // Элемент не виден — новое видео не грузим (ленивая загрузка).
      // При активации load / playActiveVideo корректно переключат __ready.
      if (oldVideo) {
        oldVideo.classList.remove('__ready');
        oldVideo.pause();
      }
      return;
    }

    if (newVideo) {
      if (!newVideo.src && newUrl) {
        newVideo.src = newUrl;
      }

      if (!this.isSuspended && !isPinchZoomed()) {
        newVideo.play().catch(() => {});
      }

      if (newVideo.readyState >= 2) {
        // Уже загружено — переключаем классы немедленно
        newVideo.classList.add('__ready');
        if (oldVideo) oldVideo.classList.remove('__ready');
      }
      // Если ещё не загружено — handleLoaded переключит __ready, когда данные подгрузятся
    } else if (oldVideo) {
      // Нет видео для нового режима — снимаем __ready, чтобы показать постер
      oldVideo.classList.remove('__ready');
    }

    this.refreshLoading();

    // Останавливаем старое видео после завершения опасити-перехода
    if (oldVideo) {
      setTimeout(() => {
        if (this.mode !== newMode) return;
        oldVideo.pause();
        oldVideo.classList.remove('__ready');
      }, VIDEO_CROSSFADE_DURATION);
    }
  }

  /**
   * Автоматическое управление по зоне видимости: в видимости — грузим и играем,
   * за пределами (+/- 100px по вертикали) — пауза.
   * Используется для одиночных видео вне скроллеров (скроллер управляет сам)
   */
  observeVisibility(target = this.container) {
    if (typeof IntersectionObserver === 'undefined') {
      this.activate();
      return;
    }
    
    this._visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      
      if (entry.isIntersecting) {
        if (this.isActive) {
          this.resume('visibility');
        } else {
          this.activate();
        }
      } else if (this.isActive) {
        this.suspend('visibility');
      }
    }, {
      rootMargin: '100px 0px 100px 0px',
      threshold: 0
    });
    
    this._visibilityObserver.observe(target);
  }
  
  destroy() {
    this.pauseAll();
    this.setLoading(false);
    if (this._visibilityObserver) {
      this._visibilityObserver.disconnect();
      this._visibilityObserver = null;
    }
    if (this.desktopVideo) this.desktopVideo.remove();
    if (this.mobileVideo) this.mobileVideo.remove();
    this.desktopVideo = null;
    this.mobileVideo = null;
    VideoPlayer.unregister(this);
  }
}

/**
 * Статика VideoPlayer
 * Фабрика, реестр экземпляров и общие обработчики окна (resize, pinch-zoom)
 */

VideoPlayer.instances = new Set();
VideoPlayer.globalHandlersReady = false;
// Индикатор загрузки -> плеер слайда, который его включил
VideoPlayer.loadingOwners = new WeakMap();

/**
 * Поиск индикатора загрузки для двух случаев разной разметки:
 * - видео задано на main, video-элементы и .loading-video лежат в блоке
 *   заголовка страницы / каталога — тогда индикатор внутри контейнера
 * - видео задано на слайде баннера — индикатор лежит вне слайда,
 *   общий для всей section.banner
 */
VideoPlayer.findLoadingIndicator = (element, container) => {
  const inContainer = container && typeof container.querySelector === 'function'
    ? container.querySelector(VIDEO_LOADING_SELECTOR)
    : null;
  if (inContainer) return inContainer;

  if (!element || typeof element.closest !== 'function') return null;

  const banner = element.closest(VIDEO_BANNER_SELECTOR);
  if (!banner) return null;

  return banner.querySelector(VIDEO_LOADING_SELECTOR);
};

/**
 * Создаёт плеер для элемента. Возвращает null, если у элемента нет непустых
 * data-video / data-mobile-video
 */
VideoPlayer.create = (element, options = {}) => {
  if (!element || !element.dataset) return null;

  const url = (element.dataset.video || '').trim();
  const mobileUrl = (element.dataset.mobileVideo || '').trim();
  if (!url && !mobileUrl) return null;

  return new VideoPlayer(element, options);
};

/**
 * Создаёт плееры для всех элементов внутри root, у которых задано видео
 */
VideoPlayer.createAll = (root = document) => {
  const elements = root.querySelectorAll('[data-video], [data-mobile-video]');
  return Array.from(elements)
    .map((element) => VideoPlayer.create(element))
    .filter((player) => player !== null);
};

VideoPlayer.register = (player) => {
  VideoPlayer.instances.add(player);
  VideoPlayer.initGlobalHandlers();
};

VideoPlayer.unregister = (player) => {
  VideoPlayer.instances.delete(player);
};

/**
 * Общие для всех плееров обработчики окна подключаются один раз:
 * - resize: переключение между десктопным и мобильным видео
 * - pinchZoomChange: пауза видео на время pinch-zoom
 */
VideoPlayer.initGlobalHandlers = () => {
  if (VideoPlayer.globalHandlersReady) return;
  VideoPlayer.globalHandlersReady = true;

  ResizeDispatcher.onResizeDebounced(() => {
    VideoPlayer.instances.forEach((player) => player.handleResize());
  });

  window.addEventListener('pinchZoomChange', (e) => {
    const isZoomed = !!(e.detail && e.detail.isZoomed);

    VideoPlayer.instances.forEach((player) => {
      if (isZoomed) {
        player.suspend('pinch-zoom');
      } else {
        player.resume('pinch-zoom');
      }
    });
  });
};

window.VideoPlayer = VideoPlayer;

/**
 * Video Queue
 * Группа видео, из которой одновременно играет только одно.
 * Видео грузится, когда его элемент попадает в зону видимости, а воспроизводятся
 * видимые по очереди: следующее стартует, когда текущее доиграло или ушло с экрана.
 *
 * Покрывает оба случая товарной галереи:
 * - карусель — на экране один слайд, играет только он
 * - все картинки сразу (__spv) — вся группа проигрывается по кругу (ignoreVisibility)
 *
 * Опция preloadAll — не ждать зону видимости, а грузить все видео группы
 * последовательно сразу после загрузки страницы.
 * Опция ignoreVisibility — крутить всю группу общим лупом без привязки к зоне
 * видимости (все элементы показаны сразу и крупные — порог видимости только мешает)
 * Опция carousel — режим карусели: видео заменяет картинку сразу по загрузке
 * и больше не прячется, а по входу/уходу слайда только запускается и встаёт на паузу:
 * кроссфейда во время движения нет, а старт не ждёт остановки карусели
 * Опция root — прокручиваемый контейнер карусели: видимость слайдов считается
 * относительно него (только листание), а уход всей группы с экрана при прокрутке
 * страницы — временная пауза без потери хода (видео продолжает с места остановки)
 */

const VIDEO_QUEUE_THRESHOLD = 0.5;
const VIDEO_QUEUE_CAROUSEL_THRESHOLDS = [0, 1];
const VIDEO_QUEUE_PRELOAD_TIMEOUT = 10000;

class VideoQueue {
  constructor(elements, options = {}) {
    this.threshold = options.threshold || VIDEO_QUEUE_THRESHOLD;
    // Грузить все видео сразу, не дожидаясь зоны видимости
    this.preloadAll = options.preloadAll === true;
    // Крутить всю группу по кругу, не следя за зоной видимости
    this.ignoreVisibility = options.ignoreVisibility === true;
    // Слайды карусели: видео всегда на экране, по движению только play / pause
    this.carousel = options.carousel === true;
    // Прокручиваемый контейнер карусели — root для observer слайдов
    this.root = options.root || null;
    this.players = [];
    this.visiblePlayers = new Set();
    this.currentPlayer = null;
    this.observer = null;
    this.viewportObserver = null;
    this.preloadTimer = null;
    this.preloadStartHandler = null;
    // Последняя доля видимости слайда — по ней определяется направление движения
    this.ratios = new Map();
    
    Array.from(elements).forEach((element) => {
      const player = VideoPlayer.create(element, {
        loop: false,
        hideWhenPaused: !this.carousel,
        showWhenLoaded: this.carousel,
        preload: 'auto',
        onEnded: (endedPlayer) => this.playNext(endedPlayer)
      });
      if (player) this.players.push(player);
    });
    
    if (!this.players.length) return;
    
    this.initPlayback();
    
    if (this.preloadAll) this.startPreload();
  }
  
  /**
   * Общий луп по всей группе либо воспроизведение по зоне видимости
   */
  initPlayback() {
    if (this.ignoreVisibility || typeof IntersectionObserver === 'undefined') {
      this.players.forEach((player) => this.visiblePlayers.add(player));
      this.playNext();
      return;
    }
    
    this.initObserver();
  }
  
  get hasVideo() {
    return this.players.length > 0;
  }
  
  initObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const player = this.getPlayerByContainer(entry.target);
        if (!player) return;
        
        if (this.carousel) {
          this.handleRatio(player, entry.intersectionRatio);
          return;
        }
        
        if (entry.isIntersecting) {
          this.handleVisible(player);
        } else {
          this.handleHidden(player);
        }
      });
    }, {
      root: this.root,
      threshold: this.carousel ? VIDEO_QUEUE_CAROUSEL_THRESHOLDS : this.threshold
    });
    
    this.players.forEach((player) => this.observer.observe(player.container));
    
    if (this.root) this.initViewportObserver();
  }
  
  /**
   * С root observer слайдов не видит прокрутку страницы, поэтому уход группы
   * с экрана отслеживается отдельно: это временная пауза (suspend), а не уход слайда —
   * ход в очереди сохраняется, и при возврате видео продолжает с места остановки
   */
  initViewportObserver() {
    this.viewportObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      
      this.players.forEach((player) => {
        if (entry.isIntersecting) {
          player.resume('visibility');
        } else {
          player.suspend('visibility');
        }
      });
    }, {
      threshold: 0
    });
    
    this.viewportObserver.observe(this.root);
  }
  
  getPlayerByContainer(container) {
    return this.players.find((player) => player.container === container) || null;
  }
  
  /**
   * Карусель: направление движения слайда считаем по изменению доли видимости
   * (с root — только внутри карусели, прокрутка страницы сюда не попадает):
   * начал входить в кадр — стартуем, начал уходить — пауза.
   * Само видео остаётся на экране — на паузе виден стоп-кадр, а не картинка
   */
  handleRatio(player, ratio) {
    const previousRatio = this.ratios.get(player) || 0;
    this.ratios.set(player, ratio);
    
    if (ratio > previousRatio) {
      this.handleVisible(player);
      return;
    }
    
    if (ratio < previousRatio) {
      this.handleHidden(player);
    }
  }
  
  /**
   * Карусель: явная передача хода слайду.
   * Кнопки навигации и миниатюры переключают слайд мгновенно — промежуточных
   * значений видимости нет, и по ним нельзя определить направление движения,
   * поэтому активный слайд задаётся напрямую.
   * Слайд без видео просто останавливает всю группу.
   * Метод идемпотентен: пришедшие следом события observer уже ничего не меняют
   */
  setCurrentSlide(container) {
    if (!this.carousel) return;

    const player = container ? this.getPlayerByContainer(container) : null;

    this.players.forEach((other) => {
      if (other === player) return;
      this.visiblePlayers.delete(other);
      other.deactivate();
    });

    if (!player) {
      this.currentPlayer = null;
      return;
    }

    this.handleVisible(player);
  }

  /**
   * Запуск видео по клику пользователя: слайд, по которому кликнули, на экране —
   * делаем его текущим, даже если observer не передал ему ход или браузер
   * не дал запустить автовоспроизведение (iOS в режиме энергосбережения).
   * Снимаем паузу пользователем и играем с места остановки внутри жеста,
   * поэтому play() не блокируется
   */
  playByUser(player) {
    if (!player) return;

    this.visiblePlayers.add(player);

    if (this.currentPlayer && this.currentPlayer !== player) {
      this.currentPlayer.deactivate();
    }

    this.currentPlayer = player;
    player.isPausedByUser = false;
    player.activate();
  }

  /**
   * Не мешаем основной загрузке страницы: если она ещё идёт — ждём window.load
   */
  startPreload() {
    if (document.readyState === 'complete') {
      this.preloadSequentially(0);
      return;
    }
    
    this.preloadStartHandler = () => this.preloadSequentially(0);
    window.addEventListener('load', this.preloadStartHandler, { once: true });
  }
  
  /**
   * Последовательная предзагрузка: следующее видео начинает грузиться, когда
   * предыдущее буферизовано или упало с ошибкой — чтобы не занимать канал всеми сразу.
   * Таймаут — страховка от зависшей загрузки, иначе очередь встанет
   */
  preloadSequentially(index) {
    const player = this.players[index];
    if (!player) return;
    
    const video = player.getVideo();
    if (!video) {
      this.preloadSequentially(index + 1);
      return;
    }
    
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      
      if (this.preloadTimer) {
        clearTimeout(this.preloadTimer);
        this.preloadTimer = null;
      }
      
      this.preloadSequentially(index + 1);
    };
    
    if (video.readyState >= 3) {
      advance();
      return;
    }
    
    video.addEventListener('canplaythrough', advance, { once: true });
    video.addEventListener('error', advance, { once: true });
    this.preloadTimer = setTimeout(advance, VIDEO_QUEUE_PRELOAD_TIMEOUT);
    
    player.load();
  }
  
  /**
   * Элемент появился на экране: сразу грузим видео, но играем только если
   * сейчас ничего не играет
   */
  handleVisible(player) {
    this.visiblePlayers.add(player);
    player.load();
    
    // В карусели ход сразу переходит к приехавшему слайду
    if (!this.currentPlayer || (this.carousel && this.currentPlayer !== player)) {
      this.play(player);
    }
  }
  
  /**
   * Элемент ушёл с экрана: останавливаем и, если играл он, передаём очередь дальше
   */
  handleHidden(player) {
    this.visiblePlayers.delete(player);
    player.deactivate();
    
    if (this.currentPlayer === player) {
      this.currentPlayer = null;
      this.playNext(player);
    }
  }
  
  play(player) {
    if (this.currentPlayer && this.currentPlayer !== player) {
      this.currentPlayer.deactivate();
    }
    
    this.currentPlayer = player;
    // Каждый ход в очереди начинается с первого кадра, в том числе повторный
    player.restart();
  }
  
  /**
   * Передаёт очередь следующему видимому видео.
   * Если видимое одно — оно запускается заново (эффект зацикливания)
   */
  playNext(afterPlayer = this.currentPlayer) {
    const next = this.getNextVisible(afterPlayer);
    
    if (!next) {
      if (this.currentPlayer) {
        this.currentPlayer.deactivate();
        this.currentPlayer = null;
      }
      return;
    }
    
    this.play(next);
  }
  
  /**
   * Следующее видимое видео в порядке DOM, по кругу от переданного
   */
  getNextVisible(afterPlayer) {
    if (!this.visiblePlayers.size) return null;
    
    const total = this.players.length;
    const startIndex = afterPlayer ? this.players.indexOf(afterPlayer) : -1;
    
    for (let step = 1; step <= total; step++) {
      const player = this.players[(startIndex + step + total) % total];
      if (this.visiblePlayers.has(player)) return player;
    }
    
    return null;
  }
  
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.viewportObserver) {
      this.viewportObserver.disconnect();
      this.viewportObserver = null;
    }
    
    if (this.preloadTimer) {
      clearTimeout(this.preloadTimer);
      this.preloadTimer = null;
    }
    
    if (this.preloadStartHandler) {
      window.removeEventListener('load', this.preloadStartHandler);
      this.preloadStartHandler = null;
    }
    
    this.ratios.clear();
    this.players.forEach((player) => player.destroy());
    this.players = [];
    this.visiblePlayers.clear();
    this.currentPlayer = null;
  }
}

/**
 * Создаёт очередь для набора элементов. Возвращает null, если ни у одного
 * из них нет непустых data-video / data-mobile-video
 */
VideoQueue.create = (elements, options = {}) => {
  const queue = new VideoQueue(elements, options);
  if (queue.hasVideo) return queue;
  
  queue.destroy();
  return null;
};

window.VideoQueue = VideoQueue;

/**
 * Page Video
 * Видео вместо бекграунда в блоке заголовка страницы:
 * data-video / data-mobile-video задаются на main, а video-элементы вставляются в
 * .catalog--title-categories--block или .page--title-categories--block
 * (на странице есть только один из них).
 * Постер остаётся в ::before под видео — видео повторяет его геометрию (выходит наверх
 * за пределы блока под шапку) и появляется поверх постера кроссфейдом через __ready.
 * Индикатор загрузки (.loading-video) тоже лежит в этом блоке
 */

const PAGE_VIDEO_BLOCK_SELECTOR = '.catalog--title-categories--block, .page--title-categories--block';

function initPageVideo() {
  const main = document.querySelector('main');
  if (!main) return null;

  const block = main.querySelector(PAGE_VIDEO_BLOCK_SELECTOR);
  if (!block) return null;

  const player = VideoPlayer.create(main, { container: block });
  if (!player) return null;

  // Собственный бекграунд блока убирается, иначе он перекроет видео
  block.classList.add('__video');

  player.observeVisibility();
  return player;
}

document.addEventListener('DOMContentLoaded', () => {
  initPageVideo();
});
