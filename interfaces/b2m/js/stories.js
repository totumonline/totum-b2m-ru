/**
 * Stories Carousel
 * Горизонтальная прокрутка кружков-сторис с кнопками nav-prev / nav-next
 * Прокрутка с привязкой (scroll-snap) — элементы не останавливаются в промежуточном положении
 */
class StoriesCarousel {
  constructor(section) {
    this.section = section;
    this.list = section.querySelector('.stories--list');
    this.prevButton = section.querySelector('.nav--prev');
    this.nextButton = section.querySelector('.nav--next');

    if (!this.list || !this.prevButton || !this.nextButton) return;

    this.init();
  }

  init() {
    this.updateButtons();
    this.initScrollTracking();
    this.initResizeTracking();
    this.initViewed();
    this.initClicks();

    this.prevButton.addEventListener('click', () => this.scrollPrev());
    this.nextButton.addEventListener('click', () => this.scrollNext());
  }

  getItemWidth() {
    var item = this.list.querySelector('li');
    if (!item) return 100;
    var style = getComputedStyle(this.list.querySelector('ul'));
    var gap = parseFloat(style.gap) || 20;
    return item.offsetWidth + gap;
  }

  updateButtons() {
    var scrollLeft = this.list.scrollLeft;
    var maxScroll = this.list.scrollWidth - this.list.clientWidth;

    if (maxScroll <= 0) {
      this.prevButton.style.display = 'none';
      this.nextButton.style.display = 'none';
      return;
    }

    this.prevButton.style.display = scrollLeft > 5 ? 'flex' : 'none';
    this.nextButton.style.display = scrollLeft < maxScroll - 5 ? 'flex' : 'none';
  }

  scrollPrev() {
    if (isPinchZoomed()) return;
    var distance = this.getItemWidth() * 3;
    this.list.scrollBy({ left: -distance, behavior: 'smooth' });
  }

  scrollNext() {
    if (isPinchZoomed()) return;
    var distance = this.getItemWidth() * 3;
    this.list.scrollBy({ left: distance, behavior: 'smooth' });
  }

  initScrollTracking() {
    this.list.addEventListener('scroll', () => this.updateButtons(), { passive: true });
  }

  initResizeTracking() {
    ResizeDispatcher.onResizeDebounced(() => this.updateButtons());
  }

