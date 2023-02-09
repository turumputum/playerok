const { spawnSync, exec, execSync } = require('child_process');

const fs = require("fs");

const scribbles = require('scribbles');

function netmask2CIDR(netmask) {
  return (netmask.split('.').map(Number)
    .map(part => (part >>> 0).toString(2))
    .join('')).split('1').length - 1;
}

async function asyncSpawn(cmd, arg) {
  const childProcess = spawnSync(cmd, [arg],
    { stdio: [process.stdin, process.stdout, process.stderr] });
}

async function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        scribbles.warn(error)
      }
      //scribbles.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout ? stdout : stderr);
    })
  })
}

function tryExecSync(cmd){
  try{
    return execSync(cmd)
  }catch{
    scribbles.log(`exec ${cmd} failed`)
    return 'fail'
  }
}


async function set_net_config() {
  try {

    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    //scribbles.log(`Set log level ${config.log.level}`)
    scribbles.config({
      logLevel: config.log.level,
      format: '{time} [{fileName}] <{logLevel}> {message}'
    })

  } catch (err) {
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
  }
  
  await execPromise(`sudo nmcli general hostname ${config.net.mDNS_name}`)

  const ifMassE = ['eth0', 'eth1', 'wlan0'];
  for (let iface of ifMassE) {
    //console.log(tryExecSync(`nmcli -f NAME con show | grep ${iface}`).toString().includes(iface))
    
    if(!tryExecSync(`nmcli -f NAME con show | grep ${iface}`).toString().includes(iface)){
      scribbles.log(`Conn: ${iface} not fount, creating...`)
      if((iface=='eth0')||(iface=='eth1')){
        tryExecSync(`nmcli con add type ethernet con-name ${iface} ifname ${iface}`)
      }else{
        tryExecSync(`nmcli con add type wifi con-name ${iface} ifname ${iface}`)
      }
    }

    if (config.net[iface].enable == 1) {
      await execPromise(`nmcli con mod ${iface} ifname ${iface}`)
      await execPromise(`nmcli con mod ${iface} connection.autoconnect yes`)
      await execPromise(`nmcli con mod ${iface} connection.mdns 2`)
      //await execPromise(`nmcli con mod ${iface} ipv4.mdns 2`)
      if (config.net[iface].DHCP == 1) {
        await execPromise(`nmcli con mod ${iface} ipv4.method auto`)
      } else if (config.net[iface].DHCP == 0) {
        await execPromise(`nmcli con mod ${iface} ipv4.addresses ${config.net[iface].IP}/${netmask2CIDR(config.net[iface].net_mask)}`)
        await execPromise(`nmcli con mod ${iface} ipv4.gateway ${config.net[iface].gateway}`)
        await execPromise(`nmcli con mod ${iface} ipv4.dns ${config.net[iface].DNS}`)
      }
      execPromise(`nmcli con up ${iface}`)
    } else {
      execPromise(`nmcli con down ${iface}`)
    }
  }
  if (config.net.wlan0.enable == 1) {
    await execPromise(`nmcli con mod wlan0 wifi.ssid ${config.net.wlan0.SSID}`)
    await execPromise(`nmcli con mod wlan0 wifi-sec.key-mgmt wpa-psk`)
    await execPromise(`nmcli con mod wlan0 wifi-sec.psk ${config.net.wlan0.password}`)
  }

}


set_net_config()
