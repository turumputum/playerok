#!/bin/bash
set -e

FILE=${1:-/home/playerok/playerok/data/content/bur_eng.mp3}
HOST=${2:-239.0.7.10}
PORT=${3:-7777}
CODEC=${4:-opus}

if [[ ! -f "$FILE" ]]; then
  echo "Audio file not found: $FILE"
  exit 1
fi

echo "Streaming file: $FILE (looping)"
echo "Host: $HOST Port: $PORT Codec: $CODEC"

gst-launch-1.0 -e \
  filesrc location="$FILE" ! decodebin ! audioconvert ! audioresample ! audio/x-raw,channels=2,rate=48000 \
  $(if [[ "$CODEC" == "pcm" ]]; then
      echo "! audio/x-raw,format=S16BE,channels=2,rate=48000 ! rtpL16pay pt=96"
    else
      echo "! opusenc bitrate=320000 frame-size=20 bandwidth=fullband bitrate-type=cbr dtx=false inband-fec=true ! rtpopuspay mtu=1472"
    fi) \
  ! udpsink host="$HOST" port="$PORT" sync=true auto-multicast=true multicast-iface=eth0 ttl=1
