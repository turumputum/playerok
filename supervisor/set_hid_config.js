const { exec } = require('child_process');
var sudo = require('sudo-js');
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

async function set_hid_config(){
    try{
      var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    }catch(err){
      console.error(`Error read file: ${err}`)
      //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
      process.exit(1);
    }

    console.log(`start read hid`)
    let rawHidList =await execPromise(`ls /sys/bus/hid/drivers/hid-generic/`)
    let hidList = rawHidList.split("\n").filter(folderName => folderName.length > 18)
    console.log(`end read hid: ${hidList}`)
    hidList.forEach(element => {
        if((config.usb.whiteList.find(dev => dev == element)!= undefined) || (config.usb.enableAll==1)){
            try{
                execPromise(`echo ${element} | tee /sys/bus/hid/drivers/hid-generic/bind`)
                console.log(`bind element:${element}`)
            }catch{}
        }else{
            try{
                execPromise(`echo ${element} | tee /sys/bus/hid/drivers/hid-generic/unbind`) 
                console.log(`unbind element:${element}`)
            }catch{}
        }
    });
    



}

console.log(`start`)
set_hid_config()