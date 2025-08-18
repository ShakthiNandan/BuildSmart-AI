@echo off
echo LLM Control Panel Extension Installation
echo ======================================
echo.

echo Installing dependencies...
npm install

if %errorlevel% neq 0 (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Building extension package...
npm run package

if %errorlevel% neq 0 (
    echo Error: Failed to build extension
    pause
    exit /b 1
)

echo.
echo Extension built successfully!
echo.
echo To install the extension:
echo 1. Open VS Code
echo 2. Go to Extensions (Ctrl+Shift+X)
echo 3. Click the "..." menu and select "Install from VSIX..."
echo 4. Choose the generated .vsix file
echo 5. Reload VS Code when prompted
echo.
echo Don't forget to configure your API keys in VS Code settings!
echo.
pause 