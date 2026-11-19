<?php

/**
 * Post Guard
 * Проверка post-параметров на длину ключей и значений
 * В отличие от get_guard на 404 не отправляет — post приходит из fetch, редирект на html-страницу там бесполезен,
 * поэтому отвечаем текстом ошибки, который морда покажет как есть
 * Подключение: require __DIR__ . '/post_guard.php'; guard_post_request($_POST);
 */
function guard_post_request(array $post): void
{
  $max_post_key_length = 50; // максимальная длина имени post-параметра — реальные имена короткие (login, pass), всё длиннее 50 это мусор
  $max_post_value_length = 300; // максимальная длина значения post-параметра — email, пароль и имя укладываются в 300 символов

  $max_post_value_length_exceptions = [ // параметры, значения которых длиннее общего лимита по своей природе
    'CAPCHA' => 10000, // одноразовый токен Яндекс SmartCaptcha — несколько килобайт
  ];

  $post_value_skip_check = [ // параметры, значения которых не проверяются на длину вообще — разбором и ограничениями занимается код эндпойнта
    'CART', // json корзины из localStorage — растет с числом позиций
    'SHA_LIST', // json-список sha удаляемых позиций корзины — растет с числом позиций
  ];

  $check_post_length = function ($data) use (&$check_post_length, $max_post_key_length, $max_post_value_length, $max_post_value_length_exceptions, $post_value_skip_check) { // рекурсивно тк значением может быть массив (fields[phone][]=...)
    foreach ($data as $key => $value) {
      if (mb_strlen((string)$key) > $max_post_key_length) {
        return true;
      }
      if (in_array((string)$key, $post_value_skip_check, true)) { // имя параметра проверили, значение пропускаем без проверки
        continue;
      }
      if (is_array($value)) {
        if ($check_post_length($value)) {
          return true;
        }
      } elseif (mb_strlen((string)$value) > ($max_post_value_length_exceptions[$key] ?? $max_post_value_length)) {
        return true;
      }
    }
    return false;
  };

  if ($check_post_length($post)) { // если в post есть слишком длинные ключи или значения — отвечаем ошибкой и дальше не идем
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Слишком длинные данные в запросе';
    exit;
  }
}
