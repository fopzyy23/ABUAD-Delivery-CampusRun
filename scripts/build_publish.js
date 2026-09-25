// ============================================================
// build_publish.js — assemble the Netlify publish directory
// ============================================================
// WHY THIS EXISTS
//   netlify.toml used to publish "." (the whole repository root). Netlify
//   deploys every file it finds INSIDE the publish directory, so that also
//   published the repository internals to https://dropzyy.com:
//   supabase/** (migrations, Edge Function source, BASELINE.md), scripts/**,
//   *.md, _backup_*.sql, .netlify/, reports/, *.docx ...
//
//   This script copies an explicit ALLOW-LIST of website files into `dist/`,
//   and netlify.toml publishes `dist`. Anything not on the allow-list is never
//   uploaded, so the remediation is FAIL-CLOSED: a repository file added later
//   is not published just because it happens to sit next to the website.
//
//   The deployed URL layout does not change, because `dist/assets/**` mirrors
//   `assets/**`. Every rule in netlify.toml (/ , /admin, /assets/*, /* ) and
//   every root-absolute URL inside the HTML shells therefore keep working.
//
// USAGE
//   node scripts/build_publish.js   Netlify runs this as the build command.
//   netlify deploy --build          CLI: always pass --build so `dist/` is
//                                   regenerated. `dist/` is deliberately not
//                                   committed, so a bare `netlify deploy`
//                                   fails loudly instead of shipping a stale
//                                   copy of the site.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');

// ---- The publish contract: ONLY these repository paths are ever deployed. ----
const ALLOWLIST = [
  'assets',      // css/ html/ js/ images/ — the whole static website
  'robots.txt',  // served at /robots.txt
  '_redirects',  // comment-only signpost; the real rules live in netlify.toml
];

// ---- Files the deployed site cannot work without. ----
const REQUIRED_FILES = [
  'assets/html/index.html',
  'assets/html/admin.html',
  'assets/css/styles.css',
  'assets/css/admin.css',
  'assets/js/app.js',
  'assets/js/admin.js',
  'assets/js/config.js',
  'assets/js/modal.js',
];

// ---- Defence in depth: refuse to publish repository internals even if one of
// ---- these names is ever added to ALLOWLIST by mistake.
const FORBIDDEN_SEGMENTS = new Set([
  'supabase', 'scripts', '.git', '.github', '.netlify', 'node_modules',
  'reports', '.tmp', 'dist', '.env',
]);
const FORBIDDEN_EXTENSIONS = ['.sql', '.md', '.docx', '.tmp', '.ps1', '.yml', '.yaml'];

function fail(message) {
  process.exitCode = 1;
  console.error('');
  console.error('PUBLISH BUILD FAILED: ' + message);
  console.error('Nothing was deployed. Fix the problem and re-run the build.');
}

function removeOutDir() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}

// Copy a file or directory tree. Symlinks are refused outright: a symlink
// inside the publish directory is one way repository source could be served
// again through a different path.
function copyRecursive(srcAbs, destAbs) {
  const stat = fs.lstatSync(srcAbs);
  if (stat.isSymbolicLink()) {
    throw new Error(
      'refusing to publish a symlink (it could re-expose repository files): ' +
        path.relative(ROOT, srcAbs)
    );
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(destAbs, { recursive: true });
    for (const entry of fs.readdirSync(srcAbs)) {
      copyRecursive(path.join(srcAbs, entry), path.join(destAbs, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(srcAbs, destAbs);
}

// Every file under `dir`, as forward-slash paths relative to `base`.
function listFiles(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push.apply(out, listFiles(abs, base));
    else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}


function main() {
  // 1. Start from a clean slate, so a file from an earlier build can never be
  //    carried into this deploy.
  removeOutDir();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 2. Copy the allow-list only.
  try {
    for (const rel of ALLOWLIST) {
      const src = path.join(ROOT, rel);
      if (!fs.existsSync(src)) {
        throw new Error('allow-list entry is missing from the repository: ' + rel);
      }
      copyRecursive(src, path.join(OUT_DIR, rel));
    }
  } catch (err) {
    removeOutDir();
    fail(err && err.message ? err.message : String(err));
    return;
  }

  // 3. Verify what is about to be deployed — a deploy that contains repository
  //    internals, or is missing a site file, must never go out.
  const problems = [];
  const published = listFiles(OUT_DIR, OUT_DIR);

  for (const rel of published) {
    for (const segment of rel.split('/')) {
      if (FORBIDDEN_SEGMENTS.has(segment)) {
        problems.push('repository path inside the deploy: ' + rel);
      }
    }
    if (FORBIDDEN_EXTENSIONS.indexOf(path.extname(rel).toLowerCase()) !== -1) {
      problems.push('non-website file type inside the deploy: ' + rel);
    }
  }
  for (const rel of REQUIRED_FILES) {
    if (published.indexOf(rel) === -1) {
      problems.push('required website file missing from the deploy: ' + rel);
    }
  }

  if (problems.length) {
    removeOutDir();
    fail(
      'the assembled publish directory failed its own safety check:\n  - ' +
        problems.join('\n  - ')
    );
    return;
  }

  // 4. Report exactly what will be uploaded.
  let bytes = 0;
  for (const rel of published) bytes += fs.statSync(path.join(OUT_DIR, rel)).size;
  console.log('Publish directory assembled: dist/');
  console.log('  allow-list : ' + ALLOWLIST.join(', '));
  console.log('  files      : ' + published.length + '  (' + (bytes / 1024).toFixed(1) + ' KB)');
  for (const rel of published.slice().sort()) console.log('    + ' + rel);
  console.log(
    '  not published: supabase/, scripts/, .netlify/, .git/, *.md, *.sql, ' +
      'SQL backups, reports/, *.docx'
  );
}

try {
  main();
} catch (err) {
  removeOutDir();
  fail(err && err.message ? err.message : String(err));
}