  /**
   * Viewed Stories
   * Проверяет localStorage и ставит __viewed на просмотренные сторис
   */
  getViewedIds() {
    try {
      var data = JSON.parse(localStorage.getItem('viewed_stories') || '[]');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  saveViewedIds(ids) {
    localStorage.setItem('viewed_stories', JSON.stringify(ids));
  }

  initViewed() {
    var viewedIds = this.getViewedIds();
    this.list.querySelectorAll('li[data-story-id]').forEach(function(li) {
      var id = li.getAttribute('data-story-id');
      if (viewedIds.indexOf(id) !== -1) {
        li.classList.add('__viewed');
      }
    });
  }

  markAsViewed(li) {
    var id = li.getAttribute('data-story-id');
    if (!id) return;

    var viewedIds = this.getViewedIds();
    if (viewedIds.indexOf(id) !== -1) return;

    viewedIds.push(id);
    if (viewedIds.length > 30) {
      viewedIds.shift();
    }

    this.saveViewedIds(viewedIds);
    li.classList.add('__viewed');
  }

  initClicks() {
    var self = this;
    this.list.querySelectorAll('li[data-story-id]').forEach(function(li) {
      li.addEventListener('click', function() {
        self.markAsViewed(li);
        self.openStoryPopup(li);
      });
    });
  }

  /**
   * Открытие popup сторис
   */
  openStoryPopup(li) {
    var items = Array.from(this.list.querySelectorAll('li[data-story-id]'));
    var index = items.indexOf(li);
    if (index === -1) return;

    new StoriesPopup(items, index, this);
  }
}

/**
 * Stories Popup
 * Полноэкранный popup для просмотра видео-сторис
 * Центральный слайд — видео, по бокам — затемнённые превью соседних сторис
 * Клик на боковой слайд переключает карусель
 */
class StoriesPopup {
  constructor(items, startIndex, carousel) {
    this.items = items;
    this.currentIndex = startIndex;
    this.carousel = carousel;
    this.popup = null;
    this.keyHandler = null;
    this.animating = false;
    this.userWantsSound = false;
    this.swiped = false;
    this.generation = 0;
    this.pendingVideo = null;

    this.open();
  }

  /**
   * Сбор данных из li-элементов
   */
  getSlideData(li) {
    var img = li.querySelector('img');
    return {
      videoSrc: li.getAttribute('data-video-src') || '',
      imgSrc: img ? (img.getAttribute('src') || img.getAttribute('lazy-src') || '') : '',
      alt: img ? (img.getAttribute('alt') || '') : ''
    };
  }

  /**
   * Создание и открытие popup
   */
  open() {
    this.popup = document.createElement('div');
    this.popup.className = 'popup __stories';

    this.popup.innerHTML =
      '<button class="popup--close" aria-label="Закрыть"></button>' +
      '<div class="popup--stories--carousel"></div>';

    document.body.appendChild(this.popup);
    document.body.style.overflow = 'hidden';

    this.renderSlides();
    this.initHandlers();

    this.popup.classList.add('__visible');
  }

  /**
   * Рендер слайдов: prev, current, next
   */
  renderSlides() {
    var container = this.popup.querySelector('.popup--stories--carousel');
    container.innerHTML = '';

    var prevIndex = this.currentIndex > 0 ? this.currentIndex - 1 : null;
    var nextIndex = this.currentIndex < this.items.length - 1 ? this.currentIndex + 1 : null;

    if (prevIndex !== null) {
      container.appendChild(this.createSideSlide(prevIndex, 'prev'));
    }

    container.appendChild(this.createCurrentSlide(this.currentIndex));

    if (nextIndex !== null) {
      container.appendChild(this.createSideSlide(nextIndex, 'next'));
    }
  }

  /**
   * Пауза / воспроизведение по клику на центральный слайд
   */
  togglePause(slide) {
    var video = slide.querySelector('video');
    if (!video) return;

    if (video.paused) {
      video.play();
      slide.classList.remove('__paused');
    } else {
      video.pause();
      slide.classList.add('__paused');
    }
  }

  /**
   * Создание центрального слайда с видео
   */
  createCurrentSlide(index) {
    var data = this.getSlideData(this.items[index]);
    var slide = document.createElement('div');
    slide.className = 'popup--stories--slide __current';
    var self = this;

    if (data.videoSrc) {
      var loader = document.createElement('div');
      loader.className = 'popup--stories--loader';
      slide.appendChild(loader);

      var progress = document.createElement('div');
      progress.className = 'popup--stories--progress';
      var bar = document.createElement('div');
      bar.className = 'popup--stories--progress--bar';
      progress.appendChild(bar);
      slide.appendChild(progress);

      var video = document.createElement('video');
      video.setAttribute('pip', 'false');
      video.src = data.videoSrc;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      var muteBtn = this.createMuteButton(video);
      slide.appendChild(muteBtn);

      video.addEventListener('timeupdate', function() {
        if (video.duration && video.duration > 0) {
          var pct = (video.currentTime / video.duration) * 100;
          bar.style.width = pct + '%';
        }
      });

      video.addEventListener('ended', function() {
        bar.style.width = '100%';
        if (self.currentIndex < self.items.length - 1) {
          self.goTo(self.currentIndex + 1);
        }
      });

      slide.appendChild(video);

      var self2 = this;
      video.addEventListener('playing', function() {
        if (self2.userWantsSound) video.muted = false;
        if (loader.parentNode) loader.remove();
      }, { once: true });
    } else if (data.imgSrc) {
      var img = document.createElement('img');
      img.src = data.imgSrc;
      img.alt = data.alt;
      slide.appendChild(img);
    }

    this.addInnerData(slide, this.items[index]);

    return slide;
  }

  /**
   * Создание бокового слайда с картинкой
   */
  createSideSlide(index, direction) {
    var data = this.getSlideData(this.items[index]);
    var slide = document.createElement('div');
    slide.className = 'popup--stories--slide __side';
    slide.setAttribute('data-direction', direction);

    var img = document.createElement('img');
    img.src = data.imgSrc;
    img.alt = data.alt;
    slide.appendChild(img);

    return slide;
  }

  /**
   * Добавление inner-data (фото + заголовок сверху, товары снизу) на слайд
   */
  addInnerData(slide, li) {
    var innerData = li.querySelector('.stories--inner-data');
    var titleEl = li.querySelector('.stories--title');
    if (!innerData && !titleEl) return;

    var fotoImg = innerData ? innerData.querySelector('.stories--inner-data--foto > img') : null;
    if (fotoImg || titleEl) {
      var topBlock = document.createElement('div');
      topBlock.className = 'popup--stories--inner-data--block';

      if (fotoImg) {
        var foto = document.createElement('div');
        foto.className = 'popup--stories--inner-data--foto';
        var img = document.createElement('img');
        img.src = fotoImg.getAttribute('data-src') || '';
        img.alt = fotoImg.alt || '';
        foto.appendChild(img);
        topBlock.appendChild(foto);
      }

      var nameEl = innerData ? innerData.querySelector('.stories--inner-data--name') : null;
      if (nameEl || titleEl) {
        var titleBlock = document.createElement('div');
        titleBlock.className = 'popup--stories--inner-data--title--block';

        if (nameEl) {
          var name = document.createElement('div');
          name.className = 'popup--stories--inner-data--name';
          name.textContent = nameEl.textContent;
          titleBlock.appendChild(name);
        }

        if (titleEl) {
          var title = document.createElement('div');
          title.className = 'popup--stories--inner-data--title';
          title.textContent = titleEl.textContent;
          titleBlock.appendChild(title);
        }

        topBlock.appendChild(titleBlock);
      }

      slide.appendChild(topBlock);
    }

    var itemsEl = innerData ? innerData.querySelector('.stories--inner-data--items') : null;
    if (itemsEl) {
      var itemsBlock = document.createElement('div');
      itemsBlock.className = 'popup--stories--inner-data--items--block';

      var itemsTitle = document.createElement('div');
      itemsTitle.className = 'popup--stories--inner-data--items--title';
      itemsTitle.textContent = 'Товары в этом видео';
      itemsBlock.appendChild(itemsTitle);

      var clone = itemsEl.cloneNode(true);
      clone.querySelectorAll('img[data-src]').forEach(function(img) {
        img.src = img.getAttribute('data-src');
        img.removeAttribute('data-src');
      });
      while (clone.firstChild) {
        itemsBlock.appendChild(clone.firstChild);
      }

      slide.appendChild(itemsBlock);
    }
  }

  /**
   * Замена видео на обложку в уходящем слайде
   */
  replaceWithCover(slide, storyIndex) {
    var data = this.getSlideData(this.items[storyIndex]);
    var img = document.createElement('img');
    img.src = data.imgSrc;
    img.alt = data.alt;
    img.style.position = 'absolute';
    img.style.inset = '0';
    img.style.zIndex = '3';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.3s';
    slide.appendChild(img);

    requestAnimationFrame(function() {
      img.style.opacity = '1';
    });

    setTimeout(function() {
      slide.innerHTML = '';
      img.style.position = '';
      img.style.inset = '';
      img.style.zIndex = '';
      img.style.opacity = '';
      img.style.transition = '';
      slide.appendChild(img);
    }, 300);
  }

  /**
   * Вставка видео в текущий центральный слайд (без пересоздания DOM)
   */
  abortPendingVideo() {
    if (this.pendingVideo) {
      this.pendingVideo.pause();
      this.pendingVideo.removeAttribute('src');
      this.pendingVideo.load();
      this.pendingVideo = null;
    }
  }

  injectVideo() {
    this.abortPendingVideo();

    var container = this.popup.querySelector('.popup--stories--carousel');
    var centerSlide = container.querySelector('.__current');
    if (!centerSlide) return;

    var data = this.getSlideData(this.items[this.currentIndex]);
    if (!data.videoSrc) return;

    var self = this;
    var gen = ++this.generation;

    var cover = centerSlide.querySelector('img');
    if (cover) {
      cover.style.position = 'absolute';
      cover.style.inset = '0';
      cover.style.zIndex = '3';
      cover.style.transition = 'opacity 0.3s';
      cover.style.pointerEvents = 'none';
    }

    var loader = document.createElement('div');
    loader.className = 'popup--stories--loader';
    centerSlide.appendChild(loader);

    var progress = document.createElement('div');
    progress.className = 'popup--stories--progress';
    var bar = document.createElement('div');
    bar.className = 'popup--stories--progress--bar';
    progress.appendChild(bar);
    progress.style.opacity = '0';
    centerSlide.appendChild(progress);

    var video = document.createElement('video');
    video.setAttribute('pip', 'false');
    video.src = data.videoSrc;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    this.pendingVideo = video;
    centerSlide.appendChild(video);

    var muteBtn = this.createMuteButton(video);
    muteBtn.style.opacity = '0';
    centerSlide.appendChild(muteBtn);

    this.addInnerData(centerSlide, this.items[this.currentIndex]);

    var overlays = [progress, muteBtn];
    var innerBlock = centerSlide.querySelector('.popup--stories--inner-data--block');
    var itemsBlock = centerSlide.querySelector('.popup--stories--inner-data--items--block');
    if (innerBlock) { innerBlock.style.opacity = '0'; overlays.push(innerBlock); }
    if (itemsBlock) { itemsBlock.style.opacity = '0'; overlays.push(itemsBlock); }

    requestAnimationFrame(function() {
      overlays.forEach(function(el) {
        el.style.transition = 'opacity 0.4s ease';
        el.style.opacity = '1';
      });
    });

    video.addEventListener('playing', function() {
      if (gen !== self.generation) return;
      self.pendingVideo = null;
      if (loader.parentNode) loader.remove();
      if (self.userWantsSound) video.muted = false;

      if (cover) {
        cover.style.opacity = '0';
        setTimeout(function() {
          if (cover.parentNode) cover.remove();
        }, 300);
      }
    }, { once: true });

    video.addEventListener('timeupdate', function() {
      if (video.duration && video.duration > 0) {
        var pct = (video.currentTime / video.duration) * 100;
        bar.style.width = pct + '%';
      }
    });

    video.addEventListener('ended', function() {
      bar.style.width = '100%';
      if (self.currentIndex < self.items.length - 1) {
        self.goTo(self.currentIndex + 1);
      }
    });
  }

  /**
   * Кнопка включения/выключения звука
   * Класс __muted и aria-label синхронизируются с текущим состоянием video.muted
   */
  createMuteButton(video) {
    var self = this;
    var btn = document.createElement('button');
    btn.className = 'popup--stories--mute';
    btn.type = 'button';

    function updateIcon() {
      btn.classList.toggle('__muted', video.muted);
      btn.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук');
    }
    updateIcon();

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      video.muted = !video.muted;
      self.userWantsSound = !video.muted;
      updateIcon();
    });

    video.addEventListener('volumechange', updateIcon);

    return btn;
  }

