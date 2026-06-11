#!/usr/bin/env python3
"""
Persistent network-audio worker.

Holds prebuilt GStreamer pipelines in PAUSED state so that triggers from
player.js result in PAUSED -> PLAYING transitions (~ms) instead of cold
gst-launch spawns (~hundreds of ms).

Protocol (line-delimited JSON):
  stdin (commands from player.js):
    {"cmd":"load","streams":[{"key":..., "audio_path":..., "multicast_host":...,
                              "port":..., "ttl":..., "multicast_iface":...,
                              "codec":"pcm"|"opus", "volume":0.16}, ...]}
    {"cmd":"play","keys":["k1","k2"], "trigger_time":<ms epoch>}
    {"cmd":"stop_all"}
    {"cmd":"set_volume","value":0.16}
    {"cmd":"unload"}
    {"cmd":"shutdown"}

  stdout (events to player.js):
    {"event":"ready"}
    {"event":"loaded","keys":["k1","k2"]}
    {"event":"playing","key":"k1","trigger_time":<>,"elapsed_ms":<>}
    {"event":"eos","key":"k1"}
    {"event":"error","key":"k1","error":"..."}

  stderr: free-form log lines.
"""

import sys
import json
import re
import time
import threading
import traceback

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib

Gst.init(None)

streams = {}            # key -> AudioStream
mainloop = GLib.MainLoop()
lock = threading.Lock()


# ---- validators ----
# These values are interpolated into a GStreamer parse_launch description.
# parse_launch is a mini-DSL — spaces, "!", "name=", "=" can inject elements.
# We accept only values that cannot contain those metacharacters.
_IPV4_RE = re.compile(r'^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}'
                      r'(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$')
_IFACE_RE = re.compile(r'^[A-Za-z0-9._-]{1,15}$')

def _valid_ipv4(s):
    return isinstance(s, str) and bool(_IPV4_RE.match(s))

def _valid_iface(s):
    return isinstance(s, str) and bool(_IFACE_RE.match(s))


def emit(obj):
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def log(msg):
    sys.stderr.write(f"[audio_worker] {msg}\n")
    sys.stderr.flush()


