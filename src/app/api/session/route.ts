import { NextResponse } from "next/server";
import { createRealtimeSessionUpdate } from "../../lib/realtimeSessionConfig";

export const runtime = "nodejs";

type RealtimePreflightResult = {
  ok: boolean;
  model: string;
  endpoint: string;
  opened: boolean;
  code?: string;
  message?: string;
  requestId?: string;
  close?: {
    code: number;
    reason: string;
    wasClean: boolean;
  };
  warning?: string;
};

const PREFLIGHT_TIMEOUT_MS = 4500;

function parseRealtimeMessage(data: unknown): any {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function getRealtimeErrorMessage(message: any): string {
  const error = message?.error;
  if (typeof error === "string") return error;
  return (
    error?.message ||
    error?.code ||
    error?.type ||
    "CometAPI Realtime returned an error without a message."
  );
}

async function preflightRealtimeSession(
  apiKey: string,
  model: string,
  realtimeUrl: string
): Promise<RealtimePreflightResult> {
  return new Promise((resolve) => {
    const endpoint = `${realtimeUrl}?model=${encodeURIComponent(model)}`;
    let opened = false;
    let isSettled = false;
    let ws: WebSocket | null = null;

    const finish = (result: Omit<RealtimePreflightResult, "model" | "endpoint" | "opened">) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      resolve({
        model,
        endpoint,
        opened,
        ...result,
      });
    };

    const timeout = setTimeout(() => {
      finish({
        ok: opened,
        code: opened ? "preflight_timeout_no_session_event" : "preflight_timeout",
        message: opened
          ? "Realtime WebSocket opened but did not return a session or error event before the preflight timeout."
          : "Realtime WebSocket did not open before the preflight timeout.",
        warning: opened ? "Proceeding because the socket opened and no server error was observed." : undefined,
      });
    }, PREFLIGHT_TIMEOUT_MS);

    try {
      ws = new WebSocket(endpoint, [
        "realtime",
        `openai-insecure-api-key.${apiKey}`,
      ]);

      ws.addEventListener("open", () => {
        opened = true;
        ws?.send(
          JSON.stringify(
            createRealtimeSessionUpdate({
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
            })
          )
        );
      });

      ws.addEventListener("message", (event) => {
        const message = parseRealtimeMessage(event.data);
        if (!message) return;

        if (message.type === "error") {
          finish({
            ok: false,
            code: message.error?.code || message.error?.type || "realtime_error",
            message: getRealtimeErrorMessage(message),
            requestId: message.event_id || message.error?.event_id,
          });
          return;
        }

        if (message.type === "session.created" || message.type === "session.updated") {
          finish({
            ok: true,
            code: message.type,
            message: "Realtime preflight session event received.",
          });
        }
      });

      ws.addEventListener("close", (event) => {
        finish({
          ok: false,
          code: "websocket_closed",
          message:
            event.reason ||
            `Realtime WebSocket closed before a session event was received (code ${event.code}).`,
          close: {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          },
        });
      });

      ws.addEventListener("error", () => {
        finish({
          ok: false,
          code: "websocket_error",
          message: "Realtime WebSocket failed during preflight.",
        });
      });
    } catch (error) {
      finish({
        ok: false,
        code: "preflight_exception",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * CometAPI Realtime Session Creation Endpoint
 *
 * TEMPORARY WORKAROUND: CometAPI does not yet implement the /v1/realtime/sessions endpoint.
 * This endpoint returns the API key directly as an ephemeral token for WebSocket authentication.
 *
 * TODO: Update this endpoint once CometAPI implements proper session creation with ephemeral tokens.
 *
 * Adapted from: OpenAI Realtime Agents demo
 * Changes:
 * - Uses COMETAPI_KEY instead of OPENAI_API_KEY
 * - Returns API key as client_secret for direct WebSocket connection
 * - Will be updated when CometAPI implements /v1/realtime/sessions
 */
export async function GET() {
  try {
    // Get CometAPI configuration from environment
    const apiKey = process.env.COMETAPI_KEY;
    const model =
      process.env.COMETAPI_MODEL || "gpt-4o-realtime-preview-2025-06-03";
    const realtimeUrl =
      process.env.COMETAPI_REALTIME_URL || "wss://api.cometapi.com/v1/realtime";

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Missing API Key",
          message:
            "COMETAPI_KEY environment variable is not set. Please configure your CometAPI API key.",
        },
        { status: 401 }
      );
    }

    console.log(
      "[session] Using direct API key authentication (CometAPI does not yet support /v1/realtime/sessions)"
    );
    console.log("[session] Using model:", model);
    console.log(
      "[session] API Key (first 10 chars):",
      apiKey.substring(0, 10) + "..."
    );
    console.log(
      '[session] API Key format - starts with "sk-":',
      apiKey.startsWith("sk-")
    );
    console.log("[session] API Key length:", apiKey.length);

    // KNOWN ISSUE: CometAPI Realtime API server currently validates API keys against OpenAI's format
    // and rejects valid CometAPI keys with error: "invalid_api_key"
    // If you see this error, contact CometAPI support or try with an OpenAI-compatible key format
    if (!apiKey.startsWith("sk-")) {
      console.warn(
        '[session] WARNING: API key does not start with "sk-" - this may cause authentication issues'
      );
    }

    const preflight = await preflightRealtimeSession(apiKey, model, realtimeUrl);
    if (!preflight.ok) {
      console.warn(
        "[session] Realtime preflight failed:",
        JSON.stringify(preflight, null, 2)
      );
      return NextResponse.json(
        {
          error: "Realtime preflight failed",
          message: preflight.message,
          model,
          endpoint: realtimeUrl,
          preflight,
        },
        { status: 502 }
      );
    }

    // Return a mock session response with the API key as the ephemeral token
    // This allows the WebSocket connection to use the API key directly
    const sessionResponse = {
      id: `sess_${Date.now()}`,
      object: "realtime.session",
      type: "realtime",
      model: model,
      output_modalities: ["audio"],
      instructions: "",
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
          },
        },
        output: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          voice: "alloy",
        },
      },
      tools: [],
      temperature: 0.8,
      max_response_output_tokens: 4096,
      preflight,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      client_secret: {
        value: apiKey, // Use API key directly until CometAPI implements ephemeral tokens
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    };

    console.log(
      "[session] Returning session response:",
      JSON.stringify(
        {
          ...sessionResponse,
          client_secret: { value: "[redacted]", expires_at: sessionResponse.client_secret.expires_at },
        },
        null,
        2
      )
    );
    return NextResponse.json(sessionResponse);
  } catch (error) {
    console.error("Error in /session:", error);

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "An unexpected error occurred. Please try again later.",
      },
      { status: 500 }
    );
  }
}
