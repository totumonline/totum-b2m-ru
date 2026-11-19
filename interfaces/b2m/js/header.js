
/**
 * Pinch Zoom State
 * Единая проверка состояния pinch-zoom — источник правды класс body.__pinch-zoomed
 * (класс переключает initPinchZoomDetection ниже в этом файле)
 */
function isPinchZoomed() {
  return !!(document.body && document.body.classList.contains('__pinch-zoomed'));
}
window.isPinchZoomed = isPinchZoomed;

/**
 * Data-link buttons
 * Кнопки с атрибутом data-link работают как ссылки, не активируя родительский <a>
 */
document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-link]');
  if (!button || button.dataset.file) return;
  e.stopPropagation();
  e.preventDefault();
  window.location.href = button.dataset.link;
});

/**
 * Data-file buttons
 * Кнопки с атрибутом data-file скачивают файл, не активируя родительский <a>
 * https://... или /... — скачивание по ссылке из атрибута
 * point_name:file_name:order_num — защищённый файл через downloadSecureFile
 */
const SECURE_FILES_ENDPOINT_URL = '/post-endpoints/secureFiles/';
const SECURE_FILES_ERROR_PREFIX = 'error:';
const SECURE_FILES_ERROR_DURATION = 5000;

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-file]:not([data-file=""])');
  if (!button) return;
  e.stopPropagation();
  e.preventDefault();

  const file = button.dataset.file;
  const segments = file.split(':');

  if (!file.startsWith('https://') && !file.startsWith('/') && segments.length === 3) {
    if (button.classList.contains('__error')) return;
    const [pointName, fileName, checkoutNum] = segments;
    downloadSecureFile(pointName, fileName, checkoutNum).catch((error) => showDataFileButtonError(button, error.message));
    return;
  }

  downloadFileByHref(file);
});

/**
 * Скачивание файла по ссылке через временный <a download>
 */
