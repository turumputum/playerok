const scribbles = require('scribbles');
const { exec } = require('child_process');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
var watch = require('node-watch')
const child_process = require('child_process').fork;

var started_task_list=[]
var scheduler_table


function lastWill(){
    stopAllTask()
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
    current_player_task_index: -1,
}

function start_player(index) {
    //scribbles.log("start play")
    try {
        state.current_task_pid = child_process(`../player/player.js`, [`${scheduler_table[index].task_path}`])
        state.player_state = 'play'
    } catch (err) {
        scribbles.log(`start player FAILED: ${err}`)
    }

}

function stop_player() {
    //scribbles.log("stop play")
    try {
        scribbles.log(`stop player:` + state.current_task_pid.kill('SIGTERM'))
        state.player_state = 'stop'
    } catch (err) {
        scribbles.log(`stop player FAILED: ${err}`)
    }

}

let table_watcher = watch('../meta/scheduler-table.json', { recursive: false });
table_watcher.on('change', function (evt, name) {
    try {
        stopAllTask()
        scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
        scheduler_init()
        //scribbles.error(`scheduler-table read ok : ${JSON.stringify(scheduler_table,null,2)}`)
    } catch (err) {
        scribbles.error(`: ${err}`)
        process.exit(1);
    }
})

let playlist_watcher = watch('../data', { recursive: false });
playlist_watcher.on('change', function (evt, name) {
    try {
        scribbles.log('Reset playlist on playlist update')
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

})

client.on('message', function (topic, message) {

    //--------MQTT------Action on playlist topics------------------
    scribbles.log('Incoming message')

    if ((topic == 'scheduler/restart') && (message == '1')) {
        scribbles.log('Reset playlist on MQTT command')
        scheduler_init()
    } else {
        //scheduler_table.forEach(task => {
        for (index in scheduler_table) {
            let task = scheduler_table[index]
            if (task.trigger_type == 'topic') {
                task.trigger_topics.forEach(task_topic => {
                    if ((topic == task_topic.topic) && (message == task_topic.payload)) {
                        scribbles.log(`topic comparation true for ${task_topic.topic}`)
                        if (task_topic.event == 'start') {
                            start_task(index)
                        } else if (task_topic.event == 'stop') {
                            stop_task(index)
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

    if (scheduler_table[index].type == "multimedia") {
        if (state.player_state == 'play') {
            stop_task(state.current_player_task_index);
        }
        start_player(index)
        scheduler_table[index]['state'] = "run"
        state.current_player_task_index = index

        scribbles.log(`start player OK`)
        client.publish('scheduler/current_player_task', `${scheduler_table[index].task_path}`, { retain: true })



    } else if (scheduler_table[index].type == "script") {
        scribbles.log(`start script:${scheduler_table[index].task_path}`)

        if (path.extname(scheduler_table[index].task_path) == ".js") {
            scheduler_table[index]['state']="run"
            scheduler_table[index]['pid']=child_process(`../${scheduler_table[index].task_path}`)

            var taskList = []
            for (var tIndex in scheduler_table) {
                task = scheduler_table[tIndex]
                if (task.hasOwnProperty('state')) {
                    if (task.state == "run") {
                        taskList.push(scheduler_table[tIndex].task_name)
                    }
                }
            }
            client.publish('scheduler/runing_scripts_list', `${JSON.stringify(taskList)}`, { retain: true })
        }
    }


    if (scheduler_table[index].trigger_type == "schedule") {
        let millis_to_stop = get_millis_before_event(scheduler_table[index].schedule.day_of_week, scheduler_table[index].schedule.end_time.split(':')[0], scheduler_table[index].schedule.end_time.split(':')[1])
        scheduler_table[index]['timer'] = setTimeout(function () {
            stop_task(index)
        }, millis_to_stop)
        scribbles.log(`Start timer to stop ${millis_to_stop} for:${scheduler_table[index].task_name}`)
    }

    //state.shedule_timer = setTimeout(stop_player(index),10000)
}
function stop_task(index) {
    scribbles.log(`Task will be stoped: ${scheduler_table[index].task_name}`)

    if (scheduler_table[index].type == "multimedia") {
        if (state.player_state == 'play') {
            stop_player(index)
        }
        scheduler_table[index]['state'] = "stop"
        client.publish('scheduler/on_off_time', `--:--/--:--`, { retain: true })
        client.publish('scheduler/current_player_task', 'none', { retain: true })
    } else if (scheduler_table[index].type == "script") {
        if(scheduler_table[index].hasOwnProperty('pid')){
            scheduler_table[index].pid.kill()
            scheduler_table[index].state='stop'

            var taskList = []
            for (var tIndex in scheduler_table) {
                task = scheduler_table[tIndex]
                if (task[state] == "run") {
                    taskList.push(script.name)
                }
            }

            client.publish('scheduler/runing_scripts_list', `${JSON.stringify(taskList)}`, { retain: true })
        }


    }


    if (scheduler_table[index].trigger_type == "schedule") {
        let millis_to_start = get_millis_before_event(scheduler_table[index].schedule.day_of_week, scheduler_table[index].schedule.start_time.split(':')[0], scheduler_table[index].schedule.start_time.split(':')[1])
        scheduler_table[index]['timer'] = setTimeout(function () {
            start_task(index)
        }, millis_to_start)
        scribbles.log(`Start timer to start ${millis_to_start} task:${scheduler_table[index].task_name}`)
    }

    state.current_player_task_index = -1
}

function clearTimers(){
    for (index in scheduler_table) {
        //!!!!!!!!!!stop all timers!!!!!!!!!!!
        if (scheduler_table[index].hasOwnProperty("timer")) {
            clearTimeout(scheduler_table[index].timer)
        }
    }
}

function stopAllTask(){
    if(state.player_state=='play'){
        state.current_task_pid.kill() 
        state.player_state='stop'
    }
    
    for (var index in scheduler_table) {
        if(scheduler_table[index].hasOwnProperty('state')){
            if(scheduler_table[index].state=="run"){
                stop_task(index)
            }
        }
    }

    clearTimers()
}

function scheduler_init() {
    scribbles.log(`Scheduler init`)
    client.publish('scheduler/runing_scripts_list', ``, { retain: true })
    client.publish('scheduler/current_player_task', ``, { retain: true })

    stopAllTask()

    for (var index in scheduler_table) {
        if(scheduler_table[index].hasOwnProperty('state')){
            if(scheduler_table[index].state=="run"){
                stop_task(index)
            }
        }
    }
    // if (state.current_player_task_index >= 0) {
    //     //kill current task
    //     scribbles.log(`Stop current task`)
    //     stop_task(state.current_player_task_index)
    // }

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
                scribbles.log(`Lets run scheduled task: ${task.task_path}`)
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

    topic_list_refresh()

}



