(function() {
  'use strict';

  // Функция загрузки изображения
  function loadImage(img) {
    var lazySrc = img.getAttribute('lazy-src');
    if (!lazySrc) return;

    img.src = lazySrc;
    img.removeAttribute('lazy-src');
    
    img.addEventListener('load', function() {
      img.classList.add('__lazy-loaded');
    }, { once: true });
  }

  // Наблюдатель нужен только для приоритета: картинки в области экрана (± 200px по вертикали)
  // грузятся сразу. Всё остальное догружается отложенно — см. flushPending —
  // независимо от видимости (скрытые дропдауны, display:none и т.п.).
  var observer = ('IntersectionObserver' in window)
    ? new IntersectionObserver(function(entries, obs) {
        entries.forEach(function(entry) {
          if (!entry.isIntersecting) return;
          obs.unobserve(entry.target);
          loadImage(entry.target);
        });
      }, { rootMargin: '200px 100000px' })
    : null;

  // Очередь картинок, ожидающих отложенной загрузки
  var pending = [];
  var flushScheduled = false;

  // Загрузить всё, что ещё не загрузилось через обсервер
  function flushPending() {
    flushScheduled = false;
    var list = pending;
    pending = [];
    list.forEach(function(img) {
      if (observer) observer.unobserve(img);
      loadImage(img);
    });
  }

  // До полной загрузки страницы ждём window.load — к этому моменту видимые картинки уже загружены.
  // После — даём обсерверу один кадр отработать по видимым и грузим остальное.
  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;

    if (document.readyState !== 'complete') {
      window.addEventListener('load', flushPending, { once: true });
    } else {
      requestAnimationFrame(function() {
        setTimeout(flushPending, 0);
      });
    }
  }

  // Инициализация — ставим картинки под наблюдение и в очередь отложенной загрузки.
  // root — корневой элемент для поиска картинок (по умолчанию document).
  // Используется чтобы после ajax-замены .items-grid подхватить только новые картинки.
  function initLazyLoad(root) {
    var scope = root || document;
    var lazyImages = scope.querySelectorAll('img[lazy-src]');
    
    if (!lazyImages.length) return;

    lazyImages.forEach(function(img) {
      if (img.closest('.item--scroller')) return;
      
      if (observer) {
        observer.observe(img);
        pending.push(img);
      } else {
        loadImage(img);
      }
    });

    if (observer) scheduleFlush();
  }
  
  // Экспорт для внешнего повторного использования (например, после ajax-замены .items-grid)
  window.initLazyLoad = initLazyLoad;

  initLazyLoad();
})();
