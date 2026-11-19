<?php

/**
 * Get Guard
 * Проверка get-параметров на длину ключей и значений
 * Если есть слишком длинные — отправляем на 404
 * Подключение: require __DIR__ . '/get_guard.php'; guard_get_request($_GET);
 */
function guard_get_request(array $get): void
{
    $max_get_key_length = 50; // максимальная длина имени get-параметра — реальные имена короткие (page, sort, q), всё длиннее 50 это мусор
    $max_get_value_length = 300; // максимальная длина значения get-параметра — поисковые фразы и utm-метки укладываются в 300 символов

    $check_get_length = function ($data) use (&$check_get_length, $max_get_key_length, $max_get_value_length) { // рекурсивно тк значением может быть массив (filter[color][]=red)
        foreach ($data as $key => $value) {
            if (mb_strlen((string)$key) > $max_get_key_length) {
                return true;
            }
            if (is_array($value)) {
                if ($check_get_length($value)) {
                    return true;
                }
            } elseif (mb_strlen((string)$value) > $max_get_value_length) {
                return true;
            }
        }
        return false;
    };

    if ($check_get_length($get)) { // если в get есть слишком длинные ключи или значения — отправляем на 404
        header('Location: /404');
        exit;
    }
}
