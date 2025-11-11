(function() {
    'use strict';

    const vscode = acquireVsCodeApi();

    // State
    let currentTheme = 'dark';

    // Initialize when DOM is ready
    function init() {
        console.log('Initializing LLM Control Panel...');
        
        // Set up event delegation for all buttons FIRST (before collapsible sections)
        setupEventDelegation();
        
        // Initialize collapsible sections (after button handlers)
        initCollapsibleSections();
        
        // Initialize theme
        initTheme();
        
        // Initialize default states
        setStatus('Inactive');
        checkProvider();
        
        // Request initial state
        vscode.postMessage({ command: 'getProjectState' });
        vscode.postMessage({ command: 'getTheme' });
        
        console.log('LLM Control Panel initialized');
    }

    // Event delegation - handles all button clicks
    function setupEventDelegation() {
        // Use a single event delegation handler for ALL buttons
        document.addEventListener('click', function(e) {
            // Find the button that was clicked (could be the button itself or a child element)
            let button = e.target;
            if (button.tagName !== 'BUTTON') {
                button = e.target.closest('button');
            }
            if (!button || button.tagName !== 'BUTTON') return;

            // Stop propagation to prevent collapsible section handler from interfering
            e.stopPropagation();

            const id = button.id;
            const className = button.className || '';
            const dataStep = button.dataset.step;

            console.log('Button clicked:', id, className, dataStep);

            // Handle by ID first
            try {
                switch(id) {
                    case 'themeToggle':
                        if (typeof handleThemeToggle === 'function') {
                            handleThemeToggle();
                        } else {
                            console.error('handleThemeToggle is not defined');
                        }
                        return;
                    case 'sendBtn':
                        if (typeof handleSendPrompt === 'function') {
                            handleSendPrompt();
                        } else {
                            console.error('handleSendPrompt is not defined');
                        }
                        return;
                    case 'configureBtn':
                        if (typeof handleConfigure === 'function') {
                            handleConfigure();
                        } else {
                            console.error('handleConfigure is not defined');
                        }
                        return;
                    case 'createPlanBtn':
                        if (typeof handleCreatePlan === 'function') {
                            handleCreatePlan();
                        } else {
                            console.error('handleCreatePlan is not defined');
                        }
                        return;
                    case 'configurePromptBtn':
                        vscode.postMessage({ command: 'openCustomPromptSettings' });
                        return;
                    case 'clearPrompt':
                        if (typeof handleClearPrompt === 'function') {
                            handleClearPrompt();
                        } else {
                            console.error('handleClearPrompt is not defined');
                        }
                        return;
                    case 'generateCharterBtn':
                        if (typeof handleGenerateCharter === 'function') {
                            handleGenerateCharter();
                        } else {
                            console.error('handleGenerateCharter is not defined');
                        }
                        return;
                    case 'generatePRDBtn':
                        if (typeof handleGeneratePRD === 'function') {
                            handleGeneratePRD();
                        } else {
                            console.error('handleGeneratePRD is not defined');
                        }
                        return;
                    case 'viewVersionsBtn':
                        vscode.postMessage({ command: 'getVersionHistory' });
                        return;
                    case 'createVersionBtn':
                        if (typeof handleCreateVersion === 'function') {
                            handleCreateVersion();
                        } else {
                            console.error('handleCreateVersion is not defined');
                        }
                        return;
                    case 'exportProjectBtn':
                        showCharterStatus('Exporting project data...', 'loading');
                        vscode.postMessage({ command: 'exportProjectData' });
                        return;
                    case 'importProjectBtn':
                        if (typeof handleImportProject === 'function') {
                            handleImportProject();
                        } else {
                            console.error('handleImportProject is not defined');
                        }
                        return;
                    case 'generateStepsBtn':
                        if (typeof handleGenerateWorkflowSteps === 'function') {
                            handleGenerateWorkflowSteps();
                        } else {
                            console.error('handleGenerateWorkflowSteps is not defined');
                        }
                        return;
                    case 'refineCharterBtn':
                        if (typeof handleRefineCharter === 'function') {
                            handleRefineCharter();
                        } else {
                            console.error('handleRefineCharter is not defined');
                        }
                        return;
                    case 'expandCharterBtn':
                        if (typeof handleExpandCharter === 'function') {
                            handleExpandCharter();
                        } else {
                            console.error('handleExpandCharter is not defined');
                        }
                        return;
                    case 'saveFileBtn':
                        if (typeof handleSaveFile === 'function') {
                            handleSaveFile();
                        } else {
                            console.error('handleSaveFile is not defined');
                        }
                        return;
                    case 'showLogsBtn':
                        if (typeof handleShowLogs === 'function') {
                            handleShowLogs();
                        } else {
                            console.error('handleShowLogs is not defined');
                        }
                        return;
                    case 'testBtn':
                        if (typeof handleTestConnection === 'function') {
                            handleTestConnection();
                        } else {
                            console.error('handleTestConnection is not defined');
                        }
                        return;
                }
            } catch (error) {
                console.error('Error in button handler:', error);
                showError('Error: ' + error.message);
            }

            // Handle dynamically created workflow artifact buttons by class/data
            if (className.includes('generate-artifact-btn') || dataStep !== undefined) {
                const step = parseInt(dataStep);
                if (!isNaN(step)) {
                    try {
                        handleGenerateArtifact(step);
                    } catch (error) {
                        console.error('Error handling workflow button:', error);
                        showError('Error: ' + error.message);
                    }
                }
            }
        }, true); // Use capture phase to handle before other listeners

        // Provider change
        const providerSelect = document.getElementById('provider');
        if (providerSelect) {
            providerSelect.addEventListener('change', function() {
                checkProvider();
            });
        }

        // Project complexity change - regenerate steps when complexity changes
        const complexitySelect = document.getElementById('projectComplexity');
        if (complexitySelect) {
            complexitySelect.addEventListener('change', function(e) {
                const complexity = e.target.value;
                vscode.postMessage({
                    command: 'setProjectComplexity',
                    complexity: complexity
                });
                
                // Clear existing steps and show message
                const workflowSteps = document.getElementById('workflowSteps');
                const stepCount = document.getElementById('workflowStepCount');
                if (workflowSteps) {
                    workflowSteps.innerHTML = '<div class="workflow-empty"><p>Complexity changed. Click "Generate Workflow Steps" to create a new workflow for ' + complexity + ' complexity.</p></div>';
                }
                if (stepCount) {
                    stepCount.textContent = '';
                }
            });
        }
    }

    // Collapsible sections with auto-scaling
    function initCollapsibleSections() {
        // Function to expand a section properly
        function expandSection(content) {
            if (!content) return;
            const header = content.previousElementSibling;
            if (!header) return;
            
            header.classList.add('expanded');
            content.style.display = 'block';
            // Use a very large max-height to accommodate any content
            content.style.maxHeight = '50000px';
            content.style.padding = '16px';
            
            const toggle = header.querySelector('.section-toggle');
            if (toggle) toggle.textContent = '▲';
        }
        
        // Function to collapse a section
        function collapseSection(content) {
            if (!content) return;
            const header = content.previousElementSibling;
            if (!header) return;
            
            header.classList.remove('expanded');
            content.style.maxHeight = '0';
            content.style.padding = '0 16px';
            
            const toggle = header.querySelector('.section-toggle');
            if (toggle) toggle.textContent = '▼';
        }

        // Use bubble phase (default) so button handler (capture) runs first
        document.addEventListener('click', function(e) {
            // Don't handle if clicking on a button or inside a button
            const clickedButton = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
            if (clickedButton) {
                return; // Button handler already processed this
            }
            
            const header = e.target.closest('.section-header');
            if (!header) return;

            const targetId = header.dataset.target;
            if (!targetId) return;

            const content = document.getElementById(targetId);
            if (!content) return;

            const isExpanded = header.classList.contains('expanded');

            if (isExpanded) {
                collapseSection(content);
            } else {
                expandSection(content);
            }
        });

        // Initialize expanded sections
        const expandedSections = ['providerContent', 'promptResponseContent'];
        expandedSections.forEach(id => {
            const content = document.getElementById(id);
            if (content) {
                expandSection(content);
            }
        });

        // Observer to ensure content stays visible when changed
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                    const target = mutation.target;
                    // Check if target is a section-content or within one
                    const sectionContent = target.closest('.section-content') || 
                                          (target.classList && target.classList.contains('section-content') ? target : null);
                    
                    if (sectionContent) {
                        const header = sectionContent.previousElementSibling;
                        if (header && header.classList.contains('expanded')) {
                            // Ensure it stays expanded with large max-height
                            sectionContent.style.maxHeight = '50000px';
                            sectionContent.style.display = 'block';
                        }
                    }
                }
            });
        });

        // Observe all section contents and their children
        document.querySelectorAll('.section-content').forEach(content => {
            observer.observe(content, {
                childList: true,
                subtree: true,
                attributes: false,
                attributeFilter: []
            });
        });
    }

    // Theme functions
    function initTheme() {
        // Will be set by message from extension
    }

    function handleThemeToggle() {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', currentTheme);
        
        const icon = document.querySelector('#themeToggle .theme-icon');
        if (icon) {
            icon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
        }
        
        vscode.postMessage({
            command: 'setTheme',
            theme: currentTheme
        });
    }

    // Basic handlers
    function handleSendPrompt() {
        const prompt = document.getElementById('prompt')?.value.trim();
        const provider = document.getElementById('provider')?.value;

        if (!prompt) {
            showError('Please enter a prompt');
            return;
        }

        setStatus('Active');
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;

        const output = document.getElementById('output');
        if (output) output.innerHTML = '<div class="loading">Processing...</div>';

        vscode.postMessage({
            command: 'sendPrompt',
            provider: provider,
            prompt: prompt
        });
    }

    function handleConfigure() {
        vscode.postMessage({ command: 'openSettings' });
    }

    function checkProvider() {
        const provider = document.getElementById('provider')?.value;
        if (provider) {
            vscode.postMessage({ command: 'checkProvider', provider });
        }
    }

    function setStatus(status) {
        const indicator = document.getElementById('statusIndicator');
        if (!indicator) return;

        indicator.textContent = status;
        indicator.className = 'status-badge';
        
        if (status === 'Active') {
            indicator.classList.add('status-active');
        } else if (status === 'Connected') {
            indicator.classList.add('status-connected');
        } else if (status === 'Error') {
            indicator.classList.add('status-error');
        } else {
            indicator.classList.add('status-inactive');
        }
    }

    // Plan creation
    function handleCreatePlan() {
        const prompt = document.getElementById('prompt')?.value.trim();
        const provider = document.getElementById('provider')?.value;

        if (!prompt) {
            showPlanStatus('Please enter a description for your plan in the prompt field above', 'error');
            return;
        }

        showPlanStatus('Creating plan document...', 'loading');
        const btn = document.getElementById('createPlanBtn');
        if (btn) btn.disabled = true;

        vscode.postMessage({
            command: 'createPlanWithPrompt',
            provider: provider,
            prompt: prompt
        });
    }

    function handleClearPrompt() {
        const section = document.getElementById('promptStepSection');
        const content = document.getElementById('promptStepContent');
        
        if (content) {
            content.innerHTML = '<div class="prompt-step-empty">No prompt generated yet. Click "Convert to Prompt" on a bullet point in a Markdown file.</div><button id="clearPrompt" class="btn btn-secondary btn-sm">Clear</button>';
        }
        
        if (section) {
            setTimeout(() => {
                section.style.display = 'none';
            }, 300);
        }
    }

    // Project Charter handlers
    function handleGenerateCharter() {
        const requirements = document.getElementById('projectRequirements')?.value.trim();
        const complexity = document.getElementById('projectComplexity')?.value || 'lite';
        const provider = document.getElementById('provider')?.value || 'openai';

        if (!requirements) {
            showCharterStatus('Please enter project requirements', 'error');
            return;
        }

        showCharterStatus('Generating project charter...', 'loading');
        vscode.postMessage({
            command: 'generateProjectCharter',
            complexity: complexity,
            requirements: requirements,
            provider: provider
        });
    }

    function handleGeneratePRD() {
        const requirements = document.getElementById('projectRequirements')?.value.trim();
        const complexity = document.getElementById('projectComplexity')?.value || 'lite';
        const provider = document.getElementById('provider')?.value || 'openai';

        if (!requirements) {
            showCharterStatus('Please enter project requirements', 'error');
            return;
        }

        showCharterStatus('Generating PRD...', 'loading');
        vscode.postMessage({
            command: 'generatePRD',
            complexity: complexity,
            projectData: { requirements: requirements },
            provider: provider
        });
    }

    // Charter AI Assistant handlers
    function handleGenerateWorkflowSteps() {
        const requirements = document.getElementById('projectRequirements')?.value.trim();
        const complexity = document.getElementById('projectComplexity')?.value || 'lite';
        const provider = document.getElementById('provider')?.value || 'openai';

        if (!requirements) {
            showCharterAiStatus('Please enter project requirements first', 'error');
            return;
        }

        showCharterAiStatus('Generating workflow steps based on complexity...', 'loading');
        vscode.postMessage({
            command: 'generateWorkflowSteps',
            complexity: complexity,
            requirements: requirements,
            provider: provider
        });
    }

    function handleRefineCharter() {
        const requirements = document.getElementById('projectRequirements')?.value.trim();
        const complexity = document.getElementById('projectComplexity')?.value || 'lite';
        const provider = document.getElementById('provider')?.value || 'openai';

        if (!requirements) {
            showCharterAiStatus('Please enter project requirements first', 'error');
            return;
        }

        showCharterAiStatus('Refining charter...', 'loading');
        vscode.postMessage({
            command: 'refineCharter',
            complexity: complexity,
            requirements: requirements,
            provider: provider
        });
    }

    function handleExpandCharter() {
        const requirements = document.getElementById('projectRequirements')?.value.trim();
        const complexity = document.getElementById('projectComplexity')?.value || 'lite';
        const provider = document.getElementById('provider')?.value || 'openai';

        if (!requirements) {
            showCharterAiStatus('Please enter project requirements first', 'error');
            return;
        }

        showCharterAiStatus('Expanding charter...', 'loading');
        vscode.postMessage({
            command: 'expandCharter',
            complexity: complexity,
            requirements: requirements,
            provider: provider
        });
    }

    function handleGenerateArtifact(step) {
        const requirements = document.getElementById('projectRequirements')?.value.trim();
        const provider = document.getElementById('provider')?.value || 'openai';

        if (!requirements) {
            showCharterStatus('Please enter project requirements first', 'error');
            return;
        }

        showCharterStatus(`Generating artifact for step ${step + 1}...`, 'loading');
        vscode.postMessage({
            command: 'generateArtifacts',
            workflowStep: step,
            projectData: { requirements: requirements },
            provider: provider
        });
    }

    function renderWorkflowSteps(steps) {
        const workflowSteps = document.getElementById('workflowSteps');
        const stepCount = document.getElementById('workflowStepCount');
        const workflowContent = document.getElementById('workflowContent');
        const workflowHeader = workflowContent?.previousElementSibling;
        
        if (!workflowSteps) return;

        if (!steps || steps.length === 0) {
            workflowSteps.innerHTML = '<div class="workflow-empty"><p>No workflow steps generated. Click "Generate Workflow Steps" to create a workflow.</p></div>';
            if (stepCount) stepCount.textContent = '';
            return;
        }

        let html = '';
        steps.forEach((step, index) => {
            html += `
                <div class="workflow-step" data-step="${index}">
                    <span class="step-number">${index + 1}</span>
                    <span class="step-name">${escapeHtml(step.name)}</span>
                    <button class="btn btn-sm btn-primary generate-artifact-btn" data-step="${index}">Generate</button>
                </div>
            `;
        });

        workflowSteps.innerHTML = html;
        
        if (stepCount) {
            stepCount.textContent = `${steps.length} step${steps.length !== 1 ? 's' : ''}`;
        }

        // Ensure workflow section is expanded and auto-scaled
        if (workflowContent && workflowHeader) {
            workflowHeader.classList.add('expanded');
            workflowContent.style.display = 'block';
            workflowContent.style.maxHeight = '50000px';
            workflowContent.style.padding = '16px';
            const toggle = workflowHeader.querySelector('.section-toggle');
            if (toggle) toggle.textContent = '▲';
        }
    }

    function showCharterAiStatus(message, type) {
        const status = document.getElementById('charterAiStatus');
        if (status) {
            status.innerHTML = `<div class="${type}">${escapeHtml(message)}</div>`;
            if (type === 'success') {
                setTimeout(() => { status.innerHTML = ''; }, 5000);
            }
        }
    }

    function handleCreateVersion() {
        const description = prompt('Enter version description:', 'Manual version');
        if (description) {
            vscode.postMessage({
                command: 'createVersion',
                changes: { type: 'manual', description: description },
                description: description
            });
        }
    }

    function handleImportProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        showCharterStatus('Importing project data...', 'loading');
                        vscode.postMessage({
                            command: 'importProjectData',
                            data: data
                        });
                    } catch (error) {
                        showCharterStatus('Invalid JSON file', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    // File Writer handlers
    function handleSaveFile() {
        const filePath = document.getElementById('filePath')?.value.trim();
        const mode = document.getElementById('fileMode')?.value || 'create';
        const content = document.getElementById('fileContent')?.value || '';

        if (!filePath) {
            setFileStatus('Please enter a file path', 'error');
            return;
        }

        setFileStatus('Saving...', 'loading');
        vscode.postMessage({
            command: 'saveFile',
            filePath: filePath,
            content: content,
            mode: mode
        });
    }

    function handleShowLogs() {
        const logs = document.getElementById('fileLogs');
        const btn = document.getElementById('showLogsBtn');
        
        if (logs && btn) {
            if (logs.classList.contains('hidden')) {
                vscode.postMessage({ command: 'getFileLogs' });
            }
            logs.classList.toggle('hidden');
            btn.textContent = logs.classList.contains('hidden') ? 'Show Logs' : 'Hide Logs';
        }
    }

    function handleTestConnection() {
        setFileStatus('Testing connection...', 'loading');
        vscode.postMessage({ command: 'testConnection', message: 'Hello from webview!' });
    }

    // Status display functions
    function showError(message) {
        const output = document.getElementById('output');
        if (output) {
            output.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
        }
    }

    function showResponse(response) {
        const output = document.getElementById('output');
        if (output) {
            const processed = processResponseForBulletPoints(response);
            output.innerHTML = `<div class="response">${processed}</div>`;
            addCopilotButtonListeners();
        }
    }

    function showPlanStatus(message, type) {
        const status = document.getElementById('planStatus');
        if (status) {
            status.innerHTML = `<div class="${type}">${escapeHtml(message)}</div>`;
            if (type === 'success') {
                setTimeout(() => { status.innerHTML = ''; }, 5000);
            }
        }
    }

    function showCharterStatus(message, type) {
        const status = document.getElementById('charterStatus');
        if (status) {
            status.innerHTML = `<div class="${type}">${escapeHtml(message)}</div>`;
            if (type === 'success') {
                setTimeout(() => { status.innerHTML = ''; }, 5000);
            }
        }
    }

    function setFileStatus(message, type) {
        const status = document.getElementById('fileStatus');
        if (status) {
            status.innerHTML = `<div class="${type}">${escapeHtml(message)}</div>`;
        }
    }

    // Utility functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function processResponseForBulletPoints(response) {
        const lines = response.split('\n');
        const processed = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(\s*)([-*•]|\d+\.)\s+(.+)$/);
            
            if (match) {
                const [, indent, marker, content] = match;
                const bulletId = `bullet_${Date.now()}_${i}`;
                processed.push(`
                    <div class="interactive-bullet" data-bullet-id="${bulletId}">
                        <div class="bullet-content">${escapeHtml(indent + marker + ' ' + content)}</div>
                        <button class="copilot-btn" data-bullet-point="${escapeHtml(content.trim())}">🤖 Use with Copilot</button>
                    </div>
                `);
            } else {
                processed.push(escapeHtml(line));
            }
        }
        
        return processed.join('\n');
    }

    function addCopilotButtonListeners() {
        document.querySelectorAll('.copilot-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const bulletPoint = this.dataset.bulletPoint;
                if (bulletPoint) {
                    this.textContent = '⏳ Creating prompt...';
                    this.disabled = true;
                    vscode.postMessage({
                        command: 'useWithCopilot',
                        bulletPoint: bulletPoint,
                        context: ''
                    });
                    setTimeout(() => {
                        this.textContent = '🤖 Use with Copilot';
                        this.disabled = false;
                    }, 3000);
                }
            });
        });
    }

    // Message handler
    window.addEventListener('message', function(event) {
        const message = event.data;
        console.log('Received message:', message.command);

        switch (message.command) {
            case 'extensionReady':
                setStatus('Connected');
                break;
            case 'testResponse':
                setFileStatus('Connection test successful: ' + message.message, 'success');
                break;
            case 'promptResponse':
                setStatus('Inactive');
                const sendBtn = document.getElementById('sendBtn');
                if (sendBtn) sendBtn.disabled = false;
                if (message.error) {
                    showError(message.error);
                } else {
                    showResponse(message.response);
                }
                break;
            case 'providerStatus':
                if (message.status === 'connected') {
                    setStatus('Connected');
                } else if (message.status === 'error') {
                    setStatus('Error');
                }
                break;
            case 'fileSaved':
                if (message.ok) {
                    setFileStatus(`Saved: ${message.path}`, 'success');
                } else {
                    setFileStatus(`Save failed: ${message.error}`, 'error');
                }
                break;
            case 'logs':
                const logs = document.getElementById('fileLogs');
                if (logs) {
                    logs.textContent = message.text || '';
                }
                break;
            case 'planCreated':
                const createPlanBtn = document.getElementById('createPlanBtn');
                if (createPlanBtn) createPlanBtn.disabled = false;
                if (message.error) {
                    showPlanStatus(`Failed: ${message.error}`, 'error');
                } else {
                    showPlanStatus(`Plan created: ${message.fileName}`, 'success');
                    showResponse(`Plan document saved as: ${message.fileName}\n\n${message.content}`);
                }
                break;
            case 'charterGenerated':
                if (message.error) {
                    showCharterStatus(`Failed: ${message.error}`, 'error');
                } else {
                    showCharterStatus(`Charter generated! Version: ${message.versionId}`, 'success');
                    showResponse(message.content);
                }
                break;
            case 'prdGenerated':
                if (message.error) {
                    showCharterStatus(`Failed: ${message.error}`, 'error');
                } else {
                    showCharterStatus(`PRD generated! Version: ${message.versionId}`, 'success');
                    showResponse(message.content);
                }
                break;
            case 'artifactGenerated':
                if (message.error) {
                    showCharterStatus(`Failed: ${message.error}`, 'error');
                } else {
                    showCharterStatus(`Artifact generated: ${message.artifact.name}`, 'success');
                    showResponse(`<h4>${escapeHtml(message.artifact.name)}</h4>${escapeHtml(message.artifact.content)}`);
                }
                break;
            case 'workflowStepsGenerated':
                if (message.error) {
                    showCharterAiStatus(`Failed to generate workflow steps: ${message.error}`, 'error');
                } else {
                    showCharterAiStatus(`Generated ${message.steps.length} workflow steps for ${message.complexity} complexity`, 'success');
                    renderWorkflowSteps(message.steps);
                    // Store steps for artifact generation
                    window.currentWorkflowSteps = message.steps;
                }
                break;
            case 'charterRefined':
                if (message.error) {
                    showCharterAiStatus(`Failed to refine charter: ${message.error}`, 'error');
                } else {
                    showCharterAiStatus('Charter refined successfully', 'success');
                    showResponse(message.content);
                    // Update requirements if refinement includes updates
                    if (message.updatedRequirements) {
                        const reqTextarea = document.getElementById('projectRequirements');
                        if (reqTextarea) {
                            reqTextarea.value = message.updatedRequirements;
                        }
                    }
                }
                break;
            case 'charterExpanded':
                if (message.error) {
                    showCharterAiStatus(`Failed to expand charter: ${message.error}`, 'error');
                } else {
                    showCharterAiStatus('Charter expanded successfully', 'success');
                    showResponse(message.content);
                    // Update requirements if expansion includes updates
                    if (message.updatedRequirements) {
                        const reqTextarea = document.getElementById('projectRequirements');
                        if (reqTextarea) {
                            reqTextarea.value = message.updatedRequirements;
                        }
                    }
                }
                break;
            case 'versionCreated':
                showCharterStatus(`Version created: ${message.version.id}`, 'success');
                break;
            case 'versionHistory':
                handleVersionHistory(message.versions, message.currentVersion);
                break;
            case 'versionRestored':
                showCharterStatus(`Restored to version: ${message.version.id}`, 'success');
                break;
            case 'versionDiff':
                handleVersionDiff(message.versionId, message.diff, message.version, message.error);
                break;
            case 'projectState':
                if (message.state && message.state.projectComplexity) {
                    const complexity = document.getElementById('projectComplexity');
                    if (complexity) complexity.value = message.state.projectComplexity;
                }
                // Load workflow steps if they exist
                if (message.state && message.state.workflowSteps) {
                    renderWorkflowSteps(message.state.workflowSteps);
                    window.currentWorkflowSteps = message.state.workflowSteps;
                }
                break;
            case 'projectDataExported':
                if (message.error) {
                    showCharterStatus(`Export failed: ${message.error}`, 'error');
                } else {
                    showCharterStatus(`Exported: ${message.fileName}`, 'success');
                }
                break;
            case 'projectDataImported':
                if (message.error) {
                    showCharterStatus(`Import failed: ${message.error}`, 'error');
                } else {
                    showCharterStatus('Project imported successfully!', 'success');
                    vscode.postMessage({ command: 'getProjectState' });
                }
                break;
            case 'copilotPromptCreated':
                handleCopilotPromptCreated(message.success, message.bulletPoint, message.response, message.error, message.lineNumber);
                break;
            case 'themeChanged':
                if (message.theme) {
                    currentTheme = message.theme;
                    document.body.setAttribute('data-theme', currentTheme);
                    const icon = document.querySelector('#themeToggle .theme-icon');
                    if (icon) {
                        icon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
                    }
                }
                break;
        }
    });

    function handleCopilotPromptCreated(success, bulletPoint, response, error, lineNumber) {
        const section = document.getElementById('promptStepSection');
        const content = document.getElementById('promptStepContent');
        
        if (!section || !content) return;
        
        section.style.display = 'block';
        
        // Expand the section
        const header = section.querySelector('.section-header');
        if (header && !header.classList.contains('expanded')) {
            header.classList.add('expanded');
            content.style.maxHeight = content.scrollHeight + 'px';
            const toggle = header.querySelector('.section-toggle');
            if (toggle) toggle.textContent = '▲';
        }
        
        const timestamp = new Date().toLocaleTimeString();
        if (success) {
            content.innerHTML = `
                <div class="prompt-step-result success">
                    <div class="prompt-step-header">
                        <span class="prompt-step-status">✅ Success</span>
                        <span class="prompt-step-time">${timestamp}</span>
                    </div>
                    <div class="prompt-step-bullet">
                        <strong>Bullet Point:</strong> ${escapeHtml(bulletPoint)}
                        ${lineNumber ? `<span class="prompt-step-line"> (Line ${lineNumber})</span>` : ''}
                    </div>
                    <div class="prompt-step-response">
                        <strong>LLM Response:</strong>
                        <div class="prompt-step-response-content">${escapeHtml(response || 'No response')}</div>
                    </div>
                </div>
                <button id="clearPrompt" class="btn btn-secondary btn-sm">Clear</button>
            `;
        } else {
            content.innerHTML = `
                <div class="prompt-step-result error">
                    <div class="prompt-step-header">
                        <span class="prompt-step-status">❌ Error</span>
                        <span class="prompt-step-time">${timestamp}</span>
                    </div>
                    <div class="prompt-step-bullet">
                        <strong>Bullet Point:</strong> ${escapeHtml(bulletPoint)}
                    </div>
                    <div class="prompt-step-error">
                        <strong>Error:</strong> ${escapeHtml(error || 'Unknown error')}
                    </div>
                </div>
                <button id="clearPrompt" class="btn btn-secondary btn-sm">Clear</button>
            `;
        }
        
        section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function handleVersionHistory(versions, currentVersion) {
        const history = document.getElementById('versionHistory');
        if (!history) return;
        
        if (versions.length === 0) {
            history.innerHTML = '<div class="loading">No versions found</div>';
            history.classList.remove('hidden');
            return;
        }
        
        let html = '<div class="version-list">';
        versions.forEach(version => {
            const isCurrent = version.id === currentVersion;
            html += `
                <div class="version-item ${isCurrent ? 'current' : ''}">
                    <div class="version-header">
                        <span class="version-id">${version.id}</span>
                        <span class="version-date">${new Date(version.timestamp).toLocaleString()}</span>
                        ${isCurrent ? '<span class="current-badge">Current</span>' : ''}
                    </div>
                    <div class="version-description">${escapeHtml(version.description)}</div>
                    <div class="version-actions">
                        <button class="btn btn-sm btn-secondary restore-version-btn" data-version-id="${version.id}">Restore</button>
                        <button class="btn btn-sm btn-secondary view-diff-btn" data-version-id="${version.id}">View Diff</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        history.innerHTML = html;
        history.classList.remove('hidden');
        
        // Add event listeners for version actions
        history.querySelectorAll('.restore-version-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                vscode.postMessage({
                    command: 'restoreVersion',
                    versionId: this.dataset.versionId
                });
            });
        });
        
        history.querySelectorAll('.view-diff-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                vscode.postMessage({
                    command: 'showVersionDiff',
                    versionId: this.dataset.versionId
                });
            });
        });
    }

    function handleVersionDiff(versionId, diff, version, error) {
        if (error) {
            showCharterStatus(`Failed to show diff: ${error}`, 'error');
            return;
        }
        
        const viewer = document.getElementById('versionDiffViewer');
        const content = document.getElementById('diffContent');
        if (!viewer || !content) return;
        
        let html = `<h6>Version ${versionId} - ${escapeHtml(version.description)}</h6>`;
        
        if (diff.added && diff.added.length > 0) {
            html += `<div class="diff-section"><h6>Added Files (${diff.added.length})</h6>`;
            diff.added.forEach(file => {
                html += `<div class="diff-file added"><strong>+ ${escapeHtml(file.path)}</strong></div>`;
            });
            html += '</div>';
        }
        
        if (diff.modified && diff.modified.length > 0) {
            html += `<div class="diff-section"><h6>Modified Files (${diff.modified.length})</h6>`;
            diff.modified.forEach(file => {
                html += `<div class="diff-file modified"><strong>~ ${escapeHtml(file.path)}</strong></div>`;
            });
            html += '</div>';
        }
        
        if (diff.deleted && diff.deleted.length > 0) {
            html += `<div class="diff-section"><h6>Deleted Files (${diff.deleted.length})</h6>`;
            diff.deleted.forEach(file => {
                html += `<div class="diff-file deleted"><strong>- ${escapeHtml(file.path)}</strong></div>`;
            });
            html += '</div>';
        }
        
        if ((!diff.added || diff.added.length === 0) && 
            (!diff.modified || diff.modified.length === 0) && 
            (!diff.deleted || diff.deleted.length === 0)) {
            html += '<div class="no-changes">No changes detected</div>';
        }
        
        content.innerHTML = html;
        viewer.classList.remove('hidden');
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
