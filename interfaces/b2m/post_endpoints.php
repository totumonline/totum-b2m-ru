<?php

use totum\common\errorException;


$post_url = '/' . trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '', '/');

/**
 * Ip посетителя
 * Берем только REMOTE_ADDR: заголовки X-Real-IP и X-Forwarded-For прокси не проставляет,
 * а значит их может прислать сам клиент с любым значением
 */
function get_post_request_ip(): string
{
  $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));

  return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
}

header('Content-Type: text/plain; charset=utf-8'); // post-эндпойнты вызываются из fetch — отвечаем текстом, а не html-страницей

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { // сюда можно ходить только post — иначе данные (пароль итп) окажутся в url и логах
  http_response_code(405);
  echo 'Метод не поддерживается';
  exit;
}

if (!preg_match('/^[a-zA-Z0-9\/-]+$/', $post_url)) { // в url допустимы только a-z A-Z 0-9 и - / — остальное отбиваем ошибкой
  http_response_code(404);
  echo 'Эндпойнт не найден';
  exit;
}

require __DIR__ . '/post_guard.php'; // подключаем guard длины post-параметров
guard_post_request($_POST); // если в post есть слишком длинные ключи или значения — внутри ответ ошибкой и exit

// Определить темплейт и тип ответа по имени эндпойнта

$endpoints_templates = [ // соответствие имени эндпойнта в url, ключа темплейта, типа возврата (json — массив в json, string — готовый html) и типа выполнения (code — код Тотума, action — код действия, по умолчанию code)
  'signup' => ['template' => 'remote--signup', 'return' => 'string', 'exec' => 'action'], // код действия — регистрация создает строки и отправляет письмо
  'cart' => ['template' => 'remote--cart', 'return' => 'string'], // html панели корзины — в $#post.CART приходит json корзины из localStorage
  'cartDelivery' => ['template' => 'remote--cart-delivery', 'return' => 'string', 'exec' => 'action'], // код действия — расчет доставки корзины; в $#post.CART приходит json корзины с exclude у исключенных позиций, в $#post.CITY — uid города
  'createCheckout' => ['template' => 'remote--create-checkout', 'return' => 'json', 'exec' => 'action'], // код действия — создание заказа пишет строки; в $#post.CART приходит json корзины без исключенных позиций, ответ — {checkout: номер} или {error: текст}
  'checkout' => ['template' => 'remote--checkout', 'return' => 'json', 'exec' => 'action'], // код действия — операции с чекаутом, операция в $#url (/post-endpoints/checkout/getDeliveryMethods), номер чекаута в $#post.CHECKOUT_NUM
  'secureFiles' => ['template' => 'remote--secure-files', 'return' => 'string', 'exec' => 'action'],
  'getCity' => ['template' => 'remote--get-city', 'return' => 'json', 'exec' => 'action'], // код действия — определение города по ip посетителя из $#user_ip, ответ — {fias_id, city, address}
  'getWarehouses' => ['template' => 'remote--get-warehouses', 'return' => 'json'], // склады товара для ---buy-box--in-stock--warehouse с __request; в $#post.SKU — id sku, $#post.CITY — uid города (data-city-id у ---delivery--city, без него запрос не уходит), $#post.ALL=true — все склады (панель «Наличие» по ---warehouse--more button), ответ — {html: li складов, more: true/false}, текст без ключа html — ошибка
];

$url_segments = explode('/', trim($post_url, '/')); // разбираем путь на сегменты
$endpoint_name = $url_segments[1] ?? ''; // второй сегмент пути — имя эндпойнта (/post-endpoints/signup, /post-endpoints/checkout/getDeliveryMethods)

if (!array_key_exists($endpoint_name, $endpoints_templates)) { // неизвестный эндпойнт — отдаем ошибку
  http_response_code(404);
  echo 'Эндпойнт не найден';
  exit;
}

$template_key = $endpoints_templates[$endpoint_name]['template']; // ключ темплейта для найденного эндпойнта
$return_type = $endpoints_templates[$endpoint_name]['return']; // тип ответа этого эндпойнта
$exec_type = $endpoints_templates[$endpoint_name]['exec'] ?? 'code'; // чем выполнять темплейт — кодом или кодом действия

// Выполнить темплейт

$interface_name = basename(__DIR__); // имя папки, в которой лежат исполняющиеся скрипты

$user_ip = get_post_request_ip(); // ip посетителя — нужен проверке капчи и логам внутри темплета

$Vars = ['url'=>$post_url, 'post'=>$_POST, 'interface_name'=>$interface_name, 'user_ip'=>$user_ip]; // создаем тотум-переменные для выполняющегося кода (url — путь, post — массив полей тела запроса, interface_name — имя папки скриптов, user_ip — ip посетителя)
$Table = $this->Totum->getTable('b2m___registered_templates'); // устанавливаем таблицу из которой он будет выполнятся (данные таблицы вне строчной части читаются полностью, поэтому используем пустую таблицу)

$totum_code = "

  =: exec(code: @b2m___registered_templates.template_code.interface_key['{$interface_name}--{$template_key}']; var: 'url' = $#url; var: 'post' = $#post; var: 'interface_name' = $#interface_name; var: 'user_ip' = $#user_ip)

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

    $this->Totum->transactionCommit(); // фиксируем транзакцию сразу после кода действия: контроллер интерфейсов коммитит уже после include этого файла, а ниже стоит exit, который до него не доходит — и все записи (в т.ч. set в calcs-таблицу цикла) откатились бы

  } catch (Exception $e) { // ловим ошибку
    $this->Totum->transactionRollback(); // откатываем транзакцию явно: exit ниже не дойдет до обработчика ошибок контроллера интерфейсов, который делает откат сам
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

if ($return_type === 'json') { // json-эндпойнт — шаблон возвращает массив, кодируем его как это делали Remotes с return=json
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($result, JSON_UNESCAPED_UNICODE);
  exit;
}

echo $result;
