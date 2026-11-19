#!/bin/bash

echo "Performing Ubuntu version check..."
if [[ $(grep -c 'Ubuntu 26.04' /etc/issue) -ne 1 ]]; then
  echo "THIS SERVER IS NOT A UBUNTU 26.04 CHECK: sudo cat /etc/issue"
  exit 0
else
  echo "Ubuntu version is OK. Let's go..."
fi

if [[ $(sudo locale | grep -c 'LANG=en_US.UTF-8') -ne 1 ]]
then
  echo "- - - - - - - - - - - - - - - - - - - - - -"
  echo -e "\e[40;1;37mTHIS SERVER HAVE NOT \e[40;1;31men_US.UTF-8\e[40;1;37m LOCALE. YOU HAVE TO EXECUTE:"
  echo -e "sudo curl -O https://raw.githubusercontent.com/totumonline/totum-b2m-ru/b2m/totum/moduls/install/setlocale.sh && sudo bash setlocale.sh" 
  echo -e "AND FOLLOW THE ON-SCREEN INSTRUCTIONS TO SETUP THE CORRECT LOCALE\033[0m"
  echo "- - - - - - - - - - - - - - - - - - - - - -"
  echo
  read -p "If you ready to go, type (A) we will download and run setlocale.sh: " TOTUMLOCALE
  echo
else
  TOTUMLOCALE="RUN"
fi

if [[ "$TOTUMLOCALE" == [Aa] ]]; then
    sudo curl -O https://raw.githubusercontent.com/totumonline/totum-b2m-ru/b2m/totum/moduls/install/setlocale.sh && sudo bash setlocale.sh
    echo
    exit 0
elif [[ "$TOTUMLOCALE" == "RUN" ]]; then
    echo "Locale is OK. Let's go..."
    echo
else
    exit 0
fi

if [ -f "totum_install_vars" ]; then
  echo -e "\033[1mFile 'totum_install_vars' exists — continuing the installation...\033[0m"
  echo
else

echo -e "\e[40;1;37m                                                                         \033[0m"
echo -e "\e[40;1;37m                       ..       .*:-.                                    \033[0m"
echo -e "\e[40;1;37m                      -*:-.     -+*:.   .*:-.                            \033[0m"
echo -e "\e[40;1;37m                      -+*:-     -**:.   :+*-.                            \033[0m"
echo -e "\e[40;1;37m                      .++*-.    -*:-.   :**-.      ..-.                  \033[0m"
echo -e "\e[40;1;37m                       :+*:.    -**:.   **:-.     .:::-                  \033[0m"
echo -e "\e[40;1;37m                       .*+**.   :**:.  .++:-     ..***:                  \033[0m"
echo -e "\e[40;1;37m                        ***:-.  ::::.  -:::-    .:-::.                   \033[0m"
echo -e "\e[40;1;37m             ::--.      .*++::. :*::. -*::-.  .-*+**.                    \033[0m"
echo -e "\e[40;1;37m             -+:--.      .+:::-:::---:**+:. .::::::.                     \033[0m"
echo -e "\e[40;1;37m              **:-.       *+***::*::*:-::::::-+**-                       \033[0m"
echo -e "\e[40;1;37m              -+*:--.    .*::-------::::::::**+-                         \033[0m"
echo -e "\e[40;1;37m               -++:--------:-----------------::                          \033[0m"
echo -e "\e[40;1;37m                .++*::-----------------------::                          \033[0m"
echo -e "\e[40;1;37m                 .*++***:--------------------::                          \033[0m"
echo -e "\e[40;1;37m                   -+++++*::::::::**::::---:**:                          \033[0m"
echo -e "\e[40;1;37m                      -*+++++++++++*+++:::-:**.                          \033[0m"
echo -e "\e[40;1;37m                        .*+++++++++***+++****:                           \033[0m"
echo -e "\e[40;1;37m                           -++++++++***++++++.                           \033[0m"
echo -e "\e[40;1;37m                            *++++++*++++++++:                            \033[0m"
echo -e "\e[40;1;37m                            :++++++*++***+++-                            \033[0m"
echo -e "\e[40;1;37m                            -+*++++++++***+*:                            \033[0m"
echo -e "\e[40;1;37m                            -**+**+***+***+*:                            \033[0m"
echo -e "\e[40;1;37m                            -******::****:**:                            \033[0m"
echo -e "\e[40;1;37m                                                                         \033[0m"
echo -e "\033[43m\033[30m- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[30m   B2M AUTOINSTALL SCRIPT                                                \033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[30m   This install script will help you to install Totum online B2M.        \033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[30m   \033[43m\033[31mONLY ON CLEAR!!! Ubuntu 26.04 \033[43m\033[30mwith SSL certificate.                   \033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[30m   First you have to \033[43m\033[31mDELEGATE A VALID DOMAIN \033[43m\033[30mto this server.             \033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[30m   If you not shure about you domain — cansel this install and check:    \033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[31m   ping YOUR_DOMAIN                                                      \033[0m"
echo -e "\033[43m\033[30m                                                                         \033[0m"
echo -e "\033[43m\033[30m- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\033[0m"
echo

read -p "If you ready to go, type (A) or cancel (Ctrl + C) and check you domain with ping: " TOTUMRUN
echo
if [[ "$TOTUMRUN" == [Aa] ]]; then
    echo "Started! Choose a number to select the timezone for your server..."
    echo
