/**
 * CometAPI Native WebSocket Client for Realtime API
 *
 * Direct WebSocket implementation that connects to CometAPI's Realtime API.
 * Replaces OpenAI SDK to enable CometAPI endpoint connectivity.
 *
 * Based on: /Users/xmx/Repository/CometAPI/test/realtime/cometapi-realtime-console
 *
 * Key Features:
 * - Direct WebSocket connection to wss://api.cometapi.com/v1/realtime
 * - API key authentication via WebSocket subprotocol
 * - PCM16 audio encoding/decoding at 24kHz
 * - Event-based message handling
 * - Audio queue management for playback
 */

export type RealtimeEvent = {
  type: string;
  event_id?: string;
  [key: string]: any;
};

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export interface CometAPIWebSocketOptions {
  apiKey: string;
  model?: string;
  url?: string;
}

export class CometAPIWebSocket {
  private ws: WebSocket | null = null;
  private eventHandlers: Map<string, Set<RealtimeEventHandler>> = new Map();
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioProcessor: AudioNode | null = null;
  private audioQueue: string[] = [];
  private isPlaying: boolean = false;
  private audioPacketsSent: number = 0; // Track audio packets for debugging

  private apiKey: string;
  private model: string;
  private url: string;

  constructor(options: CometAPIWebSocketOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || "gpt-4o-realtime-preview-2025-06-03";
    this.url = options.url || "wss://api.cometapi.com/v1/realtime";
  }

  /**
   * Log information without triggering Next.js error overlay
   * Use this for expected conditions like connection close, not actual errors
   */
  private logInfo(message: string, ...args: any[]): void {
    console.log(`ℹ️ ${message}`, ...args);
  }

  /**
   * Connect to CometAPI Realtime WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.url}?model=${this.model}`;
        console.log("[CometAPIWebSocket] Connecting to:", wsUrl);

        // Create WebSocket with API key authentication via subprotocol
        this.ws = new WebSocket(wsUrl, [
          "realtime",
          `openai-insecure-api-key.${this.apiKey}`,
        ]);

        this.ws.addEventListener("open", () => {
          console.log("[CometAPIWebSocket] Connection established");

          // CRITICAL: Start audio capture synchronously in open handler (EXACT console pattern)
          // Console doesn't await, doesn't have any delays - just starts immediately
          this.startAudioCaptureSync();

          resolve();
        });

        this.ws.addEventListener("message", (event) => {
          try {
            const message = JSON.parse(event.data);

            // Only log non-audio events to reduce console spam
            if (
              !message.type?.includes("audio") &&
              !message.type?.includes("rate_limits")
            ) {
              console.log("[CometAPIWebSocket] 📨 Message:", message.type);
            }

            this.handleServerEvent(message);
          } catch (error) {
            console.error("[CometAPIWebSocket] Error parsing message:", error);
            console.error(
              "[CometAPIWebSocket] Raw message that failed:",
              event.data
            );
          }
        });

        this.ws.addEventListener("close", (event) => {
          console.warn("[CometAPIWebSocket] ⚠️ Connection closed");
          console.warn("[CometAPIWebSocket] Close code:", event.code);
          console.warn(
            "[CometAPIWebSocket] Close reason:",
            event.reason || "(no reason provided)"
          );
          console.warn("[CometAPIWebSocket] Was clean close:", event.wasClean);

          // Provide actionable debugging guidance based on close code
          if (event.code === 1008) {
            console.warn(
              "[CometAPIWebSocket] 🔒 Policy Violation (1008) - Likely authentication failure"
            );
            console.warn("[CometAPIWebSocket] Common causes:");
            console.warn("  - Invalid or expired API key");
            console.warn("  - API key format mismatch (must start with 'sk-')");
            console.warn("  - Incorrect authentication subprotocol");
            console.warn(
              "[CometAPIWebSocket] 💡 Action: Verify COMETAPI_KEY in your .env file"
            );
          } else if (event.code === 1006) {
            console.warn(
              "[CometAPIWebSocket] 🔌 Abnormal Closure (1006) - Connection failed to establish"
            );
            console.warn("[CometAPIWebSocket] Common causes:");
            console.warn("  - Network connectivity issues");
            console.warn("  - Invalid WebSocket URL");
            console.warn(
              "  - Firewall or proxy blocking WebSocket connections"
            );
            console.warn(
              "[CometAPIWebSocket] 💡 Action: Check COMETAPI_REALTIME_URL and network settings"
            );
          } else if (event.code === 1002) {
            console.warn(
              "[CometAPIWebSocket] 🔧 Protocol Error (1002) - Server rejected the connection"
            );
            console.warn("[CometAPIWebSocket] Common causes:");
            console.warn("  - Unsupported model parameter");
            console.warn("  - Invalid WebSocket subprotocol format");
            console.warn(
              "[CometAPIWebSocket] 💡 Action: Verify COMETAPI_MODEL is supported"
            );
          }

          console.warn(
            "[CometAPIWebSocket] 📝 Check CometAPI dashboard for quota/auth issues: https://platform.cometapi.com"
          );

          this.cleanup();
          this.emit({ type: "close", code: event.code, reason: event.reason });
        });

        this.ws.addEventListener("error", (error) => {
          console.error("[CometAPIWebSocket] WebSocket error:", error);
          this.emit({ type: "error", error });
          reject(error);
        });
      } catch (error) {
        console.error("[CometAPIWebSocket] Connection failed:", error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming server events
   */
  private handleServerEvent(event: RealtimeEvent): void {
    console.log("[CometAPIWebSocket] Received event:", event.type, event);

    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }

