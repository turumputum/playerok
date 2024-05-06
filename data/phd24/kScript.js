const mqtt = require('mqtt');
const scribbles = require('scribbles');

const playDelay = 5000;

const  rfid_wl = [
    ["01 01 00 04 08 04 DD 4E F4 62","01 01 00 04 08 04 33 AE C5 15", "01 01 00 04 08 04 F3 AE AE 15"],
    ["01 01 00 04 08 04 DD 4E F4 62","01 01 00 04 08 04 33 AE C5 15", "01 01 00 04 08 04 F3 AE AE 15"],
    ["01 01 00 04 08 04 DD 4E F4 62","01 01 00 04 08 04 33 AE C5 15", "01 01 00 04 08 04 F3 AE AE 15"]
]

const rfid_topics = [
    "mb_k_1/rfid_0",
    "mb_k_1/rfid_2",
    "mb_k_2/rfid_4"
]

const led_topics = [
    "mb_k_1/smartLed_1",
    "mb_k_1/smartLed_3",
    "mb_k_1/smartLed_5"
]

const buttonTopic = "mb_k_2/button_2"
const buttonLedTopic = "mb_k_2/led_2"

var gameState = "card_insert_waiting";
var readerState = [0,0,0]; //0- empty, -1 not valid, 1 - valid
var ledState = [0,0,0]; //0-solidWhite, 1-flashWite, 2-solidRed, 3-solidGren, 4-rainbow

//--------MQTT handlers---------------------
const client = mqtt.connect('mqtt://127.0.0.1:1883')
client.on('connect', function () {
  scribbles.log("mqtt brocker connected!")
  client.subscribe(rfid_topics, (err) => {
    if (err) {
      console.error('Error subscribing to topics:', err);
    } else {
      console.log('Subscribed to topics:', rfid_topics);
    }
  }); 
  client.subscribe(buttonTopic, (err) => {
    if (err) {
      console.error('Error subscribing to topics:', err);
    } else {
      console.log('Subscribed to topics:', buttonTopic);
    }
  });

  client.publish(`${led_topics[0]}`, '1');
  client.publish(`${led_topics[1]}`, '1');
  client.publish(`${led_topics[2]}`, '1');
  client.publish(`mb_k_2/out_3`, '1');
})

// Обработчик входящих сообщений
client.on('message', (topic, message) => {
  console.log(`Received message on topic ${topic}:${message}!`);
  const t_index = rfid_topics.indexOf(topic);
  if (t_index >= 0) {
    if (message == 'NONE') {
      console.log(`reader:${t_index} is empty`);
      readerState[t_index] = 0;
    }else{
      // input rfid msg
      readerState[t_index] = -1;
      // check rfid in whitelist
      for (const [index, validRfid] of rfid_wl[t_index].entries()) {
        //console.log(`RFID:${message}# valid:${validRfid}#`);
        if (validRfid == message) {
            console.log(`RFID: ${message} is in whitelist:${t_index}`);
            readerState[t_index] = 1;
            // client.publish(led_topics[t_index], '1');
            break;
        }
      }
    }
    if((gameState== "card_insert_waiting")||(gameState== "card_inserted")){
      console.log(readerState);
      if (readerState[t_index] == 0) {
        client.publish(`${led_topics[t_index]}/setIncrement`, '5');
        client.publish(`${led_topics[t_index]}/setRGB`, '20 20 20');
        client.publish(`${led_topics[t_index]}/setMode`, 'default');
      }else{
        client.publish(`${led_topics[t_index]}/setIncrement`, '5');
        client.publish(`${led_topics[t_index]}/setRGB`, '150 150 150');
        client.publish(`${led_topics[t_index]}/setMode`, 'default');
      }
    }
  }else if (topic == buttonTopic) {
    if (message == "1") {
      console.log(`Button pressed!`);
      if (gameState == "card_inserted") {
        gameState = "showResult";
      }
    }
  }
});

function colorizeLeds(){
  console.log("show result!"); 
  for(index = 0; index < 3; index++){
    client.publish(`${led_topics[index]}/setIncrement`, '5');
    client.publish(`${led_topics[index]}/setMode`, 'default');
    if(readerState[index]==1){
      client.publish(`${led_topics[index]}/setRGB`, '0 150 0');
    }else{
      client.publish(`${led_topics[index]}/setRGB`, '150 0 0');
    }
    
  }
  setTimeout(()=>{
    gameState="card_insert_waiting"
    client.publish(`mb_k_2/out_3`, '1');
    console.log("game repeat");
  },3000)
  
}

function gameCheker(){
  if((gameState == "card_insert_waiting")||(gameState == "card_inserted")){
    if(readerState[0] != 0 && readerState[1] != 0 && readerState[2] != 0){
      gameState = "card_inserted";
      //console.log("all Card inserted!");
      client.publish(buttonLedTopic, '1');
    }else{
      gameState = "card_insert_waiting";
      //console.log("some resder is emty!");
      client.publish(buttonLedTopic, '0');
    }
  }else if(gameState == "showResult"){
    gameState = "indicate_result";
    console.log("show rainbow!");
    for(index = 0; index < 3; index++){
      client.publish(`${led_topics[index]}/setMode`, 'rainbow');
      client.publish(`${led_topics[index]}/setIncrement`, '6');
      //client.publish(`${led_topics[index]}/setRGB`, '250 250 250');
    }
    
    if(readerState[0] == 1 && readerState[1] == 1 && readerState[2] == 1){
      client.publish(`mb_k_2/player_0/play`, '0');
      client.publish(`mb_k_2/out_3`, '0');
    }else{
      client.publish(`mb_k_2/player_0/play`, '1');
    }
    setTimeout(colorizeLeds, playDelay);
  }
}
setInterval(gameCheker, 200);


