var tar = require('tar-fs')
const fs = require('fs');
const scribbles = require('scribbles');
const { fork, spawn, spawnSync, exec } = require('child_process');

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
  
var args = process.argv.slice(2);
if (args == 'undefined'){
    scribbles.log(`wrong argument`)
    process.exit()
} 


const arhive_path = `/home/playerok/playerok/${args[0]}`
if(fs.existsSync(arhive_path)==false){
    scribbles.log(`file does not exist: ${arhive_path}`)
    process.exit()
}

const updateDir = arhive_path.split('.')[0]
exec(`mkdir ${updateDir}`)
scribbles.log(`arh:${arhive_path} update_dir:${updateDir}`)

const unpacker = fs.createReadStream(arhive_path)
    .pipe(tar.extract(updateDir))
    .on('finish', (chunk) => {
        const updateScript = `${updateDir}/update.sh`
        scribbles.log(`Unpack OK, run script: ${updateScript}`)
        if(fs.existsSync(updateScript)==false){
            scribbles.log(`Update script not found`)
            process.exit()
        }
        execPromise(`${updateScript}`)
        .then(()=>{
            exec(`rm ${arhive_path}`)
            exec(`rm -r ${updateDir}`)
        }).then(()=>{
            scribbles.log(`Update OK, exit`)
            process.exit()
        })

    })

