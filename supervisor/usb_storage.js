var watch = require('node-watch')
//var usbDetect = require('usb-detection');
const fs = require("fs");
const { exec } = require('child_process');
const scribbles = require('scribbles');

let usb_watcher = watch('/dev');

function search_usb_storage_dev(path){
  let name = path.split('/').slice(-1)
  if((path.slice(0,7)=='/dev/sd')&&(path.slice(0,8)!='/dev/sda')){
    if(path.slice(-1)=='1'){
      //scribbles.log(path)
      if(fs.existsSync(path)){
        if(fs.existsSync(`/home/playerok/playerok/data/${name}`)==0){
          usb_storages.add_device(path)
        }
      }else{
        scribbles.log(`remove dev: /home/playerok/playerok/data/${name}`)
        if(fs.existsSync(`/home/playerok/playerok/data/${name}`)==1){
          usb_storages.remove_device(path)
        }
      }
    }
    //usb_storages.search_devices()
  }
}

usb_watcher.on('change', function (evt, name) {
  //scribbles.log("Event folder name:"+name.slice(0,7))
  search_usb_storage_dev(name)
})

let usb_storages = class{
  static mountedDevice=[]
  constructor(){
  }
  static add_device(path){
    let name = path.split('/').slice(-1)
    scribbles.log(`add device: ${name}`)
    
    if(this.mountedDevice.find((element)=>element==path)==undefined){
      this.mountedDevice.push(path)
      this.mount(path)
      scribbles.log(this.mountedDevice)
    }

  }

  static remove_device(path){
    let name = path.split('/').slice(-1)
    scribbles.log(`remove device ${name}`)
    this.unmount(path)
    this.mountedDevice = this.mountedDevice.filter((element)=>element!=path)
    scribbles.log(this.mountedDevice)
  }

  static async mount(path){
    let name = path.split('/').slice(-1)
    try{
      await execPromise(`mkdir /home/playerok/playerok/data/${name}`)
      await execPromise(`chmod -R 777 /home/playerok/playerok/data/${name}`)
      await execPromise(`mount ${path} /home/playerok/playerok/data/${name}`)
    }catch(err){
      scribbles.warn(`Umount FAIL: ${err}`)
    }
  }
  
  static async unmount(path){
    let name = path.split('/').slice(-1)
    try{
      await execPromise(`umount /home/playerok/playerok/data/${name}`)
      await execPromise(`rm -r /home/playerok/playerok/data/${name}`)
      scribbles.log(`unmount ${name} OK`)
    }catch(err){
      scribbles.warn(`Umount FAIL: ${err}`)
    }
  }

}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        scribbles.warn(error)
      }
      scribbles.log(`exec: ${cmd} resault ${stdout} stderr: ${stderr}`)
      resolve(stdout? stdout : stderr);
    })
  })
 }




async function onStart(){
  

  try{
    fs.readdir('../data',(err, files) => {
      files.forEach(file => {
        if(file.slice(0,2)=='sd'){
          if(usb_storages.mountedDevice.find((element)=>element==file)==undefined){
            //scribbles.log('UNMOUNt dir')
            usb_storages.remove_device(file)
          }
        }
      })
    
    })
  }catch(err){
    scribbles.warn(`Unmount FAIL: ${err}`)
  }


  try{
    scribbles.log(`Scan connected device`)
    fs.readdir('/dev', (err, files) => {
      files.forEach(file => {
        //scribbles.log(file)
        search_usb_storage_dev(`/dev/${file}`);
      })
    })
  }catch(err){
    scribbles.warn(`Read /dev FAIL: ${err}`)
  }
}

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

onStart()