  /**
   * Переход к конкретному сторис
   */
  goTo(index) {
    if (index < 0 || index >= this.items.length) return;
    if (this.animating) return;

    this.animating = true;
    var direction = index > this.currentIndex ? 1 : -1;
    var container = this.popup.querySelector('.popup--stories--carousel');
    var self = this;

    var prevSlide = container.querySelector('[data-direction="prev"]');
    var currentSlide = container.querySelector('.__current');
    var nextSlide = container.querySelector('[data-direction="next"]');

    var outgoingIndex = this.currentIndex;

    this.abortPendingVideo();

    if (currentSlide) {
      var video = currentSlide.querySelector('video');
      if (video) video.pause();
      var progressBar = currentSlide.querySelector('.popup--stories--progress');
      if (progressBar) progressBar.remove();
      var loaderEl = currentSlide.querySelector('.popup--stories--loader');
      if (loaderEl) loaderEl.remove();
    }

    if (direction === 1) {
      if (prevSlide) {
        prevSlide.style.height = '0';
        prevSlide.style.opacity = '0';
      }

      if (currentSlide) {
        currentSlide.classList.remove('__current');
        currentSlide.classList.add('__side');
        currentSlide.setAttribute('data-direction', 'prev');
      }

      if (nextSlide) {
        nextSlide.classList.remove('__side');
        nextSlide.classList.add('__current');
        nextSlide.removeAttribute('data-direction');
      }

      var newNextIdx = index + 1;
      if (newNextIdx < this.items.length) {
        var newNext = this.createSideSlide(newNextIdx, 'next');
        newNext.style.height = '0';
        newNext.style.opacity = '0';
        container.appendChild(newNext);
        requestAnimationFrame(function() {
          newNext.style.height = '';
          newNext.style.opacity = '';
        });
      }

    } else {
      if (nextSlide) {
        nextSlide.style.height = '0';
        nextSlide.style.opacity = '0';
      }

      if (currentSlide) {
        currentSlide.classList.remove('__current');
        currentSlide.classList.add('__side');
        currentSlide.setAttribute('data-direction', 'next');
      }

      if (prevSlide) {
        prevSlide.classList.remove('__side');
        prevSlide.classList.add('__current');
        prevSlide.removeAttribute('data-direction');
      }

      var newPrevIdx = index - 1;
      if (newPrevIdx >= 0) {
        var newPrev = this.createSideSlide(newPrevIdx, 'prev');
        newPrev.style.height = '0';
        newPrev.style.opacity = '0';
        container.insertBefore(newPrev, container.firstChild);
        requestAnimationFrame(function() {
          newPrev.style.height = '';
          newPrev.style.opacity = '';
        });
      }
    }

    setTimeout(function() {
      var collapsed = container.querySelector('.popup--stories--slide[style*="height: 0"]');
      if (collapsed) collapsed.remove();

      var outgoingSlide = direction === 1
        ? container.querySelector('[data-direction="prev"]')
        : container.querySelector('[data-direction="next"]');
      if (outgoingSlide) {
        self.replaceWithCover(outgoingSlide, outgoingIndex);
      }

      self.currentIndex = index;
      if (self.carousel) self.carousel.markAsViewed(self.items[index]);
      self.injectVideo();
      self.animating = false;
    }, 420);
  }