function downloadFileByHref(href, fileName = '') {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Показывает текст ошибки на кнопке на SECURE_FILES_ERROR_DURATION, затем возвращает исходное содержимое
 * Пока ошибка показана — у кнопки класс __error
 */
function showDataFileButtonError(button, text) {
  const originalNodes = Array.from(button.childNodes);

  button.classList.add('__error');
  button.textContent = text;

  setTimeout(() => {
    button.classList.remove('__error');
    button.replaceChildren(...originalNodes);
  }, SECURE_FILES_ERROR_DURATION);
}

/**
 * Secure Files
 * POST /post-endpoints/secureFiles/[point_name] — FILE (имя файла) и CHECKOUT_NUM (номер заказа)
 * Ответ — содержимое файла (file_get_content) либо текст ошибки с префиксом error:
 * Содержимое скачивается под именем из FILE
 */
async function downloadSecureFile(pointName, fileName, checkoutNum) {
  const body = new FormData();
  body.append('FILE', fileName);
  body.append('CHECKOUT_NUM', checkoutNum);

  const response = await fetch(SECURE_FILES_ENDPOINT_URL + encodeURIComponent(pointName), { method: 'POST', body });
  const blob = await response.blob();
  const head = await blob.slice(0, SECURE_FILES_ERROR_PREFIX.length).text();

  if (!response.ok || head === SECURE_FILES_ERROR_PREFIX) {
    const text = (await blob.text()).trim();
    throw new Error((text.startsWith(SECURE_FILES_ERROR_PREFIX) ? text.slice(SECURE_FILES_ERROR_PREFIX.length).trim() : text) || 'Не удалось получить файл');
  }

  const url = URL.createObjectURL(blob);
  downloadFileByHref(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Resize Dispatcher
 * Единый обработчик window.resize с двумя каналами подписки:
 * - onResize(fn)          — вызывается сразу на каждое событие resize
 * - onResizeDebounced(fn) — вызывается один раз через RESIZE_DEBOUNCE_MS после последнего resize,
 *                           аргументом получает время (Date.now) первого resize в серии —
 *                           по нему защиты от ложного iOS-ресайза сравнивают со временем открытия панели
 * Во время pinch-zoom событие игнорируется целиком
 */
const RESIZE_DEBOUNCE_MS = 500;

const ResizeDispatcher = (() => {
  const immediate = new Set();
  const debounced = new Set();
  let timer;
  let burstStartedAt = 0;

  window.addEventListener('resize', () => {
    if (isPinchZoomed()) return;
    immediate.forEach((fn) => fn());
    if (!timer) burstStartedAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      debounced.forEach((fn) => fn(burstStartedAt));
    }, RESIZE_DEBOUNCE_MS);
  });

  return {
    onResize(fn) {
      immediate.add(fn);
      return () => immediate.delete(fn);
    },
    onResizeDebounced(fn) {
      debounced.add(fn);
      return () => debounced.delete(fn);
    }
  };
})();
window.ResizeDispatcher = ResizeDispatcher;

/* Адаптив верхнего меню:
- переносит лишние пункты в «Ещё»;
- корректно обрабатывает вложенные dropdown/submenu;
- пересчитывает при resize/load. */

function initResponsiveNav() {

    if (window.innerWidth <= 1120) return;
    
    const headerTopMenu = document.querySelector('.header--top-menu');
    const menuLinks = document.querySelector('.header--top-menu--links ul');
    const contactsBlock = document.querySelector('.header--top-menu--contacts');
    const container = document.querySelector('.container');
    
    if (menuLinks) {
        const existingMoreBtn = menuLinks.querySelector('.header--top-menu--links--more');
        if (existingMoreBtn) {
            const dropdown = existingMoreBtn.querySelector('.header--top-menu--dropdown ul');
            if (dropdown) {
                const hiddenLis = Array.from(dropdown.querySelectorAll(':scope > li'));
                hiddenLis.forEach(li => {
                    if (li.classList.contains('expandable')) {
                        li.classList.remove('__submenu');
                        const submenu = li.querySelector(':scope > .header--top-menu--submenu');
                        if (submenu) {
                            submenu.className = 'header--top-menu--dropdown';
                            submenu.removeAttribute('style');
                        }
                    }
                    menuLinks.insertBefore(li, existingMoreBtn);
                });
            }
            existingMoreBtn.remove();
        }
    }
    
    if (!headerTopMenu || !menuLinks || !contactsBlock || !container) return;
    
    const containerStyles = getComputedStyle(container);
    const containerPaddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
    const containerPaddingRight = parseFloat(containerStyles.paddingRight) || 0;
    const containerPaddings = containerPaddingLeft + containerPaddingRight;
    
    const headerChildren = Array.from(headerTopMenu.children);
    let totalWidth = 0;
    
    headerChildren.forEach(child => {
        const childWidth = child.getBoundingClientRect().width;
        totalWidth += childWidth;
    });
    
    const menuLinksStyles = getComputedStyle(menuLinks);
    const gap = parseFloat(menuLinksStyles.gap) || 0;
    
    const menuItems = Array.from(menuLinks.querySelectorAll(':scope > li:not(.header--top-menu--links--more)'));
    
    const availableWidth = window.innerWidth - containerPaddings;
    
    const SAFETY_MARGIN = 5;
    
    if (totalWidth <= availableWidth - SAFETY_MARGIN) {
        return;
    }
    
    const itemsToHide = [];
    let calculatedWidth = totalWidth;
    
    for (let i = menuItems.length - 1; i >= 0; i--) {
        const item = menuItems[i];
        const itemWidth = item.getBoundingClientRect().width;
        calculatedWidth -= (itemWidth + gap);
        itemsToHide.unshift(item);
        if (calculatedWidth <= availableWidth - SAFETY_MARGIN) {
            break;
        }
    }
    
    if (itemsToHide.length === 0) {
        return;
    }
    
    const moreBtn = document.createElement('li');
    moreBtn.className = 'header--top-menu--links--more expandable';
    moreBtn.innerHTML = `
        <a href="#"></a>
        <div class="header--top-menu--dropdown">
            <ul></ul>
        </div>
    `;
    
    menuLinks.appendChild(moreBtn);
    const dropdownUl = moreBtn.querySelector('.header--top-menu--dropdown ul');
    
    itemsToHide.forEach(item => {
        if (item.classList.contains('expandable')) {
            item.classList.add('__submenu');
            const dropdown = item.querySelector(':scope > .header--top-menu--dropdown');
            if (dropdown) {
                dropdown.className = 'header--top-menu--submenu';
                dropdown.removeAttribute('style');
            }
        }
        dropdownUl.appendChild(item);
    });
}

ResizeDispatcher.onResizeDebounced(initResponsiveNav);

document.addEventListener('DOMContentLoaded', () => {
    initResponsiveNav();
    window.addEventListener('load', () => {
        setTimeout(initResponsiveNav, 300);
    });
});





/* Адаптив quick меню:
- переносит лишние пункты в «Ещё»;
- пересчитывает при resize/load. */

function initResponsiveQuickMenu() {

    if (window.innerWidth <= 1120) return;
    
    const quickMenu = document.querySelector('.header--quick');
    const quickList = document.querySelector('.header--quick ul');
    
    if (!quickMenu || !quickList) return;
    
    const existingMoreBtn = quickList.querySelector('.header--quick--more');
    if (existingMoreBtn) {
        const dropdown = existingMoreBtn.querySelector('.header--quick--more--dropdown ul');
        if (dropdown) {
            const hiddenLis = Array.from(dropdown.querySelectorAll('li'));
            hiddenLis.forEach(li => {
                quickList.insertBefore(li, existingMoreBtn);
            });
        }
        existingMoreBtn.remove();
    }
    
    const availableWidth = quickList.getBoundingClientRect().width;
    
    if (availableWidth <= 0) {
        return;
    }
    
    const menuItems = Array.from(quickList.querySelectorAll('li'));
    
    if (menuItems.length === 0) return;
    
    const listStyles = getComputedStyle(quickList);
    const gap = parseFloat(listStyles.gap) || 10;
    
    let totalWidth = 0;
    const itemWidths = [];
    
    menuItems.forEach(item => {
        const itemWidth = item.getBoundingClientRect().width;
        itemWidths.push(itemWidth);
        totalWidth += itemWidth;
    });
    
    const totalGaps = (menuItems.length - 1) * gap;
    totalWidth += totalGaps;
    
    const SAFETY_MARGIN = 5;
    
    if (totalWidth <= availableWidth - SAFETY_MARGIN) {
        return;
    }
    
    const moreBtn = document.createElement('li');
    moreBtn.className = 'header--quick--more';
    moreBtn.innerHTML = `
        <a href="#"></a>
        <div class="header--quick--more--dropdown">
            <ul></ul>
        </div>
    `;
    
    quickList.appendChild(moreBtn);
    
    requestAnimationFrame(() => {
        const moreButtonWidth = moreBtn.getBoundingClientRect().width;
        const maxWidthForItems = availableWidth - moreButtonWidth - gap - SAFETY_MARGIN;
        
        const itemsToHide = [];
        let calculatedWidth = 0;
        
        for (let i = 0; i < menuItems.length; i++) {
            const nextWidth = calculatedWidth + itemWidths[i] + (i > 0 ? gap : 0);
            if (nextWidth <= maxWidthForItems) {
                calculatedWidth = nextWidth;
            } else {
                itemsToHide.push(menuItems[i]);
            }
        }
        
        if (itemsToHide.length === 0) {
            moreBtn.remove();
            return;
        }
        
        const dropdownUl = moreBtn.querySelector('.header--quick--more--dropdown ul');
        itemsToHide.forEach(item => {
            dropdownUl.appendChild(item);
        });
        
        requestAnimationFrame(() => {
            if (typeof window.positionQuickDropdown === 'function') {
                window.positionQuickDropdown(moreBtn);
            }
        });
    });
}

ResizeDispatcher.onResizeDebounced(() => {
    const quickMore = document.querySelector('.header--quick--more');
    if (quickMore) {
        quickMore.removeAttribute('data-quick-dropdown-positioned');
    }
    initResponsiveQuickMenu();
    requestAnimationFrame(() => {
        const newQuickMore = document.querySelector('.header--quick--more');
        if (newQuickMore && typeof window.positionQuickDropdown === 'function') {
            window.positionQuickDropdown(newQuickMore, true);
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    initResponsiveQuickMenu();
    window.addEventListener('load', () => {
        setTimeout(initResponsiveQuickMenu, 300);
    });
});





/* Позиционирование dropdown для quick меню:
- смещает выпадающее меню, чтобы не выходило за края экрана. */


window.positionQuickDropdown = function(item, force = false) {
  const dropdown = item.querySelector('.header--quick--more--dropdown');
  if (!dropdown) return;
  if (!force && item.dataset.quickDropdownPositioned === 'true') return;

  requestAnimationFrame(() => {
    const parentRect = item.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const vw = window.innerWidth;
    const PADDING = 5;

    const parentCenter = parentRect.left + parentRect.width / 2;
    let desiredLeft = parentCenter - dropdownRect.width / 2;

    if (desiredLeft < PADDING) {
      desiredLeft = PADDING;
    } else if (desiredLeft + dropdownRect.width > vw - PADDING) {
      desiredLeft = vw - PADDING - dropdownRect.width;
    }

    const cssLeft = parentCenter - dropdownRect.width / 2;
    const shift = desiredLeft - cssLeft;

    dropdown.style.transform = `translateX(-50%) translateX(${shift}px)`;
    item.dataset.quickDropdownPositioned = 'true';
  });
};

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('mouseenter', (e) => {
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('.header--quick--more');
    if (!item) return;
    const dropdown = item.querySelector('.header--quick--more--dropdown');
    if (!dropdown) return;
    if (e.target === dropdown || dropdown.contains(e.target)) return;
    window.positionQuickDropdown(item);
  }, true);
  
  document.addEventListener('touchstart', (e) => {
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('.header--quick--more');
    if (!item) return;
    const dropdown = item.querySelector('.header--quick--more--dropdown');
    if (!dropdown) return;
    window.positionQuickDropdown(item);
  }, true);
  
  document.addEventListener('mouseleave', (e) => {
    if (!e.target || !e.target.classList) return;
    if (!e.target.classList.contains('header--quick--more')) return;
    e.target.removeAttribute('data-quick-dropdown-positioned');
  }, true);
});
  
  
  

/* Позиционирование dropdown/submenu верхнего меню:
- смещает выпадающие меню, чтобы не выходили за края экрана;
- повышает z-index активного;
- сбрасывает флаги при уходе курсора. */

document.addEventListener('DOMContentLoaded', () => {
  function positionDropdown(item) {
    if (window.innerWidth <= 1120) return;
    const dropdown = item.querySelector('.header--top-menu--dropdown');
    if (!dropdown) return;
    if (item.dataset.dropdownPositioned === 'true') return;

    requestAnimationFrame(() => {
      const parentRect = item.getBoundingClientRect();
      const dropdownRect = dropdown.getBoundingClientRect();
      const vw = window.innerWidth;
      const PADDING = 5;

      const parentCenter = parentRect.left + parentRect.width / 2;
      let desiredLeft = parentCenter - dropdownRect.width / 2;

      if (desiredLeft < PADDING) {
        desiredLeft = PADDING;
      } else if (desiredLeft + dropdownRect.width > vw - PADDING) {
        desiredLeft = vw - PADDING - dropdownRect.width;
      }

      const cssLeft = parentCenter - dropdownRect.width / 2;
      const shift = desiredLeft - cssLeft;

      dropdown.style.transform = `translateX(-50%) translateX(${shift}px)`;
      
      const allDropdowns = document.querySelectorAll('.header--top-menu--dropdown');
      allDropdowns.forEach(d => {
        if (d === dropdown) {
          d.style.zIndex = '1500';
        } else {
          d.style.zIndex = '1000';
        }
      });
      
      item.dataset.dropdownPositioned = 'true';
    });
  }
  
  document.addEventListener('mouseenter', (e) => {
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('.expandable');
    if (!item) return;
    const dropdown = item.querySelector('.header--top-menu--dropdown');
    if (!dropdown) return;
    if (e.target === dropdown || dropdown.contains(e.target)) return;
    positionDropdown(item);
  }, true);
  
  document.addEventListener('touchstart', (e) => {
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('.expandable');
    if (!item) return;
    const dropdown = item.querySelector('.header--top-menu--dropdown');
    if (!dropdown) return;
    positionDropdown(item);
  }, true);
  
  document.addEventListener('mouseleave', (e) => {
    if (!e.target || !e.target.classList) return;
    if (!e.target.classList.contains('expandable')) return;
    e.target.removeAttribute('data-dropdown-positioned');
  }, true);

  function positionSubmenu(item) {
    if (window.innerWidth <= 1120) return;
    const submenu = item.querySelector('.header--top-menu--submenu');
    if (!submenu) return;
    if (item.dataset.positioned === 'true') return;

    requestAnimationFrame(() => {
      submenu.removeAttribute('style');
      submenu.style.left = '90%';
      submenu.style.right = 'auto';

      let submenuRect = submenu.getBoundingClientRect();
      const vw = window.innerWidth;
      const PADDING = 5;

      if (submenuRect.right > vw - PADDING) {
        submenu.style.left = 'auto';
        submenu.style.right = '100%';
        submenuRect = submenu.getBoundingClientRect();
        
        if (submenuRect.left < PADDING) {
          submenu.style.left = '90%';
          submenu.style.right = 'auto';
          submenu.style.transform = 'translateX(-60%) translateY(42px)';
          submenu.style.zIndex = '2000';
        }
      } else {
        submenu.style.left = '90%';
        submenu.style.right = 'auto';
      }
      
      item.dataset.positioned = 'true';
    });
  }
  
  document.addEventListener('mouseenter', (e) => {
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('.__submenu');
    if (!item) return;
    const submenu = item.querySelector('.header--top-menu--submenu');
    if (!submenu) return;
    if (e.target === submenu || submenu.contains(e.target)) return;
    positionSubmenu(item);
  }, true);
  
  document.addEventListener('touchstart', (e) => {
    if (!e.target || !e.target.closest) return;
    const item = e.target.closest('.__submenu');
    if (!item) return;
    const submenu = item.querySelector('.header--top-menu--submenu');
    if (!submenu) return;
    positionSubmenu(item);
  }, true);
  
  document.addEventListener('mouseleave', (e) => {
    if (!e.target || !e.target.closest) return;
    if (!e.target.classList || !e.target.classList.contains('__submenu')) return;
    const submenu = e.target.querySelector('.header--top-menu--submenu');
    e.target.removeAttribute('data-positioned');
    if (submenu) {
      submenu.removeAttribute('style');
    }
  }, true);
});
  
  
  

/* Загрузка меню каталога из menu.html */

const MENU_URL = `/interfaces/${window.interface}/fetch/menu.html`;
const MENU_DATE_KEY = 'menu_date';

let menuTemplateCache = null;

/**
 * Дата последнего изменения menu.html с сервера
 * HEAD-запрос идёт с cache: 'no-store', чтобы браузер не отдал старый ответ
 */
async function fetchMenuDate() {
  try {
    const response = await fetch(MENU_URL, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return null;
    return response.headers.get('Last-Modified');
  } catch (e) {
    return null;
  }
}

/**
 * Загрузка menu.html с проверкой даты обновления файла
 * Сохранённая в localStorage дата (menu_date) сравнивается с серверной:
 * если файл изменился — запрос идёт с cache: 'reload' в обход кеша браузера
 */
async function fetchMenuTemplate() {
  const serverDate = await fetchMenuDate();

  let savedDate = null;
  try {
    savedDate = localStorage.getItem(MENU_DATE_KEY);
  } catch (e) {
    savedDate = null;
  }

  const isChanged = serverDate !== null && serverDate !== savedDate;

  const response = await fetch(MENU_URL, { cache: isChanged ? 'reload' : 'default' });
  const html = await response.text();

  if (serverDate !== null) {
    try {
      localStorage.setItem(MENU_DATE_KEY, serverDate);
    } catch (e) {}
  }

  return html;
}

async function loadCatalogMenu() {
  const menuContainer = document.querySelector('.header--main--catalog--menu');
  if (!menuContainer) return null;

  const existing = menuContainer.querySelector('.header--main--catalog--menu--dropdown');
  if (existing) return existing;

  if (!menuTemplateCache) {
    menuTemplateCache = await fetchMenuTemplate();
  }

  const temp = document.createElement('div');
  temp.innerHTML = menuTemplateCache.trim();
  const dropdown = temp.firstElementChild;

  if (dropdown) {
    menuContainer.appendChild(dropdown);
  }

  return dropdown;
}

/**
 * Конструирование мобильного каталожного меню из загруженного menu.html
 * Берёт ---catalog-menu--left (категории) и ---category-block (подкатегории)
 * и строит header--top-menu--mobile-catalog--main-menu--sections
 */
function buildMobileCatalogSections(dropdown) {
  const catalogMenu = dropdown.matches('.---catalog-menu')
    ? dropdown
    : dropdown.querySelector('.---catalog-menu');
  const leftItems = dropdown.querySelectorAll('.---catalog-menu--left ul > li');
  const allBlocks = dropdown.querySelectorAll('.---category-block');

  const sectionsDiv = document.createElement('div');
  sectionsDiv.className = 'header--top-menu--mobile-catalog--main-menu--sections';

  const sectionsUl = document.createElement('ul');

  if (catalogMenu && catalogMenu.classList.contains('__without-top-level')) {
    allBlocks.forEach(block => {
      const catLi = buildMobileCategoryBlockLi(block);
      if (catLi) sectionsUl.appendChild(catLi);
    });

    sectionsDiv.appendChild(sectionsUl);
    return sectionsDiv;
  }

  leftItems.forEach(leftLi => {
    const categoryId = getComputedStyle(leftLi).getPropertyValue('--category-id').trim();
    const sourceA = leftLi.querySelector(':scope > a');
    if (!sourceA) return;

    const mobileLi = document.createElement('li');
    mobileLi.className = 'expandable';

    const mobileA = sourceA.cloneNode(true);
    mobileLi.appendChild(mobileA);

    const matchingBlocks = Array.from(allBlocks).filter(block =>
      getComputedStyle(block).getPropertyValue('--category-id').trim() === categoryId
    );

    if (matchingBlocks.length > 0) {
      const categoriesDiv = document.createElement('div');
      categoriesDiv.className = 'header--top-menu--mobile-catalog--main-menu--categories';
      const categoriesUl = document.createElement('ul');

      matchingBlocks.forEach(block => {
        const catLi = buildMobileCategoryBlockLi(block);
        if (catLi) categoriesUl.appendChild(catLi);
      });

      categoriesDiv.appendChild(categoriesUl);
      mobileLi.appendChild(categoriesDiv);
    }

    sectionsUl.appendChild(mobileLi);
  });

  sectionsDiv.appendChild(sectionsUl);
  return sectionsDiv;
}

/**
 * Конвертация одного ---category-block в li мобильного меню
 * (ссылка с картинкой и названием + вложенное submenu из content--list)
 */
function buildMobileCategoryBlockLi(block) {
  const titleA = block.querySelector('.---category-block--content--title');
  const contentList = block.querySelector('.---category-block--content--list');
  const blockImg = block.querySelector('.---category-block--image img');
  if (!titleA) return null;

  const catLi = document.createElement('li');
  const catA = document.createElement('a');
  catA.href = titleA.getAttribute('href') || '#';

  if (blockImg) {
    const imageDiv = document.createElement('div');
    imageDiv.className = '---mobile-catalog-image';
    imageDiv.appendChild(blockImg.cloneNode(true));
    catA.appendChild(imageDiv);
  }

  Array.from(titleA.childNodes).forEach(node => catA.appendChild(node.cloneNode(true)));
  catLi.appendChild(catA);

  if (contentList) {
    const convertedSubmenu = convertToMobileSubmenu(contentList);
    if (convertedSubmenu.children.length > 0) {
      catLi.className = 'expandable';
      catLi.appendChild(convertedSubmenu);
    }
  }

  return catLi;
}

/**
 * Рекурсивная конвертация ---category-block--content--list / --sublist
 * в ul.---mobile-catalog-submenu
 */
function convertToMobileSubmenu(sourceList) {
  const submenuUl = document.createElement('ul');
  submenuUl.className = '---mobile-catalog-submenu';

  const items = sourceList.querySelectorAll(':scope > li');

  items.forEach(sourceLi => {
    const sourceLink = sourceLi.querySelector(':scope > a');
    if (!sourceLink) return;

    const mobileLi = document.createElement('li');
    const mobileLink = document.createElement('a');
    mobileLink.href = sourceLink.getAttribute('href') || '#';
    Array.from(sourceLink.childNodes).forEach(node => mobileLink.appendChild(node.cloneNode(true)));
    mobileLi.appendChild(mobileLink);

    const sublist = sourceLi.querySelector(':scope > .---category-block--content--sublist');
    if (sublist) {
      const convertedSubmenu = convertToMobileSubmenu(sublist);
      if (convertedSubmenu.children.length > 0) {
        mobileLi.className = 'expandable';
        mobileLi.appendChild(convertedSubmenu);
      }
    }

    submenuUl.appendChild(mobileLi);
  });

  return submenuUl;
}



/* Каталог:
- вычисляет верхний отступ dropdown относительно низа меню;
- аписывает его в CSS-переменную --catalog-dropdown-top;
- при load/resize/DOMContentLoaded. */

function updateMenuOffset() {
  const menu = document.querySelector('.header--main--catalog--menu');
  const dropdown = document.querySelector('.header--main--catalog--menu--dropdown');
  
  if (!menu || !dropdown) return;
  
  const menuRect = menu.getBoundingClientRect();
  const dropdownTop = menuRect.bottom + 15;
  
  dropdown.style.setProperty('--catalog-dropdown-top', `${dropdownTop}px`);
}

ResizeDispatcher.onResizeDebounced(updateMenuOffset);
  

  

/* Поиск:
- вычисляет позицию dropdown относительно блока поиска;
- записывает в CSS-переменные --search-dropdown-top и --search-dropdown-left;
- при load/resize/DOMContentLoaded. */

function updateSearchOffset() {
  const search = document.querySelector('.header--main--catalog--search');
  const dropdown = document.querySelector('.header--main--catalog--search--dropdown');
  
  if (!search || !dropdown) return;
  
  const searchRect = search.getBoundingClientRect();
  const dropdownTop = searchRect.bottom + 5;
  const dropdownLeft = searchRect.left;
  
  dropdown.style.setProperty('--search-dropdown-top', `${dropdownTop}px`);
  dropdown.style.setProperty('--search-dropdown-left', `${dropdownLeft}px`);
}

document.addEventListener('DOMContentLoaded', updateSearchOffset);
ResizeDispatcher.onResizeDebounced(updateSearchOffset);
window.addEventListener('load', updateSearchOffset);
  

  

/* Каталог:
- открытие/закрытие dropdown по клику на кнопку;
- смена иконки с анимацией;
- закрытие по клику вне блока и по Escape. */

document.addEventListener('DOMContentLoaded', () => {
  const catalogButton = document.getElementById('main-catalog-button');
  
  if (!catalogButton) return;
  
  const iconElement = catalogButton.querySelector('i');
  
  if (!iconElement) return;
  
  let catalogDropdown = null;
  let isOpen = false;
  
  window.closeCatalogDropdown = closeDropdown;
  
  function openDropdown() {
    if (!catalogDropdown) return;
    
    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }
    
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    isOpen = true;
    catalogDropdown.classList.add('__active');
    
    if (window.innerWidth > 1120) {
      document.body.classList.add('__desctop_blocked');
    }
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-cubes-stacked');
      iconElement.classList.add('fa-xmark');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(-100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
  }
  
  function closeDropdown() {
    if (!isOpen || !catalogDropdown) return;
    
    isOpen = false;
    catalogDropdown.classList.remove('__active');
    
    if (lockedPanelsCount === 0) { // блокировку от открытой панели не снимаем — она снимется своим unlockPanelScroll
      document.body.classList.remove('__desctop_blocked');
    }
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(-100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-xmark');
      iconElement.classList.add('fa-cubes-stacked');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
  }
  
  catalogButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    
    if (!catalogDropdown) {
      catalogDropdown = await loadCatalogMenu();
      if (!catalogDropdown) return;
      initCategoryHover();
    }
    
    updateMenuOffset();
    
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });
  
  document.addEventListener('click', (event) => {
    if (!isOpen) return;
    
    if (!catalogDropdown || !catalogDropdown.contains(event.target)) {
      closeDropdown();
    }
  });
  
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      closeDropdown();
    }
  });
});
  

  

/* Каталог: при наведении на пункт меню:
- подсвечивает активный пункт;
- показывает соответствующий блок категории по CSS-переменной --category-id;
- запоминает последний активный пункт в localStorage и восстанавливает его при следующем открытии;
- клик по пункту меню (li) обрабатывается как клик по ссылке внутри него. */

const CATALOG_LAST_CATEGORY_LS_KEY = 'catalog_last_active_category_id';

