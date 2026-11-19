<?php


namespace totum\commands;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use totum\common\Crypt;
use totum\config\Conf;

class B2mUpdate extends Command
{
    protected function configure()
    {
        $this->setName('b2m-update')
            ->addOption('force', '', InputOption::VALUE_NONE, 'Force update without checking changing major version.')
            ->setDescription('update from git origin b2m && composer && schema(s)-update');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
       if (!$input->getOption('force')) {
            $error = true;
            $remoteVersionUrl = 'https://raw.githubusercontent.com/totumonline/totum-b2m-ru/b2m/B2M_VERSION';
            $localVersionFile = dirname(__DIR__, 2) . '/B2M_VERSION';
            if (is_file($localVersionFile) && ($remoteVersion = @file_get_contents($remoteVersionUrl))) {
                $localVersion = trim((string)file_get_contents($localVersionFile));
                $remoteVersion = trim($remoteVersion);
                if (preg_match('/^(\d+)/', $localVersion, $localMatches) && preg_match('/^(\d+)/', $remoteVersion, $remoteMatches)) {
                    if ($localMatches[1] !== $remoteMatches[1]) {
                        die('This update will change the B2M major version from ' . $localVersion . ' to ' . $remoteVersion . '. ' .
                            'Check server settings and backward compatibility violations at https://raw.githubusercontent.com/totumonline/totum-b2m-ru/b2m/UPDATES.md ' .
                            'Use --force if you are sure about the update.');
                    } else {
                        $error = false;
                    }
                }
            }
            if ($error) {
                die('Failed to compare local B2M_VERSION with ' . $remoteVersionUrl . '. The major version change check failed. ' .
                    'Use --force if you are sure about the update.');
            }
        }

        $Conf = new Conf();
        $serviceName = $Conf->getProGoModuleServiceName();

        passthru('git pull origin b2m && php -f composer.phar self-update --2 && php -f composer.phar install --no-dev');

        $uri = 'https://'.$Conf->getSomeHost().'/Commands/reset-opcache';

        $context = stream_context_create(
            [
                'http' => [
                    'header' => "Content-type: application/x-www-form-urlencoded\r\nUser-Agent: TOTUM\r\nConnection: Close\r\n\r\n",
                    'method' => 'POST',
                    'content' => http_build_query([
                        'key' => Crypt::getCrypted(date('H-m-d'), $Conf->getCryptKeyFileContent()),
                    ])
                ],
                'ssl' => [
                    'verify_peer' => $Conf->isCheckSsl(),
                    'verify_peer_name' => $Conf->isCheckSsl(),
                ],
            ]
        );
        $data = file_get_contents($uri, true, $context);
        if ($data) {
            echo $data;
        }

        if (is_callable([$Conf, 'setHostSchema'])) {
            passthru('sudo service '.$serviceName.' restart && bin/totum schemas-update');
        } else {
            passthru('sudo service '.$serviceName.' restart && bin/totum schema-update');
        }

        $b2mUpdateFile = dirname(__DIR__) . '/moduls/install/b2m.json.gz.ttm';
        if (is_callable([$Conf, 'setHostSchema'])) {
            passthru('bin/totum schemas-update b2m ' . escapeshellarg($b2mUpdateFile));
        } else {
            passthru('bin/totum schema-update b2m ' . escapeshellarg($b2mUpdateFile));
        }

        passthru('sudo service '.$serviceName.' restart');

        return 0;
    }
}
