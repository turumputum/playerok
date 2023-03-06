const scribbles = require('scribbles');
let mpv = require('node-mpv');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const log_file = require('log-to-file');
const process = require ('process');


var playlist
var current_track_index = 0
var interrupted_track_index = 0
var simple_track_num = 0
var player_state = 'Idle'
var current_volume 
var flag_mqtt_ok = 0
var flag_first_run = 1;


process.stdin.resume();
process.on('SIGTERM', () => {
  stop_track(current_track_index)

  scribbles.log('Received SIGTERM. Exit.');
  setTimeout(process.exit(),100)
});

try {
  var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  scribbles.config({
    logLevel:config.log.level,
    format:'{time} [{fileName}] <{logLevel}> {message}'
  })
} catch (err) {
  scribbles.error(`Error read file: ${err}`)
  process.exit(1);
}

let mpvPlayer = new mpv({
  "verbose": false,
  //"binary":'C:/Users/Yac/mpv_dist/mpv.exe'
}, [
  "--fullscreen",
  '--vo=gpu',
  '--hwdec=vaapi',
  //`--audio-device=${config.sound.output_device}`
  //`--audio-device=alsa/jack`
]);

setTimeout(()=>{
  //set_volume(config.sound.volume)
  client.publish('player/volume_val', `${config.sound.volume}`, { retain: true })
  scribbles.log("config OK, lets play")
  if (simple_track_num > 0) {
    play_track(current_track_index);
  }
},1000)

// const readline = require('readline');
// readline.emitKeypressEvents(process.stdin);
// process.stdin.setRawMode(true);

