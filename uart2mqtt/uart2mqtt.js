const { SerialPort } = require('serialport')
const { DelimiterParser } = require('@serialport/parser-delimiter')
const { autoDetect } = require('@serialport/bindings-cpp')
var watch = require('node-watch')
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const { argv } = require('process');

const scribbles = require('scribbles');

//const queue = require('queue');

let dev_watcher = watch('/dev/', { recursive: false });
var active_ports = [] //device connected from serial
var active_mqtt_clients = [] //

const today = new Date();

try {
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


class portListener {
  constructor(port_path) {
    this.name = ""
    this.path = port_path
    let devName
    let devType = ""
    let topicList = {
      "triggers": [],
      "actions": []
    }
    this.lastSendMillis = 0


    scribbles.log(`create new port listener for: ${port_path}`)
    let portH = new SerialPort({ path: port_path, baudRate: 115200 })
    this.portH = portH
    const parser = portH.pipe(new DelimiterParser({ delimiter: '\n' }))
    this.parser = parser
    this.devType = " "
    
    let state = 'new'
    portH.write(`Who are you?\n`)

    parser.on('data', function (data) {
      let in_data = data.toString('utf8')
      //scribbles.log(`state:${state} IN data: ${in_data} `)//for: ${JSON.stringify(this)}

      if (state == 'new') { //--------verify device-------------------
        devType = in_data.split(':')[0]
        devName = in_data.split(':')[1]
        scribbles.log(`Verify name:${devName}`)
        const devMassE = ['button_module', 'monofon', 'swiper', 'moduleBox','custom_device'];
        for (let item of devMassE) {
          if (devType == item) {
            scribbles.log(`Verifyed device name: ${devName} type:${devType}`)
            active_ports.forEach(element_a => {
              //scribbles.log(`port in active list: ${JSON.stringify(element_a)}`)
              if (element_a.path == port_path) {
                element_a.name = devName
                scribbles.log(`Set name: ${devName} for ${port_path}`)
              }
            })
            this.devType=devType
            state = 'get_topics'
            portH.write(`Get topic list.\n`)
          }
        }
      } else if (state == 'get_topics') { //------------get topic list-----------------------
        if (in_data.indexOf('End of topic list') >= 0) {
          client.publish(`clients/${devName}/state`, '1', { retain: true })
          client.publish(`clients/${devName}/topics`, JSON.stringify(topicList, null, 2), { retain: true })
          for (let topic of topicList.actions) {
            mqtt_sub(topic)
          }
          state = 'working'
          //scribbles.log(`End of topics :${JSON.stringify(topicList, null,2)}`)
        } else {
          let topicType = in_data.split(':')[0]
          let topic = in_data.split(':')[1]
          if (topicType == 'triggers') {
            topicList.triggers.push(topic)
          } else if (topicType == 'actions') {
            topicList.actions.push(topic)
          }
        }
      } else if (state == 'working') {
        scribbles.log(`lets Publish: ${in_data}`)
        if (in_data.slice(0, 2) != 'OK') {
          try {
            client.publish(`${in_data.split(':')[0]}`, `${in_data.split(':')[1]}`, { retain: true })
          } catch (err) {
            scribbles.log(`Publish fail: ${err}`)
          }
        }
      }

    })

  }

  send_command(data) {
    if (Math.abs(process.hrtime()[1] - this.lastSendMillis) < 80000000) {
      scribbles.debug(`send serial need delay. Waiting`)
      while (Math.abs(process.hrtime()[1] - this.lastSendMillis) < 80000000)  {
        //wait delay
        //scribbles.debug(`eba^${process.hrtime()[1]}`)
      }
      //scribbles.debug(`Waiting end`)
    }
    if(this.devType=='monofon'){
      data = data.split("/")[1]
      scribbles.debug(`data^${data}`)
    }
    this.portH.write(`${data}\n`)
    this.lastSendMillis = process.hrtime()[1]
    scribbles.log(`Send serial: ${data}`)

  }

  close() {
    //this.parser.close()
    client.publish(`clients/${this.name}/state`, '0', { retain: true })
    client.publish(`clients/${this.name}/topics`, "", { retain: true })
  }

}

function addDevToList(path) {
  let flag_port_is_taken = 0
  active_ports.forEach(element => {
    if (element.path == path) {
      flag_port_is_taken = 1
    }
  })
  if (flag_port_is_taken == 0) {
    scribbles.log(`Lets add to dev list: ${path}`)
    active_ports.push(new portListener(path))
  }
}

function removeDevFromList(path) {
  active_ports.forEach((element, index) => {
    if (element.path == path) {
      active_ports[index].close()
      active_ports.splice(index, 1)
      scribbles.log(`Port closed and removed from list: ${path}`)
    }
  })
}

//----------search dev on start-----------
async function scanConnectedDevs() {
  fs.readdir('/dev/', (err, filenames) => {
    if (err) {
      return reject(err);
    }
    //scribbles.log(`files in dev: ${filenames}`)
    filenames.forEach(name => {
      if ((name.indexOf("ttyACM") >= 0)) {
        addDevToList(`/dev/${name}`)
      }
    })
  })
}


//--------------start watcher---------------
function startDevWatcher() {
  var flag_dev_watcher_busy = 0;
  dev_watcher.on('change', function (evt, name) {
    //scribbles.log(`Event: ${evt}    ---    Name: ${name}`)
    while (flag_dev_watcher_busy != 0) { }

    if ((name.indexOf("/dev/ttyACM") >= 0)) {

      flag_dev_watcher_busy = 1
      if (evt == 'update') {
        addDevToList(name);
      }

      if (evt == 'remove') {
        removeDevFromList(name)
      }
      flag_dev_watcher_busy = 0
    }

  })
}


//--------MQTT handlers---------------------
const client = mqtt.connect('mqtt://127.0.0.1:1883')
client.on('connect', function () {
  scribbles.log("mqtt brocker connected!")
  scanConnectedDevs()
  startDevWatcher()
  mqtt_sub("clients/#")
  
  // scribbles.log("clean topics_list")
  // fs.writeFile('/home/playerok/playerok/meta/topics_list.json', "")
})

client.on('message', function (topic, message) {
  //scribbles.log(`MQTT in: ${topic}:${message}`)
  try {
    let name = topic.split('/')[0]
    if (name == "clients") {
      name = topic.split('/')[1]
      let index = active_mqtt_clients.findIndex(client => client.name == name)
      let dev = {
        "name": name,
        "state": 0,
        "topics": {}
      }

      if (index < 0) {
        active_mqtt_clients.push(dev)
        index = active_mqtt_clients.findIndex(client => client.name == name)
      }

      if (topic.split('/')[2] == "state") {
        if (message == "1") {
          active_mqtt_clients[index].state = 1
        } else if (message == "0") {
          active_mqtt_clients[index].state = 0
        }
      } else if (topic.split('/')[2] == "topics") {
        active_mqtt_clients[index].topics = JSON.parse(message);


        //-----------regen topiclist file---------------------
        var topicList = {
          "triggers": [],
          "actions": []
        }
        active_mqtt_clients.forEach(client => {
          if (client.state == 1) {
            client.topics.triggers.forEach(trigger => {
              topicList.triggers.push(trigger)
            })
            client.topics.actions.forEach(action => {
              topicList.actions.push(action)
            })
          }
        })
        //fs.writeFile("/home/playerok/playerok/meta/topics_list.json", JSON.stringify(topicList, null,2))
        // fs.writeFile('/home/playerok/playerok/meta/topics_list.json', JSON.stringify(topicList, null, 2), function (err) {
        //   if (err) throw err;
        //   scribbles.log(`topic list refresh OK`)
        // });

      }


    } else {
      //------------translate command to serial--------------
      active_ports.forEach(element => {
        //scribbles.log(`Check listener: ${JSON.stringify(element)}`)
        //scribbles.log(`Check listener: ${element.name}`)
        if (element.name == name) {
          element.send_command(`${topic}:${message}`)
        }
      })
    }
  } catch (err) {
    scribbles.log(`MQTT recive fail: ${err}`)
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



