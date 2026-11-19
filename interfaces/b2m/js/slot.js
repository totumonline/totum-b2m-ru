/**
 * Scramble-анимация цифр
 * Каждая цифра в строке хаотически меняется, затем «приземляется» на финальное значение
 * Позиции фиксируются поочерёдно слева направо в течение duration
 */
function scrambleText(el, targetText, duration) {
  if (el._scrambleRaf) {
    cancelAnimationFrame(el._scrambleRaf);
    el._scrambleRaf = null;
  }

  const chars = targetText.split('');
  const len = chars.length;
  const locked = new Array(len).fill(false);
  const current = new Array(len);

  for (let i = 0; i < len; i++) {
    current[i] = /\d/.test(chars[i]) ? String(Math.floor(Math.random() * 10)) : chars[i];
  }

  const start = performance.now();
  const intervalPerChar = duration / (len + 1);

  function tick(now) {
    const elapsed = now - start;
    const lockCount = Math.floor(elapsed / intervalPerChar);

    for (let i = 0; i < len; i++) {
      if (i < lockCount && !locked[i]) {
        locked[i] = true;
        current[i] = chars[i];
      } else if (!locked[i] && /\d/.test(chars[i])) {
        current[i] = String(Math.floor(Math.random() * 10));
      }
    }

    el.textContent = current.join('');

    if (elapsed < duration) {
      el._scrambleRaf = requestAnimationFrame(tick);
    } else {
      el.textContent = targetText;
      el._scrambleRaf = null;
    }
  }

  el._scrambleRaf = requestAnimationFrame(tick);
}

/**
 * Установка текста или анимация через scrambleText
 * Идущая scramble-анимация прерывается, чтобы не перезаписать новое значение старым
 */
function setOrAnimate(el, text, animate) {
  if (el._scrambleRaf) {
    cancelAnimationFrame(el._scrambleRaf);
    el._scrambleRaf = null;
  }
  if (el.textContent === text) return;
  if (animate) {
    scrambleText(el, text, 400);
  } else {
    el.textContent = text;
  }
}
