const scribbles = require('scribbles');
let mpvAPI = require('node-mpv');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const process = require('process');
//const workerpool = require('workerpool');

var playlist
var current_track_index = 0
var interrupted_track_index = 0
var simple_track_num = 0
var player_state = 'Idle'
var current_volume
var flag_mqtt_ok = 0
var flag_first_run = 1;
var flag_player_started = 0;

let client

process.stdin.resume();

function lastWill(){
  player_state="stop"
  stop_track(current_track_index)
  mpvPlayer.quit()

  playlist.actions.forEach(action => {
    if (action.event == "stop") {
      try {
        client.publish(action.topic, action.payload, { retain: true })
        scribbles.debug(`publish stop action OK > ${action.topic}:${action.payload}`)
      } catch (err) {
        scribbles.error('publish error' + err)
      }
    }
  })

  scribbles.log('Received SIGTERM. Exit.');
  setTimeout(() => {process.exit()}, 500)
}

process.on('SIGTERM', () => {
  lastWill()
});
process.on('SIGINT', () => {
  lastWill()
});
process.on('SIGQUIT', () => {
  lastWill()
});

try {
  var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  scribbles.config({
    logLevel: config.log.level,
    format: '{time} [{fileName}] <{logLevel}> {message}'
  })
} catch (err) {
  scribbles.error(`Error read file: ${err}`)
  process.exit(1);
}


const mpvPlayer = new mpvAPI({
  "verbose": false,
}, [
  "--fullscreen",
  '--vo=gpu',
  '--hwdec=vaapi',

]);



function read_playlist(path) {
  try {
    playlist = JSON.parse(fs.readFileSync('../' + path))
  } catch (err) {
    scribbles.error(`Error read playlist: ${err}`)
    process.exit(1);
  }
  simple_track_num = 0
  playlist.tracks.forEach(item => {
    if (item.type == 'simple') {
      simple_track_num += 1
    }
  })
}

//--------------------Read playlist first----------------------
var args = process.argv.slice(2);
const playlist_path = args[0]
scribbles.log('Playlist argument: ' + playlist_path)
read_playlist(playlist_path)


