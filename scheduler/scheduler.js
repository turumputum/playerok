const scribbles = require('scribbles');
const { exec } = require('child_process');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
var watch = require('node-watch')
const child_process = require('child_process');
var kill = require('tree-kill');
//const { config } = require('process');

var scheduler_table


function execPromise(cmd) {
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

var state = {
    player_state: 'stop',
    player_pid: '',
    current_playlist_path: '',
    current_playlist_name: '',
    current_task_trigger: '',
    current_actions:[]
}

function start_player(playlist_path) {
    if (config.screen.autoTurnOff == 1) {
        execPromise(`xrandr --output ${config.screen.output_port} --auto`)
    }

    //scribbles.log("start play")
    try {
        state.current_playlist_path = playlist_path
        var playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))
        let index = playlist_table.findIndex((element) => element.path == playlist_path)
        //scribbles.log(`index of playlist is ${index}`)
        state.current_playlist_name = playlist_table[index].name
    } catch (err) {
        scribbles.log(`Set playlist name fail: ${err}`)
    }

    try {
        state.player_pid = child_process.fork(`../player/player.js`, [`${playlist_path}`])
        state.player_state = 'play'
        scribbles.log(`start player OK`)
        client.publish('scheduler/current_playlist', `${state.current_playlist_name}`, { retain: true })

    } catch (err) {
        scribbles.log(`start player FAILED: ${err}`)
    }

    let index = scheduler_table.findIndex((element) => element.playlist_path == playlist_path)
    
    state.current_task_trigger = scheduler_table[index].trigger_type
    state.current_actions=scheduler_table[index].actions

    state.current_actions.forEach(action=>{
        if(action.event == 'start'){
            scribbles.log(`publish action ${action.topic}:${action.payload}`)
            client.publish(action.topic, action.payload, { retain: true })
        }
    })

    //setTimeout(stop_player,10000)
}

function stop_player() {
    //scribbles.log("stop play")
    state.current_playlist_name = ''
    state.current_playlist_path = ''
    try {

        scribbles.log(`stop player:` + state.player_pid.kill('SIGTERM'))
        client.publish('scheduler/current_playlist', `none`, { retain: true })
        client.publish('player/state', `stop`, { retain: true })
        client.publish('scheduler/on_off_time', `--:--/--:--`, { retain: true })

        state.player_state = 'stop'
    } catch (err) {
        scribbles.log(`stop player FAILED: ${err}`)
    }

    state.current_task_trigger =''

    state.current_actions.forEach(action=>{
        if(action.event == 'start'){
            scribbles.log(`publish action ${action.topic}:${action.payload}`)
            client.publish(action.topic, action.payload, { retain: true })
        }
    })

    if (config.screen.autoTurnOff == 1) {
        scribbles.log(`auto turn off screen`)
        execPromise(`xrandr --output ${config.screen.output_port} --off`)
    }

}

