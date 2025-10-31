import { useCallback, useRef, useState, useEffect } from "react";
import { RealtimeAgent } from "@openai/agents/realtime";

import { CometAPIWebSocket, RealtimeEvent } from "../lib/cometapiWebSocket";
import { useEvent } from "../contexts/EventContext";
import { useHandleSessionHistory } from "./useHandleSessionHistory";
import { SessionStatus } from "../types";

/**
 * CometAPI Realtime Session Hook
 *
 * Manages WebSocket connection to CometAPI Realtime service using native WebSocket.
 * REPLACES OpenAI SDK to enable direct connection to CometAPI endpoints.
 *
 * Adapted from: OpenAI Realtime Agents demo
 * Architecture Change (2025-10-25):
 * - Replaced OpenAI SDK with native WebSocket implementation
 * - Direct connection to wss://api.cometapi.com/v1/realtime
 * - API key authentication via WebSocket subprotocol
 * - Native audio handling (PCM16, 24kHz)
 * - Event-based messaging compatible with OpenAI Realtime API protocol
 */

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents: RealtimeAgent[];
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const wsRef = useRef<CometAPIWebSocket | null>(null);
  const [status, setStatus] = useState<SessionStatus>("DISCONNECTED");
  const audioStreamingRef = useRef<boolean>(false); // Track if audio is actively streaming
  const { logClientEvent } = useEvent();
  const { logServerEvent } = useEvent();
  const historyHandlers = useHandleSessionHistory().current;

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacks.onConnectionChange?.(s);
      logClientEvent({}, s);
    },
    [callbacks, logClientEvent]
  );

  const handleServerEvent = useCallback(
    (event: RealtimeEvent) => {
      console.log("[useRealtimeSession] Server event:", event.type);

      // Handle specific event types
      switch (event.type) {
        case "session.created":
          console.log("[useRealtimeSession] Session created successfully");
          // CRITICAL FIX: Send session.update after session.created to enable Server VAD
          // The working console does this to configure turn_detection
          // Without this, the server won't detect when you speak!
          console.log(
            "[useRealtimeSession] Sending session.update to configure Server VAD..."
          );
          if (wsRef.current) {
            wsRef.current.sendEvent({
              type: "session.update",
              session: {
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: true,
                },
              },
            });
            console.log(
              "[useRealtimeSession] Server VAD configured - ready for voice input!"
            );
          }
          break;

        case "session.updated":
          console.log("[useRealtimeSession] Session updated");
          break;

        case "error":
          console.error("[useRealtimeSession] Error event:", event);
          logServerEvent(event);
          break;

        case "close":
          console.warn("[useRealtimeSession] WebSocket close event:", event);
          updateStatus("DISCONNECTED");
          break;

        case "conversation.item.input_audio_transcription.completed":
          historyHandlers.handleTranscriptionCompleted(event);
          break;

        case "response.audio_transcript.done":
          historyHandlers.handleTranscriptionCompleted(event);
          break;

        case "response.audio_transcript.delta":
          historyHandlers.handleTranscriptionDelta(event);
          break;

        // High-frequency audio events - skip logging to prevent performance issues
        case "response.audio.delta":
          // Audio data chunks - don't log to avoid hundreds of state updates per second
          break;

        case "response.audio.done":
          // Audio completion - don't log
          break;

        case "response.content_part.done":
          // Content part completion - don't log
          break;

        case "response.output_item.done":
          // Output item completion - don't log
          break;

        case "input_audio_buffer.speech_started":
          // Speech detection - don't log
          break;

        case "input_audio_buffer.speech_stopped":
          // Speech stopped - don't log
          break;

        case "input_audio_buffer.committed":
          // Audio buffer committed - don't log
          break;

        case "conversation.item.created":
          // Item created - don't log (already handled by history)
          break;

        case "rate_limits.updated":
          // Rate limit updates - don't log
          break;

        case "agent_handoff":
          if (event.item) {
            const history = event.item.context?.history;
            if (history && history.length > 0) {
              const lastMessage = history[history.length - 1];
              const agentName = lastMessage.name?.split("transfer_to_")[1];
              if (agentName) {
                callbacks.onAgentHandoff?.(agentName);
              }
            }
          }
          break;

        case "agent_tool_start":
          // Extract parameters from event
          historyHandlers.handleAgentToolStart(
            event.details || {},
            event.agent || {},
            event.functionCall || {}
          );
          break;

        case "agent_tool_end":
          // Extract parameters from event
          historyHandlers.handleAgentToolEnd(
            event.details || {},
            event.agent || {},
            event.functionCall || {},
            event.result
          );
          break;

        case "history_updated":
          // history_updated expects an array of items
          historyHandlers.handleHistoryUpdated(event.items || []);
          break;

        case "history_added":
          historyHandlers.handleHistoryAdded(event.item || event);
          break;

        case "guardrail_tripped":
          // Extract parameters from event
          historyHandlers.handleGuardrailTripped(
            event.details || {},
            event.agent || {},
            event.guardrail || {}
          );
          break;

        default:
          logServerEvent(event);
          break;
      }
    },
    [callbacks, logServerEvent, historyHandlers, updateStatus]
  );

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      extraContext: _extraContext,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      outputGuardrails: _outputGuardrails,
    }: ConnectOptions) => {
      if (wsRef.current) return; // already connected

      updateStatus("CONNECTING");

      try {
        const apiKey = await getEphemeralKey();
        console.log(
          "[useRealtimeSession] API key obtained (first 10 chars):",
          apiKey.substring(0, 10) + "..."
        );

        const rootAgent = initialAgents[0];
        console.log("[useRealtimeSession] Root agent:", rootAgent.name);

        // CRITICAL: Request microphone permission BEFORE connecting WebSocket
        // This matches the working console's order and ensures audio starts flowing immediately
        console.log("[useRealtimeSession] Requesting microphone permission...");
        const tempAudioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
          },
        });
        console.log("[useRealtimeSession] Microphone permission granted");

        // Create native WebSocket connection
        const ws = new CometAPIWebSocket({
          apiKey,
          model:
            process.env.COMETAPI_MODEL || "gpt-4o-realtime-preview-2025-06-03",
          url:
            process.env.COMETAPI_REALTIME_URL ||
            "wss://api.cometapi.com/v1/realtime",
        });

        // Pre-set the audio context and stream
        (ws as any).audioContext = tempAudioContext;
        (ws as any).mediaStream = tempStream;

        // Register event handler for all events
        ws.on("*", handleServerEvent);

        console.log(
          "[useRealtimeSession] Connecting to CometAPI via native WebSocket..."
        );
        console.log(
          "[useRealtimeSession] Endpoint:",
          process.env.COMETAPI_REALTIME_URL ||
            "wss://api.cometapi.com/v1/realtime"
        );
        console.log(
          "[useRealtimeSession] Model:",
          process.env.COMETAPI_MODEL || "gpt-4o-realtime-preview-2025-06-03"
        );
        console.log(
          '[useRealtimeSession] API Key format check - starts with "sk-":',
          apiKey.startsWith("sk-")
        );
        console.log("[useRealtimeSession] API Key length:", apiKey.length);

        // Connect to WebSocket
        // IMPORTANT: Audio capture now starts INSIDE the WebSocket open handler (like console)
        // This matches the working console's pattern exactly
        await ws.connect();

        wsRef.current = ws;
        console.log("[useRealtimeSession] Successfully connected to CometAPI!");

        // Audio capture already started in WebSocket open handler
        console.log(
          "[useRealtimeSession] Audio capture started - waiting for session.created event..."
        );
        console.log(
          "[useRealtimeSession] Will send session.update after session.created to enable Server VAD"
        );

        // Audio is now streaming - enable text messages immediately
        audioStreamingRef.current = true;
        console.log(
          "[useRealtimeSession] Audio streaming enabled - waiting for Server VAD configuration..."
        );

        updateStatus("CONNECTED");
      } catch (err) {
        console.error("[useRealtimeSession] Connection failed:", err);
        console.error(
          "[useRealtimeSession] Error details:",
          JSON.stringify(err, Object.getOwnPropertyNames(err))
        );
        updateStatus("DISCONNECTED");
        wsRef.current = null;
        throw err;
      }
    },
    [handleServerEvent, updateStatus]
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    audioStreamingRef.current = false; // Reset audio streaming flag
    updateStatus("DISCONNECTED");
  }, [updateStatus]);

  const assertConnected = () => {
    if (!wsRef.current || !wsRef.current.isConnected) {
      throw new Error("RealtimeSession not connected");
    }
  };

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    // Note: Working console doesn't use response.cancel, but keep it available
    if (wsRef.current) {
      console.log("[useRealtimeSession] Sending response.cancel");
      wsRef.current.sendEvent({ type: "response.cancel" });
    }
  }, []);

  const sendUserText = useCallback((text: string) => {
    assertConnected();
    console.log(
      "[useRealtimeSession] Sending conversation.item.create + response.create"
    );
    wsRef.current!.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    wsRef.current!.sendEvent({ type: "response.create" });
  }, []);

  const sendEvent = useCallback((ev: RealtimeEvent) => {
    if (wsRef.current) {
      wsRef.current.sendEvent(ev);
    }
  }, []);

  const mute = useCallback((m: boolean) => {
    // Note: Mute is handled at audio element level in native WebSocket
    // This is a no-op for compatibility with SDK interface
    console.log("[useRealtimeSession] Mute state:", m ? "muted" : "unmuted");
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.sendEvent({ type: "input_audio_buffer.clear" });
    }
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.sendEvent({ type: "input_audio_buffer.commit" });
      wsRef.current.sendEvent({ type: "response.create" });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}
