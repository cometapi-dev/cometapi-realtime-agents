import dotenv from "dotenv";
import type { CometAPIConfigurationValidationResult } from "../types";

/**
 * CometAPI Environment Configuration Setup
 *
 * Loads and validates environment variables required for CometAPI Realtime service.
 * This file is imported in layout.tsx to ensure validation happens before app startup.
 *
 * Adapted from: OpenAI Realtime Agents demo
 * Changes:
 * - Added comprehensive validation for CometAPI configuration
 * - Validates COMETAPI_KEY, COMETAPI_BASE_URL, and optional settings
 * - Provides clear, actionable error messages with CometAPI documentation links
 * - Terminates application on invalid configuration to prevent runtime errors
 */

dotenv.config({ path: ".env" });

/**
 * Validates CometAPI environment configuration
 * Ensures all required environment variables are present and properly formatted
 */
export function validateCometAPIConfig(): CometAPIConfigurationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required API key
  if (!process.env.COMETAPI_KEY) {
    errors.push(
      "Missing required CometAPI configuration: COMETAPI_KEY\n\n" +
        "Please set your CometAPI API key in the .env file:\n" +
        "COMETAPI_KEY=your_api_key_here\n\n" +
        "You can obtain an API key from: https://platform.cometapi.com/api-keys"
    );
  }

  // Validate base URL format if provided
  const baseURL = process.env.COMETAPI_BASE_URL || "https://api.cometapi.com";
  try {
    const url = new URL(baseURL);
    if (url.protocol !== "https:") {
      errors.push(
        `Invalid COMETAPI_BASE_URL: ${baseURL}\n` +
          "The base URL must use HTTPS protocol (e.g., https://api.cometapi.com)"
      );
    }
  } catch {
    errors.push(
      `Invalid COMETAPI_BASE_URL format: ${baseURL}\n` +
        "Please provide a valid HTTPS URL"
    );
  }

  // Validate realtime URL format if provided
  if (process.env.COMETAPI_REALTIME_URL) {
    try {
      const url = new URL(process.env.COMETAPI_REALTIME_URL);
      if (url.protocol !== "wss:" && url.protocol !== "ws:") {
        warnings.push(
          `COMETAPI_REALTIME_URL should use wss:// protocol for secure connections: ${process.env.COMETAPI_REALTIME_URL}`
        );
      }
    } catch {
      errors.push(
        `Invalid COMETAPI_REALTIME_URL format: ${process.env.COMETAPI_REALTIME_URL}\n` +
          "Please provide a valid WebSocket URL (wss://...)"
      );
    }
  }

  // Validate proxy URL if provided
  const proxyURL = process.env.https_proxy || process.env.HTTPS_PROXY;
  if (proxyURL) {
    try {
      new URL(proxyURL);
    } catch {
      warnings.push(`Invalid proxy URL format: ${proxyURL}`);
    }
  }

  const isValid = errors.length === 0;

  // Log errors if validation fails
  if (!isValid) {
    console.error("\n❌ CometAPI Configuration Errors:\n");
    errors.forEach((error) => console.error(error + "\n"));
  }

  // Log warnings if any
  if (warnings.length > 0) {
    console.warn("\n⚠️  CometAPI Configuration Warnings:\n");
    warnings.forEach((warning) => console.warn(warning + "\n"));
  }

  if (isValid && warnings.length === 0) {
    console.log("✅ CometAPI configuration validated successfully");
  }

  return { isValid, errors, warnings };
}

// Run validation on module load
const validationResult = validateCometAPIConfig();

// Exit if configuration is invalid
if (!validationResult.isValid) {
  console.error(
    "\n❌ Cannot start application with invalid CometAPI configuration"
  );
  console.error("Please fix the errors above and try again.\n");
  process.exit(1);
}
