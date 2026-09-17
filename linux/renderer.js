const api = window.electronAPI;

const settingsPanel = document.getElementById('settings-panel');
const statusPanel = document.getElementById('status-panel');
const statusMessage = document.getElementById('status-message');
const apiKeysContainer = document.getElementById('api-keys-container');
const addKeyBtn = document.getElementById('add-key-btn');
const saveKeysBtn = document.getElementById('save-keys-btn');
const modelSelect = document.getElementById('model-select');
const keyInfo = document.getElementById('key-info');

const MAX_KEYS = 10;

function addKeyInput(value = '') {
    const row = document.createElement('div');
    row.className = 'api-key-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'api-key-input';
    input.placeholder = 'gsk_xxxxxxxxxxxxxxxxxxxx';
    input.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-key-btn';
    removeBtn.textContent = '\u2715';
    removeBtn.style.display = 'none';
    removeBtn.addEventListener('click', () => {
        row.remove();
        updateKeyInfo();
        updateRemoveButtons();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    apiKeysContainer.appendChild(row);

    updateRemoveButtons();
    updateKeyInfo();

    return input;
}

function updateRemoveButtons() {
    const rows = apiKeysContainer.querySelectorAll('.api-key-row');
    rows.forEach((row) => {
        const btn = row.querySelector('.remove-key-btn');
        btn.style.display = rows.length > 1 ? 'inline-block' : 'none';
    });
}

function updateKeyInfo() {
    const inputs = apiKeysContainer.querySelectorAll('.api-key-input');
    const validKeys = Array.from(inputs).filter(i => i.value.trim().length > 0);
    const total = inputs.length;

    if (total === 0) {
        keyInfo.textContent = 'Add at least one API key';
        keyInfo.style.color = '#f38ba8';
    } else {
        keyInfo.textContent = `${validKeys.length} of ${total} keys entered (Max ${MAX_KEYS})`;
        keyInfo.style.color = '#a6adc8';
    }
}

async function loadSettings() {
    const settings = await api.getSettings();
    const apiKeys = settings.apiKeys || [];

    apiKeysContainer.innerHTML = '';

    if (apiKeys.length === 0) {
        addKeyInput('');
    } else {
        apiKeys.forEach(key => addKeyInput(key));
    }

    if (settings.model) {
        modelSelect.value = settings.model;
    }

    updateKeyInfo();
    updateRemoveButtons();
}

saveKeysBtn.addEventListener('click', async () => {
    const inputs = apiKeysContainer.querySelectorAll('.api-key-input');
    const apiKeys = Array.from(inputs)
        .map(input => input.value.trim())
        .filter(key => key.length > 0);

    if (apiKeys.length === 0) {
        statusMessage.textContent = 'Please enter at least one valid API key';
        return;
    }

    if (apiKeys.length > MAX_KEYS) {
        statusMessage.textContent = `Maximum ${MAX_KEYS} API keys allowed`;
        return;
    }

    const model = modelSelect.value;
    const result = await api.saveApiKeys(apiKeys, model);

    if (result.success) {
        statusMessage.textContent = `${result.count} API key${result.count > 1 ? 's' : ''} saved! Rotation enabled.`;
        setTimeout(() => {
            settingsPanel.classList.add('hidden');
            statusPanel.classList.remove('hidden');
            statusMessage.textContent = `Ready! ${result.count} key${result.count > 1 ? 's' : ''} loaded. Press CapsLock+2 (screenshot) then CapsLock+4 (solve).`;
        }, 1500);
    } else {
        statusMessage.textContent = `Error: ${result.error || 'Failed to save API keys'}`;
    }
});

addKeyBtn.addEventListener('click', () => {
    const currentCount = apiKeysContainer.querySelectorAll('.api-key-row').length;
    if (currentCount < MAX_KEYS) {
        addKeyInput('');
        updateKeyInfo();
        updateRemoveButtons();
    } else {
        statusMessage.textContent = `Maximum ${MAX_KEYS} API keys allowed`;
    }
});

api.onShowSettings(() => {
    settingsPanel.classList.remove('hidden');
    statusPanel.classList.add('hidden');
});

loadSettings();

api.getApiKeys().then((keys) => {
    if (keys && keys.length > 0) {
        settingsPanel.classList.add('hidden');
        statusPanel.classList.remove('hidden');
        statusMessage.textContent = `Ready! ${keys.length} key${keys.length > 1 ? 's' : ''} loaded. Press CapsLock+2 (screenshot) then CapsLock+4 (solve).`;
    }
});
