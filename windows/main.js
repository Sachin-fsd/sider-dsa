const {
    app,
    globalShortcut,
    BrowserWindow,
    ipcMain,
    Tray,
    Menu,
} = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

let Store;
let store = null;

log.transports.file.level = 'info';

let settingsWindow = null;
let pythonProcess = null;
let isProcessing = false;
let tray = null;

// Python backend paths - resolved at startup
let pythonScriptPath = '';
let pythonExecutable = 'python3';

function setupPythonPaths() {
    if (app.isPackaged) {
        // Production: look for bundled PyInstaller binary
        const bundledBackend = path.join(
            process.resourcesPath,
            'python',
            process.platform === 'win32' ? 'dsa_backend.exe' : 'dsa_backend'
        );

        if (fs.existsSync(bundledBackend)) {
            pythonExecutable = bundledBackend;
            pythonScriptPath = '';
            log.info('Using bundled backend:', bundledBackend);
        } else {
            // Fallback: raw .py with bundled python
            pythonScriptPath = path.join(
                process.resourcesPath,
                'python',
                'dsa_backend.py'
            );
            pythonExecutable = 'python3';
            log.info('Bundled binary not found, falling back to:', pythonScriptPath);
        }
    } else {
        // Development: use local venv or system python
        pythonScriptPath = path.join(__dirname, 'python', 'dsa_backend.py');
        const venvPythonWin = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
        const venvPythonUnix = path.join(__dirname, 'venv', 'bin', 'python3');

        if (fs.existsSync(venvPythonWin)) {
            pythonExecutable = venvPythonWin;
        } else if (fs.existsSync(venvPythonUnix)) {
            pythonExecutable = venvPythonUnix;
        } else {
            pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        }
        log.info('Dev mode - Python:', pythonExecutable, 'Script:', pythonScriptPath);
    }
}

async function initializeStore() {
    try {
        const module = await import('electron-store');
        Store = module.default;
        store = new Store({
            defaults: {
                apiKeys: [],
                apiKeyIndex: 0,
                model: 'qwen/qwen3.8-27b',
            },
        });
        log.info('electron-store initialized');
    } catch (error) {
        log.error('Failed to initialize electron-store:', error);
        throw error;
    }
}

function getIconPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, '..', 'icon.png');
    }
    return path.join(__dirname, 'assets', 'icon-64.png');
}

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.show();
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 600,
        height: 560,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        icon: path.join(__dirname, 'assets', 'icon.svg'),
        resizable: false,
        show: false,
        title: 'ScreenSum DSA - Settings',
    });

    settingsWindow.loadFile(path.join(__dirname, 'index.html'));

    settingsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        log.error(`Failed to load index.html: ${errorCode} - ${errorDescription}`);
    });

    const apiKeys = store.get('apiKeys', []);

    if (!apiKeys || apiKeys.length === 0) {
        settingsWindow.show();
    }

    settingsWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            settingsWindow.hide();
        }
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function createTray() {
    if (tray) return;

    const iconPath = path.join(__dirname, 'assets', 'icon-64.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Settings',
            click: () => createSettingsWindow(),
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setToolTip('ScreenSum DSA - CapsLock+2 screenshot, CapsLock+4 solve');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => createSettingsWindow());
}

