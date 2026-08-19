const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
const pythonDir = path.join(projectRoot, 'python');
const venvDir = path.join(pythonDir, 'build-venv');
const backendScript = path.join(pythonDir, 'dsa_backend.py');

function run(cmd) {
    console.log('>', cmd);
    execSync(cmd, { stdio: 'inherit' });
}

try {
    execSync('python3 --version', { stdio: 'ignore' });
} catch (err) {
    console.error('python3 is required to build the bundled backend.');
    process.exit(1);
}

if (!fs.existsSync(backendScript)) {
    console.error('dsa_backend.py not found at', backendScript);
    process.exit(1);
}

// Create isolated build venv
if (!fs.existsSync(venvDir)) {
    run(`python3 -m venv "${venvDir}"`);
}

const venvPython = path.join(venvDir, 'bin', 'python');
const venvPip = path.join(venvDir, 'bin', 'pip');

// Upgrade pip and install requirements + pyinstaller
run(`"${venvPython}" -m pip install --upgrade pip`);
const requirementsFile = path.join(pythonDir, 'requirements.txt');
if (fs.existsSync(requirementsFile)) {
    run(`"${venvPip}" install -r "${requirementsFile}"`);
}
run(`"${venvPip}" install pyinstaller`);

// Run PyInstaller to produce a single-file executable
const workDir = path.join(pythonDir, 'build');
if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

run(`"${venvPython}" -m PyInstaller --onefile --name dsa_backend "${backendScript}" --distpath "${pythonDir}" --workpath "${workDir}" --specpath "${workDir}"`);

console.log('Bundled backend created at', path.join(pythonDir, 'dsa_backend'));
console.log('You can now run `npm run dist` to build the AppImage.');
