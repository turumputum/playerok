#! /bin/bash

echo "install is started"
sudo apt install -y i965-va-driver-shaders intel-media-va-driver-non-free firmware-realtek firmware-misc-nonfree firmware-iwlwifi i965-va-driver curl openssh-server xfce4 xfce4-power-manager unclutter curl make python build-essential libudev-dev mosquitto lm-sensors mpv avahi-daemon libnss-mdns ntpdate systemd-timesyncd imagemagick 

sudo apt remove -y --purge samba xfce4-panel light-locker

sudo /usr/sbin/usermod -aG sudo,audio,pulse,pulse-access,video,voice playerok

#---config GRUB---
sudo cp /home/playerok/playerok/linux_conf/grub /etc/default/ 
sudo update-grub

#---config nodeJs---
curl -fsSL https://deb.nodesource.com/setup_19.x | sudo -E bash - 
sudo apt-get install -y nodejs
sudo npm install -g npm@lastest 
sudo npm install -g node-gyp node-pty
sudo npm install -g bower

cd /home/playerok/playerok/webKa; npm i; bower install bootstrap-treeview
cd /home/playerok/playerok/scheduler; npm i
cd /home/playerok/playerok/player; npm i
cd /home/playerok/playerok/supervisor; npm i
cd /home/playerok/playerok/uart2mqtt; npm i
cd /home/playerok/playerok/meta/tools; npm i

#---config Logs---
sudo mkdir /home/playerok/playerok/logs
sudo chmod -R 0777 /home/playerok/playerok/logs

sudo cp /home/playerok/playerok/linux_conf/supervisor.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable supervisor.service

echo 'options iwlwifi enable_ini=N' | sudo tee -a /etc/modprobe.d/iwlwifi.conf

sudo touch /home/playerok/playerok/meta/flag_firstRunAfterInstall
sudo reboot
