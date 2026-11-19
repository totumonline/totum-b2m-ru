/**
 * Item Scroller Component
 * Отображает увеличенную картинку при наведении на li (десктоп)
 * или по прокрутке карусели (тачскрин с coarse pointer)
 */

/**
 * Декодирует строку из base64 в UTF-8 (корректно обрабатывает кириллицу).
 */
function decodeBase64Utf8(str) {
  const binary = atob(str);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Применяет данные активного SKU к article.item.__sku-show:
 * - data-sku-title → .item--name
 * - data-sku-price → .item--price
 * - data-sku-old-price → .item--old-price (пустое значение → класс __hidden)
 * - data-sku-points → .item--points (пустое значение → класс __hidden)
 * - data-sku-discount → .item--markers > span.__item-discount (0 или "" → удаляем span, иначе создаём/обновляем)
 * - data-sku-custom → .item--custom (значение раскодируется из base64 и вставляется как HTML)
 * - data-sku-id → GET-параметр SKU= во всех ссылках товара (кроме миниатюр SKU)
 */
function applySkuMetaToItem(item, activeLi) {
  if (!item || !activeLi) return;
  
  const skuId = activeLi.dataset.skuId || '';
  const skuTitle = activeLi.dataset.skuTitle;
  const skuPrice = activeLi.dataset.skuPrice;
  const skuOldPrice = activeLi.dataset.skuOldPrice;
  const skuPoints = activeLi.dataset.skuPoints;
  const skuDiscount = activeLi.dataset.skuDiscount;
  const skuCustom = activeLi.dataset.skuCustom;
  
  if (skuTitle != null) {
    const nameEl = item.querySelector('.item--name');
    if (nameEl) nameEl.textContent = skuTitle;
  }
  
  if (skuPrice != null) {
    const priceEl = item.querySelector('.item--price');
    if (priceEl) priceEl.textContent = skuPrice;
  }
  
  if (skuOldPrice != null) {
    const oldPriceEl = item.querySelector('.item--old-price');
    if (oldPriceEl) {
      oldPriceEl.textContent = skuOldPrice;
      if (skuOldPrice === '') {
        oldPriceEl.classList.add('__hidden');
      } else {
        oldPriceEl.classList.remove('__hidden');
      }
    }
  }
  
  if (skuPoints != null) {
    const pointsEl = item.querySelector('.item--points');
    if (pointsEl) {
      pointsEl.textContent = skuPoints;
      if (skuPoints === '') {
        pointsEl.classList.add('__hidden');
      } else {
        pointsEl.classList.remove('__hidden');
      }
    }
  }
  
  if (skuDiscount != null) {
    const markersEl = item.querySelector('.item--markers');
    if (markersEl) {
      const discountEl = markersEl.querySelector('.__item-discount');
      const hasDiscount = skuDiscount !== '' && skuDiscount !== '0';
      
      if (discountEl && !hasDiscount) {
        discountEl.remove();
      } else if (discountEl && hasDiscount) {
        discountEl.textContent = `-${skuDiscount}%`;
      } else if (!discountEl && hasDiscount) {
        const newDiscountEl = document.createElement('span');
        newDiscountEl.className = '__item-discount';
        newDiscountEl.textContent = `-${skuDiscount}%`;
        markersEl.appendChild(newDiscountEl);
      }
    }
  }
  
  if (skuCustom != null) {
    const customEl = item.querySelector('.item--custom');
    if (customEl) {
      customEl.innerHTML = skuCustom === '' ? '' : decodeBase64Utf8(skuCustom);
    }
  }
  
  if (skuId) {
    // Обновляем GET-параметр SKU во всех ссылках товара,
    // кроме тех, что внутри списка миниатюр SKU
    item.querySelectorAll('a').forEach(a => {
      if (a.closest('.item--sku-show')) return;
      const raw = a.getAttribute('href');
      const url = new URL(raw, document.baseURI);
      url.searchParams.set('SKU', skuId);
      const isAbsolute = /^[a-z][a-z0-9+\-.]*:/i.test(raw) || raw.startsWith('//');
      a.setAttribute('href', isAbsolute ? url.toString() : url.pathname + url.search + url.hash);
    });
  }
}

class ItemScroller {
  constructor(element, onFirstLoaded) {
    this.container = element;
    this.ul = element.querySelector('ul');
    this.allItems = Array.from(element.querySelectorAll('ul > li'));
    this.items = this.allItems.slice();
    this.currentIndex = 0;
    this.hideDotsTimer = null;
    this.onFirstLoaded = onFirstLoaded;
    this.cyclicLi = null;
    this.previewContainer = null;
    this.previewImages = [];
    this.dots = [];
    
    // Определяем тип устройства через media query
    this.isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    
    if (this.allItems.length === 0) {
      if (onFirstLoaded) onFirstLoaded();
      return;
    }
    
    // Поддержка SKU-переключения (если у article.item есть класс __sku-show)
    this.article = this.container.closest('.item');
    this.skuShowEnabled = !!(this.article && this.article.classList.contains('__sku-show'));
    if (this.skuShowEnabled) {
      this.skuShowContainer = this.article.querySelector('.item--sku-show');
      this.skuShowList = this.skuShowContainer ? this.skuShowContainer.querySelector('ul') : null;
      if (!this.skuShowList) this.skuShowEnabled = false;
    }
    
    // Определяем активный SKU и фильтруем this.items
    this.resolveActiveSku();
    
    if (this.items.length === 0) {
      if (onFirstLoaded) onFirstLoaded();
      return;
    }
    
    // Количество оригинальных картинок (для активного SKU)
    this.originalItemsCount = this.items.length;
    
    // Проверяем CSS-переменную блокировки hover-скролла
    const blockHover = getComputedStyle(document.documentElement).getPropertyValue('--block-mouse-hover-scroll').trim() === 'true';
    
    if (this.isCoarsePointer) {
      // Для тач-устройств - режим карусели
      this.mode = 'coarse';
      this.initCoarseMode();
    } else if (blockHover && this.originalItemsCount > 1) {
      // Блокировка hover при нескольких картинках — режим карусели с nav-кнопками
      this.mode = 'coarse';
      this.initCoarseMode();
      this.initNavButtons();
    } else {
      // Для десктопа - режим наведения с preview
      this.mode = 'desktop';
      this.initDesktopMode();
    }
    
    // Обработчик клика по миниатюрам SKU
    if (this.skuShowEnabled) {
      this.initSkuShowEvents();
    }
  }
  
  /**
   * Определяем активный SKU (или назначаем первый по умолчанию)
   * и фильтруем this.items по data-sku-id
   */
  resolveActiveSku() {
    if (!this.skuShowEnabled) {
      this.items = this.allItems.slice();
      return;
    }
    
    let activeLi = this.skuShowList.querySelector('li.__active');
    if (!activeLi) {
      activeLi = this.skuShowList.querySelector('li');
      if (activeLi) activeLi.classList.add('__active');
    }
    this.activeSkuId = activeLi ? activeLi.dataset.skuId : null;
    this.activeSkuLi = activeLi;
    
    this.applySkuFilter();
  }
  
  /**
   * Оставляет в this.items только li с картинками активного SKU,
   * остальные помечает классом __sku-hidden
   */
  applySkuFilter() {
    if (!this.skuShowEnabled || !this.activeSkuId) {
      this.items = this.allItems.slice();
      this.allItems.forEach(li => li.classList.remove('__sku-hidden'));
      return;
    }
    
    this.items = [];
    this.allItems.forEach(li => {
      const img = li.querySelector('img');
      const matches = !!(img && img.dataset.skuId === this.activeSkuId);
      if (matches) {
        li.classList.remove('__sku-hidden');
        this.items.push(li);
      } else {
        li.classList.add('__sku-hidden');
      }
    });
  }
  
  initDesktopMode() {
    // Добавляем циклический элемент в конец (только если больше одной картинки)
    if (this.originalItemsCount > 1) {
      this.addCyclicItem();
    }
    
    // Создаем preview контейнер для больших картинок
    this.initPreview();
    
    // Загружаем все картинки с lazy-src (оригиналы и клоны)
    this.loadLazyImages(this.onFirstLoaded);
    
    // Создаем индикаторы (точки) только для оригинальных элементов
    this.initDots();
    
    // Инициализируем обработчики событий для десктопа
    this.initDesktopEvents();
    
    // Показываем первую картинку
    this.showImage(0);
  }
  
  initCoarseMode() {
    // Добавляем класс для CSS
    this.container.classList.add('__touch');
    
    // Одна картинка — добавляем __op
    if (this.originalItemsCount <= 1) {
      this.container.classList.add('__op');
    }
    
    // Помечаем первый li как активный (показывается через CSS)
    if (this.items[0]) {
      this.items[0].classList.add('__active');
    }
    
    // Загружаем все картинки с lazy-src
    this.loadLazyImages(this.onFirstLoaded);
    
    // Создаем индикаторы (точки)
    this.initDots();
    
    // Инициализируем переключение картинок горизонтальным свайпом
    this.initSwipeTracking();
    
    // Показываем точки сразу для тач-устройств
    if (this.dotsContainer) {
      this.dotsContainer.classList.add('__active');
    }
  }
  
  initNavButtons() {
    // Создаём кнопки навигации
    const prevBtn = document.createElement('button');
    prevBtn.className = 'nav--prev';
    prevBtn.type = 'button';
    prevBtn.setAttribute('aria-label', 'Предыдущее изображение');
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'nav--next';
    nextBtn.type = 'button';
    nextBtn.setAttribute('aria-label', 'Следующее изображение');
    
    this.container.appendChild(prevBtn);
    this.container.appendChild(nextBtn);
    
    // Обработчик клика на prev
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPinchZoomed()) return;
      const newIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.originalItemsCount - 1;
      this.setActiveIndex(newIndex, 'backward');
    });
    
    // Обработчик клика на next
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isPinchZoomed()) return;
      const newIndex = this.currentIndex < this.originalItemsCount - 1 ? this.currentIndex + 1 : 0;
      this.setActiveIndex(newIndex, 'forward');
    });
  }
  
  setActiveIndex(index, direction) {
    if (index < 0 || index >= this.originalItemsCount) return;
    if (index === this.currentIndex) return;
    if (this.isAnimating) return;
    
    const oldLi = this.items[this.currentIndex];
    const newLi = this.items[index];
    if (!oldLi || !newLi) return;
    
    if (!direction) {
      direction = index > this.currentIndex ? 'forward' : 'backward';
    }
    
    this.isAnimating = true;
    
    const fromClass = direction === 'forward' ? '__from-right' : '__from-left';
    
    // Ставим новый li вне экрана без анимации (transition: none в CSS)
    newLi.classList.add('__sliding', fromClass);
    
    // Reflow — браузер фиксирует начальное состояние
    void newLi.offsetHeight;
    
    // Снимаем from-класс — transition: 0.3s возвращается, transform едет к 0
    newLi.classList.remove(fromClass);
    
    this.updateDots(index);
    
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      newLi.removeEventListener('transitionend', onEnd);
      oldLi.classList.remove('__active');
      newLi.classList.remove('__sliding');
      newLi.classList.add('__active');
      this.currentIndex = index;
      this.isAnimating = false;
    };
    
    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      if (e.target !== newLi) return;
      cleanup();
    };
    
    newLi.addEventListener('transitionend', onEnd);
    // Fallback на случай, если transitionend не сработает
    setTimeout(cleanup, 400);
  }
  
  loadLazyImages(onAllLoaded) {
    // Загружаем все картинки скроллера и ждём завершения загрузки каждой
    const images = Array.from(this.container.querySelectorAll('img'));
    let finished = false;
    let pending = 0;
    
    const finish = () => {
      if (finished) return;
      finished = true;
      this.container.classList.add('__loaded');
      if (onAllLoaded) onAllLoaded();
    };
    
    const onImageDone = () => {
      pending--;
      if (pending <= 0) finish();
    };
    
    images.forEach(img => {
      const lazySrc = img.getAttribute('lazy-src');
      if (lazySrc) {
        pending++;
        img.addEventListener('load', onImageDone, { once: true });
        img.addEventListener('error', onImageDone, { once: true });
        img.src = lazySrc;
        img.removeAttribute('lazy-src');
      } else if (!img.complete) {
        pending++;
        img.addEventListener('load', onImageDone, { once: true });
        img.addEventListener('error', onImageDone, { once: true });
      }
    });
    
    // Все картинки уже загружены (или их нет) — сразу вызываем callback
    if (pending === 0) {
      finish();
    } else {
      // Таймаут на случай если картинки не загрузятся
      setTimeout(finish, 3000);
    }
  }
  
  initSwipeTracking() {
    // Обработчики навешиваем один раз на время жизни scroller'а.
    // Метод идемпотентен — можно безопасно дёргать из reloadSku() после смены SKU,
    // если до этого у активного SKU была 1 картинка и обработчики ещё не навешены.
    if (this.swipeAttached) return;
    if (this.originalItemsCount <= 1) return;
    
    this.swipeAttached = true;
    
    const SWIPE_THRESHOLD = 20;
    const DIRECTION_THRESHOLD = 6;
    
    let active = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let isHorizontal = null;
    let moved = false;
    let triggered = false;
    
    const suppressNextClick = () => {
      const blockClick = (ce) => {
        ce.preventDefault();
        ce.stopImmediatePropagation();
      };
      document.addEventListener('click', blockClick, { capture: true, once: true });
      setTimeout(() => {
        document.removeEventListener('click', blockClick, true);
      }, 500);
    };
    
    const reset = () => {
      active = false;
      pointerId = null;
      isHorizontal = null;
      moved = false;
      triggered = false;
    };
    
    const onPointerDown = (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      if (active) return;
      if (isPinchZoomed()) return;
      
      active = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      lastX = startX;
      lastY = startY;
      isHorizontal = null;
      moved = false;
      triggered = false;
    };
    
    const onPointerMove = (e) => {
      if (!active || e.pointerId !== pointerId) return;
      
      lastX = e.clientX;
      lastY = e.clientY;
      
      const dx = lastX - startX;
      const dy = lastY - startY;
      
      if (Math.abs(dx) > DIRECTION_THRESHOLD || Math.abs(dy) > DIRECTION_THRESHOLD) {
        moved = true;
      }
      
      if (isHorizontal === null) {
        if (Math.abs(dx) > DIRECTION_THRESHOLD || Math.abs(dy) > DIRECTION_THRESHOLD) {
          isHorizontal = Math.abs(dx) > Math.abs(dy);
          if (!isHorizontal) {
            // Вертикальный жест — отдаём странице, не свайпаем
            active = false;
            return;
          }
        } else {
          return;
        }
      }
      
      // Срабатывание сразу при достижении порога — без ожидания отрыва
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        if (dx < 0) {
          // свайп влево → следующая въезжает справа
          const newIndex = this.currentIndex < this.originalItemsCount - 1 ? this.currentIndex + 1 : 0;
          this.setActiveIndex(newIndex, 'forward');
        } else {
          // свайп вправо → предыдущая въезжает слева
          const newIndex = this.currentIndex > 0 ? this.currentIndex - 1 : this.originalItemsCount - 1;
          this.setActiveIndex(newIndex, 'backward');
        }
        triggered = true;
        // Дальнейшие движения до отрыва игнорируем
        active = false;
      }
    };
    
    const onPointerUp = (e) => {
      if (e.pointerId !== pointerId) return;
      
      // Был жест — подавляем ближайший click, чтобы не сработал переход на товар
      if (moved || triggered) {
        suppressNextClick();
      }
      
      reset();
    };
    
    const onPointerCancel = () => {
      reset();
    };
    
    this.ul.addEventListener('pointerdown', onPointerDown);
    this.ul.addEventListener('pointermove', onPointerMove);
    this.ul.addEventListener('pointerup', onPointerUp);
    this.ul.addEventListener('pointercancel', onPointerCancel);
  }
  
  addCyclicItem() {
    // Создаем дополнительный li, который будет показывать первую картинку
    const cyclicLi = document.createElement('li');
    
    // Клонируем картинку из первого li
    const firstImg = this.items[0].querySelector('img');
    if (firstImg) {
      const cyclicImg = firstImg.cloneNode(true);
      cyclicLi.appendChild(cyclicImg);
    }
    
    // Добавляем в конец ul
    this.ul.appendChild(cyclicLi);
    
    // Сохраняем ссылку и добавляем в отфильтрованный список (без re-read из DOM,
    // так как там могут быть скрытые li другого SKU)
    this.cyclicLi = cyclicLi;
    this.items.push(cyclicLi);
  }
  
  initPreview() {
    // Создаем контейнер для preview
    this.previewContainer = document.createElement('div');
    this.previewContainer.classList.add('item--scroller--preview');
    
    // Клонируем все картинки в preview
    this.previewImages = [];
    this.items.forEach((item, index) => {
      const img = item.querySelector('img');
      if (img) {
        const previewImg = img.cloneNode(true);
        if (index === 0) {
          previewImg.classList.add('__active');
        }
        this.previewContainer.appendChild(previewImg);
        this.previewImages.push(previewImg);
      }
    });
    
    // Добавляем preview в начало контейнера
    this.container.insertBefore(this.previewContainer, this.container.firstChild);
  }
  
  initDots() {
    // Находим контейнер для точек (он уже есть в HTML)
    this.dotsContainer = this.container.parentElement.querySelector('.item--scroller--dots');
    if (!this.dotsContainer) return;
    
    // Если только одна картинка — скрываем точки
    if (this.originalItemsCount <= 1) {
      this.dotsContainer.classList.add('__hidden');
      this.dotsContainer.style.display = 'none';
      return;
    }
    
    // Очищаем контейнер на случай если там что-то есть
    this.dotsContainer.innerHTML = '';
    
    // Создаем точки только для оригинальных изображений (без циклического)
    this.dots = [];
    for (let i = 0; i < this.originalItemsCount; i++) {
      const dot = document.createElement('div');
      dot.classList.add('item--scroller--dots--dot');
      if (i === 0) {
        dot.classList.add('__active');
      }
      this.dotsContainer.appendChild(dot);
      this.dots.push(dot);
    }
  }
  
  initDesktopEvents() {
    // Обработчик наведения мыши на контейнер для показа точек
    this.container.addEventListener('mouseenter', () => {
      this.showDots();
    });
    
    // Обработчик ухода мыши с контейнера для скрытия точек
    this.container.addEventListener('mouseleave', () => {
      this.hideDots();
    });
    
    // Per-item hover (вынесено отдельно, чтобы можно было переподключать при смене SKU)
    this.attachItemHoverHandlers();
  }
  
  /**
   * Навешивает mouseenter на каждый li активного SKU.
   * При повторном вызове старые обработчики снимаются через AbortController.
   */
  attachItemHoverHandlers() {
    if (this.itemHoverAbort) this.itemHoverAbort.abort();
    this.itemHoverAbort = new AbortController();
    const signal = this.itemHoverAbort.signal;
    
    this.items.forEach((item, index) => {
      item.addEventListener('mouseenter', () => {
        // Если это последний элемент (циклический) - показываем первую картинку
        const imageIndex = (index === this.items.length - 1) ? 0 : index;
        this.showImage(imageIndex);
      }, { signal });
    });
  }
  
  showDots() {
    if (!this.dotsContainer) return;
    
    // Очищаем таймер скрытия если он есть
    if (this.hideDotsTimer) {
      clearTimeout(this.hideDotsTimer);
      this.hideDotsTimer = null;
    }
    
    // Показываем точки
    this.dotsContainer.classList.add('__active');
  }
  
  hideDots() {
    if (!this.dotsContainer) return;
    
    // Очищаем предыдущий таймер если есть
    if (this.hideDotsTimer) {
      clearTimeout(this.hideDotsTimer);
    }
    
    // Скрываем точки через 1 секунду
    this.hideDotsTimer = setTimeout(() => {
      this.dotsContainer.classList.remove('__active');
      this.hideDotsTimer = null;
    }, 1000);
  }
  
  showImage(index) {
    if (index === this.currentIndex) return;
    if (!this.previewImages) return;
    
    // Скрываем текущую картинку
    if (this.previewImages[this.currentIndex]) {
      this.previewImages[this.currentIndex].classList.remove('__active');
    }
    
    // Показываем новую картинку
    if (this.previewImages[index]) {
      this.previewImages[index].classList.add('__active');
    }
    
    // Обновляем точки
    this.updateDots(index);
    
    this.currentIndex = index;
  }
  
  updateDots(index) {
    if (!this.dotsContainer || !this.dots) return;
    
    // Убираем активный класс со всех точек
    this.dots.forEach((dot) => {
      dot.classList.remove('__active');
    });
    
    // Добавляем активный класс к текущей точке
    if (this.dots[index]) {
      this.dots[index].classList.add('__active');
    }
  }
  
  /**
   * Обработчик клика по миниатюрам SKU — переключает активный SKU
   * и перестраивает превью/карусель/точки
   */
  initSkuShowEvents() {
    this.skuShowContainer.addEventListener('click', (e) => {
      const li = e.target.closest('ul > li');
      if (!li || !this.skuShowList.contains(li)) return;
      e.preventDefault();
      e.stopPropagation();
      this.handleSkuClick(li);
    });
  }
  
  handleSkuClick(li) {
    if (li.classList.contains('__active')) return;
    const newSkuId = li.dataset.skuId;
    if (!newSkuId) return;
    
    // Перестановка __active в списке миниатюр
    const currentActive = this.skuShowList.querySelector('li.__active');
    if (currentActive) currentActive.classList.remove('__active');
    li.classList.add('__active');
    
    this.activeSkuId = newSkuId;
    this.activeSkuLi = li;
    
    // Подставляем заголовок / цену / sku= в ссылки
    applySkuMetaToItem(this.article, li);
    
    this.reloadSku();
  }
  
  /**
   * Сносит per-SKU UI и перестраивает её под новый активный SKU.
   * Постоянные обработчики (свайп, nav-кнопки, mouseenter контейнера) не трогаем.
   */
  reloadSku() {
    this.teardownSkuUI();
    this.applySkuFilter();
    
    if (this.items.length === 0) {
      this.originalItemsCount = 0;
      return;
    }
    
    this.originalItemsCount = this.items.length;
    this.currentIndex = 0;
    this.isAnimating = false;
    
    if (this.mode === 'coarse') {
      // Одна картинка — добавляем __op, иначе снимаем
      if (this.originalItemsCount <= 1) {
        this.container.classList.add('__op');
      } else {
        this.container.classList.remove('__op');
      }
      
      if (this.items[0]) {
        this.items[0].classList.add('__active');
      }
      
      this.loadLazyImages();
      this.initDots();
      
      // Если обработчики свайпа ещё не навешены (была 1 картинка на старте)
      // и теперь их несколько — навешиваем.
      this.initSwipeTracking();
      
      if (this.dotsContainer) {
        this.dotsContainer.classList.add('__active');
      }
    } else {
      // desktop
      if (this.originalItemsCount > 1) {
        this.addCyclicItem();
      }
      this.initPreview();
      this.loadLazyImages();
      this.initDots();
      this.attachItemHoverHandlers();
      // Сбрасываем currentIndex до значения, отличного от 0,
      // чтобы showImage(0) корректно поставил __active
      this.currentIndex = -1;
      this.showImage(0);
      this.currentIndex = 0;
    }
  }
  
  /**
   * Удаляет per-SKU элементы DOM и сбрасывает состояния li
   */
  teardownSkuUI() {
    // Сбрасываем состояния со всех li (включая скрытые)
    this.allItems.forEach(li => {
      li.classList.remove('__active', '__sliding', '__from-left', '__from-right');
    });
    
    // Удаляем циклический клон
    if (this.cyclicLi && this.cyclicLi.parentNode) {
      this.cyclicLi.parentNode.removeChild(this.cyclicLi);
    }
    this.cyclicLi = null;
    
    // Удаляем preview-контейнер
    if (this.previewContainer && this.previewContainer.parentNode) {
      this.previewContainer.parentNode.removeChild(this.previewContainer);
    }
    this.previewContainer = null;
    this.previewImages = [];
    
    // Очищаем точки
    if (this.dotsContainer) {
      this.dotsContainer.innerHTML = '';
      this.dotsContainer.classList.remove('__hidden');
      this.dotsContainer.style.display = '';
    }
    this.dots = [];
  }
}