function activateCategory(categoryId, menuItems, categoryBlocks) {
  let matchedItem = null;
  
  menuItems.forEach(item => {
    const itemId = getComputedStyle(item).getPropertyValue('--category-id').trim();
    if (itemId === categoryId) {
      item.classList.add('__menu-active');
      matchedItem = item;
    } else {
      item.classList.remove('__menu-active');
    }
  });
  
  if (!matchedItem) return false;
  
  categoryBlocks.forEach(block => {
    const blockCategoryId = getComputedStyle(block).getPropertyValue('--category-id').trim();
    
    if (blockCategoryId === categoryId) {
      block.classList.add('__category-active');
    } else {
      block.classList.remove('__category-active');
    }
  });
  
  return true;
}

function initCategoryHover(scope) {
  const roots = scope
    ? [scope]
    : Array.from(document.querySelectorAll('.---catalog-menu'));
  
  const savedCategoryId = localStorage.getItem(CATALOG_LAST_CATEGORY_LS_KEY);
  
  roots.forEach(rootCandidate => {
    const root = rootCandidate.matches('.---catalog-menu')
      ? rootCandidate
      : rootCandidate.querySelector('.---catalog-menu');
    
    if (!root || root.dataset.categoryHoverInited === '1') return;
    root.dataset.categoryHoverInited = '1';
    
    const menuItems = root.querySelectorAll('.---catalog-menu--left ul > li');
    const categoryBlocks = root.querySelectorAll('.---category-block');
    
    if (savedCategoryId) {
      activateCategory(savedCategoryId, menuItems, categoryBlocks);
    }
    
    menuItems.forEach(menuItem => {
      menuItem.addEventListener('mouseenter', () => {
        const categoryId = getComputedStyle(menuItem).getPropertyValue('--category-id').trim();
        
        if (activateCategory(categoryId, menuItems, categoryBlocks)) {
          localStorage.setItem(CATALOG_LAST_CATEGORY_LS_KEY, categoryId);
        }
      });
      
      menuItem.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const link = menuItem.querySelector('a');
        if (link) link.click();
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCategoryHover();
});



/* Поиск:
- показ/скрытие dropdown при фокусе и вводе текста;
- управление suggestions/products/categories;
- показ/скрытие кнопки очистки;
- очистка текста при клике на кнопку очистки;
- скрытие dropdown поиска при открытии каталога;
- клик на suggestion подставляет текст в input. */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.querySelector('.header--main--catalog--search input');
  const searchDropdown = document.querySelector('.header--main--catalog--search--dropdown');
  const clearButton = document.querySelector('.header--main--catalog--search .__clear');
  const catalogButton = document.getElementById('main-catalog-button');
  
  if (!searchInput || !searchDropdown || !clearButton) return;
  
  let scrollPositionOnOpen = 0;
  
  function showSearchDropdown() {
    // При пустой строке поиска блоков результатов быть не должно —
    // удаляем залипшие products/categories перед показом дропдауна
    if (searchInput.value.trim().length === 0 && typeof window.resetSearchResults === 'function') {
      window.resetSearchResults();
    }
    
    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }
    
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    updateSearchOffset();
    scrollPositionOnOpen = window.scrollY;
    searchDropdown.classList.add('__active');
  }
  
  function hideSearchDropdown() {
    searchDropdown.classList.remove('__active');
  }
  
  function showClearButton() {
    clearButton.classList.add('__active');
  }
  
  function hideClearButton() {
    clearButton.classList.remove('__active');
  }
  
  function updateContentVisibility() {
    const hasText = searchInput.value.trim().length > 0;
    
    // Блоки products/categories добавляет и удаляет search.js по ответу
    // эндпойнта, здесь управляем только подсказками и режимом сетки
    const suggestionsBlock = document.querySelector('.---search-suggestions');
    const searchContent = document.querySelector('.---search-content');
    
    if (hasText) {
      if (suggestionsBlock) suggestionsBlock.classList.remove('__active');
      if (searchContent) searchContent.classList.remove('__suggestions-mode');
      showClearButton();
    } else {
      if (suggestionsBlock) suggestionsBlock.classList.add('__active');
      if (searchContent) searchContent.classList.add('__suggestions-mode');
      hideClearButton();
    }
  }
  
searchInput.addEventListener('input', () => {
  updateContentVisibility();
  searchInput.focus();
  if (!searchDropdown.classList.contains('__active')) {
    showSearchDropdown();
  }
});

searchInput.addEventListener('focus', () => {
  showSearchDropdown();
  updateContentVisibility();
});

searchInput.addEventListener('click', () => {
  searchInput.focus();
  if (!searchDropdown.classList.contains('__active')) {
    showSearchDropdown();
  }
});

clearButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  searchInput.value = '';
  updateContentVisibility();
  searchInput.focus();

  const catalogMenuDropdown = document.querySelector('.header--main--catalog--menu--dropdown');
  if (catalogMenuDropdown && catalogMenuDropdown.classList.contains('__active') && catalogButton) {
    catalogButton.click();
  }
});
  
  if (catalogButton) {
    catalogButton.addEventListener('click', () => {
      requestAnimationFrame(() => {
        const catalogDropdown = document.querySelector('.header--main--catalog--menu--dropdown');
        const isDropdownVisible = catalogDropdown && catalogDropdown.classList.contains('__active');
        
        if (isDropdownVisible) {
          hideSearchDropdown();
        }
      });
    });
  }
  
  document.addEventListener('click', (event) => {
    if (!searchDropdown.classList.contains('__active')) return;
    
    const searchBlock = document.querySelector('.header--main--catalog--search');
    if (searchBlock && !searchBlock.contains(event.target)) {
      hideSearchDropdown();
    }
  });
  
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchDropdown.classList.contains('__active')) {
      hideSearchDropdown();
      searchInput.blur();
    }
  });
  
  window.addEventListener('scroll', () => {
    if (!searchDropdown.classList.contains('__active')) return;
    
    const scrollDifference = Math.abs(window.scrollY - scrollPositionOnOpen);
    if (scrollDifference > 100) {
      hideSearchDropdown();
    }
  });
});
  

  

/* Вычисление высоты header--main:
- устанавливает CSS-переменную --header-main-height;
- обновляется при load/resize. */

function updateHeaderMainHeight() {
  const headerMain = document.querySelector('.header--main');
  const topMenu = document.querySelector('.header--top-menu');
  
  if (!headerMain) return;
  
  const height = headerMain.offsetHeight;
  
  if (topMenu) {
    topMenu.style.setProperty('--header-main-height', `${height}px`);
  }
  
  document.body.style.setProperty('--header-main-height', `${height}px`);
}

document.addEventListener('DOMContentLoaded', updateHeaderMainHeight);
ResizeDispatcher.onResize(updateHeaderMainHeight);
window.addEventListener('load', updateHeaderMainHeight);
  


/* Вычисление полной высоты header:
- устанавливает CSS-переменную --all-header-height на body;
- >= 1121: сумма высот header--main, top-menu nav и quick nav;
- < 1121: только header--main;
- обновляется при load/resize/DOMContentLoaded. */

function updateAllHeaderHeight() {
  const headerMain = document.querySelector('.header--main');
  if (!headerMain) return;

  const mainHeight = headerMain.offsetHeight;

  if (window.innerWidth < 1121) {
    document.body.style.setProperty('--all-header-height', `${mainHeight}px`);
    return;
  }

  const topMenuNav = document.querySelector('nav:has(> .container > .header--top-menu)');
  const quickNav = document.querySelector('nav:has(> .container > .header--quick)');

  const topMenuHeight = topMenuNav ? topMenuNav.offsetHeight : 0;
  const quickHeight = quickNav ? quickNav.offsetHeight : 0;

  const allHeaderHeight = mainHeight + topMenuHeight + quickHeight;
  document.body.style.setProperty('--all-header-height', `${allHeaderHeight}px`);
}

document.addEventListener('DOMContentLoaded', updateAllHeaderHeight);
ResizeDispatcher.onResize(updateAllHeaderHeight);
window.addEventListener('load', updateAllHeaderHeight);


  

/* Глобальные функции для блокировки прокрутки на мобильных устройствах */

let scrollPosition = 0;

function preventScroll(e) {
  if (document.body.classList.contains('__pinch-allowed') && e.target.closest && e.target.closest('.mobile-panel.__video-panel')) {
    const isMultiTouch = e.touches && e.touches.length > 1;
    const isZoomed = window.visualViewport && window.visualViewport.scale > 1;
    if (isMultiTouch || isZoomed) {
      return;
    }
  }
  
  const target = e.target;
  let element = target;
  
  while (element && element !== document.body) {
    if (element.classList.contains('__scrollable')) {
      const hasScroll = element.scrollHeight > element.clientHeight;
      if (hasScroll) {
        const atTop = element.scrollTop <= 0;
        const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight;
        
        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const lastY = element._lastTouchY || touch.clientY;
          const deltaY = touch.clientY - lastY;
          element._lastTouchY = touch.clientY;
          
          if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
            e.preventDefault();
            return;
          }
        }
        
        return;
      }
    }
    element = element.parentElement;
  }
  
  e.preventDefault();
}

function resetTouchTracking(e) {
  let element = e.target;
  while (element && element !== document.body) {
    if (element.classList.contains('__scrollable')) {
      element._lastTouchY = e.touches[0].clientY;
      break;
    }
    element = element.parentElement;
  }
}

window.lockScroll = function() {
  scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  
  window.ignoreScrollTracking = true;
  
  document.body.style.top = `-${scrollPosition}px`;
  document.body.classList.add('__mobile-menu-open');

  // Гарантируем видимый header при открытой мобильной панели:
  // снимаем __mobile-hidden синхронно (scroll-обработчик сам по себе
  // снимает __sticky/__quick-hidden/__hided через scrollY=0, но __mobile-hidden
  // он не трогает из-за window.ignoreScrollTracking — поэтому убираем явно)
  const header = document.querySelector('header');
  if (header) {
    header.classList.remove('__mobile-hidden');
  }
  
  document.addEventListener('touchstart', resetTouchTracking, { passive: true });
  document.addEventListener('touchmove', preventScroll, { passive: false });
  
  setTimeout(() => {
    window.ignoreScrollTracking = false;
  }, 200);
};

window.ignoreScrollTracking = false;

window.unlockScroll = function() {
  const restorePosition = scrollPosition;
  
  window.ignoreScrollTracking = true;
  
  document.body.classList.remove('__mobile-menu-open');
  document.body.style.top = '';
  window.scrollTo(0, restorePosition);
  scrollPosition = 0;
  
  document.removeEventListener('touchstart', resetTouchTracking, { passive: true });
  document.removeEventListener('touchmove', preventScroll, { passive: false });
  
  setTimeout(() => {
    window.ignoreScrollTracking = false;
  }, 200);
};

/**
 * Panel Scroll Lock
 * Единая блокировка страницы под выезжающими панелями (mobile-right-panel и mobile-panel)
 * desktop (> 1120) — классы __desctop_blocked и __wide на body, mobile (<= 1120) — lockScroll
 * Счётчик открытых панелей нужен, чтобы вложенная панель не снимала блокировку, пока открыта родительская
 * Ресайз через 1120px переключает тип блокировки, пока открыта хотя бы одна панель
 */
let lockedPanelsCount = 0;

window.lockPanelScroll = function() {
  lockedPanelsCount++;

  if (lockedPanelsCount > 1) return; // блокировка уже стоит от ранее открытой панели

  if (window.innerWidth > 1120) {
    document.body.classList.add('__desctop_blocked', '__wide');
  } else {
    window.lockScroll();
  }
};

window.unlockPanelScroll = function() {
  if (lockedPanelsCount === 0) return;

  lockedPanelsCount--;

  if (lockedPanelsCount > 0) return; // остались открытые панели — блокировку не снимаем

  if (document.body.classList.contains('__desctop_blocked')) { // смотрим на фактическую блокировку — она могла переключиться ресайзом
    document.body.classList.remove('__desctop_blocked', '__wide');
  } else {
    window.unlockScroll();
  }
};

ResizeDispatcher.onResize(() => {
  if (lockedPanelsCount === 0) return;

  const isDesktop = window.innerWidth > 1120;
  const hasMobileLock = document.body.classList.contains('__mobile-menu-open');
  const hasDesktopLock = document.body.classList.contains('__desctop_blocked');

  if (isDesktop && hasMobileLock) {
    window.unlockScroll();
    document.body.classList.add('__desctop_blocked', '__wide');
  } else if (!isDesktop && hasDesktopLock) {
    document.body.classList.remove('__desctop_blocked', '__wide');
    window.lockScroll();
  }
});

// Позволяет переопределить позицию, на которую unlockScroll прокрутит документ.
// Используется, например, при применении фильтров каталога, чтобы после закрытия
// мобильной панели страница оказалась на верхе .catalog--filters, а не в исходном месте.
window.setLockedScrollPosition = function(y) {
  if (typeof y !== 'number' || !isFinite(y)) return;
  scrollPosition = Math.max(0, y);
};

/**
 * Safari Tint
 * Невидимая полоса safari-tint у нижнего края экрана: Safari 26 (iOS) красит нижнюю панель в её background-color,
 *   а не в цвет fixed-элементов под ней (кнопок, плашек)
 * Создается один раз в конце body, показывается и скрывается только через CSS (см. SAFARI TINT в main.css):
 *   при открытых mobile-right-panel, mobile-panel, mobile-search-panel, header--top-menu.__mobile-active
 *   и при плавающей ---buy-box--buy-button (product.js)
 */
function initSafariTint() {
  const tint = document.createElement('div');
  tint.className = 'safari-tint';
  tint.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tint);
}

document.addEventListener('DOMContentLoaded', initSafariTint);
  

  

/* Мобильное меню:
- открытие/закрытие по клику на кнопку;
- закрытие по клику на оверлей;
- закрытие по Escape;
- смена иконки с анимацией;
- анимация только при взаимодействии. */

