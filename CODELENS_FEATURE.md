# CodeLens "Convert to Prompt" Feature

## Overview

This feature adds inline "Convert to Prompt" buttons next to each bullet point in Markdown files, similar to how VS Code shows "Run" above a `main()` function. When clicked, it sends the bullet text to your Ollama LLM for processing.

## Features

- **Automatic Detection**: Detects bullet points using `-`, `*`, or `+` markers
- **Inline Buttons**: Shows "▶ Convert to Prompt" CodeLens above each bullet point
- **Ollama Integration**: Sends bullet text to Ollama API at `http://localhost:11434/api/generate`
- **Sidebar Feedback**: Results appear in the LLM Control Panel sidebar
- **Error Handling**: Graceful error messages for connection issues

## Setup

### Prerequisites

1. **Ollama Installation**: Install and run Ollama
   ```bash
   # Start Ollama server
   ollama serve
   ```

2. **Model**: Pull the required model (default: `gemma3-tools:12b`)
   ```bash
   ollama pull gemma3-tools:12b
   ```

3. **VS Code Settings**: Configure the extension
   - Open Settings (Ctrl+,)
   - Search for "LLM Control Panel"
   - Set `llmPanel.ollamaUrl` (default: `http://localhost:11434`)
   - Set `llmPanel.ollamaModel` (default: `gemma3-tools:12b`)

## Usage

1. **Open a Markdown file** (`.md`)
2. **Add bullet points** using `-`, `*`, or `+`
3. **Click "▶ Convert to Prompt"** above any bullet point
4. **View results** in the LLM Control Panel sidebar

### Example

```markdown
# My Tasks

- Create a function to calculate fibonacci numbers
- Implement a binary search algorithm
- Design a REST API for user management
```

Each bullet point will show a clickable "▶ Convert to Prompt" button.

## How It Works

### Architecture

1. **CodeLens Provider** (`markdownCodeLensProvider.js`)
   - Scans Markdown files for bullet points
   - Creates CodeLens items with clickable buttons

2. **Command Handler** (`extension.js`)
   - Executes when button is clicked
   - Sends HTTP request to Ollama API
   - Handles success/error responses

3. **Message Flow**
   ```
   User Click → convertToPrompt → Ollama API → postMessage → Sidebar
   ```

### API Request Format

```json
{
  "model": "gemma3-tools:12b",
  "prompt": "<bullet point text>",
  "stream": false
}
```

### Response Handling

**Success:**
```javascript
{
  command: 'copilotPromptCreated',
  success: true,
  bulletPoint: "...",
  response: "...",
  lineNumber: 5
}
```

**Error:**
```javascript
{
  command: 'copilotPromptCreated',
  success: false,
  bulletPoint: "...",
  error: "Connection refused",
  lineNumber: 5
}
```

## Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `llmPanel.ollamaUrl` | `http://localhost:11434` | Ollama server URL |
| `llmPanel.ollamaModel` | `gemma3-tools:12b` | Model to use for processing |

### Changing the Model

To use a different model:

1. Pull the model:
   ```bash
   ollama pull llama3.1
   ```

2. Update settings:
   ```json
   {
     "llmPanel.ollamaModel": "llama3.1"
   }
   ```

Or modify the default in `extension.js`:
```javascript
const ollamaModel = config.get('ollamaModel', 'your-model-name');
```

## Troubleshooting

### CodeLens Not Appearing

- **Check file type**: Must be `.md` Markdown file
- **Check bullet format**: Use `-`, `*`, or `+` at line start
- **Reload window**: Press `Ctrl+Shift+P` → "Reload Window"

### Connection Errors

- **Ollama not running**: Start with `ollama serve`
- **Wrong URL**: Check `llmPanel.ollamaUrl` setting
- **Firewall**: Ensure port 11434 is accessible

### Model Not Found

- **Pull model**: Run `ollama pull gemma3-tools:12b`
- **Check name**: Verify model name matches exactly
- **List models**: Run `ollama list` to see available models

## Development

### File Structure

```
src/
├── extension.js                          # Main extension file
├── providers/
│   └── markdownCodeLensProvider.js      # CodeLens provider
```

### Key Functions

- `provideCodeLenses()`: Detects bullet points and creates CodeLens items
- `convertBulletToPrompt()`: Handles Ollama API calls
- `postMessage()`: Sends results to webview sidebar

### Adding Custom Behavior

To customize the prompt or response handling, modify:

```javascript
// In extension.js
async function convertBulletToPrompt(bulletText, lineNumber, panelProvider) {
    // Customize request
    const requestBody = {
        model: ollamaModel,
        prompt: `Custom prefix: ${bulletText}`, // Add custom formatting
        stream: false,
        // Add more options like temperature, etc.
    };
    
    // Customize response handling
    panelProvider._view.webview.postMessage({
        command: 'copilotPromptCreated',
        success: true,
        bulletPoint: bulletText,
        response: result.response,
        // Add custom fields
        timestamp: new Date().toISOString()
    });
}
```

## Integration with Sidebar

The sidebar receives messages via `postMessage()` with the command `'copilotPromptCreated'`. To handle these messages in your webview:

```javascript
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'copilotPromptCreated') {
        if (message.success) {
            // Handle success
            console.log('Response:', message.response);
        } else {
            // Handle error
            console.error('Error:', message.error);
        }
    }
});
```

## Future Enhancements

Potential improvements:

- [ ] Support for numbered lists
- [ ] Batch processing of multiple bullets
- [ ] Custom prompt templates
- [ ] Response caching
- [ ] Multiple LLM provider support
- [ ] Inline response preview
- [ ] History tracking

## License

This feature is part of the LLM Control Panel extension.
