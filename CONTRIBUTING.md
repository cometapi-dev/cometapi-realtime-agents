# Contributing to CometAPI Realtime Agents Demo

Thank you for your interest in contributing to the CometAPI Realtime Agents Demo! This project demonstrates advanced voice agent patterns using the CometAPI Realtime API.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/cometapi-realtime-agents.git`
3. Create a branch for your changes: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit with clear, descriptive messages
7. Push to your fork: `git push origin feature/your-feature-name`
8. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 20+ and npm
- A CometAPI API key from [https://platform.cometapi.com/api-keys](https://platform.cometapi.com/api-keys)

### Installation

```bash
npm install
cp .env.sample .env
# Add your COMETAPI_KEY to .env
npm run dev
```

## Contribution Guidelines

### Code Style

- Follow the existing TypeScript code style
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and single-purpose
- Use TypeScript types (avoid `any` when possible)

### Testing

- Test your changes manually using the demo UI
- Verify all agent scenarios still work (simple handoff, chat-supervisor, customer service)
- Test with different browsers (Chrome, Safari, Firefox)
- Ensure voice interactions work correctly

### Pull Request Process

1. **Describe your changes clearly**: Explain what you changed and why
2. **Keep PRs focused**: One feature or fix per PR
3. **Update documentation**: If you change functionality, update the README or other docs
4. **Test thoroughly**: Verify your changes work with CometAPI endpoints
5. **Follow the existing patterns**: Match the style and structure of existing code

### Types of Contributions We Welcome

#### Agent Configurations
- New agent scenarios demonstrating specific patterns
- Improvements to existing agent prompts and tools
- Better examples of multi-agent collaboration

#### Documentation
- Clarifications and corrections
- Additional examples and use cases
- Troubleshooting guidance
- Performance optimization tips

#### Code Quality
- TypeScript type improvements
- Error handling enhancements
- Code organization and refactoring
- Performance optimizations

#### Bug Fixes
- Fix issues with agent behavior
- Resolve connection problems
- UI/UX improvements
- Browser compatibility fixes

### What We Won't Merge

- Changes that break CometAPI compatibility
- Features that significantly increase complexity
- Modifications that violate the project's architectural principles
- PRs without clear descriptions or testing evidence
- Changes to core OpenAI Agents SDK integration (contribute those upstream)

## Agent Configuration Best Practices

When contributing new agent configurations:

1. **Follow the existing structure**: Use `src/app/agentConfigs/` and follow naming conventions
2. **Document your agent**: Add comments explaining the pattern and use case
3. **Keep it focused**: Each agent should demonstrate a specific pattern clearly
4. **Test thoroughly**: Verify the agent works in actual voice conversations
5. **Add to index**: Register your config in `src/app/agentConfigs/index.ts`

Example agent config structure:
```typescript
import { RealtimeAgent } from '@openai/agents/realtime';

export const myAgent = new RealtimeAgent({
  name: 'myAgent',
  handoffDescription: 'Brief description for agent transfer context',
  instructions: 'Clear, concise instructions for the agent behavior',
  tools: [], // Define tools if needed
  handoffs: [], // Define possible handoffs
});

export default [myAgent];
```

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Clear title**: Brief description of the issue
- **Steps to reproduce**: Exact steps to recreate the problem
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: Browser, OS, Node.js version
- **CometAPI configuration**: Model used, any custom settings
- **Console errors**: Any errors from browser console or terminal

### Feature Requests

For feature requests, describe:

- **Use case**: What problem does this solve?
- **Proposed solution**: How would you implement it?
- **Alternatives**: Other approaches you considered
- **Examples**: Similar features in other projects

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions
- Keep discussions relevant and professional

### Unacceptable Behavior

- Harassment or discriminatory language
- Personal attacks or trolling
- Spam or off-topic content
- Sharing private information without permission

## Questions?

- **Documentation**: Check the [README](README.md) first
- **CometAPI Docs**: Visit [https://docs.cometapi.com](https://docs.cometapi.com)
- **Support**: Contact [https://support.cometapi.com](https://support.cometapi.com)
- **GitHub Issues**: Open an issue for bugs or feature requests

## License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers the project. See [LICENSE](LICENSE) for details.

## Attribution

This project is adapted from the [OpenAI Realtime Agents Demo](https://github.com/openai/openai-realtime-agents). When contributing, please respect the original work and maintain proper attribution.

---

Thank you for helping improve the CometAPI Realtime Agents Demo!
