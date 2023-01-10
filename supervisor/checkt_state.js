const { exec } = require('child_process');
const fs = require("fs");

require('log-timestamp');


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

async function check_net_state(){
  var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))

  if(config.net.eth0.DHCP==1)
  var ip_state =JSON.parse(await execPromise(`ip -j address show dev eth0`))
  console.log(JSON.stringify(ip_state, null, 2))

    var route_state =(await execPromise(`head /etc/resolv.conf`)).split('\n')[0].split(' ').slice(1,2)
    console.log(route_state)
    
}

check_net_state()