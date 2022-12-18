const { SerialPort } = require('serialport')
const { DelimiterParser } = require('@serialport/parser-delimiter')
const { autoDetect } = require('@serialport/bindings-cpp')
var watch = require('node-watch')
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const { argv } = require('process');

function mqtt_sub(topic) {
  if (client.subscribe(topic, function (err) {
    if (err) {
      console.error(`subscribe to: ${topic} filed: ${err}`)
      log_file(`subscribe to: ${topic} filed: ${err}`, '../logs/player_log.txt')
      return err
    } else {
      //console.log(`subscribe OK to: ${topic}`)
      return true
    }
  })) {
    return true
  }
}

class portListener {
  constructor(port_path) {
    var name = ''
    this.name = 'rr'
    this.path = port_path
    console.log(`create new port listener for: ${port_path}`)
    this.portH = new SerialPort({ path: port_path, baudRate: 115200 })
    this.portH.write(`Who are you?\r\n`)

    const parser = this.portH.pipe(new DelimiterParser({ delimiter: '\n' }))

    parser.on('data', function (data) {
      console.log(`IN data: ${data.toString('utf8')}`)
      if (data.toString('utf8').split(':')[0] == 'button_module') {
        let name = data.toString('utf8').split(':')[1]
        active_ports.forEach(element_a => {
          if (element_a.path == port_path) {
            element_a.name = name
            console.log(`Set name: ${name}`)
          }
        })

        //console.log(`Set name: ${JSON.stringify(this)}`)

        try {
          for (let index = 1; index < 9; index++) {
            mqtt_sub(`${name}/led_${index}`)
            console.log(`Subscribed: ${name}/led_${index}`)
          }
        } catch (err) {
          console.log(`Subscribing fail: ${err}`)
        }
      }

      if (data.toString('utf8').slice(0,2) != 'OK') {
        try {
          //let name= data.toString('utf8').split('/')[0]
          //let number= parseInt((data.toString('utf8').split('/')[1]).split(':')[0].split('_')[1])
          //let state= parseInt((data.toString('utf8').split('/')[1]).split(':')[1])
          //let cmd = `${name}/led_${number}:${state}\r\n`
          client.publish(`${data.toString('utf8').split(':')[0]}`, `${data.toString('utf8').split(':')[1]}`, { retain: true })

          // console.log(cmd)
          // portH.write(cmd)
        } catch (err) {
          console.log(`Publish fail: ${err}`)
        }
      }
    })
  }

  send_command(data) {
    this.portH.write(data)
  }

}

let dev_watcher = watch('/dev/', { recursive: false });
var active_ports = []
//const port = new SerialPort({ path: '/dev/ttyACM0', baudRate: 115200 })

console.log(SerialPort.list())

async function chek_dev_list() {
  while (active_ports.length > 0) {
    active_ports.pop();
  }
  let bind = autoDetect()
  const portsList = await bind.list()
  portsList.forEach(element_p => {
    if (element_p.manufacturer == 'button_module') {
      let non_in_array_flag = 0
      active_ports.forEach(element_a => {
        if (element_p.path == element_a.path) {
          non_in_array_flag = 1
        }
      })
      if (non_in_array_flag == 0) {
        active_ports.push(new portListener(element_p.path))
        //console.log(active_ports)
      }
    }
  })
  //console.log(ports)
}

// try {
//   var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
// } catch (err) {
//   console.error(`Error read file: ${err}`)
//   log_file(`Error read file: ${err}`, '../logs/uart2mqtt_log.txt')
//   process.exit(1);
// }

const client = mqtt.connect('mqtt://127.0.0.1:1883')
client.on('connect', function () {
  console.log("mqtt brocker connected!")
  setTimeout(chek_dev_list, 1000)
})

client.on('message', function (topic, message) {
  console.log(`MQTT in: ${topic}:${message}`)
  try {
    let name = topic.split('/')[0]
    active_ports.forEach(element => {
      //console.log(`Check listener: ${JSON.stringify(element)}`)
      //console.log(`Check listener: ${element.name}`)
      if (element.name == name) {
        console.log(`Send serial: ${topic}:${message}`)
        element.send_command(`${topic}:${message}`)
      }
    })
  } catch (err) {
    console.log(`MQTT recive fail: ${err}`)
  }
})


dev_watcher.on('change', function (evt, name) {
  //console.log(`Event: ${evt}    ---    Name: ${name}`)
  if(name.search('/dev/ttyACM')>=0){
    let flag_new_port = 1
    active_ports.forEach(element => {
      if(element.path==name){
        flag_new_port=0
      }
    })
    
    if((evt=='remove')||(flag_new_port==1)){
      console.log(`lets update port list`)
      chek_dev_list();
    }
    
  }
  
})