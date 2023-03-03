
const { fork, spawn, spawnSync, exec } = require('child_process');
const file_tools = require("../meta/tools/file_tools");
const scribbles = require('scribbles');
const child_process = require('child_process');

var watch = require('node-watch')

const fs = require("fs");
const chokidar = require('chokidar');


//let data_watcher = watch('../data', { recursive: true });
// let data_watcher = chokidar.watch('/home/playerok/playerok/logs', {
//   persistent: true
// });
let meta_watcher = watch('../meta');
let playlist_watcher = watch('../data/playlists');
//let net_watcher = watch('/sys/class/net', { recursive: true });

const microsecond = () => Number(Date.now() + String(process.hrtime()[1]).slice(3, 6))

function set_config() {
  scribbles.log("Let's set config")
  try {
    var newConfig = JSON.parse(fs.readFileSync('../meta/player_config.json'))

    if (JSON.stringify(newConfig.time) !== JSON.stringify(config.time)) {
      scribbles.log("time config changed")
      asyncSpawn(`node`, `set_time_config.js`)
    }
    if (JSON.stringify(newConfig.security) !== JSON.stringify(config.security)) {
      scribbles.log("Security config changed")
      asyncSpawn(`node`, `set_security_config.js`)
    }

    if (JSON.stringify(newConfig.net) !== JSON.stringify(config.net)) {
      scribbles.log("Net config changed")
      asyncSpawn(`node`, `set_net_config.js`)
    }

    if (JSON.stringify(newConfig.log) !== JSON.stringify(config.log)) {
      scribbles.log("Log config changed")
      asyncSpawn(`node`, `set_log_config.js`)
    }

    
    scribbles.log("Set config OK")
  } catch (err) {
    scribbles.log("Set config fail:" + err)
  }
  config = newConfig
}

async function asyncSpawn(cmd, arg) {
  const childProcess = spawnSync(cmd, [arg],
    { stdio: [process.stdin, process.stdout, process.stderr] });
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(error)
      }
      //scribbles.log(`exec: ${cmd} resault ${stdout} stderr: ${stderr}`)
      resolve(stdout ? stdout : stderr);
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
        scribbles.log(`set ${property_2} in group ${property_1}`)
      }
    }

    fs.writeFileSync(('../meta/player_config.json'), JSON.stringify(main_config, null, 2))
    fs.unlinkSync(path)
    set_config()

  } catch (err) {
    scribbles.log(`merge config fail: ${err}`)
  }
}


//------------------on start--------------------

//---get config---
var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
//---config logger---
scribbles.config({
  logLevel: config.log.level,
  format: '{time} [{fileName}] <{logLevel}> {message}'
})
//---clean log---
fs.writeFileSync('/home/playerok/playerok/logs/playerok.log', ' ')
scribbles.log(`Supervisor config OK`)

//---continue instalation---
if (fs.existsSync(`/home/playerok/playerok/meta/flag_firstRunAfterInstall`)) {
  scribbles.log(`continue installation`)
  asyncSpawn(`sh`, `/home/playerok/playerok/supervisor/installer_2.sh`)
  asyncSpawn(`node`, `set_net_config.js`)
}


//---start usb whatcher---
var usb_watcher = fork(`usb_storage.js`)
usb_watcher.on('close', function (code) {
  scribbles.log('usb_watcher exited with code ' + code + "restart");
  usb_watcher = fork(`usb_storage.js`)
});

//---start UART2MQTT whatcher---
var uart2mqtt = fork(`/home/playerok/playerok/uart2mqtt/uart2mqtt.js`)
uart2mqtt.on('close', function (code) {
  scribbles.log('uart2mqtt exited with code ' + code + "restart");
  uart2mqtt = fork(`/home/playerok/playerok/uart2mqtt/uart2mqtt.js`)
});

setTimeout(() => {

  chokidar.watch('/home/playerok/playerok/data', { ignoreInitial: true }).on('all', function (evt, path) {
    //scribbles.log(`data_watcher activity evt:${evt} path:${path}`)
    //if (path == '../data/usb/player_config.json') {
    let name = path.split('/').slice(-1)[0]

    if (name.slice(0, 2) == 'sd') {
      //scribbles.log("Evet path:"+path+" name: "+name+" try: "+name.slice(0,2))
      if (fs.existsSync(`${path}/player_config.json`)) {
        scribbles.log(`Let's merge config: ${path}/player_config.json`)
        merge_config(`${path}/player_config.json`)
      }
    }


    if ((file_tools.check_type(path) == 'pic') || (file_tools.check_type(path) == 'video') || (file_tools.check_type(path) == 'sound')) {
      try {
        scribbles.log("Let's update content table")

        asyncSpawn(`node`, `content_table_update.js`)
      } catch (err) {
        scribbles.log("Content table update fail:" + err)
      }
    }
  })


  playlist_watcher.on('change', function (evt, path) {
    try {
      scribbles.log("Let's update playlists table")
      const config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
      asyncSpawn(`node`, `playlist_table_update.js`)
      //exec(`node playlist_table_update.js >> ../logs/update_playlist.log`)
      
    } catch (err) {
      scribbles.log("Playlist table update fail:" + err)
    }
  })

  let flag_busy = 0
  meta_watcher.on('change', function (evt, path) {
    //scribbles.log(`meta watcher activity:${path} flag_busy:${flag_busy}`)

    if ((path == '../meta/player_config.json') && (flag_busy == 0)) {
      //scribbles.log("Let's set config")
      flag_busy = 1
      set_config()
      flag_busy = 0
    }

  })

  scribbles.log(`watchers started`)
}, 4000)