//----------------MQTT------------------------------
function mqtt_init() {
  client = mqtt.connect('mqtt://127.0.0.1:1883')
  client.publish('player/volume_val', `${config.sound.volume}`, { retain: true })


  client.on('connect', function () {
    scribbles.log("mqtt brocker connected!");


    //-------MQTT-------Subscribe playlist topics------------------
    playlist.controls.forEach(control => {
      if (mqtt_sub(control.topic) == true) {
        scribbles.log(`Subscribed control topic: ${control.topic} event: ${control.event}`)
      }
    })

    //--------MQTT------Subscribe tracks topics------------------
    playlist.tracks.forEach(t_track => {
      t_track.triggers.forEach(t_trigger => {
        if (mqtt_sub(t_trigger.topic) == true) {
          scribbles.log(`Subscribed track trigger topic: ${t_trigger.topic} for: ${t_track.name} event: ${t_trigger.event}`)
        }
      })
    })

    //-------MQTT-------Subscribe system topics------------------
    if (mqtt_sub('player/next') === true) {
      scribbles.log(`Subscribed system next topic: player/next`)
    }
    if (mqtt_sub('player/prev') === true) {
      scribbles.log(`Subscribed system prev topic: player/prev`)
    }
    if (mqtt_sub('player/play_pause') === true) {
      scribbles.log(`Subscribed system play_pause topic: player/play_pause`)
    }
    if (mqtt_sub('player/stop') === true) {
      scribbles.log(`Subscribed system stop topic: player/stop`)
    }
    if (mqtt_sub('player/volume_val') === true) {
      scribbles.log(`Subscribed system volume_val topic: volume_val`)
    }


    //-------MQTT-------report playlist start actions------------------
    playlist.actions.forEach(action => {
      if (action.event == "start") {
        try {
          client.publish(action.topic, action.payload, { retain: true })
          scribbles.debug(`publish start action OK > ${action.topic}:${action.payload}`)
        } catch (err) {
          scribbles.error('publish error' + err)
        }
      }
    })



    flag_mqtt_ok = 1
    // if (simple_track_num > 0) {
    //   play_track(current_track_index);
    // }
  })

  client.on('message', function (topic, message) {
    //--------MQTT------Action on playlist topics------------------
    playlist.controls.forEach(control => {
      if (control.topic == topic) {
        if (control.event == 'next') {
          if (control.payload == message) {
            if (shift_simple_track(+1)) {
              if (play_track(current_track_index)) {
                scribbles.log(`Next track OK command, index: ${current_track_index}`)
              }
            }
          }
        } else if (control.event == 'previous') {
          if (control.payload == message) {
            if (shift_simple_track(-1)) {
              if (play_track(current_track_index)) {
                scribbles.log(`Prev track OK command, index: ${current_track_index}`)
              }
            }
          }
        } else if (control.event == 'play/pause') {
          if (control.payload == message) {
            play_pause()
          }
        } else if (control.event == 'set_volume') {
          current_volume = parseInt(message)
          set_volume(current_volume)
        } else if (control.event == 'volume_up') {
          current_volume = current_volume + parseInt(message)
          if (current_volume > 100) { current_volume = 100 }
          set_volume(current_volume)
        } else if (control.event == 'volume_down') {
          current_volume = current_volume - parseInt(message)
          if (current_volume < 0) { current_volume = 0 }
          set_volume(current_volume)
        }
      }
    })


    //--------MQTT------Action on tracks topics------------------
    playlist.tracks.forEach(function (track, t_index) {
      track.triggers.forEach(trigger => {
        if (trigger.topic == topic) {
          if ((trigger.event == 'start') && (trigger.payload == message)) {
            if(current_track_index!=t_index){
              // if(player_state!="Idle"){
              //   stop_track(current_track_index)
              // }

              interrupted_track_index = current_track_index
              if (play_track(t_index)) {
                scribbles.log(`mqtt trigger_on Track OK, current_index: ${current_track_index} -- interupted_index:${interrupted_track_index}`)
              }
            }
          } else if ((trigger.event == 'stop') && (trigger.payload == message)) {
            if(current_track_index==t_index){
              if (simple_track_num > 0) {
                  if (play_track(interrupted_track_index)) {
                    scribbles.log(`mqtt trigger_off return to interrupted Track OK, index: ${current_track_index}`)
                  }
                } 
                // else {
                //   stop_track()
                // }
              }
          }
        }
      })
    })

    //--------MQTT------Action on system topics------------------
    if ((topic == 'player/next') && (message.toString() == 1)) {
      if (shift_simple_track(+1)) {
        if (play_track(current_track_index)) {
          scribbles.log(`Next track OK command, index: ${current_track_index}`)
        }
      }
    }
    if ((topic == 'player/prev') && (message.toString() == 1)) {
      if (shift_simple_track(-1)) {
        if (play_track(current_track_index)) {
          scribbles.log(`Prev track OK command, index: ${current_track_index}`)
        }
      }
    }
    if (topic == 'player/play_pause') {
      if (message == "1") {
        play_pause()
      }
    }
    if (topic == 'player/stop' && (message.toString() == 1)) {
      stop_track(current_track_index)
    }
    if (topic == 'player/volume_val') {
      current_volume = parseInt(message)
      set_volume(current_volume)
      scribbles.log(`Mqtt command, set volume: ${current_volume}`)
    }

  })

}
mqtt_init()


function mqtt_sub(topic) {
  if (client.subscribe(topic, function (err) {
    if (err) {
      scribbles.error(`subscribe to: ${topic} filed: ${err}`)
      return err
    } else {
      //scribbles.log(`subscribe OK to: ${topic}`)
      return true
    }
  })) {
    return true
  }
}

