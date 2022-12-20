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

  if(config.net.enp1s0.enable==1){
    net_config+="\n" +"auto enp1s0"+"\n" + "allow-hotplug enp1s0"+"\n"
    if(config.net.enp1s0.DHCP==1){
      net_config+="iface enp1s0 inet dhcp"+"\n"
    }else{
      net_config+="iface enp1s0 inet static"+"\n"
      var cidr = netmask2CIDR(config.net.enp1s0.net_mask)
      net_config+="\t"+`address ${config.net.enp1s0.IP}/${cidr}`+"\n"
      net_config+="\t"+`gateway ${config.net.enp1s0.gateway}`+"\n"
      net_config+="\t"+`dns-nameservers ${config.net.enp1s0.DNS}`+"\n"
    }
  }

  if(config.net.enp2s0.enable==1){
    net_config+="\n" +"auto enp2s0"+"\n" + "allow-hotplug enp2s0"+"\n"
    if(config.net.enp2s0.DHCP==1){
      net_config+="iface enp2s0 inet dhcp"+"\n"
    }else{
      net_config+="iface enp2s0 inet static"+"\n"
      var cidr = netmask2CIDR(config.net.enp2s0.net_mask)
      net_config+="\t"+`address ${config.net.enp2s0.IP}/${cidr}`+"\n"
      net_config+="\t"+`gateway ${config.net.enp2s0.gateway}`+"\n"
      net_config+="\t"+`dns-nameservers ${config.net.enp2s0.DNS}`+"\n"
    }
  }

  if(config.net.wlp3s0.enable==1){
    net_config+="\n" + "allow-hotplug wlp3s0"+"\n"
    if(config.net.wlp3s0.DHCP==1){
      net_config+="iface wlp3s0 inet dhcp"+"\n"
    }else{
      net_config+="iface wlp3s0 inet static"+"\n"
      var cidr = netmask2CIDR(config.net.wlp3s0.net_mask)
      net_config+="\t"+`address ${config.net.wlp3s0.IP}/${cidr}`+"\n"
      net_config+="\t"+`gateway ${config.net.wlp3s0.gateway}`+"\n"
      net_config+="\t"+`dns-nameservers ${config.net.wlp3s0.DNS}`+"\n"
    }
    net_config+="\t"+`wpa-ssid ${config.net.wlp3s0.SSID}`+"\n"
    net_config+="\t"+`wpa-psk ${config.net.wlp3s0.password}`+"\n"
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
