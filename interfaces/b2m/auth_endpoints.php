<?php

use totum\common\errorException;


$post_url = '/' . trim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '', '/');

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

$endpoints_templates = [ // соответствие имени эндпойнта в url, ключа темплейта и типа возврата (json — массив в json, string — готовый html); все эндпойнты выполняются кодом действия
  'user' => ['template' => 'remote--user', 'return' => 'json'], // данные пользователя — отдаем массивом в json
];

$url_segments = explode('/', trim($post_url, '/')); // разбираем путь на сегменты
$endpoint_name = $url_segments[1] ?? ''; // второй сегмент пути — имя эндпойнта (/auth-endpoints/user)

if (!array_key_exists($endpoint_name, $endpoints_templates)) { // неизвестный эндпойнт — отдаем ошибку
  http_response_code(404);
  echo 'Эндпойнт не найден';
  exit;
}

$template_key = $endpoints_templates[$endpoint_name]['template']; // ключ темплейта для найденного эндпойнта
$return_type = $endpoints_templates[$endpoint_name]['return']; // тип ответа этого эндпойнта

// Выполнить темплейт

$interface_name = basename(__DIR__); // имя папки, в которой лежат исполняющиеся скрипты

$Vars = ['url'=>$post_url, 'post'=>$_POST, 'interface_name'=>$interface_name]; // создаем тотум-переменные для выполняющегося кода (url — путь, post — массив полей тела запроса, interface_name — имя папки скриптов)
$Table = $this->Totum->getTable('b2m___registered_templates'); // устанавливаем таблицу из которой он будет выполнятся (данные таблицы вне строчной части читаются полностью, поэтому используем пустую таблицу)

$totum_code = "

  =: exec(code: @b2m___registered_templates.template_code.interface_key['{$interface_name}--{$template_key}']; var: 'url' = $#url; var: 'post' = $#post; var: 'interface_name' = $#interface_name)

  "; // код-обертка тотума: достает код темплейта из таблицы и выполняет его через exec, передавая внутрь переменные

// Выполнить код действия Тотума

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
  $this->Totum->transactionRollback(); // откатываем транзакцию явно: exit ниже не дойдет до обработчика ошибок контроллера интерфейсов, который делает откат сам
  echo $e->getMessage();
  exit; // ответом ушел текст ошибки, идти дальше нельзя — $result не создан
}

if ($return_type === 'json') { // json-эндпойнт — шаблон возвращает массив, кодируем его как это делали Remotes с return=json
  $this->Totum->transactionCommit(); // фиксируем транзакцию до exit: контроллер интерфейсов коммитит уже после include этого файла, а exit до него не доходит — и все записи кода действия (в т.ч. set в calcs-таблицу цикла) откатились бы
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($result, JSON_UNESCAPED_UNICODE);
  exit;
}

echo $result;