function report_state(state) {
  if (flag_mqtt_ok == 1) {
    if (state == 'Playing') {
      client.publish('player/state', `Playing : ${playlist.tracks[current_track_index].name}`, { retain: true })
    } else if (state == 'Pause') {
      client.publish('player/state', `Pause : ${playlist.tracks[current_track_index].name}`, { retain: true })
    } else if (state == 'Idle') {
      client.publish('player/state', `Idle`, { retain: true })
    }
  }
}

function report_actions(index, event){
  //---report actions---
  playlist.tracks[index].actions.forEach(function (action) {
    if (action.event == event) {
      try {
        client.publish(action.topic, action.payload, { retain: true })
        scribbles.debug(`publish ${event} action OK > ${action.topic}:${action.payload}`)
      } catch (err) {
        scribbles.error('publish error' + err)
      }
    }
  })
}


//-----------------Player--------------------

function set_volume(volume) {
  current_volume = volume
  mpvPlayer.volume(volume)

  try {
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    config.sound.volume = volume
    fs.writeFileSync('../meta/player_config.json', JSON.stringify(config, null, 2))
  } catch (err) {
    scribbles.log(`set config fail: ${err}`)
  }
}

function play_track(index) {

  // if ((player_state != 'Idle') && (player_state != 'stop')) {
  //   scribbles.log(`stopped before start< state: ${player_state} `)
  //   stop_track(current_track_index)
  // }

  if ((player_state != 'Idle') && (player_state != 'stop')) {
    report_actions(current_track_index, "stop")
  }

  //stop_track(current_track_index)
  try {
    mpvPlayer.load('../' + playlist.tracks[index].path);
    scribbles.log(`lets play: ${playlist.tracks[index].name} -- ${playlist.tracks[index].path}  -- index:${index}`)
    //return true
  } catch (err) {
    scribbles.error(`Play track failed: ${playlist.tracks[index].name} Error: ${err}`)
    return false
  }

  //---report actions---
  report_actions(index, "start")

  current_track_index = index
  setTimeout(() => {
    report_state(player_state = 'Playing')
  }, 10)
  return true
}

function stop_track(index) {
  try {
    //scribbles.debug(`let stop player`)
    mpvPlayer.stop()
  } catch {
    scribbles.error(`Stop track failed: ${playlist.tracks[index].name} Error: ${err}`)
    return false
  }


  //---report actions---
  report_actions(index, "stop")


  //scribbles.log('Stop OK')
  report_state(player_state = 'Idle')
  return true
}

function play_pause() {
  if (player_state != "Playing") {
    if (player_state == 'Pause') {
      mpvPlayer.resume()
      report_state(player_state = 'Playing')
    } else if (player_state == 'Idle') {
      play_track(current_track_index)
    }
  } else if (player_state == "Playing") {
    mpvPlayer.pause()
    report_state(player_state = 'Pause')
  }
}

function shift_simple_track(dir) {
  if (simple_track_num > 0) {
    if (dir > 0) {
      current_track_index += 1
      if (current_track_index >= playlist.tracks.length) {
        current_track_index -= playlist.tracks.length
      }
    } else if (dir < 0) {
      current_track_index -= 1
      if (current_track_index < 0) {
        current_track_index += playlist.tracks.length
      }
    }
    if (playlist.tracks[current_track_index].type != 'simple') {
      scribbles.log(`Is not simple truck index ${current_track_index}, skip`)
      shift_simple_track(dir)
    }
    return true
  } else {
    return false
  }

}

mpvPlayer.on('stopped', function () {
  if (flag_first_run == 1) {
    flag_first_run = 0
    scribbles.log(`First run`)
    play_track(current_track_index);
    return
  }

  if(player_state!="Idle"){
    report_actions(current_track_index, "stop")
  }

  
  scribbles.log(`stopped event`)



  if (simple_track_num > 0 && player_state != "stop") {
    if (shift_simple_track(+1)) {
      if (play_track(current_track_index)) {
        scribbles.log(`Prev track End, play Next track OK, index: ${current_track_index}`)
      }
    }

  }

});
