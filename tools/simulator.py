"""Drive the DevEco Lite Wearable simulator without the IDE (Windows only).

Runs the built JS (entry/build/.../loader_out_lite) in the SDK's Simulator.exe on a
408x480 rectangular screen, plays a scenario of taps / crown turns / waits and saves
screenshots, and prints the engine log (JS errors, console.info, crashes).

Usage:
  python tools/simulator.py --url pages/index/index --out shots \
      "wait 2" "shot home" "tap 200 150" "wait 1" "shot next" "crown -1" ...

Steps:
  wait <sec>          keep receiving frames
  tap <x> <y>         press + release at screen coordinates
  swipe <x1> <y1> <x2> <y2>   drag (e.g. "swipe 60 240 360 240" = swipe right)
  crown <n>           rotate the crown (negative = up)
  shot <name>         save the latest frame to <out>/<name>.jpg

How it works (found while building the BreathTrainer app on the same watch):
  - the simulator is a *client* of the message-mode pipe \\\\.\\pipe\\<name>_commandPipe,
    so this script creates the pipe before launching it;
  - timers and callbacks only run while a frame client is connected to the WebSocket
    ws://127.0.0.1:<port>/<sid>; frames are JPEG after a small header;
  - config/ (fonts) from the previewer must sit next to the working directory.
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import websocket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SDK = os.environ.get('DEVECO_SDK_HOME', r'C:\Program Files\Huawei\DevEco Studio\sdk')
PREVIEWER = os.path.join(SDK, 'default', 'hms', 'previewer', 'liteWearable')
SIMULATOR = os.path.join(PREVIEWER, 'bin', 'Simulator.exe')
JS_DIR = os.path.join(ROOT, 'entry', 'build', 'default', 'intermediates', 'loader_out_lite',
                      'default', 'js', 'MainAbility')

k32 = ctypes.WinDLL('kernel32', use_last_error=True)
PIPE_ACCESS_DUPLEX = 3
PIPE_TYPE_MESSAGE = 4
PIPE_READMODE_MESSAGE = 2
INVALID_HANDLE = wt.HANDLE(-1).value
k32.CreateNamedPipeW.restype = wt.HANDLE
k32.CreateNamedPipeW.argtypes = [wt.LPCWSTR, wt.DWORD, wt.DWORD, wt.DWORD, wt.DWORD, wt.DWORD, wt.DWORD, ctypes.c_void_p]
k32.ConnectNamedPipe.argtypes = [wt.HANDLE, ctypes.c_void_p]
k32.WriteFile.argtypes = [wt.HANDLE, ctypes.c_void_p, wt.DWORD, ctypes.POINTER(wt.DWORD), ctypes.c_void_p]


class CommandPipe:
    def __init__(self, name):
        self.handle = k32.CreateNamedPipeW('\\\\.\\pipe\\' + name + '_commandPipe', PIPE_ACCESS_DUPLEX,
                                           PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE, 1, 65536, 65536, 0, None)
        if self.handle == INVALID_HANDLE:
            raise OSError('CreateNamedPipe failed: %d' % ctypes.get_last_error())
        self.connected = threading.Event()
        threading.Thread(target=self._wait, daemon=True).start()

    def _wait(self):
        k32.ConnectNamedPipe(self.handle, None)
        self.connected.set()

    def send(self, command, args, kind='action'):
        msg = json.dumps({'type': kind, 'command': command, 'version': '1.0.1', 'args': args}).encode()
        written = wt.DWORD(0)
        k32.WriteFile(self.handle, msg, len(msg), ctypes.byref(written), None)


class Frames:
    def __init__(self, port, sid):
        self.latest = None
        self.count = 0
        self.url = 'ws://127.0.0.1:%d/%s' % (port, sid)
        self.ws = None
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        for _ in range(100):
            try:
                self.ws = websocket.create_connection(self.url, timeout=5)
                break
            except Exception:
                time.sleep(0.2)
        if self.ws is None:
            print('[sim] websocket: could not connect to ' + self.url)
            return
        while True:
            try:
                data = self.ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            except Exception:
                return
            if isinstance(data, bytes):
                start = data.find(b'\xff\xd8\xff')
                if start != -1:
                    self.latest = data[start:]
                    self.count += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='pages/index/index')
    ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'reppulse-sim'))
    ap.add_argument('--port', type=int, default=40077)
    ap.add_argument('--js', default=JS_DIR, help='built JS folder (default: this checkout)')
    ap.add_argument('--heap', type=int, default=102400)
    ap.add_argument('--lang', default='ru-RU',
                    help='UI language (ru-RU or en-US). The lite simulator ignores its own -l flag and always '
                         'uses en-US, so for ru-RU the copied bundle gets ru-RU.json in place of en-US.json')
    ap.add_argument('steps', nargs='*')
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    work = tempfile.mkdtemp(prefix='reppulse-sim-')
    shutil.copytree(os.path.join(PREVIEWER, 'config'), os.path.join(work, 'config'))
    run_dir = os.path.join(work, 'run')
    os.makedirs(run_dir)
    js_dir = os.path.join(work, 'js')
    shutil.copytree(a.js, js_dir)
    if a.lang != 'en-US':
        shutil.copyfile(os.path.join(js_dir, 'i18n', a.lang + '.json'), os.path.join(js_dir, 'i18n', 'en-US.json'))

    name = 'reppulse' + uuid.uuid4().hex[:6]
    sid = uuid.uuid4().hex
    pipe = CommandPipe(name)
    cmd = [SIMULATOR, '-j', js_dir, '-s', name, '-n', 'entry', '-device', 'liteWearable',
           '-shape', 'rect', '-or', '408', '480', '-cr', '408', '480', '-lws', str(a.port),
           '-sid', sid, '-hs', str(a.heap), '-url', a.url]
    proc = subprocess.Popen(cmd, cwd=run_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = []

    def pump():
        for raw in proc.stdout:
            line = raw.decode('utf-8', 'replace').rstrip()
            log.append(line)
            print('[engine] ' + line)
    threading.Thread(target=pump, daemon=True).start()

    frames = Frames(a.port, sid)
    if not pipe.connected.wait(15):
        print('[sim] command pipe not connected')
    time.sleep(1.5)

    def press(x, y):
        pipe.send('MousePress', {'x': x, 'y': y})
        time.sleep(0.08)
        pipe.send('MouseRelease', {'x': x, 'y': y})

    try:
        for step in a.steps:
            parts = step.split()
            op = parts[0]
            if op == 'wait':
                time.sleep(float(parts[1]))
            elif op == 'tap':
                press(int(parts[1]), int(parts[2]))
                time.sleep(0.4)
            elif op == 'swipe':
                x1, y1, x2, y2 = [int(p) for p in parts[1:5]]
                # A slow, finger-like drag: a fast one only nudges a list.
                pipe.send('MousePress', {'x': x1, 'y': y1})
                for i in range(1, 25):
                    time.sleep(0.03)
                    pipe.send('MouseMove', {'x': x1 + (x2 - x1) * i // 24, 'y': y1 + (y2 - y1) * i // 24})
                time.sleep(0.15)
                pipe.send('MouseRelease', {'x': x2, 'y': y2})
                time.sleep(0.8)
            elif op == 'crown':
                pipe.send('CrownRotate', {'rotate': float(parts[1])})
                time.sleep(0.4)
            elif op == 'shot':
                time.sleep(0.3)
                path = os.path.join(a.out, parts[1] + '.jpg')
                if frames.latest:
                    with open(path, 'wb') as f:
                        f.write(frames.latest)
                    print('[sim] saved ' + path)
                else:
                    print('[sim] no frame yet for ' + parts[1])
            if proc.poll() is not None:
                print('[sim] simulator exited with code %s' % proc.returncode)
                break
    finally:
        alive = proc.poll() is None
        proc.kill()
        print('[sim] frames received: %d, simulator alive at the end: %s' % (frames.count, alive))
    shutil.rmtree(work, ignore_errors=True)
    sys.exit(0 if alive else 1)


if __name__ == '__main__':
    main()
