(function() {
    'use strict';

    const vscode = acquireVsCodeApi();

    // DOM elements
    const providerSelect = document.getElementById('provider');
    const promptTextarea = document.getElementById('prompt');
    const sendBtn = document.getElementById('sendBtn');
    const configureBtn = document.getElementById('configureBtn');
    const statusIndicator = document.getElementById('statusIndicator');
    const outputArea = document.getElementById('output');
    const filePathInput = document.getElementById('filePath');
    const fileModeSelect = document.getElementById('fileMode');
    const fileContentTextarea = document.getElementById('fileContent');
    const saveFileBtn = document.getElementById('saveFileBtn');
    const fileStatus = document.getElementById('fileStatus');
    const showLogsBtn = document.getElementById('showLogsBtn');
    const fileLogs = document.getElementById('fileLogs');
    const testBtn = document.getElementById('testBtn');
    const createPlanBtn = document.getElementById('createPlanBtn');
    const planStatus = document.getElementById('planStatus');

    // Event listeners
    sendBtn.addEventListener('click', handleSendPrompt);
    configureBtn.addEventListener('click', handleConfigure);
    providerSelect.addEventListener('change', () => checkProvider(providerSelect.value));
    
    if (createPlanBtn) {
        createPlanBtn.addEventListener('click', handleCreatePlan);
    }
    if (saveFileBtn) {
        saveFileBtn.addEventListener('click', () => {
            const filePath = filePathInput?.value.trim();
            const mode = fileModeSelect?.value || 'create';
            const content = fileContentTextarea?.value || '';
            
            console.log('Save file button clicked:', { filePath, mode, content });
            
            if (!filePath) {
                setFileStatus('Please enter a file path', 'error');
                return;
            }
            
            setFileStatus('Saving...', 'loading');
            
            const message = { command: 'saveFile', filePath, content, mode };
            console.log('Sending message to extension:', message);
            
            vscode.postMessage(message);
        });
    }

    if (showLogsBtn) {
        showLogsBtn.addEventListener('click', () => {
            console.log('Show logs button clicked');
            
            if (fileLogs?.classList.contains('hidden')) {
                // Request logs from extension
                console.log('Requesting logs from extension');
                vscode.postMessage({ command: 'getFileLogs' });
            }
            
            fileLogs?.classList.toggle('hidden');
            showLogsBtn.textContent = fileLogs?.classList.contains('hidden') ? 'Show Logs' : 'Hide Logs';
            
            console.log('Logs visibility toggled, button text updated');
        });
    }

    if (testBtn) {
        testBtn.addEventListener('click', () => {
            console.log('Test button clicked');
            setFileStatus('Testing connection...', 'loading');
            
            // Send a test message to the extension
            vscode.postMessage({ command: 'testConnection', message: 'Hello from webview!' });
            
            // Also test file saving with a simple test
            setTimeout(() => {
                console.log('Testing file save...');
                vscode.postMessage({ 
                    command: 'saveFile', 
                    filePath: 'test.txt', 
                    content: 'This is a test file created at ' + new Date().toISOString(),
                    mode: 'create'
                });
            }, 1000);
        });
    }

    // Handle creating plan document
    function handleCreatePlan() {
        const planPrompt = promptTextarea.value.trim();
        const provider = providerSelect.value;

        if (!planPrompt) {
            showPlanStatus('Please enter a description for your plan in the prompt field above', 'error');
            return;
        }

        showPlanStatus('Creating plan document...', 'loading');
        createPlanBtn.disabled = true;

        // Send the current prompt to the extension for plan creation
        vscode.postMessage({
            command: 'createPlanWithPrompt',
            provider: provider,
            prompt: planPrompt
        });
    }

    // Handle sending prompt
    function handleSendPrompt() {
        const provider = providerSelect.value;
        const prompt = promptTextarea.value.trim();

        if (!prompt) {
            showError('Please enter a prompt');
            return;
        }

        // Update status
        setStatus('Active');
        sendBtn.disabled = true;
        outputArea.innerHTML = '<div class="loading">Processing...</div>';

        // Send message to extension
        vscode.postMessage({
            command: 'sendPrompt',
            provider: provider,
            prompt: prompt
        });
    }

    // Handle configure button
    function handleConfigure() {
        vscode.postMessage({
            command: 'openSettings'
        });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('Received message from extension:', message);

        switch (message.command) {
            case 'extensionReady':
                console.log('Extension is ready:', message.message);
                setStatus('Connected');
                break;
            case 'testResponse':
                console.log('Test response received:', message.message);
                setFileStatus('Connection test successful: ' + message.message, 'success');
                break;
            case 'promptResponse':
                handlePromptResponse(message.response, message.error);
                break;
            case 'providerStatus':
                handleProviderStatus(message.status, message.message);
                break;
            case 'fileSaved':
                if (message.ok) {
                    setFileStatus(`Saved: ${message.path}`, 'success');
                    console.log('File saved successfully:', message.path);
                } else {
                    setFileStatus(`Save failed: ${message.error}`, 'error');
                    console.error('File save failed:', message.error);
                }
                break;
            case 'logs':
                if (fileLogs) {
                    fileLogs.textContent = message.text || '';
                    console.log('Logs received:', message.text ? message.text.length : 0, 'characters');
                }
                break;
            case 'planCreated':
                handlePlanCreated(message.fileName, message.content, message.error);
                break;
        }
    });

    // Handle plan creation response
    function handlePlanCreated(fileName, content, error) {
        createPlanBtn.disabled = false;
        
        if (error) {
            showPlanStatus(`Failed to create plan: ${error}`, 'error');
        } else {
            showPlanStatus(`Plan document created: ${fileName}`, 'success');
            // Also show the content in the output area
            showResponse(`Plan document saved as: ${fileName}\n\n${content}`);
        }
    }

    // Handle tool execution response
    function setFileStatus(message, type) {
        if (!fileStatus) return;
        fileStatus.innerHTML = `<div class="${type}">${escapeHtml(message)}</div>`;
    }

    // Handle prompt response
    function handlePromptResponse(response, error) {
        // Reset status
        setStatus('Inactive');
        sendBtn.disabled = false;

        if (error) {
            showError(error);
        } else {
            showResponse(response);
        }
    }

    // Set status indicator
    function setStatus(status) {
        if (!statusIndicator) return;
        statusIndicator.textContent = status;
        if (status === 'Active') {
            statusIndicator.className = 'status-active';
        } else if (status === 'Connected') {
            statusIndicator.className = 'status-connected';
        } else if (status === 'Error') {
            statusIndicator.className = 'status-error';
        } else {
            statusIndicator.className = 'status-inactive';
        }
    }

    // Show plan status
    function showPlanStatus(message, type = 'info') {
        if (!planStatus) return;
        planStatus.innerHTML = `<div class="${type}">${escapeHtml(message)}</div>`;
        
        // Auto-clear after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                planStatus.innerHTML = '';
            }, 5000);
        }
    }

    // Show error message
    function showError(message) {
        if (!outputArea) return;
        outputArea.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
    }

    // Show response
    function showResponse(response) {
        if (!outputArea) return;
        outputArea.innerHTML = `<div class="response">${escapeHtml(response)}</div>`;
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function handleProviderStatus(status, message) {
        if (status === 'connected') {
            setStatus('Connected');
            if (message && outputArea) {
                outputArea.innerHTML = `<div class="response">${escapeHtml(message)}</div>`;
            }
        } else if (status === 'error') {
            setStatus('Error');
            if (message && outputArea) {
                outputArea.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
            }
        }
    }

    function checkProvider(provider) {
        vscode.postMessage({ command: 'checkProvider', provider });
    }

    function renderMcp(data) {
        if (!mcpContainer) return;
        
        if (!data || !Array.isArray(data.servers)) {
            mcpContainer.innerHTML = '<div class="error">No MCP data</div>';
            return;
        }
        
        if (data.servers.length === 0) {
            mcpContainer.innerHTML = '<div class="loading">No servers configured. Ensure .vscode/mcp.json exists.</div>';
            return;
        }
        
        const frag = document.createDocumentFragment();
        data.servers.forEach((srv, idx) => {
            const serverEl = document.createElement('div');
            serverEl.className = 'mcp-server';

            const header = document.createElement('div');
            header.className = 'mcp-server-header';
            const title = document.createElement('div');
            title.className = 'mcp-server-title';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = srv.name || `server-${idx + 1}`;
            const statusSpan = document.createElement('span');
            statusSpan.className = 'mcp-status';
            statusSpan.textContent = srv.status === 'active' ? '🟢 active' : '🔴 failed';
            title.appendChild(nameSpan);
            title.appendChild(statusSpan);
            header.appendChild(title);

            serverEl.appendChild(header);

            const toolsEl = document.createElement('div');
            toolsEl.className = 'mcp-tools';
            
            if (srv.status !== 'active') {
                toolsEl.innerHTML = `<div class="error">${escapeHtml(srv.message || 'Failed to connect')}</div>`;
            } else if (!srv.tools || srv.tools.length === 0) {
                toolsEl.innerHTML = '<div class="loading">No tools available</div>';
            } else {
                srv.tools.forEach((tool) => {
                    const toolEl = document.createElement('div');
                    toolEl.className = 'mcp-tool';
                    
                    const toolInfo = document.createElement('div');
                    toolInfo.className = 'mcp-tool-info';
                    toolInfo.innerHTML = `<strong>${escapeHtml(tool.name)}</strong>${tool.description ? ' — ' + escapeHtml(tool.description) : ''}`;
                    
                    // Add execute button for filesystem tools
                    if (tool.name.includes('write') || tool.name.includes('create') || tool.name.includes('file')) {
                        const executeBtn = document.createElement('button');
                        executeBtn.className = 'mcp-tool-btn';
                        executeBtn.textContent = 'Execute';
                        executeBtn.onclick = () => executeTool(srv.name, tool.name);
                        toolInfo.appendChild(executeBtn);
                    }
                    
                    toolEl.appendChild(toolInfo);
                    toolsEl.appendChild(toolEl);
                });
            }

            serverEl.appendChild(toolsEl);
            frag.appendChild(serverEl);
        });
        
        mcpContainer.innerHTML = '';
        mcpContainer.appendChild(frag);
    }

    function executeTool(serverName, toolName) {
        // For file operations, prompt for basic parameters
        if (toolName.includes('write') || toolName.includes('create')) {
            const fileName = prompt('Enter file name:', 'example.md');
            const content = prompt('Enter file content:', '# Example Content');
            
            if (fileName && content) {
                vscode.postMessage({
                    command: 'executeMcpTool',
                    serverName: serverName,
                    toolName: toolName,
                    arguments: {
                        path: fileName,
                        content: content
                    }
                });
            }
        } else {
            // For other tools, execute with minimal parameters
            vscode.postMessage({
                command: 'executeMcpTool',
                serverName: serverName,
                toolName: toolName,
                arguments: {}
            });
        }
    }

    // Initialize
    function init() {
        // Focus on prompt textarea
        if (promptTextarea) {
            promptTextarea.focus();
        }
        
        // Set initial status
        setStatus('Inactive');
        
        if (providerSelect) {
            checkProvider(providerSelect.value);
        }
    }

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();