    // Handle error events
    if (event.type === "error") {
      console.warn("[CometAPIWebSocket] Server error event:", event);
    }

    // Handle audio delta events
    if (event.type === "response.audio.delta" && event.delta) {
      this.queueAudio(event.delta);
    } else if (event.type === "response.audio.done") {
      console.log("[CometAPIWebSocket] Audio response completed");
    }

    // Emit event to all registered handlers
    this.emit(event);
  }

  /**
   * Send event to server
   */
  sendEvent(event: RealtimeEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logInfo(
        "[CometAPIWebSocket] Cannot send event - WebSocket not open (this is expected during connection/disconnection)"
      );
      return;
    }

    if (!event.event_id) {
      event.event_id = crypto.randomUUID();
    }

    const message = JSON.stringify(event);
    console.log("[CometAPIWebSocket] Sending event:", event.type, event);
    this.ws.send(message);
  }

  /**
   * Register event handler
   */
  on(eventType: string, handler: RealtimeEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Unregister event handler
   */
  off(eventType: string, handler: RealtimeEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event to registered handlers
   */
  private emit(event: RealtimeEvent): void {
    // Emit to specific event type handlers
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }

    // Emit to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get("*");
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => handler(event));
    }
  }

  /**
   * Start capturing audio from microphone
   */
  /**
   * Start audio capture synchronously (EXACT console pattern)
   */
  private startAudioCaptureSync(): void {
    try {
      console.log(
        "[CometAPIWebSocket] Starting audio capture (console pattern)..."
      );

      // Use pre-initialized audio context and stream
      if (!this.audioContext || !this.mediaStream) {
        console.warn(
          "[CometAPIWebSocket] Audio context or stream not initialized! (this may happen during cleanup)"
        );
        return;
      }

      // Create audio processor (EXACT console code)
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      const bufferSize = 4096;
      const processor = this.audioContext.createScriptProcessor(
        bufferSize,
        1,
        1
      ) as ScriptProcessorNode;
      this.audioProcessor = processor;

      let audioPacketCount = 0;
      processor.onaudioprocess = (e) => {
        audioPacketCount++;

        // Only log first few packets to avoid console spam
        if (audioPacketCount <= 3) {
          console.log(
            "[CometAPIWebSocket] 🎤 onaudioprocess fired! WS state:",
            this.ws?.readyState
          );
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          if (audioPacketCount <= 3) {
            console.warn("[CometAPIWebSocket] Skipping audio - WS not open");
          }
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = this.convertFloat32ToPCM16(inputData);
        const base64Audio = this.arrayBufferToBase64(pcm16);

        // Send audio event (EXACT console format)
        const audioEvent = {
          type: "input_audio_buffer.append",
          audio: base64Audio,
        };

        if (audioPacketCount <= 3) {
          console.log(
            "[CometAPIWebSocket] 📤 Sending audio packet, size:",
            base64Audio.length
          );
        }

        this.ws.send(JSON.stringify(audioEvent));
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);
      console.log(
        "[CometAPIWebSocket] Audio capture started (console pattern)"
      );
    } catch (error) {
      console.error("[CometAPIWebSocket] Error starting audio capture:", error);
    }
  }

  private async startAudioCaptureInternal(): Promise<void> {
    try {
      // Use pre-initialized audio context and stream if available
      // This matches the working console's pattern of getting mic permission before WebSocket
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
      }

      if (!this.mediaStream) {
        // Get microphone stream
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
          },
        });
      }

      // Create audio processor
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      const bufferSize = 4096;
      const processor = this.audioContext.createScriptProcessor(
        bufferSize,
        1,
        1
      ) as ScriptProcessorNode;
      this.audioProcessor = processor;

      processor.onaudioprocess = (e) => {
        // Debug: Log every audio process call
        if (!this.audioPacketsSent) {
          this.audioPacketsSent = 0;
        }
        this.audioPacketsSent++;

        if (this.audioPacketsSent <= 10) {
          console.log(
            `[CometAPIWebSocket] Audio process #${this.audioPacketsSent} - WS state: ${this.ws?.readyState}, AudioContext state: ${this.audioContext?.state}`
          );
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          if (this.audioPacketsSent <= 10) {
            console.warn(
              `[CometAPIWebSocket] Skipping audio packet #${this.audioPacketsSent} - WS not ready`
            );
          }
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = this.convertFloat32ToPCM16(inputData);
        const base64Audio = this.arrayBufferToBase64(pcm16);

        if (this.audioPacketsSent <= 10) {
          console.log(
            `[CometAPIWebSocket] ✅ Audio packet #${this.audioPacketsSent} sent (${base64Audio.length} bytes)`
          );
        }

        this.sendEvent({
          type: "input_audio_buffer.append",
          audio: base64Audio,
        });
      };

      source.connect(processor);
      processor.connect(this.audioContext.destination);

      console.log("[CometAPIWebSocket] Audio capture started");
      console.log(
        "[CometAPIWebSocket] AudioContext state:",
        this.audioContext.state
      );
      console.log(
        "[CometAPIWebSocket] MediaStream active:",
        this.mediaStream.active
      );
      console.log(
        "[CometAPIWebSocket] MediaStream tracks:",
        this.mediaStream.getTracks().map((t) => `${t.kind}: ${t.readyState}`)
      );

      // Resume AudioContext if suspended
      if (this.audioContext.state === "suspended") {
        console.log("[CometAPIWebSocket] Resuming suspended AudioContext...");
        await this.audioContext.resume();
        console.log(
          "[CometAPIWebSocket] AudioContext resumed, new state:",
          this.audioContext.state
        );
      }
    } catch (error) {
      console.error("[CometAPIWebSocket] Error starting audio capture:", error);
      throw error;
    }
  }

  /**
   * Stop audio capture
   */
  stopAudioCapture(): void {
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log("[CometAPIWebSocket] Audio capture stopped");
  }

  /**
   * Queue audio for playback
   */
  private queueAudio(base64Audio: string): void {
    this.audioQueue.push(base64Audio);
    if (!this.isPlaying) {
      this.playNextAudioChunk();
    }
  }

  /**
   * Play next audio chunk from queue
   */
  private async playNextAudioChunk(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const base64Audio = this.audioQueue.shift()!;

    try {
      const audioContext =
        this.audioContext ||
        new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });

      if (!this.audioContext) {
        this.audioContext = audioContext;
      }

      const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);

      // Convert PCM16 to Float32
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
      }

      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        this.playNextAudioChunk();
      };
      source.start(0);
    } catch (error) {
      console.error("[CometAPIWebSocket] Error playing audio:", error);
      this.playNextAudioChunk();
    }
  }

  /**
   * Convert Float32 audio to PCM16
   */
  private convertFloat32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16.buffer;
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Close WebSocket connection and cleanup resources
   */
  close(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Cleanup all resources
   */
  private cleanup(): void {
    this.stopAudioCapture();
    this.audioQueue = [];
    this.isPlaying = false;
    this.eventHandlers.clear();
  }

  /**
   * Get current WebSocket ready state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Check if WebSocket is connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
