var watch = require('node-watch')
var usbDetect = require('usb-detection');
const fs = require("fs");
const { exec } = require('child_process');

let usb_watcher = watch('/dev');

function search_usb_storage_dev(path){
  let name = path.split('/').slice(-1)
  if(path.slice(0,7)=='/dev/sd'){
    if(path.slice(-1)=='1'){
      //console.log(path)
      if(fs.existsSync(path)){
        if(fs.existsSync(`/home/playerok/workSol_1/data/${name}`)==0){
          usb_storages.add_device(path)
        }
      }else{
        console.log(`remove dev: /home/playerok/workSol_1/data/${name}`)
        if(fs.existsSync(`/home/playerok/workSol_1/data/${name}`)==1){
          usb_storages.remove_device(path)
        }
      }
    }
    //usb_storages.search_devices()
  }
}

usb_watcher.on('change', function (evt, name) {
  //console.log("Event folder name:"+name.slice(0,7))
  search_usb_storage_dev(name)
})

let usb_storages = class{
  static mountedDevice=[]
  constructor(){
  }
  static add_device(path){
    let name = path.split('/').slice(-1)
    console.log(`add device: ${name}`)
    
    if(this.mountedDevice.find((element)=>element==path)==undefined){
      this.mountedDevice.push(path)
      this.mount(path)
      console.log(this.mountedDevice)
    }

  }

  static remove_device(path){
    let name = path.split('/').slice(-1)
    console.log(`remove device ${name}`)
    this.unmount(path)
    this.mountedDevice = this.mountedDevice.filter((element)=>element!=path)
    console.log(this.mountedDevice)
  }

  static async mount(path){
    let name = path.split('/').slice(-1)
    try{
      await execPromise(`mkdir /home/playerok/workSol_1/data/${name}`)
      await execPromise(`chmod -R 777 /home/playerok/workSol_1/data/${name}`)
      await execPromise(`mount ${path} /home/playerok/workSol_1/data/${name}`)
    }catch(err){
      console.warn(`Umount FAIL: ${err}`)
    }
  }
  
  static async unmount(path){
    let name = path.split('/').slice(-1)
    try{
      await execPromise(`umount /home/playerok/workSol_1/data/${name}`)
      await execPromise(`rm -r /home/playerok/workSol_1/data/${name}`)
      console.log(`unmount ${name} OK`)
    }catch(err){
      console.warn(`Umount FAIL: ${err}`)
    }
  }

}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(error)
      }
      console.log(`exec: ${cmd} resault ${stdout} stderr: ${stderr}`)
      resolve(stdout? stdout : stderr);
    })
  })
 }




async function onStart(){
  try{
    console.log(`Scan connected device`)
    fs.readdir('/dev', (err, files) => {
      files.forEach(file => {
        //console.log(file)
        search_usb_storage_dev(`/dev/${file}`);
      })
    })
  }catch(err){
    console.warn(`Read /dev FAIL: ${err}`)
  }

  try{
    fs.readdir('../data',(err, files) => {
      files.forEach(file => {
        if(file.slice(0,2)=='sd'){
          if(usb_storages.mountedDevice.find((element)=>element==file)==undefined){
            //console.log('UNMOUNt dir')
            usb_storages.remove_device(file)
          }
        }
      })
    
    })
  }catch(err){
    console.warn(`Unmount FAIL: ${err}`)
  }
}

onStart()