function read_playlist(path) {
  try {
    playlist = JSON.parse(fs.readFileSync('../' + path))
  } catch (err) {
    scribbles.error(`Error read playlist: ${err}`)
    log_file(`Error read playlist: ${err}`, '../logs/player_log.log')
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
const client = mqtt.connect('mqtt://127.0.0.1:1883')
client.on('connect', function () {
  scribbles.log("mqtt brocker connected!");


  //-------MQTT-------Subscribe playlist topics------------------
  if ((playlist.next_topic != '')&&(playlist.hasOwnProperty('next_topic'))) {
    if (mqtt_sub(playlist.next_topic.split(' ').slice(0, 1)) === true) {
      scribbles.log(`Subscribed next topic: ${playlist.next_topic}`)
    }
  }
  if ((playlist.prev_topic != '')&&(playlist.hasOwnProperty('prev_topic'))) {
    if (mqtt_sub(playlist.prev_topic.split(' ').slice(0, 1)) === true) {
      scribbles.log(`Subscribed prev topic: ${playlist.prev_topic}`)
    }
  }
  if ((playlist.play_pause_topic != '')&&(playlist.hasOwnProperty('play_pause_topic'))) {
    if (mqtt_sub(playlist.play_pause_topic.split(' ').slice(0, 1)) === true) {
      scribbles.log(`Subscribed play_pause topic: ${playlist.play_pause_topic}`)
    }
  }
  if ((playlist.stop_topic != '')&&(playlist.hasOwnProperty('stop_topic'))) {
    if (mqtt_sub(playlist.stop_topic.split(' ').slice(0, 1)) === true) {
      scribbles.log(`Subscribed stop topic: ${playlist.stop_topic}`)
    }
  }
  // if ((playlist.volume_up_topic != '')&&(playlist.hasOwnProperty('volume_up_topic'))) {
  //   if (mqtt_sub(playlist.volume_up_topic.split(' ').slice(0, 1)) === true) {
  //     scribbles.log(`Subscribed volume_up topic: ${playlist.volume_up_topic}`)
  //   }
  // }
  // if ((playlist.volume_down_topic != '')&&(playlist.hasOwnProperty('volume_down_topic'))) {
  //   if (mqtt_sub(playlist.volume_down_topic.split(' ').slice(0, 1)) === true) {
  //     scribbles.log(`Subscribed volume_down topic: ${playlist.volume_down_topic}`)
  //   }
  // }
  // if ((playlist.volume_val_topic != '')&&(playlist.hasOwnProperty('volume_val_topic'))) {
  //   if (mqtt_sub(playlist.volume_val_topic.split(' ').slice(0, 1)) === true) {
  //     scribbles.log(`Subscribed volume_val topic: ${playlist.volume_val_topic}`)
  //   }
  // }

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



  //--------MQTT------Subscribe tracks topics------------------
  playlist.tracks.forEach(item => {
    if (item.type == 'interactive') {
      if (item.triger_on != '') {
        let topic = item.triger_on.split(' ').slice(0, 1)
        if (mqtt_sub(topic) === true) {
          scribbles.log(`Subscribed triger_on topic: ${topic}`)
        }
      }
      if (item.triger_off != '') {
        let topic = item.triger_off.split(':').slice(0, 1)
        if (mqtt_sub(topic) === true) {
          scribbles.log(`Subscribed triger_off topic: ${topic}`)
        }
      }

    }
  })


  flag_mqtt_ok = 1

  

})

client.on('message', function (topic, message) {

  //--------MQTT------Action on playlist topics------------------
  if ((topic == playlist.next_topic.split(/[: ]/).slice(0, 1)) && (message.toString() == playlist.next_topic.split(/[: ]/).slice(-1))) {
    if (shift_simple_track(+1)) {
      if (play_track(current_track_index)) {
        scribbles.log(`Next track OK command, index: ${current_track_index}`)
      }
    }
  }
  if ((topic == playlist.prev_topic.split(/[: ]/).slice(0, 1)) && (message.toString() == playlist.prev_topic.split(/[: ]/).slice(-1))) {
    if (shift_simple_track(-1)) {
      if (play_track(current_track_index)) {
        scribbles.log(`Prev track OK command, index: ${current_track_index}`)
      }
    }
  }
  if (topic == playlist.play_pause_topic.split(/[: ]/).slice(0, 1)) {
    play_pause(message.toString() == playlist.prev_topic.split(/[: ]/).slice(-1))
  }
  if (topic == playlist.stop_topic.split(/[: ]/).slice(0, 1) && (message.toString() == playlist.stop_topic.split(/[: ]/).slice(-1))) {
    stop_track(current_track_index)
  }
  // if (topic == playlist.volume_val_topic.split(/[: ]/).slice(0, 1)) {
  //   current_volume = parseInt(message)
  //   set_volume(current_volume)
  //   scribbles.log(`Mqtt command, set volume: ${current_volume}`)
  // }
  // if (topic == playlist.volume_up_topic.split(/[: ]/).slice(0, 1)) {
  //   current_volume += parseInt(message)
  //   if (current_volume > 100) { current_volume = 100 }
  //   client.publish(playlist.volume_val_topic, `${current_volume}`, { retain: true })
  // }
  // if (topic == playlist.volume_down_topic.split(/[: ]/).slice(0, 1)) {
  //   current_volume -= parseInt(message)
  //   if (current_volume < 0) { current_volume = 0 }
  //   client.publish(playlist.volume_val_topic, `${current_volume}`, { retain: true })
  // }

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
    play_pause(parseInt(message))
  }
  if (topic == 'player/stop' && (message.toString() == 1)) {
    stop_track(current_track_index)
  }
  if (topic == 'player/volume_val') {
    current_volume = parseInt(message)
    set_volume(current_volume)
    scribbles.log(`Mqtt command, set volume: ${current_volume}`)
  }


  playlist.tracks.forEach((item, index) => {
    if (item.type == 'interactive') {
      if ((topic == item.triger_on.split(/[: ]/).slice(0, 1)) && (message.toString() == item.triger_on.split(/[: ]/).slice(-1))) {
        //stop_track(current_track_index)
        if (play_track(index)) {
          interrupted_track_index = current_track_index
          //current_track_index = index
          scribbles.log(`mqtt trigger_on Track OK, index: ${index}`)
        }
      }

      if ((topic == item.triger_off.split(/[: ]/).slice(0, 1)) && (message.toString() == item.triger_off.split(/[: ]/).slice(-1))) {
        //stop_track(current_track_index)
        if (simple_track_num > 0) {
          if (play_track(interrupted_track_index)) {
            //current_track_index = interrupted_track_index
            scribbles.log(`mqtt trigger_off return to interrupted Track OK, index: ${current_track_index}`)
          }
        }
      }
    }
  })

})

function mqtt_sub(topic) {
  if (client.subscribe(topic, function (err) {
    if (err) {
      scribbles.error(`subscribe to: ${topic} filed: ${err}`)
      log_file(`subscribe to: ${topic} filed: ${err}`, '../logs/player_log.log')
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
      if (playlist.state_topic != '') {
        client.publish(playlist.state_topic, `Playing : ${playlist.tracks[current_track_index].name}`, { retain: true })
      }
      client.publish('player/state', `Playing : ${playlist.tracks[current_track_index].name}`, { retain: true })
    } else if (state == 'Pause') {
      if (playlist.state_topic != '') {
        client.publish(playlist.state_topic, `Pause : ${playlist.tracks[current_track_index].name}`, { retain: true })
      }
      client.publish('player/state', `Pause : ${playlist.tracks[current_track_index].name}`, { retain: true })
    } else if (state == 'Idle') {
      if (playlist.state_topic != '') {
        client.publish(playlist.state_topic, `Idle`, { retain: true })
      }
      client.publish('player/state', `Idle`, { retain: true })
    }
  }
}


//-----------------Player--------------------

function set_volume(volume){
  current_volume = volume
  mpvPlayer.volume(volume)
  
  try{
    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    config.sound.volume = volume
    fs.writeFileSync('../meta/player_config.json', JSON.stringify(config,null,2))
  }catch(err){
    scribbles.log(`set config fail: ${err}`)
  }
}

function play_track(index) {

  if((player_state!='Idle')&&(player_state!='stop')){
      scribbles.log(`stopped before start< state: ${player_state} `)
      stop_track(current_track_index)
  }

  //stop_track(current_track_index)
  try {
    mpvPlayer.load('../' + playlist.tracks[index].path);
    scribbles.log(`lets play: ${playlist.tracks[index].name} -- ${playlist.tracks[index].path}`)
    //return true
  } catch (err) {
    scribbles.error(`Play track failed: ${playlist.tracks[index].name} Error: ${err}`)
    log_file(`Play track failed: ${playlist.tracks[index].name} Error: ${err}`, '../logs/player_log.log')
    return false
  }
  if (flag_mqtt_ok == 1) {
    if ((playlist.tracks[index].pub_on_start != '') && (playlist.tracks[index].type == 'interactive')) {
      scribbles.log(`start action interactive track: ${playlist.tracks[current_track_index].pub_on_start}`)
      try {
        let tmpTopic = playlist.tracks[index].pub_on_start.split(/[: ]/).slice(0, 1)
        let tmpPayload = playlist.tracks[index].pub_on_start.split(/[: ]/).slice(-1)
        client.publish(tmpTopic[0], tmpPayload[0], { retain: true })
      } catch (err) {
        scribbles.log('publish error' + err)
      }
    }
  }
  current_track_index = index
  setTimeout(()=>{
    report_state(player_state = 'Playing')
  },100)
  return true
}

function stop_track(index) {
  try {
    mpvPlayer.stop()
  } catch {
    scribbles.error(`Stop track failed: ${playlist.tracks[index].name} Error: ${err}`)
    log_file(`Stop track failed: ${playlist.tracks[index].name} Error: ${err}`, '../logs/player_log.log')
    return false
  }
  if (flag_mqtt_ok == 1) {
    if (playlist.tracks[current_track_index].pub_on_end != '' && playlist.tracks[current_track_index].type == 'interactive') {
      scribbles.log(`end action interactive track: ${playlist.tracks[current_track_index].pub_on_end}`)
      try {
        let tmpTopic = playlist.tracks[current_track_index].pub_on_end.split(/[: ]/).slice(0, 1)
        let tmpPayload = playlist.tracks[current_track_index].pub_on_end.split(/[: ]/).slice(-1)
        client.publish(tmpTopic[0], tmpPayload[0], { retain: true })
      } catch (err) {
        scribbles.log('publish error' + err)
      }
    }
  }
  scribbles.log('Stop OK')
  report_state(player_state = 'Idle')
  return true
}

function play_pause(state) {
  if (state == playlist.play_pause_topic.split(/[: ]/).slice(-1)[0]) {
    if (player_state == 'Pause') {
      mpvPlayer.resume()
      report_state(player_state = 'Playing')
    } else if (player_state == 'Idle') {
      play_track(current_track_index)
    }
  } else if (state != playlist.play_pause_topic.split(/[: ]/).slice(-1)[0]) {
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
      scribbles.log(`Is not simple truck index ${current_track_index}, seek`)
      shift_simple_track(dir)
    }
    return true
  } else {
    return false
  }

}


// //mpvPlayer.fullscreen();

// mpvPlayer.on('started', function () {
  
// })

mpvPlayer.on('stopped', function () {
  if(flag_first_run==1){
    flag_first_run = 0
    play_track(current_track_index);
    return
  }
  
  if((player_state!='Idle')&&(player_state!='stop')){
    scribbles.log(`stopped from event`)
    stop_track(current_track_index)
  }

  scribbles.log(`stopped event`)
  
  // if (flag_mqtt_ok == 1) {
  //   if (playlist.tracks[current_track_index].pub_on_end != '' && playlist.tracks[current_track_index].type == 'interactive') {
  //     scribbles.log(`end action interactive track: ${playlist.tracks[current_track_index].pub_on_end}`)
  //     try {
  //       let tmpTopic = playlist.tracks[current_track_index].pub_on_end.split(/[: ]/).slice(0, 1)
  //       let tmpPayload = playlist.tracks[current_track_index].pub_on_end.split(/[: ]/).slice(-1)
  //       client.publish(tmpTopic[0], tmpPayload[0], { retain: true })
  //     } catch (err) {
  //       scribbles.log('publish error' + err)
  //     }
  //   }
  // }

  if (simple_track_num > 0 && player_state == "Idle") {
    if ((playlist.tracks[current_track_index].loop == 'on')&&(playlist.tracks[current_track_index].type!='simple')) {//----------Loop current track----------------------
      if (play_track(current_track_index)) {
        scribbles.log(`Prev track End, loop current track OK, index: ${current_track_index}`)
      }
    } else {//----------shift next track----------------------
      if (shift_simple_track(+1)) {
        if (play_track(current_track_index)) {
          scribbles.log(`Prev track End, play Next track OK, index: ${current_track_index}`)
        }
      }
    }
  }
});

