const { spawnSync, exec } = require('child_process');
var sudo = require('sudo-js');
const cidrToNetmask = require('cidr-to-netmask')

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

function execPromise(cmd) {
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

function execSudoPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(`sudo ${cmd}`, (error, stdout, stderr) => {
      if ((error) || (stderr)) {
        scribbles.warn(error + stderr)
        reject(error + stderr)
      }
      //scribbles.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout ? stdout : stderr);
    })
  })
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
    //scribbles.log("suka")
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
  }
  //scribbles.log("start net config")
  //   exec(`echo "playerok" | sudo ip addr show`, (error, stdout, stderr) => {
  //     if ((error) || (stderr)) {
  //       scribbles.warn(error)
  //       //reject(error + stderr)
  //     }
  //   })

  var net_config = "auto lo" + "\n" + "iface lo inet loopback" + "\n"

  if (config.net.eth0.enable == 1) {
    net_config += "\n" + "auto eth0\n" + "allow-hotplug eth0" + "\n"
    if (config.net.eth0.DHCP == 1) {
      net_config += "iface eth0 inet dhcp" + "\n"
    } else {
      net_config += "iface eth0 inet static" + "\n"
      var cidr = netmask2CIDR(config.net.eth0.net_mask)
      net_config += "\t" + `address ${config.net.eth0.IP}/${cidr}` + "\n"
      net_config += "\t" + `gateway ${config.net.eth0.gateway}` + "\n"
      net_config += "\t" + `dns-nameservers ${config.net.eth0.DNS}` + "\n"
    }
  }

  if (config.net.eth1.enable == 1) {
    net_config += "\n" + "auto eth1\n" + "allow-hotplug eth1" + "\n"
    if (config.net.eth1.DHCP == 1) {
      net_config += "iface eth1 inet dhcp" + "\n"
    } else {
      net_config += "iface eth1 inet static" + "\n"
      var cidr = netmask2CIDR(config.net.eth1.net_mask)
      net_config += "\t" + `address ${config.net.eth1.IP}/${cidr}` + "\n"
      net_config += "\t" + `gateway ${config.net.eth1.gateway}` + "\n"
      net_config += "\t" + `dns-nameservers ${config.net.eth1.DNS}` + "\n"
    }
  }

  if (config.net.wlan0.enable == 1) {
    net_config += "\n"+ "auto wlan0\n" + "allow-hotplug wlan0" + "\n"
    if (config.net.wlan0.DHCP == 1) {
      net_config += "iface wlan0 inet dhcp" + "\n"
    } else {
      net_config += "iface wlan0 inet static" + "\n"
      var cidr = netmask2CIDR(config.net.wlan0.net_mask)
      net_config += "\t" + `address ${config.net.wlan0.IP}/${cidr}` + "\n"
      net_config += "\t" + `gateway ${config.net.wlan0.gateway}` + "\n"
      net_config += "\t" + `dns-nameservers ${config.net.wlan0.DNS}` + "\n"
    }
    net_config += "\t" + `wpa-ssid ${config.net.wlan0.SSID}` + "\n"
    net_config += "\t" + `wpa-psk ${config.net.wlan0.password}` + "\n"
  }

  //scribbles.log(net_config)
  //execSudoPromise(`systemctl restart networking`)
  //execSudoPromise(`reboot`)

  await execPromise(`dhclient`)
  
  //scribbles.log(JSON.stringify(config, null, 2))

  try {
    fs.writeFileSync('/etc/network/interfaces', net_config)
    //fs.writeFileSync('../meta/player_config.json', JSON.stringify(config, null, 2))
    scribbles.log(`setup interfaces OK) `)
  } catch (err) {
    scribbles.warn(`setup interfaces FAILED: ${err}`)
  }
  scribbles.log(`Net config OK) `)
  execPromise('reboot')
  //process.exit(1)
}

set_net_config()


