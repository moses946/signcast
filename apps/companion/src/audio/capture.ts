import workletUrl from './pcm.worklet.ts?worker&url';
export class MicrophoneCapture {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private socket?: WebSocket;
  private source?: MediaStreamAudioSourceNode;
  async start(
    deviceId: string,
    csrf: string,
    onLevel: (n: number) => void,
    onError: (s: string) => void,
  ) {
    await this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      this.context = new AudioContext();
      await this.context.resume();
      await this.context.audioWorklet.addModule(workletUrl);
      this.node = new AudioWorkletNode(this.context, 'signcast-pcm');
      this.source = this.context.createMediaStreamSource(this.stream);
      const url = new URL('/ws/capture', location.origin);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = (this.socket = new WebSocket(url));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Microphone connection timed out.')), 8000);
        socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', csrf }));
        socket.onmessage = (event) => {
          try {
            if (JSON.parse(event.data).type === 'capture-ready') {
              clearTimeout(timer);
              resolve();
            }
          } catch {}
        };
        socket.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Microphone connection failed.'));
        };
        socket.onclose = () => {
          clearTimeout(timer);
          reject(new Error('Capture session was rejected.'));
        };
      });
      socket.onclose = () => {
        if (this.socket === socket) {
          onError('Microphone disconnected. Resume capture to continue.');
          void this.stop();
        }
      };
      this.node.port.onmessage = (event) => {
        if (event.data.type === 'level') onLevel(event.data.value);
        else if (socket.readyState === WebSocket.OPEN) {
          if (socket.bufferedAmount > 32_000) {
            onError('Audio connection is too slow. Capture stopped to prevent a backlog.');
            void this.stop();
            return;
          }
          socket.send(event.data.buffer);
        }
      };
      this.source.connect(this.node);
      this.node.connect(this.context.destination);
      this.stream.getTracks().forEach(
        (track) =>
          (track.onended = () => {
            onError('Microphone was disconnected.');
            void this.stop();
          }),
      );
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  async stop() {
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this.node?.disconnect();
    this.source?.disconnect();
    for (const track of this.stream?.getTracks() || []) {
      track.onended = null;
      track.stop();
    }
    this.stream = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
