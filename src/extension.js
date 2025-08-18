const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');

// Attempt to statically require the MCP SDK so the bundler includes it
let __MCP_CLIENT__ = null;
let __MCP_STDIO__ = null;
let __MCP_LOAD_ERROR__ = null;
try {
    __MCP_CLIENT__ = require('@modelcontextprotocol/sdk/client');
    __MCP_STDIO__ = require('@modelcontextprotocol/sdk/client/stdio');
} catch (e) {
    __MCP_LOAD_ERROR__ = e;
}

function activate(context) {
    const provider = new LLMPanelProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('llm-panel-view', provider)
    );

    // MCP Manager tree view
    const mcpProvider = new MCPManagerProvider(context);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('mcp-manager', mcpProvider)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('mcpManager.refresh', () => mcpProvider.refresh())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('llmPanel.openPanel', () => {
            vscode.commands.executeCommand('workbench.view.extension.llm-panel');
        })
    );
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
    }

    resolveWebviewView(webviewView) {
        this._view = webviewView;
        const webview = webviewView.webview;

        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };

        webview.html = this._getHtmlForWebview(webview);

        webview.onDidReceiveMessage(async (message) => {
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
                case 'loadMcp':
                    await this._handleLoadMcp();
                    break;
                case 'refreshMcp':
                    await this._handleLoadMcp(true);
                    break;
                case 'getLogs':
                    this._postLogs();
                    break;
                case 'debugMcp':
                    await this._debugMcpSdk();
                    break;
            }
        });
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

    async _debugMcpSdk() {
        try {
            this._log('Debug MCP SDK: starting resolve checks...');
            const path = require('path');
            const fs = require('fs');
            try {
                const pkgPath = require.resolve('@modelcontextprotocol/sdk/package.json');
                this._log('MCP SDK package.json at:', pkgPath);
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                this._log('MCP SDK package exports:', JSON.stringify(pkg.exports));
                this._log('MCP SDK package main:', JSON.stringify(pkg.main));
                const dir = path.dirname(pkgPath);
                try {
                    const entries = fs.readdirSync(dir);
                    this._log('MCP SDK dir entries:', JSON.stringify(entries));
                    if (fs.existsSync(path.join(dir, 'dist'))) {
                        const distEntries = fs.readdirSync(path.join(dir, 'dist'));
                        this._log('MCP SDK dist entries:', JSON.stringify(distEntries));
                    }
                } catch (e) {
                    this._log('Read dir failed:', e.message || String(e));
                }
            } catch (e) {
                this._log('require.resolve failed for @modelcontextprotocol/sdk:', e.message || String(e));
            }
        } catch (e) {
            this._error('Debug MCP SDK failed:', e);
        } finally {
            this._postLogs();
        }
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
                max_tokens: 1000,
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
            html = '<!DOCTYPE html><html><body><p>Failed to load UI.</p></body></html>';
        }

        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.js'));
        const cspSource = webview.cspSource;

        return html
            .replace(/%STYLE_URI%/g, styleUri.toString())
            .replace(/%SCRIPT_URI%/g, scriptUri.toString())
            .replace(/%CSP_SOURCE%/g, cspSource);
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
            results.push({ name, status, tools, message });
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
        this._log('MCP SDK not available (not bundled). Rebuild with npm run build before packaging.');
        return null;
    }

    _postLogs() {
        const text = this._logBuffer.join('\n');
        this._view?.webview.postMessage({ command: 'logs', text });
    }

    _log(...args) {
        const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
        this._logBuffer.push(line);
        if (this._logBuffer.length > 500) this._logBuffer.shift();
        this._output.appendLine(line);
    }

    _error(...args) {
        const line = `[${new Date().toISOString()}] ERROR ${args.map(a => (a && a.stack) ? a.stack : (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
        this._logBuffer.push(line);
        if (this._logBuffer.length > 500) this._logBuffer.shift();
        this._output.appendLine(line);
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}; 

// ---------------- MCP Manager ----------------

class MCPManagerProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.servers = [];
        this.serverStatus = new Map(); // name -> 'active' | 'failed'
        this.serverTools = new Map(); // name -> Tool[]
        this.clients = new Map(); // name -> client
        this._sdk = this._loadMcpSdk();
        this._loadConfig();
    }

    dispose() {
        for (const client of this.clients.values()) {
            try { client.disconnect && client.disconnect(); } catch {}
        }
        this._onDidChangeTreeData.dispose();
    }

    refresh() {
        this._loadConfig();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            // Top-level: servers
            return this.servers.map((s) => this._createServerItem(s));
        }

        if (element.kind === 'server') {
            const server = element.server;
            try {
                const tools = await this._ensureConnectedAndGetTools(server);
                if (!tools || tools.length === 0) {
                    return [this._createInfoItem('No tools available')];
                }
                return tools.map((t) => this._createToolItem(t));
            } catch (e) {
                return [this._createErrorItem('Failed to connect')];
            }
        }

        return [];
    }

    _createServerItem(server) {
        const status = this.serverStatus.get(server.name);
        const isActive = status === 'active';
        const label = server.name || server.command || 'MCP Server';
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        item.description = isActive ? '🟢 active' : (status === 'failed' ? '🔴 failed' : '');
        item.contextValue = 'mcp-server';
        item.kind = 'server';
        item.server = server;
        return item;
    }

    _createToolItem(tool) {
        const item = new vscode.TreeItem(tool.name || 'tool', vscode.TreeItemCollapsibleState.None);
        item.description = tool.description || '';
        item.contextValue = 'mcp-tool';
        return item;
    }

    _createErrorItem(message) {
        const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
        item.description = '';
        item.iconPath = new vscode.ThemeIcon('error');
        return item;
    }

    _createInfoItem(message) {
        const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }

    async _ensureConnectedAndGetTools(server) {
        if (this.serverTools.has(server.name)) {
            return this.serverTools.get(server.name);
        }

        await this._connectServer(server);
        const client = this.clients.get(server.name);
        if (!client) {
            this.serverStatus.set(server.name, 'failed');
            throw new Error('client not available');
        }

        let tools = [];
        try {
            if (typeof client.listTools === 'function') {
                const res = await client.listTools();
                tools = res && (res.tools || res) ? (res.tools || res) : [];
            } else if (client.tools && typeof client.tools === 'function') {
                const res = await client.tools();
                tools = res && (res.tools || res) ? (res.tools || res) : [];
            }
            this.serverStatus.set(server.name, 'active');
        } catch (e) {
            this.serverStatus.set(server.name, 'failed');
            throw e;
        }

        this.serverTools.set(server.name, tools);
        return tools;
    }

    async _connectServer(server) {
        if (this.clients.has(server.name)) {
            return; // already connected or attempted
        }
        if (!this._sdk) {
            this.serverStatus.set(server.name, 'failed');
            return;
        }

        try {
            const { Client } = this._sdk.client;
            const { StdioClientTransport } = this._sdk.stdio;
            const transport = new StdioClientTransport({
                command: server.command,
                args: server.args || []
            });

            const client = new Client(
                { name: 'LLM Control Panel MCP', version: '0.0.1' },
                { capabilities: {} },
                transport
            );
            await client.connect();
            this.clients.set(server.name, client);
            this.serverStatus.set(server.name, 'active');
        } catch (e) {
            this.serverStatus.set(server.name, 'failed');
        }
    }

    _loadMcpSdk() {
        try {
            const client = require('@modelcontextprotocol/sdk/client');
            const stdio = require('@modelcontextprotocol/sdk/client/stdio');
            return { client, stdio };
        } catch (e) {
            return null;
        }
    }

    _loadConfig() {
        this.servers = [];
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }
        const root = folders[0].uri.fsPath;
        const configPath = vscode.Uri.joinPath(folders[0].uri, 'mcp.config.json').fsPath;
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const json = JSON.parse(raw);
            let servers = [];
            if (Array.isArray(json.servers)) {
                servers = json.servers;
            } else if (Array.isArray(json.mcpServers)) {
                servers = json.mcpServers;
            } else if (json.servers && typeof json.servers === 'object') {
                servers = Object.keys(json.servers).map((name) => ({ name, ...(json.servers[name] || {}) }));
            }
            this.servers = servers.map((s, idx) => ({
                name: s.name || s.id || `server-${idx + 1}`,
                command: s.command,
                args: s.args || []
            })).filter((s) => !!s.command);
        } catch (e) {
            // missing or invalid config: show no servers
            this.servers = [];
        }
    }
}