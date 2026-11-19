<?php

use totum\common\errorException;

$CalculateExtensions = new \stdClass();
$CalculateExtensions->jsTemplates = '[
  {"name":"extTidy","t":"(html: \"\")","d":false,"p":["html"],"m":[],"n":["html"]},
  {"name":"extGetElement","t":"(interface: \"\"; file: \"\"; public: )","d":false,"p":["interface","file","public"],"m":[],"n":["interface","file"]},
  {"name":"extSanitize","t":"(html: \"\"; json: \"\"; allow: )","d":false,"p":["html","json","allow"],"m":[],"n":["html","json"]},
  {"name":"extGetRandomProducts","t":"(limit: ; fields: ; categories: ; productid: )","d":false,"p":["limit","fields","categories","productid"],"m":[],"n":["limit","fields","categories","productid"]},
  {"name":"extSelectRowListByArray","t":"(limit: ; fields: ; productid: )","d":false,"p":["limit","fields","productid"],"m":[],"n":["limit","fields","productid"]},
  {"name":"extTrgmSearch","t":"(search: \"\"; cats: ; secondstring: \"\"; active: ; tables: ; limit: ; offset: ; order_by: \"\")","d":false,"p":["search","cats","secondstring","active","tables","limit","offset","order_by"],"m":[],"n":["search","cats"]},
  {"name":"extUid","t":"()","d":false,"p":[],"m":[],"n":[]},
  {"name":"extSHA256","t":"(str: \"\")","d":false,"p":["str"],"m":[],"n":["str"]},
  {"name":"extBase64Url","t":"(str: \"\"; hex: )","d":false,"p":["str","hex"],"m":[],"n":["str"]},
  {"name":"extSitemap","t":"(host: \"\"; url: \"\"; lastmod: \"\"; old: \"\"; delete: false)","d":false,"p":["host","url","lastmod","old","delete"],"m":[],"n":["host","url","lastmod","old"]},
  {"name":"extRedirects","t":"(host: \"\"; rid: \"\"; to: \"\"; from: ; delete: false)","d":false,"p":["host","rid","to","from","delete"],"m":[],"n":["host","rid","to","from"]}
]';

$CalculateExtensions->extUid = function ($params) {
  $bytes = random_bytes(16);
  $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
  $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
};

$CalculateExtensions->extSHA256 = function ($params) {
  $params = $this->getParamsArray($params);

  if (!array_key_exists('str', $params)) {
    throw new errorException('Параметр str обязателен');
  }
  if (is_array($params['str'])) {
    throw new errorException('Параметр str должен быть строкой');
  }

  return hash('sha256', (string)$params['str']);
};

