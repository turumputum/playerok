const { exec } = require('child_process');
require('log-timestamp');
const fs = require("fs");


function execSudoPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(` ${cmd}`, (error, stdout, stderr) => {
            if ((error) || (stderr)) {
                //console.warn(error)
                reject(error + stderr)
            }
            //console.log(`sudo exec: ${cmd} resault ${stdout}`)
            resolve(stdout ? stdout : stderr);
        })
    })
}

async function set_screen_config() {
    try {
        var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    } catch (err) {
        console.error(`Error read file: ${err}`)
        //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
        process.exit(1);
    }

    execSudoPromise(`xrandr --output ${config.screen.output_port} --mode ${config.screen.resolution} -o ${config.screen.orientation}`)

    
}

console.log(`Let set screen config`)
set_screen_config() 