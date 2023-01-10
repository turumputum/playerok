const { exec } = require('child_process');
var sudo = require('sudo-js');
sudo.setPassword('playerok');
require('log-timestamp');

const fs = require("fs");

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

async function set_config(){
  try{
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  }catch(err){
    console.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
  }

  // exec(`echo "playerok" | sudo ip addr show`, (error, stdout, stderr) => {
  //   if ((error) || (stderr)) {
  //     console.warn(error)
  //     //reject(error + stderr)
  //   }
  //   //const nets = networkInterfaces();
  //   //console.log(`nets: ${JSON.stringify(nets,null,2)}`)
  //   console.log(`nets: ${stdout.slice(stdout.search('enp1s0'))}`)
  // })
  
  //-------------------------SCREEN-----------------------------------------------
  if(config.screen.resolution !=''){
    await execPromise(`xrandr --output ${config.screen.output_port} --mode ${config.screen.resolution}`)
  }

  if(config.screen.rotation !=''){
    await execPromise(`xrandr --output ${config.screen.output_port} --rotate ${config.screen.rotation}`)
  }
  

  //-------------------------SOUND------------------------------------------------
  if(config.sound.output_device !=''){
    await execPromise(`pacmd set-default-sink ${config.sound.output_device}`)
  }

  if(config.sound.volume !=''){
    await execPromise(`amixer set Master ${config.sound.volume}%`)
  }
  
}

set_config()


