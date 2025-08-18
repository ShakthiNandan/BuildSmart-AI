# LLM Control Panel

A Visual Studio Code extension that provides a sidebar panel for interacting with various Large Language Model (LLM) providers including OpenAI, Google Gemini, and Ollama.

## Features

- **Activity Bar Icon**: Custom icon in the left Activity Bar for easy access
- **Sidebar Panel**: Clean, modern interface that integrates seamlessly with VS Code
- **Multiple LLM Providers**: Support for OpenAI, Gemini, and Ollama
- **Easy Configuration**: Simple settings management for API keys and URLs
- **Real-time Status**: Visual indicators showing when requests are active
- **Responsive Design**: Adapts to VS Code's theme and color scheme

## Installation

### From VSIX Package

1. Download the `.vsix` file from the releases page
2. In VS Code, go to `Extensions` (Ctrl+Shift+X)
3. Click the "..." menu and select "Install from VSIX..."
4. Choose the downloaded `.vsix` file
5. Reload VS Code when prompted

### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run package` to create the VSIX package
4. Install the generated `.vsix` file as described above

## Configuration

Before using the extension, you need to configure your API keys and settings:

1. Open VS Code Settings (Ctrl+,)
2. Search for "LLM Control Panel"
3. Configure the following settings:

### OpenAI
- **llmPanel.openaiApiKey**: Your OpenAI API key from `https://platform.openai.com/api-keys`
- **llmPanel.openaiModel**: Chat model to use (default: `gpt-4o-mini`)

### Google Gemini
- **llmPanel.geminiApiKey**: Your Gemini API key from `https://makersuite.google.com/app/apikey`
- **llmPanel.geminiModel**: Model to use (default: `gemini-1.5-flash`)

### Ollama
- **llmPanel.ollamaUrl**: URL of your Ollama server (default: `http://localhost:11434`)
- **llmPanel.ollamaModel**: Local model to use (default: `llama3.1`)

## Usage

1. **Open the Panel**: Click the LLM Control Panel icon in the Activity Bar (left sidebar), or run the command "Open LLM Control Panel"
2. **Select Provider**: Choose your preferred LLM provider from the dropdown
3. **Enter Prompt**: Type your prompt in the text area
4. **Send Request**: Click the "Send" button to submit your prompt
5. **View Response**: The model's response will appear in the output area below
6. **Configure**: Use the "Configure" button to quickly access extension settings

## Supported Models

### OpenAI
- Uses the model configured in `llmPanel.openaiModel`
- Requires valid OpenAI API key

### Google Gemini
- Uses the model configured in `llmPanel.geminiModel`
- Requires valid Gemini API key

### Ollama
- Uses the model configured in `llmPanel.ollamaModel`
- Requires local Ollama server running

## Development

### Prerequisites
- Node.js 16+
- npm or yarn
- VS Code Extension Development Host

### Setup
```bash
npm install
```

### Build
```bash
npm run package
```

### Test
1. Press F5 in VS Code to launch Extension Development Host
2. The extension will be loaded in the new window
3. Test functionality and debug as needed

## File Structure

```
llm-control-panel/
├── package.json          # Extension manifest and dependencies
├── extension.js          # Main extension logic
├── media/
│   ├── sidebar.html      # Webview HTML with CSP
│   ├── sidebar.js        # Frontend JavaScript for the webview
│   ├── sidebar.css       # Styling for the webview
│   └── icon.svg          # Activity bar icon
├── LICENSE               # License file
└── README.md             # This file
```

## Troubleshooting

### Common Issues

1. **"API key not configured" error**
   - Ensure you've set the appropriate API key in VS Code settings
   - Check that the setting name matches exactly (e.g., `llmPanel.openaiApiKey`)

2. **Ollama connection failed**
   - Verify Ollama is running on your system
   - Check the URL in settings (default: `http://localhost:11434`)
   - Ensure the model configured in `llmPanel.ollamaModel` is pulled locally

3. **Extension not appearing**
   - Reload VS Code after installation
   - Check the Extensions panel for any error messages
   - Verify the extension is enabled

### Debug Mode

To enable debug logging:
1. Open Command Palette (Ctrl+Shift+P)
2. Run "Developer: Toggle Developer Tools"
3. Check the Console tab for extension logs

## License

MIT 