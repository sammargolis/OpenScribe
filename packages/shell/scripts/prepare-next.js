#!/usr/bin/env node

const path = require('path');
const fs = require('fs-extra');

const rootDir = process.cwd();
const appDir = path.join(rootDir, 'apps', 'web');
const nextDir = path.join(appDir, '.next');
const standaloneDir = path.join(nextDir, 'standalone');
const staticSource = path.join(nextDir, 'static');
const staticDestination = path.join(standaloneDir, 'apps', 'web', '.next', 'static');
const publicSource = path.join(appDir, 'public');
const publicDestination = path.join(standaloneDir, 'public');

const ensureExists = async (source, destination) => {
  if (!(await fs.pathExists(source))) {
    throw new Error(`Required path missing: ${source}`);
  }

  await fs.remove(destination);
  await fs.mkdirp(path.dirname(destination));
  await fs.copy(source, destination);
};

const run = async () => {
  if (!(await fs.pathExists(standaloneDir))) {
    throw new Error(
      'Next standalone output has not been generated. Run "pnpm build" before packaging the desktop app.',
    );
  }

  await ensureExists(staticSource, staticDestination);
  await ensureExists(publicSource, publicDestination);

  // Copy .env.local to standalone directory for packaged app
  const envLocalSource = path.join(appDir, '.env.local');
  const envLocalDestination = path.join(standaloneDir, '.env.local');

  if (await fs.pathExists(envLocalSource)) {
    await fs.copy(envLocalSource, envLocalDestination);
    console.log('✅ Copied .env.local to standalone directory');
  } else {
    console.warn('⚠️  Warning: .env.local not found. API keys will not be available in packaged app.');
  }

  // Workaround for electron-builder issue #3104:
  // electron-builder ignores directories named "node_modules" in extraResources
  // Rename node_modules to _node_modules for packaging
  const nodeModulesPath = path.join(standaloneDir, 'node_modules');
  const renamedNodeModulesPath = path.join(standaloneDir, '_node_modules');

  if (await fs.pathExists(nodeModulesPath)) {
    // Remove any existing renamed directory first
    await fs.remove(renamedNodeModulesPath);
    // Rename node_modules to _node_modules
    await fs.rename(nodeModulesPath, renamedNodeModulesPath);
    console.log('✅ Renamed node_modules to _node_modules for electron-builder');
  }

  console.log('✅ Prepared standalone Next.js output for Electron packaging');
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
