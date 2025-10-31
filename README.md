# CometAPI Realtime Agents Demo

This is an official demonstration of advanced patterns for voice agents, using the **CometAPI Realtime API** and the OpenAI Agents SDK.

## About CometAPI

[CometAPI](https://www.cometapi.com/?utm_source=cometapi-dev/cometapi-realtime-agents&utm_campaign=integration&utm_medium=integration&utm_content=integration) provides enterprise-grade access to cutting-edge AI models with competitive pricing, low latency, and reliable infrastructure. The CometAPI Realtime API is compatible with the OpenAI Realtime API protocol, making it easy to integrate into your applications.

## CometAPI Resources

- [Website](https://www.cometapi.com/?utm_source=cometapi-dev/cometapi-realtime-agents&utm_campaign=example&utm_medium=example&utm_content=example)
- [Documentation](https://api.cometapi.com/doc)
- [Get an API Key](https://api.cometapi.com/console/token)
- [Pricing](https://api.cometapi.com/pricing)
- [Discord Community](https://discord.com/invite/HMpuV6FCrG) - Get support and connect with us

## Quick Start

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/cometapi-dev/cometapi-realtime-agents.git
   cd cometapi-realtime-agents
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your CometAPI credentials:
   ```bash
   cp .env.sample .env
   ```
   
   Edit `.env` and add your CometAPI API key ([Get one here](https://api.cometapi.com/console/token)):
   ```bash
   COMETAPI_KEY=your_cometapi_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to [http://localhost:3000](http://localhost:3000). It should default to the `chatSupervisor` Agent Config.


## Configuration

The following environment variables can be configured in your `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `COMETAPI_KEY` | Your CometAPI API key (required) | - |
| `COMETAPI_BASE_URL` | CometAPI REST API base URL | `https://api.cometapi.com` |
| `COMETAPI_REALTIME_URL` | CometAPI WebSocket URL for realtime | `wss://api.cometapi.com/v1/realtime` |
| `COMETAPI_MODEL` | Model identifier to use | `gpt-4o-realtime-preview-2025-06-03` |
| `https_proxy` or `HTTPS_PROXY` | HTTPS proxy URL (optional) | - |