function check_state() {
    let date_ob = new Date();
    let current_time_in_minutes = date_ob.getMinutes() + date_ob.getHours() * 60
    let current_day = date_ob.getDay()
    if (current_day == 0) {//-------------
        current_day = 7
    }

    
    //scribbles.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table, null, 2)}`)
    
    if(state.current_task_trigger == 'topic'){
        //
    }else{

        for (var index in scheduler_table) {
            let task = scheduler_table[index]

            if((task.day_of_week =='')||(task.day_of_week ==undefined)){
                
            }else{
                if (task.day_of_week.search(`${current_day}`) >= 0) {//---------day in list ---------------
                    let playlist_start_time_in_minutes = parseInt(task.start_time.split(':')[0]) * 60 + parseInt(task.start_time.split(':')[1])
                    if (playlist_start_time_in_minutes <= current_time_in_minutes) {
                        let playlist_end_time_in_minutes = parseInt(task.end_time.split(':')[0]) * 60 + parseInt(task.end_time.split(':')[1])
                        //scribbles.log(`current_time_in_minutes: ${current_time_in_minutes} \n playlist_start_time_in_minutes: ${playlist_start_time_in_minutes} \n playlist_end_time_in_minutes: ${playlist_end_time_in_minutes}`)
                        if (playlist_end_time_in_minutes > current_time_in_minutes) {
                            if ((state.current_playlist_path != task.path) && (task.type == 'multimedia')) {
                                //----- it's playlist ok ----
                                if (state.player_state == 'stop') {
                                    start_player(task.path)
                                    client.publish('scheduler/on_off_time', `${task.start_time}/${task.end_time}`, { retain: true })
                                    //scribbles.log(`lets play playlist ${state.current_playlist_name} from idle state`)
                                } else if (state.player_state == "play") {
                                    stop_player()
                                    start_player(playlist.path)
                                    //scribbles.log(`lets play playlist ${state.current_playlist_name} overlay previus playlist`)
                                }
                            }
                            flag_valid_playlist = 1
                            //scribbles.log(`valid playlist is ${state.current_playlist_name} playing....`)
                            break //playlist is valid, no time to turn off
                        }else{
                            flag_valid_playlist = 0
                        }
                    }
                }
            }
        }
    }
    //-----nothin to play-------------
    if ((state.player_state == "play") && (flag_valid_playlist == 0)) {
        scribbles.log(`no valid playlists, stop`)
        stop_player()
        
    }

    setTimeout(check_state, 10000)

}

let table_watcher = watch('../meta/scheduler-table.json', { recursive: false });
table_watcher.on('change', function (evt, name) {
    try {
        scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
        topic_list_refresh()
        //scribbles.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table,null,2)}`)
    } catch (err) {
        scribbles.error(`: ${err}`)
        process.exit(1);
    }
})

let playlist_watcher = watch('../data/playlists', { recursive: false });
playlist_watcher.on('change', function (evt, name) {
    try {
        scribbles.log('Reset playlist on playlist update')
        stop_player()
        setTimeout(check_state, 500)
    } catch (err) {
        scribbles.error(`: ${err}`)
        process.exit(1);
    }
})


function mqtt_sub(topic) {
    if (client.subscribe(topic, function (err) {
        if (err) {
            scribbles.error(`subscribe to: ${topic} filed: ${err}`)
            log_file(`subscribe to: ${topic} filed: ${err}`, '../logs/player_log.log')
            return err
        } else {
            scribbles.log(`subscribe OK to: ${topic}`)
            return true
        }
    })) {
        return true
    }
}


const client = mqtt.connect('mqtt://127.0.0.1:1883')
client.on('connect', function () {
    scribbles.log("mqtt brocker connected!");

    mqtt_sub('scheduler/restart')
    topic_list_refresh()
})

client.on('message', function (topic, message) {

    //--------MQTT------Action on playlist topics------------------
    scribbles.log('Incoming message')

    if ((topic == 'scheduler/restart') && (message == '1')) {
        scribbles.log('Reset playlist on MQTT command')
        stop_player()
        setTimeout(check_state, 500)
    }else{
        scheduler_table.forEach(task => {
            if(task.trigger_type=='topic'){
                task.trigger_topics.forEach(task_topic => {
                    if((topic == task_topic.topic)&&(message == task_topic.payload)){
                        scribbles.log(`topic comparation true for ${task_topic.topic}`)
                        if(task_topic.event=='start'){
                            stop_player()
                            start_player(task.playlist_path)
                            flag_valid_playlist = 1
                        }else if(task_topic.event=='stop'){
                            stop_player()
                            flag_valid_playlist = 0
                        }
                    }
                })
            }
        })
    }
})

function topic_list_refresh(){
    trigger_topic_list = []

    scheduler_table.forEach(task => {
        if(task.trigger_type=='topic'){
            task.trigger_topics.forEach(topic => {
                mqtt_sub(topic.topic)
            })
        }

        task.actions.forEach(topic => {
            mqtt_sub(topic.topic)
        })
        
    });

    scribbles.log(`topic_list_refresh OK`)
}

try {
    scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
    //scribbles.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table,null,2)}`)
} catch (err) {
    scribbles.error(`: ${err}`)
    process.exit(1);
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


check_state()
//start_player('data/playlists/playlist_1.json')
