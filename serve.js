// Wrapper to start Next.js dev with proper node in PATH
const { execSync, spawn } = require('child_process');
const path = require('path');

const nodeDir = path.dirname(process.execPath);
process.env.PATH = `${nodeDir}:${process.env.PATH || ''}`;

const next = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, 'dev', '--webpack', '--port', '3000'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('exit', (code) => process.exit(code));
