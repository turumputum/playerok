import paho.mqtt.client as mqtt
import time

knock_topic = "moduleBox/in_1"
doorSenes_topic = "moduleBox/in_0"

commmand_topic = "moduleBox/out_0"
player_topic = "script/play"
vidoEnd_topic = "script/playEnd"

door_cmd = "CLOSE"
door_state = "CLOSED"

def input_mqtt_msg(client, userdata, msg):
    global door_cmd
    global door_state

    if(str(msg.topic) == str(knock_topic)):
        if(msg.payload.decode("utf-8")=='1'):
            if(door_state=="CLOSED"):
                door_cmd = "OPEN"
                client.publish(player_topic, "1")
            print("knock")

    if(msg.topic == vidoEnd_topic):
        door_cmd = "CLOSE"
        print("close door")

    if(msg.topic == doorSenes_topic):
        if(msg.payload.decode("utf-8")=='1'):
            door_state = "CLOSED"
            print("door is closed")
        else:
            door_state = "OPEN"
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



# last_command_time = 0 
def control_door(command):
    # global last_command_time
    global door_state
    
    if door_state == 'OPEN' and command == 'OPEN':
        return
    if door_state == 'CLOSED' and command == 'CLOSE':
        return

    # now = time.time()

    print("command:"+command + " doorState:" + door_state)
    # if now - last_command_time < 30:
    #     print("double comm")
    #     client.publish(commmand_topic, 1)
    #     time.sleep(5.0)
    #     client.publish(commmand_topic, 1)
    #     time.sleep(30.0)
    # else:
    client.publish(commmand_topic, 1)
    time.sleep(30.0)
    print("door wait OFF") 

    # last_command_time = now


mqtt_init()
time.sleep(3)
# control_door("CLOSE")

print("START LOOP")
while 1:
    time.sleep(0.1)
    control_door(door_cmd)