const { execSync } = require('child_process');

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
