<?php

use totum\common\errorException;

$seo_host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]); // хост как $host в nginx — без порта и в нижнем регистре
$seo_redirects_file = dirname(__DIR__, 2) . "/http/seo/{$seo_host}/redirects.php"; // редиректы хоста лежат рядом с его robots.txt и sitemap.xml
if (preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)*$/', $seo_host) && is_file($seo_redirects_file)) { // хост проверяем, чтобы из заголовка нельзя было выйти за папку seo; файла может не быть у хоста без редиректов
  require $seo_redirects_file; // если адрес в списке редиректов — внутри 301 на новый адрес
}

$get_url = '/' . trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '', '/');

if (!preg_match('/^[a-zA-Z0-9\/-]+$/', $get_url)) { // в url допустимы только a-z A-Z 0-9 и - / — остальное отправляем на 404
  header('Location: /404');
  exit;
}

require __DIR__ . '/get_guard.php'; // подключаем guard длины get-параметров
guard_get_request($_GET); // если в get есть слишком длинные ключи или значения — внутри редирект на /404

// Определить темплейт и тип ответа по имени эндпойнта

$endpoints_templates = [ // соответствие имени эндпойнта в url, ключа темплейта, типа возврата (json — массив в json, string — готовый html) и типа выполнения (code — код Тотума, action — код действия, по умолчанию code)
  'getFitredCatalogItems' => ['template' => 'remote--get-fitred-catalog-items', 'return' => 'json'],
  'getPageItems' => ['template' => 'remote--get-page-items', 'return' => 'json'],
  'getBrandsItems' => ['template' => 'remote--get-brands-items', 'return' => 'json'],
  'getSkuData' => ['template' => 'remote--get-sku-data', 'return' => 'json'],
  'getRandomItems' => ['template' => 'remote--get-random-items', 'return' => 'string'],
  'getRecentItems' => ['template' => 'remote--get-recent-items', 'return' => 'string'],
  'getSearchItems' => ['template' => 'remote--get-search-items', 'return' => 'json'],
  'getMoreSearchItems' => ['template' => 'remote--get-more-search-items', 'return' => 'json'],
  'getMoreFavoriteItems' => ['template' => 'remote--get-more-favorite-items', 'return' => 'json'],
  'getSearchCities' => ['template' => 'remote--get-search-cities', 'return' => 'string'],
  'sendAuthToken' => ['template' => 'remote--send-auth-token', 'return' => 'string', 'exec' => 'action'], // код действия — в обычном коде недоступны notificationSend и прочие функции действий
  'whoami' => ['template' => 'remote--whoami', 'return' => 'json'],
  'yandexCapcha' => ['template' => 'remote--yandex-capcha', 'return' => 'string'],
  'product' => ['template' => 'remote--product', 'return' => 'string'],
  'promoDescription' => ['template' => 'remote--promo-description', 'return' => 'string'],
  'getWarehouse' => ['template' => 'remote--get-warehouse', 'return' => 'string'], // информация по складу для панели «Размещение» (клик по li в ---buy-box--in-stock--warehouse); в $#get.INDEX — data-warehouse-index li, ответ — готовый html
];

$endpoint_name = basename($get_url); // последний сегмент пути — имя эндпойнта (/get-endpoints/getFitredCatalogItems)

if (!array_key_exists($endpoint_name, $endpoints_templates)) { // неизвестный эндпойнт — отдаем 404
  header('Location: /404');
  exit;
}

$template_key = $endpoints_templates[$endpoint_name]['template']; // ключ темплейта для найденного эндпойнта
$return_type = $endpoints_templates[$endpoint_name]['return']; // тип ответа этого эндпойнта
$exec_type = $endpoints_templates[$endpoint_name]['exec'] ?? 'code'; // чем выполнять темплейт — кодом или кодом действия

// Выполнить темплейт

$interface_name = basename(__DIR__); // имя папки, в которой лежат исполняющиеся скрипты

$Vars = ['url'=>$get_url, 'get'=>$_GET, 'interface_name'=>$interface_name]; // создаем тотум-переменные для выполняющегося кода (url — путь, get — массив GET-параметров адресной строки, interface_name — имя папки скриптов)
$Table = $this->Totum->getTable('b2m___registered_templates'); // устанавливаем таблицу из которой он будет выполнятся (данные таблицы вне строчной части читаются полностью, поэтому используем пустую таблицу)

$totum_code = "

  =: exec(code: @b2m___registered_templates.template_code.interface_key['{$interface_name}--{$template_key}']; var: 'url' = $#url; var: 'get' = $#get; var: 'interface_name' = $#interface_name)

  "; // код-обертка тотума: достает код темплейта из таблицы и выполняет его через exec, передавая внутрь переменные

if ($exec_type === 'action') { // Выполнить код действия Тотума

  try { // tryCatch делаем что бы получить ошибку если будет
    $CA = new totum\common\calculates\CalculateAction($totum_code); // вызываем CalculateAction — он же выполнит и код темплейта как код действия (внутри exec создается такой же CalculateAction)

    $result = $CA->execAction( // получаем данные из созданного выше элемента из exec внутри него ответ, передавая параметры дальше
            'exec', // это устанавливается name поля для системы логгирования итп, это поле не обязательно должно существовать (execAction ждет строку и сам оборачивает ее в ['name'=>...])
            [], // это предыдущая строка, но это не точно
            [], // это текущая строка, но это не точно
            $Table->getTbl(), // это передается структура текущей таблицы
            $Table->getTbl(), // и это тоже
            $Table, // и это просто такие слова в заклинании
            'exec', // тип действия — не add/delete/change/click, а именно вызов кода
            $Vars // и последними передаются переменные
          );

  } catch (Exception $e) { // ловим ошибку
    echo $e->getMessage();
    exit; // ответом ушел текст ошибки, идти дальше нельзя — $result не создан
  }

} else { // Выполнить код Тотума

  try { // tryCatch делаем что бы получить ошибку если будет
    $CA = new totum\common\calculates\Calculate($totum_code); // вызываем Calculate и передаем ему код тотума

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

}

if ($return_type === 'json') { // json-эндпойнт — шаблон возвращает массив (html/more итп), кодируем его как это делали Remotes с return=json
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($result, JSON_UNESCAPED_UNICODE);
  exit;
}

if (str_starts_with((string)$result, '404')) { // string-эндпойнт: если ответ начинается с 404 — редирект на /404
  header('Location: /404');
  exit;
}

echo $result;
