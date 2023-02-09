const { spawnSync, exec, execSync } = require('child_process');

const fs = require("fs");

const scribbles = require('scribbles');


async function asyncSpawn(cmd, arg) {
    const childProcess = spawnSync(cmd, [arg],
        { stdio: [process.stdin, process.stdout, process.stderr] });
}

async function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                scribbles.warn(error)
            }
            //scribbles.log(`sudo exec: ${cmd} resault ${stdout}`)
            resolve(stdout ? stdout : stderr);
        })
    })
}

function tryExecSync(cmd) {
    try {
        return execSync(cmd)
    } catch {
        scribbles.log(`exec ${cmd} failed`)
        return 'fail'
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
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
}

async function set_log_config() {

    tryExecSync(`sudo systemctl restart webka`)
    tryExecSync(`sudo systemctl restart scheduler`)
    tryExecSync(`sudo systemctl restart uart2mqtt`)
    tryExecSync(`sudo systemctl restart usb_storage`)
    tryExecSync(`sudo systemctl restart screen_sound_config`)
    tryExecSync(`sudo systemctl restart supervisor`)
    scribbles.log(`Services restarted`)

}


set_log_config()