const { spawnSync, spawn, exec, execFile, execSync } = require('child_process');

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

// Set the password for `login` by feeding "login:password\n" into `chpasswd`
// via stdin. No shell, no interpolation — `password` may contain any character
// except newline and NUL (which we reject below).
function setUnixPassword(login, password) {
    return new Promise((resolve) => {
        const child = spawn('sudo', ['chpasswd'], { stdio: ['pipe', 'pipe', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', d => stderr += d.toString())
        child.on('error', err => {
            scribbles.warn(`chpasswd spawn error: ${err.message}`)
            resolve(false)
        })
        child.on('close', code => {
            if (code === 0) {
                scribbles.log(`chpasswd OK for user ${login}`)
                resolve(true)
            } else {
                // Do not log the line itself (contains the password)
                scribbles.warn(`chpasswd exited with code ${code}: ${stderr.replace(login + ':', login + ':[REDACTED]')}`)
                resolve(false)
            }
        })
        child.stdin.end(`${login}:${password}\n`)
    })
}

// Keep the MQTT broker password in sync with the admin password so the whole
// appliance uses ONE credential (panel + SSH + MQTT). Regenerates the mosquitto
// password file and bounces the broker. The broker only enforces it once
// mqtt_auth_enable.sh has added `password_file` to mosquitto.conf — until then
// this is a harmless no-op (file written, ignored by the still-anonymous broker).
function syncMqttPassword(login, password) {
    const PW = '/etc/mosquitto/passwd'
    const r = spawnSync('sudo', ['mosquitto_passwd', '-b', '-c', PW, login, password])
    if (r.status === 0) {
        tryExecSync(`sudo chown mosquitto:mosquitto ${PW}`)
        tryExecSync(`sudo chmod 600 ${PW}`)
        scribbles.log('mosquitto password file updated')
        tryExecSync(`sudo systemctl restart mosquitto`)
        // Bounce the bus clients so they reconnect with the new credential.
        // (webka is restarted above; scheduler restart cascades to player.js.)
        tryExecSync(`sudo systemctl restart scheduler`)
    } else {
        scribbles.warn(`mosquitto_passwd failed (code ${r.status}): ${r.stderr ? r.stderr.toString() : ''}`)
    }
}

// POSIX-portable usernames: start with letter or _, then letters/digits/_/-
const VALID_USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/

function isValidUsername(s) { return typeof s === 'string' && VALID_USERNAME_RE.test(s) }
function isValidPassword(s) {
    // Reject NUL and newline (would break the chpasswd input framing) and empty
    return typeof s === 'string' && s.length >= 1 && s.length <= 256 && s.indexOf('\0') === -1 && s.indexOf('\n') === -1
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

    const login = config.security.admin_login
    const pass = config.security.admin_pass
    if (!isValidUsername(login)) {
        scribbles.warn(`Skipping password change — invalid admin_login (must match ${VALID_USERNAME_RE})`)
    } else if (!isValidPassword(pass)) {
        scribbles.warn(`Skipping password change — admin_pass missing or contains forbidden chars (\\n, \\0)`)
    } else {
        await setUnixPassword(login, pass)
        syncMqttPassword(login, pass)
    }
}


set_net_config()