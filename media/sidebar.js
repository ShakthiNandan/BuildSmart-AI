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
    const mcpRefreshBtn = document.getElementById('mcpRefreshBtn');
    const mcpLogsBtn = document.getElementById('mcpLogsBtn');
    const mcpDebugBtn = document.getElementById('mcpDebugBtn');
    const mcpContainer = document.getElementById('mcpContainer');
    const mcpLogs = document.getElementById('mcpLogs');

    // Event listeners
    sendBtn.addEventListener('click', handleSendPrompt);
    configureBtn.addEventListener('click', handleConfigure);
    providerSelect.addEventListener('change', () => checkProvider(providerSelect.value));
    mcpRefreshBtn.addEventListener('click', () => {
        mcpContainer.innerHTML = '<div class="loading">Refreshing MCP...</div>';
        vscode.postMessage({ command: 'refreshMcp' });
    });
    mcpLogsBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'getLogs' });
        mcpLogs.classList.toggle('hidden');
    });
    mcpDebugBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'debugMcp' });
        mcpLogs.classList.remove('hidden');
    });

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

        switch (message.command) {
            case 'promptResponse':
                handlePromptResponse(message.response, message.error);
                break;
            case 'providerStatus':
                handleProviderStatus(message.status, message.message);
                break;
            case 'mcpData':
                renderMcp(message.data);
                break;
            case 'logs':
                mcpLogs.textContent = message.text || '';
                break;
        }
    });

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

    // Show error message
    function showError(message) {
        outputArea.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
    }

    // Show response
    function showResponse(response) {
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
            if (message) {
                outputArea.innerHTML = `<div class="response">${escapeHtml(message)}</div>`;
            }
        } else if (status === 'error') {
            setStatus('Error');
            if (message) {
                outputArea.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
            }
        }
    }

    function checkProvider(provider) {
        vscode.postMessage({ command: 'checkProvider', provider });
    }

    function renderMcp(data) {
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
                srv.tools.forEach((t) => {
                    const tEl = document.createElement('div');
                    tEl.className = 'mcp-tool';
                    tEl.innerHTML = `<strong>${escapeHtml(t.name)}</strong>${t.description ? ' — ' + escapeHtml(t.description) : ''}`;
                    toolsEl.appendChild(tEl);
                });
            }

            serverEl.appendChild(toolsEl);
            frag.appendChild(serverEl);
        });
        mcpContainer.innerHTML = '';
        mcpContainer.appendChild(frag);
    }

    // Initialize
    function init() {
        // Focus on prompt textarea
        promptTextarea.focus();
        
        // Set initial status
        setStatus('Inactive');
        checkProvider(providerSelect.value);
        vscode.postMessage({ command: 'loadMcp' });
    }

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(); 