# Usage Guide - "Convert to Prompt" Feature with Sidebar Display

## 🚀 Quick Start

### Step 1: Prepare Ollama
```bash
# Start Ollama server
ollama serve

# Pull the model (if not already done)
ollama pull gemma3-tools:12b
```

### Step 2: Open VS Code
1. Launch the extension (F5 for debug mode)
2. Open the **LLM Control Panel** from the Activity Bar (left sidebar)

### Step 3: Create or Open a Markdown File
Create a file like `tasks.md`:
```markdown
# My Development Tasks

- Create a user authentication system
- Implement password reset functionality
- Add email verification feature
- Build a dashboard with analytics
- Create API documentation
```

### Step 4: Use the CodeLens Feature
1. Look for the **"▶ Convert to Prompt"** button above each bullet point
2. Click the button on any bullet point
3. Watch the magic happen! ✨

## 📺 What Happens

### In the Editor
```markdown
                    ▶ Convert to Prompt  ← Click this
- Create a user authentication system
                    ▶ Convert to Prompt
- Implement password reset functionality
                    ▶ Convert to Prompt
- Add email verification feature
```

### In the Sidebar

#### Before Click:
```
┌─────────────────────────────────┐
│   LLM Control Panel             │
├─────────────────────────────────┤
│ LLM Provider: [Ollama ▼]        │
│ Status: Connected [Configure]   │
├─────────────────────────────────┤
│ Prompt: [Textarea]              │
└─────────────────────────────────┘
```

#### After Click (Success):
```
┌─────────────────────────────────────────────────────┐
│   LLM Control Panel                                 │
├─────────────────────────────────────────────────────┤
│ 📝 PROMPT FOR THE STEP                              │ ← NEW!
│ ┌─────────────────────────────────────────────────┐ │
│ │ ✅ Success                      3:45:23 PM     │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Bullet Point: Create a user authentication     │ │
│ │               system                (Line 3)   │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ LLM Response:                                   │ │
│ │ ┌─────────────────────────────────────────────┐ │ │
│ │ │ Here's a comprehensive approach to create   │ │ │
│ │ │ a user authentication system:               │ │ │
│ │ │                                             │ │ │
│ │ │ 1. **Database Schema**                      │ │ │
│ │ │    - Users table with email, password_hash │ │ │
│ │ │    - Sessions table for active sessions    │ │ │
│ │ │                                             │ │ │
│ │ │ 2. **Backend Implementation**               │ │ │
│ │ │    - Use bcrypt for password hashing       │ │ │
│ │ │    - JWT tokens for session management    │ │ │
│ │ │    ...                                      │ │ │
│ │ └─────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────┘ │
│ [Clear]                                             │
├─────────────────────────────────────────────────────┤
│ LLM Provider: [Ollama ▼]                            │
└─────────────────────────────────────────────────────┘
```

#### After Click (Error):
```
┌─────────────────────────────────────────────────────┐
│ 📝 PROMPT FOR THE STEP                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ❌ Error                        3:45:23 PM     │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Bullet Point: Invalid request      (Line 5)   │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ Error: Ollama API returned status 500:        │ │
│ │        Internal Server Error                   │ │
│ └─────────────────────────────────────────────────┘ │
│ [Clear]                                             │
└─────────────────────────────────────────────────────┘
```

## 🎯 Use Cases

### 1. Code Generation
```markdown
- Create a React component for a login form
- Write a Python function to calculate Fibonacci
- Implement a REST API endpoint for user registration
```

### 2. Documentation Tasks
```markdown
- Write API documentation for the user service
- Create a README for the authentication module
- Document the deployment process
```

### 3. Planning & Design
```markdown
- Design a database schema for e-commerce
- Plan the architecture for a microservices system
- Create a security audit checklist
```

### 4. Learning & Research
```markdown
- Explain how JWT authentication works
- Compare React vs Vue for this project
- Research best practices for API versioning
```

## 💡 Tips & Tricks

### Tip 1: Be Specific
**Good:**
```markdown
- Create a React login form with email/password validation, error handling, and loading states
```