document.addEventListener('DOMContentLoaded', () => {
  const mobileMenuButton = document.getElementById('mobile-menu');
  const topMenu = document.querySelector('.header--top-menu');
  const iconElement = mobileMenuButton ? mobileMenuButton.querySelector('i') : null;
  const quickMenu = document.querySelector('.header--quick');
  const mobileCatalog = document.querySelector('.header--top-menu--mobile-catalog');
  const menuLinks = document.querySelector('.header--top-menu--links');
  
  if (!mobileMenuButton || !topMenu || !iconElement) return;
  
  let quickMenuOriginalParent = null;
  let quickMenuOriginalNextSibling = null;
  
  if (quickMenu) {
    quickMenuOriginalParent = quickMenu.parentNode;
    quickMenuOriginalNextSibling = quickMenu.nextSibling;
  }
  
  function restoreQuickMenu() {
    if (quickMenu && quickMenuOriginalParent) {
      if (quickMenuOriginalNextSibling) {
        quickMenuOriginalParent.insertBefore(quickMenu, quickMenuOriginalNextSibling);
      } else {
        quickMenuOriginalParent.appendChild(quickMenu);
      }
    }
  }
  
  function closeMobileMenu() {
    topMenu.classList.add('__mobile-closed');
    topMenu.classList.remove('__mobile-active', '__scrollable');
    window.unlockScroll();
    
    if (typeof window.closeMobileSubmenuPanels === 'function') {
      window.closeMobileSubmenuPanels();
    }
    
    const mobileMenuDropdown = document.querySelector('.header--main--catalog--menu--dropdown.__mobile-menu-dropdown');
    if (mobileMenuDropdown) {
      mobileMenuDropdown.classList.remove('__active', '__mobile-menu-dropdown');
      const catalogMenu = document.querySelector('.header--main--catalog--menu');
      if (catalogMenu) {
        catalogMenu.appendChild(mobileMenuDropdown);
      }
    }
    
    restoreQuickMenu();
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(-100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-xmark');
      iconElement.classList.add('fa-bars-staggered');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
    
    setTimeout(() => {
      topMenu.classList.remove('__mobile-closed');
    }, 300);
  }
  
  function openMobileMenu() {
    const searchDropdown = document.querySelector('.header--main--catalog--search--dropdown');
    if (searchDropdown) {
      searchDropdown.classList.remove('__active');
    }
    
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    if (typeof window.closeMobileSearchPanel === 'function') {
      window.closeMobileSearchPanel();
    }
    
    if (typeof window.closeMobileCartPanel === 'function') {
      window.closeMobileCartPanel();
    }
    
    if (typeof window.closeMobileFilterPanel === 'function') {
      window.closeMobileFilterPanel();
    }
    
    if (typeof window.closeMobileOrderByPanel === 'function') {
      window.closeMobileOrderByPanel();
    }
    
    if (typeof window.closeSelectOptionMobilePanel === 'function') {
      window.closeSelectOptionMobilePanel();
    }
    
    if (typeof window.closeMobileVideoPanel === 'function') {
      window.closeMobileVideoPanel();
    }
    
    if (typeof window.closeMobileConfiguratorPanel === 'function') {
      window.closeMobileConfiguratorPanel();
    }
    
    if (typeof window.closeCatalogDropdown === 'function') {
      window.closeCatalogDropdown();
    }
    
    topMenu.classList.remove('__mobile-closed');
    topMenu.classList.add('__mobile-active', '__scrollable');
    window.lockScroll();
    
    if (quickMenu && mobileCatalog && menuLinks) {
      topMenu.insertBefore(quickMenu, menuLinks);
    }
    
    if (menuLinks) {
      menuLinks.querySelectorAll('.header--top-menu--dropdown, .header--top-menu--submenu').forEach(el => {
        el.removeAttribute('style');
      });
      menuLinks.querySelectorAll('.expandable').forEach(el => {
        el.removeAttribute('data-dropdown-positioned');
        el.removeAttribute('data-positioned');
      });
    }
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-bars-staggered');
      iconElement.classList.add('fa-xmark');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(-100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
  }
  
  function handleResize() {
    if (window.innerWidth > 1120) {
      if (topMenu.classList.contains('__mobile-active')) {
        closeMobileMenu();
      } else {
        restoreQuickMenu();
      }
      setTimeout(() => {
        if (typeof initResponsiveQuickMenu === 'function') {
          initResponsiveQuickMenu();
        }
      }, 50);
    }
  }
  
  ResizeDispatcher.onResizeDebounced(handleResize);
  
  mobileMenuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (topMenu.classList.contains('__mobile-active')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });
  
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('__mobile-menu-open') &&
        topMenu.classList.contains('__mobile-active') &&
        !topMenu.contains(e.target) &&
        e.target !== mobileMenuButton &&
        !e.target.closest('.mobile-submenu-panel') &&
        !e.target.closest('.mobile-right-panel') &&
        !e.target.closest('.header--main--catalog--menu--dropdown.__mobile-menu-dropdown')) {
      closeMobileMenu();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && 
        document.body.classList.contains('__mobile-menu-open') &&
        topMenu.classList.contains('__mobile-active')) {
      closeMobileMenu();
    }
  });
});
  

  

/* Мобильное меню - многоуровневые панели:
- клик на expandable элемент открывает новую панель;
- панель выдвигается поверх текущей;
- кнопка "Назад" закрывает панель;
- поддержка неограниченной вложенности. */

window.closeMobileSubmenuPanels = null;

document.addEventListener('DOMContentLoaded', () => {
  const topMenu = document.querySelector('.header--top-menu');
  const mobileCatalogMenu = document.querySelector('.header--top-menu--mobile-catalog--main-menu');
  
  if (!topMenu) return;
  
  let activePanels = [];
  
  function createSubmenuPanel(title, content, parentUrl) {
    const panel = document.createElement('div');
    panel.className = 'mobile-submenu-panel __scrollable';
    
    const header = document.createElement('button');
    header.className = 'mobile-submenu-panel--header';
    header.setAttribute('type', 'button');
    header.textContent = title;
    header.setAttribute('aria-label', 'Назад: ' + title);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'mobile-submenu-panel--content';
    
    const clonedContent = content.cloneNode(true);
    
    if (parentUrl && clonedContent.tagName === 'UL') {
      const openPageLi = document.createElement('li');
      openPageLi.className = '---page-link';
      const openPageLink = document.createElement('a');
      openPageLink.href = parentUrl;
      
      const isCatalog = clonedContent.querySelector('.---mobile-catalog-submenu, .header--top-menu--mobile-catalog--main-menu--categories');
      openPageLink.textContent = isCatalog ? 'все товары категории' : 'открыть страницу';
      if (isCatalog) openPageLi.className = '---all-in-category';
      
      openPageLi.appendChild(openPageLink);
      
      clonedContent.insertBefore(openPageLi, clonedContent.firstChild);
    }
    
    contentWrapper.appendChild(clonedContent);
    
    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    
    document.body.appendChild(panel);
    
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel(panel);
    });
    
    setupExpandableHandlers(contentWrapper, panel);
    
    return panel;
  }
  
  function setupCatalogHandlers(container) {
    const firstUl = container.querySelector('ul');
    if (!firstUl) return;
    
    const directListItems = Array.from(firstUl.children).filter(child => child.tagName === 'LI');
    
    directListItems.forEach(li => {
      const link = Array.from(li.children).find(child => child.tagName === 'A');
      if (!link) return;
      
      const categoriesDiv = Array.from(li.children).find(child => 
        child.classList && child.classList.contains('header--top-menu--mobile-catalog--main-menu--categories')
      );
      const submenuUl = Array.from(li.children).find(child => 
        child.tagName === 'UL' && child.classList && child.classList.contains('---mobile-catalog-submenu')
      );
      
      if (categoriesDiv || submenuUl) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          if (categoriesDiv) {
            const categoriesUl = categoriesDiv.querySelector('ul');
            if (categoriesUl) {
              const title = link.textContent.trim();
              const url = link.getAttribute('href');
              openPanel(title, categoriesUl, url);
            }
          } else if (submenuUl) {
            const title = link.textContent.trim();
            const url = link.getAttribute('href');
            
            const cleanUl = document.createElement('ul');
            Array.from(submenuUl.children).forEach(child => {
              cleanUl.appendChild(child.cloneNode(true));
            });
            
            openPanel(title, cleanUl, url);
          }
        });
      }
    });
  }
  
  function setupExpandableHandlers(container, parentPanel) {
    const expandables = container.querySelectorAll('.expandable > a');
    
    expandables.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const expandableItem = link.parentElement;
        const dropdown = expandableItem.querySelector('.header--top-menu--dropdown');
        const submenu = expandableItem.querySelector('.header--top-menu--submenu');
        const menuContent = dropdown || submenu;
        
        if (!menuContent) return;
        
        const title = link.textContent.trim();
        const url = link.getAttribute('href');
        const contentUl = menuContent.querySelector('ul');
        
        if (contentUl) {
          openPanel(title, contentUl, url);
        }
      });
    });
    
    setupCatalogHandlers(container);
  }

  function openPanel(title, content, parentUrl) {
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    if (typeof window.closeMobileSearchPanel === 'function') {
      window.closeMobileSearchPanel();
    }
    
    if (typeof window.closeMobileCartPanel === 'function') {
      window.closeMobileCartPanel();
    }
    
    const panel = createSubmenuPanel(title, content, parentUrl);
    activePanels.push(panel);
    
    panel.classList.add('__active');
  }
  
  function closePanel(panel) {
    panel.classList.remove('__active');
    
    setTimeout(() => {
      panel.remove();
      const index = activePanels.indexOf(panel);
      if (index > -1) {
        activePanels.splice(index, 1);
      }
    }, 300);
  }
  
  function closeAllPanels() {
    activePanels.forEach(panel => {
      panel.classList.remove('__active');
      setTimeout(() => {
        panel.remove();
      }, 300);
    });
    activePanels = [];
  }
  
  window.closeMobileSubmenuPanels = closeAllPanels;
  
  topMenu.addEventListener('click', (e) => {
    if (!topMenu.classList.contains('__mobile-active')) return;
    
    const link = e.target.closest('.header--top-menu--links .expandable > a');
    if (!link) return;
    
    const expandableItem = link.parentElement;
    const dropdown = expandableItem.querySelector('.header--top-menu--dropdown');
    const submenu = expandableItem.querySelector('.header--top-menu--submenu');
    const menuContent = dropdown || submenu;
    
    if (!menuContent) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const title = link.textContent.trim();
    const url = link.getAttribute('href');
    const contentUl = menuContent.querySelector('ul');
    
    if (contentUl) {
      openPanel(title, contentUl, url);
    }
  });
  
  if (mobileCatalogMenu) {
    const catalogRoot = mobileCatalogMenu.querySelector('.header--top-menu--mobile-catalog--main-menu--root');
    
    if (catalogRoot) {
      catalogRoot.addEventListener('click', async (e) => {
        if (!topMenu.classList.contains('__mobile-active')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (document.body.classList.contains('__without_catalog') && window.innerWidth >= 1401) {
          const existing = document.querySelector('.header--main--catalog--menu--dropdown.__mobile-menu-dropdown.__active');
          if (existing) return;
          
          const dropdown = await loadCatalogMenu();
          if (dropdown) {
            document.body.appendChild(dropdown);
            updateMenuOffset();
            dropdown.classList.add('__active', '__mobile-menu-dropdown');
            initCategoryHover();
          }
          return;
        }
        
        let sectionsContainer = mobileCatalogMenu.querySelector('.header--top-menu--mobile-catalog--main-menu--sections');
        
        if (!sectionsContainer) {
          const dropdown = await loadCatalogMenu();
          if (dropdown) {
            sectionsContainer = buildMobileCatalogSections(dropdown);
            mobileCatalogMenu.appendChild(sectionsContainer);
          }
        }
        
        if (sectionsContainer) {
          const sectionsUl = sectionsContainer.querySelector('ul');
          if (sectionsUl) {
            openPanel('каталог', sectionsUl);
          }
        }
      });
    }
  }
  
  function closeMobileMenuDropdown() {
    const dd = document.querySelector('.header--main--catalog--menu--dropdown.__mobile-menu-dropdown');
    if (!dd) return;
    dd.classList.remove('__active', '__mobile-menu-dropdown');
    const catalogMenu = document.querySelector('.header--main--catalog--menu');
    if (catalogMenu) {
      catalogMenu.appendChild(dd);
    }
  }
  
  document.addEventListener('click', (e) => {
    const dd = document.querySelector('.header--main--catalog--menu--dropdown.__mobile-menu-dropdown.__active');
    if (!dd) return;
    if (dd.contains(e.target)) return;
    
    if (e.target.closest('.header--top-menu.__mobile-active') || e.target.closest('.mobile-submenu-panel')) {
      closeMobileMenuDropdown();
    }
  });
  
  const mainPhone = document.querySelector('.main-phone.expandable');
  if (mainPhone) {
    mainPhone.addEventListener('click', (e) => {
      if (!topMenu.classList.contains('__mobile-active')) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const dropdown = mainPhone.querySelector('.header--top-menu--contacts--dropdown');
      
      if (dropdown) {
        openPanel('контакты', dropdown);
      }
    });
  }
  
  document.addEventListener('click', (e) => {
    if (activePanels.length === 0) return;
    if (!document.body.classList.contains('__mobile-menu-open')) return;
    
    const clickedInsidePanel = activePanels.some(panel => panel.contains(e.target));
    const clickedInsideMenu = topMenu.contains(e.target);
    const clickedMenuButton = document.getElementById('mobile-menu')?.contains(e.target);
    
    if (!clickedInsidePanel && !clickedInsideMenu && !clickedMenuButton) {
      closeAllPanels();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activePanels.length > 0) {
      e.stopImmediatePropagation();
      const lastPanel = activePanels[activePanels.length - 1];
      closePanel(lastPanel);
    }
  }, true);
});
  

  

/* Мобильная панель контактов справа:
- открытие/закрытие по клику на header--main--actions--contacts при ширине < 1120px;
- анимация иконки (зеркальная относительно mobile-menu);
- панель выдвигается справа;
- содержимое из header--top-menu--contacts--dropdown. */

window.closeMobileRightPanel = null;

