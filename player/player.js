const scribbles = require('scribbles');
let mpvAPI = require('node-mpv');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const process = require('process');
const { spawn } = require('child_process');

const file_tools = require("/home/playerok/playerok/meta/tools/file_tools");
//const workerpool = require('workerpool');

var playlist
var current_track_index = 0
var interrupted_track_index = -1
var simple_track_num = 0
var player_state = 'Idle'
var current_volume
var flag_mqtt_ok = 0
var flag_first_run = 1;
var flag_player_started = 0;
let activeNetworkAudioProcesses = [];
let pendingVideoStartTimer = null;
let suppressStoppedOnce = false;  // set before loading new track, cleared in stopped handler
let lastTriggeredTrack = -1;
let lastTriggerTime = 0;

let client
try {
  if (process.stdin && typeof process.stdin.resume === 'function') {
    process.stdin.resume();
  }
} catch (err) {
  scribbles && scribbles.warn ? scribbles.warn(`stdin resume skipped: ${err}`) : null
}

function lastWill(){
  player_state="stop"
  if (pendingVideoStartTimer) {
    clearTimeout(pendingVideoStartTimer)
    pendingVideoStartTimer = null
  }
  stop_network_audio_streams()
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
  var config = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
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
    playlist = JSON.parse(fs.readFileSync('/home/playerok/playerok/' + path))
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

    setTimeout(() => {
      mpvPlayer.getProperty('duration')
      .then(function(duration){
        scribbles.debug("Duration: ", duration);
        if(duration==undefined){
          play_track(current_track_index);
        }
      })
    }, 1500)
    // if (simple_track_num > 0) {
    //   play_track(current_track_index);
    // }
  })

  client.on('message', function (topic, message) {
    scribbles.log(`INCOMING : ${topic}:${message}`)
    
    //--------MQTT------Action on playlist topics------------------
    playlist.controls.forEach(control => {
      if (control.topic == topic) {
        if (control.event == 'next') {
          if (control.payload == parseInt(message)) {
            if (shift_simple_track(+1)) {
              if (play_track(current_track_index)) {
                scribbles.log(`Next track OK command, index: ${current_track_index}`)
              }
            }
          }
        } else if (control.event == 'previous') {
          if (control.payload ==  parseInt(message)) {
            if (shift_simple_track(-1)) {
              if (play_track(current_track_index)) {
                scribbles.log(`Prev track OK command, index: ${current_track_index}`)
              }
            }
          }
        } else if (control.event == 'play/pause') {
          if (control.payload ==  parseInt(message)) {
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
          if ((trigger.event == 'start') && (trigger.payload ==  parseInt(message))) {
            if (t_index == lastTriggeredTrack && Date.now() - lastTriggerTime < 1000) {
              scribbles.log(`Ignoring duplicate trigger for track ${t_index}`)
              return
            }
            if(current_track_index!=t_index){
              // if(player_state!="Idle"){
              //   stop_track(current_track_index)
              // }
              if(playlist.tracks[current_track_index].type=="simple"){
                interrupted_track_index = current_track_index
              }
              if (play_track(t_index)) {
                lastTriggeredTrack = t_index
                lastTriggerTime = Date.now()
                scribbles.log(`mqtt trigger_on Track OK, current_index: ${current_track_index} -- interupted_index:${interrupted_track_index}`)
              }
            }
          } else if ((trigger.event == 'stop') && (trigger.payload ==  parseInt(message))) {
            if(current_track_index==t_index){
              if (simple_track_num > 0) {
                  scribbles.log(`mqtt trigger_off return to interrupted_index:${interrupted_track_index}, index: ${current_track_index}`)
                  play_track(interrupted_track_index)
                }else {
                  stop_track()
                }
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
    mpvPlayer.getProperty('duration')
    .then(function(duration){
      //console.log(`kuwq ${duration}`);
      mpvPlayer.getProperty('time-pos')
      .then(function(time){
        mpvPlayer.getProperty('filename')
          .then(function(filename){
            //console.log(`${filename}:${time}/${duration}`);
            client.publish('player/state', `${state}:${filename}  ${((time/duration)*100).toFixed(2)}%`)
          })
      })
    })
    
    // if (state == 'Playing') {
    //   client.publish('player/state', `Playing : ${playlist.tracks[current_track_index].name}`, { retain: true })
    // } else if (state == 'Pause') {
    //   client.publish('player/state', `Pause : ${playlist.tracks[current_track_index].name}`, { retain: true })
    // } else if (state == 'Idle') {
    //   client.publish('player/state', `Idle`, { retain: true })
    // }
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
    var config = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
    config.sound.volume = volume
    fs.writeFileSync('/home/playerok/playerok/meta/player_config.json', JSON.stringify(config, null, 2))
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

  if (pendingVideoStartTimer) {
    clearTimeout(pendingVideoStartTimer)
    pendingVideoStartTimer = null
  }
  stop_network_audio_streams()
  suppressStoppedOnce = true  // next 'stopped' event is from loading new file, suppress

  //stop_track(current_track_index)
  const track = playlist.tracks[index]
  scribbles.log(`lets play: ${track.name} -- ${track.path}  -- index:${index}`)
  start_network_audio_streams(track)

  const startVideo = () => {
    try {
      scribbles.log(`mpv load start: /home/playerok/playerok/${track.path}`)
      mpvPlayer.load('/home/playerok/playerok/' + track.path);
      if(((simple_track_num==1)&&(track.type=="simple"))||(track.repeat==true)){
        scribbles.log(`Loop track`)
        mpvPlayer.loop()
      }else{
        mpvPlayer.clearLoop()
      }
      setTimeout(() => {
        mpvPlayer.getProperty('filename').then((filename) => {
          scribbles.log(`mpv filename after load: ${filename}`)
        }).catch((err) => {
          scribbles.warn(`mpv getProperty(filename) failed: ${err}`)
        })
        mpvPlayer.getProperty('duration').then((duration) => {
          scribbles.log(`mpv duration after load: ${duration}`)
        }).catch((err) => {
          scribbles.warn(`mpv getProperty(duration) failed: ${err}`)
        })
      }, 500)
    } catch (err) {
      scribbles.error(`Play track failed: ${track.name} Error: ${err}`)
      return false
    }
    return true
  }

  const videoDelayMs = (((track.network_audio || {}).video_start_delay_us) || 0)
  if (videoDelayMs > 0) {
    scribbles.log(`Delay video start by ${videoDelayMs} ms`)
    pendingVideoStartTimer = setTimeout(() => {
      pendingVideoStartTimer = null
      startVideo()
    }, videoDelayMs)
  } else {
    startVideo()
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
  if (pendingVideoStartTimer) {
    clearTimeout(pendingVideoStartTimer)
    pendingVideoStartTimer = null
  }
  stop_network_audio_streams()

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

function build_network_audio_pipeline_args(sourceAudioPath, streamConfig) {
  const host = streamConfig.multicast_host
  const port = parseInt(streamConfig.port)
  const codec = (streamConfig.codec || 'opus').toLowerCase()

  const volumeLevel = Math.max(0, ((config.sound && config.sound.volume) ? config.sound.volume : 100) / 100)
  const args = [
    '-e',
    'filesrc', `location=${sourceAudioPath}`,
    '!', 'decodebin',
    '!', 'audioconvert',
    '!', 'audioresample',
    '!', 'audio/x-raw,channels=2,rate=48000',
    '!', 'volume', `volume=${volumeLevel}`,
    '!', 'audioconvert'
  ]

  if (codec === 'pcm') {
    args.push('!', 'audio/x-raw,format=S16BE,channels=2,rate=48000')
    args.push('!', 'rtpL16pay', 'pt=96')
  } else {
    args.push('!', 'opusenc', 'bitrate=320000', 'frame-size=20', 'bandwidth=fullband', 'bitrate-type=cbr', 'dtx=false', 'inband-fec=true')
    args.push('!', 'rtpopuspay', 'mtu=1472')
  }

  const multicastIface = streamConfig.multicast_iface || 'eth0'
  const ttl = Number.isFinite(parseInt(streamConfig.ttl)) ? parseInt(streamConfig.ttl) : 1

  args.push(
    '!', 'udpsink',
    `host=${host}`,
    `port=${port}`,
    'sync=true',
    'auto-multicast=true',
    `multicast-iface=${multicastIface}`,
    `ttl-mc=${ttl}`
  )

  return args
}

function start_network_audio_streams(track) {
  const networkAudio = track.network_audio || {}
  const streams = Array.isArray(networkAudio.streams) ? networkAudio.streams : []
  if (!streams.length) {
    return
  }

  const fullTrackPath = '/home/playerok/playerok/' + track.path

  streams.forEach((streamConfig, streamIndex) => {
    if (streamConfig.enabled === false) {
      return
    }
    if (!streamConfig.multicast_host || !streamConfig.port) {
      scribbles.warn(`Skip network audio stream with invalid host/port on track ${track.name}`)
      return
    }

    const sourceAudioPath = streamConfig.audio_path
      ? '/home/playerok/playerok/' + streamConfig.audio_path
      : fullTrackPath

    try {
      const args = build_network_audio_pipeline_args(sourceAudioPath, streamConfig)
      scribbles.log(`gst-launch-1.0 args: ${args.join(' ')}`)
      const gstProcess = spawn('gst-launch-1.0', args, { stdio: ['ignore', 'ignore', 'pipe'] })
      activeNetworkAudioProcesses.push(gstProcess)

      gstProcess.stderr && gstProcess.stderr.on('data', (data) => {
        scribbles.warn(`gst stderr [${track.name}/${streamIndex}]: ${data.toString().trim()}`)
      })

      gstProcess.on('exit', (code, signal) => {
        scribbles.log(`Network audio stream exit: track=${track.name} idx=${streamIndex} code=${code} signal=${signal}`)
      })

      gstProcess.on('error', (err) => {
        scribbles.warn(`Network audio stream error: track=${track.name} idx=${streamIndex} err=${err}`)
      })

      scribbles.log(`Network audio stream started: track=${track.name} idx=${streamIndex} codec=${streamConfig.codec} host=${streamConfig.multicast_host}:${streamConfig.port} source=${sourceAudioPath}`)
    } catch (err) {
      scribbles.warn(`Network audio stream start failed: track=${track.name} idx=${streamIndex} err=${err}`)
    }
  })
}

function stop_network_audio_streams() {
  if (!activeNetworkAudioProcesses.length) {
    return
  }

  activeNetworkAudioProcesses.forEach((proc) => {
    try {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM')
        setTimeout(() => {
          try {
            if (proc && !proc.killed) {
              proc.kill('SIGKILL')
            }
          } catch (_) {}
        }, 800)
      }
    } catch (_) {}
  })

  activeNetworkAudioProcesses = []
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
    if (simple_track_num > 0) {
      for (let i = 0; i < playlist.tracks.length; i++) {
        if (playlist.tracks[i].type === 'simple') {
          play_track(i);
          return;
        }
      }
    }
    return
  }

  if(player_state!="Idle"){
    report_actions(current_track_index, "stop")
  }
  scribbles.log(`stopped event. player_state: ${player_state}, index: ${current_track_index}, suppress: ${suppressStoppedOnce}`)
  const _stoppedTrack = playlist && playlist.tracks ? playlist.tracks[current_track_index] : null
  const _stoppedType = _stoppedTrack ? _stoppedTrack.type : 'simple'
  if (_stoppedType !== 'simple') {
    if (interrupted_track_index >= 0 && interrupted_track_index !== current_track_index) {
      const resumeIndex = interrupted_track_index
      interrupted_track_index = -1
      scribbles.log(`stopped event: non-simple track ended, resuming interrupted loop track ${resumeIndex}`)
      play_track(resumeIndex)
    } else {
      scribbles.log(`stopped event: non-simple track type=${_stoppedType}, skipping auto-advance`)
    }
    return
  }
  if (suppressStoppedOnce) {
    suppressStoppedOnce = false
    scribbles.log(`stopped event: suppressed (track switch in progress)`)
    return
  }
  if (simple_track_num > 0 && player_state !== 'stop') {
    if (shift_simple_track(+1)) {
      if (play_track(current_track_index)) {
        scribbles.log(`Prev track End, play Next track OK, index: ${current_track_index}`)
      }
    }
  }

});

mpvPlayer.on('statuschange', function(status){
  scribbles.debug(`mpv statuschange: ${JSON.stringify(status)}`);
});

setTimeout(() => {
  mpvPlayer.stop()
}, 500);

setTimeout(() => {
  mqtt_init()
}, 1000);

setInterval(() => {
  report_state(player_state)
  
}, 1000);
