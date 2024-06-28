const mqtt = require("mqtt");
const scribbles = require('scribbles');

const topic_vid_1_1= 'usbkill/vid_1_1';
const topic_vid_1_2= 'usbkill/vid_1_2';
const topic_vid_2_1= 'usbkill/vid_2_1';
const topic_vid_2_2= 'usbkill/vid_2_2';
const topic_vid_3_1= 'usbkill/vid_3_1';
const topic_vid_3_2= 'usbkill/vid_3_2';

const topic_playEnd= 'usbkill/playEnd';

const topic_buttons_mass = [['mb-usb-1/button_0','mb-usb-2/button_0','mb-usb-1/button_1','mb-usb-2/button_1','mb-usb-1/button_2','mb-usb-2/button_2'],
                            ['mb-usb-1/button_3','mb-usb-2/button_3','mb-usb-1/button_4','mb-usb-2/button_4','mb-usb-1/button_5','mb-usb-2/button_5']] 

var topic_smartLeds_mass = ['mb-usb-1/smartLed_0', 'mb-usb-2/smartLed_0','mb-usb-1/smartLed_1', 'mb-usb-2/smartLed_1','mb-usb-1/smartLed_2', 'mb-usb-2/smartLed_2'];

var portStateMass = [0,0,0,0,0,0];
var activePorts = [0,1,1,0,0,1];
//var activePorts = [0,0,0,0,0,0];//все порты выключенны

const NONE = '0 0 0'
const BLUE = '0 0 255'
const RED = '255 0 0'
const GREEN = '0 255 0'
/*led stats: 
0 NONE 
1 RED
11 FLASH RED
2 GREEN
21 FLASH GREEN
*/

var gameState = 'IDLE';
var vidoState = 'NONE';

var insetedFlash=0;

//--------MQTT handlers---------------------
client = mqtt.connect('mqtt://127.0.0.1:1883')



client.on('connect', function () {
  scribbles.log("mqtt brocker connected!")
  subscribeToTopics(topic_buttons_mass);
  client.subscribe(topic_playEnd);

  // setTimeout(() => {
  //   for(let i=0; i<topic_smartLeds_mass.length; i++){
  //     //scribbles.log(topic_smartLeds_mass[i], typeof(topic_smartLeds_mass[i]))
  //     client.publish(topic_smartLeds_mass[i], '1');
  //     }
  // }, 1000);


  setTimeout(() => {
    gameRestart()
  }, 4000);
  // scribbles.log("clean topics_list")
  // fs.writeFile('/home/playerok/playerok/meta/topics_list.json', "")

})

function gameRestart(){
  scribbles.log(`game restart, set standby video`);
  gameState='IDLE';
  for(let i=0; i<topic_smartLeds_mass.length; i++){
    if(activePorts[i]==1){
      setLedMode(i, GREEN, 'default');
    }else{
      setLedMode(i, BLUE, 'default');
    }
  }
}

function playVideo(chel, devType){
  if(chel==0){
    if(devType=='duck'){
      client.publish(topic_vid_1_1, '1');
    }else if(devType=='killer'){
      client.publish(topic_vid_1_2, '1');
    }
  }else if(chel==1){
    if(devType=='duck'){
      client.publish(topic_vid_2_1, '1');
    }else if(devType=='killer'){
      client.publish(topic_vid_2_2, '1');
    }
  }else if(chel==2){
    if(devType=='duck'){
      client.publish(topic_vid_3_1, '1');
    }else if(devType=='killer'){
      client.publish(topic_vid_3_2, '1');
    }
  }
}