document.addEventListener('DOMContentLoaded', () => {
  const contactsButton = document.querySelector('.header--main--actions--contacts button');
  const contactsDropdown = document.querySelector('.header--top-menu--contacts--dropdown');
  
  if (!contactsButton || !contactsDropdown) return;
  
  let contactsPanel = null;
  let panelOpenedAt = 0;
  let iconElement = contactsButton.querySelector('i');
  
  if (!iconElement) return;
  
  function createContactsPanel() {
    const panel = document.createElement('section');
    panel.className = 'mobile-right-panel __scrollable';
    
    const clonedContent = contactsDropdown.cloneNode(true);
    panel.appendChild(clonedContent);
    
    document.body.appendChild(panel);
    
    return panel;
  }
  
  function openContactsPanel() {
    if (contactsPanel) return;
    
    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }
    
    if (typeof window.closeMobileSubmenuPanels === 'function') {
      window.closeMobileSubmenuPanels();
    }
    
    if (typeof window.closeMobileSearchPanel === 'function') {
      window.closeMobileSearchPanel();
    }
    
    if (typeof window.closeMobileCartPanel === 'function') {
      window.closeMobileCartPanel();
    }
    
    if (typeof window.closeMobileFilterPanel === 'function') {
      window.closeMobileFilterPanel();
    }
    
    if (typeof window.closeMobileOrderByPanel === 'function') {
      window.closeMobileOrderByPanel();
    }
    
    if (typeof window.closeSelectOptionMobilePanel === 'function') {
      window.closeSelectOptionMobilePanel();
    }
    
    if (typeof window.closeMobileVideoPanel === 'function') {
      window.closeMobileVideoPanel();
    }
    
    if (typeof window.closeMobileConfiguratorPanel === 'function') {
      window.closeMobileConfiguratorPanel();
    }
    
    if (typeof window.closeCatalogDropdown === 'function') {
      window.closeCatalogDropdown();
    }
    
    window.lockScroll();
    
    panelOpenedAt = Date.now();
    contactsPanel = createContactsPanel();
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(-100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-phone');
      iconElement.classList.add('fa-xmark');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
    
    contactsPanel.classList.add('__active');
  }
  
  function closeContactsPanel() {
    if (!contactsPanel) return;
    
    contactsPanel.classList.remove('__active');
    
    window.unlockScroll();
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateX(100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-xmark');
      iconElement.classList.add('fa-phone');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateX(-100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
    
    setTimeout(() => {
      if (contactsPanel) {
        contactsPanel.remove();
        contactsPanel = null;
      }
    }, 300);
  }
  
  function toggleContactsPanel() {
    if (contactsPanel) {
      closeContactsPanel();
    } else {
      openContactsPanel();
    }
  }
  
  window.closeMobileRightPanel = closeContactsPanel;
  
  contactsButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleContactsPanel();
  });
  
  document.addEventListener('click', (e) => {
    if (!contactsPanel) return;
    
    if (!contactsPanel.contains(e.target) && 
        !contactsButton.contains(e.target)) {
      closeContactsPanel();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && contactsPanel) {
      e.stopImmediatePropagation();
      closeContactsPanel();
    }
  });
  
  ResizeDispatcher.onResizeDebounced((resizeStartedAt) => {
    // На iOS lockScroll (position:fixed + top) может вызывать resize из-за смены viewport.
    // Игнорируем resize, начавшийся раньше чем через 400ms после открытия — это артефакт, не реальная смена ориентации.
    if (resizeStartedAt - panelOpenedAt < 400) return;
    if (contactsPanel) {
      closeContactsPanel();
    }
  });
});
  

  

/**
 * Account Exit Button
 * На страницах /account и /account/* при наличии __account_active у header--main--actions--user
 * первый клик по header--main--actions--user button не уходит по data-link
 * (всплытие до общего обработчика Data-link buttons останавливается),
 * а ставит на header--main--actions--user класс __exit и меняет иконку fa-user на fa-right-from-bracket
 * (анимация как у header--main--actions--contacts), aria-label кнопки меняется на «Выйти из аккаунта»
 * Клик в режиме __exit выполняет выход через accountLogout из account.js
 * Клик вне кнопки или Escape снимают __exit с обратной анимацией иконки и возвращают исходный aria-label
 */
function initAccountExitButton() {
  if (!/^\/account(\/|$)/.test(window.location.pathname)) return;

  const userBlock = document.querySelector('.header--main--actions--user.__account_active');
  const userLink = userBlock ? userBlock.querySelector('button') : null;
  const iconElement = userLink ? userLink.querySelector('i') : null;

  if (!iconElement) return;

  const defaultLabel = userLink.getAttribute('aria-label') || '';

  let swapTimer = null;
  let settleTimer = null;

  function animateIcon(isExit) {
    const shift = isExit ? 100 : -100;

    clearTimeout(swapTimer);
    clearTimeout(settleTimer);

    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = `translateX(${-shift}%)`;

    swapTimer = setTimeout(() => {
      iconElement.classList.toggle('fa-user', !isExit);
      iconElement.classList.toggle('fa-right-from-bracket', isExit);
      iconElement.style.transition = 'none';
      iconElement.style.transform = `translateX(${shift}%)`;

      settleTimer = setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateX(0)';
      }, 20);
    }, 200);
  }

  function setExitMode(isExit) {
    if (userBlock.classList.contains('__exit') === isExit) return;

    userBlock.classList.toggle('__exit', isExit);
    userLink.setAttribute('aria-label', isExit ? 'Выйти из аккаунта' : defaultLabel);
    animateIcon(isExit);
  }

  userLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (userBlock.classList.contains('__exit')) {
      if (typeof window.accountLogout === 'function') {
        window.accountLogout();
      }
      return;
    }

    setExitMode(true);
  });

  document.addEventListener('click', (e) => {
    if (!userBlock.classList.contains('__exit')) return;
    if (userLink.contains(e.target)) return;

    setExitMode(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && userBlock.classList.contains('__exit')) {
      setExitMode(false);
    }
  });
}

document.addEventListener('DOMContentLoaded', initAccountExitButton);
  

  

/* Мобильная панель поиска:
- открытие/закрытие по клику на header--main--actions--search при ширине <= 1120px;
- анимация иконки (вертикальная);
- панель выдвигается сверху вниз. */

window.closeMobileSearchPanel = null;

document.addEventListener('DOMContentLoaded', () => {
  const searchButton = document.querySelector('.header--main--actions--search button');
  const searchPanel = document.querySelector('.mobile-search-panel');
  
  if (!searchButton || !searchPanel) return;
  
  let iconElement = searchButton.querySelector('i');
  
  if (!iconElement) return;
  
  let isOpen = false;
  let panelOpenedAt = 0;
  
  function openSearchPanel() {
    if (isOpen) return;
    
    const mobileMenuButton = document.getElementById('mobile-menu');
    const topMenu = document.querySelector('.header--top-menu');
    if (topMenu && topMenu.classList.contains('__mobile-active') && mobileMenuButton) {
      mobileMenuButton.click();
    }
    
    if (typeof window.closeMobileRightPanel === 'function') {
      window.closeMobileRightPanel();
    }
    
    if (typeof window.closeMobileSubmenuPanels === 'function') {
      window.closeMobileSubmenuPanels();
    }
    
    if (typeof window.closeMobileCartPanel === 'function') {
      window.closeMobileCartPanel();
    }
    
    if (typeof window.closeMobileFilterPanel === 'function') {
      window.closeMobileFilterPanel();
    }
    
    if (typeof window.closeMobileOrderByPanel === 'function') {
      window.closeMobileOrderByPanel();
    }
    
    if (typeof window.closeSelectOptionMobilePanel === 'function') {
      window.closeSelectOptionMobilePanel();
    }
    
    if (typeof window.closeMobileVideoPanel === 'function') {
      window.closeMobileVideoPanel();
    }
    
    if (typeof window.closeMobileConfiguratorPanel === 'function') {
      window.closeMobileConfiguratorPanel();
    }
    
    window.lockScroll();
    isOpen = true;
    panelOpenedAt = Date.now();
    
    searchPanel.classList.add('__active');
    
    const searchInput = document.getElementById('mobile-search-panel-input');
    if (searchInput) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      
      if (isIOS) {
        const tempInput = document.createElement('input');
        tempInput.style.position = 'absolute';
        tempInput.style.top = searchPanel.getBoundingClientRect().top + 10 + 'px';
        tempInput.style.left = '50%';
        tempInput.style.opacity = '0';
        tempInput.style.height = '0';
        tempInput.style.fontSize = '16px';
        document.body.appendChild(tempInput);
        tempInput.focus();
        
        setTimeout(() => {
          searchInput.focus();
          if (searchInput.setSelectionRange) {
            const len = searchInput.value.length;
            searchInput.setSelectionRange(len, len);
          }
          tempInput.remove();
        }, 350);
      } else {
        searchInput.focus();
      }
    }
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateY(100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-magnifying-glass');
      iconElement.classList.add('fa-xmark');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateY(-100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateY(0)';
      }, 20);
    }, 200);
  }
  
  function closeSearchPanel() {
    if (!isOpen) return;
    
    searchPanel.classList.remove('__active');
    
    window.unlockScroll();
    isOpen = false;
    
    iconElement.style.transition = 'transform 0.2s ease';
    iconElement.style.transform = 'translateY(-100%)';
    
    setTimeout(() => {
      iconElement.classList.remove('fa-xmark');
      iconElement.classList.add('fa-magnifying-glass');
      iconElement.style.transition = 'none';
      iconElement.style.transform = 'translateY(100%)';
      
      setTimeout(() => {
        iconElement.style.transition = 'transform 0.2s ease';
        iconElement.style.transform = 'translateY(0)';
      }, 20);
    }, 200);
  }
  
  function toggleSearchPanel() {
    if (isOpen) {
      closeSearchPanel();
    } else {
      openSearchPanel();
    }
  }
  
  window.closeMobileSearchPanel = closeSearchPanel;
  
  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSearchPanel();
  });
  
  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    
    if (!searchPanel.contains(e.target) && 
        !searchButton.contains(e.target)) {
      closeSearchPanel();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      e.stopImmediatePropagation();
      closeSearchPanel();
    }
  });
  
  ResizeDispatcher.onResizeDebounced((resizeStartedAt) => {
    // На iOS lockScroll (position:fixed + top) может вызывать resize из-за смены viewport.
    // Игнорируем resize, начавшийся раньше чем через 1s после открытия — это артефакт (включая появление клавиатуры), не реальная смена ориентации.
    if (resizeStartedAt - panelOpenedAt < 1000) return;
    if (isOpen) {
      closeSearchPanel();
    }
  });
});
  

  

/* Мобильная панель поиска - управление подсказками, кнопками __clear/__submit
и результатами перенесено в search.js */
  


  
/* Sticky header:
- при прокрутке вниз header прилипает к верху экрана;
- скрывается header--top-menu, header--quick задвигается под header--main;
- работает только при ширине >= 1121px;
- создаётся placeholder для предотвращения прыжка контента. */

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header) return;
  
  let placeholder = null;
  let headerHeight = 0;
  let quickHeight = 0;
  let triggerPoint = 0;
  let isSticky = false;
  let ticking = false;
  let isFirstLoad = true;
  
  function createPlaceholder() {
    if (placeholder) return;
    
    placeholder = document.createElement('div');
    placeholder.className = 'header-placeholder';
    header.parentNode.insertBefore(placeholder, header.nextSibling);
  }
  
  function calculateDimensions() {
    const topMenuNav = document.querySelector('nav:has(> .container > .header--top-menu)');
    const mainContainer = document.querySelector('header > .container:has(> .header--main), header > #header-main');
    const quickNav = document.querySelector('nav:has(> .container > .header--quick)');
    
    let topMenuHeight = 0;
    let mainHeight = 0;
    
    if (topMenuNav) {
      topMenuHeight = topMenuNav.offsetHeight;
      header.style.setProperty('--header-top-menu-height-negative', `-${topMenuHeight}px`);
    }
    
    if (mainContainer) {
      mainHeight = mainContainer.offsetHeight;
    }
    
    if (quickNav) {
      quickHeight = quickNav.offsetHeight;
      header.style.setProperty('--header-quick-height-negative', `-${quickHeight}px`);
    }
    
    if (window.innerWidth < 1121) {
      headerHeight = mainHeight;
      triggerPoint = 10;
      quickHeight = 0;
    } else {
      headerHeight = topMenuHeight + mainHeight + quickHeight;
      triggerPoint = topMenuHeight;
    }
    
    if (header.classList.contains('__sticky') && placeholder) {
      if (header.classList.contains('__quick-hidden')) {
        placeholder.style.height = (headerHeight - quickHeight) + 'px';
      } else {
        placeholder.style.height = headerHeight + 'px';
      }
    }
  }
  
  const QUICK_HIDE_OFFSET = 100;
  
  function updateStickyState() {
    const scrollY = window.scrollY;
    
    if (scrollY > triggerPoint && !isSticky) {
      isSticky = true;
      
      if (placeholder && window.innerWidth >= 1121) {
        placeholder.style.height = headerHeight + 'px';
        placeholder.classList.add('__active');
      }
      
      header.classList.add('__sticky');
      
      if (typeof updateMenuOffset === 'function') {
        requestAnimationFrame(updateMenuOffset);
      }
      if (typeof updateSearchOffset === 'function') {
        requestAnimationFrame(updateSearchOffset);
      }
      
    } else if (scrollY <= triggerPoint && isSticky) {
      isSticky = false;
      header.classList.remove('__sticky', '__quick-hidden');
      
      if (placeholder) {
        placeholder.classList.remove('__active');
      }
      
      if (typeof updateMenuOffset === 'function') {
        requestAnimationFrame(updateMenuOffset);
      }
      if (typeof updateSearchOffset === 'function') {
        requestAnimationFrame(updateSearchOffset);
      }
    }
    
    if (isSticky) {
      const quickHideTrigger = triggerPoint + QUICK_HIDE_OFFSET;
      const quickShowTrigger = quickHideTrigger - 30;
      
      if (scrollY > quickHideTrigger && !header.classList.contains('__quick-hidden')) {
        const quickNav = document.querySelector('nav:has(> .container > .header--quick)');
        
        if (isFirstLoad && quickNav) {
          quickNav.style.transition = 'none';
          header.classList.add('__quick-hidden');
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              quickNav.style.transition = '';
              isFirstLoad = false;
            });
          });
        } else {
          header.classList.add('__quick-hidden');
        }
        
        if (placeholder) {
          placeholder.style.height = (headerHeight - quickHeight) + 'px';
        }
      } else if (scrollY <= quickShowTrigger && header.classList.contains('__quick-hidden')) {
        header.classList.remove('__quick-hidden');
        if (placeholder) {
          placeholder.style.height = headerHeight + 'px';
        }
        isFirstLoad = false;
      }
    }
    
    ticking = false;
  }
  
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateStickyState);
      ticking = true;
    }
  }
  
  function init() {
    createPlaceholder();
    calculateDimensions();
  }
  
  init();
  updateStickyState();
  
  window.addEventListener('scroll', onScroll, { passive: true });
  
  ResizeDispatcher.onResizeDebounced(() => {
    if (!placeholder) {
      createPlaceholder();
    }
    calculateDimensions();
    if (window.innerWidth < 1121) {
      if (placeholder) {
        placeholder.classList.remove('__active');
      }
    } else {
      updateStickyState();
    }
    updateAllHeaderHeight();
  });
  
  window.addEventListener('load', () => {
    setTimeout(() => {
      calculateDimensions();
      updateStickyState();
    }, 100);
  });
});
  
  
/* Скрытие header на мобильных при прокрутке вниз на 500px,
    показ при прокрутке вверх.
    window.showMobileHeader — принудительный показ извне (cart.js — добавление товара в корзину) */

