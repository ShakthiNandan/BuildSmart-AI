const vscode = require('vscode');
const fetch = require('node-fetch');
const fs = require('fs');
const MarkdownCodeLensProvider = require('./providers/markdownCodeLensProvider');

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

    // Register Markdown CodeLens provider
    const codeLensProvider = new MarkdownCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown', scheme: 'file' },
            codeLensProvider
        )
    );

    // Command to convert bullet point to prompt using Ollama
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.convertToPrompt', async (bulletText, lineNumber) => {
            await convertBulletToPrompt(bulletText, lineNumber, provider);
        })
    );
    
    console.log('LLM Control Panel extension activated successfully');
}

/**
 * Convert a bullet point to a prompt by sending it to Ollama
 * @param {string} bulletText - The bullet point text
 * @param {number} lineNumber - The line number of the bullet point
 * @param {LLMPanelProvider} panelProvider - The LLM panel provider instance
 */
async function convertBulletToPrompt(bulletText, lineNumber, panelProvider) {
    try {
        vscode.window.showInformationMessage(`Converting bullet point: "${bulletText}"`);
        
        // Get Ollama configuration
        const config = vscode.workspace.getConfiguration('llmPanel');
        const ollamaUrl = config.get('ollamaUrl', 'http://localhost:11434');
        const ollamaModel = config.get('ollamaModel', 'gemma3-tools:12b');
        
        // Prepare the request to Ollama
        const requestBody = {
            model: ollamaModel,
            prompt: bulletText,
            stream: false
        };

        // Call Ollama API
        const response = await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Ollama API returned status ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        // Check if response contains the expected data
        if (!result.response) {
            throw new Error('Invalid response from Ollama API');
        }

        // Ensure the webview is visible before posting the message
        if (panelProvider && typeof panelProvider.ensureVisible === 'function') {
            await panelProvider.ensureVisible();
        }

        // Success - notify the webview
        if (panelProvider._view && panelProvider._view.webview) {
            panelProvider._view.webview.postMessage({
                command: 'copilotPromptCreated',
                success: true,
                bulletPoint: bulletText,
                response: result.response,
                lineNumber: lineNumber
            });
        }

        vscode.window.showInformationMessage(`✓ Successfully processed: "${bulletText}"`);
        
    } catch (error) {
        // Error - notify the webview
        if (panelProvider && typeof panelProvider.ensureVisible === 'function') {
            await panelProvider.ensureVisible();
        }
        if (panelProvider._view && panelProvider._view.webview) {
            panelProvider._view.webview.postMessage({
                command: 'copilotPromptCreated',
                success: false,
                bulletPoint: bulletText,
                error: error.message,
                lineNumber: lineNumber
            });
        }

        vscode.window.showErrorMessage(`Failed to process bullet point: ${error.message}`);
    }
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
        
        // Project Charter System State
        this._projectState = {
            currentVersion: null,
            versions: new Map(),
            projectComplexity: 'lite', // lite, advanced, pro
            artifacts: new Map(),
            workflowStep: 0
        };
        
        // Ensure Maps are always initialized
        if (!this._projectState.versions || !(this._projectState.versions instanceof Map)) {
            this._projectState.versions = new Map();
        }
        if (!this._projectState.artifacts || !(this._projectState.artifacts instanceof Map)) {
            this._projectState.artifacts = new Map();
        }
        this._ensureProjectStateIntegrity();
        
        // State persistence
        this._loadPersistedState();
    }

    // Reveal the LLM panel view container
    async reveal() {
        try {
            // Reveal the custom view container in the Activity Bar
            await vscode.commands.executeCommand('workbench.view.extension.llm-panel');
        } catch (e) {
            this._log(`Failed to reveal panel: ${e?.message || e}`);
        }
    }

    // Ensure the webview is created and visible before posting messages
    async ensureVisible(timeoutMs = 1500) {
        // Try to reveal the container
        await this.reveal();

        // If already available, return early
        if (this._view && this._view.webview) {
            return;
        }

        const start = Date.now();
        // Poll briefly until resolveWebviewView runs
        while ((!this._view || !this._view.webview) && (Date.now() - start) < timeoutMs) {
            await new Promise(r => setTimeout(r, 100));
        }
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
                    case 'openCustomPromptSettings':
                        console.log('Opening custom prompt settings...');
                        vscode.commands.executeCommand('workbench.action.openSettings', 'llmPanel.customProjectPrompt');
                        break;
                    case 'setProjectComplexity':
                        await this._setProjectComplexity(message.complexity);
                        break;
                    case 'generateProjectCharter':
                        await this._generateProjectCharter(message.complexity, message.requirements, message.provider);
                        break;
                    case 'generatePRD':
                        await this._generatePRD(message.projectData, message.complexity, message.provider);
                        break;
                    case 'createVersion':
                        await this._createVersion(message.changes, message.description);
                        break;
                    case 'getVersionHistory':
                        await this._getVersionHistory();
                        break;
                    case 'restoreVersion':
                        await this._restoreVersion(message.versionId);
                        break;
                    case 'showVersionDiff':
                        await this._showVersionDiff(message.versionId);
                        break;
                    case 'generateArtifacts':
                        await this._generateArtifacts(message.workflowStep, message.projectData, message.provider);
                        break;
                    case 'getProjectState':
                        await this._getProjectState();
                        break;
                    case 'exportProjectData':
                        await this._exportProjectData();
                        break;
                    case 'importProjectData':
                        await this._importProjectData(message.data);
                        break;
                    case 'useWithCopilot':
                        await this._useWithCopilot(message.bulletPoint, message.context);
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
        
        // Load and send project state
        this._getProjectState();
        
        // Load and send project state
        this._getProjectState();
        
        // Test logging
        this._log('Webview initialized and ready for communication');
        console.log('Webview is ready and extension is connected!');
    }

    // ==================== PROJECT CHARTER SYSTEM METHODS ====================
    
    async _loadPersistedState() {
        try {
            const savedState = this._context.workspaceState.get('llmPanel.projectState');
            if (savedState) {
                // Restore the basic state
                this._projectState.currentVersion = savedState.currentVersion;
                this._projectState.projectComplexity = savedState.projectComplexity;
                this._projectState.workflowStep = savedState.workflowStep;
                
                // Restore versions Map
                if (savedState.versions) {
                    this._projectState.versions = new Map(savedState.versions);
                }
                
                // Restore artifacts Map
                if (savedState.artifacts) {
                    this._projectState.artifacts = new Map(savedState.artifacts);
                }
                
                this._log('Project state loaded from persistence');
                this._ensureProjectStateIntegrity();
            }
        } catch (error) {
            this._error('Failed to load persisted state:', error);
        }
    }

    async _savePersistedState() {
        try {
            // Convert Maps to arrays for serialization
            const serializableState = {
                currentVersion: this._projectState.currentVersion,
                projectComplexity: this._projectState.projectComplexity,
                workflowStep: this._projectState.workflowStep,
                versions: Array.from(this._projectState.versions.entries()),
                artifacts: Array.from(this._projectState.artifacts.entries())
            };
            
            await this._context.workspaceState.update('llmPanel.projectState', serializableState);
            this._log('Project state saved to persistence');
        } catch (error) {
            this._error('Failed to save persisted state:', error);
        }
    }

    _ensureProjectStateIntegrity() {
        // Convert plain objects/arrays to Map if needed
        const v = this._projectState.versions;
        if (!(v instanceof Map)) {
            try {
                this._projectState.versions = new Map(Array.isArray(v) ? v : Object.entries(v || {}));
            } catch {
                this._projectState.versions = new Map();
            }
        }
        const a = this._projectState.artifacts;
        if (!(a instanceof Map)) {
            try {
                this._projectState.artifacts = new Map(Array.isArray(a) ? a : Object.entries(a || {}));
            } catch {
                this._projectState.artifacts = new Map();
            }
        }
    }

    async _setProjectComplexity(complexity) {
        this._projectState.projectComplexity = complexity;
        await this._savePersistedState();
        
        this._view.webview.postMessage({
            command: 'projectComplexitySet',
            complexity: complexity
        });
        
        this._log(`Project complexity set to: ${complexity}`);
    }

    async _generateProjectCharter(complexity, requirements, provider) {
        try {
            // Use the provider passed from the UI
            if (!provider) {
                const config = vscode.workspace.getConfiguration('llmPanel');
                provider = config.get('defaultProvider') || 'openai';
            }
            
            // Generate complexity-specific prompts
            const prompts = this._getComplexityPrompts(complexity);
            const enhancedPrompt = prompts.charter.replace('{requirements}', requirements);
            
            this._log(`Generating project charter for ${complexity} complexity`);
            
            const charterContent = await this._callLLM(provider, enhancedPrompt);

            // Save charter to workspace with contextual metadata
            await this._saveTextFileWithMeta(
                'charter',
                `charter_${complexity}`,
                requirements,
                charterContent,
                provider,
                complexity
            );
            
            // Create version
            const versionId = await this._createVersion({
                type: 'charter',
                content: charterContent,
                complexity: complexity
            }, `Generated ${complexity} project charter`);
            
            this._view.webview.postMessage({
                command: 'charterGenerated',
                content: charterContent,
                versionId: versionId,
                complexity: complexity
            });
            
        } catch (error) {
            this._error('Failed to generate project charter:', error);
            this._view.webview.postMessage({
                command: 'charterGenerated',
                error: error.message
            });
        }
    }

    async _generatePRD(projectData, complexity, provider) {
        try {
            // Use the provider passed from the UI
            if (!provider) {
                const config = vscode.workspace.getConfiguration('llmPanel');
                provider = config.get('defaultProvider') || 'openai';
            }
            
            const prompts = this._getComplexityPrompts(complexity);
            const enhancedPrompt = prompts.prd
                .replace('{projectData}', JSON.stringify(projectData, null, 2))
                .replace('{complexity}', complexity);
            
            this._log(`Generating PRD for ${complexity} complexity`);
            
            const prdContent = await this._callLLM(provider, enhancedPrompt);

            // Save PRD to workspace with contextual metadata
            await this._saveTextFileWithMeta(
                'prd',
                `prd_${complexity}`,
                (projectData && (projectData.requirements || projectData.title || 'project')),
                prdContent,
                provider,
                complexity
            );
            
            // Create version
            const versionId = await this._createVersion({
                type: 'prd',
                content: prdContent,
                complexity: complexity,
                projectData: projectData
            }, `Generated ${complexity} PRD`);
            
            this._view.webview.postMessage({
                command: 'prdGenerated',
                content: prdContent,
                versionId: versionId,
                complexity: complexity
            });
            
        } catch (error) {
            this._error('Failed to generate PRD:', error);
            this._view.webview.postMessage({
                command: 'prdGenerated',
                error: error.message
            });
        }
    }

    async _createVersion(changes, description) {
        try {
            // Ensure versions Map exists
            if (!this._projectState.versions || !(this._projectState.versions instanceof Map)) {
                this._projectState.versions = new Map();
            }
            
            const versionId = `v${Date.now()}`;
            const version = {
                id: versionId,
                timestamp: new Date().toISOString(),
                description: description,
                changes: changes,
                parent: this._projectState.currentVersion,
                files: await this._captureCurrentFiles()
            };
            
            this._projectState.versions.set(versionId, version);
            this._projectState.currentVersion = versionId;
            
            await this._savePersistedState();
            
            this._log(`Created version ${versionId}: ${description}`);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionCreated',
                    version: version
                });
            }
            
            return versionId;
        } catch (error) {
            this._error('Failed to create version:', error);
            throw error;
        }
    }

    async _captureCurrentFiles() {
        try {
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                return {};
            }
            
            const files = {};
            const workspaceUri = folders[0].uri;
            
            // Get all markdown files in the workspace
            const markdownFiles = await vscode.workspace.findFiles('**/*.md', null, 50);
            
            for (const fileUri of markdownFiles) {
                try {
                    const content = await vscode.workspace.fs.readFile(fileUri);
                    const relativePath = vscode.workspace.asRelativePath(fileUri);
                    files[relativePath] = Buffer.from(content).toString('utf8');
                } catch (error) {
                    this._log(`Could not read file ${fileUri.fsPath}: ${error.message}`);
                }
            }
            
            return files;
        } catch (error) {
            this._error('Failed to capture current files:', error);
            return {};
        }
    }

    async _getVersionHistory() {
        try {
            const versions = Array.from(this._projectState.versions.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionHistory',
                    versions: versions,
                    currentVersion: this._projectState.currentVersion
                });
            }
        } catch (error) {
            this._error('Failed to get version history:', error);
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionHistory',
                    versions: [],
                    currentVersion: null,
                    error: error.message
                });
            }
        }
    }

    async _restoreVersion(versionId) {
        try {
            const version = this._projectState.versions.get(versionId);
            if (!version) {
                throw new Error(`Version ${versionId} not found`);
            }
            
            // Restore files from the version
            if (version.files) {
                await this._restoreFiles(version.files);
            }
            
            this._projectState.currentVersion = versionId;
            await this._savePersistedState();
            
            this._log(`Restored to version ${versionId}`);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionRestored',
                    version: version
                });
            }
        } catch (error) {
            this._error('Failed to restore version:', error);
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionRestored',
                    error: error.message
                });
            }
        }
    }

    async _showVersionDiff(versionId) {
        try {
            const version = this._projectState.versions.get(versionId);
            if (!version) {
                throw new Error(`Version ${versionId} not found`);
            }
            
            const currentFiles = await this._captureCurrentFiles();
            const versionFiles = version.files || {};
            
            const diff = this._calculateDiff(currentFiles, versionFiles);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionDiff',
                    versionId: versionId,
                    diff: diff,
                    version: version
                });
            }
        } catch (error) {
            this._error('Failed to show version diff:', error);
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'versionDiff',
                    error: error.message
                });
            }
        }
    }

    _calculateDiff(currentFiles, versionFiles) {
        const diff = {
            added: [],
            modified: [],
            deleted: [],
            unchanged: []
        };
        
        const allFiles = new Set([...Object.keys(currentFiles), ...Object.keys(versionFiles)]);
        
        for (const filePath of allFiles) {
            const currentContent = currentFiles[filePath];
            const versionContent = versionFiles[filePath];
            
            if (!currentContent && versionContent) {
                diff.deleted.push({ path: filePath, content: versionContent });
            } else if (currentContent && !versionContent) {
                diff.added.push({ path: filePath, content: currentContent });
            } else if (currentContent !== versionContent) {
                diff.modified.push({ 
                    path: filePath, 
                    current: currentContent, 
                    version: versionContent 
                });
            } else {
                diff.unchanged.push({ path: filePath, content: currentContent });
            }
        }
        
        return diff;
    }

    async _restoreFiles(files) {
        try {
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                throw new Error('No workspace folder open');
            }
            
            for (const [relativePath, content] of Object.entries(files)) {
                const fileUri = vscode.Uri.joinPath(folders[0].uri, relativePath);
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            }
            
            this._log(`Restored ${Object.keys(files).length} files`);
        } catch (error) {
            this._error('Failed to restore files:', error);
            throw error;
        }
    }

    async _generateArtifacts(workflowStep, projectData, provider) {
        try {
            // Use the provider passed from the UI
            if (!provider) {
                const config = vscode.workspace.getConfiguration('llmPanel');
                provider = config.get('defaultProvider') || 'openai';
            }
            
            const workflowSteps = this._getWorkflowSteps();
            const step = workflowSteps[workflowStep];
            
            if (!step) {
                throw new Error(`Invalid workflow step: ${workflowStep}`);
            }
            
            const prompt = step.prompt
                .replace('{projectData}', JSON.stringify(projectData, null, 2))
                .replace('{complexity}', this._projectState.projectComplexity);
            
            this._log(`Generating artifact for step ${workflowStep}: ${step.name}`);
            
            const artifactContent = await this._callLLM(provider, prompt);
            
            // Ensure artifacts Map exists
            if (!this._projectState.artifacts || !(this._projectState.artifacts instanceof Map)) {
                this._projectState.artifacts = new Map();
            }
            
            // Store artifact
            const artifactId = `artifact_${workflowStep}_${Date.now()}`;
            this._projectState.artifacts.set(artifactId, {
                id: artifactId,
                step: workflowStep,
                name: step.name,
                content: artifactContent,
                timestamp: new Date().toISOString()
            });
            
            await this._savePersistedState();
            
            // Auto-save artifact if enabled
            const autoSaveConfig = vscode.workspace.getConfiguration('llmPanel');
            if (autoSaveConfig.get('autoSaveArtifacts', true)) {
                await this._saveArtifactToWorkspace(artifactId, step.name, artifactContent, { provider, projectData });
            }
            
            this._view.webview.postMessage({
                command: 'artifactGenerated',
                artifact: {
                    id: artifactId,
                    step: workflowStep,
                    name: step.name,
                    content: artifactContent
                }
            });
            
        } catch (error) {
            this._error('Failed to generate artifact:', error);
            this._view.webview.postMessage({
                command: 'artifactGenerated',
                error: error.message
            });
        }
    }

    async _getProjectState() {
        try {
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'projectState',
                    state: {
                        currentVersion: this._projectState.currentVersion,
                        projectComplexity: this._projectState.projectComplexity,
                        workflowStep: this._projectState.workflowStep,
                        versionCount: this._projectState.versions.size,
                        artifactCount: this._projectState.artifacts.size
                    }
                });
            }
        } catch (error) {
            this._error('Failed to get project state:', error);
        }
    }

    _getComplexityPrompts(complexity) {
        const prompts = {
            lite: {
                charter: `Create a lightweight project charter for the following requirements:
{requirements}

Include:
- Project title and brief description
- Key objectives (3-5 points)
- Success criteria
- Basic timeline (3-6 months)
- Resource requirements
- Risk assessment (top 3 risks)

Format as a concise, actionable document.`,
                prd: `Create a simple Product Requirements Document for:
{projectData}

Complexity: {complexity}

Include:
- Product overview
- Key features (5-8 features)
- User stories (3-5 stories)
- Technical requirements (basic)
- Success metrics
- Timeline (3-6 months)

Keep it practical and implementable.`
            },
            advanced: {
                charter: `Create a comprehensive project charter for the following requirements:
{requirements}

Include:
- Executive summary
- Project scope and objectives
- Stakeholder analysis
- Detailed timeline with milestones
- Resource allocation and budget
- Risk management plan
- Quality assurance framework
- Communication plan
- Success metrics and KPIs

Format as a professional, detailed document suitable for enterprise projects.`,
                prd: `Create a detailed Product Requirements Document for:
{projectData}

Complexity: {complexity}

Include:
- Product vision and strategy
- Market analysis and competitive landscape
- Detailed feature specifications
- User personas and journey maps
- Technical architecture requirements
- API specifications
- Performance requirements
- Security and compliance requirements
- Testing strategy
- Launch plan and go-to-market strategy
- Success metrics and analytics plan

Make it comprehensive and ready for development teams.`
            },
            pro: {
                charter: `Create an enterprise-grade project charter for the following requirements:
{requirements}

Include:
- Executive summary with ROI projections
- Strategic alignment and business case
- Comprehensive stakeholder matrix
- Detailed project governance structure
- Multi-phase timeline with dependencies
- Resource allocation with cost breakdown
- Advanced risk management framework
- Quality gates and review processes
- Change management procedures
- Communication protocols and escalation paths
- Success metrics with measurement framework
- Post-project evaluation plan

Format as a board-level strategic document.`,
                prd: `Create an enterprise Product Requirements Document for:
{projectData}

Complexity: {complexity}

Include:
- Strategic product vision and roadmap
- Comprehensive market research and analysis
- Detailed competitive analysis
- Advanced user research and personas
- Complete feature specifications with acceptance criteria
- Technical architecture with scalability considerations
- API documentation and integration requirements
- Performance, security, and compliance specifications
- Advanced testing and QA strategy
- DevOps and deployment strategy
- Monitoring and analytics framework
- Business intelligence and reporting requirements
- Internationalization and localization requirements
- Advanced launch strategy and market penetration plan
- Long-term product evolution strategy

Make it enterprise-ready with full technical and business specifications.`
            }
        };
        
        return prompts[complexity] || prompts.lite;
    }

    _getWorkflowSteps() {
        return [
            {
                name: "Project Charter",
                prompt: "Create a comprehensive project charter based on: {projectData}\nComplexity: {complexity}\nInclude executive summary, objectives, scope, timeline, resources, and success criteria."
            },
            {
                name: "Requirements Analysis",
                prompt: "Perform detailed requirements analysis for: {projectData}\nComplexity: {complexity}\nInclude functional and non-functional requirements, user stories, and acceptance criteria."
            },
            {
                name: "Technical Architecture",
                prompt: "Design technical architecture for: {projectData}\nComplexity: {complexity}\nInclude system design, technology stack, data flow, and integration points."
            },
            {
                name: "User Experience Design",
                prompt: "Create UX/UI specifications for: {projectData}\nComplexity: {complexity}\nInclude user personas, journey maps, wireframes, and design guidelines."
            },
            {
                name: "Development Plan",
                prompt: "Create detailed development plan for: {projectData}\nComplexity: {complexity}\nInclude sprint planning, task breakdown, dependencies, and resource allocation."
            },
            {
                name: "Testing Strategy",
                prompt: "Design comprehensive testing strategy for: {projectData}\nComplexity: {complexity}\nInclude test plans, automation strategy, and quality assurance processes."
            },
            {
                name: "Deployment Plan",
                prompt: "Create deployment and DevOps plan for: {projectData}\nComplexity: {complexity}\nInclude infrastructure, CI/CD, monitoring, and rollback procedures."
            },
            {
                name: "Security Framework",
                prompt: "Design security and compliance framework for: {projectData}\nComplexity: {complexity}\nInclude security requirements, compliance standards, and risk mitigation."
            },
            {
                name: "Documentation",
                prompt: "Create comprehensive documentation for: {projectData}\nComplexity: {complexity}\nInclude user manuals, API docs, technical guides, and maintenance procedures."
            },
            {
                name: "Project Handover",
                prompt: "Create project handover package for: {projectData}\nComplexity: {complexity}\nInclude final deliverables, knowledge transfer, and ongoing support plan."
            }
        ];
    }

    async _saveArtifactToWorkspace(artifactId, artifactName, content, meta = {}) {
        try {
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                this._log('No workspace folder open, skipping artifact auto-save');
                return;
            }
            
            const sanitizedName = artifactName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toLowerCase();
            const fileName = `${sanitizedName}_${Date.now()}.md`;
            const targetUri = vscode.Uri.joinPath(folders[0].uri, fileName);
            
            // Create markdown content with metadata
            const markdownContent = `# ${artifactName}

**Generated:** ${new Date().toLocaleString()}
**Artifact ID:** ${artifactId}
**Complexity:** ${this._projectState.projectComplexity}
**Provider:** ${meta.provider || ''}
**Context:** ${meta.projectData ? (typeof meta.projectData === 'string' ? meta.projectData : JSON.stringify(meta.projectData, null, 2)) : ''}

---

${content}

---

*Auto-generated by LLM Control Panel Project Charter System*`;

            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(markdownContent, 'utf8'));
            
            this._log(`Artifact auto-saved: ${targetUri.fsPath}`);
            
        } catch (error) {
            this._error('Failed to auto-save artifact:', error);
        }
    }

    async _saveTextFileWithMeta(kind, baseName, promptContext, content, provider, complexity) {
        try {
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                this._log('No workspace folder open, skipping save');
                return;
            }
            const ctx = String(promptContext || '')
                .slice(0, 60)
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .replace(/\s+/g, '_')
                .toLowerCase();
            const namePart = ctx || 'untitled';
            const fileName = `${baseName}_${namePart}_${Date.now()}.md`;
            const targetUri = vscode.Uri.joinPath(folders[0].uri, fileName);

            const markdownContent = `# ${kind.toUpperCase()}

**Generated:** ${new Date().toLocaleString()}
**Provider:** ${provider}
**Complexity:** ${complexity}
**Context:** ${promptContext || ''}

---

${content}

---

*Auto-generated by LLM Control Panel*`;

            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(markdownContent, 'utf8'));
            this._log(`${kind} saved: ${targetUri.fsPath}`);
            vscode.window.showInformationMessage(`${kind.toUpperCase()} saved: ${fileName}`);
        } catch (error) {
            this._error(`Failed to save ${kind}:`, error);
        }
    }

    async _exportProjectData() {
        try {
            const exportData = {
                projectState: {
                    currentVersion: this._projectState.currentVersion,
                    projectComplexity: this._projectState.projectComplexity,
                    workflowStep: this._projectState.workflowStep
                },
                versions: Array.from(this._projectState.versions.entries()),
                artifacts: Array.from(this._projectState.artifacts.entries()),
                exportTimestamp: new Date().toISOString()
            };
            
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                throw new Error('No workspace folder open');
            }
            
            const fileName = `project_export_${Date.now()}.json`;
            const targetUri = vscode.Uri.joinPath(folders[0].uri, fileName);
            
            await vscode.workspace.fs.writeFile(targetUri, Buffer.from(JSON.stringify(exportData, null, 2), 'utf8'));
            
            this._log(`Project data exported to: ${targetUri.fsPath}`);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'projectDataExported',
                    fileName: fileName,
                    path: targetUri.fsPath
                });
            }
            
        } catch (error) {
            this._error('Failed to export project data:', error);
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'projectDataExported',
                    error: error.message
                });
            }
        }
    }

    async _importProjectData(data) {
        try {
            if (!data || !data.projectState) {
                throw new Error('Invalid project data format');
            }
            
            // Restore project state
            this._projectState.currentVersion = data.projectState.currentVersion;
            this._projectState.projectComplexity = data.projectState.projectComplexity;
            this._projectState.workflowStep = data.projectState.workflowStep;
            
            // Restore versions
            this._projectState.versions.clear();
            if (data.versions) {
                data.versions.forEach(([id, version]) => {
                    this._projectState.versions.set(id, version);
                });
            }
            
            // Restore artifacts
            this._projectState.artifacts.clear();
            if (data.artifacts) {
                data.artifacts.forEach(([id, artifact]) => {
                    this._projectState.artifacts.set(id, artifact);
                });
            }
            
            await this._savePersistedState();
            
            this._log('Project data imported successfully');
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'projectDataImported',
                    success: true
                });
            }
            
        } catch (error) {
            this._error('Failed to import project data:', error);
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'projectDataImported',
                    error: error.message
                });
            }
        }
    }

    // ==================== END PROJECT CHARTER SYSTEM METHODS ====================

    async _useWithCopilot(bulletPoint, context) {
        try {
            // Create a comprehensive prompt for Copilot
            const copilotPrompt = this._createCopilotPrompt(bulletPoint, context);
            
            // Get the active editor
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                // If no active editor, create a new file
                const folders = vscode.workspace.workspaceFolders || [];
                if (!folders.length) {
                    throw new Error('No workspace folder open');
                }
                
                const fileName = `copilot_prompt_${Date.now()}.md`;
                const targetUri = vscode.Uri.joinPath(folders[0].uri, fileName);
                
                // Create a new file with the prompt
                const content = `# Copilot Prompt\n\n${copilotPrompt}\n\n---\n\n*Generated from bullet point: ${bulletPoint}*\n*Context: ${context || 'No additional context'}*`;
                await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
                
                // Open the new file
                const document = await vscode.workspace.openTextDocument(targetUri);
                await vscode.window.showTextDocument(document);
                
                this._log(`Created new file with Copilot prompt: ${fileName}`);
                vscode.window.showInformationMessage(`Copilot prompt created in new file: ${fileName}`);
            } else {
                // Insert the prompt at the current cursor position
                const position = activeEditor.selection.active;
                const edit = new vscode.WorkspaceEdit();
                edit.insert(activeEditor.document.uri, position, copilotPrompt);
                await vscode.workspace.applyEdit(edit);
                
                this._log('Copilot prompt inserted at cursor position');
                vscode.window.showInformationMessage('Copilot prompt inserted at cursor position');
            }
            
            // Send success message back to webview
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'copilotPromptCreated',
                    success: true,
                    bulletPoint: bulletPoint
                });
            }
            
        } catch (error) {
            this._error('Failed to use with Copilot:', error);
            
            if (this._view && this._view.webview) {
                this._view.webview.postMessage({
                    command: 'copilotPromptCreated',
                    success: false,
                    error: error.message
                });
            }
            
            vscode.window.showErrorMessage(`Failed to create Copilot prompt: ${error.message}`);
        }
    }

    _createCopilotPrompt(bulletPoint, context) {
        // Create a comprehensive prompt that transforms the bullet point into actionable code
        const basePrompt = `Based on this requirement: "${bulletPoint}"`;
        
        let enhancedPrompt = `${basePrompt}\n\nPlease help me implement this by:\n\n`;
        
        // Add context-specific instructions
        if (context) {
            enhancedPrompt += `Context: ${context}\n\n`;
        }
        
        // Add specific instructions based on the bullet point content
        if (bulletPoint.toLowerCase().includes('function') || bulletPoint.toLowerCase().includes('method')) {
            enhancedPrompt += `1. Create a well-structured function with proper parameters and return types\n`;
            enhancedPrompt += `2. Add comprehensive error handling\n`;
            enhancedPrompt += `3. Include JSDoc comments for documentation\n`;
            enhancedPrompt += `4. Provide usage examples\n\n`;
        } else if (bulletPoint.toLowerCase().includes('class') || bulletPoint.toLowerCase().includes('component')) {
            enhancedPrompt += `1. Design a clean class/component structure\n`;
            enhancedPrompt += `2. Include proper constructor and methods\n`;
            enhancedPrompt += `3. Add appropriate properties and their types\n`;
            enhancedPrompt += `4. Include usage examples and documentation\n\n`;
        } else if (bulletPoint.toLowerCase().includes('api') || bulletPoint.toLowerCase().includes('endpoint')) {
            enhancedPrompt += `1. Create RESTful API endpoint structure\n`;
            enhancedPrompt += `2. Include proper HTTP methods and status codes\n`;
            enhancedPrompt += `3. Add request/response validation\n`;
            enhancedPrompt += `4. Include error handling and documentation\n\n`;
        } else if (bulletPoint.toLowerCase().includes('test') || bulletPoint.toLowerCase().includes('testing')) {
            enhancedPrompt += `1. Create comprehensive test cases\n`;
            enhancedPrompt += `2. Include unit tests and integration tests\n`;
            enhancedPrompt += `3. Add test data and mock objects\n`;
            enhancedPrompt += `4. Include edge cases and error scenarios\n\n`;
        } else {
            enhancedPrompt += `1. Provide a clear implementation approach\n`;
            enhancedPrompt += `2. Include proper code structure and organization\n`;
            enhancedPrompt += `3. Add necessary imports and dependencies\n`;
            enhancedPrompt += `4. Include comments and documentation\n\n`;
        }
        
        enhancedPrompt += `Please provide the complete implementation with explanations.`;
        
        return enhancedPrompt;
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
            const config = vscode.workspace.getConfiguration('llmPanel');
            const customPromptTemplate = config.get('customProjectPrompt');
            
            // Replace placeholders in the custom prompt template
            const enhancedPrompt = customPromptTemplate
                .replace(/{planType}/g, planType.toLowerCase())
                .replace(/{description}/g, planDescription);

            this._log(`Using custom prompt template for ${planType}`);
            this._log(`Enhanced prompt: ${enhancedPrompt.substring(0, 200)}...`);

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
                    // For local Ollama, we'll skip the HTTP check and assume it's available
                    if (ollamaUrl.includes('localhost') || ollamaUrl.includes('127.0.0.1')) {
                        this._view.webview.postMessage({ 
                            command: 'providerStatus', 
                            status: 'connected', 
                            message: `Ollama local (model: ${model})` 
                        });
                    } else {
                        // Only check external URLs
                        const res = await fetch(`${ollamaUrl}/api/tags`, { method: 'GET' });
                        if (res.ok) {
                            this._view.webview.postMessage({ 
                                command: 'providerStatus', 
                                status: 'connected', 
                                message: `Ollama reachable (model: ${model})` 
                            });
                        } else {
                            this._view.webview.postMessage({ 
                                command: 'providerStatus', 
                                status: 'error', 
                                message: `Ollama responded: ${res.status} ${res.statusText}` 
                            });
                        }
                    }
                } catch (err) {
                    // For local Ollama, don't show connection errors
                    if (ollamaUrl.includes('localhost') || ollamaUrl.includes('127.0.0.1')) {
                        this._view.webview.postMessage({ 
                            command: 'providerStatus', 
                            status: 'connected', 
                            message: `Ollama local (model: ${model}) - connection not tested` 
                        });
                    } else {
                        this._view.webview.postMessage({ 
                            command: 'providerStatus', 
                            status: 'error', 
                            message: `Failed to reach Ollama at ${ollamaUrl}` 
                        });
                    }
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

        try {
            console.log(`Calling Ollama at ${ollamaUrl} with model ${model}`);
            
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
            
        } catch (error) {
            console.error('Ollama API call failed:', error);
            
            // Provide helpful error message for common issues
            if (error.message.includes('fetch')) {
                throw new Error(`Failed to connect to Ollama at ${ollamaUrl}. Make sure Ollama is running and accessible.`);
            }
            
            throw error;
        }
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