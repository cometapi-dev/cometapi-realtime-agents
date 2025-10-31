import { useCallback, useRef, useState, useEffect } from 'react';
import { RealtimeAgent } from '@openai/agents/realtime';

import { CometAPIWebSocket, RealtimeEvent } from '../lib/cometapiWebSocket';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';

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
  const [status, setStatus] = useState<SessionStatus>('DISCONNECTED');
  const { logClientEvent } = useEvent();
  const { logServerEvent } = useEvent();
  const historyHandlers = useHandleSessionHistory().current;

  function handleTransportEvent(event: any) {
    // Handle additional server events that aren't managed by the session
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        historyHandlers.handleTranscriptionCompleted(event);
        break;
      }
      case "response.audio_transcript.done": {
        historyHandlers.handleTranscriptionCompleted(event);
        break;
      }
      case "response.audio_transcript.delta": {
        historyHandlers.handleTranscriptionDelta(event);
        break;
      }
      default: {
        logServerEvent(event);
        break;
      } 
    }
  }

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus')
      .toLowerCase(),
  );

  const handleAgentHandoff = (item: any) => {
    const history = item.context.history;
    const lastMessage = history[history.length - 1];
    const agentName = lastMessage.name.split("transfer_to_")[1];
    callbacks.onAgentHandoff?.(agentName);
  };

  useEffect(() => {
    if (sessionRef.current) {
      // Log server errors with more detail
      sessionRef.current.on("error", (...args: any[]) => {
        console.error('[useRealtimeSession] Error event:', args);
        logServerEvent({
          type: "error",
          message: args[0],
        });
      });

      // Log connection state changes
      console.log('[useRealtimeSession] Session event listeners attached');

      // history events
      sessionRef.current.on("agent_handoff", handleAgentHandoff);
      sessionRef.current.on("agent_tool_start", historyHandlers.handleAgentToolStart);
      sessionRef.current.on("agent_tool_end", historyHandlers.handleAgentToolEnd);
      sessionRef.current.on("history_updated", historyHandlers.handleHistoryUpdated);
      sessionRef.current.on("history_added", historyHandlers.handleHistoryAdded);
      sessionRef.current.on("guardrail_tripped", historyHandlers.handleGuardrailTripped);

      // additional transport events
      sessionRef.current.on("transport_event", (event: any) => {
        console.log('[useRealtimeSession] Transport event:', event.type, event);
        
        // Log WebSocket state changes
        if (event.type === 'error') {
          console.error('[useRealtimeSession] WebSocket error event:', event);
          console.error('[useRealtimeSession] Error details:', JSON.stringify(event, null, 2));
          if (event.error) {
            console.error('[useRealtimeSession] Error object:', event.error);
            console.error('[useRealtimeSession] Error type:', event.error.type);
            console.error('[useRealtimeSession] Error code:', event.error.code);
            console.error('[useRealtimeSession] Error message:', event.error.message);
          }
        } else if (event.type === 'close') {
          console.warn('[useRealtimeSession] WebSocket close event:', event.code, event.reason);
        } else if (event.type === 'session.created') {
          console.log('[useRealtimeSession] Session created successfully');
        } else if (event.type === 'session.updated') {
          console.log('[useRealtimeSession] Session updated');
        }
        
        handleTransportEvent(event);
      });
    }
  }, [sessionRef.current]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      extraContext,
      outputGuardrails,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected

      updateStatus('CONNECTING');

      const ek = await getEphemeralKey();
      console.log('[useRealtimeSession] Ephemeral key obtained (first 10 chars):', ek.substring(0, 10) + '...');
      const rootAgent = initialAgents[0];
      console.log('[useRealtimeSession] Root agent:', rootAgent.name);

      // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
      //  simulate how the voice agent sounds over a PSTN/SIP phone call.
      const codecParam = codecParamRef.current;
      const audioFormat = audioFormatForCodec(codecParam);
      console.log('[useRealtimeSession] Audio format:', audioFormat);
      console.log('[useRealtimeSession] Model:', 'gpt-4o-realtime-preview-2024-10-01');
      console.log('[useRealtimeSession] Creating RealtimeSession with OpenAIRealtimeWebSocket transport...');
      
      // KNOWN LIMITATION: OpenAI Agents SDK hardcodes wss://api.openai.com/v1/realtime endpoint
      // To use CometAPI (wss://api.cometapi.com/v1/realtime), options:
      // 1. Fork SDK and modify WebSocket URL (openaiRealtimeWebsocket.mjs)
      // 2. Use native WebSocket (see: /Users/xmx/Repository/CometAPI/test/realtime/cometapi-realtime-console)
      // 3. Wait for SDK to support custom endpoints (baseURL option)
      console.log('[useRealtimeSession] NOTE: SDK connects to OpenAI endpoints only. CometAPI requires SDK fork or native WebSocket.');

      // CometAPI uses WebSocket (not WebRTC) for Realtime API
      sessionRef.current = new RealtimeSession(rootAgent, {
        transport: new OpenAIRealtimeWebSocket({
          apiKey: ek,
          useInsecureApiKey: true,  // Required for browser-based WebSocket with API key
          model: 'gpt-4o-realtime-preview-2024-10-01',  // Model parameter
        }),
        model: 'gpt-4o-realtime-preview-2024-10-01',
        config: {
          inputAudioFormat: audioFormat,
          outputAudioFormat: audioFormat,
          // CometAPI may not support inputAudioTranscription model parameter
          // Removed to match working console behavior
        },
        outputGuardrails: outputGuardrails ?? [],
        context: extraContext ?? {},
      });

      console.log('[useRealtimeSession] Attempting to connect to CometAPI realtime via WebSocket...');
      console.log('[useRealtimeSession] API Key being used (first 15 chars):', ek.substring(0, 15) + '...');
      console.log('[useRealtimeSession] API Key format check - starts with "sk-":', ek.startsWith('sk-'));
      console.log('[useRealtimeSession] API Key length:', ek.length);
      
      try {
        // Pass the API key to connect() method as the SDK requires it
        // NOTE: The SDK will add this to WebSocket subprotocols as "openai-insecure-api-key.{key}"
        console.log('[useRealtimeSession] Calling connect() with apiKey parameter...');
        await sessionRef.current.connect({ apiKey: ek });
        console.log('[useRealtimeSession] Successfully connected to CometAPI!');
        updateStatus('CONNECTED');
      } catch (err) {
        console.error('[useRealtimeSession] Connection failed:', err);
        console.error('[useRealtimeSession] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        updateStatus('DISCONNECTED');
        throw err;
      }
    },
    [callbacks, updateStatus],
  );

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    updateStatus('DISCONNECTED');
  }, [updateStatus]);

  const assertconnected = () => {
    if (!sessionRef.current) throw new Error('RealtimeSession not connected');
  };

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    assertconnected();
    sessionRef.current!.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    sessionRef.current?.transport.sendEvent(ev);
  }, []);

  const mute = useCallback((m: boolean) => {
    sessionRef.current?.mute(m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    sessionRef.current.transport.sendEvent({ type: 'response.create' } as any);
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
