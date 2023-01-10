const { exec } = require('child_process');
var sudo = require('sudo-js');
var Netmask = require('netmask').Netmask
const fs = require("fs");

require('log-timestamp');

function netmask2CIDR(netmask){
  return (netmask.split('.').map(Number)
    .map(part => (part >>> 0).toString(2))
    .join('')).split('1').length -1;
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(error)
      }
      //console.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout? stdout : stderr);
    })
  })
}

function execSudoPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(`sudo ${cmd}`, (error, stdout, stderr) => {
      if ((error) || (stderr)) {
        console.warn(error + stderr)
        reject(error + stderr)
      }
      //console.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout? stdout : stderr);
    })
  })
}

 async function set_net_config(){
  try{
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  }catch(err){
    console.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
  }

//   exec(`echo "playerok" | sudo ip addr show`, (error, stdout, stderr) => {
//     if ((error) || (stderr)) {
//       console.warn(error)
//       //reject(error + stderr)
//     }
//   })

  var net_config="auto lo" +"\n" +"iface lo inet loopback"+"\n"

  if(config.net.eth0.enable==1){
    net_config+="\n" +"auto eth0"+"\n" + "allow-hotplug eth0"+"\n"
    if(config.net.eth0.DHCP==1){
      net_config+="iface eth0 inet dhcp"+"\n"
    }else{
      net_config+="iface eth0 inet static"+"\n"
      var cidr = netmask2CIDR(config.net.eth0.net_mask)
      net_config+="\t"+`address ${config.net.eth0.IP}/${cidr}`+"\n"
      net_config+="\t"+`gateway ${config.net.eth0.gateway}`+"\n"
      net_config+="\t"+`dns-nameservers ${config.net.eth0.DNS}`+"\n"
    }
  }

  if(config.net.eth1.enable==1){
    net_config+="\n" +"auto eth1"+"\n" + "allow-hotplug eth1"+"\n"
    if(config.net.eth1.DHCP==1){
      net_config+="iface eth1 inet dhcp"+"\n"
    }else{
      net_config+="iface eth1 inet static"+"\n"
      var cidr = netmask2CIDR(config.net.eth1.net_mask)
      net_config+="\t"+`address ${config.net.eth1.IP}/${cidr}`+"\n"
      net_config+="\t"+`gateway ${config.net.eth1.gateway}`+"\n"
      net_config+="\t"+`dns-nameservers ${config.net.eth1.DNS}`+"\n"
    }
  }

  if(config.net.wlan0.enable==1){
    net_config+="\n" + "allow-hotplug wlan0"+"\n"
    if(config.net.wlan0.DHCP==1){
      net_config+="iface wlan0 inet dhcp"+"\n"
    }else{
      net_config+="iface wlan0 inet static"+"\n"
      var cidr = netmask2CIDR(config.net.wlan0.net_mask)
      net_config+="\t"+`address ${config.net.wlan0.IP}/${cidr}`+"\n"
      net_config+="\t"+`gateway ${config.net.wlan0.gateway}`+"\n"
      net_config+="\t"+`dns-nameservers ${config.net.wlan0.DNS}`+"\n"
    }
    net_config+="\t"+`wpa-ssid ${config.net.wlan0.SSID}`+"\n"
    net_config+="\t"+`wpa-psk ${config.net.wlan0.password}`+"\n"
  }

  //console.log(net_config)
  try{
    fs.writeFileSync('/etc/network/interfaces', net_config)
    console.warn(`setup interfaces OK) `)
  }catch(err){
    console.warn(`setup interfaces FAILED: ${err}`)
  }

  execSudoPromise(`reboot`)

}

set_net_config()