  /**
   * Обработчики событий popup
   */
  initHandlers() {
    var self = this;

    this.popup.querySelector('.popup--close').addEventListener('click', function() {
      self.close();
    });

    this.popup.querySelector('.popup--stories--carousel').addEventListener('click', function(e) {
      if (self.swiped) {
        self.swiped = false;
        return;
      }

      var slide = e.target.closest('.popup--stories--slide');
      if (!slide) return;

      if (slide.classList.contains('__current')) {
        self.togglePause(slide);
      } else if (slide.classList.contains('__side')) {
        var dir = slide.getAttribute('data-direction');
        if (dir === 'prev' && self.currentIndex > 0) {
          self.goTo(self.currentIndex - 1);
        } else if (dir === 'next' && self.currentIndex < self.items.length - 1) {
          self.goTo(self.currentIndex + 1);
        }
      }
    });

    this.keyHandler = function(e) {
      if (e.key === 'Escape') {
        self.close();
      } else if (e.key === 'ArrowLeft') {
        if (self.currentIndex > 0) self.goTo(self.currentIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (self.currentIndex < self.items.length - 1) self.goTo(self.currentIndex + 1);
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    this.popup.addEventListener('click', function(e) {
      if (e.target === self.popup) {
        self.close();
      }
    });

    this.initSwipe();
  }

  /**
   * Свайп для мобильных (вертикальный)
   * Свайп вверх — следующая история, свайп вниз — предыдущая
   * Слайд привязан к движению пальца через translateY
   */
  initSwipe() {
    var self = this;
    var startX = 0;
    var startY = 0;
    var lastDy = 0;
    var dragging = false;
    var decided = false;
    var currentSlide = null;
    var carousel = this.popup.querySelector('.popup--stories--carousel');

    function reset() {
      if (!currentSlide) return;
      var slide = currentSlide;
      currentSlide = null;
      decided = false;

      if (dragging) {
        dragging = false;
        slide.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        void slide.offsetHeight;
        slide.style.transform = '';
        slide.style.opacity = '';
        setTimeout(function() {
          slide.style.transition = '';
          slide.style.transform = '';
          slide.style.opacity = '';
        }, 320);
      } else {
        dragging = false;
        slide.style.transition = '';
      }
    }

    carousel.addEventListener('touchstart', function(e) {
      if (self.animating || currentSlide) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastDy = 0;
      dragging = false;
      decided = false;
      currentSlide = carousel.querySelector('.__current');
      if (currentSlide) {
        currentSlide.style.transition = 'none';
      }
    }, { passive: true });

    carousel.addEventListener('touchmove', function(e) {
      if (!currentSlide) return;
      var dy = e.touches[0].clientY - startY;
      var dx = e.touches[0].clientX - startX;

      if (!decided) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
          dragging = true;
          decided = true;
        } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
          decided = true;
          currentSlide.style.transition = '';
          currentSlide = null;
          return;
        }
      }

      if (dragging) {
        e.preventDefault();
        lastDy = dy;
        currentSlide.style.transform = 'translateY(' + dy + 'px)';
        currentSlide.style.opacity = Math.max(0.2, 1 - Math.abs(dy) / 500);
      }
    }, { passive: false });

    carousel.addEventListener('touchend', function() {
      if (!currentSlide || !dragging) {
        reset();
        return;
      }

      var dy = lastDy;
      var triggered = false;

      if (Math.abs(dy) > 60) {
        if (dy < 0 && self.currentIndex < self.items.length - 1) triggered = true;
        else if (dy > 0 && self.currentIndex > 0) triggered = true;
      }

      if (triggered) {
        var video = currentSlide.querySelector('video');
        if (video) video.pause();

        currentSlide.style.transition = '';
        currentSlide.style.transform = '';
        currentSlide.style.opacity = '';
        currentSlide = null;
        dragging = false;
        decided = false;
        self.swiped = true;

        if (dy < 0) {
          self.goTo(self.currentIndex + 1);
        } else {
          self.goTo(self.currentIndex - 1);
        }
      } else {
        reset();
      }
    }, { passive: true });

    carousel.addEventListener('touchcancel', function() {
      reset();
    }, { passive: true });
  }

  /**
   * Закрытие popup
   */
  close() {
    if (!this.popup) return;

    document.removeEventListener('keydown', this.keyHandler);

    var video = this.popup.querySelector('video');
    if (video) {
      video.pause();
      video.src = '';
    }

    this.popup.classList.remove('__visible');

    var self = this;
    setTimeout(function() {
      if (self.popup) {
        self.popup.remove();
        self.popup = null;
      }
      document.body.style.overflow = '';
    }, 300);
  }
}

/**
 * Инициализация сторис-каруселей
 */
function initStoriesCarousel() {
  document.querySelectorAll('.stories').forEach(function(section) {
    new StoriesCarousel(section);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStoriesCarousel);
} else {
  initStoriesCarousel();
}
