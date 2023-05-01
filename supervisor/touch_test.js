const Evdev = require('evdev');

// Имя устройства touchscreen, например, /dev/input/event0
var devicePath = "/dev/input/event2";
console.log(devicePath)
// Создаем объект Evdev с использованием имени устройства
const reader = new Evdev();

// // Настраиваем обработку событий touchscreen
// device.on('EV_ABS', (event) => {
//   // Обрабатываем событие
//   console.log(event);
// });

reader.on("EV_KEY",function(data){
    console.log("key : ",data.code,data.value);
  }).on("error",function(e){
    console.log("reader error : ",e);
  })

const target_match = "event-mouse"

// Начинаем чтение событий
reader.search("/dev/input/by-path", target_match, function(err,files){
  var device;
  const target_index =  parseInt(process.argv[3]); // don't forget to check if NaN
  if(err){
    console.log("node-evdev search stream : ", err);
  }else{
      //console.log("Opening : %s", files[target_index]);
      //device = reader.open(files[target_index]);
      var target = "/dev/input/event2"
      //var target = "/dev/input/by-path/pci-0000:00:15.0-usb-0:1:1.0-event-kbd"
      console.log(`Open mydev:${target}`)
      device = reader.open(target)
    
  }
  //We don't check if device is assigned because any code path that does not return should assign it.
  device.on("open",function(){
    console.log(device.id);
  });
  device.on("EV_KEY",function(data){
    console.log("key : ",data.code,data.value);
  }).on("error",function(e){
    console.log("reader error : ",e);
  })
  
});