document.addEventListener('DOMContentLoaded', function() {
  const header = document.querySelector('header');
  if (!header) return;
  
  const HIDE_THRESHOLD = 300;
  const SHOW_THRESHOLD = 30;
  const MOBILE_BREAKPOINT = 1120;
  
  let hasTouchOccurred = false;
  document.addEventListener('touchstart', () => { hasTouchOccurred = true; }, { once: true, passive: true });
  
  let lastScrollY = window.scrollY;
  let scrollDownAccumulator = 0;
  let scrollUpAccumulator = 0;
  let isHeaderHidden = false;
  let ticking = false;
  
  function updateMobileHeaderState() {
    const hideHeaderVar = getComputedStyle(document.documentElement).getPropertyValue('--hide-header').trim();
    if (hideHeaderVar === 'false') {
      if (isHeaderHidden) {
        header.classList.remove('__mobile-hidden');
        isHeaderHidden = false;
      }
      scrollDownAccumulator = 0;
      scrollUpAccumulator = 0;
      lastScrollY = window.scrollY;
      ticking = false;
      return;
    }
    
    if (window.innerWidth > MOBILE_BREAKPOINT || !hasTouchOccurred) {
      if (isHeaderHidden) {
        header.classList.remove('__mobile-hidden');
        isHeaderHidden = false;
      }
      ticking = false;
      return;
    }
    
    if (window.ignoreScrollTracking) {
      lastScrollY = window.scrollY;
      scrollDownAccumulator = 0;
      scrollUpAccumulator = 0;
      ticking = false;
      return;
    }

    // При открытой мобильной панели (любой mobile-panel через lockScroll)
    // header должен быть всегда видим — не накапливаем scroll и снимаем __mobile-hidden
    if (document.body.classList.contains('__mobile-menu-open')) {
      if (isHeaderHidden) {
        header.classList.remove('__mobile-hidden');
        isHeaderHidden = false;
      }
      scrollDownAccumulator = 0;
      scrollUpAccumulator = 0;
      lastScrollY = window.scrollY;
      ticking = false;
      return;
    }

    // При активном pinch-zoom форсируем скрытие и не накапливаем scroll-up
    if (isPinchZoomed()) {
      if (!isHeaderHidden) {
        header.classList.add('__mobile-hidden');
        isHeaderHidden = true;
      }
      scrollDownAccumulator = 0;
      scrollUpAccumulator = 0;
      lastScrollY = window.scrollY;
      ticking = false;
      return;
    }
    
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;
    
    if (currentScrollY <= 0) {
      if (isHeaderHidden) {
        header.classList.remove('__mobile-hidden');
        isHeaderHidden = false;
      }
      scrollDownAccumulator = 0;
      scrollUpAccumulator = 0;
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }
    
    if (scrollDelta > 0) {
      scrollDownAccumulator += scrollDelta;
      scrollUpAccumulator = 0;
      
      if (scrollDownAccumulator >= HIDE_THRESHOLD && !isHeaderHidden) {
        header.classList.add('__mobile-hidden');
        isHeaderHidden = true;
      }
    } else if (scrollDelta < 0) {
      scrollUpAccumulator += Math.abs(scrollDelta);
      scrollDownAccumulator = 0;
      
      if (scrollUpAccumulator >= SHOW_THRESHOLD && isHeaderHidden) {
        header.classList.remove('__mobile-hidden');
        isHeaderHidden = false;
      }
    }
    
    lastScrollY = currentScrollY;
    ticking = false;
  }
  
  function onMobileScroll() {
    if (!ticking) {
      requestAnimationFrame(updateMobileHeaderState);
      ticking = true;
    }
  }
  
  window.addEventListener('scroll', onMobileScroll, { passive: true });

  // Принудительный показ извне (cart.js — добавление товара в корзину)
  // Флаг синхронизируется, чтобы скролл-обработчик снова скрыл header при прокрутке вниз
  window.showMobileHeader = function() {
    header.classList.remove('__mobile-hidden');
    isHeaderHidden = false;
    scrollDownAccumulator = 0;
    scrollUpAccumulator = 0;
    lastScrollY = window.scrollY;
  };

  // Мгновенный пересчёт при входе/выходе из pinch-zoom
  window.addEventListener('pinchZoomChange', updateMobileHeaderState);
  
  ResizeDispatcher.onResizeDebounced(() => {
    if (window.innerWidth > MOBILE_BREAKPOINT) {
      if (isHeaderHidden) {
        header.classList.remove('__mobile-hidden');
        isHeaderHidden = false;
      }
    }
    scrollDownAccumulator = 0;
    scrollUpAccumulator = 0;
    lastScrollY = window.scrollY;
  });
});



/* Класс __mouse на header при наведении мыши */

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header) return;

  let isTouching = false;

  document.addEventListener('touchstart', () => {
    isTouching = true;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    setTimeout(() => { isTouching = false; }, 500);
  }, { passive: true });

  let mouseTimer = null;
  let leaveTimer = null;

  function isInsideHeaderZone(el) {
    if (!el) return false;
    return header.contains(el) || el.closest('.mobile-right-panel.__wide');
  }

  function handleMouseMove() {
    if (isTouching) return;
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (mouseTimer) return;
    mouseTimer = setTimeout(() => {
      header.classList.add('__mouse');
      mouseTimer = null;
    }, 150);
  }

  function handleMouseLeave(e) {
    if (isInsideHeaderZone(e.relatedTarget)) return;
    if (mouseTimer) {
      clearTimeout(mouseTimer);
      mouseTimer = null;
    }
    leaveTimer = setTimeout(() => {
      header.classList.remove('__mouse');
      leaveTimer = null;
    }, 150);
  }

  header.addEventListener('mousemove', handleMouseMove);
  header.addEventListener('mouseleave', handleMouseLeave);

  document.addEventListener('mousemove', (e) => {
    const cart = e.target.closest('.mobile-right-panel.__wide');
    if (cart) handleMouseMove();
  });

  document.addEventListener('mouseleave', (e) => {
    if (!e.target || !e.target.closest) return;
    const cart = e.target.closest('.mobile-right-panel.__wide');
    if (cart && !isInsideHeaderZone(e.relatedTarget)) {
      handleMouseLeave(e);
    }
  }, true);
});


/**
 * Скрытие header по CSS-переменной --hide-header
 * Если --hide-header = true, при прокрутке вниз больше 500px добавляет __hided
 */

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header) return;

  const HIDE_SCROLL_THRESHOLD = 700;
  let isHided = false;
  let ticking = false;

  function checkHideHeader() {
    const hideValue = getComputedStyle(header).getPropertyValue('--hide-header').trim();
    if (hideValue !== 'true') {
      if (isHided) {
        header.classList.remove('__hided');
        isHided = false;
      }
      ticking = false;
      return;
    }

    const scrollY = window.scrollY;

    if (scrollY > HIDE_SCROLL_THRESHOLD && !isHided) {
      header.classList.add('__hided');
      isHided = true;
    } else if (scrollY <= HIDE_SCROLL_THRESHOLD && isHided) {
      header.classList.remove('__hided');
      isHided = false;
    }

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(checkHideHeader);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  checkHideHeader();
});


/**
 * Класс __sticky-block-hide на header
 * По аналогии со sticky-фильтрами каталога:
 * при прокрутке вверх (20px) — ставится, при прокрутке вниз (150px) — снимается.
 * Работает когда --hide-header = true, независимо от наличия catalog--filters.
 */

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header) return;

  const SHOW_THRESHOLD = 20;
  const HIDE_THRESHOLD = 150;

  let lastScrollY = window.scrollY;
  let scrollUpAccumulator = 0;
  let scrollDownAccumulator = 0;
  let isStickyBlockHide = false;
  let ticking = false;

  function isHideHeaderEnabled() {
    return getComputedStyle(header).getPropertyValue('--hide-header').trim() === 'true';
  }

  function updateStickyBlockHide() {
    if (window.ignoreScrollTracking) {
      lastScrollY = window.scrollY;
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      ticking = false;
      return;
    }

    if (!isHideHeaderEnabled()) {
      if (isStickyBlockHide) {
        header.classList.remove('__sticky-block-hide');
        isStickyBlockHide = false;
        window.dispatchEvent(new CustomEvent('stickyBlockHideRemoved'));
      }
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      lastScrollY = window.scrollY;
      ticking = false;
      return;
    }

    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;

    if (currentScrollY < 100) {
      if (isStickyBlockHide) {
        header.classList.remove('__sticky-block-hide');
        isStickyBlockHide = false;
        window.dispatchEvent(new CustomEvent('stickyBlockHideRemoved'));
      }
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }

    if (scrollDelta > 0) {
      scrollUpAccumulator = 0;

      if (isStickyBlockHide) {
        scrollDownAccumulator += scrollDelta;

        if (scrollDownAccumulator >= HIDE_THRESHOLD) {
          header.classList.remove('__sticky-block-hide');
          isStickyBlockHide = false;
          scrollDownAccumulator = 0;
          window.dispatchEvent(new CustomEvent('stickyBlockHideRemoved'));
        }
      }
    } else if (scrollDelta < 0) {
      scrollDownAccumulator = 0;

      if (!isStickyBlockHide) {
        scrollUpAccumulator += Math.abs(scrollDelta);

        if (scrollUpAccumulator >= SHOW_THRESHOLD) {
          header.classList.add('__sticky-block-hide');
          isStickyBlockHide = true;
          scrollUpAccumulator = 0;
        }
      }
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateStickyBlockHide);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // Принудительная установка извне (cart.js — добавление товара в корзину)
  // Флаг синхронизируется, чтобы скролл-обработчик корректно снял класс при прокрутке вниз
  window.setStickyBlockHide = function() {
    if (isStickyBlockHide) return;

    header.classList.add('__sticky-block-hide');
    isStickyBlockHide = true;
    scrollUpAccumulator = 0;
    scrollDownAccumulator = 0;
  };
});


/**
 * Кнопка «Наверх» (back-to-top glass-button)
 * Только на мобильных (ширина <= 1120px).
 * По аналогии с __sticky-block-hide: показывается (__active), когда страница прокручена
 * больше чем на 700px и накоплено 500px прокрутки вверх; при прокрутке вниз (150px)
 * или выше 700px — скрывается.
 * Обратное движение меньше 50px (REVERSE_TOLERANCE) не сбрасывает накопленную прокрутку —
 * защита от ложных рывков на iOS (инерция, сворачивание/разворачивание панелей Safari).
 * Resize скрывает кнопку только при выходе за мобильную ширину: на iOS resize приходит
 * при разворачивании панелей Safari во время прокрутки вверх.
 * Позиционируется внизу экрана, над плавающей кнопкой покупки (__floating), если она есть (см. CSS).
 * Клик мгновенно переносит в начало страницы.
 */

document.addEventListener('DOMContentLoaded', () => {
  const MOBILE_BREAKPOINT = 1120;
  const MIN_SCROLL_Y = 700;
  const SHOW_THRESHOLD = 500;
  const HIDE_THRESHOLD = 150;
  const REVERSE_TOLERANCE = 50;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top glass-button';
  button.setAttribute('aria-label', 'Наверх');
  button.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
  document.body.appendChild(button);

  let lastScrollY = window.scrollY;
  let scrollUpAccumulator = 0;
  let scrollDownAccumulator = 0;
  let isActive = false;
  let ticking = false;

  function setActive(state) {
    if (isActive === state) return;
    isActive = state;
    button.classList.toggle('__active', state);
  }

  function reset() {
    setActive(false);
    scrollUpAccumulator = 0;
    scrollDownAccumulator = 0;
    lastScrollY = window.scrollY;
    ticking = false;
  }

  function updateBackToTop() {
    if (window.ignoreScrollTracking) {
      lastScrollY = window.scrollY;
      scrollUpAccumulator = 0;
      scrollDownAccumulator = 0;
      ticking = false;
      return;
    }

    const currentScrollY = window.scrollY;

    if (window.innerWidth > MOBILE_BREAKPOINT
      || currentScrollY <= MIN_SCROLL_Y
      || document.body.classList.contains('__mobile-menu-open')
      || isPinchZoomed()) {
      reset();
      return;
    }

    const scrollDelta = currentScrollY - lastScrollY;

    if (scrollDelta > 0) {
      scrollDownAccumulator += scrollDelta;
      if (scrollDownAccumulator >= REVERSE_TOLERANCE) scrollUpAccumulator = 0;

      if (isActive && scrollDownAccumulator >= HIDE_THRESHOLD) {
        setActive(false);
        scrollDownAccumulator = 0;
      }
    } else if (scrollDelta < 0) {
      scrollUpAccumulator -= scrollDelta;
      if (scrollUpAccumulator >= REVERSE_TOLERANCE) scrollDownAccumulator = 0;

      if (!isActive && scrollUpAccumulator >= SHOW_THRESHOLD) {
        setActive(true);
        scrollUpAccumulator = 0;
      }
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(updateBackToTop);
      ticking = true;
    }
  }

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    reset();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pinchZoomChange', updateBackToTop);
  ResizeDispatcher.onResizeDebounced(() => {
    if (window.innerWidth > MOBILE_BREAKPOINT) reset();
  });
});


/**
 * Клик по li внутри header--top-menu--dropdown
 * Если li содержит непосредственный <a> со ссылкой — переходим по ней
 * Работает только на десктопе (>1120), на мобильных используется панельная логика
 */

document.addEventListener('click', (e) => {
  if (window.innerWidth <= 1120) return;
  if (!e.target || !e.target.closest) return;

  const dropdown = e.target.closest('.header--top-menu--dropdown');
  if (!dropdown) return;

  if (e.target.closest('a')) return;

  const li = e.target.closest('li');
  if (!li || !dropdown.contains(li)) return;

  const link = li.querySelector(':scope > a');
  if (!link) return;

  const href = link.getAttribute('href');
  if (!href || href === '#') return;

  e.preventDefault();

  window.location.href = href;
});


/**
 * Pinch Zoom Detection
 * Отслеживает состояние pinch-zoom через visualViewport.scale
 * и переключает класс body.__pinch-zoomed.
 *
 * Чтобы заблокировать новый элемент — добавь CSS-правило вида:
 *   body.__pinch-zoomed .your-scrollable { pointer-events: none; overflow: hidden; }
 */
