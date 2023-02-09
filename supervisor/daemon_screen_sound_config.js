const { spawn, spawnSync, exec, execSync } = require('child_process');
//const file_tools = require("../meta/tools/file_tools");
const scribbles = require('scribbles');
var watch = require('node-watch')
const fs = require("fs");

let meta_watcher = watch('/home/playerok/playerok/meta');

function execPromise(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.warn(error)
        }
        scribbles.log(`exec: ${cmd} resault ${stdout} stderr: ${stderr}`)
        resolve(stdout ? stdout : stderr);
      })
    })
  }

  async function syncSpawn(cmd, arg) {
    const childProcess = spawnSync(cmd, [arg],
        { stdio: [process.stdin, process.stdout, process.stderr] });
}

function set_ss_config(newConfig) {
    

    execPromise(`xrandr --output ${newConfig.screen.output_port} --mode ${newConfig.screen.resolution} --rotate ${newConfig.screen.orientation}`)
    .then(response=>{
        scribbles.log(response)
    })

    if (newConfig.sound.output_device == "Audio Jack") {
        scribbles.log("Set audio jack output")
        syncSpawn(`pacmd`, `set-card-profile 0 output:analog-stereo`)
    } else if (newConfig.sound.output_device == "HDMI") {
        scribbles.log("Set audio HDMI output")
        if (newConfig.screen.output_port == "HDMI-1") {
            syncSpawn(`pacmd`, `set-card-profile 0 output:hdmi-stereo+input:analog-stereo`)
        }
        if (newConfig.screen.output_port == "HDMI-3") {
            syncSpawn(`pacmd`, `set-card-profile 0 output:hdmi-stereo-extra2+input:analog-stereo`)
        }
    }

    let sink = execSync(`pactl info | grep 'Default Sink'`).toString().replace("\n", '').split(":")[1]
    //console.log(sink)
    execPromise(`pactl set-sink-volume ${sink} ${newConfig.sound.volume}%`)
    //scribbles.log("Set screen&sound config OK")
}

try {
    var config = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
    scribbles.config({
        logLevel: config.log.level,
        format: '{time} [{fileName}] <{logLevel}> {message}'
    })
} catch (err) {
    scribbles.error(`Error read file: ${err}`)
    process.exit(1);
}

setTimeout(() => {
    let newConfig = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
    set_ss_config(newConfig)
},5000)

let flag_busy = 0
meta_watcher.on('change', function (evt, path) {
    //scribbles.log(`meta watcher activity:${path} flag_busy:${flag_busy}`)

    if ((path == '/home/playerok/playerok/meta/player_config.json') && (flag_busy == 0)) {
        //scribbles.log("Let's set config")
        flag_busy = 1
        try {
            let newConfig = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
            //console.log(newConfig)
            if ((JSON.stringify(newConfig.screen) !== JSON.stringify(config.screen))||(JSON.stringify(newConfig.sound) !== JSON.stringify(config.sound))) {
                //scribbles.log("sound config changed")
                config = newConfig
                set_ss_config(newConfig)
            }   
        } catch (err) {
            scribbles.log("Set config fail:" + err)
        }
        flag_busy = 0
    }
    

})