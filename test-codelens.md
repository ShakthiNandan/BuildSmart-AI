# Test CodeLens Feature

This file demonstrates the "Convert to Prompt" CodeLens feature for Markdown bullet points.

## Example Bullet Points

- Create a function to validate email addresses
- Implement user authentication with JWT tokens
- Build a REST API endpoint for user registration
* Design a database schema for a blog application
* Add error handling for network requests
+ Write unit tests for the calculator module
+ Create a responsive navigation component

## How to Use

1. Open this file in VS Code
2. You should see "▶ Convert to Prompt" above each bullet point
3. Click the button to send the bullet text to Ollama
4. The response will be displayed in the LLM Control Panel sidebar

## Configuration

Make sure you have:
- Ollama running at http://localhost:11434
- The model "gemma3-tools:12b" pulled (or change the model in settings)
- The LLM Control Panel extension activated