(function initPinchZoomDetection() {
  if (!window.visualViewport) return;

  // Grace-период перед снятием класса: даём scale-у «постоять» в районе 1
  // в течение REMOVE_GRACE_MS — если за это время пользователь снова зумнёт,
  // update() отменит таймер через cancelRemoveTimer().
  const REMOVE_GRACE_MS = 300;

  let touchCount = 0;
  let removeTimer = 0;

  function addClass() {
    if (document.body) document.body.classList.add('__pinch-zoomed');
    window.dispatchEvent(new CustomEvent('pinchZoomChange', { detail: { isZoomed: true } }));
  }

  function removeClass() {
    if (document.body) document.body.classList.remove('__pinch-zoomed');
    // При выходе из pinch-zoom снимаем скрытие header, если он был скрыт
    const header = document.querySelector('header');
    if (header) header.classList.remove('__hided');
    window.dispatchEvent(new CustomEvent('pinchZoomChange', { detail: { isZoomed: false } }));
  }

  function cancelRemoveTimer() {
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = 0;
    }
  }

  function update() {
    // Если открыто мобильное меню/панель (body.__mobile-menu-open) —
    // pinch-zoom детекцию не ведём, чтобы не блокировать работу внутри.
    // Исключение — панели с разрешённым pinch (body.__pinch-allowed):
    // там зум возможен и заглушка кликов должна работать.
    if (document.body && document.body.classList.contains('__mobile-menu-open') && !document.body.classList.contains('__pinch-allowed')) {
      cancelRemoveTimer();
      if (isPinchZoomed()) removeClass();
      return;
    }

    const isZoomed = window.visualViewport.scale !== 1;
    const shouldBeZoomed = isZoomed || touchCount >= 2;

    // Ветка A: класс должен быть активен. Отменяем запланированное снятие.
    if (shouldBeZoomed) {
      cancelRemoveTimer();
      if (!isPinchZoomed()) addClass();
      return;
    }

    // Ветка B: потенциальный выход из zoom.
    // Запуск таймера: класс стоит + scale < 1.2.
    // Снятие через grace_ms — без повторных проверок.
    if (
      isPinchZoomed() &&
      !removeTimer &&
      window.visualViewport.scale < 1.2
    ) {
      removeTimer = setTimeout(() => {
        removeTimer = 0;
        removeClass();
      }, REMOVE_GRACE_MS);
    }
  }

  function trackTouchAndUpdate(e) {
    // touchmove обрабатываем только когда класс уже стоит — нам нужно ловить
    // момент, когда пальцев стало меньше, если touchend/cancel потерялся.
    // Пока зума нет, touchmove нам не интересен — постановку делает touchstart.
    if (e.type === 'touchmove' && !isPinchZoomed()) return;
    const next = e.touches.length;
    if (next === touchCount) return;
    touchCount = next;
    update();
  }

  window.visualViewport.addEventListener('resize', update);
  document.addEventListener('touchstart', trackTouchAndUpdate, { passive: true });
  document.addEventListener('touchmove', trackTouchAndUpdate, { passive: true });
  document.addEventListener('touchend', trackTouchAndUpdate, { passive: true });
  document.addEventListener('touchcancel', trackTouchAndUpdate, { passive: true });

  if (document.body) {
    update();
  } else {
    document.addEventListener('DOMContentLoaded', update);
  }
})();

/**
 * Pinch Zoom Click Blocker
 * При активном body.__pinch-zoomed все клики гасятся (capture-фаза) и показывается
 * фуллскрин-уведомление «Сведите пальцы, чтобы сбросить масштаб».
 *
 * Цель — предотвратить открытие любых панелей/dropdown'ов/ссылок во время zoom-сессии,
 * чтобы избежать iOS-крашей при взаимодействии со scrollable-элементами при scale != 1.
 * Уведомление автоматически скрывается через HIDE_DELAY_MS или мгновенно при выходе из pinch.
 */
(function initPinchZoomClickBlocker() {
  const HIDE_DELAY_MS = 2000;
  const BASE_FONT_SIZE = 18;
  // Выход оверлея за видимую область вверх/вниз —
  // против артефактов с iOS-шторками (top bar / home indicator).
  const VERTICAL_BLEED = 100;
  // Небольшой выход по горизонтали на случай субпиксельных зазоров на краях.
  const HORIZONTAL_BLEED = 10;
  let notice = null;
  let messageEl = null;
  let progressFillEl = null;
  let hideTimer = null;
  let listenersAttached = false;

  function ensureNotice() {
    if (notice) return notice;
    notice = document.createElement('div');
    notice.className = 'pinch-zoom-notice';
    notice.style.setProperty('--pinch-zoom-notice-duration', (HIDE_DELAY_MS / 1000) + 's');

    messageEl = document.createElement('div');
    messageEl.className = 'pinch-zoom-notice--message';
    messageEl.textContent = 'Сбросьте масштаб страницы, чтобы выполнить действие';
    notice.appendChild(messageEl);

    const progressEl = document.createElement('div');
    progressEl.className = 'pinch-zoom-notice--progress';
    progressFillEl = document.createElement('div');
    progressFillEl.className = 'pinch-zoom-notice--progress--fill';
    progressEl.appendChild(progressFillEl);
    notice.appendChild(progressEl);

    document.body.appendChild(notice);
    return notice;
  }

  // Подгоняет оверлей под visual viewport (а не под layout viewport):
  // — при pinch-zoom visualViewport показывает зазумленный фрагмент,
  //   и оверлей должен лежать точно поверх него, а не быть «вместе зазумленным»;
  // — шрифт компенсируется делением на scale, чтобы оставаться читаемого экранного размера.
  function updateNoticePosition() {
    if (!notice) return;
    const vv = window.visualViewport;
    if (!vv) return;
    notice.style.top = (vv.offsetTop - VERTICAL_BLEED) + 'px';
    notice.style.left = (vv.offsetLeft - HORIZONTAL_BLEED) + 'px';
    notice.style.width = (vv.width + HORIZONTAL_BLEED * 2) + 'px';
    notice.style.height = (vv.height + VERTICAL_BLEED * 2) + 'px';
    if (messageEl) {
      messageEl.style.fontSize = (BASE_FONT_SIZE / vv.scale) + 'px';
    }
  }

  function attachViewportListeners() {
    if (listenersAttached || !window.visualViewport) return;
    window.visualViewport.addEventListener('resize', updateNoticePosition);
    window.visualViewport.addEventListener('scroll', updateNoticePosition);
    listenersAttached = true;
  }

  function detachViewportListeners() {
    if (!listenersAttached || !window.visualViewport) return;
    window.visualViewport.removeEventListener('resize', updateNoticePosition);
    window.visualViewport.removeEventListener('scroll', updateNoticePosition);
    listenersAttached = false;
  }

  function showNotice() {
    const n = ensureNotice();

    // Если оверлей уже активен — не сбрасываем ни таймер, ни анимацию полоски.
    // Повторные клики во время показа просто игнорируются.
    if (n.classList.contains('__active')) return;

    updateNoticePosition();
    attachViewportListeners();

    // Двойной requestAnimationFrame: гарантируем что начальное состояние (opacity: 0)
    // зарегистрировано браузером ДО переключения в opacity: 1 — иначе при первом показе
    // transition «склеится» и fade-in не будет виден.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        n.classList.add('__active');

        // Перезапуск CSS-анимации progress-бара (на случай повторного показа после hideNotice):
        // animation: none → форсируем reflow → снимаем inline → возвращается CSS-rule и анимация идёт с нуля.
        if (progressFillEl) {
          progressFillEl.style.animation = 'none';
          // eslint-disable-next-line no-unused-expressions
          progressFillEl.offsetWidth;
          progressFillEl.style.animation = '';
        }
      });
    });

    hideTimer = setTimeout(hideNotice, HIDE_DELAY_MS);
  }

  function hideNotice() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    detachViewportListeners();
    if (notice) notice.classList.remove('__active');
  }

  // Capture-обработчик: ловит клик до того как он дойдёт до целевых обработчиков
  document.addEventListener('click', (e) => {
    if (!isPinchZoomed()) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    showNotice();
  }, true);

  // Мгновенно скрываем уведомление при выходе из pinch-zoom
  window.addEventListener('pinchZoomChange', (e) => {
    const isZoomed = e.detail && e.detail.isZoomed;
    if (!isZoomed) hideNotice();
  });
})();

/**
 * Возвращает <a href> для клика, если пользователь кликнул по ссылке ИЛИ
 * по картинке карточки товара (.item--image), где <a> лежит не над картинкой,
 * а рядом внутри .item. Это позволяет capture-обработчикам инжектить параметры
 * в href до того, как item.js в bubble-фазе программно перейдёт по link.href.
 */
function findClickedCatalogLink(target) {
  const direct = target.closest('a[href]');
  if (direct) return direct;
  const itemImage = target.closest('.item--image');
  if (!itemImage) return null;
  const item = itemImage.closest('.item');
  if (!item) return null;
  return item.querySelector('a[href]');
}

/**
 * Item Catalog Path Injector
 * Если у карточки товара (.item) есть data-catalog-path="true", то при клике
 * категорийная часть ссылки заменяется на текущий путь из адресной строки.
 *
 * /tovary-dlya-doma/posuda/vazy/vaza-romana → /<текущий путь>/vaza-romana
 * (сохраняется только последний сегмент ссылки — slug товара).
 *
 * Нужно чтобы товар открывался в контексте той категории/подборки, из которой
 * по нему кликнули, а не в своей «родной» категории.
 *
 * Работает только когда текущий путь содержит /catalog/ — иначе подменять нечем.
 *
 * На странице товара (main.product) не работает: путь адресной строки там сам
 * заканчивается slug'ом товара, и подстановка дала бы вложенный путь
 * /catalog/.../vaza-romana/other-product.
 *
 * Слушаем в capture-фазе и объявляем до SORT-инжектора и Filter-пропагатора,
 * чтобы они дальше работали с уже переписанным путём.
 */
(function initItemCatalogPathInjector() {
  document.addEventListener('click', (e) => {
    // Во время pinch-zoom клики гасятся блокировщиком выше — не вмешиваемся
    if (isPinchZoomed()) return;

    if (document.querySelector('main.product')) return;

    const currentPath = window.location.pathname;
    if (currentPath.indexOf('/catalog/') === -1) return;

    const item = e.target.closest('.item');
    if (!item) return;
    if (item.getAttribute('data-catalog-path') !== 'true') return;

    const link = findClickedCatalogLink(e.target);
    if (!link || !item.contains(link)) return;

    const href = link.getAttribute('href');
    if (!href) return;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (_) {
      return;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return; // нечего заменять — путь без категории

    const slug = segments[segments.length - 1];
    const basePath = '/' + currentPath.split('/').filter(Boolean).join('/');
    url.pathname = basePath + '/' + slug;

    // Сохраняем относительность ссылки, если она была относительной
    const isAbsolute = /^([a-z]+:)?\/\//i.test(href);
    link.setAttribute('href', isAbsolute ? url.toString() : url.pathname + url.search + url.hash);
  }, true);
})();

/**
 * Catalog SORT Injector
 * Перед переходом по ссылке каталога подмешивает GET-параметр SORT,
 * значение берётся из sessionStorage (ключ order-by), который пишется
 * в catalog.js при выборе пользователем варианта сортировки.
 *
 * Срабатывает только для ссылок на /catalog/ — в адресе товара (/p/) SORT не нужен,
 * при возврате из товара в каталог значение берётся из sessionStorage.
 *
 * Слушаем в capture-фазе, чтобы успеть переписать href до того,
 * как клик дойдёт до целевых обработчиков и браузер начнёт навигацию.
 */
(function initCatalogSortInjector() {
  document.addEventListener('click', (e) => {
    // Во время pinch-zoom клики гасятся блокировщиком выше — не вмешиваемся
    if (isPinchZoomed()) return;

    const link = findClickedCatalogLink(e.target);
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (_) {
      return;
    }

    if (url.pathname.indexOf('/catalog/') === -1) return;

    const sort = sessionStorage.getItem('order-by');
    if (!sort) return;

    url.searchParams.set('SORT', sort);

    // Сохраняем относительность ссылки, если она была относительной
    const isAbsolute = /^([a-z]+:)?\/\//i.test(href);
    link.setAttribute('href', isAbsolute ? url.toString() : url.pathname + url.search + url.hash);
  }, true);
})();

/**
 * Catalog Filter Params Propagator
 * При переходе по ссылкам каталога и карточек товаров переносит GET-параметры
 * фильтров с текущей страницы в URL целевой ссылки.
 *
 * Работает только когда И текущая страница И целевая ссылка — это /catalog/ или /p/.
 * Это сделано чтобы фильтры не терялись при навигации между категориями, пагинации
 * и при переходе на карточку товара и обратно.
 *
 * Собственные GET-параметры целевой ссылки имеют приоритет — мы их не перезаписываем.
 *
 * SORT не трогаем — он обрабатывается отдельным инжектором, который читает значение
 * из localStorage (на случай если в текущем URL SORT отсутствует, но был выбран ранее).
 *
 * utm_* не переносим: маркетинговые метки специфичны для конкретного перехода
 * и при навигации на другую ссылку должны сбрасываться.
 *
 * FROM подставляется отдельно и только когда целевая ссылка — карточка товара (/p/).
 * Значение — последний сегмент текущего пути (например /catalog/a/b/from_there → FROM=from_there).
 * Из query текущего URL FROM не переносим — он всегда пересчитывается из пути.
 *
 * Слушаем в capture-фазе по той же причине что и SORT-инжектор: нужно успеть
 * переписать href до того, как клик дойдёт до целевых обработчиков.
 */
(function initCatalogFilterParamsPropagator() {
  document.addEventListener('click', (e) => {
    // Во время pinch-zoom клики гасятся блокировщиком выше — не вмешиваемся
    if (isPinchZoomed()) return;

    // Распространяем параметры только если пользователь УЖЕ внутри каталога или карточки товара
    const currentPath = window.location.pathname;
    if (currentPath.indexOf('/catalog/') === -1 && currentPath.indexOf('/p/') === -1) return;

    const link = findClickedCatalogLink(e.target);
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (_) {
      return;
    }

    // И только в /catalog/ или /p/ ссылки
    if (url.pathname.indexOf('/catalog/') === -1 && url.pathname.indexOf('/p/') === -1) return;

    // Находясь на странице товара (main.product), не переносим параметры в ссылки,
    // которые не ведут в каталог (например переход на связанный товар /p/ без /catalog/).
    // Иначе FROM и фильтры «прилипают» при переходах между товарами.
    if (document.querySelector('main.product') && url.pathname.indexOf('/catalog/') === -1) return;

    let changed = false;

    // FROM = последний сегмент текущего пути (откуда пришёл пользователь).
    // Ставим только при переходе на карточку товара (/p/) — это единственное место,
    // где нужно знать источник перехода. Для /catalog/ FROM не имеет смысла.
    if (url.pathname.indexOf('/p/') !== -1) {
      const currentSegments = currentPath.split('/').filter(Boolean);
      const fromSegment = currentSegments.length > 0 ? currentSegments[currentSegments.length - 1] : null;
      if (fromSegment && !url.searchParams.has('FROM')) {
        url.searchParams.set('FROM', fromSegment);
        changed = true;
      }
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.forEach((value, key) => {
      if (key === 'SORT') return; // SORT обрабатывается отдельным инжектором
      if (key === 'FROM') return; // FROM пересчитывается из текущего пути выше
      if (key === 'SKU') return; // SKU из адресной строки в другие ссылки не переносим
      if (key === 'PAGE') return; // PAGE — состояние подгрузки текущей страницы, в другие ссылки не переносим
      if (key.startsWith('utm_')) return; // utm_* не переносим — маркетинговые метки конкретного перехода
      if (url.searchParams.has(key)) return; // собственные параметры ссылки приоритетны
      url.searchParams.set(key, value);
      changed = true;
    });

    if (!changed) return;

    // Сохраняем относительность ссылки, если она была относительной
    const isAbsolute = /^([a-z]+:)?\/\//i.test(href);
    link.setAttribute('href', isAbsolute ? url.toString() : url.pathname + url.search + url.hash);
  }, true);
})();

/**
 * Pinch Zoom Size Lock
 * При pinch-zoom CSS применяет к горизонтальным скроллерам contain: strict.
 * Его часть `size` игнорирует содержимое при расчёте размера → элемент схлопнется в 0.
 *
 * Чтобы этого не происходило, заранее (на init и при resize) фиксируем натуральную
 * высоту каждого скроллера через inline min-height. Во время pinch при contain: strict
 * содержимое не учитывается, и used height = min-height — высота сохраняется.
 *
 * Используем min-height (а не height): вне pinch контент свободно растёт, если, например,
 * изображения подгрузились и натуральная высота стала больше — без клиппинга.
 */
(function initPinchZoomSizeLock() {
  const SELECTORS = ['.scrollable-line--list', '.reviews--images ul', '.reviews--list', '.catalog--categories', '.catalog--filters--second', '.---large-image--main-image ul', '.---product-tabs', '.account--connections', '.page--connected'];
  const SELECTOR_STR = SELECTORS.join(',');

  function lockHeight(el) {
    // Сбрасываем предыдущую min-height, чтобы получить актуальную натуральную высоту
    el.style.minHeight = '';
    const h = el.offsetHeight;
    if (h <= 0) return;
    // offsetHeight — border-box. При content-box min-height задаёт высоту контента,
    // поэтому вычитаем padding и border, иначе элемент раздуется на их величину.
    const cs = getComputedStyle(el);
    const extra = cs.boxSizing === 'border-box' ? 0 :
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.minHeight = (h - extra) + 'px';
  }

  function lockAll() {
    // Во время pinch-zoom contain: strict уже активен → offsetHeight = 0, измерять бессмысленно
    if (isPinchZoomed()) return;
    document.querySelectorAll(SELECTOR_STR).forEach(lockHeight);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lockAll);
  } else {
    lockAll();
  }
  // load — для перерасчёта после загрузки изображений (часто влияют на высоту)
  window.addEventListener('load', lockAll);

  ResizeDispatcher.onResizeDebounced(lockAll);
})();

/**
 * Short Header Nav
 * Кнопки go-back и close в коротком хедере (.short--header), который используется
 * на страницах авторизации и регистрации.
 *
 * go-back ведёт себя как браузерная кнопка «назад», close всегда уводит на главную.
 * Обработчик делегированный — хедер может дорисовываться после DOMContentLoaded.
 */
(function initShortHeaderNav() {
  const HOME_URL = '/';

  document.addEventListener('click', (e) => {
    if (isPinchZoomed()) return;
    if (!e.target || !e.target.closest) return;

    const goBackButton = e.target.closest('.short--header--go-back');

    if (goBackButton) {
      e.preventDefault();

      // При прямом заходе на страницу возвращаться некуда, поэтому уходим на главную
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.assign(HOME_URL);
      }

      return;
    }

    const closeButton = e.target.closest('.short--header--close');

    if (closeButton) {
      e.preventDefault();

      window.location.assign(HOME_URL);
    }
  });
})();

