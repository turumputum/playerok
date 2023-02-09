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

async function set_net_config() {

    let SSH_state = tryExecSync(`sudo systemctl status ssh | grep Active`).toString().includes('running')
    scribbles.log(`SSH state:${SSH_state}`)

    if((config.security.SSH==1)&&(SSH_state==0)){
        scribbles.log(`Lets start SSH`)
        tryExecSync(`sudo systemctl unmask ssh`)
        tryExecSync(`sudo systemctl start ssh`)
        
    }

    if((config.security.SSH==0)&&(SSH_state==1)){
        scribbles.log(`Lets stop SSH`)
        tryExecSync(`sudo systemctl stop ssh`)
        tryExecSync(`sudo systemctl mask ssh`) 
    }

    tryExecSync(`sudo systemctl restart webka`)

    tryExecSync(`yes ${config.security.admin_pass} | passwd ${config.security.admin_login}`)
}


set_net_config()