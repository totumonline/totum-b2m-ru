<?php

use totum\common\errorException;

$seo_host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]); // хост как $host в nginx — без порта и в нижнем регистре
$seo_redirects_file = dirname(__DIR__, 2) . "/http/seo/{$seo_host}/redirects.php"; // редиректы хоста лежат рядом с его robots.txt и sitemap.xml
if (preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)*$/', $seo_host) && is_file($seo_redirects_file)) { // хост проверяем, чтобы из заголовка нельзя было выйти за папку seo; файла может не быть у хоста без редиректов
  require $seo_redirects_file; // если адрес в списке редиректов — внутри 301 на новый адрес
}

$get_url = '/' . trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '', '/');

if (!preg_match('/^[a-z0-9\/-]+$/', $get_url)) { // в url допустимы только a-z 0-9 и - / — остальное отправляем на 404
    header('Location: /404');
    exit;
}

require __DIR__ . '/get_guard.php'; // подключаем guard длины get-параметров
guard_get_request($_GET); // если в get есть слишком длинные ключи или значения — внутри редирект на /404

// Выполнить код Тотума

$interface_name = basename(__DIR__); // имя папки, в которой лежат исполняющиеся скрипты

$Vars = ['url'=>$get_url, 'get'=>$_GET, 'interface_name'=>$interface_name]; // создаем тотум-переменные для выполняющегося кода (url — путь, get — массив GET-параметров адресной строки, interface_name — имя папки скриптов)
$Table = $this->Totum->getTable('b2m___registered_templates'); // устанавливаем таблицу из которой он будет выполнятся (данные таблицы вне строчной части читаются полностью, поэтому используем пустую таблицу)

try { // tryCatch делаем что бы получить ошибку если будет
    $CA = new totum\common\calculates\Calculate("

    =: exec(code: @b2m___registered_templates.template_code.interface_key['{$interface_name}--marker']; var: 'url' = $#url; var: 'get' = $#get; var: 'interface_name' = $#interface_name)

    "); // вызываем Calculate и передаем ему код тотума

    $result = $CA->exec( // получаем данные из созданного выше жлемента из exec внутри него ответ, передавая параметры дальше 
                    ['name'=>'exec'], // это устанавливается name поля для системы логгирования итп, это поле не обязательно должно существовать
                    [], // это текущее значение, но это не точно
                    [], // это предыдущее значение но, но это не точно
                    [], // это еще что-то
                    $Table->getTbl(), // это передается структура текущей таблицы
                    $Table->getTbl(), // и это тоже
                    $Table, // и это просто такие слова в заклинании
                    $Vars // и последними передаются переменные
                );

} catch (Exception $e) { // ловим ошибку
    echo $e->getMessage();
    exit; // ответом ушел текст ошибки, идти дальше нельзя — $result не создан
}

if (str_starts_with((string)$result, '404')) { // если ответ начинается с 404 — редирект на /404
    header('Location: /404');
    exit;
}

echo $result;

