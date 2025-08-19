const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');

function activate(context) {
    console.log('LLM Control Panel extension is now active!');
    
    const provider = new LLMPanelProvider(context.extensionUri, context);
    
    // Register the webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('llm-panel-view', provider)
    );

    // Command to open the panel
    context.subscriptions.push(
        vscode.commands.registerCommand('llmPanel.openPanel', () => {
            console.log('Opening LLM Panel...');
            provider.reveal();
        })
    );
    
    console.log('LLM Control Panel extension activated successfully');
}

class LLMPanelProvider {
    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context;
        this._view = undefined;
        this._sdk = null;
        this._sdkLoading = null;
        this._output = vscode.window.createOutputChannel('LLM Control Panel');
        this._logBuffer = [];
        this._mcpClients = new Map(); // Store connected MCP clients
    }

    resolveWebviewView(webviewView) {
        console.log('Webview view resolved!');
        
        this._view = webviewView;
        const webview = webviewView.webview;

        console.log('Setting up webview options...');

        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };

        console.log('Setting webview HTML...');
        webview.html = this._getHtmlForWebview(webview);

        console.log('Setting up message handlers...');

        webview.onDidReceiveMessage(async (message) => {
            console.log(`Received message from webview: ${message.command}`, message);
            
            try {
                switch (message.command) {
                    case 'sendPrompt':
                        await this._handlePrompt(message.provider, message.prompt);
                        break;
                    case 'openSettings':
                        this._openSettings();
                        break;
                    case 'checkProvider':
                        await this._checkProvider(message.provider);
                        break;
                    case 'saveFile':
                        console.log('Processing saveFile command...');
                        await this._handleSaveFile(message);
                        break;
                    case 'createPlanWithPrompt':
                        await this._createPlanDocument(message.prompt, message.provider);
                        break;
                    case 'getFileLogs':
                        console.log('Processing getFileLogs command...');
                        this._postLogs();
                        break;
                    case 'testConnection':
                        console.log('Test connection received:', message.message);
                        webview.postMessage({ command: 'testResponse', message: 'Extension is working! Received: ' + message.message });
                        break;
                    default:
                        console.log(`Unknown command: ${message.command}`);
                }
            } catch (error) {
                console.error('Error processing message:', error);
                this._error('Error processing message:', error);
            }
        });

        console.log('Webview setup complete!');
        
        // Send initial message to confirm connection
        webview.postMessage({ command: 'extensionReady', message: 'Extension is ready!' });
        
        // Test logging
        this._log('Webview initialized and ready for communication');
        console.log('Webview is ready and extension is connected!');
    }

    async _createPlanDocument(prompt, provider) {
        try {
            // Ask user for plan type and description
            const planType = await vscode.window.showQuickPick([
                'Project Plan',
                'Development Roadmap', 
                'Sprint Plan',
                'Technical Specification',
                'Business Plan',
                'Custom Plan'
            ], {
                placeHolder: 'Select plan type'
            });

            if (!planType) return;

            let planDescription = '';
            if (planType === 'Custom Plan') {
                planDescription = await vscode.window.showInputBox({
                    prompt: 'Enter plan description',
                    placeHolder: 'Describe what you want to plan...',
                    value: prompt || ''
                });
            } else {
                planDescription = await vscode.window.showInputBox({
                    prompt: `Enter ${planType.toLowerCase()} description`,
                    placeHolder: `Describe your ${planType.toLowerCase()}...`,
                    value: prompt || ''
                });
            }

            if (!planDescription) return;

            // Create enhanced prompt for plan generation
            const enhancedPrompt = `Create a comprehensive ${planType.toLowerCase()} document for: ${planDescription}

Please structure the plan as a detailed markdown document with:

1. **Executive Summary** - Brief overview and objectives
2. **Project Scope** - What's included and excluded
3. **Timeline & Milestones** - Key phases with estimated durations
4. **Detailed Tasks** - Broken down by phase with:
   - Task descriptions
   - Dependencies
   - Resource requirements
   - Success criteria
5. **Risk Assessment** - Potential challenges and mitigation strategies
6. **Resource Requirements** - Tools, technologies, personnel needed
7. **Success Metrics** - How to measure completion and success

Format with clear markdown headers, bullet points, and actionable items.`;

            // Generate plan content with LLM
            const planContent = await this._callLLM(provider, enhancedPrompt);
            
            // Save plan directly to workspace using VS Code file system API
            const fileName = `${planType.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.md`;
            await this._savePlanToWorkspace(fileName, planContent, 'create');

            this._view.webview.postMessage({
                command: 'planCreated',
                fileName,
                content: planContent
            });

        } catch (error) {
            this._error('Failed to create plan document:', error);
            this._view.webview.postMessage({
                command: 'planCreated',
                error: error.message
            });
        }
    }

    async _savePlanToWorkspace(fileName, content, mode = 'create') {
        try {
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                throw new Error('No workspace folder open. Please open a folder first.');
            }
            
            const targetUri = vscode.Uri.joinPath(folders[0].uri, fileName);
            
            // Use VS Code's native file system API
            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
            
            this._log(`Plan document saved successfully: ${targetUri.fsPath}`);
            
            // Show success message
            vscode.window.showInformationMessage(`Plan document created: ${fileName}`);
            
        } catch (error) {
            this._error('Failed to save plan to workspace:', error);
            throw error;
        }
    }

    async _callLLM(provider, prompt) {
        switch (provider) {
            case 'openai':
                return await this._callOpenAI(prompt);
            case 'gemini':
                return await this._callGemini(prompt);
            case 'ollama':
                return await this._callOllama(prompt);
            default:
                throw new Error('Invalid provider selected');
        }
    }

    async _handlePrompt(provider, prompt) {
        try {
            let responseText;
            switch (provider) {
                case 'openai':
                    responseText = await this._callOpenAI(prompt);
                    break;
                case 'gemini':
                    responseText = await this._callGemini(prompt);
                    break;
                case 'ollama':
                    responseText = await this._callOllama(prompt);
                    break;
                default:
                    throw new Error('Invalid provider selected');
            }

            // Auto-save the response content as a file
            await this._saveResponseAsFile(prompt, responseText, provider);

            this._view.webview.postMessage({
                command: 'promptResponse',
                response: responseText,
                error: null
            });
        } catch (error) {
            this._view.webview.postMessage({
                command: 'promptResponse',
                response: null,
                error: error && error.message ? error.message : String(error)
            });
        }
    }

    async _saveResponseAsFile(prompt, response, provider) {
        try {
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                this._log('No workspace folder open, skipping auto-save');
                return;
            }

            // Create a filename based on the prompt and timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const promptPreview = prompt.slice(0, 50).replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
            const fileName = `${provider}_response_${promptPreview}_${timestamp}.md`;
            
            const targetUri = vscode.Uri.joinPath(folders[0].uri, fileName);
            
            // Create markdown content with metadata
            const markdownContent = `# LLM Response - ${provider.toUpperCase()}

**Generated:** ${new Date().toLocaleString()}
**Provider:** ${provider}
**Prompt:** ${prompt}

---

${response}

---

*Auto-generated by LLM Control Panel VS Code Extension*`;

            // Save the file using VS Code's native file system API
            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(markdownContent, 'utf8'));
            
            this._log(`Response auto-saved: ${targetUri.fsPath}`);
            
            // Show success message
            vscode.window.showInformationMessage(`Response saved: ${fileName}`);
            
        } catch (error) {
            this._error('Failed to auto-save response:', error);
            // Don't throw error to avoid breaking the main response flow
        }
    }

    // handle save file request from webview
    async _handleSaveFile(message) {
        console.log('=== FILE SAVE OPERATION STARTED ===');
        console.log('Message received:', message);
        
        try {
            const { filePath, content, mode } = message;
            
            if (!filePath || !filePath.trim()) {
                throw new Error('File path is required');
            }
            
            console.log(`File save request: path="${filePath}", mode="${mode}", contentLength=${content ? content.length : 0}`);
            
            // Check if workspace is open
            const folders = vscode.workspace.workspaceFolders || [];
            console.log(`Workspace folders count: ${folders.length}`);
            
            if (!folders.length) {
                throw new Error('No workspace folder open. Please open a folder first.');
            }
            
            // Resolve the target URI
            let targetUri;
            if (filePath.startsWith('/') || filePath.match(/^[A-Za-z]:/)) {
                // Absolute path
                targetUri = vscode.Uri.file(filePath);
                console.log(`Using absolute path: ${targetUri.fsPath}`);
            } else {
                // Relative path - join with workspace
                targetUri = vscode.Uri.joinPath(folders[0].uri, filePath);
                console.log(`Using relative path: ${targetUri.fsPath}`);
            }
            
            console.log(`Target URI: ${targetUri.fsPath}`);
            
            // Write the file
            const dataBuffer = Buffer.from(content || '', 'utf8');
            console.log(`Writing ${dataBuffer.length} bytes to file...`);
            
            await vscode.workspace.fs.writeFile(targetUri, dataBuffer);
            
            console.log(`File saved successfully: ${targetUri.fsPath}`);
            
            // Send success message to webview
            this._view?.webview.postMessage({ 
                command: 'fileSaved', 
                ok: true, 
                path: targetUri.fsPath 
            });
            
            // Show success message
            vscode.window.showInformationMessage(`File saved: ${targetUri.fsPath}`);
            
        } catch (error) {
            console.error('Save file failed:', error);
            
            const errorMessage = error.message || String(error);
            console.error(`Error details: ${errorMessage}`);
            
            // Send error message to webview
            this._view?.webview.postMessage({ 
                command: 'fileSaved', 
                ok: false, 
                error: errorMessage
            });
            
            // Show error message
            vscode.window.showErrorMessage(`Failed to save file: ${errorMessage}`);
        }
        
        console.log('=== FILE SAVE OPERATION COMPLETED ===');
    }

    async _resolveTargetUri(inputPath) {
        this._log(`Resolving URI for input path: ${inputPath}`);
        
        const isAbsolute = /^(?:[a-zA-Z]:\\|\\\\|\/)/.test(inputPath);
        this._log(`Path is absolute: ${isAbsolute}`);
        
        if (isAbsolute) {
            const uri = vscode.Uri.file(inputPath);
            this._log(`Using absolute path: ${uri.fsPath}`);
            return uri;
        }
        
        const folders = vscode.workspace.workspaceFolders || [];
        this._log(`Workspace folders count: ${folders.length}`);
        
        if (!folders.length) {
            throw new Error('No workspace folder open. Please open a folder first.');
        }
        
        const workspaceUri = folders[0].uri;
        this._log(`Workspace URI: ${workspaceUri.fsPath}`);
        
        const targetUri = vscode.Uri.joinPath(workspaceUri, inputPath);
        this._log(`Target URI: ${targetUri.fsPath}`);
        
        return targetUri;
    }

    async _writeFile(uri, dataBuffer, mode) {
        this._log(`Writing file: ${uri.fsPath}, mode: ${mode}, dataSize: ${dataBuffer.length}`);
        
        const encoder = new TextEncoder();
        try {
            // Check if file exists
            const stat = await vscode.workspace.fs.stat(uri);
            this._log(`File exists, size: ${stat.size}`);
            
            if (mode === 'create') {
                throw new Error('File already exists');
            } else if (mode === 'overwrite') {
                this._log('Overwriting existing file');
                await vscode.workspace.fs.writeFile(uri, dataBuffer);
            } else if (mode === 'append') {
                this._log('Appending to existing file');
                const existing = await vscode.workspace.fs.readFile(uri);
                const combined = Buffer.concat([existing, Buffer.from('\n'), dataBuffer]);
                await vscode.workspace.fs.writeFile(uri, combined);
            } else {
                this._log('Default mode - overwriting');
                await vscode.workspace.fs.writeFile(uri, dataBuffer);
            }
        } catch (e) {
            // if file does not exist
            if (e && (e.code === 'FileNotFound' || /ENOENT/i.test(String(e && e.message)))) {
                this._log('File does not exist, creating new file');
                if (mode === 'append') {
                    // create new with content
                    await vscode.workspace.fs.writeFile(uri, dataBuffer);
                } else {
                    await vscode.workspace.fs.writeFile(uri, dataBuffer);
                }
            } else {
                this._log(`Error during file operation: ${e.message || String(e)}`);
                throw e;
            }
        }
        
        this._log(`File write operation completed successfully`);
    }

    async _checkProvider(provider) {
        try {
            const config = vscode.workspace.getConfiguration('llmPanel');
            if (provider === 'openai') {
                const apiKey = config.get('openaiApiKey');
                const model = config.get('openaiModel') || 'gpt-4o-mini';
                if (apiKey) {
                    this._view.webview.postMessage({ command: 'providerStatus', status: 'connected', message: `OpenAI ready (model: ${model})` });
                } else {
                    this._view.webview.postMessage({ command: 'providerStatus', status: 'error', message: 'OpenAI API key not configured' });
                }
                return;
            }

            if (provider === 'gemini') {
                const apiKey = config.get('geminiApiKey');
                const model = config.get('geminiModel') || 'gemini-1.5-flash';
                if (apiKey) {
                    this._view.webview.postMessage({ command: 'providerStatus', status: 'connected', message: `Gemini ready (model: ${model})` });
                } else {
                    this._view.webview.postMessage({ command: 'providerStatus', status: 'error', message: 'Gemini API key not configured' });
                }
                return;
            }

            if (provider === 'ollama') {
                const ollamaUrl = (config.get('ollamaUrl') || 'http://localhost:11434').replace(/\/$/, '');
                const model = config.get('ollamaModel') || 'llama3.1';
                try {
                    const res = await fetch(`${ollamaUrl}/api/tags`, { method: 'GET' });
                    if (res.ok) {
                        this._view.webview.postMessage({ command: 'providerStatus', status: 'connected', message: `Ollama reachable (model: ${model})` });
                    } else {
                        this._view.webview.postMessage({ command: 'providerStatus', status: 'error', message: `Ollama responded: ${res.status} ${res.statusText}` });
                    }
                } catch (err) {
                    this._view.webview.postMessage({ command: 'providerStatus', status: 'error', message: `Failed to reach Ollama at ${ollamaUrl}` });
                }
                return;
            }
        } catch (e) {
            this._view.webview.postMessage({ command: 'providerStatus', status: 'error', message: 'Provider check failed' });
        }
    }

    async _callOpenAI(prompt) {
        const config = vscode.workspace.getConfiguration('llmPanel');
        const apiKey = config.get('openaiApiKey');
        const model = config.get('openaiModel') || 'gpt-4o-mini';

        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please set it in settings.');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${text}`);
        }

        const data = await response.json();
        return data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : JSON.stringify(data);
    }

    async _callGemini(prompt) {
        const config = vscode.workspace.getConfiguration('llmPanel');
        const apiKey = config.get('geminiApiKey');
        const model = config.get('geminiModel') || 'gemini-1.5-flash';

        if (!apiKey) {
            throw new Error('Gemini API key not configured. Please set it in settings.');
        }

        const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [ { parts: [ { text: prompt } ] } ]
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${text}`);
        }

        const data = await response.json();
        if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            return data.candidates[0].content.parts[0].text || '';
        }
        return JSON.stringify(data);
    }

    async _callOllama(prompt) {
        const config = vscode.workspace.getConfiguration('llmPanel');
        const ollamaUrl = (config.get('ollamaUrl') || 'http://localhost:11434').replace(/\/$/, '');
        const model = config.get('ollamaModel') || 'llama3.1';

        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${text}`);
        }

        const data = await response.json();
        return data && data.response ? data.response : JSON.stringify(data);
    }

    _openSettings() {
        vscode.commands.executeCommand('workbench.action.openSettings', 'llmPanel');
    }

    _getHtmlForWebview(webview) {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.html');
        let html = '';
        try {
            html = fs.readFileSync(htmlPath.fsPath, 'utf8');
        } catch (e) {
            html = this._getDefaultHtml();
        }

        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.js'));
        const cspSource = webview.cspSource;

        return html
            .replace(/%STYLE_URI%/g, styleUri.toString())
            .replace(/%SCRIPT_URI%/g, scriptUri.toString())
            .replace(/%CSP_SOURCE%/g, cspSource);
    }

    _getDefaultHtml() {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="%STYLE_URI%" rel="stylesheet">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src %CSP_SOURCE%; script-src %CSP_SOURCE%;">
        </head>
        <body>
            <div class="container">
                <div class="section">
                    <h3>LLM Provider</h3>
                    <select id="provider">
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini</option>
                        <option value="ollama">Ollama</option>
                    </select>
                    <div class="status-row">
                        <span id="statusIndicator" class="status-inactive">Inactive</span>
                        <button id="configureBtn" class="secondary-btn">Configure</button>
                    </div>
                </div>

                <div class="section">
                    <h3>Prompt</h3>
                    <textarea id="prompt" placeholder="Enter your prompt here..."></textarea>
                    <button id="sendBtn" class="primary-btn">Send</button>
                </div>

                <div class="section">
                    <h3>Plan Creation</h3>
                    <button id="createPlanBtn" class="primary-btn">Create Plan Document</button>
                    <div id="planStatus"></div>
                </div>

                <div class="section">
                    <h3>Response</h3>
                    <div id="output" class="output"></div>
                </div>

                <div class="section">
                    <h3>MCP Servers</h3>
                    <div class="mcp-controls">
                        <button id="mcpRefreshBtn" class="secondary-btn">Refresh</button>
                        <button id="mcpLogsBtn" class="secondary-btn">Logs</button>
                        <button id="mcpDebugBtn" class="secondary-btn">Debug</button>
                    </div>
                    <div id="mcpContainer"></div>
                    <pre id="mcpLogs" class="hidden"></pre>
                </div>
            </div>

            <script src="%SCRIPT_URI%"></script>
        </body>
        </html>`;
    }

    // --------------- MCP: load and send data to webview ---------------
    async _handleLoadMcp(forceRefresh = false) {
        try {
            this._log('Loading MCP config and connecting to servers...');
            const data = await this._loadMcpData(forceRefresh);
            this._log('MCP load complete. Servers:', JSON.stringify(data.servers.map(s => ({ name: s.name, status: s.status }))));
            this._view.webview.postMessage({ command: 'mcpData', data });
        } catch (e) {
            this._error('Failed to load MCP:', e);
            this._view.webview.postMessage({ command: 'mcpData', data: { servers: [], error: 'Failed to load MCP config' } });
        }
    }

    _getWorkspaceFolders() {
        return vscode.workspace.workspaceFolders || [];
    }

    async _loadMcpData(forceRefresh) {
        const folders = this._getWorkspaceFolders();
        if (!folders.length) {
            return { servers: [] };
        }
        const root = folders[0].uri;
        const configUri = vscode.Uri.joinPath(root, '.vscode', 'mcp.json');

        let config;
        try {
            const bytes = await vscode.workspace.fs.readFile(configUri);
            const text = Buffer.from(bytes).toString('utf8');
            config = JSON.parse(text);
        } catch (e) {
            this._log('No .vscode/mcp.json found or invalid JSON.', e && e.message);
            return { servers: [] };
        }

        const inputsDef = Array.isArray(config.inputs) ? config.inputs : [];
        const serversObj = config.servers || {};
        const serverNames = Object.keys(serversObj);

        const results = [];
        for (const name of serverNames) {
            const srv = serversObj[name] || {};
            const type = srv.type || 'stdio';
            const command = srv.command;
            const args = Array.isArray(srv.args) ? await this._resolveArgsWithInputs(srv.args, inputsDef, forceRefresh) : [];

            if (!command) {
                results.push({ name, status: 'failed', tools: [], message: 'Missing command' });
                continue;
            }

            if (type !== 'stdio') {
                this._log(`Server ${name}: unsupported type '${type}'.`);
                results.push({ name, status: 'failed', tools: [], message: 'Unsupported server type (expected stdio)' });
                continue;
            }

            const { tools, status, message } = await this._connectAndListTools(name, command, args);
            results.push({ name, status, tools, message, command, args });
        }

        return { servers: results };
    }

    async _resolveArgsWithInputs(args, inputsDef, forceRefresh) {
        const resolved = [];
        for (const a of args) {
            const match = typeof a === 'string' && a.match(/^\$\{input:([^}]+)\}$/);
            if (match) {
                const id = match[1];
                const val = await this._resolveInputValue(id, inputsDef, forceRefresh);
                resolved.push(val || '');
            } else {
                resolved.push(a);
            }
        }
        return resolved;
    }

    async _resolveInputValue(id, inputsDef, forceRefresh) {
        const key = `mcp.input.${id}`;
        if (!forceRefresh) {
            const existing = this._context.workspaceState.get(key);
            if (existing) return existing;
        }
        const def = inputsDef.find((i) => i.id === id) || {};
        const value = await vscode.window.showInputBox({
            title: def.title || `Value for ${id}`,
            prompt: def.description || `Enter value for ${id}`,
            ignoreFocusOut: true
        });
        if (typeof value === 'string') {
            await this._context.workspaceState.update(key, value);
            return value;
        }
        return '';
    }

    async _connectAndListTools(name, command, args) {
        try {
            const sdk = await this._getMcpSdk();
            if (!sdk) {
                return { status: 'failed', tools: [], message: 'MCP SDK not available in extension' };
            }
            const { Client } = sdk.client;
            const { StdioClientTransport } = sdk.stdio;
            let cmd = command;
            let cmdArgs = Array.isArray(args) ? [...args] : [];
            if (process.platform === 'win32' && cmd.toLowerCase() === 'npx') {
                cmd = 'npx.cmd';
            }
            if (cmd.toLowerCase().includes('npx')) {
                const hasYes = cmdArgs.some(a => String(a).toLowerCase() === '-y' || String(a).toLowerCase() === '--yes');
                if (!hasYes) {
                    cmdArgs.unshift('-y');
                }
            }
            this._log(`Connecting to MCP server '${name}' with: ${cmd} ${cmdArgs.join(' ')}`);
            const transport = new StdioClientTransport({ command: cmd, args: cmdArgs });
            const client = new Client(
                { name: 'LLM Control Panel MCP', version: '0.0.2' },
                { capabilities: {} },
                transport
            );
            await client.connect();
            let tools = [];
            try {
                if (typeof client.listTools === 'function') {
                    const res = await client.listTools();
                    tools = (res && (res.tools || res)) ? (res.tools || res) : [];
                } else if (client.tools && typeof client.tools === 'function') {
                    const res = await client.tools();
                    tools = (res && (res.tools || res)) ? (res.tools || res) : [];
                }
            } finally {
                try { client.close && (await client.close()); } catch {}
                try { client.disconnect && (await client.disconnect()); } catch {}
            }
            const shaped = tools.map((t) => ({ name: t.name || 'tool', description: t.description || '' }));
            this._log(`Server '${name}' tools: ${JSON.stringify(shaped.map(t => t.name))}`);
            return { status: 'active', tools: shaped };
        } catch (e) {
            this._error(`Failed to connect to server '${name}':`, e);
            return { status: 'failed', tools: [], message: (e && e.message) ? e.message : 'Failed to connect' };
        }
    }

    async _getMcpSdk() {
        if (this._sdk) return this._sdk;
        // Prefer bundled static requires so packaging includes the SDK
        if (__MCP_CLIENT__ && __MCP_STDIO__) {
            const clientNs = __MCP_CLIENT__.default || __MCP_CLIENT__;
            const stdioNs = __MCP_STDIO__.default || __MCP_STDIO__;
            if (clientNs && stdioNs && clientNs.Client && (stdioNs.StdioClientTransport || stdioNs.StdioTransport || stdioNs.default?.StdioClientTransport)) {
                this._sdk = { client: clientNs, stdio: stdioNs };
                this._log('MCP SDK loaded (bundled).');
                return this._sdk;
            }
            this._log('Bundled MCP SDK missing expected exports.');
            return null;
        }
        if (__MCP_LOAD_ERROR__) {
            this._log('Bundled MCP SDK not available:', (__MCP_LOAD_ERROR__ && __MCP_LOAD_ERROR__.message) ? __MCP_LOAD_ERROR__.message : String(__MCP_LOAD_ERROR__));
        }
        return null;
    }

    _postLogs() {
        console.log('Posting logs to webview...');
        
        if (!this._view || !this._view.webview) {
            console.error('No webview available to post logs');
            return;
        }
        
        const text = this._logBuffer.join('\n');
        console.log(`Log buffer contains ${this._logBuffer.length} lines, total length: ${text.length}`);
        
        try {
            this._view.webview.postMessage({ command: 'logs', text });
            console.log('Logs message sent to webview successfully');
        } catch (error) {
            console.error('Failed to send logs to webview:', error);
        }
    }

    _log(...args) {
        const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
        this._logBuffer.push(line);
        if (this._logBuffer.length > 500) this._logBuffer.shift();
        
        // Log to VS Code output
        this._output.appendLine(line);
        
        // Log to console for debugging
        console.log(`[LLM Panel] ${line}`);
    }

    _error(...args) {
        const line = `[${new Date().toISOString()}] ERROR ${args.map(a => (a && a.stack) ? a.stack : (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
        this._logBuffer.push(line);
        if (this._logBuffer.length > 500) this._logBuffer.shift();
        
        // Log to VS Code output
        this._output.appendLine(line);
        
        // Log to console for debugging
        console.error(`[LLM Panel] ${line}`);
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};