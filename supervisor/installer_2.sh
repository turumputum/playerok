#! /bin/bash

#---config xfce---
sudo cp /home/playerok/playerok/linux_conf/lightdm.conf /etc/lightdm/ 
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo cp /home/playerok/playerok/linux_conf/.profile /home/playerok/

#---config unclutter---
sudo cp /home/playerok/playerok/linux_conf/unclutter.desktop /home/playerok/.config/

#---config mosquitto---
sudo cp /home/playerok/playerok/linux_conf/mosquitto.conf /etc/mosquitto/

#---config sensors---
yes | sudo sensors-detect

#---config MPV---
# sudo cp /home/playerok/playerok/linux_conf/mpv.conf  /home/playerok/.config/mpv/
# sudo mkdir /home/playerok/.config/autostart/
# sudo chmod 777 /home/playerok/.config/autostart/
# sudo cp /home/playerok/playerok/linux_conf/mpv.desktop /home/playerok/.config/autostart/

#---config mDNS---
sudo cp /home/playerok/playerok/linux_conf/webKa_avahi.service /etc/avahi/services/

#---config services---
sudo cp /home/playerok/playerok/linux_conf/webka.service /etc/systemd/system
sudo cp /home/playerok/playerok/linux_conf/scheduler.service /etc/systemd/system
sudo cp /home/playerok/playerok/linux_conf/screen_sound_config.service /etc/systemd/system
sudo systemctl daemon-reload
sudo systemctl enable webka.service scheduler.service screen_sound_config.service
sudo systemctl start webka.service scheduler.service screen_sound_config.service


#---config desktop---
export DISPLAY=:0
export XAUTHORITY=/home/playerok/.Xauthority
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

xset s off
xset dpms 0 0 0
xset -dpms s off


#su playerok -c "xfconf-query -c xfce4-desktop -p /backdrop/screen0/monitorHDMI-1/workspace0/last-image -s /home/playerok/playerok/linux_conf/wall_blue.JPG"
su playerok -c "xfconf-query --create --channel xfce4-desktop --property /backdrop/screen0/monitorHDMI-1/workspace0/last-image --type string --set /home/playerok/playerok/linux_conf/wall.jpg"
#su playerok -c " xfconf-query -c xfce4-desktop -p  /backdrop/screen0/monitorHDMI-2/workspace0/last-image -s /home/playerok/playerok/linux_conf/wall_blue.JPG"
su playerok -c "xfconf-query --create --channel xfce4-desktop --property /backdrop/screen0/monitorHDMI-2/workspace0/last-image --type string --set /home/playerok/playerok/linux_conf/wall.jpg"

#su playerok -c " xfconf-query -c xfce4-desktop -p /desktop-icons/file-icons/show-home -s false"
su playerok -c "xfconf-query --create --channel xfce4-desktop --property /desktop-icons/file-icons/show-home --type bool --set false"
#su playerok -c " xfconf-query -c xfce4-desktop -p /desktop-icons/file-icons/show-filesystem -s false"
su playerok -c "xfconf-query --create --channel xfce4-desktop --property /desktop-icons/file-icons/show-filesystem --type bool --set false"
#su playerok -c " xfconf-query -c xfce4-desktop -p /desktop-icons/file-icons/show-trash -s false"
su playerok -c "xfconf-query --create --channel xfce4-desktop --property /desktop-icons/file-icons/show-trash --type bool --set false"
#su playerok -c " xfconf-query -c xfce4-desktop -p /desktop-icons/style -s 0"
su playerok -c "xfconf-query --create --channel xfce4-desktop --property /desktop-icons/style --type int --set 0"

#su playerok -c " xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s 0"
su playerok -c "xfconf-query --create --channel xfce4-power-manager --property /xfce4-power-manager/dpms-enabled --type int --set 0"
#su playerok -c " xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/blank-on-ac -s 0" 
su playerok -c "xfconf-query --create --channel xfce4-power-manager --property /xfce4-power-manager/blank-on-ac --type int --set 0"
#su playerok -c " xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/inactivity-on-ac -s 0"
su playerok -c "xfconf-query --create --channel xfce4-power-manager --property /xfce4-power-manager/inactivity-on-ac --type int --set 0"

echo "install is OK"
sudo rm -fr /home/playerok/playerok/meta/flag_firstRunAfterInstall
#sudo reboot