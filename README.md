# BuildSmart-AI

## LLM Control Panel Extension for VS Code

A powerful VS Code extension with adaptive project charter Q&A system, AI-driven PRD generation, version control, and 10-step artifact workflow for comprehensive project management.

## Features

### 🎯 CodeLens "Convert to Prompt" (NEW!)

Inline buttons appear next to each bullet point in Markdown files. Click to send the bullet text to your Ollama LLM for instant processing.

- **Automatic Detection**: Works with `-`, `*`, or `+` bullet markers
- **Ollama Integration**: Sends prompts to `http://localhost:11434/api/generate`
- **"Prompt for the Step" Section**: Dedicated sidebar section showing results
- **Rich Display**: Shows bullet point, line number, and full LLM response
- **Configurable Model**: Default uses `gemma3-tools:12b`

[See detailed documentation →](CODELENS_FEATURE.md) | [Usage Guide →](USAGE_GUIDE.md) | [Sidebar Updates →](SIDEBAR_UPDATE_SUMMARY.md)

### 📋 Project Charter System

- Adaptive Q&A for project planning
- AI-driven PRD generation
- Version control for artifacts
- 10-step workflow automation

## Quick Start

### Prerequisites

1. Install [Ollama](https://ollama.ai/)
2. Pull the model:
   ```bash
   ollama pull gemma3-tools:12b
   ```
3. Start Ollama:
   ```bash
   ollama serve
   ```

### Installation

1. Install the extension from the VS Code marketplace
2. Open the LLM Control Panel from the Activity Bar
3. Configure your settings:
   - `llmPanel.ollamaUrl` (default: `http://localhost:11434`)
   - `llmPanel.ollamaModel` (default: `gemma3-tools:12b`)

### Using CodeLens

1. Open any `.md` file
2. Add bullet points:
   ```markdown
   - Create a login function
   - Implement password validation
   - Add error handling
   ```
3. Click "▶ Convert to Prompt" above any bullet
4. View results in the sidebar

## Configuration

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `llmPanel.ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `llmPanel.ollamaModel` | `gemma3-tools:12b` | Model for processing |
| `llmPanel.openaiApiKey` | `""` | OpenAI API key |
| `llmPanel.geminiApiKey` | `""` | Gemini API key |
| `llmPanel.autoSaveArtifacts` | `true` | Auto-save generated artifacts |

## Development

### Build

```bash
npm install
npm run build
```

### Package

```bash
npm run package
```

## Support

- [GitHub Issues](https://github.com/ShakthiNandan/BuildSmart-AI/issues)
- [Documentation](CODELENS_FEATURE.md)

## License

See LICENSE file for details.