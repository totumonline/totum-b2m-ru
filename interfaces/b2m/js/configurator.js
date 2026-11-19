
/**
 * Configurator Panel
 * При GET-параметре conf=true показывает кнопку открытия панели настроек
 */
(function() {

  if (localStorage.getItem('conf') !== 'true') return;

  let panel = null;
  let uploadPanel = null;
  let isOpen = false;
  let outsideClickHandler = null;

  const schemeColors = {};
  const customColors = {};

  const CONFIGURATOR_TEMPLATE_URL = `/interfaces/${window.interface}/fetch/configurator.html`;

  /**
   * Чтение цветов схемы из спанов li, сохранение в schemeColors и localStorage
   */
  function applyColorScheme(root, li) {
    root.querySelectorAll('.configurator--color-schemes li').forEach(item => {
      item.classList.remove('__checked');
    });
    li.classList.add('__checked');

    Object.keys(schemeColors).forEach(k => delete schemeColors[k]);
    li.querySelectorAll('.configurator--color-dot[data-color]').forEach(dot => {
      schemeColors[dot.dataset.color] = rgbToHex(dot.style.backgroundColor);
    });
    saveSchemeColors();
    applyColorsToInputs(root);
  }

  /**
   * Применение schemeColors + customColors к инпутам
   */
  function applyColorsToInputs(root) {
    root.querySelectorAll('.configurator--colors .configurator--input--block[data-color]').forEach(inputBlock => {
      const colorName = inputBlock.dataset.color;
      const hex = schemeColors[colorName];
      if (!hex) return;
      const input = inputBlock.querySelector('.configurator--input--input');
      const preview = inputBlock.querySelector('.configurator--color-dot');
      const clearBtn = inputBlock.querySelector('.__clear');
      const custom = customColors[colorName];
      const value = custom || hex;
      if (input) input.value = value;
      if (preview) preview.style.backgroundColor = value;
      if (custom) {
        if (clearBtn) clearBtn.classList.add('__active');
        inputBlock.classList.add('__changed');
      } else {
        if (clearBtn) clearBtn.classList.remove('__active');
        inputBlock.classList.remove('__changed');
      }
    });
  }

  /**
   * Сохранение цветов схемы в localStorage
   */
  function saveSchemeColors() {
    const parts = [];
    Object.keys(schemeColors).forEach(k => {
      parts.push(k + ':' + schemeColors[k]);
    });
    if (parts.length) {
      localStorage.setItem('configurator_color_scheme_colors', parts.join(','));
    }
  }

  /**
   * Загрузка цветов схемы из localStorage в schemeColors
   */
  function loadSchemeColors() {
    Object.keys(schemeColors).forEach(k => delete schemeColors[k]);
    const saved = localStorage.getItem('configurator_color_scheme_colors');
    if (!saved) return false;
    saved.split(',').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx === -1) return;
      schemeColors[pair.substring(0, idx)] = pair.substring(idx + 1);
    });
    return Object.keys(schemeColors).length > 0;
  }

  /**
   * Проверка расхождения цвета инпута со схемой, переключение __clear и __changed
   */
  function checkColorDivergence(block) {
    const colorName = block.dataset.color;
    const input = block.querySelector('.configurator--input--input');
    const clearBtn = block.querySelector('.__clear');
    if (!input || !clearBtn || !colorName) return;
    const schemeHex = (schemeColors[colorName] || '').toLowerCase();
    const inputHex = (input.value || '').toLowerCase();
    if (schemeHex && inputHex && schemeHex !== inputHex) {
      clearBtn.classList.add('__active');
      block.classList.add('__changed');
      customColors[colorName] = input.value;
    } else {
      clearBtn.classList.remove('__active');
      block.classList.remove('__changed');
      delete customColors[colorName];
    }
    saveCustomColors(block.closest('.configurator'));
    saveFinalColors();
  }

  /**
   * Сохранение кастомных цветов в localStorage
   */
  function saveCustomColors(root) {
    if (!root) return;
    const parts = [];
    root.querySelectorAll('.configurator--input--block.__changed').forEach(block => {
      const colorName = block.dataset.color;
      const input = block.querySelector('.configurator--input--input');
      if (colorName && input && input.value) {
        parts.push(colorName + ':' + input.value);
      }
    });
    if (parts.length) {
      localStorage.setItem('configurator_colors', parts.join(','));
    } else {
      localStorage.removeItem('configurator_colors');
    }
  }

  /**
   * Сохранение финальных цветов (scheme + custom) в localStorage
   */
  function saveFinalColors() {
    const parts = [];
    Object.keys(schemeColors).forEach(k => {
      parts.push(k + ':' + (customColors[k] || schemeColors[k]));
    });
    if (parts.length) {
      localStorage.setItem('configurator_color_scheme_final', parts.join(','));
    }
  }

  /**
   * Загрузка кастомных цветов из localStorage в customColors
   */
  function loadCustomColors() {
    Object.keys(customColors).forEach(k => delete customColors[k]);
    const saved = localStorage.getItem('configurator_colors');
    if (!saved) return;
    saved.split(',').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx === -1) return;
      customColors[pair.substring(0, idx)] = pair.substring(idx + 1);
    });
  }

  /**
   * Конвертация rgb(r, g, b) в #hex
   */
  function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    const parts = rgb.match(/\d+/g);
    if (!parts || parts.length < 3) return rgb;
    return '#' + parts.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }

  /**
   * Инициализация color picker кнопок
   */
  function initColorPickers(root) {
    root.querySelectorAll('.configurator--input--block').forEach(block => {
      const picker = block.querySelector('.configurator--input--picker');
      const native = block.querySelector('.configurator--input--color-native');
      const input = block.querySelector('.configurator--input--input');
      const preview = block.querySelector('.configurator--color-dot');
      const clearBtn = block.querySelector('.__clear');
      if (!picker || !native) return;

      picker.addEventListener('click', () => {
        if (input && input.value) native.value = input.value;
        native.click();
      });

      native.addEventListener('click', () => {
        if (input && input.value) native.value = input.value;
      });

      native.addEventListener('input', () => {
        if (input) input.value = native.value;
        if (preview) preview.style.backgroundColor = native.value;
        checkColorDivergence(block);
      });

      if (input) {
        input.addEventListener('input', () => {
          if (preview && input.value.match(/^#[0-9a-f]{6}$/i)) {
            preview.style.backgroundColor = input.value;
          }
          checkColorDivergence(block);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const colorName = block.dataset.color;
          const schemeHex = schemeColors[colorName];
          if (!schemeHex) return;
          if (input) input.value = schemeHex;
          if (preview) preview.style.backgroundColor = schemeHex;
          clearBtn.classList.remove('__active');
          block.classList.remove('__changed');
          delete customColors[colorName];
          saveCustomColors(block.closest('.configurator'));
          saveFinalColors();
        });
      }
    });
  }

  /**
   * Инициализация переключения общего шрифта
   */
  function initBaseFont(root) {
    const items = root.querySelectorAll('.configurator--base-font li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_base_font');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_base_font', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения шрифта заголовков
   */
  function initHeadingFont(root) {
    const items = root.querySelectorAll('.configurator--heading-font li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_heading_font');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_heading_font', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения размера шрифта
   */
  function initFontSize(root) {
    const items = root.querySelectorAll('.configurator--font-size li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_font_size');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_font_size', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения начертания шрифта
   */
  function initFontWeight(root) {
    const items = root.querySelectorAll('.configurator--font-weight li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_font_weight');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_font_weight', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения размера заголовков
   */
  function initTitleFontSize(root) {
    const items = root.querySelectorAll('.configurator--title-font-size li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_title_font_size');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_title_font_size', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения начертания заголовков
   */
  function initTitleFontWeight(root) {
    const items = root.querySelectorAll('.configurator--title-font-weight li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_title_font_weight');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_title_font_weight', li.textContent.trim());
      });
    });
  }

  const schemeRadiuses = {};
  const customRadiuses = {};

  /**
   * Парсинг строки радиусов name:value,name:value в объект
   */
  function parseRadiusList(str) {
    const result = {};
    if (!str) return result;
    str.split(',').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx !== -1) result[pair.substring(0, idx)] = pair.substring(idx + 1);
    });
    return result;
  }

  /**
   * Сериализация объекта радиусов в строку name:value,name:value
   */
  function serializeRadiuses(obj) {
    return Object.keys(obj).map(k => k + ':' + obj[k]).join(',');
  }

  /**
   * Сохранение радиусов схемы в localStorage
   */
  function saveSchemeRadiuses() {
    const s = serializeRadiuses(schemeRadiuses);
    if (s) localStorage.setItem('configurator_border_radius_radiuses', s);
  }

  /**
   * Загрузка радиусов схемы из localStorage в schemeRadiuses
   */
  function loadSchemeRadiuses() {
    Object.keys(schemeRadiuses).forEach(k => delete schemeRadiuses[k]);
    const saved = localStorage.getItem('configurator_border_radius_radiuses');
    if (!saved) return false;
    Object.assign(schemeRadiuses, parseRadiusList(saved));
    return Object.keys(schemeRadiuses).length > 0;
  }

  /**
   * Сохранение кастомных радиусов в localStorage
   */
  function saveCustomRadiuses(root) {
    if (!root) return;
    const parts = [];
    root.querySelectorAll('.configurator--input--block.__changed[data-radius]').forEach(block => {
      const name = block.dataset.radius;
      const input = block.querySelector('.configurator--input--input');
      if (name && input && input.value !== '') {
        parts.push(name + ':' + input.value);
      }
    });
    if (parts.length) {
      localStorage.setItem('configurator_radiuses', parts.join(','));
    } else {
      localStorage.removeItem('configurator_radiuses');
    }
  }

  /**
   * Загрузка кастомных радиусов из localStorage в customRadiuses
   */
  function loadCustomRadiuses() {
    Object.keys(customRadiuses).forEach(k => delete customRadiuses[k]);
    const saved = localStorage.getItem('configurator_radiuses');
    if (!saved) return;
    Object.assign(customRadiuses, parseRadiusList(saved));
  }

  /**
   * Сохранение финальных радиусов (scheme + custom) в localStorage
   */
  function saveFinalRadiuses() {
    const parts = [];
    Object.keys(schemeRadiuses).forEach(k => {
      parts.push(k + ':' + (customRadiuses[k] !== undefined ? customRadiuses[k] : schemeRadiuses[k]));
    });
    if (parts.length) {
      localStorage.setItem('configurator_border_radius_final', parts.join(','));
    }
  }

  /**
   * Применение радиусов схемы из li, сохранение в schemeRadiuses и localStorage
   */
  function applyRadiusScheme(root, li) {
    root.querySelectorAll('.configurator--border-radius .__configurator-block li').forEach(item => {
      item.classList.remove('__checked');
    });
    li.classList.add('__checked');
    Object.keys(schemeRadiuses).forEach(k => delete schemeRadiuses[k]);
    Object.assign(schemeRadiuses, parseRadiusList(li.dataset.radiusList));
    saveSchemeRadiuses();
    applyRadiusesToInputs(root);
  }

  /**
   * Применение schemeRadiuses + customRadiuses к инпутам
   */
  function applyRadiusesToInputs(root) {
    root.querySelectorAll('.configurator--border-radius .configurator--input--block[data-radius]').forEach(block => {
      const name = block.dataset.radius;
      const schemeVal = schemeRadiuses[name];
      if (schemeVal === undefined) return;
      const input = block.querySelector('.configurator--input--input');
      const clearBtn = block.querySelector('.__clear');
      const custom = customRadiuses[name];
      const value = custom !== undefined ? custom : schemeVal;
      if (input) input.value = value;
      if (custom !== undefined) {
        if (clearBtn) clearBtn.classList.add('__active');
        block.classList.add('__changed');
      } else {
        if (clearBtn) clearBtn.classList.remove('__active');
        block.classList.remove('__changed');
      }
    });
  }

  /**
   * Проверка расхождения радиуса инпута со схемой
   */
  function checkRadiusDivergence(block) {
    const name = block.dataset.radius;
    const input = block.querySelector('.configurator--input--input');
    const clearBtn = block.querySelector('.__clear');
    if (!input || !clearBtn || !name) return;
    const schemeVal = schemeRadiuses[name];
    const inputVal = input.value.trim();
    if (schemeVal !== undefined && inputVal !== '' && inputVal !== schemeVal) {
      clearBtn.classList.add('__active');
      block.classList.add('__changed');
      customRadiuses[name] = inputVal;
    } else {
      clearBtn.classList.remove('__active');
      block.classList.remove('__changed');
      delete customRadiuses[name];
    }
    saveCustomRadiuses(block.closest('.configurator'));
    saveFinalRadiuses();
  }

  /**
   * Инициализация инпутов радиусов (ввод + __clear)
   */
  function initRadiusInputs(root) {
    root.querySelectorAll('.configurator--border-radius .configurator--input--block[data-radius]').forEach(block => {
      const input = block.querySelector('.configurator--input--input');
      const clearBtn = block.querySelector('.__clear');

      if (input) {
        input.addEventListener('input', () => {
          checkRadiusDivergence(block);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const name = block.dataset.radius;
          const schemeVal = schemeRadiuses[name];
          if (schemeVal === undefined) return;
          if (input) input.value = schemeVal;
          clearBtn.classList.remove('__active');
          block.classList.remove('__changed');
          delete customRadiuses[name];
          saveCustomRadiuses(block.closest('.configurator'));
          saveFinalRadiuses();
        });
      }
    });
  }

  /**
   * Инициализация переключения радиусов
   */
  function initBorderRadius(root) {
    const items = root.querySelectorAll('.configurator--border-radius .__configurator-block li[data-radius-id]');
    if (!items.length) return;

    const savedId = localStorage.getItem('configurator_border_radius');
    let target = null;

    if (savedId) {
      target = root.querySelector('.configurator--border-radius li[data-radius-id="' + savedId + '"]');
    }
    if (!target) {
      target = root.querySelector('.configurator--border-radius li.__checked[data-radius-id]');
      if (!target) target = items[0];
    }

    loadCustomRadiuses();
    if (loadSchemeRadiuses()) {
      root.querySelectorAll('.configurator--border-radius .__configurator-block li').forEach(item => {
        item.classList.remove('__checked');
      });
      target.classList.add('__checked');
      applyRadiusesToInputs(root);
    } else {
      applyRadiusScheme(root, target);
    }

    items.forEach(li => {
      li.addEventListener('click', () => {
        localStorage.setItem('configurator_border_radius', li.dataset.radiusId);
        Object.keys(customRadiuses).forEach(k => delete customRadiuses[k]);
        applyRadiusScheme(root, li);
        saveCustomRadiuses(root);
        saveFinalRadiuses();
      });
    });

    initRadiusInputs(root);
  }

  /**
   * Инициализация переключения карточек в линию
   */
  function initCardsPerRow(root) {
    const items = root.querySelectorAll('.configurator--cards-per-row li');
    if (!items.length) return;
    const savedVal = localStorage.getItem('configurator_cards_per_row');
    items.forEach(li => {
      if (savedVal && li.textContent.trim() === savedVal) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_cards_per_row', li.textContent.trim());
        if (li.dataset.itemsInRowList) {
          localStorage.setItem('configurator_cards_per_row_list', li.dataset.itemsInRowList);
        }
      });
    });
  }

  /**
   * Инициализация переключения размера основной картинки товара
   */
  function initProductMainImage(root) {
    const items = root.querySelectorAll('.configurator--product-main-image li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_product_main_image');
    items.forEach(li => {
      if (saved && li.dataset.productMainImage === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_product_main_image', li.dataset.productMainImage);
      });
    });
  }

  let productMainImageInitial = null;

  /**
   * Инициализация переключения соотношения сторон картинок
   */
  function initAspectRatio(root) {
    const items = root.querySelectorAll('.configurator--aspect-ratio li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_aspect_ratio');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_aspect_ratio', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения скрытия хэдера
   */
  function initHideHeader(root) {
    const items = root.querySelectorAll('.configurator--hide-header li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_hide_header');
    items.forEach(li => {
      if (saved && li.dataset.hideHeader === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_hide_header', li.dataset.hideHeader);
      });
    });
  }

  let specialProductViewInitial = null;

  /**
   * Инициализация переключения показа всех картинок товара
   */
  function initSpecialProductView(root) {
    const items = root.querySelectorAll('.configurator--special-product-view li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_special_product_view');
    specialProductViewInitial = saved || '';
    items.forEach(li => {
      if (saved && li.dataset.specialProductView === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_special_product_view', li.dataset.specialProductView);
      });
    });
  }

  /**
   * Инициализация переключения сетки 2-3-2
   */
  function initSpecialProduct323(root) {
    const items = root.querySelectorAll('.configurator--special-product-323 li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_special_product_323');
    if (saved === null) {
      const checked = root.querySelector('.configurator--special-product-323 li.__checked');
      if (checked) localStorage.setItem('configurator_special_product_323', checked.dataset['specialProduct-323']);
    } else {
      items.forEach(li => {
        if (li.dataset['specialProduct-323'] === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_special_product_323', li.dataset['specialProduct-323']);
        if (li.dataset['specialProduct-323'] === 'true') {
          var spvTrue = root.querySelector('.configurator--special-product-view li[data-special-product-view="true"]');
          if (spvTrue && !spvTrue.classList.contains('__checked')) spvTrue.click();
        }
      });
    });
  }

  /**
   * Инициализация переключения скрытия быстрых фильтров
   */
  function initHideFilters(root) {
    const items = root.querySelectorAll('.configurator--hide-filters li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_hide_filters');
    if (saved === null) {
      const checked = root.querySelector('.configurator--hide-filters li.__checked');
      if (checked) localStorage.setItem('configurator_hide_filters', checked.dataset.hideFilters);
    } else {
      items.forEach(li => {
        if (li.dataset.hideFilters === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_hide_filters', li.dataset.hideFilters);
      });
    });
  }

  let blockMouseHoverScrollInitial = null;
  let quickExtendedInitial = null;
  let wideOnMobileInitial = null;

  /**
   * Инициализация переключения quick-extended
   */
  function initQuickExtended(root) {
    const items = root.querySelectorAll('.configurator--quick-extended li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_quick_extended');
    if (saved === null) {
      const checked = root.querySelector('.configurator--quick-extended li.__checked');
      if (checked) localStorage.setItem('configurator_quick_extended', checked.dataset.quickExtended);
    } else {
      items.forEach(li => {
        if (li.dataset.quickExtended === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_quick_extended', li.dataset.quickExtended);
      });
    });
  }

  /**
   * Инициализация переключения одной карточки в линии на мобильном
   */
  function initWideOnMobile(root) {
    const items = root.querySelectorAll('.configurator--wide-on-mobile li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_wide_on_mobile');
    if (saved === null) {
      const checked = root.querySelector('.configurator--wide-on-mobile li.__checked');
      if (checked) localStorage.setItem('configurator_wide_on_mobile', checked.dataset.wideOnMobile);
    } else {
      items.forEach(li => {
        if (li.dataset.wideOnMobile === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_wide_on_mobile', li.dataset.wideOnMobile);
      });
    });
  }

  /**
   * Инициализация переключения блокировки пролистывания мышью
   */
  function initBlockMouseHoverScroll(root) {
    const items = root.querySelectorAll('.configurator--block-mouse-hover-scroll li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_block_mouse_hover_scroll');
    if (saved === null) {
      const checked = root.querySelector('.configurator--block-mouse-hover-scroll li.__checked');
      if (checked) localStorage.setItem('configurator_block_mouse_hover_scroll', checked.dataset.blockMouseHoverScroll);
    } else {
      items.forEach(li => {
        if (li.dataset.blockMouseHoverScroll === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_block_mouse_hover_scroll', li.dataset.blockMouseHoverScroll);
      });
    });
  }

  /**
   * Инициализация переключения широкой первой картинки
   */
  function initSpecialProductWide(root) {
    const items = root.querySelectorAll('.configurator--special-product-wide li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_special_product_wide');
    if (saved === null) {
      const checked = root.querySelector('.configurator--special-product-wide li.__checked');
      if (checked) localStorage.setItem('configurator_special_product_wide', checked.dataset.specialProductWide);
    } else {
      items.forEach(li => {
        if (li.dataset.specialProductWide === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_special_product_wide', li.dataset.specialProductWide);
        if (li.dataset.specialProductWide === 'true') {
          var spvTrue = root.querySelector('.configurator--special-product-view li[data-special-product-view="true"]');
          if (spvTrue && !spvTrue.classList.contains('__checked')) spvTrue.click();
        }
      });
    });
  }

  /**
   * Инициализация переключения зазора между фото
   */
  function initSpecialProductGap(root) {
    const items = root.querySelectorAll('.configurator--special-product-gap li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_special_product_gap');
    if (saved === null) {
      const checked = root.querySelector('.configurator--special-product-gap li.__checked');
      if (checked) localStorage.setItem('configurator_special_product_gap', checked.dataset.specialProductGap);
    } else {
      items.forEach(li => {
        if (li.dataset.specialProductGap === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_special_product_gap', li.dataset.specialProductGap);
      });
    });
  }

  /**
   * Инициализация переключения оформления названия товара
   */
  function initItemNameType(root) {
    const items = root.querySelectorAll('.configurator--item-name-type li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_item_name_type');
    if (saved === null) {
      const checked = root.querySelector('.configurator--item-name-type li.__checked');
      if (checked) {
        localStorage.setItem('configurator_item_name_type', checked.textContent.trim());
        if (checked.dataset.itemNameType) {
          localStorage.setItem('configurator_item_name_type_values', checked.dataset.itemNameType);
        }
      }
    } else {
      items.forEach(li => {
        if (li.textContent.trim() === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_item_name_type', li.textContent.trim());
        if (li.dataset.itemNameType) {
          localStorage.setItem('configurator_item_name_type_values', li.dataset.itemNameType);
        } else {
          localStorage.removeItem('configurator_item_name_type_values');
        }
      });
    });
  }

  /**
   * Инициализация переключения размера шрифта названия товара
   */
  function initItemNameSizeAdjustment(root) {
    const items = root.querySelectorAll('.configurator--item-name-size-adjustment li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_item_name_size_adjustment');
    if (saved === null) {
      const checked = root.querySelector('.configurator--item-name-size-adjustment li.__checked');
      if (checked) localStorage.setItem('configurator_item_name_size_adjustment', checked.textContent.trim());
    } else {
      items.forEach(li => {
        if (li.textContent.trim() === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_item_name_size_adjustment', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения размера карточек в скроллерах
   */
  function initScrollerItems(root) {
    const items = root.querySelectorAll('.configurator--scroller-items li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_scroller_items');
    if (saved === null) {
      const checked = root.querySelector('.configurator--scroller-items li.__checked');
      if (checked) localStorage.setItem('configurator_scroller_items', checked.textContent.trim());
    } else {
      items.forEach(li => {
        if (li.textContent.trim() === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_scroller_items', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения соотношения сторон в карточке
   */
  function initProductAspectRatio(root) {
    const items = root.querySelectorAll('.configurator--product-aspect-ratio li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_product_aspect_ratio');
    if (saved === null) {
      const checked = root.querySelector('.configurator--product-aspect-ratio li.__checked');
      if (checked) localStorage.setItem('configurator_product_aspect_ratio', checked.textContent.trim());
    } else {
      items.forEach(li => {
        if (li.textContent.trim() === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_product_aspect_ratio', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения высоты широких карточек
   */
  function initWideType(root) {
    const items = root.querySelectorAll('.configurator--wide-type li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_wide_type');
    if (saved === null) {
      const checked = root.querySelector('.configurator--wide-type li.__checked');
      if (checked && checked.dataset.wideType) {
        localStorage.setItem('configurator_wide_type', checked.dataset.wideType);
      }
    } else {
      items.forEach(li => {
        const val = li.dataset.wideType || '';
        if (val === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        if (li.dataset.wideType) {
          localStorage.setItem('configurator_wide_type', li.dataset.wideType);
        } else {
          localStorage.removeItem('configurator_wide_type');
        }
      });
    });
  }

  /**
   * Инициализация переключения автоматического увеличения карточки
   */
  function initAutoWide(root) {
    const items = root.querySelectorAll('.configurator--auto-wide li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_auto_wide');
    if (saved === null) {
      const checked = root.querySelector('.configurator--auto-wide li.__checked');
      if (checked) {
        const isFirst = checked === items[0];
        localStorage.setItem('configurator_auto_wide', isFirst ? 'false' : checked.textContent.trim());
      }
    } else {
      items.forEach(li => {
        const isFirst = li === items[0];
        const val = isFirst ? 'false' : li.textContent.trim();
        if (val === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        const isFirst = li === items[0];
        localStorage.setItem('configurator_auto_wide', isFirst ? 'false' : li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения лимита фото
   */
  function initSpecialProductLimit(root) {
    const items = root.querySelectorAll('.configurator--special-product-limit li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_special_product_limit');
    if (saved === null) {
      const checked = root.querySelector('.configurator--special-product-limit li.__checked');
      if (checked) localStorage.setItem('configurator_special_product_limit', checked.textContent.trim());
    } else {
      items.forEach(li => {
        if (li.textContent.trim() === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_special_product_limit', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения положения картинок товаров
   */
  function initStandartImagePosition(root) {
    const items = root.querySelectorAll('.configurator--standart-image-position li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_standart_image_position');
    items.forEach(li => {
      if (saved && li.dataset.standartImagePosition === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_standart_image_position', li.dataset.standartImagePosition);
      });
    });
  }

  /**
   * Инициализация переключения скрытия разделителя хэдера
   */
  function initHideDelimeter(root) {
    const items = root.querySelectorAll('.configurator--hide-delimeter li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_hide_delimeter');
    items.forEach(li => {
      if (saved && li.dataset.hideDelimeter === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_hide_delimeter', li.dataset.hideDelimeter);
      });
    });
  }

  /**
   * Инициализация переключения толщины обводок
   */
  function initBorderWidth(root) {
    const items = root.querySelectorAll('.configurator--border-width li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_border_width');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_border_width', li.textContent.trim());
      });
    });
  }

  let headerSettingsInitial = null;
  let autoWideInitial = null;
  let cardsPerRowInitial = null;

  /**
   * Инициализация переключения вариантов хэдера
   */
  function initHeaderSettings(root) {
    const items = root.querySelectorAll('.configurator--header-settings li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_header_settings');
    headerSettingsInitial = saved || '';
    items.forEach(li => {
      if (saved && li.dataset.headerSettings === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_header_settings', li.dataset.headerSettings);
        localStorage.setItem('configurator_header_settings_params', li.dataset.headerSettingsParams);
        if (li.dataset.headerSettings === '5') {
          var qeFalse = root.querySelector('.configurator--quick-extended li[data-quick-extended="false"]');
          if (qeFalse && !qeFalse.classList.contains('__checked')) qeFalse.click();
        }
      });
    });
  }

  /**
   * Инициализация переключения ширины сайта
   */
  let siteWidthInitial = null;

  function initSiteWidth(root) {
    const items = root.querySelectorAll('.configurator--site-width li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_site_width');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_site_width', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения теней
   */
  function initShadows(root) {
    const items = root.querySelectorAll('.configurator--shadows li');
    if (!items.length) return;
    const savedId = localStorage.getItem('configurator_shadows');
    if (savedId === null) {
      const checked = root.querySelector('.configurator--shadows li.__checked');
      if (checked) {
        localStorage.setItem('configurator_shadows', checked.dataset.shadowsId);
        if (checked.dataset.shadows) {
          localStorage.setItem('configurator_shadows_values', checked.dataset.shadows);
        }
      }
    } else {
      items.forEach(li => {
        if (li.dataset.shadowsId === savedId) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_shadows', li.dataset.shadowsId);
        if (li.dataset.shadows) {
          localStorage.setItem('configurator_shadows_values', li.dataset.shadows);
        } else {
          localStorage.removeItem('configurator_shadows_values');
        }
      });
    });
  }

  /**
   * Инициализация переключения высоты баннера
   */
  function initBannerHeight(root) {
    const items = root.querySelectorAll('.configurator--banner-height li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_banner_height');
    items.forEach(li => {
      if (saved && li.textContent.trim() === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_banner_height', li.textContent.trim());
      });
    });
  }

  /**
   * Инициализация переключения расширения баннеров
   */
  function initExpandBanners(root) {
    const items = root.querySelectorAll('.configurator--expand-banners li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_expand_banners');
    items.forEach(li => {
      if (saved && li.dataset.expandBanner === saved) {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
      }
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_expand_banners', li.dataset.expandBanner);
        if (li.dataset.expandBanner === 'true') {
          const bwItems = root.querySelectorAll('.configurator--banner-max-width li');
          bwItems.forEach(bw => {
            bw.classList.remove('__checked');
            if (bw.textContent.trim() === '100vw') {
              bw.classList.add('__checked');
              localStorage.setItem('configurator_banner_max_width', bw.dataset.bannerMaxWidth);
            }
          });
        }
      });
    });
  }

  /**
   * Инициализация переключения ширины баннера
   */
  function initBannerMaxWidth(root) {
    const items = root.querySelectorAll('.configurator--banner-max-width li');
    if (!items.length) return;
    const saved = localStorage.getItem('configurator_banner_max_width');
    if (saved) {
      items.forEach(li => {
        if (li.dataset.bannerMaxWidth === saved) {
          items.forEach(i => i.classList.remove('__checked'));
          li.classList.add('__checked');
        }
      });
    }
    items.forEach(li => {
      li.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('__checked'));
        li.classList.add('__checked');
        localStorage.setItem('configurator_banner_max_width', li.dataset.bannerMaxWidth);
        const isFullWidth = li.textContent.trim() === '100vw';
        if (!isFullWidth) {
          localStorage.setItem('configurator_expand_banners', 'false');
          const expandItems = root.querySelectorAll('.configurator--expand-banners li');
          expandItems.forEach(ei => {
            ei.classList.remove('__checked');
            if (ei.dataset.expandBanner === 'false') ei.classList.add('__checked');
          });
        }
      });
    });
  }

  /**
   * Инициализация переключения цветовых схем
   */
  function initColorSchemes(root) {
    const items = root.querySelectorAll('.configurator--color-schemes li[data-color-scheme-id]');
    if (!items.length) return;

    const savedId = localStorage.getItem('configurator_color_scheme');
    let target = null;

    if (savedId) {
      target = root.querySelector('.configurator--color-schemes li[data-color-scheme-id="' + savedId + '"]');
    }
    if (!target) {
      target = root.querySelector('.configurator--color-schemes li.__checked[data-color-scheme-id]') || items[0];
    }

    loadCustomColors();
    if (loadSchemeColors()) {
      root.querySelectorAll('.configurator--color-schemes li').forEach(item => {
        item.classList.remove('__checked');
      });
      target.classList.add('__checked');
      applyColorsToInputs(root);
    } else {
      applyColorScheme(root, target);
    }

    items.forEach(li => {
      li.addEventListener('click', () => {
        localStorage.setItem('configurator_color_scheme', li.dataset.colorSchemeId);
        Object.keys(customColors).forEach(k => delete customColors[k]);
        applyColorScheme(root, li);
        saveCustomColors(root);
        saveFinalColors();
      });
    });
  }

  /**
   * Применение всех настроек: панель пишет только в ЛС, стили и классы body пересоздаёт head-скрипт
   */
  function applySettings() {
    if (typeof window.applyConfiguratorStyles === 'function') window.applyConfiguratorStyles();
    if (typeof window.updateBuyBoxPosition === 'function') window.updateBuyBoxPosition();
  }

  /**
   * Configurator Export
   * Сбор применённых CSS-переменных и классов body в JSON для копирования в буфер обмена
   */
  const exportBodyClasses = window.configuratorBodyClasses || [];

  function collectCSSVars() {
    const vars = new Map();
    document.querySelectorAll('style[id^="configurator-"]').forEach(function(style) {
      const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;}]+);/g;
      let match;
      while ((match = re.exec(style.textContent)) !== null) {
        vars.set(match[1], match[2].trim());
      }
    });
    const list = [];
    vars.forEach(function(value, name) {
      list.push(name + ': ' + value + ';');
    });
    return list;
  }

  function collectBodyClasses() {
    return exportBodyClasses.filter(function(cls) {
      return document.body.classList.contains(cls);
    });
  }

  const exportSkipKeys = [
    'configurator_scroll',
    'configurator_color_scheme_colors',
    'configurator_color_scheme_final',
    'configurator_border_radius_radiuses',
    'configurator_border_radius_final'
  ];

  function collectConfiguratorState() {
    const state = {};
    Object.keys(localStorage)
      .filter(function(key) {
        return key.indexOf('configurator_') === 0 && exportSkipKeys.indexOf(key) === -1;
      })
      .sort()
      .forEach(function(key) {
        state[key] = localStorage.getItem(key);
      });
    return state;
  }

  function buildExportJSON() {
    return JSON.stringify({
      css_vars: collectCSSVars(),
      body_classes: collectBodyClasses(),
      configurator: collectConfiguratorState()
    });
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (ok) resolve();
      else reject(new Error('copy failed'));
    });
  }

  /**
   * Configurator Import
   * Поля панели и способ поиска пункта по значению из снимка
   * Порядок важен: секции, клик по которым переключает соседние секции, идут раньше зависимых
   */
  const importSelectFields = [
    { key: 'configurator_color_scheme', section: '.configurator--color-schemes', attr: 'data-color-scheme-id' },
    { key: 'configurator_base_font', section: '.configurator--base-font' },
    { key: 'configurator_heading_font', section: '.configurator--heading-font' },
    { key: 'configurator_font_size', section: '.configurator--font-size' },
    { key: 'configurator_font_weight', section: '.configurator--font-weight' },
    { key: 'configurator_title_font_size', section: '.configurator--title-font-size' },
    { key: 'configurator_title_font_weight', section: '.configurator--title-font-weight' },
    { key: 'configurator_border_radius', section: '.configurator--border-radius', attr: 'data-radius-id' },
    { key: 'configurator_cards_per_row', section: '.configurator--cards-per-row' },
    { key: 'configurator_product_main_image', section: '.configurator--product-main-image', attr: 'data-product-main-image' },
    { key: 'configurator_aspect_ratio', section: '.configurator--aspect-ratio' },
    { key: 'configurator_banner_max_width', section: '.configurator--banner-max-width', attr: 'data-banner-max-width' },
    { key: 'configurator_expand_banners', section: '.configurator--expand-banners', attr: 'data-expand-banner' },
    { key: 'configurator_banner_height', section: '.configurator--banner-height' },
    { key: 'configurator_hide_header', section: '.configurator--hide-header', attr: 'data-hide-header' },
    { key: 'configurator_site_width', section: '.configurator--site-width' },
    { key: 'configurator_special_product_323', section: '.configurator--special-product-323', attr: 'data-special-product-323' },
    { key: 'configurator_special_product_wide', section: '.configurator--special-product-wide', attr: 'data-special-product-wide' },
    { key: 'configurator_special_product_gap', section: '.configurator--special-product-gap', attr: 'data-special-product-gap' },
    { key: 'configurator_special_product_limit', section: '.configurator--special-product-limit' },
    { key: 'configurator_special_product_view', section: '.configurator--special-product-view', attr: 'data-special-product-view' },
    { key: 'configurator_product_aspect_ratio', section: '.configurator--product-aspect-ratio' },
    { key: 'configurator_wide_type', section: '.configurator--wide-type', attr: 'data-wide-type' },
    { key: 'configurator_item_name_type', section: '.configurator--item-name-type' },
    { key: 'configurator_item_name_size_adjustment', section: '.configurator--item-name-size-adjustment' },
    { key: 'configurator_scroller_items', section: '.configurator--scroller-items' },
    { key: 'configurator_wide_on_mobile', section: '.configurator--wide-on-mobile', attr: 'data-wide-on-mobile' },
    { key: 'configurator_hide_filters', section: '.configurator--hide-filters', attr: 'data-hide-filters' },
    { key: 'configurator_block_mouse_hover_scroll', section: '.configurator--block-mouse-hover-scroll', attr: 'data-block-mouse-hover-scroll' },
    { key: 'configurator_standart_image_position', section: '.configurator--standart-image-position', attr: 'data-standart-image-position' },
    { key: 'configurator_hide_delimeter', section: '.configurator--hide-delimeter', attr: 'data-hide-delimeter' },
    { key: 'configurator_border_width', section: '.configurator--border-width' },
    { key: 'configurator_shadows', section: '.configurator--shadows', attr: 'data-shadows-id' },
    { key: 'configurator_header_settings', section: '.configurator--header-settings', attr: 'data-header-settings' },
    { key: 'configurator_quick_extended', section: '.configurator--quick-extended', attr: 'data-quick-extended' }
  ];

  /**
   * Поиск пункта секции по значению из снимка
   */
  function findSectionItem(root, field, value) {
    const section = root.querySelector(field.section);
    if (!section) return null;
    if (field.attr) {
      return section.querySelector('li[' + field.attr + '="' + value + '"]');
    }
    return Array.from(section.querySelectorAll('li')).find(li => li.textContent.trim() === value) || null;
  }

  /**
   * Назначение автоматического увеличения карточки: первый пункт хранится как false
   */
  function applyAutoWideToPanel(root, value) {
    const items = root.querySelectorAll('.configurator--auto-wide li');
    if (!items.length) return;
    const target = Array.from(items).find((li, index) => (index === 0 ? 'false' : li.textContent.trim()) === value);
    if (target) target.click();
  }

  /**
   * Назначение выбранных пунктов панели по снимку
   */
  function applyStateToItems(root, state) {
    importSelectFields.forEach(field => {
      const value = state[field.key];
      if (typeof value !== 'string') return;
      const li = findSectionItem(root, field, value);
      if (li) li.click();
    });
    if (typeof state.configurator_auto_wide === 'string') {
      applyAutoWideToPanel(root, state.configurator_auto_wide);
    }
  }

  /**
   * Назначение ручных значений инпутам цветов и скруглений
   */
  function applyStateToInputs(root, list, blockSelector) {
    if (typeof list !== 'string' || !list) return;
    list.split(',').forEach(pair => {
      const idx = pair.indexOf(':');
      if (idx <= 0) return;
      const block = root.querySelector(blockSelector.replace('{name}', pair.substring(0, idx)));
      if (!block) return;
      const input = block.querySelector('.configurator--input--input');
      if (!input) return;
      input.value = pair.substring(idx + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /**
   * Санитайзинг текста, разбор JSON и проверка снимка настроек
   */
  function parseImportText(text) {
    const clean = typeof sanitizeHTML === 'function' ? sanitizeHTML(text) : text;
    const json = new DOMParser().parseFromString(clean, 'text/html').body.textContent.trim();
    if (!json) throw new Error('пустой текст');
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('ожидается объект JSON');
    const state = data.configurator;
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('нет ключа configurator');
    Object.keys(state).forEach(key => {
      if (key.indexOf('configurator_') !== 0) throw new Error('недопустимый ключ ' + key);
      if (typeof state[key] !== 'string') throw new Error('значение не строка: ' + key);
    });
    return state;
  }

  /**
   * Сброс пунктов панели к значениям из шаблона конфигуратора
   */
  function resetPanelSections(content) {
    return fetch(CONFIGURATOR_TEMPLATE_URL)
      .then(res => res.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const currentRoot = content.querySelector('.configurator');
        if (!currentRoot) return;
        currentRoot.querySelectorAll('section[class^="configurator--"]').forEach(section => {
          const sectionClass = Array.from(section.classList).find(c => c.startsWith('configurator--'));
          if (!sectionClass) return;
          const origSection = doc.querySelector('.' + sectionClass);
          if (!origSection) return;
          const origChecked = origSection.querySelector('li.__checked');
          if (!origChecked) return;
          const origText = origChecked.textContent.trim();
          section.querySelectorAll('li').forEach(li => {
            li.classList.remove('__checked');
            if (li.textContent.trim() === origText) {
              li.classList.add('__checked');
              li.click();
            }
          });
        });
      });
  }

  /**
   * Закрытие панели загрузки
   */
  function closeUploadPanel() {
    if (!uploadPanel) return;
    uploadPanel.remove();
    uploadPanel = null;
  }

  /**
   * Панель загрузки настроек: ввод текста, сброс панели, назначение значений и сохранение
   */
  function openUploadPanel(content) {
    if (uploadPanel) return;

    uploadPanel = document.createElement('section');
    uploadPanel.className = 'mobile-panel __scrollable __wide __configurator-upload-panel';

    const header = document.createElement('div');
    header.className = 'mobile-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = 'Загрузить настройки';
    titleButton.setAttribute('aria-label', 'Назад: Загрузить настройки');
    titleButton.addEventListener('click', closeUploadPanel);

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.addEventListener('click', closeUploadPanel);

    header.appendChild(titleButton);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'mobile-panel--content';

    const field = document.createElement('textarea');
    field.className = 'mobile-panel--upload--field';
    field.setAttribute('placeholder', 'Вставьте сюда JSON настроек');

    const error = document.createElement('div');
    error.className = 'mobile-panel--upload--error';

    body.appendChild(field);
    body.appendChild(error);

    const acceptBlock = document.createElement('div');
    acceptBlock.className = 'mobile-panel--accept-clear--block';

    const acceptButton = document.createElement('button');
    acceptButton.className = 'mobile-panel--accept';
    acceptButton.setAttribute('type', 'button');
    acceptButton.textContent = 'Применить';
    acceptButton.setAttribute('aria-label', 'Применить');

    acceptButton.addEventListener('click', () => {
      let state;
      try {
        state = parseImportText(field.value);
      } catch (e) {
        error.textContent = 'Не удалось прочитать настройки: ' + e.message;
        return;
      }
      error.textContent = '';
      acceptButton.disabled = true;
      resetPanelSections(content).then(() => {
        const root = content.querySelector('.configurator');
        if (root) {
          applyStateToItems(root, state);
          applyStateToInputs(root, state.configurator_colors, '.configurator--colors .configurator--input--block[data-color="{name}"]');
          applyStateToInputs(root, state.configurator_radiuses, '.configurator--border-radius .configurator--input--block[data-radius="{name}"]');
        }
        closeUploadPanel();
        closePanel();
        location.reload();
      });
    });

    acceptBlock.appendChild(acceptButton);

    uploadPanel.appendChild(header);
    uploadPanel.appendChild(body);
    uploadPanel.appendChild(acceptBlock);

    document.body.appendChild(uploadPanel);

    uploadPanel.classList.add('__active');
  }

  /**
   * Открытие панели
   */
  function openPanel() {
    if (isOpen) return;

    window.lockPanelScroll(); // общая блокировка страницы из header.js — сама выбирает desktop/mobile режим и следит за ресайзом
    isOpen = true;

    panel = document.createElement('section');
    panel.className = 'mobile-panel __scrollable __wide __configurator-panel';

    const header = document.createElement('div');
    header.className = 'mobile-panel--header';

    const titleButton = document.createElement('button');
    titleButton.className = 'mobile-panel--header--title';
    titleButton.setAttribute('type', 'button');
    titleButton.textContent = 'Настройки';
    titleButton.setAttribute('aria-label', 'Закрыть: Настройки');
    titleButton.addEventListener('click', closePanel);

    const downloadButton = document.createElement('button');
    downloadButton.className = 'mobile-panel--header--conf-download outline-button';
    downloadButton.setAttribute('type', 'button');

    /**
     * Текст кнопки «Скачать» вместе с aria-label (меняется на статус копирования)
     */
    function setDownloadButtonText(text) {
      downloadButton.textContent = text;
      downloadButton.setAttribute('aria-label', text);
    }

    setDownloadButtonText('Скачать');

    let downloadResetTimer = null;

    downloadButton.addEventListener('click', () => {
      applySettings();
      copyToClipboard(buildExportJSON())
        .then(() => {
          setDownloadButtonText('Скопировано');
        })
        .catch(() => {
          setDownloadButtonText('Ошибка');
        })
        .then(() => {
          clearTimeout(downloadResetTimer);
          downloadResetTimer = setTimeout(() => {
            setDownloadButtonText('Скачать');
          }, 1500);
        });
    });

    const closeButton = document.createElement('button');
    closeButton.className = 'mobile-panel--close';
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.addEventListener('click', closePanel);

    const uploadButton = document.createElement('button');
    uploadButton.className = 'mobile-panel--header--conf-upload outline-button';
    uploadButton.setAttribute('type', 'button');
    uploadButton.textContent = 'Загрузить';
    uploadButton.setAttribute('aria-label', 'Загрузить настройки');

    uploadButton.addEventListener('click', () => {
      openUploadPanel(content);
    });

    header.appendChild(titleButton);
    header.appendChild(closeButton);
    header.appendChild(downloadButton);
    header.appendChild(uploadButton);

    const content = document.createElement('div');
    content.className = 'mobile-panel--content';

    fetch(CONFIGURATOR_TEMPLATE_URL)
      .then(res => res.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const configuratorMain = doc.querySelector('main.configurator');
        if (configuratorMain) {
          const div = document.createElement('div');
          div.className = configuratorMain.className;
          div.innerHTML = configuratorMain.innerHTML;
          content.appendChild(div);
          initColorSchemes(div);
          initColorPickers(div);
          initBaseFont(div);
          initHeadingFont(div);
          initFontSize(div);
          initTitleFontSize(div);
          initFontWeight(div);
          initTitleFontWeight(div);
          initBorderRadius(div);
          initCardsPerRow(div);
          cardsPerRowInitial = localStorage.getItem('configurator_cards_per_row') || '';
          initProductMainImage(div);
          productMainImageInitial = localStorage.getItem('configurator_product_main_image') || '';
          initAspectRatio(div);
          initExpandBanners(div);
          initBannerMaxWidth(div);
          initBannerHeight(div);
          initHideHeader(div);
          initSiteWidth(div);
          siteWidthInitial = localStorage.getItem('configurator_site_width') || '';
          initSpecialProductView(div);
          initSpecialProduct323(div);
          initSpecialProductWide(div);
          initSpecialProductGap(div);
          initProductAspectRatio(div);
          initSpecialProductLimit(div);
          initWideType(div);
          initAutoWide(div);
          autoWideInitial = localStorage.getItem('configurator_auto_wide') || '';
          initItemNameType(div);
          initItemNameSizeAdjustment(div);
          initScrollerItems(div);
          initWideOnMobile(div);
          wideOnMobileInitial = localStorage.getItem('configurator_wide_on_mobile') || '';
          initHideFilters(div);
          initBlockMouseHoverScroll(div);
          blockMouseHoverScrollInitial = localStorage.getItem('configurator_block_mouse_hover_scroll') || '';
          initStandartImagePosition(div);
          initHideDelimeter(div);
          initBorderWidth(div);
          initShadows(div);
          initQuickExtended(div);
          quickExtendedInitial = localStorage.getItem('configurator_quick_extended') || '';
          initHeaderSettings(div);
        }
        var savedScroll = localStorage.getItem('configurator_scroll');
        if (savedScroll) panel.scrollTop = parseInt(savedScroll, 10);
      });

    const acceptClearBlock = document.createElement('div');
    acceptClearBlock.className = 'mobile-panel--accept-clear--block';

    const clearButton = document.createElement('button');
    clearButton.className = 'mobile-panel--clear';
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Сбросить';
    clearButton.setAttribute('aria-label', 'Сбросить');

    const acceptButton = document.createElement('button');
    acceptButton.className = 'mobile-panel--accept';
    acceptButton.setAttribute('type', 'button');
    acceptButton.textContent = 'Применить';
    acceptButton.setAttribute('aria-label', 'Применить');

    acceptButton.addEventListener('click', closePanel);

    clearButton.addEventListener('click', () => {
      resetPanelSections(content).then(() => {
        closePanel();
        location.reload();
      });
    });

    acceptClearBlock.appendChild(clearButton);
    acceptClearBlock.appendChild(acceptButton);

    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(acceptClearBlock);

    document.body.appendChild(panel);

    window.closeMobileConfiguratorPanel = closePanel;

    panel.classList.add('__active');

    outsideClickHandler = (e) => {
      if (uploadPanel && uploadPanel.contains(e.target)) return;
      if (!panel.contains(e.target) && e.target !== openButton) {
        closePanel();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler);
    }, 100);
  }

  /**
   * Закрытие панели
   */
  function closePanel() {
    if (!isOpen || !panel) return;

    localStorage.setItem('configurator_scroll', panel.scrollTop);
    panel.classList.remove('__active');
    applySettings();
    var currentSiteWidth = localStorage.getItem('configurator_site_width') || '';
    var siteWidthChanged = currentSiteWidth !== siteWidthInitial;
    var currentAutoWide = localStorage.getItem('configurator_auto_wide') || '';
    if (currentAutoWide !== autoWideInitial) {
      document.querySelectorAll('[data-auto-wide-chosen]').forEach(function(el) { el.removeAttribute('data-auto-wide-chosen'); });
    }
    var currentCardsPerRow = localStorage.getItem('configurator_cards_per_row') || '';
    var cardsPerRowChanged = currentCardsPerRow !== cardsPerRowInitial;
    if (currentAutoWide !== autoWideInitial || siteWidthChanged || cardsPerRowChanged) {
      if (typeof window.safeFixAllGrids === 'function') window.safeFixAllGrids();
      else if (typeof window.fixAllGrids === 'function') window.fixAllGrids();
    }
    var currentWideOnMobile = localStorage.getItem('configurator_wide_on_mobile') || '';
    if (currentWideOnMobile !== wideOnMobileInitial) {
      location.reload();
      return;
    }
    var currentBlockMouseHoverScroll = localStorage.getItem('configurator_block_mouse_hover_scroll') || '';
    if (currentBlockMouseHoverScroll !== blockMouseHoverScrollInitial) {
      location.reload();
      return;
    }
    var currentQuickExtended = localStorage.getItem('configurator_quick_extended') || '';
    if (currentQuickExtended !== quickExtendedInitial) {
      location.reload();
      return;
    }
    var currentHeaderSettings = localStorage.getItem('configurator_header_settings') || '';
    if (currentHeaderSettings !== headerSettingsInitial) {
      location.reload();
      return;
    }
    var currentSpecialProductView = localStorage.getItem('configurator_special_product_view') || '';
    if (currentSpecialProductView !== specialProductViewInitial) {
      location.reload();
      return;
    }
    var currentProductMainImage = localStorage.getItem('configurator_product_main_image') || '';
    if (currentProductMainImage !== productMainImageInitial) {
      location.reload();
      return;
    }
    if (typeof updateHeaderMainHeight === 'function') updateHeaderMainHeight();
    if (typeof updateAllHeaderHeight === 'function') updateAllHeaderHeight();

    window.unlockPanelScroll();
    isOpen = false;

    if (outsideClickHandler) {
      document.removeEventListener('click', outsideClickHandler);
      outsideClickHandler = null;
    }

    window.closeMobileConfiguratorPanel = null;

    setTimeout(() => {
      if (panel) {
        panel.remove();
        panel = null;
      }
    }, 300);
  }

  /**
   * Кнопка открытия панели
   */
  const openButton = document.createElement('button');
  openButton.className = 'configurator--open-button';
  openButton.setAttribute('type', 'button');
  openButton.setAttribute('aria-label', 'Настройки');

  openButton.addEventListener('click', () => {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  document.body.appendChild(openButton);

})();