/**
 * Short Footer Contacts Button
 * Кнопка «Контакты» в коротком футере (.short--footer--contacts), который
 * используется на страницах авторизации и чекаута, ведёт на /contacts.
 *
 * Это <button>, а не <a>, поэтому переход делаем через window.location.
 * Обработчик делегированный — футер может дорисовываться после DOMContentLoaded.
 */
(function initShortFooterContactsButton() {
  const CONTACTS_URL = '/contacts';

  document.addEventListener('click', (e) => {
    if (isPinchZoomed()) return;
    if (!e.target || !e.target.closest) return;

    const button = e.target.closest('.short--footer--contacts');
    if (!button) return;

    e.preventDefault();

    window.location.href = CONTACTS_URL;
  });
})();

/**
 * Grid Top Item Tracker & Scroll Restore
 * Запоминает id карточки сетки (.items-grid / .page-items-grid), которая сейчас
 * у верхней части экрана, в sessionStorage (top_item_id) и восстанавливает по ней
 * позицию при возврате на страницу с подгруженными партиями.
 *
 * sessionStorage, а не localStorage: хранилище своё у каждой вкладки, и параллельно
 * открытые каталоги не затирают позицию друг друга.
 *
 * Трекер (интервал TRACK_INTERVAL):
 * - карточки не перебираем, а спрашиваем браузер, что лежит в точке экрана.
 *   elementsFromPoint отдаёт весь стек элементов в точке, а не только верхний,
 *   так что липкие фильтры, бейджи и оверлеи попадание не перехватывают;
 * - линия замера — PROBE_Y от верха экрана, на ней PROBE_COUNT точек, равномерно
 *   разнесённых по ширине: сетка бывает от 2 до 6 колонок, и надо чтобы хотя бы
 *   одна точка попала в карточку, а не в gap между ними;
 * - берём первую найденную карточку, лежащую непосредственно в сетке: .item
 *   встречается ещё и в горизонтальных списках (recent / related) — они не нужны;
 * - карточки с пустым id (id="") пропускаем: шаблон отдаёт такой id вне
 *   каталожного представления, восстанавливать позицию по ним нельзя;
 * - ни одна точка не попала в карточку — прошлое значение не перезаписываем;
 * - скролл в верхних TOP_ZONE пикселях — запись удаляется: пользователь вернулся наверх страницы,
 *   и после перезагрузки его не должно уносить к последней запомненной карточке;
 * - стоимость тика не зависит от размера сетки: PROBE_COUNT hit-тестов вместо N
 *   измерений, а тик без прокрутки выходит сразу.
 *
 * Вместе с id обновляется PAGE в адресной строке — берётся из data-page найденной
 * карточки (номер партии отдаёт сервер при отрисовке), так что при прокрутке
 * вверх номер страницы уменьшается вместе с позицией. Карточки с пустым data-page
 * пропускаем — применять нечего. Пишем только если PAGE уже есть в адресной
 * строке и только при реальной смене значения: без подгрузки партий параметр
 * в URL не появляется, а replaceState не дёргается на каждом тике (лимиты Safari).
 *
 * Восстановление:
 * - только если в sessionStorage есть сохранённый id и в адресной строке есть PAGE
 *   (его пишет обработчик «Показать ещё» в catalog.js через replaceState) — значит
 *   сетка отрисована с подгруженными партиями;
 * - хранилище пусто → ничего не трогаем, работает системный скролл;
 * - системное восстановление скролла в этом случае отключаем (scrollRestoration = manual)
 *   и скроллим к элементу с сохранённым id;
 * - элемента с таким id нет → не скроллим вообще (остаёмся наверху) — id уникален
 *   для каждого пути, так что чужой сохранённый id просто не найдётся;
 * - PAGE в адресной строке нет → ничего не трогаем, работает системный скролл;
 * - скролл повторяется несколько раз: lazy-картинки и расстановка wide-карточек
 *   меняют высоту сетки уже после DOMContentLoaded;
 * - жест пользователя (wheel / touch / клавиши) прекращает попытки.
 */
(function initGridTopItemTracker() {
  const GRIDS_SELECTOR = '.items-grid, .page-items-grid';
  const ITEM_SELECTOR = '.item, .page-item';
  const STORAGE_KEY = 'top_item_id';
  const PAGE_PARAM = 'PAGE';
  const TRACK_INTERVAL = 400;
  const RESTORE_DELAYS = [0, 150, 400, 800, 1500];
  const ITEM_TOP_GAP = 10;
  const PROBE_Y = 400;
  const PROBE_COUNT = 5;
  const TOP_ZONE = 300;
  const BFCACHE_TRACK_PAUSE = 800;

  // Пока идёт восстановление, писать в sessionStorage нельзя: наверху страницы
  // окажется первая карточка и затрёт сохранённую позицию
  let trackingBlocked = false;
  let restoreTimers = [];
  let lastScrollY = -1;

  function hasPageParam() {
    try {
      return new URLSearchParams(window.location.search).has(PAGE_PARAM);
    } catch (_) {
      return false;
    }
  }

  function getSavedItemId() {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function saveItemId(id) {
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch (_) {}
  }

  function clearItemId() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  // Низ шапки — к нему прижимается карточка при восстановлении позиции
  function getHeaderOffset() {
    const raw = getComputedStyle(document.body).getPropertyValue('--header-main-height');
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) return parsed;

    const headerMain = document.querySelector('.header--main');
    return headerMain ? headerMain.offsetHeight : 0;
  }

  // Спрашиваем браузер, какая карточка лежит на линии замера.
  // Точки разнесены по ширине экрана, чтобы не все попадали в gap между карточками
  function findItemAtProbeLine() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const step = width / (PROBE_COUNT + 1);

    for (let i = 1; i <= PROBE_COUNT; i++) {
      const stack = document.elementsFromPoint(Math.round(step * i), PROBE_Y);

      for (const element of stack) {
        if (!element.closest) continue;

        const item = element.closest(ITEM_SELECTOR);
        if (!item || item.id === '') continue;

        // Карточка должна лежать прямо в сетке: .item есть и в recent / related
        const parent = item.parentElement;
        if (!parent || !parent.matches(GRIDS_SELECTOR)) continue;

        return item;
      }
    }

    return null;
  }

  // PAGE в адресной строке — под партию найденной карточки, без записи в историю.
  // Номер страницы отдаёт сервер в data-page; пустое или нечисловое значение
  // (неподставленный плейсхолдер шаблона) применять нельзя — оставляем URL как есть
  function syncPageParamToItem(item) {
    const page = item.getAttribute('data-page');
    if (!page || !/^\d+$/.test(page)) return;

    try {
      const url = new URL(window.location.href);
      // Параметр появляется только после «Показать ещё» — сами его не добавляем
      if (!url.searchParams.has(PAGE_PARAM)) return;
      if (url.searchParams.get(PAGE_PARAM) === page) return;

      url.searchParams.set(PAGE_PARAM, page);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function trackTopItem() {
    if (trackingBlocked) return;
    if (isPinchZoomed()) return;

    // Страница не прокручивалась — на линии замера та же карточка
    const scrollY = window.pageYOffset;
    if (scrollY === lastScrollY) return;
    lastScrollY = scrollY;

    // Домотали до верхних TOP_ZONE пикселей — восстанавливать потом нечего:
    // чистим запись, иначе перезагрузка со старым id унесёт пользователя вниз по сетке
    if (scrollY <= TOP_ZONE) {
      clearItemId();
      return;
    }

    const item = findItemAtProbeLine();
    if (!item) return;

    saveItemId(item.id);
    syncPageParamToItem(item);
  }

  function scrollToSavedItem(savedId) {
    const target = document.getElementById(savedId);
    if (!target) return false;

    const rect = target.getBoundingClientRect();
    const top = rect.top + window.pageYOffset - getHeaderOffset() - ITEM_TOP_GAP;

    window.scrollTo({ top: Math.max(top, 0), behavior: 'auto' });
    return true;
  }

  // Системное восстановление скролла отдаём обратно браузеру: 'manual' остаётся
  // на записи истории и при возврате по bfcache (iOS) страница не перезапускается —
  // наших таймеров нет, а браузер скролл уже не восстановит, вьюпорт залипнет наверху
  function releaseScrollRestoration() {
    if (!('scrollRestoration' in window.history)) return;

    try {
      window.history.scrollRestoration = 'auto';
    } catch (_) {}
  }

  function stopRestore() {
    restoreTimers.forEach(timer => clearTimeout(timer));
    restoreTimers = [];
    trackingBlocked = false;
    releaseScrollRestoration();
  }

  function restoreScroll() {
    // Некуда восстанавливать — не скроллим вообще
    if (!document.getElementById(savedId)) {
      trackingBlocked = false;
      return;
    }

    RESTORE_DELAYS.forEach((delay, index) => {
      const timer = setTimeout(() => {
        scrollToSavedItem(savedId);
        if (index === RESTORE_DELAYS.length - 1) stopRestore();
      }, delay);
      restoreTimers.push(timer);
    });
  }

  // Пустой sessionStorage — позицию не запомнили или стерли на верху страницы:
  // отдаём скролл системному восстановлению и ничего не трогаем
  const savedId = getSavedItemId();
  const restoreNeeded = !!savedId && hasPageParam() && !window.location.hash;

  if (restoreNeeded) {
    trackingBlocked = true;
    // Ставим сразу при выполнении скрипта (defer, до DOMContentLoaded), чтобы
    // успеть отключить системное восстановление скролла
    if ('scrollRestoration' in window.history) {
      try {
        window.history.scrollRestoration = 'manual';
      } catch (_) {}
    }

    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(eventName => {
      window.addEventListener(eventName, stopRestore, { passive: true, once: true });
    });
  }

  // Возврат по bfcache: страница из памяти, позицию восстанавливает сам браузер.
  // Свои попытки прекращаем, а трекер на короткое время глушим — иначе тик,
  // пришедший до применения системного скролла, увидит верх страницы и сотрёт id
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;

    stopRestore();
    trackingBlocked = true;

    setTimeout(() => {
      trackingBlocked = false;
      lastScrollY = -1;
    }, BFCACHE_TRACK_PAUSE);
  });

  function init() {
    if (restoreNeeded) restoreScroll();

    setInterval(trackTopItem, TRACK_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