client.on('message', function (topic, message) {
  scribbles.log(`MQTT in: ${topic}:${message}`)
  if(topic.toString()==topic_playEnd){
    //scribbles.log(`playEnd: ${message}`)
    //to-do here
    if(insetedFlash==0){
      gameRestart();
    }else{
      gameState = 'END_VIDEO';
      scribbles.log(`remove flash:${insetedFlash} waiting`);
      for(let i=0; i<topic_smartLeds_mass.length; i++){
        if(portStateMass[i]==1){
          setLedMode(i, RED, 'flash');
        }else{
          setLedMode(i, NONE, 'default');
        }
      }
    }
    scribbles.log("video play end")
  }else if(topic.includes("button")){
    var tmpIndex = findIndexInMultiArray(topic_buttons_mass, topic);
    if(tmpIndex[0]==0){
      typeDev='killer'
    }else if(tmpIndex[0]==1){
      typeDev='duck'
    }else{
      typeDev='none'
    }
    var buttonIndex = tmpIndex[1];
    scribbles.log(`button:${topic} event:${message}, index:${tmpIndex} buttonIndex:${buttonIndex}`) 
    if(message.toString()=='1'){//update portMass
      //scribbles.log(`${topic}, ${message}, ${typeDev}, ${buttonIndex}`);
      portStateMass[buttonIndex]=1
      insetedFlash++;
    }else{
      //scribbles.log(`${topic}, ${message}`);
      insetedFlash--;
      if(insetedFlash<0){
        insetedFlash=0;
      }
      portStateMass[buttonIndex]=0
    }

    
    if(gameState=='IDLE'){
      if(message.toString()=="1"){//вставили флешку
        var chel = Math.trunc(buttonIndex/2)
        if(activePorts[buttonIndex]==1){//порт активен
          scribbles.log(`lets play vidos for chel: ${chel}, type: ${typeDev}`);
          playVideo(chel, typeDev);
          gameState = 'PLAY';
          vidoState = 'PLAY';
          //all led disable
          for(let i=0; i<topic_smartLeds_mass.length; i++){
            setLedMode(i, NONE, "default");
          }
          //reActivate ports
          if(buttonIndex%2==0){
            activePorts[buttonIndex]=0;
            activePorts[buttonIndex+1]=1;
          }else{
            activePorts[buttonIndex]=0;
            activePorts[buttonIndex-1]=1;
          }
        }else{//порт не активен
          scribbles.log(`wrong port for chel: ${chel}, type: ${typeDev}`);
          setLedMode(buttonIndex, RED, "flash");
          setTimeout(() => {
            setLedMode(buttonIndex, NONE, "default");
          }, 1000);
        }
      }else if(message.toString()=="0"){//достали флешку
        if(activePorts[buttonIndex]==1){//порт активен
          setLedMode(buttonIndex, GREEN, "default");
        }else{//порт не активен
          setLedMode(buttonIndex, BLUE, "default");
        }
      }
    }else {
      if(message.toString()=="1"){//вставили флешку
        setLedMode(buttonIndex, RED, "flash");
      }else{
        setLedMode(buttonIndex, NONE, "default");
      }
      if(gameState=='END_VIDEO'){
        if(insetedFlash==0){
          gameRestart();
        }
      }
    }
  }
})

// setInterval(gameCheker, 50);
// function gameCheker(){
//   if(gameEvent != 'gameStart'){
//     for(var i = 0; i < portStateMass.length; i++){
//       if(activePorts[i]=0){
//         setLedMode(i, RED, 'default');
//       }else{
//         setLedMode(i, BLUE, 'default');
//       }
//       gameState="IDLE";
//     }
//   }else if(gameEvent == 'BUTTON'){
//     if(gameState == 'IDLE'){
//       for(var i = 0; i < portStateMass.length; i++){
//         if(portStateMass[i]!=0){
//           if(activePorts[i]==1){
//             setLedMode(i, GREEN, 'flash');
//             gemeEvent = 'playVideo';
//           }else{
//             setLedMode(i, RED, 'flash');
//           }
//         }else{
//           if(activePorts[i]==1){
//             setLedMode(i, GREEN, 'flash');
//             gemeEvent = 'playVideo';
//           }else{
//             setLedMode(i, RED, 'flash');
//           }
//         }
//       }
//     }else if(gameState == 'playVideo'){
      
//     }
//     scribbles.log("gameEvent: "+gameEvent)
//     if(gameEvent.includes("BUTTON_PRESSED")){
//       if(gameState == 'IDLE'){
//         gameState = 'PLAY';
//         scribbles.log("gameState: "+gameState)
//       }
//     }
    
//     gameEvent = 'NONE';
//     // switch(gameEvent){
//     //     case "BUTTON_0":
//     //         scribbles.log("BUTTON_0")
//     //         break;
//     //     case "BUTTON_1":
//     //         scribbles.log("BUTTON_1")
//     //         break;
//   }
// }


function setLedMode(index, color, mode){
  client.publish(`${topic_smartLeds_mass[index]}/setMode`, mode);
  client.publish(`${topic_smartLeds_mass[index]}/setRGB`, color);
}

// Функция для подписки на топики
function subscribeToTopics(topicArrays) {
  for (let i = 0; i < topicArrays.length; i++) {
    const innerArray = topicArrays[i];
    for (let j = 0; j < innerArray.length; j++) {
      const topic = innerArray[j];
      client.subscribe(topic, (err) => {
        if (err) {
          console.error(`Error subscribing to topic ${topic}: ${err}`);
        } else {
          //scribbles.log(`Subscribed to topic ${topic}`);
        }
      });
    }
  }
}

function findIndexInMultiArray(multiArray, value) {
  for (let i = 0; i < multiArray.length; i++) {
    const innerArray = multiArray[i];
    for (let j = 0; j < innerArray.length; j++) {
      if (innerArray[j] === value) {
        return [i, j]; // Возвращаем индексы в виде массива [внешний, внутренний]
      }
    }
  }
  return [-1, -1]; // Если элемент не найден, возвращаем [-1, -1]
}