**Less Specific:**
```markdown
- Make a login form
```

### Tip 2: Use Context in Bullet Points
```markdown
- For a Node.js Express app, implement JWT-based authentication with refresh tokens
```

### Tip 3: Sequential Tasks
Number your tasks for step-by-step processing:
```markdown
1. Create the database models
2. Build the API endpoints
3. Add authentication middleware
4. Write unit tests
```

### Tip 4: Clear and Review
- Use the **[Clear]** button to dismiss old results
- Keep the section focused on your current task

## ⚙️ Configuration

### Change the Model
1. Open VS Code Settings (Ctrl+,)
2. Search for "LLM Control Panel"
3. Set `llmPanel.ollamaModel` to your preferred model:
   - `gemma3-tools:12b` (default)
   - `llama3.1`
   - `phi3`
   - `mistral`
   - Any model you have pulled with Ollama

### Change the URL
If Ollama is running on a different port or machine:
```json
{
  "llmPanel.ollamaUrl": "http://192.168.1.100:11434"
}
```

## 🐛 Troubleshooting

### CodeLens Not Showing
- ✅ File must be `.md` (Markdown)
- ✅ Use `-`, `*`, or `+` for bullets
- ✅ Reload window (Ctrl+R)

### "Connection refused" Error
- ✅ Check Ollama is running: `ollama serve`
- ✅ Verify port: default is `11434`
- ✅ Test in browser: `http://localhost:11434`

### "Model not found" Error
- ✅ Pull the model: `ollama pull gemma3-tools:12b`
- ✅ Check available: `ollama list`
- ✅ Verify spelling in settings

### Section Not Appearing
- ✅ Check browser console for errors (F12)
- ✅ Ensure extension is activated
- ✅ Try reloading the extension window

## 🔄 Workflow Example

Here's a complete workflow:

```markdown
# Project: E-Commerce Platform

## Phase 1: Backend Setup
- Set up Node.js Express server with TypeScript
- Configure PostgreSQL database with TypeORM
- Implement user authentication with JWT
- Create product catalog API endpoints

## Phase 2: Frontend Development
- Build React app with TypeScript and Vite
- Create responsive layout with Tailwind CSS
- Implement product listing with search/filter
- Add shopping cart functionality

## Phase 3: Testing & Deployment
- Write unit tests with Jest
- Set up CI/CD pipeline with GitHub Actions
- Configure Docker containers
- Deploy to AWS with Terraform
```

**For each bullet:**
1. Click "▶ Convert to Prompt"
2. Review the LLM response in the sidebar
3. Copy useful code/guidance
4. Implement the feature
5. Click "Clear" when done
6. Move to the next bullet

## 📚 Advanced Usage

### Combine with Other Features

The CodeLens feature works alongside other extension features:

1. **Generate Charter**: Use "Project Charter System" for high-level planning
2. **Convert Bullets**: Use CodeLens for detailed implementation guidance
3. **Create Plans**: Use "Create Plan Document" for comprehensive docs
4. **Version Control**: Track changes with built-in versioning

### Keyboard Shortcuts (Future)

Consider adding VS Code keyboard shortcuts:
```json
{
  "key": "ctrl+shift+p",
  "command": "extension.convertToPrompt",
  "when": "editorTextFocus"
}
```

## 🎓 Best Practices

1. **One Task Per Bullet**: Keep bullets focused on single tasks
2. **Clear After Use**: Don't let old results clutter the sidebar
3. **Iterate**: Refine bullet points based on responses
4. **Copy & Adapt**: Use responses as starting points, not final solutions
5. **Verify**: Always review and test generated code

## 🌟 Summary

The "Convert to Prompt" feature with the "Prompt for the Step" sidebar section provides:

- ✨ Instant access to LLM guidance for any task
- 📍 Context-aware responses linked to specific lines
- 🎨 Beautiful, integrated UI in VS Code
- 🔄 Seamless workflow integration
- 💾 Automatic organization in dedicated section

Happy coding! 🚀
