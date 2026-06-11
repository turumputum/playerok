const { spawnSync, exec, execFile } = require('child_process');
const scribbles = require('scribbles');
const fs = require("fs");


function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(`${cmd}`, (error, stdout, stderr) => {
            if ((error) || (stderr)) {
                reject(error + stderr)
            }
            resolve(stdout ? stdout : stderr);
        })
    })
}

function execFilePromise(file, args) {
    return new Promise((resolve, reject) => {
        execFile(file, args, (error, stdout, stderr) => {
            if (error) return reject(error)
            resolve(stdout || stderr)
        })
    })
}

async function set_time_config() {


    scribbles.log(`NTP state:${config.time.NTP}`)
    if (config.time.NTP == '1') {
        try {
            await execFilePromise('timedatectl', ['set-ntp', 'yes'])
            // time_zone comes from config — coerce to integer in valid IANA Etc/GMT range
            const tzRaw = config.time.time_zone
            const tz = Number.parseInt(tzRaw, 10)
            if (!Number.isInteger(tz) || tz < -14 || tz > 14) {
                scribbles.warn(`Invalid time_zone ${JSON.stringify(tzRaw)} — skipping timezone change`)
            } else {
                // Etc/GMT sign is inverted vs UTC offset (Etc/GMT-3 == UTC+3)
                await execFilePromise('timedatectl', ['set-timezone', `Etc/GMT${tz * -1}`])
                scribbles.log("Set NTP true OK, time zone: " + (tz * -1))
            }
        } catch(err) {
            scribbles.log(`Set NTP false:${err}`)
        }
    } else if (config.time.NTP == '0') {
        try {
            await execFilePromise('timedatectl', ['set-ntp', 'false'])
            scribbles.log("Set NTP false OK")
        } catch {
        }
    }

    execFilePromise('reboot', [])
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