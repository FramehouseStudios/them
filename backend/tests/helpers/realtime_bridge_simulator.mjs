import vm from "node:vm";

function extractRuntimeScript(html) {
  const match = String(html || "").match(/<script>([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error("Realtime bridge HTML did not contain a runtime script.");
  }
  return match[1];
}

class FakeDataChannel {
  constructor() {
    this.readyState = "open";
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(raw) {
    this.sent.push(JSON.parse(String(raw)));
  }

  close() {
    this.readyState = "closed";
    this.emit("close");
  }

  emit(type, payload = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener(payload);
    }
  }

  emitProviderEvent(event) {
    this.emit("message", { data: JSON.stringify(event) });
  }
}

class RealtimeBridgeRuntimeSimulator {
  constructor(html, { initialNowMs = 1_000, roundTripSeconds = 0.08 } = {}) {
    this.events = [];
    this.peerConnections = [];
    this.nowMs = initialNowMs;
    this.roundTripSeconds = roundTripSeconds;
    this.intervalCallbacks = new Map();
    this.nextTimerID = 1;

    const simulator = this;
    const remoteAudioListeners = new Map();
    const remoteAudio = {
      muted: false,
      srcObject: null,
      addEventListener(type, listener) {
        const listeners = remoteAudioListeners.get(type) || [];
        listeners.push(listener);
        remoteAudioListeners.set(type, listeners);
      },
      play() {
        return Promise.resolve();
      },
      pause() {},
    };

    class FakeRTCPeerConnection {
      constructor() {
        this.connectionState = "new";
        this.iceGatheringState = "complete";
        this.localDescription = null;
        this.listeners = new Map();
        this.dataChannel = null;
        simulator.peerConnections.push(this);
      }

      addEventListener(type, listener) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      emit(type, payload = {}) {
        for (const listener of this.listeners.get(type) || []) {
          listener(payload);
        }
      }

      createDataChannel() {
        this.dataChannel = new FakeDataChannel();
        return this.dataChannel;
      }

      addTrack() {}

      async createOffer() {
        return { type: "offer", sdp: "v=0\r\n" };
      }

      async setLocalDescription(description) {
        this.localDescription = description;
      }

      async setRemoteDescription(description) {
        this.remoteDescription = description;
      }

      async getStats() {
        return new Map([
          ["candidate", {
            type: "candidate-pair",
            state: "succeeded",
            currentRoundTripTime: simulator.roundTripSeconds,
          }],
        ]);
      }

      getSenders() {
        return [];
      }

      close() {
        this.connectionState = "closed";
      }
    }

    class FakeFormData {
      constructor() {
        this.values = new Map();
      }

      set(key, value) {
        this.values.set(key, value);
      }
    }

    const mediaStream = {
      getTracks() {
        return [{ stop() {} }];
      },
    };
    const window = {
      webkit: {
        messageHandlers: {
          realtimeEvent: {
            postMessage(message) {
              simulator.events.push(structuredClone(message));
            },
          },
        },
      },
      addEventListener() {},
      requestAnimationFrame() {
        return 1;
      },
      cancelAnimationFrame() {},
    };
    const context = vm.createContext({
      console,
      document: {
        getElementById(id) {
          return id === "remoteAudio" ? remoteAudio : null;
        },
      },
      fetch: async () => ({
        ok: true,
        async text() {
          return "v=0\r\n";
        },
      }),
      FormData: FakeFormData,
      navigator: {
        mediaDevices: {
          async getUserMedia() {
            return mediaStream;
          },
        },
      },
      performance: {
        now() {
          return simulator.nowMs;
        },
      },
      RTCPeerConnection: FakeRTCPeerConnection,
      setInterval(callback) {
        const id = simulator.nextTimerID++;
        simulator.intervalCallbacks.set(id, callback);
        return id;
      },
      clearInterval(id) {
        simulator.intervalCallbacks.delete(id);
      },
      setTimeout,
      clearTimeout,
      structuredClone,
      window,
    });
    window.window = window;
    window.navigator = context.navigator;
    window.performance = context.performance;
    window.setInterval = context.setInterval;
    window.clearInterval = context.clearInterval;
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;

    vm.runInContext(extractRuntimeScript(html), context, {
      filename: "clementine-realtime-bridge.js",
    });
    this.window = window;
  }

  get currentPeerConnection() {
    return this.peerConnections.at(-1) || null;
  }

  get currentDataChannel() {
    return this.currentPeerConnection?.dataChannel || null;
  }

  advance(milliseconds) {
    this.nowMs += Math.max(0, Number(milliseconds) || 0);
  }

  async runScheduledIntervals() {
    for (const callback of this.intervalCallbacks.values()) {
      callback();
    }
    await Promise.resolve();
    await Promise.resolve();
  }

  async start(config = {}) {
    await this.window.clementineRealtime.start({
      clientSecret: "simulated-ephemeral-secret",
      session: {
        type: "realtime",
        model: "simulated-realtime-model",
        instructions: "Simulated Clementine session.",
        output_modalities: ["audio", "text"],
        audio: { input: {}, output: { voice: "marin" } },
      },
      ...config,
    });
  }

  setConnectionState(state) {
    const connection = this.currentPeerConnection;
    if (!connection) throw new Error("No simulated peer connection is active.");
    connection.connectionState = state;
    connection.emit("connectionstatechange");
  }

  providerEvent(event) {
    const channel = this.currentDataChannel;
    if (!channel) throw new Error("No simulated provider data channel is active.");
    channel.emitProviderEvent(event);
  }

  interrupt() {
    this.window.clementineRealtime.interrupt();
  }

  resumeTurn(userTranscript, turnID = "") {
    return this.window.clementineRealtime.resumeTurn({ userTranscript, turnID });
  }

  closeDataChannel() {
    const channel = this.currentDataChannel;
    if (!channel) throw new Error("No simulated provider data channel is active.");
    channel.close();
  }

  errorDataChannel() {
    const channel = this.currentDataChannel;
    if (!channel) throw new Error("No simulated provider data channel is active.");
    channel.emit("error", { message: "simulated data channel failure" });
  }

  stop() {
    this.window.clementineRealtime.stop();
  }

  eventsOfType(type) {
    return this.events.filter((event) => event.type === type);
  }
}

export {
  RealtimeBridgeRuntimeSimulator,
  extractRuntimeScript,
};
