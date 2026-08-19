const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
const outDir = path.join(__dirname, '..', 'assets');

async function generate() {
    if (!fs.existsSync(svgPath)) {
        console.error('SVG icon not found at', svgPath);
        process.exit(1);
    }

    const sizes = [512, 256, 128, 64, 48, 32, 16];
    const pngPaths = [];

    for (const size of sizes) {
        const outPng = path.join(outDir, `icon-${size}.png`);

        await sharp(svgPath)
            .resize(size, size)
            .png()
            .toFile(outPng);

        pngPaths.push(outPng);
        console.log('Wrote', outPng);
    }

    // Copy 512px as icon.png (used by electron-builder for Linux)
    const linuxIcon = path.join(outDir, 'icon.png');
    await sharp(svgPath).resize(512, 512).png().toFile(linuxIcon);
    console.log('Wrote', linuxIcon, '(Linux icon)');

    const icoPath = path.join(outDir, 'icon.ico');

    const icoBuffer = await pngToIco(pngPaths);

    fs.writeFileSync(icoPath, icoBuffer);
    console.log('Wrote', icoPath);
}

generate().catch(err => {
    console.error(err);
    process.exit(1);
});