// Инициализация всех item-scroller по очереди (по товарам).
// root — корневой элемент для поиска скроллеров (по умолчанию document).
// Используется чтобы после ajax-замены .items-grid инициализировать только новые карточки,
// не трогая уже инициализированные скроллеры в других местах страницы.
//
// Идемпотентность: каждый скроллер помечается атрибутом data-scroller-initialized
// сразу при «захвате». При повторном вызове (например, после autoload-подгрузки
// новой партии товаров) уже помеченные скроллеры пропускаются — иначе второй
// `new ItemScroller(...)` создал бы у существующей карточки дублирующий
// .item--scroller--preview и циклический клон li.
// Перед инициализацией проставляются активные сердечки из localStorage.favorites —
// это покрывает первичный рендер, __wide-ready и каждую ajax-вставку карточек.
function initScrollers(root) {
  const scope = root || document;

  if (typeof window.syncFavoritesItems === 'function') {
    window.syncFavoritesItems(scope);
  }

  const scrollers = Array.from(scope.querySelectorAll('.item--scroller'))
    .filter(s => !s.hasAttribute('data-scroller-initialized'));
  
  if (scrollers.length === 0) return;
  
  // Сразу помечаем все, чтобы возможный параллельный/последующий вызов
  // initScrollers не подхватил те же элементы повторно.
  scrollers.forEach(s => s.setAttribute('data-scroller-initialized', ''));
  
  const initialized = new Set();
  let observer = null;
  
  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight + 100 && rect.bottom > -100;
  }
  
  function findFirstVisible() {
    for (let i = 0; i < scrollers.length; i++) {
      if (!initialized.has(scrollers[i]) && isVisible(scrollers[i])) {
        return scrollers[i];
      }
    }
    return null;
  }
  
  function findFirstUninitialized() {
    for (let i = 0; i < scrollers.length; i++) {
      if (!initialized.has(scrollers[i])) return scrollers[i];
    }
    return null;
  }
  
  function initNextScroller() {
    // Ищем первый видимый неинициализированный
    let scroller = findFirstVisible();
    
    if (scroller) {
      // Нашли видимый — инициализируем
      initialized.add(scroller);
      new ItemScroller(scroller, initNextScroller);
    } else {
      // Нет видимых — ждём появления любого неинициализированного
      scroller = findFirstUninitialized();
      if (!scroller) return; // Все инициализированы
      
      let pendingElement = null;
      let pendingTimer = null;
      
      if (!observer) {
        observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              // Элемент появился — запускаем таймер
              if (pendingTimer) clearTimeout(pendingTimer);
              pendingElement = entry.target;
              pendingTimer = setTimeout(() => {
                // Проверяем что элемент всё ещё виден
                if (isVisible(pendingElement)) {
                  observer.disconnect();
                  initNextScroller();
                }
              }, 200);
            } else if (entry.target === pendingElement) {
              // Ожидаемый элемент вышел из viewport — отменяем
              if (pendingTimer) clearTimeout(pendingTimer);
              pendingElement = null;
              pendingTimer = null;
            }
          }
        }, { rootMargin: '100px 0px' });
      }
      
      // Наблюдаем за всеми неинициализированными
      scrollers.forEach(s => {
        if (!initialized.has(s)) observer.observe(s);
      });
    }
  }
  
  initNextScroller();
}

