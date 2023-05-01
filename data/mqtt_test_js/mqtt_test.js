const scribbles = require('scribbles');
const mqtt = require("mqtt");

var count=0
const client = mqtt.connect('mqtt://127.0.0.1:1883')

function testPub() {
    count++
    client.publish("testScript/testPub", `${count}`)

    //setTimeout(testPub(), 1000)
}


client.on('connect', function(){
    scribbles.log("mqtt brocker connected!");
    setInterval(testPub, 1000)
})