$CalculateExtensions->extBase64Url = function ($params) {
  $params = $this->getParamsArray($params);
  if (!array_key_exists('str', $params)) {
    throw new errorException('Параметр str обязателен');
  }
  if (is_array($params['str'])) {
    throw new errorException('Параметр str должен быть строкой');
  }
  $str = (string)$params['str'];
  if (filter_var($params['hex'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
    if (strlen($str) % 2 !== 0 || ($str !== '' && !ctype_xdigit($str))) {
      throw new errorException('Параметр str должен быть hex-строкой');
    }
    $str = hex2bin($str);
  }
  return rtrim(strtr(base64_encode($str), '+/', '-_'), '=');
};

$CalculateExtensions->extSitemap = function ($params) {
  $params = $this->getParamsArray($params);

  $this->__checkRequiredParams($params, ['host', 'url', 'lastmod', 'old'], 'extSitemap');

  foreach (['host', 'url', 'lastmod', 'old'] as $name) {
    if (is_array($params[$name])) {
      throw new errorException('Параметр ' . $name . ' должен быть строкой');
    }
  }

  $host = strtolower(trim((string)$params['host']));
  if (!preg_match('#^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$#', $host)) {
    throw new errorException('Недопустимое значение host');
  }

  $checkUrl = function ($value, $name) {
    if (!preg_match('#^/[^\s<>"\'\x00-\x1f\x7f]*$#', $value)) {
      throw new errorException('Параметр ' . $name . ' должен начинаться с / и не содержать пробелов и спецсимволов');
    }
  };

  $url = trim((string)$params['url']);
  $checkUrl($url, 'url');

  $old = trim((string)$params['old']);
  if ($old !== '') {
    $checkUrl($old, 'old');
  }

  $delete = false;
  if (isset($params['delete'])) {
    $delete = is_array($params['delete']) ? null : filter_var($params['delete'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($delete === null) {
      throw new errorException('Параметр delete должен быть true или false');
    }
  }

  $lastmod = trim((string)$params['lastmod']);
  if ($lastmod !== '' && !preg_match('#^\d{4}-\d{2}-\d{2}$#', $lastmod)) {
    try {
      $lastmod = (new \DateTimeImmutable($lastmod))->format(DATE_W3C);
    } catch (\Exception $e) {
      throw new errorException('Недопустимое значение lastmod');
    }
  }

  $dir = __DIR__ . '/http/seo/' . $host;
  if (!is_dir($dir)) {
    throw new errorException('Папка для host не найдена: ' . $host);
  }
  $path = $dir . '/sitemap.xml';

  $fh = fopen($path, 'c+');
  if (!$fh) {
    throw new errorException('Не удалось открыть sitemap.xml для host: ' . $host);
  }

  try {
    if (!flock($fh, LOCK_EX)) {
      throw new errorException('Не удалось заблокировать sitemap.xml для host: ' . $host);
    }

    $content = stream_get_contents($fh);
    if (trim($content) === '') {
      $content = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
        . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n"
        . '</urlset>';
    }

    $closePos = strrpos($content, '</urlset>');
    if ($closePos === false) {
      throw new errorException('В sitemap.xml не найден закрывающий тег </urlset>');
    }

    $locPrefix = 'https://' . $host;
    $removeLocs = [$locPrefix . $url];
    if ($old !== '') {
      $removeLocs[] = $locPrefix . $old;
    }

    $content = preg_replace_callback('#\s*<url>(.*?)</url>#s', function ($m) use ($removeLocs) {
      if (preg_match('#<loc>\s*(.*?)\s*</loc>#s', $m[1], $loc)
        && in_array(html_entity_decode($loc[1], ENT_QUOTES | ENT_XML1, 'UTF-8'), $removeLocs, true)) {
        return '';
      }
      return $m[0];
    }, $content);

    $closePos = strrpos($content, '</urlset>');
    $block = $delete ? "\n" : "\n  <url>\n"
      . '    <loc>' . htmlspecialchars($locPrefix . $url, ENT_QUOTES | ENT_XML1, 'UTF-8') . "</loc>\n"
      . ($lastmod !== '' ? '    <lastmod>' . htmlspecialchars($lastmod, ENT_QUOTES | ENT_XML1, 'UTF-8') . "</lastmod>\n" : '')
      . "  </url>\n";
    $content = rtrim(substr($content, 0, $closePos)) . $block . substr($content, $closePos);

    ftruncate($fh, 0);
    rewind($fh);
    if (fwrite($fh, $content) === false) {
      throw new errorException('Не удалось записать sitemap.xml для host: ' . $host);
    }
    fflush($fh);
  } finally {
    flock($fh, LOCK_UN);
    fclose($fh);
  }

  return true;
};

$CalculateExtensions->extRedirects = function ($params) {
  $params = $this->getParamsArray($params);

  $this->__checkRequiredParams($params, ['host', 'rid'], 'extRedirects');

  foreach (['host', 'rid', 'to'] as $name) {
    if (isset($params[$name]) && is_array($params[$name])) {
      throw new errorException('Параметр ' . $name . ' должен быть строкой');
    }
  }

  $host = strtolower(trim((string)$params['host']));
  if (!preg_match('#^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$#', $host)) {
    throw new errorException('Недопустимое значение host');
  }

  $rid = trim((string)$params['rid']);
  if (!preg_match('#^\d+-\d+$#', $rid)) {
    throw new errorException('Параметр rid должен быть вида 3-15');
  }

  $delete = false;
  if (isset($params['delete'])) {
    $delete = is_array($params['delete']) ? null : filter_var($params['delete'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($delete === null) {
      throw new errorException('Параметр delete должен быть true или false');
    }
  }

  $normalizeUrl = function ($value, $name) {
    $value = trim((string)$value);
    if (!preg_match('#^/[^\s<>"\'?\#\\\\\x00-\x1f\x7f]*$#', $value)) {
      throw new errorException('Параметр ' . $name . ' должен начинаться с / и не содержать пробелов, get-параметров и спецсимволов');
    }
    return '/' . trim($value, '/');
  };

  $to = trim((string)($params['to'] ?? ''));
  $from = [];
  if (!$delete && $to !== '') {
    $to = $normalizeUrl($to, 'to');

    $fromList = $params['from'] ?? [];
    $this->__checkListParam($fromList, 'from');
    foreach ($fromList as $value) {
      if (is_array($value)) {
        throw new errorException('Недопустимое значение в параметре from');
      }
      if (trim((string)$value) === '') {
        continue;
      }
      $value = $normalizeUrl($value, 'from');
      if ($value === $to) {
        throw new errorException('Адрес ' . $value . ' в from совпадает с to');
      }
      $from[$value] = true;
    }
    $from = array_keys($from);
  }

  $dir = __DIR__ . '/http/seo/' . $host;
  $path = $dir . '/redirects.php';
  if (!is_file($path)) {
    throw new errorException('Файл redirects.php для host не найден: ' . $host);
  }

  $lock = fopen($dir . '/.redirects.lock', 'c');
  if (!$lock || !flock($lock, LOCK_EX)) {
    throw new errorException('Не удалось заблокировать redirects.php для host: ' . $host);
  }

  try {
    $lines = preg_split('#\R#', (string)file_get_contents($path));

    $start = null;
    $end = null;
    foreach ($lines as $i => $line) {
      if ($start === null) {
        if (preg_match('#^\s*\$redirects\s*=\s*\[#', $line)) {
          $start = $i;
        }
      } elseif (preg_match('#^\s*\];#', $line)) {
        $end = $i;
        break;
      }
    }
    if ($end === null) {
      throw new errorException('В redirects.php не найден массив $redirects');
    }

    $kept = [];
    foreach (array_slice($lines, $start + 1, $end - $start - 1) as $line) {
      if (preg_match('#//\s*rid:\s*(\S+)\s*$#', $line, $m) && $m[1] === $rid) {
        continue;
      }
      if ($from && preg_match("#^\s*'((?:[^'\\\\]|\\\\.)*)'\s*=>#", $line, $m)) {
        $key = strtr($m[1], ['\\\\' => '\\', "\\'" => "'"]);
        if (in_array($key, $from, true)) {
          throw new errorException('Адрес ' . $key . ' уже используется в другом редиректе: ' . trim($line));
        }
      }
      $kept[] = $line;
    }

    foreach ($from as $value) {
      $kept[] = '    ' . var_export($value, true) . ' => ' . var_export($to, true) . ', // rid: ' . $rid;
    }

    $content = implode("\n", array_merge(array_slice($lines, 0, $start + 1), $kept, array_slice($lines, $end)));

    $tmp = tempnam($dir, '.redirects');
    if ($tmp === false || file_put_contents($tmp, $content) === false || !chmod($tmp, fileperms($path) & 0777) || !rename($tmp, $path)) {
      if ($tmp !== false) {
        @unlink($tmp);
      }
      throw new errorException('Не удалось записать redirects.php для host: ' . $host);
    }
    if (function_exists('opcache_invalidate')) {
      opcache_invalidate($path, true);
    }
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }

  return true;
};

$CalculateExtensions->extTidy = function ($params) {
  $params = $this->getParamsArray($params);

  if (empty($params['html'])) {
    throw new errorException('Параметр html обязателен');
  }

  $html = $params['html'];

  $config = [
    'indent' => 'auto',
    'quiet' => true,
    'show-body-only' => true,
    'wrap' => 0,
    'indent-spaces' => 2,
    'drop-empty-elements' => false,
    'vertical-space' => true,
  ];

  $tidy = new \tidy();
  $tidy->parseString($html, $config, 'utf8');
  $tidy->cleanRepair();

  return (string)$tidy;
};

$CalculateExtensions->extGetElement = function ($params) {
  $params = $this->getParamsArray($params);

  if (empty($params['interface'])) {
    throw new errorException('Параметр interface обязателен');
  }
  if (empty($params['file'])) {
    throw new errorException('Параметр file обязателен');
  }

  $interface = $params['interface'];
  $file = $params['file'];

  if (!preg_match('#^[a-z0-9]+$#', $interface)) {
    throw new errorException('Недопустимое имя interface');
  }
  if (preg_match('#(^|/)\.\.(/|$)#', $file)) {
    throw new errorException('Недопустимый путь');
  }

  $folder = !empty($params['public']) ? 'public' : 'elements';

  $path = '../interfaces/' . $interface . '/' . $folder . '/' . $file;

  if (!file_exists($path) || !is_readable($path)) {
    throw new errorException('Файл не найден или недоступен для чтения: ' . $path);
  }

  return (string)file_get_contents($path);
};

$CalculateExtensions->extSanitize = function ($params) {
  $params = $this->getParamsArray($params);

  $hasHtml = isset($params['html']);
  $hasJson = isset($params['json']);

  $provided = (int)$hasHtml + (int)$hasJson;
  if ($provided === 0) {
    return array_key_exists('json', $params) ? null : '';
  }
  if ($provided > 1) {
    throw new errorException('Параметры html и json взаимоисключающие');
  }

  $dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'frame', 'frameset', 'applet', 'noscript', 'svg', 'math'];
  $dangerousUrlAttrs = ['href', 'src', 'xlink:href', 'action', 'formaction', 'background', 'poster'];

  if (isset($params['allow'])) {
    $allow = $params['allow'];
    $this->__checkListParam($allow, 'allow');

    $allowedTags = [];
    foreach ($allow as $tag) {
      if (is_array($tag)) {
        throw new errorException('Недопустимое значение в параметре allow');
      }
      $tag = strtolower(trim((string)$tag));
      if ($tag !== '') {
        $allowedTags[] = $tag;
      }
    }
    $dangerousTags = array_values(array_diff($dangerousTags, $allowedTags));
  }

  $sanitizeHtml = function ($value) use ($dangerousTags, $dangerousUrlAttrs) {
    $html = (string)$value;
    if ($html === '') {
      return '';
    }

    $dom = new \DOMDocument('1.0', 'UTF-8');
    $previous = libxml_use_internal_errors(true);
    $wrapped = '<?xml encoding="UTF-8"?><div>' . $html . '</div>';
    $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);

    $xpath = new \DOMXPath($dom);

    if ($dangerousTags) {
      $tagQuery = '//' . implode('|//', $dangerousTags);
      $nodes = iterator_to_array($xpath->query($tagQuery));
      foreach ($nodes as $node) {
        if ($node->parentNode) {
          $node->parentNode->removeChild($node);
        }
      }
    }

    foreach ($xpath->query('//*') as $node) {
      if (!$node instanceof \DOMElement) {
        continue;
      }
      $attrsToRemove = [];
      foreach ($node->attributes as $attr) {
        $name = strtolower($attr->name);
        if (strpos($name, 'on') === 0) {
          $attrsToRemove[] = $attr->name;
          continue;
        }
        if (in_array($name, $dangerousUrlAttrs, true)) {
          $clean = strtolower(preg_replace('/\s+/', '', $attr->value));
          if (strpos($clean, 'javascript:') === 0 || strpos($clean, 'vbscript:') === 0 || strpos($clean, 'data:text/html') === 0) {
            $attrsToRemove[] = $attr->name;
          }
        }
      }
      foreach ($attrsToRemove as $a) {
        $node->removeAttribute($a);
      }
    }

    $wrapper = $dom->getElementsByTagName('div')->item(0);
    $result = '';
    if ($wrapper) {
      foreach ($wrapper->childNodes as $child) {
        $result .= $dom->saveHTML($child);
      }
    }

    return $result;
  };

  $sanitizeJson = function ($value) use (&$sanitizeJson, $sanitizeHtml) {
    if (is_array($value)) {
      $clean = [];
      foreach ($value as $key => $item) {
        $clean[$key] = $sanitizeJson($item);
      }
      return $clean;
    }
    if (is_string($value)) {
      return $sanitizeHtml($value);
    }
    return $value;
  };

  if ($hasHtml) {
    return $sanitizeHtml($params['html']);
  }

  return $sanitizeJson($params['json']);
};

$CalculateExtensions->extGetRandomProducts = function ($params) {
  $params = $this->getParamsArray($params);

  $this->__checkRequiredParams($params, ['limit', 'fields', 'categories', 'productid'], 'extGetRandomProducts');
  $this->__checkNumericParam($params['limit'], 'limit');
  $this->__checkNumericParam($params['productid'], 'productid');

  $fields = $params['fields'];
  $categories = $params['categories'];
  $this->__checkListParam($fields, 'fields');

  $allCategories = ($categories === '*ALL*');
  if (!$allCategories) {
    $this->__checkListParam($categories, 'categories');
  }

  if (empty($fields)) {
    throw new errorException('Параметр fields не должен быть пустым');
  }
  if (!$allCategories && empty($categories)) {
    throw new errorException('Параметр categories не должен быть пустым');
  }

  foreach ($fields as $field) {
    if (!is_string($field) || !preg_match('#^[a-z_][a-z0-9_]*$#i', $field)) {
      throw new errorException('Недопустимое имя поля: ' . (is_array($field) ? 'list' : (string)$field));
    }
  }

  if (!$allCategories) {
    foreach ($categories as $category) {
      if (is_array($category) || !ctype_digit((string)$category)) {
        throw new errorException('Недопустимый идентификатор категории: ' . (is_array($category) ? 'list' : (string)$category));
      }
    }
  }

  $limit = (int)$params['limit'];
  $productId = (int)$params['productid'];

  $serviceFields = ['id', 'is_del', 'n'];

  $Sql = $this->Table->getTotum()->getConfig()->getSql();

  $selectFields = implode(', ', array_map(function ($field) use ($serviceFields) {
    if (in_array($field, $serviceFields, true)) {
      return '"' . $field . '"';
    }
    return '"' . $field . '"->\'v\' as "' . $field . '"';
  }, $fields));

  $execParams = [':productid' => $productId];
  $categoryCondition = '';
  if (!$allCategories) {
    $categoryPlaceholders = [];
    foreach (array_values($categories) as $i => $category) {
      $placeholder = ':cat' . $i;
      $categoryPlaceholders[] = $placeholder;
      $execParams[$placeholder] = (string)$category;
    }
    $categoryCondition = ' and exists ('
      . ' select 1 from jsonb_array_elements_text(all_categories->\'v\') as ac'
      . ' where ac.value in (' . implode(', ', $categoryPlaceholders) . ')'
      . ' )';
  }

  $query = 'select ' . $selectFields
    . ' from b2m___items'
    . ' where (active->>\'v\') = \'true\''
    . ' and (in_stock->>\'v\') = \'Y\''
    . ' and id != :productid'
    . $categoryCondition
    . ' order by random()'
    . ' limit ' . $limit;

  $prepare = $Sql->getPrepared($query);
  $prepare->execute($execParams);
  $rows = $prepare->fetchAll(\PDO::FETCH_ASSOC);

  foreach ($rows as &$row) {
    foreach ($row as $key => $value) {
      if (in_array($key, $serviceFields, true)) {
        continue;
      }
      $row[$key] = $value === null ? null : json_decode($value, true);
    }
  }
  unset($row);

  return $rows;
};

$CalculateExtensions->extSelectRowListByArray = function ($params) {
  $params = $this->getParamsArray($params);

  $this->__checkRequiredParams($params, ['limit', 'fields', 'productid'], 'extSelectRowListByArray');
  $this->__checkNumericParam($params['limit'], 'limit');

  $fields = $params['fields'];
  $productIds = $params['productid'];
  $this->__checkListParam($fields, 'fields');
  $this->__checkListParam($productIds, 'productid');

  if (empty($fields)) {
    throw new errorException('Параметр fields не должен быть пустым');
  }
  if (empty($productIds)) {
    throw new errorException('Параметр productid не должен быть пустым');
  }

  foreach ($fields as $field) {
    if (!is_string($field) || !preg_match('#^[a-z_][a-z0-9_]*$#i', $field)) {
      throw new errorException('Недопустимое имя поля: ' . (is_array($field) ? 'list' : (string)$field));
    }
  }

  foreach ($productIds as $productId) {
    if (is_array($productId) || !ctype_digit((string)$productId)) {
      throw new errorException('Недопустимый идентификатор товара: ' . (is_array($productId) ? 'list' : (string)$productId));
    }
  }

  $limit = (int)$params['limit'];
  $ids = array_map('intval', array_values($productIds));
  $idsList = implode(', ', $ids);

  $serviceFields = ['id', 'is_del', 'n'];

  $Sql = $this->Table->getTotum()->getConfig()->getSql();

  $selectFields = implode(', ', array_map(function ($field) use ($serviceFields) {
    if (in_array($field, $serviceFields, true)) {
      return '"' . $field . '"';
    }
    return '"' . $field . '"->\'v\' as "' . $field . '"';
  }, $fields));

  $query = 'select ' . $selectFields
    . ' from b2m___items'
    . ' where (active->>\'v\') = \'true\''
    . ' and id in (' . $idsList . ')'
    . ' order by array_position(array[' . $idsList . '], id)'
    . ' limit ' . $limit;

  $prepare = $Sql->getPrepared($query);
  $prepare->execute();
  $rows = $prepare->fetchAll(\PDO::FETCH_ASSOC);

  foreach ($rows as &$row) {
    foreach ($row as $key => $value) {
      if (in_array($key, $serviceFields, true)) {
        continue;
      }
      $row[$key] = $value === null ? null : json_decode($value, true);
    }
  }
  unset($row);

  return $rows;
};

$CalculateExtensions->extTrgmSearch = function ($params) {
  $params = $this->getParamsArray($params);

  $this->__checkRequiredParams($params, ['search', 'cats'], 'extTrgmSearch');

  $search = $params['search'];
  if (is_array($search)) {
    throw new errorException('Параметр search должен быть строкой');
  }
  $search = trim((string)$search);
  if ($search === '') {
    throw new errorException('Параметр search не должен быть пустым');
  }

  $secondString = '';
  if (isset($params['secondstring'])) {
    if (is_array($params['secondstring'])) {
      throw new errorException('Параметр secondstring должен быть строкой');
    }
    $secondString = trim((string)$params['secondstring']);
  }

  $cats = $params['cats'];
  $this->__checkListParam($cats, 'cats');

  $cleanCats = [];
  foreach ($cats as $cat) {
    if (is_array($cat)) {
      throw new errorException('Недопустимое значение в параметре cats');
    }
    $cat = trim((string)$cat);
    if ($cat !== '') {
      $cleanCats[] = $cat;
    }
  }

  if (empty($cleanCats)) {
    throw new errorException('Параметр cats не должен быть пустым');
  }

  $limit = 20;
  if (isset($params['limit'])) {
    if (is_array($params['limit']) || !ctype_digit((string)$params['limit'])) {
      throw new errorException('Параметр limit должен быть целым числом');
    }
    $limit = (int)$params['limit'];
    if ($limit < 1) {
      throw new errorException('Параметр limit должен быть больше нуля');
    }
  }

  $offset = 0;
  if (isset($params['offset'])) {
    if (is_array($params['offset']) || !ctype_digit((string)$params['offset'])) {
      throw new errorException('Параметр offset должен быть целым числом больше или равным нулю');
    }
    $offset = (int)$params['offset'];
  }

  $orderSQL = '';
  $orderSelectSQL = '';
  if (isset($params['order_by'])) {
    $order = $params['order_by'];
    if (is_array($order)) {
      throw new errorException('Параметр order_by должен быть строкой');
    }
    $order = trim((string)$order);
    if ($order !== '') {
      if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $order)) {
        throw new errorException('Недопустимое имя поля в параметре order_by');
      }
      $orderSelectSQL = $order === 'id' ? ', id AS order_value' : ", $order -> 'v' AS order_value";
      $orderSQL = 'order_value ASC, ';
    }
  }

  $Totum = $this->Table->getTotum();

  $searchTables = [];
  $tablesMap = [];

  if (isset($params['tables'])) {
    $tablesFilter = $params['tables'];
    $this->__checkListParam($tablesFilter, 'tables');

    foreach ($tablesFilter as $table) {
      if (is_array($table)) {
        throw new errorException('Недопустимое значение в параметре tables');
      }
      $table = trim((string)$table);
      if ($table === '') {
        continue;
      }

      $tableRow = $Totum->getConfig()->getTableRow($table);
      if (empty($tableRow)) {
        throw new errorException('Таблица не найдена: ' . $table);
      }

      $searchTables[] = $tableRow['id'];
      $tablesMap[$tableRow['id']] = $tableRow['name'];
    }

    if (empty($searchTables)) {
      throw new errorException('Параметр tables не должен быть пустым');
    }
  } else {
    $settings = $Totum->getTable('ttm__search_settings')->getByParams(['field' => ['table_id', 'table_name']], 'rows');

    foreach ($settings as $row) {
      $searchTables[] = $row['table_id'];
      $tablesMap[$row['table_id']] = $row['table_name'];
    }
  }

  $catsSQL = "AND ttm_search -> 'v' ->> 'catalog' IN (" . str_repeat('?, ', count($cleanCats) - 1) . '?)';

  $activeSQL = '';
  if (isset($params['active'])) {
    $active = $params['active'];
    if (is_array($active)) {
      throw new errorException('Параметр active не может быть списком');
    }
    $activeSQL = "AND (active ->> 'v') = '" . (filter_var($active, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false') . "'";
  }

  $secondDistanceSQL = '';
  $secondWhereSQL = '';
  if ($secondString !== '') {
    $secondDistanceSQL = " + (lower(?) OPERATOR(public.<<->) lower(ttm_search -> 'v' ->> 'index'))";
    $secondWhereSQL = "AND lower(?) OPERATOR(public.<%) lower(ttm_search -> 'v' ->> 'index')";
  }

  $tablesSQL = '';
  $vars = [];
  foreach ($searchTables as $tableId) {
    if ($tablesSQL != '') {
      $tablesSQL .= ' UNION ALL ';
    }

    $tablesSQL .= <<<SQL
SELECT
        ttm_search -> 'v' AS data,
        id,
        $tableId AS table_id,
        (lower(?) OPERATOR(public.<<->) lower(ttm_search -> 'v' ->> 'index'))$secondDistanceSQL AS distance$orderSelectSQL
    FROM $tablesMap[$tableId]
    WHERE lower(?) OPERATOR(public.<%) lower(ttm_search -> 'v' ->> 'index') $secondWhereSQL $catsSQL $activeSQL
SQL;

    if ($secondString !== '') {
      $vars = [...$vars, $search, $secondString, $search, $secondString, ...$cleanCats];
    } else {
      $vars = [...$vars, $search, $search, ...$cleanCats];
    }
  }

  $query = <<<SQL
WITH combined_search AS (
    $tablesSQL
)
SELECT data, id, table_id, distance
FROM combined_search
ORDER BY {$orderSQL}distance ASC
LIMIT $limit OFFSET $offset;
SQL;

  $prep = $Totum->getConfig()->getSql(true)->getPrepared($query);

  $formatMatches = function ($text) use ($search, $secondString) {
    $searchArray = preg_split('/[\s,]+/u', trim($search . ' ' . $secondString), -1, PREG_SPLIT_NO_EMPTY);
    if (empty($searchArray)) {
      return $text;
    }
    $escapedArray = array_map('preg_quote', $searchArray);
    $pattern = '#(' . implode('|', $escapedArray) . ')#ui';
    return preg_replace($pattern, '<span class="marker">$1</span>', $text);
  };

  $prep->execute($vars);

  $result = [];
  while ($row = $prep->fetch(\PDO::FETCH_ASSOC)) {
    $data = json_decode($row['data'], true) ?: [];

    if (isset($data['index'])) {
      $data['index'] = $formatMatches($data['index']);
    }

    $result[] = [
      'pk' => $row['table_id'] . '-' . $row['id'],
      'product' => $row['id'],
    ] + $data;
  }

  return ['hits' => $result];
};
