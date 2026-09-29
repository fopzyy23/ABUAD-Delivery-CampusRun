// Parses every Edge Function TypeScript source with Node's TypeScript stripper.
// This is syntax coverage only; it does not claim Deno runtime type checking.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..', 'supabase', 'functions');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(p);
  }
}
walk(root);
let failed = 0;
for (const file of files) {
  try {
    Module.stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'strip' });
    console.log(`PASS — ${path.relative(path.join(__dirname, '..'), file)}`);
  } catch (error) {
    failed++;
    console.error(`FAIL — ${path.relative(path.join(__dirname, '..'), file)}: ${error.message}`);
  }
}
console.log(`Checked ${files.length} Edge Function TypeScript file(s).`);
process.exitCode = failed ? 1 : 0;
