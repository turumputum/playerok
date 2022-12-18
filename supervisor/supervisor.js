//const { exec } = require('child_process');
//var sudo = require('sudo-js');
//sudo.setPassword('playerok');

require('log-timestamp');
const { exec } = require('child_process');
const file_tools = require("../meta/tools/file_tools");
const child_process = require('child_process');

var watch = require('node-watch')
var Netmask = require('netmask').Netmask
const fs = require("fs");

const log_file = require('log-to-file');

let data_watcher = watch('../data', { recursive: true });
let meta_watcher = watch('../meta');
let playlist_watcher = watch('../data/playlists');
let usb_watcher = watch('/dev');



function set_config(){
  console.log("Let's set config")
  try{
    const config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    if(config.log.log_enable==1){
      execPromise(`node set_config.js >> ../logs/supervisor.log &`)
      //exec(`node playlist_table_update.js >> ../logs/update_playlist.log`)
    }else if(config.log.log_enable==0){
      execPromise(`node set_config.js &`)
    }
    console.log("Set config OK")
  }catch(err){
    console.log("Set config fail:"+err)
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

function merge_config(path) {
  try {
    let main_config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    let new_config = JSON.parse(fs.readFileSync(path))

    for (const property_1 in new_config) {
      for (const property_2 in new_config[property_1]) {
        main_config[property_1][property_2] = new_config[property_1][property_2]
        console.log(`set ${property_2} in group ${property_1}`)
      }
    }

    fs.writeFileSync(('../meta/player_config.json'), JSON.stringify(main_config, null, 2))
    fs.unlinkSync(path)
    set_config()
    
  } catch (err) {
    console.log(`merge config fail: ${err}`)
  }
}

setTimeout(set_config, 1000)

setTimeout(()=>{
  // usb_watcher.on('change', function (evt, name) {
    
  // })
  
  data_watcher.on('change', function (evt, path) {
    
    //if (path == '../data/usb/player_config.json') {
    let name = path.split('/').slice(-1)[0]
    
    if(name.slice(0,2)=='sd'){
      //console.log("Evet path:"+path+" name: "+name+" try: "+name.slice(0,2))
      if (fs.existsSync(`${path}/player_config.json`)) {
        console.log(`Let's merge config: ${path}/player_config.json`)
        merge_config(`${path}/player_config.json`)
      }
    }

  
    if ((file_tools.check_type(path) == 'pic') || (file_tools.check_type(path) == 'video') || (file_tools.check_type(path) == 'sound')) {
      try{
        console.log("Let's update content table")
        const config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
        if(config.log.log_enable==1){
          execPromise(`node content_table_update.js >> ../logs/supervisor.log &`)
        }else if(config.log.log_enable==0){
          execPromise(`node content_table_update.js &`)
        }
      }catch(err){
        console.log("Content table update fail:"+err)
      }
    }
  })
  
  playlist_watcher.on('change', function (evt, path) {
    try{
      console.log("Let's update playlists table")
      const config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
      if(config.log.log_enable==1){
        execPromise(`node playlist_table_update.js >> ../logs/supervisor.log &`)
        //exec(`node playlist_table_update.js >> ../logs/update_playlist.log`)
      }else if(config.log.log_enable==0){
        execPromise(`node playlist_table_update.js &`)
      }
    }catch(err){
      console.log("Playlist table update fail:"+err)
    }
  })
  
  meta_watcher.on('change', function (evt, path) {
    let flag_busy
    if ((path == '../meta/player_config.json')&&(flag_busy=0)) {
      console.log("Let's set config")
      flag_busy=1
      set_config()
      flag_busy=0
    }
    
  })
},4000)


