const vscode = require('vscode');

/**
 * CodeLens provider for Markdown bullet points
 * Shows "Convert to Prompt" button next to each bullet point
 */
class MarkdownCodeLensProvider {
    constructor() {
        this._onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    }

    /**
     * Provide CodeLenses for bullet points in Markdown documents
     */
    provideCodeLenses(document, token) {
        const codeLenses = [];
        
        // Only process markdown files
        if (document.languageId !== 'markdown') {
            return codeLenses;
        }

        // Regex to match bullet points (-, *, or +)
        const bulletRegex = /^(\s*)[-*+]\s+(.+)$/;

        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const match = line.text.match(bulletRegex);

            if (match) {
                const bulletText = match[2].trim(); // Extract the actual bullet content
                
                // Create a range for the bullet point
                const range = new vscode.Range(
                    new vscode.Position(i, 0),
                    new vscode.Position(i, line.text.length)
                );

                // Create CodeLens with "Convert to Prompt" command
                const codeLens = new vscode.CodeLens(range, {
                    title: "▶ Convert to Prompt",
                    tooltip: "Send this bullet point to Ollama for processing",
                    command: "extension.convertToPrompt",
                    arguments: [bulletText, i + 1] // Pass bullet text and line number
                });

                codeLenses.push(codeLens);
            }
        }

        return codeLenses;
    }

    /**
     * Refresh CodeLenses (optional)
     */
    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
}

module.exports = MarkdownCodeLensProvider;
