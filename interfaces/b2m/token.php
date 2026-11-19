<?php

/**
 * Token
 * Обёртка витрины над ядровым /Auth/Token/{token}
 *
 * Ядро на этот адрес отвечает так:
 *   успех — 302 на стартовую страницу пользователя плюс Set-Cookie с новой сессией
 *   ошибка — 200 и голый текст (die с переводом), без редиректа
 *
 * Поэтому запрос к ядру делается курлом с этого же сервера, куки из ответа пробрасываются
 * браузеру как есть, а дальше витрина сама решает куда вести: успех — /account, ошибка — /auth
 *
 * Куки браузера в ядро НЕ передаются намеренно: при живой сессии ядро игнорирует токен
 * и авторизует того, кто уже в сессии
 */

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

$token_success_redirect = '/account'; // куда уводим после успешной авторизации по токену
$token_error_redirect = '/auth'; // куда уводим, если ядро отказало
$token_error_param = 'ERROR'; // имя get-параметра с текстом ошибки, его читает js морды авторизации
$token_error_max_length = 120; // лимит длины текста ошибки, такой же стоит в js
$token_default_error = 'Не удалось авторизоваться по ссылке. Попробуйте войти с логином и паролем.'; // текст, если ядро молчит

/**
 * Оставляет в тексте ошибки только буквы, пробел и . , !
 * Тот же белый список, что и в js морды авторизации: цифры, слеши, @ и + отбрасываются,
 * чтобы через адресную строку нельзя было показать пользователю ссылку или контакт
 */
function token_sanitize_error_text(string $text, int $max_length): string
{
  $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8'); // ядро может отдать текст внутри разметки
  $text = str_replace(['-', '—', "\r", "\n", "\t"], ' ', $text); // дефисы и переносы строк превращаем в пробел, иначе они просто выпадут и слова слипнутся
  $text = preg_replace('/[^a-zA-Zа-яА-ЯёЁ .,!]/u', '', $text);
  $text = preg_replace('/\s+/u', ' ', $text);

  return trim(mb_substr(trim($text), 0, $max_length));
}

/**
 * Запрос к ядровому /Auth/Token/{token} без следования за редиректом
 * Возвращает код ответа, заголовки Set-Cookie и тело
 */
function token_request_core(string $token): array
{
  $host = $_SERVER['HTTP_HOST'] ?? '';

  if (!preg_match('/^[a-zA-Z0-9.-]+(:\d+)?$/', $host)) { // хост из запроса подделываем нельзя — иначе курл ушёл бы на чужой адрес
    return ['status' => 0, 'cookies' => [], 'body' => ''];
  }

  $is_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
    || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;

  $ch = curl_init(($is_https ? 'https' : 'http') . '://' . $host . '/Auth/Token/' . rawurlencode($token));

  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true, // заголовки нужны ради Set-Cookie
    CURLOPT_FOLLOWLOCATION => false, // редирект ядра — это и есть признак успеха, идти по нему не надо
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_USERAGENT => $_SERVER['HTTP_USER_AGENT'] ?? 'bitum-token',
    CURLOPT_HTTPHEADER => ['X-Forwarded-For: ' . ($_SERVER['REMOTE_ADDR'] ?? ''), 'Accept: text/html'],
  ]);

  $answer = curl_exec($ch);

  if ($answer === false) {
    curl_close($ch);
    return ['status' => 0, 'cookies' => [], 'body' => ''];
  }

  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $header_size = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
  curl_close($ch);

  $head = substr($answer, 0, $header_size);
  $body = substr($answer, $header_size);
  $cookies = [];

  foreach (preg_split('/\r\n|\n/', $head) as $line) { // ядро может выставить несколько кук за раз
    if (preg_match('/^set-cookie:\s*(.+)$/i', trim($line), $match)) {
      $cookies[] = $match[1];
    }
  }

  return ['status' => $status, 'cookies' => $cookies, 'body' => (string)$body];
}

/**
 * Уводит на страницу авторизации с текстом ошибки
 * Переход делается js-ом со страницы витрины, а не заголовком Location, чтобы у /auth
 * был непустой referer нашего же хоста — без него морда авторизации текст не покажет
 */
function token_go_to_error(string $redirect, string $param, string $message): void
{
  $target = $redirect . '?' . $param . '=' . rawurlencode($message);

  header('Content-Type: text/html; charset=utf-8');

  echo '<!doctype html>' . PHP_EOL
    . '<html lang="ru">' . PHP_EOL
    . '<head>' . PHP_EOL
    . '<meta charset="utf-8">' . PHP_EOL
    . '<meta name="robots" content="noindex, nofollow">' . PHP_EOL
    . '<meta name="referrer" content="origin">' . PHP_EOL // в referer уйдёт только origin, токен из адреса не утечёт
    . '<title>Переход на страницу входа</title>' . PHP_EOL
    . '</head>' . PHP_EOL
    . '<body>' . PHP_EOL
    . '<script>window.location.replace(' . json_encode($target, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ');</script>' . PHP_EOL
    . '<noscript><a href="' . htmlspecialchars($target, ENT_QUOTES, 'UTF-8') . '">Перейти на страницу входа</a></noscript>' . PHP_EOL
    . '</body>' . PHP_EOL
    . '</html>';

  exit;
}

// Разобрать токен из адреса

$token = basename($get_url); // последний сегмент пути — сам токен (/token/abc123)

if ($token === '' || $token === 'token' || !preg_match('/^[a-zA-Z0-9-]{4,128}$/', $token)) { // мусор вместо токена до ядра не доносим
  token_go_to_error($token_error_redirect, $token_error_param, token_sanitize_error_text('Ссылка для входа неверна или устарела.', $token_error_max_length));
}

if (!function_exists('curl_init')) { // без курла обёртка работать не может
  token_go_to_error($token_error_redirect, $token_error_param, token_sanitize_error_text($token_default_error, $token_error_max_length));
}

// Спросить ядро и развести успех с ошибкой

$core_answer = token_request_core($token);

if ($core_answer['status'] >= 300 && $core_answer['status'] < 400) { // редирект ядра — сессия создана
  header_remove('Set-Cookie'); // убираем куку сессии витрины, вместо неё браузеру уходит сессия, выданная ядром

  foreach ($core_answer['cookies'] as $cookie) {
    header('Set-Cookie: ' . $cookie, false);
  }

  header('Location: ' . $token_success_redirect);
  exit;
}

$message = token_sanitize_error_text($core_answer['body'], $token_error_max_length); // ошибку ядро отдаёт голым текстом в теле ответа

token_go_to_error($token_error_redirect, $token_error_param, $message ?: token_sanitize_error_text($token_default_error, $token_error_max_length));
