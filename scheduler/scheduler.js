require('log-timestamp');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
var watch = require('node-watch')
const child_process = require('child_process');
var kill = require('tree-kill');

var scheduler_table


var state = {
    player_state: 'stop',
    player_pid: '',
    current_playlist_path: '',
    current_playlist_name: ''
}

function start_player(playlist_path) {
    //console.log("start play")
    try {
        state.current_playlist_path = playlist_path
        var playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))
        let index = playlist_table.findIndex((element) => element.path == playlist_path)
        //console.log(`index of playlist is ${index}`)
        state.current_playlist_name = playlist_table[index].name
    } catch (err) {
        console.log(`Set playlist name fail: ${err}`)
    }

    try {
        state.player_pid = child_process.fork(`../player/player.js`, [`${playlist_path}`])
        state.player_state = 'play'
        console.log(`start player OK`)
        client.publish('scheduler/current_playlist', `${state.current_playlist_name}`, { retain: true })
        
    } catch (err) {
        console.log(`start player FAILED: ${err}`)
    }



    //setTimeout(stop_player,10000)
}

function stop_player() {
    //console.log("stop play")
    state.current_playlist_name = ''
    state.current_playlist_path = ''
    try {

        console.log(`stop player:` + state.player_pid.kill('SIGTERM'))
        client.publish('scheduler/current_playlist', `none`, { retain: true })
        client.publish('player/state', `stop`, { retain: true })
        client.publish('scheduler/on_off_time', `--:--/--:--`, { retain: true })
        state.player_state = 'stop'
    } catch (err) {
        console.log(`stop player FAILED: ${err}`)
    }

    // setTimeout(function() {
    //     start_player('data/playlists/playlist_1.json');
    // }, 5000)
}

function check_state() {
    let date_ob = new Date();
    let current_time_in_minutes = date_ob.getMinutes() + date_ob.getHours() * 60
    let current_day = date_ob.getDay()
    if (current_day == 0) {//-------------
        current_day = 7
    }
    //console.log(`Current day: '${current_day}' `)

    let flag_valid_playlist = 0
    //console.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table, null, 2)}`)
    for (var index in scheduler_table) {
        let task = scheduler_table[index]
        
        if (task.day_of_week.search(`${current_day}`) >= 0) {//---------day in list ---------------
            let playlist_start_time_in_minutes = parseInt(task.start_time.split(':')[0]) * 60 + parseInt(task.start_time.split(':')[1])
            if (playlist_start_time_in_minutes <= current_time_in_minutes) {
                let playlist_end_time_in_minutes = parseInt(task.end_time.split(':')[0]) * 60 + parseInt(task.end_time.split(':')[1])
                //console.log(`current_time_in_minutes: ${current_time_in_minutes} \n playlist_start_time_in_minutes: ${playlist_start_time_in_minutes} \n playlist_end_time_in_minutes: ${playlist_end_time_in_minutes}`)
                if (playlist_end_time_in_minutes > current_time_in_minutes) {
                    if ((state.current_playlist_path != task.path) && (task.type == 'multimedia')) {
                        //----- it's playlist ok ----
                        if (state.player_state == 'stop') {
                            start_player(task.path)
                            client.publish('scheduler/on_off_time', `${task.start_time}/${task.end_time}`, { retain: true })
                            //console.log(`lets play playlist ${state.current_playlist_name} from idle state`)
                        } else if (state.player_state == "play") {
                            stop_player()
                            start_player(playlist.path)
                            //console.log(`lets play playlist ${state.current_playlist_name} overlay previus playlist`)
                        }
                    }
                    flag_valid_playlist = 1
                    //console.log(`valid playlist is ${state.current_playlist_name} playing....`)
                    break //playlist is valid, no time to turn off
                }
            }
        }
    }
    //-----nothin to play-------------
    if ((state.player_state == "play") && (flag_valid_playlist == 0)) {
        stop_player()
        console.log(`no valid playlists, stop`)
    }

    setTimeout(check_state, 10000)

}

let table_watcher = watch('../meta/scheduler-table.json', { recursive: false });
table_watcher.on('change', function (evt, name) {
    try {
        scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
        //console.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table,null,2)}`)
    } catch (err) {
        console.error(`: ${err}`)
        process.exit(1);
    }
})

let playlist_watcher = watch('../data/playlists', { recursive: false });
playlist_watcher.on('change', function (evt, name) {
    try {
        console.log('Reset playlist on playlist update')
        stop_player()
        setTimeout(check_state,500)
    } catch (err) {
        console.error(`: ${err}`)
        process.exit(1);
    }
})


function mqtt_sub(topic) {
    if (client.subscribe(topic, function (err) {
      if (err) {
        console.error(`subscribe to: ${topic} filed: ${err}`)
        log_file(`subscribe to: ${topic} filed: ${err}`, '../logs/player_log.log')
        return err
      } else {
        console.log(`subscribe OK to: ${topic}`)
        return true
      }
    })) {
      return true
    }
  }


const client = mqtt.connect('mqtt://127.0.0.1:1883')
client.on('connect', function () {
    console.log("mqtt brocker connected!");

    mqtt_sub('scheduler/restart')
})

client.on('message', function (topic, message) {

    //--------MQTT------Action on playlist topics------------------
    console.log('Incoming message')
    
    if ((topic =='scheduler/restart')&&(message =='1')){
        console.log('Reset playlist on MQTT command')
        stop_player()
        setTimeout(check_state,500)
    }
})

try {
    scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
    //console.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table,null,2)}`)
} catch (err) {
    console.error(`: ${err}`)
    process.exit(1);
}




check_state()
//start_player('data/playlists/playlist_1.json')