function runPythonCommand(command, apiKey, model) {
    return new Promise((resolve, reject) => {
        if (pythonProcess) {
            log.warn('Python process already busy. Ignoring command.');
            return resolve({ error: 'Busy' });
        }

        // When using bundled binary, command is passed as first arg (no script path)
        const args = pythonScriptPath ? [pythonScriptPath, command] : [command];

        if (apiKey) {
            args.push('--api-key', apiKey);
        }
        if (model) {
            args.push('--model', model);
        }

        log.info(`Running: ${pythonExecutable} ${args.join(' ')}`);

        pythonProcess = spawn(pythonExecutable, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdoutData += output;
            log.info(`Python stdout: ${output.trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const output = data.toString();
            stderrData += output;
            log.error(`Python stderr: ${output.trim()}`);
        });

        pythonProcess.on('error', (error) => {
            log.error('Failed to start Python process:', error);
            pythonProcess = null;
            reject(error);
        });

        pythonProcess.on('close', (code, signal) => {
            log.info(`Python process closed. code=${code}, signal=${signal}`);
            pythonProcess = null;

            if (code !== 0 && code !== null) {
                return reject(new Error(stderrData || `Python process exited with code ${code}`));
            }

            const cleanedOutput = stdoutData.trim();
            if (!cleanedOutput) return resolve({});

            try {
                resolve(JSON.parse(cleanedOutput));
            } catch (error) {
                log.warn('Python output was not valid JSON. Returning raw output.');
                resolve({ raw: cleanedOutput });
            }
        });
    });
}

function getNextApiKey() {
    const apiKeys = store.get('apiKeys', []);
    if (!apiKeys || apiKeys.length === 0) return null;

    let keyIndex = 0;
    try {
        keyIndex = parseInt(store.get('apiKeyIndex', 0) || 0, 10) % apiKeys.length;
        if (Number.isNaN(keyIndex)) keyIndex = 0;
    } catch (e) {
        keyIndex = 0;
    }

    const chosenKey = apiKeys[keyIndex];

    try {
        store.set('apiKeyIndex', (keyIndex + 1) % apiKeys.length);
    } catch (e) {
        log.warn('Failed to persist apiKeyIndex:', e);
    }

    log.info(`Using API key #${keyIndex + 1}/${apiKeys.length}`);
    return chosenKey;
}

// ===============================
// STOP TYPING
// ===============================

function stopTyping() {
    log.info('Stop typing requested (CapsLock+`)');

    const interruptFile = path.join(
        require('os').homedir(),
        '.screensum-dsa',
        'interrupt.flag'
    );

    try {
        const dir = path.dirname(interruptFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(interruptFile, 'interrupt');
        log.info('Interrupt flag created');
    } catch (error) {
        log.error('Failed to create interrupt flag:', error);
    }

    if (pythonProcess && !pythonProcess.killed) {
        log.info('Killing Python process...');
        try {
            pythonProcess.kill('SIGINT');
            setTimeout(() => {
                if (pythonProcess && !pythonProcess.killed) {
                    log.info('Force killing Python process...');
                    pythonProcess.kill('SIGKILL');
                }
            }, 500);

            isProcessing = false;
            pythonProcess = null;
            log.info('Typing stopped successfully');
        } catch (error) {
            log.error('Failed to stop typing:', error);
        }
    } else {
        log.info('No Python process running to stop');
    }
}

// ===============================
// HOTKEYS
// ===============================

function registerHotkeys() {
    // CapsLock+2 -> screenshot
    const screenshotRegistered = globalShortcut.register('CapsLock+2', async () => {
        if (isProcessing) {
            log.warn('Already processing. Ignoring CapsLock+2.');
            return;
        }

        isProcessing = true;
        log.info('Hotkey CapsLock+2 pressed -> Taking screenshot');

        try {
            const result = await runPythonCommand('screenshot');
            log.info('Screenshot result:', result);
        } catch (error) {
            log.error('Error in screenshot:', error);
        } finally {
            isProcessing = false;
        }
    });

    // CapsLock+4 -> solve AND type
    const solveRegistered = globalShortcut.register('CapsLock+4', async () => {
        if (isProcessing) {
            log.warn('Already processing. Ignoring CapsLock+4.');
            return;
        }

        const apiKeys = store.get('apiKeys', []);
        if (!apiKeys || apiKeys.length === 0) {
            log.warn('No API keys configured. Opening settings.');
            createSettingsWindow();
            if (settingsWindow) {
                settingsWindow.webContents.send('show-settings');
            }
            return;
        }

        isProcessing = true;
        log.info('Hotkey CapsLock+4 pressed -> Solving DSA and typing solution');

        try {
            const apiKey = getNextApiKey();
            const model = store.get('model', 'qwen/qwen3.8-27b');

            const solveResult = await runPythonCommand('solve', apiKey, model);
            log.info('Solve result:', solveResult);

            if (solveResult.error) {
                log.error('Solve failed:', solveResult.error);
            } else {
                const typeResult = await runPythonCommand('type');
                log.info('Typing result:', typeResult);
            }
        } catch (error) {
            log.error('Error in solve/type:', error);
        } finally {
            isProcessing = false;
        }
    });

    // CapsLock+` -> stop typing
    const stopRegistered = globalShortcut.register('CapsLock+`', () => {
        stopTyping();
    });

    // CapsLock+1 -> open settings
    const settingsRegistered = globalShortcut.register('CapsLock+1', () => {
        createSettingsWindow();
        if (settingsWindow) {
            settingsWindow.webContents.send('show-settings');
        }
    });

    log.info(`CapsLock+2 (screenshot) registered: ${screenshotRegistered}`);
    log.info(`CapsLock+4 (solve+type) registered: ${solveRegistered}`);
    log.info(`CapsLock+\` (stop) registered: ${stopRegistered}`);
    log.info(`CapsLock+1 (settings) registered: ${settingsRegistered}`);

    if (!screenshotRegistered || !solveRegistered || !stopRegistered || !settingsRegistered) {
        log.error('One or more global shortcuts failed to register.');
    }
}

// ===============================
// IPC HANDLERS
// ===============================

ipcMain.handle('save-api-keys', async (event, apiKeys, model) => {
    try {
        if (!Array.isArray(apiKeys)) {
            throw new Error('Invalid API keys array');
        }

        const validKeys = apiKeys
            .map(key => key.trim())
            .filter(key => key.length > 0);

        if (validKeys.length === 0) {
            throw new Error('At least one valid API key is required');
        }

        store.set('apiKeys', validKeys);
        store.set('apiKeyIndex', 0);

        if (model) {
            store.set('model', model);
        }

        log.info(`Saved ${validKeys.length} API keys`);

        return { success: true, count: validKeys.length };
    } catch (error) {
        log.error('Failed to save API keys:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-api-keys', () => {
    try {
        return store.get('apiKeys', []);
    } catch (error) {
        log.error('Failed to get API keys:', error);
        return [];
    }
});

ipcMain.handle('get-settings', () => {
    try {
        return {
            apiKeys: store.get('apiKeys', []),
            model: store.get('model', 'qwen/qwen3.8-27b'),
        };
    } catch (error) {
        log.error('Failed to get settings:', error);
        return { apiKeys: [], model: 'qwen/qwen3.8-27b' };
    }
});

// ===============================
// APP LIFECYCLE
// ===============================

app.whenReady()
    .then(async () => {
        log.info('ScreenSum DSA starting...');

        setupPythonPaths();

        await initializeStore();

        createSettingsWindow();
        createTray();

        registerHotkeys();

        log.info('Hotkeys: CapsLock+2 (screenshot), CapsLock+4 (solve + type), CapsLock+` (stop), CapsLock+1 (settings)');
    })
    .catch((error) => {
        log.error('Failed during Electron startup:', error);
        console.error(error);
        app.quit();
    });

app.on('window-all-closed', () => {
    // Keep running in tray
});

app.on('before-quit', () => {
    log.info('ScreenSum DSA shutting down...');
    app.isQuitting = true;

    globalShortcut.unregisterAll();

    if (pythonProcess && !pythonProcess.killed) {
        try {
            pythonProcess.kill();
        } catch (error) {
            log.error('Failed to kill Python process:', error);
        }
    }

    pythonProcess = null;
    isProcessing = false;

    if (tray) {
        tray.destroy();
        tray = null;
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    console.error(error);
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Promise Rejection:', reason);
    console.error(reason);
});
