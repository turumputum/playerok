const { spawnSync, exec } = require('child_process');
const scribbles = require('scribbles');
const fs = require("fs");


function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(`${cmd}`, (error, stdout, stderr) => {
            if ((error) || (stderr)) {
                //scribbles.warn(error)
                reject(error + stderr)
            }
            //scribbles.log(`sudo exec: ${cmd} resault ${stdout}`)
            resolve(stdout ? stdout : stderr);
        })
    })
}

async function set_time_config() {
    

    scribbles.log(`NTP state:${config.time.NTP}`)
    if (config.time.NTP == '1') {
        try {
            await execPromise(`timedatectl set-ntp yes`)
            await execPromise(`timedatectl set-timezone Etc/GMT${parseInt(config.time.time_zone) * -1}`)
            scribbles.log("Set NTP true OK, time zone: " + parseInt(config.time.time_zone) * -1)
        } catch(err) {
            scribbles.log(`Set NTP false:${err}`)
        }
    } else if (config.time.NTP == '0') {
        try {
            await execPromise(`timedatectl set-ntp false`)
            scribbles.log("Set NTP false OK")
        } catch {
        }
    }

    execPromise('reboot')
}

try {
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    scribbles.config({
        logLevel:config.log.level,
        format:'{time} [{fileName}] <{logLevel}> {message}'
      })
} catch (err) {
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
}

scribbles.log(`Let set time`)
set_time_config() 