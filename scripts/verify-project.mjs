import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const warnings = [];

const required = [
  'index.html',
  'package.json',
  'vite.config.js',
  '.github/workflows/deploy.yml',
  'src/main.js',
  'src/core/runtime.js',
  'src/legacy/legacy-game.js',
  'src/styles/index.css',
  'src/styles/legacy.css',
  'src/styles/v130-polish.css',
  'src/modules/visual-polish-module.js',
  'public/assets/mechas/axiom-placeholder.png',
  'src/modules/combat-ui-module.js',
  'src/styles/v141-corrections.css',
  'src/styles/v142-interface.css',
  'src/modules/interface-revision-module.js'
];

for (const relative of required) {
  if (!existsSync(resolve(root, relative))) errors.push(`Missing required file: ${relative}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist', 'dist-static', '.git'].includes(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const files = await walk(root);
const jsFiles = files.filter((file) => ['.js', '.mjs'].includes(extname(file)));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`JavaScript syntax error in ${file.slice(root.length + 1)}: ${result.stderr.trim()}`);
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (packageJson.version !== '1.4.2') errors.push('package.json version must be 1.4.2');
if (!packageJson.devDependencies?.vite) errors.push('Vite is not declared in devDependencies');
if (packageJson.scripts?.build !== 'vite build') errors.push('Build script must use Vite');

const indexPath = resolve(root, 'index.html');
const index = await readFile(indexPath, 'utf8');
if (!index.includes('./src/main.js')) errors.push('index.html does not load src/main.js');
if (!index.includes('./src/styles/index.css')) errors.push('index.html does not load src/styles/index.css');
if (!index.includes(`data-release="${packageJson.version}"`)) warnings.push('index.html release metadata was not found exactly as expected');

const localReferences = [...index.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((value) => value.startsWith('./') || value.startsWith('../'));
for (const reference of localReferences) {
  const clean = reference.split(/[?#]/)[0];
  const absolute = resolve(dirname(indexPath), clean);
  if (!existsSync(absolute)) errors.push(`Broken index reference: ${reference}`);
}

const importPattern = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)["']([^"']+)["']/g;
for (const file of jsFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const absolute = normalize(resolve(dirname(file), specifier));
    if (!existsSync(absolute)) errors.push(`Broken import in ${file.slice(root.length + 1)}: ${specifier}`);
  }
}

const cssFiles = files.filter((file) => extname(file) === '.css');
for (const file of cssFiles) {
  const source = await readFile(file, 'utf8');
  let balance = 0;
  let inComment = false;
  for (let index = 0; index < source.length; index += 1) {
    if (!inComment && source[index] === '/' && source[index + 1] === '*') {
      inComment = true;
      index += 1;
      continue;
    }
    if (inComment && source[index] === '*' && source[index + 1] === '/') {
      inComment = false;
      index += 1;
      continue;
    }
    if (inComment) continue;
    if (source[index] === '{') balance += 1;
    if (source[index] === '}') balance -= 1;
    if (balance < 0) break;
  }
  if (balance !== 0) errors.push(`Unbalanced CSS braces in ${file.slice(root.length + 1)}`);
}

const legacyStats = await stat(resolve(root, 'src/legacy/legacy-game.js'));
if (legacyStats.size < 400_000) warnings.push('Legacy compatibility runtime is unexpectedly small');

const moduleFiles = files.filter((file) => file.includes(`${join('src', 'modules')}${process.platform === 'win32' ? '\\' : '/'}`) && extname(file) === '.js');
if (moduleFiles.length < 20) errors.push(`Expected at least 20 runtime modules, found ${moduleFiles.length}`);

const result = {
  version: packageJson.version,
  filesChecked: files.length,
  javascriptChecked: jsFiles.length,
  cssChecked: cssFiles.length,
  modulesFound: moduleFiles.length,
  errors,
  warnings
};

console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
