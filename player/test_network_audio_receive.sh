#!/bin/bash
set -e

HOST=${1:-239.0.7.10}
PORT=${2:-7777}
CODEC=${3:-opus}

echo "Listening for audio stream on $HOST:$PORT (codec: $CODEC)"

if [[ "$CODEC" == "pcm" ]]; then
  gst-launch-1.0 -v udpsrc multicast-group="$HOST" port="$PORT" multicast-iface=eth0 auto-multicast=true \
    ! "application/x-rtp,media=audio,payload=96,clock-rate=48000,encoding-name=L16,channels=2" \
    ! rtpL16depay ! audioconvert ! audioresample ! autoaudiosink
else
  gst-launch-1.0 -v udpsrc multicast-group="$HOST" port="$PORT" multicast-iface=eth0 auto-multicast=true \
    ! "application/x-rtp,media=audio,payload=96,clock-rate=48000,encoding-name=OPUS" \
    ! rtpopusdepay ! opusdec ! audioconvert ! audioresample ! autoaudiosink
fi