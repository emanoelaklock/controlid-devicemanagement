/**
 * Pre-packaging verification: ensures Prisma client is generated
 * and all required files exist before electron-builder runs.
 */
const fs = require('fs');
const path = require('path');

const checks = [
  {
    path: 'node_modules/.prisma/client/index.js',
    desc: 'Prisma generated client (index.js)',
  },
  {
    path: 'node_modules/.prisma/client/default.js',
    desc: 'Prisma generated client (default.js)',
  },
  {
    path: 'node_modules/@prisma/client/default.js',
    desc: '@prisma/client entry point',
  },
  {
    path: 'prisma/schema.prisma',
    desc: 'Prisma schema file',
  },
];

console.log('Verifying Prisma build artifacts...\n');

let allOk = true;

for (const check of checks) {
  const fullPath = path.join(__dirname, '..', check.path);
  const exists = fs.existsSync(fullPath);
  console.log(`  ${exists ? 'OK' : 'MISSING'}  ${check.desc}`);
  console.log(`         ${fullPath}`);
  if (!exists) allOk = false;
}

// Check for query engine binary
const prismaClientDir = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
if (fs.existsSync(prismaClientDir)) {
  const files = fs.readdirSync(prismaClientDir);
  const engines = files.filter(f => f.includes('query_engine') || f.endsWith('.node'));
  console.log(`\n  Query engine binaries found: ${engines.length}`);
  engines.forEach(e => console.log(`    - ${e}`));

  if (engines.length === 0) {
    console.log('\n  WARNING: No query engine binary found!');
    console.log('  Run: npx prisma generate');
    allOk = false;
  }
} else {
  console.log('\n  MISSING: node_modules/.prisma/client/ directory does not exist');
  allOk = false;
}

console.log('');

if (!allOk) {
  console.error('FAIL: Prisma artifacts are incomplete. Run "npx prisma generate" first.');
  process.exit(1);
} else {
  console.log('PASS: All Prisma artifacts verified.\n');
}
