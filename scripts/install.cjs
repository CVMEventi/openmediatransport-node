const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const supported = ['darwin', 'win32'];

if (!supported.includes(process.platform)) {
  console.log(
    `openmediatransport: skipping native build — ` +
    `platform "${process.platform}" is not supported (supported: macOS, Windows).`
  );
  process.exit(0);
}

try {
  execSync('node-gyp rebuild', { stdio: 'inherit' });
} catch {
  process.exit(1);
}

// Remove Windows import libraries (.lib) on non-Windows platforms.
// They are only needed by the MSVC linker at build time and are not valid
// ELF binaries — Linux packaging tools (e.g. RPM strip) fail on them.
if (process.platform !== 'win32') {
  const libDir = path.join(__dirname, '..', 'lib');
  for (const entry of fs.readdirSync(libDir)) {
    if (!entry.startsWith('win-')) continue;
    const winDir = path.join(libDir, entry);
    for (const file of fs.readdirSync(winDir)) {
      if (file.endsWith('.lib')) {
        fs.rmSync(path.join(winDir, file));
      }
    }
  }
}