// Ждём загрузки шрифтов
let scrollersInitDone = false;
let scrollersFontsReady = false;
let scrollersDomReady = document.readyState === 'complete';

function startScrollers() {
  if (scrollersInitDone || !scrollersFontsReady || !scrollersDomReady) return;
  scrollersInitDone = true;
  initScrollers();
}

function onScrollersFontsReady() {
  scrollersFontsReady = true;
  startScrollers();
}

if (!scrollersDomReady) {
  document.addEventListener('DOMContentLoaded', () => {
    scrollersDomReady = true;
    startScrollers();
  }, { once: true });
}

if (document.fonts) {
  document.fonts.ready.then(onScrollersFontsReady);
  
  // Страховка на случай если промис не разрешится
  setTimeout(onScrollersFontsReady, 1000);
} else {
  onScrollersFontsReady();
}

// Экспорт для внешнего повторного использования (например, после ajax-замены .items-grid)
window.initScrollers = initScrollers;

/**
 * Клик по item--image → переход по ссылке товара
 */

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    const image = e.target.closest('.item--image');
    if (!image) return;

    const item = image.closest('.item');
    if (!item) return;

    const link = item.querySelector('a');
    if (!link || !link.href) return;

    window.location.href = link.href;
  });
});

/**
 * Добавление класса __mobile-button для тач-устройств.
 * root — корневой элемент для поиска кнопок (по умолчанию document).
 * Идемпотентно — повторный вызов на тех же элементах безопасен.
 */