else
    exit 0
fi

TOTUMTIMEZONE=$(tzselect)

TOTUMBASEPASS=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 24)

echo "- - - - - - - - - - - - - - - - - - - - - -"
echo "Enter a valid email! A user will be registered with it on the license server https://license.totum-online.ru"
echo "- - - - - - - - - - - - - - - - - - - - - -"
echo
read -p "Enter your email: " CERTBOTEMAIL
echo
read -p "Create a temporary Totum B2M superuser (admin) password: " TOTUMADMINPASS
echo
echo "- - - - - - - - - - - - - - - - - - - - - -"
echo "Enter domain without http/https delegated! to this server, like totum.online"
echo "- - - - - - - - - - - - - - - - - - - - - -"
echo
read -p "Enter domain: " CERTBOTDOMAIN
while [[ -z "${CERTBOTDOMAIN// }" ]]; do
  echo
  echo -e "\033[1mDomain cannot be empty!\033[0m"
  echo
  read -p "Enter domain: " CERTBOTDOMAIN
done

TOTUMLANG=ru

echo
echo "- - - - - - - - - - - - - - - - - - - - - -"
echo
echo -e "\033[1mCheck you settings:\033[0m"
echo
echo -e "\033[1mTimezone:\033[0m " $TOTUMTIMEZONE
echo
echo -e "\033[1mEmail:\033[0m " $CERTBOTEMAIL
echo
echo -e "\033[1mPass for Totum B2M admin:\033[0m " $TOTUMADMINPASS
echo
echo -e "\033[1mDomain:\033[0m " $CERTBOTDOMAIN
echo
echo -e "\033[1mLang:\033[0m " $TOTUMLANG
echo
echo "- - - - - - - - - - - - - - - - - - - - - - -"
echo

read -p "If you ready to install with this params type (A) or cancel (Ctrl + C): " TOTUMRUN2
echo

if [[ "$TOTUMRUN2" == [Aa] ]]; then
    echo "Start installation"
    echo
else
    exit 0
fi

echo "export TOTUMTIMEZONE=${TOTUMTIMEZONE}" >> totum_install_vars
echo "export TOTUMBASEPASS=${TOTUMBASEPASS}" >> totum_install_vars
echo "export CERTBOTEMAIL=${CERTBOTEMAIL}" >> totum_install_vars
echo "export TOTUMADMINPASS=${TOTUMADMINPASS}" >> totum_install_vars
echo "export CERTBOTDOMAIN=${CERTBOTDOMAIN}" >> totum_install_vars
echo "export TOTUMLANG=${TOTUMLANG}" >> totum_install_vars

echo "Environment variables written to totum_install_vars!"
echo
SKIP=1

fi

source totum_install_vars

if [[ $SKIP -eq 1 ]]
then

echo "- - - >"
echo

else

echo
echo "- - - - - - - - - - - - - - - - - - - - - -"
echo
echo -e "\033[1mTimezone:\033[0m " $TOTUMTIMEZONE
echo
echo -e "\033[1mEmail:\033[0m " $CERTBOTEMAIL
echo
echo -e "\033[1mPass for Totum admin:\033[0m " $TOTUMADMINPASS
echo
echo -e "\033[1mDomain:\033[0m " $CERTBOTDOMAIN
echo
echo -e "\033[1mLang:\033[0m " $TOTUMLANG
echo
echo "- - - - - - - - - - - - - - - - - - - - - - -"
echo

read -p "Continue with the installation or reconfiguration? Type (A) or (Ctrl + C): " CONTINUE
echo
  if [[ "$CONTINUE" == [Aa] ]]; then
    echo "Continuing the installation"
    echo
  else
    echo "Invalid input. Script aborted."
    echo
    exit 1
  fi
fi

if ! command -v ansible >/dev/null 2>&1; then
  echo "apt install ansible"
  echo
  sudo apt update

  sudo apt install -y ansible

else
  echo "Ansible already installed..."
  echo
fi

if [ -f "ansible_b2m_install.yml" ]; then
  echo -e "\033[1mAnsible playbook downloaded — continuing the installation...\033[0m"
  echo
else

sudo curl -O https://raw.githubusercontent.com/totumonline/totum-b2m-ru/b2m/totum/moduls/install/ansible_b2m_install.yml

fi

if [ -f "ansible_localhost" ]; then
  echo -e "\033[1mAnsible localhost settings exist — continuing the installation...\033[0m"
  echo
else

echo -e "[local]\nlocalhost ansible_connection=local" > ansible_localhost

fi

export ANSIBLE_DEPRECATION_WARNINGS=False
export ANSIBLE_SYSTEM_WARNINGS=False
export ANSIBLE_ACTION_WARNINGS=False
export ANSIBLE_LOCALHOST_WARNING=False
export ANSIBLE_INVENTORY_UNPARSED_WARNING=False
export ANSIBLE_PYTHON_INTERPRETER=auto_silent

if [[ $EUID -eq 0 ]]
then
  ansible-playbook -i ansible_localhost ansible_b2m_install.yml
  echo
else
echo "Enter the password for your user"
echo
ansible-playbook -i ansible_localhost --ask-become-pass ansible_b2m_install.yml
echo
fi
