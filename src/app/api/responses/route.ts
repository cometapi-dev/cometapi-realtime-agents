import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * CometAPI Responses API Proxy Endpoint
 *
 * Proxies requests to CometAPI's responses API (used by supervisor agents
 * for structured responses and chain-of-thought reasoning).
 *
 * Adapted from: OpenAI Realtime Agents demo
 * Changes:
 * - Uses COMETAPI_KEY instead of OPENAI_API_KEY
 * - Configures OpenAI client with CometAPI base URL
 * - Maintains proxy support for enterprise environments
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
  const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  const baseURL = process.env.COMETAPI_BASE_URL || "https://api.cometapi.com";

  const openai = new OpenAI({
    apiKey: process.env.COMETAPI_KEY,
    baseURL: `${baseURL}/v1`,
    httpAgent,
  });

  if (body.text?.format?.type === "json_schema") {
    return await structuredResponse(openai, body);
  } else {
    return await textResponse(openai, body);
  }
}

async function structuredResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.parse({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("CometAPI responses proxy error (structured):", err);
    return NextResponse.json(
      {
        error: "Failed to get structured response from CometAPI",
        details: err.message,
      },
      { status: 500 }
    );
  }
}

async function textResponse(openai: OpenAI, body: any) {
  try {
    const response = await openai.responses.create({
      ...(body as any),
      stream: false,
    });

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("CometAPI responses proxy error (text):", err);
    return NextResponse.json(
      {
        error: "Failed to get text response from CometAPI",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
