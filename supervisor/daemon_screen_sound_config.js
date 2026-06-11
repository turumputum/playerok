const { spawn, spawnSync, exec, execFile, execFileSync, execSync } = require('child_process');
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

  async function syncSpawn(cmd, arg) {
    const childProcess = spawnSync(cmd, [arg],
        { stdio: [process.stdin, process.stdout, process.stderr] });
}

// xrandr output names: connector ids like HDMI-1, DP-2, eDP1, VGA-0
const OUTPUT_RE = /^[A-Za-z][A-Za-z0-9-]{0,31}$/
// xrandr --mode accepts WxH (e.g. 1920x1080)
const RESOLUTION_RE = /^\d{2,5}x\d{2,5}$/
const ORIENTATION_ALLOWLIST = new Set(['normal', 'left', 'right', 'inverted'])

function set_ss_config(newConfig) {
    const port = newConfig.screen.output_port
    const mode = newConfig.screen.resolution
    const rotate = newConfig.screen.orientation
    if (!OUTPUT_RE.test(port || '')) {
        scribbles.warn(`Invalid screen.output_port ${JSON.stringify(port)} — skipping xrandr`)
    } else if (!RESOLUTION_RE.test(mode || '')) {
        scribbles.warn(`Invalid screen.resolution ${JSON.stringify(mode)} — skipping xrandr`)
    } else if (!ORIENTATION_ALLOWLIST.has(rotate)) {
        scribbles.warn(`Invalid screen.orientation ${JSON.stringify(rotate)} — skipping xrandr`)
    } else {
        execFilePromise('xrandr', ['--output', port, '--mode', mode, '--rotate', rotate])
            .then(response => scribbles.log(response))
    }

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

    // pactl info output line: "Default Sink: alsa_output.pci-0000_00_1f.3.analog-stereo"
    let sink = ''
    try {
        const info = execFileSync('pactl', ['info']).toString()
        const m = info.split('\n').find(l => l.startsWith('Default Sink:'))
        if (m) sink = m.split(':')[1].trim()
    } catch (e) {
        scribbles.warn(`pactl info failed: ${e.message}`)
    }
    const volume = Number.parseInt(newConfig.sound.volume, 10)
    if (sink && /^[A-Za-z0-9._-]+$/.test(sink) && Number.isInteger(volume) && volume >= 0 && volume <= 150) {
        execFilePromise('pactl', ['set-sink-volume', sink, `${volume}%`])
        execFilePromise('pactl', ['set-sink-mute', sink, '0'])
    } else {
        scribbles.warn(`Skipping pactl: sink=${JSON.stringify(sink)} volume=${JSON.stringify(newConfig.sound.volume)}`)
    }
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