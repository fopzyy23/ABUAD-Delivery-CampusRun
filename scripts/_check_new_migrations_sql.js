// Conservative structural checks for migrations pending remote application.
// This is not a PostgreSQL parser; it reports only unambiguous local faults.
const fs = require('fs');
const path = require('path');

const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
const allFiles = fs.readdirSync(migrationDir)
  .filter((name) => /^\d{8,14}_.+\.sql$/i.test(name))
  .sort();
const files = allFiles.filter((name) => name >= '20261215');
let failed = false;
function fail(file, message) { failed = true; console.log(`FAIL — ${file}: ${message}`); }

function stripProtected(sql, file) {
  let out = '', i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i); const stop = end < 0 ? sql.length : end;
      out += ' '.repeat(stop - i); i = stop; continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) { fail(file, 'unterminated block comment'); return out; }
      out += ' '.repeat(end + 2 - i); i = end + 2; continue;
    }
    if (sql[i] === "'") {
      const start = i++; let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i++] === "'") { closed = true; break; }
      }
      if (!closed) fail(file, `unterminated single-quoted string at offset ${start}`);
      out += ' '.repeat(i - start); continue;
    }
    if (sql[i] === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        if (end < 0) { fail(file, `unclosed dollar tag ${tag[0]}`); return out; }
        out += ' '.repeat(end + tag[0].length - i); i = end + tag[0].length; continue;
      }
    }
    out += sql[i++];
  }
  return out;
}

function checkDollarBodies(sql, file) {
  const bodies = /\$([A-Za-z_]*)\$([\s\S]*?)\$\1\$/g;
  for (const match of sql.matchAll(bodies)) {
    const body = match[2];
    const declare = /\bDECLARE\b([\s\S]*?)\bBEGIN\b/i.exec(body);
    if (!declare) continue;
    const declared = new Set();
    for (const statement of declare[1].split(';')) {
      const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+(?:[A-Za-z_]|public\.)/i.exec(statement);
      if (name) declared.add(name[1].toLowerCase());
    }
    // Restrict this to conventional v_* locals; parameter and record-field
    // targets need a real PL/pgSQL parser and are intentionally not guessed.
    for (const into of body.matchAll(/\bSELECT\b[\s\S]*?\bINTO\s+((?:v_[A-Za-z0-9_]+\s*,\s*)*v_[A-Za-z0-9_]+)/gi)) {
      for (const target of into[1].split(',').map((value) => value.trim().toLowerCase())) {
        if (!declared.has(target)) fail(file, `SELECT ... INTO uses undeclared variable ${target}`);
      }
    }
  }
  for (const tag of sql.matchAll(/\$([A-Za-z_]*)\$/g)) {
    const literal = tag[0].replace(/[$]/g, '\\$&');
    if ((sql.match(new RegExp(literal, 'g')) || []).length % 2) fail(file, `unclosed dollar tag ${tag[0]}`);
  }
}

function checkSimpleViews(sql, file) {
  const views = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[\w.]+\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM\s+[\w.]+\s*;/gi;
  for (const view of sql.matchAll(views)) {
    const names = view[1].split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
      const alias = /\s+AS\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i.exec(part);
      const bare = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(part);
      return (alias?.[1] || bare?.[1] || '').toLowerCase();
    });
    const duplicates = names.filter((name, index) => name && names.indexOf(name) !== index);
    if (duplicates.length) fail(file, `simple view has duplicate output column(s): ${[...new Set(duplicates)].join(', ')}`);
  }
}

const versions = new Map();
for (const file of allFiles) {
  const version = /^([0-9]+)_/.exec(file)[1];
  if (versions.has(version)) fail(file, `duplicate migration version prefix also used by ${versions.get(version)}`);
  else versions.set(version, file);
}
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
  const plain = stripProtected(sql, file);
  let depth = 0;
  for (const char of plain) { if (char === '(') depth++; else if (char === ')') depth--; if (depth < 0) { fail(file, 'unbalanced closing parenthesis'); break; } }
  if (depth !== 0) fail(file, `parenthesis imbalance ${depth}`);
  if (/\?\s*[^\n;]+\s*:\s*[^\n;]+/.test(plain)) fail(file, 'possible JavaScript/C-style ternary outside quoted SQL');
  checkDollarBodies(sql, file);
  checkSimpleViews(sql, file);
  if (!failed) console.log(`OK   — ${file}`);
}
if (!failed) console.log('NOTE — PostgreSQL/Supabase catalog, extension, RLS, and runtime checks still require a local or remote database.');
process.exit(failed ? 1 : 0);
