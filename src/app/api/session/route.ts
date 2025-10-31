import { NextResponse } from "next/server";

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

    // Return a mock session response with the API key as the ephemeral token
    // This allows the WebSocket connection to use the API key directly
    const sessionResponse = {
      id: `sess_${Date.now()}`,
      object: "realtime.session",
      model: model,
      modalities: ["text", "audio"],
      instructions: "",
      voice: "alloy",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: null,
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      tools: [],
      temperature: 0.8,
      max_response_output_tokens: 4096,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      client_secret: {
        value: apiKey, // Use API key directly until CometAPI implements ephemeral tokens
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
    };

    console.log(
      "[session] Returning session response:",
      JSON.stringify(sessionResponse, null, 2)
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
