var watch = require('node-watch')
//var usbDetect = require('usb-detection');
const fs = require("fs");
const { exec, execFile } = require('child_process');
const scribbles = require('scribbles');

let usb_watcher = watch('/dev');

// Device basename must look like a partition node (sdb1, sdc, mmcblk0p1...) —
// reject anything weird before passing to mount/mkdir/rm. We're called from
// /dev change events; on a sane system this is always safe, but a hostile
// udev rule could create a node with a shell-meta name. Defense in depth.
const SAFE_DEV_NAME_RE = /^[a-z][a-z0-9]{1,30}$/

function isSafeDevName(name) {
  return typeof name === 'string' && SAFE_DEV_NAME_RE.test(name)
}

function execFilePromise(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        scribbles.warn(`execFile ${file} failed: ${error.code || error.message}`)
      }
      resolve(stdout || stderr)
    })
  })
}

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
    const name = path.split('/').slice(-1)[0]
    if (!isSafeDevName(name)) {
      scribbles.warn(`mount rejected — unsafe device name: ${JSON.stringify(name)}`)
      return
    }
    const mountpoint = `/home/playerok/playerok/data/${name}`
    try{
      await execFilePromise('mkdir', ['-p', mountpoint])
      // nosuid: ignore setuid bits on files (no privilege escalation via USB binaries)
      // nodev: ignore device nodes (no /dev/* on the stick)
      // noexec: don't execute binaries directly off the stick
      await execFilePromise('mount', ['-o', 'nosuid,nodev,noexec', path, mountpoint])
    }catch(err){
      scribbles.warn(`Mount FAIL: ${err}`)
    }
  }

  static async unmount(path){
    const name = path.split('/').slice(-1)[0]
    if (!isSafeDevName(name)) {
      scribbles.warn(`unmount rejected — unsafe device name: ${JSON.stringify(name)}`)
      return
    }
    const mountpoint = `/home/playerok/playerok/data/${name}`
    try{
      await execFilePromise('umount', [mountpoint])
      // rmdir (NOT rm -r) — refuses to delete if the dir is non-empty, so a
      // failed umount can't silently nuke files that look like USB content
      await execFilePromise('rmdir', [mountpoint])
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