class AudioStream:
    def __init__(self, cfg):
        self.cfg = cfg
        self.key = cfg['key']
        codec = (cfg.get('codec') or 'pcm').lower()
        if codec not in ('pcm', 'opus'):
            raise ValueError(f"invalid codec {codec!r} (must be 'pcm' or 'opus')")

        host = cfg['multicast_host']
        if not _valid_ipv4(host):
            raise ValueError(f"invalid multicast_host {host!r} (must be dotted IPv4)")

        try:
            port = int(cfg['port'])
        except (TypeError, ValueError):
            raise ValueError(f"invalid port {cfg.get('port')!r}")
        if not (1 <= port <= 65535):
            raise ValueError(f"port {port} out of range")

        try:
            ttl = int(cfg.get('ttl') or 1)
        except (TypeError, ValueError):
            raise ValueError(f"invalid ttl {cfg.get('ttl')!r}")
        if not (1 <= ttl <= 255):
            raise ValueError(f"ttl {ttl} out of range")

        iface = cfg.get('multicast_iface') or 'eth0'
        if not _valid_iface(iface):
            raise ValueError(f"invalid multicast_iface {iface!r}")

        try:
            volume = float(cfg.get('volume', 1.0))
        except (TypeError, ValueError):
            raise ValueError(f"invalid volume {cfg.get('volume')!r}")
        if not (0.0 <= volume <= 10.0):
            raise ValueError(f"volume {volume} out of range (0..10)")

        audio_path = cfg['audio_path']
        if not isinstance(audio_path, str) or not audio_path:
            raise ValueError("audio_path missing")

        # Codec selects between two hardcoded element chains — no interpolation.
        if codec == 'opus':
            payloader = (
                'opusenc bitrate=320000 frame-size=20 bandwidth=fullband '
                'bitrate-type=cbr dtx=false inband-fec=true ! '
                'rtpopuspay mtu=1472'
            )
        else:
            payloader = (
                'audio/x-raw,format=S16BE,channels=2,rate=48000 ! '
                'rtpL16pay pt=96'
            )

        # All interpolated values have been validated: host=IPv4, port/ttl=int,
        # iface=[A-Za-z0-9._-]{1,15}, volume=float in [0,10]. None of these can
        # contain GStreamer parse_launch metachars (space, '!', '=').
        pipeline_desc = (
            f'filesrc name=src ! decodebin ! audioconvert ! audioresample ! '
            f'audio/x-raw,channels=2,rate=48000 ! '
            f'volume name=vol volume={volume} ! '
            f'audioconvert ! '
            f'{payloader} ! '
            f'udpsink name=sink host={host} port={port} '
            f'sync=true auto-multicast=true multicast-iface={iface} ttl-mc={ttl}'
        )
        log(f"build {self.key}: {pipeline_desc}")
        self.pipeline = Gst.parse_launch(pipeline_desc)

        # Set source location via property to avoid escaping issues
        src = self.pipeline.get_by_name('src')
        if src:
            src.set_property('location', audio_path)
        self.volume_elem = self.pipeline.get_by_name('vol')

        # Bus watch
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message', self._on_message)

        self.is_playing = False
        self.pending_trigger_time = None

        # Prewarm to PAUSED (preroll first buffer; udpsink will hold it)
        ret = self.pipeline.set_state(Gst.State.PAUSED)
        log(f"{self.key} set PAUSED -> {ret.value_nick}")

    def _on_message(self, bus, msg):
        t = msg.type
        if t == Gst.MessageType.EOS:
            log(f"{self.key} EOS, resetting")
            self.is_playing = False
            self.pipeline.set_state(Gst.State.PAUSED)
            # Wait briefly for state change to settle
            self.pipeline.get_state(Gst.SECOND // 2)
            self.pipeline.seek_simple(
                Gst.Format.TIME,
                Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
                0,
            )
            emit({'event': 'eos', 'key': self.key})
        elif t == Gst.MessageType.ERROR:
            err, debug = msg.parse_error()
            log(f"{self.key} ERROR: {err.message} | {debug}")
            emit({'event': 'error', 'key': self.key, 'error': str(err.message), 'debug': str(debug or '')})
        elif t == Gst.MessageType.STATE_CHANGED:
            # only log pipeline-level transitions
            if msg.src is self.pipeline:
                old, new, pending = msg.parse_state_changed()
                log(f"{self.key} state {old.value_nick} -> {new.value_nick} (pending={pending.value_nick})")
                if new == Gst.State.PLAYING and self.pending_trigger_time is not None:
                    trig = self.pending_trigger_time
                    self.pending_trigger_time = None
                    elapsed = int((time.time() * 1000) - trig)
                    emit({'event': 'playing', 'key': self.key, 'trigger_time': trig, 'elapsed_ms': elapsed})

    def play(self, trigger_time=None):
        self.pending_trigger_time = trigger_time
        self.is_playing = True
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        log(f"{self.key} set PLAYING -> {ret.value_nick}")

    def stop(self):
        self.is_playing = False
        self.pending_trigger_time = None
        self.pipeline.set_state(Gst.State.PAUSED)
        self.pipeline.get_state(Gst.SECOND // 2)
        self.pipeline.seek_simple(
            Gst.Format.TIME,
            Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
            0,
        )

    def set_volume(self, v):
        if self.volume_elem:
            self.volume_elem.set_property('volume', float(v))

    def teardown(self):
        try:
            self.pipeline.set_state(Gst.State.NULL)
        except Exception as e:
            log(f"{self.key} teardown error: {e}")


def teardown_all():
    with lock:
        for s in streams.values():
            s.teardown()
        streams.clear()


def cmd_load(streams_cfg):
    teardown_all()
    loaded = []
    with lock:
        for c in streams_cfg:
            try:
                s = AudioStream(c)
                streams[s.key] = s
                loaded.append(s.key)
            except Exception as e:
                log(f"failed to build stream {c.get('key')}: {e}\n{traceback.format_exc()}")
                emit({'event': 'error', 'key': c.get('key'), 'error': str(e)})
    emit({'event': 'loaded', 'keys': loaded})


def cmd_play(keys, trigger_time):
    with lock:
        for k in keys:
            s = streams.get(k)
            if s is not None:
                s.play(trigger_time=trigger_time)
            else:
                log(f"play: unknown key {k}")


def cmd_stop_all():
    with lock:
        for s in streams.values():
            if s.is_playing:
                s.stop()


def cmd_set_volume(value):
    with lock:
        for s in streams.values():
            s.set_volume(value)


def handle_command(line):
    try:
        cmd = json.loads(line)
    except Exception as e:
        log(f"bad json: {line[:120]} err={e}")
        return False
    name = cmd.get('cmd')
    if name == 'load':
        cmd_load(cmd.get('streams', []))
    elif name == 'play':
        cmd_play(cmd.get('keys', []), cmd.get('trigger_time'))
    elif name == 'stop_all':
        cmd_stop_all()
    elif name == 'set_volume':
        cmd_set_volume(cmd.get('value', 1.0))
    elif name == 'unload':
        teardown_all()
    elif name == 'shutdown':
        teardown_all()
        mainloop.quit()
    else:
        log(f"unknown cmd: {name}")
    return False  # so GLib.idle_add doesn't repeat


def stdin_reader():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        # schedule on main loop so all GStreamer ops happen there
        GLib.idle_add(handle_command, line)
    # stdin closed -> shut down
    log("stdin EOF, shutting down")
    GLib.idle_add(lambda: (teardown_all(), mainloop.quit(), False)[2])


def main():
    emit({'event': 'ready'})
    t = threading.Thread(target=stdin_reader, daemon=True)
    t.start()
    try:
        mainloop.run()
    except KeyboardInterrupt:
        pass
    teardown_all()


if __name__ == '__main__':
    main()
