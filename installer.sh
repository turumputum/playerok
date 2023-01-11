#! /bin/bash

echo "install is started"
sudo apt install -y openssh-server xfce4 xfce4-power-manager unclutter curl build-essential libudev-dev mosquitto lm-sensors mpv avahi-daemon libnss-mdns ntpdate systemd-timesyncd

sudo apt remove -y --purge samba xfce4-panel 

sudo /usr/sbin/usermod -aG sudo playerok

#---config GRUB---
sudo cp /home/playerok/playerok/linux_conf/grub /etc/default/ 
sudo update-grub

#---config xfce---
sudo cp /home/playerok/playerok/linux_conf/lightdm.conf /etc/lightdm/ 
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo cp /home/playerok/playerok/linux_conf/.profile /home/playerok/

#---config unclutter---
sudo cp /home/playerok/playerok/linux_conf/unclutter.desktop /home/playerok/.config/

#---config mosquitto---
sudo cp /home/playerok/playerok/linux_conf/mosquitto.conf /etc/mosquitto/conf.d/

#---config sensors---
yes | sudo sensors-detect

#---config MPV---
sudo cp /home/playerok/playerok/linux_conf/mpv.conf  /home/playerok/.config/mpv/
sudo cp /home/playerok/playerok/linux_conf/mpv.desktop /home/playerok/.config/autostart/

#---config mDNS---
sudo cp /home/playerok/playerok/linux_conf/webKa_avahi.service /etc/avahi/services/

#---config mDNS---
sudo mkdir /home/playerok/playerok/logs
sudo chmod -R 0777 /home/playerok/playerok/logs

#---config nodeJs---
curl -fsSL https://deb.nodesource.com/setup_19.x | sudo -E bash - &&\ sudo apt-get install -y nodejs
sudo npm install -g npm@lastest
cd /home/playerok/playerok/webKa; npm i
cd /home/playerok/playerok/scheduler; npm i
cd /home/playerok/playerok/player; npm i
cd /home/playerok/playerok/supervisor; npm i
cd /home/playerok/playerok/uart2mqtt; npm i
cd /home/playerok/playerok/meta/tools; npm i

#---config services---
sudo cp /home/playerok/playerok/linux_conf/webka.service /etc/systemd/system/
sudo cp /home/playerok/playerok/linux_conf/scheduler.service /etc/systemd/system
sudo cp /home/playerok/playerok/linux_conf/uart2mqtt.service /etc/systemd/system
sudo cp /home/playerok/playerok/linux_conf/usb_storage.service /etc/systemd/system
sudo cp /home/playerok/playerok/linux_conf/supervisor.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable webka.service scheduler.service uart2mqtt.service usb_storage.service supervisor.service


echo "install is OK"