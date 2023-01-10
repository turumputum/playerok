const { exec } = require('child_process');
require('log-timestamp');
const fs = require("fs");


function execSudoPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(`sudo ${cmd}`, (error, stdout, stderr) => {
            if ((error) || (stderr)) {
                //console.warn(error)
                reject(error + stderr)
            }
            //console.log(`sudo exec: ${cmd} resault ${stdout}`)
            resolve(stdout ? stdout : stderr);
        })
    })
}

async function set_time_config() {
    try {
        var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    } catch (err) {
        console.error(`Error read file: ${err}`)
        //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
        process.exit(1);
    }

    console.log(`NTP state:${config.time.NTP}`)
    if (config.time.NTP == '1') {
        try {
            await execSudoPromise(`timedatectl set-ntp yes`)
            await execSudoPromise(`timedatectl set-timezone Etc/GMT${parseInt(config.time.time_zone) * -1}`)
            console.log("Set NTP true OK, time zone: " + parseInt(config.time.time_zone) * -1)
        } catch(err) {
            console.log(`Set NTP false:${err}`)
        }
    } else if (config.time.NTP == '0') {
        try {
            await execSudoPromise(`timedatectl set-ntp false`)
            console.log("Set NTP false OK")
        } catch {
        }
    }
}

console.log(`Let set time`)
set_time_config() 