function applyMobileButtonClass(root) {
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (!isCoarsePointer) return;
  
  const scope = root || document;
  const buyButtons = scope.querySelectorAll('.item--buy-button');
  buyButtons.forEach(button => {
    button.classList.add('__mobile-button');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyMobileButtonClass();
});

// Экспорт для внешнего повторного использования (например, после ajax-замены .items-grid)
window.applyMobileButtonClass = applyMobileButtonClass;

/**
 * Pinch Zoom DOM Manager
 * При pinch-zoom мгновенно ставит __zoomed на все .item--scroller.__touch без __op.
 * При снятии — снимает __zoomed последовательно: сначала с видимых (с задержкой),
 * с остальных — когда они попадут в viewport (через IntersectionObserver).
 */
(function() {
  'use strict';

  const STAGGER_MS = 100;

  let pendingTimeouts = [];
  let observer = null;
  let pendingHidden = null;

  function clearPending() {
    pendingTimeouts.forEach(id => clearTimeout(id));
    pendingTimeouts = [];
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    pendingHidden = null;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom > 0 && rect.top < vh;
  }

  function setZoomedAll() {
    clearPending();
    const scrollers = document.querySelectorAll('.item--scroller.__touch:not(.__op)');
    scrollers.forEach(sc => {
      sc.classList.add('__zoomed');
    });
  }

  function unsetZoomedSequentially() {
    clearPending();

    const scrollers = Array.prototype.slice.call(
      document.querySelectorAll('.item--scroller.__zoomed')
    );
    if (!scrollers.length) return;

    const visible = [];
    const hidden = [];
    scrollers.forEach(sc => {
      if (isInViewport(sc)) {
        visible.push(sc);
      } else {
        hidden.push(sc);
      }
    });

    // Видимые — последовательно с задержкой
    visible.forEach((sc, i) => {
      const id = setTimeout(() => {
        sc.classList.remove('__zoomed');
      }, i * STAGGER_MS);
      pendingTimeouts.push(id);
    });

    // Невидимые — ждут попадания в viewport
    if (hidden.length) {
      pendingHidden = new Set(hidden);
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          if (!pendingHidden || !pendingHidden.has(entry.target)) return;
          pendingHidden.delete(entry.target);
          entry.target.classList.remove('__zoomed');
          observer.unobserve(entry.target);
          if (pendingHidden.size === 0) {
            observer.disconnect();
            observer = null;
            pendingHidden = null;
          }
        });
      }, { rootMargin: '100px 0px' });

      hidden.forEach(sc => observer.observe(sc));
    }
  }

  window.addEventListener('pinchZoomChange', e => {
    const isZoomed = e.detail && e.detail.isZoomed;
    if (isZoomed) {
      setZoomedAll();
    } else {
      unsetZoomedSequentially();
    }
  });
})();
