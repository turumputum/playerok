import paho.mqtt.client as mqtt
import time

knock_topic = "moduleBox/in_1"
doorSenes_topic = "moduleBox/in_0"

commmand_topic = "moduleBox/out_0"
player_topic = "script/play"
vidoEnd_topic = "script/playEnd"

door_cmd = "CLOSE"
sens_state = "OPEN"
door_state = "IDLE"

flagKnock = 0

def input_mqtt_msg(client, userdata, msg):
    global door_cmd
    global sens_state
    global flagKick
    global flagKnock

    if(str(msg.topic) == str(knock_topic)):
        if(msg.payload.decode("utf-8")=='1'):
            print("knock")
            if(sens_state=="CLOSE"):
                door_cmd = "OPEN"
                print("lets open")
                

    if(msg.topic == vidoEnd_topic):
        door_cmd = "CLOSE"
        print("video end, lets close")

    if(msg.topic == doorSenes_topic):
        if(msg.payload.decode("utf-8")=='1'):
            sens_state = "CLOSE"
            print("door is closed")
        else:
            sens_state = "OPEN"
            print("door is open")

def on_connect(client, userdata, flags, rc, properties):
    print("Connected with result code:", rc)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
def mqtt_init():
    global client
    client.on_connect = on_connect
    client.connect('127.0.0.1', 1883, 60)

    client.subscribe(knock_topic)
    client.subscribe(doorSenes_topic)
    client.subscribe(vidoEnd_topic)


    client.on_message = input_mqtt_msg
    client.loop_start()



last_command_time = 0 
def gateKick():
    global last_command_time

    now = time.time()

    print("time delta:"+str(now - last_command_time))
    if now - last_command_time < 31:
        print("double kick")
        client.publish(commmand_topic, 1)
        time.sleep(1.0)
        client.publish(commmand_topic, 1)
    else:
        client.publish(commmand_topic, 1)
        print("one kick")

    last_command_time = now


mqtt_init()
time.sleep(3)
# control_door("CLOSE")



print("START LOOP")
while 1:
    time.sleep(0.1)

    if door_state=="IDLE":
        if(sens_state!=door_cmd):
            door_state="MOVING"
            gateKick()
            if(door_cmd=="OPEN"):
                client.publish(player_topic, 1)

    if door_state=="MOVING":
        if(sens_state==door_cmd):
            door_state="IDLE"
            print("door_state=IDLE")
    # if(sens_state!=door_cmd){

    # }

    # control_door(door_cmd)