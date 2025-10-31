import type { NextConfig } from "next";
import path from "path";
import dotenv from "dotenv";

// Load .env file
dotenv.config();

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Expose non-sensitive environment variables to client-side code
  env: {
    COMETAPI_BASE_URL:
      process.env.COMETAPI_BASE_URL || "https://api.cometapi.com",
    COMETAPI_REALTIME_URL:
      process.env.COMETAPI_REALTIME_URL || "wss://api.cometapi.com/v1/realtime",
    COMETAPI_MODEL:
      process.env.COMETAPI_MODEL || "gpt-4o-realtime-preview-2024-10-01",
  },
};

// Set PORT for Next.js dev server
if (process.env.PORT) {
  process.env.PORT = process.env.PORT;
}

export default nextConfig;
