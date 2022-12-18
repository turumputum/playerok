const { exec } = require('child_process');
var sudo = require('sudo-js');
sudo.setPassword('playerok');
require('log-timestamp');


var Netmask = require('netmask').Netmask
const fs = require("fs");

const log_file = require('log-to-file');

function netmask2CIDR(netmask){
    return (netmask.split('.').map(Number)
      .map(part => (part >>> 0).toString(2))
      .join('')).split('1').length -1;
}

/**
 * Executes a shell command and return it as a Promise.
 * @param cmd {string}
 * @return {Promise<string>}
 */
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
        //console.warn(error)
        reject(error + stderr)
      }
      //console.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout? stdout : stderr);
    })
  })
 }

 async function deleteActiveConnection(){
  const rawConnectionData = await execPromise('nmcli -t connection show --active')
  var uuid =  rawConnectionData.split(/\r\n|\r|\n|:/).slice(1,2)[0]
  if (uuid!=null){
    console.log("current UUID:"+uuid)
    try{
      await execSudoPromise(`nmcli con down ${uuid}`)
      await execSudoPromise(`nmcli con delete ${uuid}`)
      console.log("Delete active connection:" +uuid)
      return 1
    }catch(err){
      console.log("Delete connection fail: " + err)
    }
  }
  return 0
 }


async function set_config(){
  try{
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  }catch(err){
    console.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
  }

  exec(`echo "playerok" | sudo -S ifconfig`, (error, stdout, stderr) => {
    if ((error) || (stderr)) {
      console.warn(error)
      //reject(error + stderr)
    }
    //console.log(`sudo OK: ${stdout}`)
  })

  while(await deleteActiveConnection()){}

  if(config.net.DHCP =='1'){  //----------------DHCP-------------
    try{
      try{
        await execSudoPromise(`nmcli con delete dhcp`)
      }catch{}
      await execSudoPromise(`nmcli con add con-name "dhcp" type ethernet ifname end0`)
      await execSudoPromise(`nmcli con up dhcp`)
      console.log("Set DHCP on complite");  
      var rawData = (await execSudoPromise(`nmcli -t con show dhcp`)).split(/\r\n|\r|\n|=|:/)
      var index = rawData.findIndex(item=>item==='ip_address ')
      if(rawData[index+1]!=''){
        config.net.IP=rawData[index+1]
        console.log("IP adr: "+ config.net.IP)
      }
      index = rawData.findIndex(item=>item==='subnet_mask ')
      if(rawData[index+1]!=''){
        config.net.net_mask=rawData[index+1]
        console.log("net_mask: "+ config.net.net_mask)
      }
      index = rawData.findIndex(item=>item==='routers ')
      if(rawData[index+1]!=''){
        config.net.gateway=rawData[index+1]
        console.log("gateway: "+ config.net.gateway)
      }
      index = rawData.findIndex(item=>item==='domain_name_servers ')
      if(rawData[index+1]!=''){
        config.net.DNS=rawData[index+1].split(' ')[1]
        console.log("DNS: "+ config.net.DNS)
      }
      fs.writeFileSync('../meta/player_config.json', JSON.stringify(config,null,2))

    }catch(err){      
      console.log("Set DHCP fail: "+ err); 
    }

  }else if(config.net.DHCP =='0'){//----------------Static IP-------------
    var cidr = netmask2CIDR(config.net.net_mask)
    console.log("IP/bit_mask: "+ config.net.IP +"/"+cidr)
    
    if(config.net.IP!=''){
      try{
        try{
          await execSudoPromise(`nmcli con delete static`)
        }catch{}
        await execSudoPromise(`nmcli con add con-name "static" ifname end0 autoconnect no type ethernet ip4 ${config.net.IP}/${cidr} gw4 ${config.net.gateway}`)
        await execSudoPromise(`nmcli con modify "static" ipv4.dns ${config.net.DNS}`)
        await execSudoPromise(`nmcli con up static`)
        console.log("Set static IP complite");  
      }catch(err){      
        console.log("Set static IP fail: "+err); 
      }
    }
  }
  
  if(config.net.mDNS_name!=''){
    try{
      await execSudoPromise(`nmcli general hostname ${config.net.mDNS_name}`)
      console.log("Set hostName complite"); 
    }catch{ }
  }

  if(config.time.NTP=='1'){
    try{
      await execSudoPromise(`timedatectl set-ntp true`)
      await execSudoPromise(`timedatectl set-timezone Etc/GMT${parseInt(config.time.time_zone)*-1}`)
      console.log("Set NTP true OK, time zone: " + parseInt(config.time.time_zone)*-1)
    }catch{
    }
  }else if(config.time.NTP=='1'){
    try{
      await execSudoPromise(`timedatectl set-ntp false`)
      console.log("Set NTP false OK")
    }catch{
    }
  }

  if(config.sound.output_device !=''){
    try{
      await execPromise(`pacmd set-default-sink ${config.sound.output_device}`)
      console.log("Set output_device OK")
    }catch{}
  }

  if(config.sound.volume !=''){
    try{
      await execPromise(`amixer set Master ${config.sound.volume}%`)
      console.log("Set volume OK")
    }catch{}
  }
 
}

set_config()


