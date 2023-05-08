const scribbles = require('scribbles');
const mqtt = require("mqtt");
const Evdev = require('evdev');
const fs = require("fs");
const { exec } = require('child_process');
const child_process = require('child_process').fork;




var current_player_pid
var current_playlist_index = 0



function lastWill(){
    current_player_pid.kill()
}

process.on('SIGTERM', () => {
    scribbles.log(`SIGTERM`)
    lastWill()
    process.exit()
  });
  process.on('SIGINT', () => {
    scribbles.log(`SIGQUIT`)
    lastWill()
    process.exit()
  });
  process.on('SIGQUIT', () => {
    scribbles.log(`SIGQUIT`)
    lastWill()
    process.exit()
  });


var playlist_table = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/playlist-table.json'))
for (index in playlist_table) {
    if (playlist_table[index].type != "multimedia") {
        //console.log(playlist_table[index])
        playlist_table.splice(index, 1)
    }
}

current_player_pid = child_process(`/home/playerok/playerok/player/player.js`, [`${playlist_table[current_playlist_index].path}`])
//console.log(playlist_table)

exec('xinput --list', (error, stdout, stderr) => {
    let rawInput = stdout.split('\n')
    for (let index in rawInput) {
        rawRow = rawInput[index]
        //console.log(rawRow)
        if (rawRow.search("ILITEK") > 0) {
            let splitedRow = rawRow.split('\t')
            let id = splitedRow[1].split('=')[1]
            console.log(`ID to disable xinput:${id}`)
            exec(`xinput disable ${id}`)
        }
    }
})


var devicePath = "/dev/input/by-id/usb-ILITEK_ILITEK-TP-event-if00";
//console.log(devicePath)
const reader = new Evdev();
const target_match = "event-mouse"

reader.on("EV_KEY", function (data) {
    //console.log("key : ", data.code, data.value);
    if (data.value == 1) {
        current_playlist_index += 1
        scribbles.log(`Index:${current_playlist_index}`)
        if (current_playlist_index > (playlist_table.length - 1)) {
            current_playlist_index = 0
        }
        scribbles.log("start Kill")
        current_player_pid.kill()
        scribbles.log("End Kill")
        current_player_pid = child_process(`/home/playerok/playerok/player/player.js`, [`${playlist_table[current_playlist_index].path}`])
        scribbles.log("End play")
    }
}).on("error", function (e) {
    console.log("reader error : ", e);
})

reader.open(devicePath)