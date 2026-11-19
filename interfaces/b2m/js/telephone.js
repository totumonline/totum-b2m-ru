/**
 * Telephone
 * Формат телефона в полях ввода: +7 (000) 000-00-00
 * Формат применяется только к номерам с 7, +7 или 8 в начале и не длиннее 11 цифр, остальное остается как введено
 * Подключение: initTelephoneFormat(input) для поля, formatTelephone(value) для готового значения
 */

/**
 * Сборка формата из цифр значения
 */
function formatTelephone(value) {
  const digits = value.replace(/\D/g, '');

  if (!digits) return value; // цифр еще нет — набранный плюс оставляем как есть

  const isRussian = (digits[0] === '7' || digits[0] === '8') && digits.length <= 11;

  if (!isRussian) return value;

  const normalized = digits[0] === '8' ? '7' + digits.slice(1) : digits;

  const rest = normalized.slice(1, 11);

  let formatted = '+7';

  if (rest.length) formatted += ' (' + rest.slice(0, 3);
  if (rest.length > 3) formatted += ') ' + rest.slice(3, 6);
  if (rest.length > 6) formatted += '-' + rest.slice(6, 8);
  if (rest.length > 8) formatted += '-' + rest.slice(8, 10);

  return formatted;
}

/**
 * Положение каретки после указанного по счету числа цифр
 */
function telephoneCaretPosition(formatted, digitsCount) {
  if (digitsCount <= 0) return 0;

  let seen = 0;

  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] >= '0' && formatted[i] <= '9') {
      seen++;
      if (seen === digitsCount) return i + 1;
    }
  }

  return formatted.length;
}

/**
 * Форматирование поля при вводе с сохранением места каретки
 */
function initTelephoneFormat(input) {
  if (!input) return;

  input.addEventListener('input', () => {
    const caret = input.selectionStart === null ? input.value.length : input.selectionStart;
    const caretAtEnd = caret === input.value.length;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length; // цифры не добавляются и не убираются, счет совпадает

    const formatted = formatTelephone(input.value);

    if (formatted === input.value) return;

    input.value = formatted;

    const position = caretAtEnd ? formatted.length : telephoneCaretPosition(formatted, digitsBeforeCaret);
    input.setSelectionRange(position, position);
  });
}

window.formatTelephone = formatTelephone;
window.initTelephoneFormat = initTelephoneFormat;
