const scribbles = require('scribbles');
const { exec } = require('child_process');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
var watch = require('node-watch')
const child_process = require('child_process');


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
    current_task_pid: '',
    current_task_index: -1,
    runing_scripts_list:[]
}

function start_player(index) {

    //scribbles.log("start play")

    try {
        state.current_task_pid = child_process.fork(`../player/player.js`, [`${scheduler_table[index].playlist_path}`])
        flag_player_started = 1;
    } catch (err) {
        scribbles.log(`start player FAILED: ${err}`)
    }

}

function stop_player() {
    //scribbles.log("stop play")

    try {

        scribbles.log(`stop player:` + state.current_task_pid.kill('SIGTERM'))
        flag_player_started = 0;

    } catch (err) {
        scribbles.log(`stop player FAILED: ${err}`)
    }

}

function check_state() {
    //scribbles.log(`check state`)
    let date_ob = new Date();
    let current_time_in_minutes = date_ob.getMinutes() + date_ob.getHours() * 60
    let current_day = date_ob.getDay()
    if (current_day == 0) {//-------------
        current_day = 7
    }


    //scribbles.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table, null, 2)}`)

    if (state.current_task_trigger == 'topic') {
        //
    } else if (state.current_task_trigger == 'topic') {
        //scribbles.log(`check schedule`)
        for (var index in scheduler_table) {
            let task = scheduler_table[index]

            if ((task.schedule.day_of_week == '') || (task.schedule.day_of_week == undefined)) {

            } else {
                //scribbles.log(`active day fot task:${task.name}`)
                if (task.schedule.day_of_week.search(`${current_day}`) >= 0) {//---------day in list ---------------
                    let playlist_start_time_in_minutes = parseInt(task.schedule.start_time.split(':')[0]) * 60 + parseInt(task.schedule.start_time.split(':')[1])
                    if (playlist_start_time_in_minutes <= current_time_in_minutes) {
                        let playlist_end_time_in_minutes = parseInt(task.schedule.end_time.split(':')[0]) * 60 + parseInt(task.schedule.end_time.split(':')[1])
                        //scribbles.log(`current_time_in_minutes: ${current_time_in_minutes} \n playlist_start_time_in_minutes: ${playlist_start_time_in_minutes} \n playlist_end_time_in_minutes: ${playlist_end_time_in_minutes}`)
                        if (playlist_end_time_in_minutes > current_time_in_minutes) {
                            if ((state.current_task_path != task.playlist_path) && (task.type == 'multimedia')) {
                                //----- it's playlist ok ----
                                if (state.player_state == 'stop') {
                                    start_player(task.playlist_path)
                                    client.publish('scheduler/on_off_time', `${task.schedule.start_time}/${task.schedule.end_time}`, { retain: true })
                                    //scribbles.log(`lets play playlist ${state.current_task_name} from idle state`)
                                } else if (state.player_state == "play") {
                                    stop_player()
                                    start_player(playlist.playlist_path)

                                    //scribbles.log(`lets play playlist ${state.current_task_name} overlay previus playlist`)
                                }
                                client.publish('scheduler/current_task', task.task_name, { retain: true })
                            }
                            flag_valid_playlist = 1
                            //scribbles.log(`valid playlist is ${state.current_task_name} playing....`)
                            break //playlist is valid, no time to turn off
                        } else {
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
        scheduler_init()
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
        topic_list_refresh()
        scheduler_init()
    } catch (err) {
        scribbles.error(`: ${err}`)
        process.exit(1);
    }
})


function mqtt_sub(topic) {
    if (client.subscribe(topic, function (err) {
        if (err) {
            scribbles.error(`subscribe to: ${topic} filed: ${err}`)
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
    scheduler_init()
    topic_list_refresh()
})

client.on('message', function (topic, message) {

    //--------MQTT------Action on playlist topics------------------
    scribbles.log('Incoming message')

    if ((topic == 'scheduler/restart') && (message == '1')) {
        scribbles.log('Reset playlist on MQTT command')
        stop_task()
        setTimeout(check_state, 500)
    } else {
        //scheduler_table.forEach(task => {
        for (index in scheduler_table) {
            let task = scheduler_table[index]
            if (task.trigger_type == 'topic') {
                task.trigger_topics.forEach(task_topic => {
                    if ((topic == task_topic.topic) && (message == task_topic.payload)) {
                        scribbles.log(`topic comparation true for ${task_topic.topic}`)
                        if (task_topic.event == 'start') {
                            stop_player()
                            start_player(index)
                            client.publish('scheduler/current_task', task.task_name, { retain: true })
                            flag_valid_playlist = 1
                        } else if (task_topic.event == 'stop') {
                            stop_player()
                            flag_valid_playlist = 0
                        }
                    }
                })
            }
        }
    }
})

function topic_list_refresh() {
    client.unsubscribe("#")

    for (var index in scheduler_table) {
        let task = scheduler_table[index]
        if (task.trigger_type == 'topic') {
            task.trigger_topics.forEach(topic => {
                mqtt_sub(topic.topic)
            })
        }
        task.actions.forEach(topic => {
            mqtt_sub(topic.topic)
        })

    }

    scribbles.log(`topic_list_refresh OK`)
}



try {//--------------Read config----------------
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    scribbles.config({
        logLevel: config.log.level,
        format: '{time} [{fileName}] <{logLevel}> {message}'
    })
} catch (err) {
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
}


//--------------plan on time-------------
function get_millis_before_event(valid_days, target_hour, target_min) {
    let date_ob = new Date();
    let current_time_in_mllis = date_ob.getMinutes() * 60000 + date_ob.getHours() * 60 * 60000

    let current_day = date_ob.getDay()
    if (current_day == 0) {//-------------
        current_day = 7
    }

    let returnVal = 0

    let target_day = current_day
    check_deays:
    while (1) {
        if (!(valid_days.search(`${target_day}`) >= 0)) {
            //scribbles.log(`set target_millis to next day`)
            target_day++
            if (target_day > 7) { target_day = 1 }
            returnVal += 86400000
            continue check_deays
        } else {
            break check_deays
        }
    }

    var millis_target = target_hour * 60 * 60000 + target_min * 60000
    returnVal = returnVal + millis_target - current_time_in_mllis
    if (returnVal <= 0) { returnVal += 86400000 }
    //scribbles.log(`val: ${returnVal}`)
    return returnVal
}

function start_task(index) {
    

    state.current_task_index = index
    if (scheduler_table[index].type == "multimedia") {
        if (state.current_task_index >= 0) {
            stop_task(state.current_task_index)
        }
        start_player(index)
    } else {
        //start task
    }

    state.player_state = 'play'

    scribbles.log(`start player OK`)
    client.publish('scheduler/current_task', `${scheduler_table[index].task_name}`, { retain: true })

    let millis_to_stop = get_millis_before_event(scheduler_table[index].schedule.day_of_week, scheduler_table[index].schedule.end_time.split(':')[0], scheduler_table[index].schedule.end_time.split(':')[1])
    scheduler_table[index]['timer'] = setTimeout(function () {
        stop_task(index)
    }, millis_to_stop)
    scribbles.log(`Start timer to stop ${millis_to_stop} `)
    //state.shedule_timer = setTimeout(stop_player(index),10000)
}
function stop_task(index) {


    if (scheduler_table[index].type == "multimedia") {
        stop_player(index)
    } else {
        //start task
    }

    client.publish('scheduler/on_off_time', `--:--/--:--`, { retain: true })
    client.publish('scheduler/current_task', 'none', { retain: true })

    state.player_state = 'stop'


    let millis_to_start = get_millis_before_event(scheduler_table[index].schedule.day_of_week, scheduler_table[index].schedule.start_time.split(':')[0], scheduler_table[index].schedule.start_time.split(':')[1])
    scheduler_table[index]['timer'] = setTimeout(function () {
        start_task(index)
    }, millis_to_start)
    scribbles.log(`Start timer to start ${millis_to_start} `)

    state.current_task_index = -1
}



function scheduler_init() {
    scribbles.log(`Scheduler init`)


    for (index in scheduler_table) {
        //!!!!!!!!!!stop all timers!!!!!!!!!!!
        if (scheduler_table[index].hasOwnProperty("timer")) {
            clearTimeout(scheduler_table[index].timer)
        }
    }


    if (state.current_task_index >= 0) {
        //kill current task
        scribbles.log(`Stop current task`)
        stop_task(state.current_task_index)
    }

    scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))


    for (var index in scheduler_table) {
        let task = scheduler_table[index]
        //scribbles.log(task.task_name)
        if (task.trigger_type == 'schedule') {
            let millis_to_start = get_millis_before_event(task.schedule.day_of_week, task.schedule.start_time.split(':')[0], task.schedule.start_time.split(':')[1])
            let millis_to_stop = get_millis_before_event(task.schedule.day_of_week, task.schedule.end_time.split(':')[0], task.schedule.end_time.split(':')[1])
            let date_ob = new Date();
            let millis_current = date_ob.getMinutes() * 60000 + date_ob.getHours() * 60 * 60000

            //scribbles.log(`mill ot start: ${millis_to_start} mill to stop: ${millis_to_stop} millis current: ${millis_current}`)
            if ((millis_to_stop < millis_to_start)) {
                scribbles.log(`Lets run scheduled task: ${task.playlist_path}`)
                start_task(index)
            } else {

                let millis_to_start = get_millis_before_event(scheduler_table[index].schedule.day_of_week, scheduler_table[index].schedule.start_time.split(':')[0], scheduler_table[index].schedule.start_time.split(':')[1])
                scheduler_table[index]['timer'] = setTimeout(function () {
                    start_task(index)
                }, millis_to_start)
                scribbles.log(`Start timer to start ${millis_to_start} `)
            }
        }
    }

}


//--------------run daemons--------------



try {


} catch (err) {
    scribbles.log(`Faild chek scheduled task:${err}`)
}




//check_state()
//start_player('data/playlists/playlist_1.json')
