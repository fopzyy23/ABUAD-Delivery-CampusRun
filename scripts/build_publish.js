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
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');

// ---- The publish contract: ONLY these repository paths are ever deployed. ----
const ALLOWLIST = [
  'assets',      // css/ html/ js/ images/ — the whole static website
  'images',      // root-level brand/static images (e.g. the Dropzyy logo PNG)
  'manifest.webmanifest',
  'sw.js',
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
  'assets/js/auth-lifecycle.js',
  'assets/js/admin.js',
  'assets/js/config.js',
  'assets/js/modal.js',
  'images/dropzyy-logo.png', // the site logo (transparent PNG used by the navbars)
  'manifest.webmanifest',
  'sw.js',
];

// ---- Defence in depth: refuse to publish repository internals even if one of
// ---- these names is ever added to ALLOWLIST by mistake.
const FORBIDDEN_SEGMENTS = new Set([
  'supabase', 'scripts', '.git', '.github', '.netlify', 'node_modules',
  'reports', '.tmp', 'dist', '.env',
]);
const FORBIDDEN_EXTENSIONS = ['.sql', '.md', '.docx', '.tmp', '.ps1', '.yml', '.yaml', '.bak', '.old', '.backup', '.dump', '.gz'];

const PRODUCTION_SUPABASE_URL = 'https://cmfohldnmytmwjynqfpz.supabase.co';
const STAGING_SUPABASE_URL = 'https://bhpbxhvvfulwmtijfnvs.supabase.co';
const PRODUCTION_PUBLISHABLE_KEY = 'sb_publishable_B1Akr8vzkzZvAZdTaxqgDA_BalvZXHi';
const PRODUCTION_ORIGINS = ['https://dropzyy.com', 'https://www.dropzyy.com'];

function getBuildConfig() {
  const environment = (process.env.DROPZYY_ENVIRONMENT || 'production').trim().toLowerCase();
  if (!['production', 'staging'].includes(environment)) throw new Error('DROPZYY_ENVIRONMENT must be production or staging.');
  const required = ['DROPZYY_FRONTEND_ORIGIN', 'DROPZYY_SUPABASE_URL', 'DROPZYY_SUPABASE_PUBLISHABLE_KEY', 'DROPZYY_VAPID_PUBLIC_KEY'];
  if (environment === 'staging') for (const name of required) if (!process.env[name] || !process.env[name].trim()) throw new Error('staging builds require ' + name + '.');
  const supabaseUrl = (process.env.DROPZYY_SUPABASE_URL || PRODUCTION_SUPABASE_URL).trim().replace(/\/$/, '');
  if (environment === 'staging' && supabaseUrl === PRODUCTION_SUPABASE_URL) throw new Error('staging builds may not point at the production Supabase project.');
  if (environment === 'production' && supabaseUrl !== PRODUCTION_SUPABASE_URL) throw new Error('production builds must point at the production Supabase project.');
  const origins = environment === 'production' ? PRODUCTION_ORIGINS : process.env.DROPZYY_FRONTEND_ORIGIN.split(/[\s,]+/).filter(Boolean);
  if (!origins.length || origins.some(origin => !/^https:\/\//.test(origin))) throw new Error('DROPZYY_FRONTEND_ORIGIN must contain HTTPS origin(s).');
  return { environment, supabaseUrl, publishableKey: (process.env.DROPZYY_SUPABASE_PUBLISHABLE_KEY || PRODUCTION_PUBLISHABLE_KEY).trim(), vapidPublicKey: (process.env.DROPZYY_VAPID_PUBLIC_KEY || '').trim(), origins };
}

function writeGeneratedFiles(config) {
  const productionProjectUrl = config.environment === 'staging'
    ? "'https://' + 'cmfohldnmytmwjynqfpz.supabase.co'"
    : JSON.stringify(PRODUCTION_SUPABASE_URL);
  const configJs = `// Generated by scripts/build_publish.js. Do not edit this file.\n'use strict';\nconst supabaseUrl = ${JSON.stringify(config.supabaseUrl)};\nconst supabaseKey = ${JSON.stringify(config.publishableKey)};\nconst browserEnvironment = ${JSON.stringify(config.environment)};\nconst frontendOrigins = ${JSON.stringify(config.origins)};\nconst productionProjectUrl = ${productionProjectUrl};\nif (!frontendOrigins.includes(window.location.origin) || !['production', 'staging'].includes(browserEnvironment) || (browserEnvironment !== 'production' && supabaseUrl === productionProjectUrl)) {\n  window.supabase = null;\n  document.addEventListener('DOMContentLoaded', () => { const target = document.getElementById('app'); if (target) target.textContent = 'This deployment needs explicit environment configuration. Contact the site operator.'; });\n  throw new Error('Dropzyy browser environment is not configured for this origin.');\n}\nwindow.supabase = supabase.createClient(supabaseUrl, supabaseKey);\nwindow.SUPABASE_EDGE_URL = supabaseUrl;\nwindow.DROPZYY_VAPID_PUBLIC_KEY = ${JSON.stringify(config.vapidPublicKey)};\n`;
  const host = new URL(config.supabaseUrl).host;
  const csp = `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: ${config.supabaseUrl}; connect-src 'self' ${config.supabaseUrl} wss://${host}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
  fs.writeFileSync(path.join(OUT_DIR, 'assets/js/config.js'), `/* generated */\n${configJs}`, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, '_headers'), `/*\n  Content-Security-Policy: ${csp}\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()\n`, 'utf8');
}

function validateGeneratedOutput(config) {
  const text = listFiles(OUT_DIR, OUT_DIR).map(rel => fs.readFileSync(path.join(OUT_DIR, rel), 'utf8')).join('\n');
  const wrongUrl = config.environment === 'production' ? STAGING_SUPABASE_URL : PRODUCTION_SUPABASE_URL;
  if (!text.includes(config.supabaseUrl) || text.includes(wrongUrl)) throw new Error(config.environment + ' dist contains an incorrect Supabase project reference.');
  for (const secretName of ['VAPID_PRIVATE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PUSH_DISPATCHER_SECRET', 'PAYSTACK_SECRET_KEY']) if (text.includes(secretName)) throw new Error('forbidden server-side secret name found in dist: ' + secretName);
}

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

function deploymentBuildId() {
  const external = process.env.DEPLOY_ID || process.env.COMMIT_REF || process.env.BUILD_ID;
  const context = process.env.CONTEXT || process.env.NETLIFY_CONTEXT || process.env.DEPLOY_PRIME_URL || 'local';
  if (external) {
    const safeContext = String(context).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'local';
    const safeExternal = String(external).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'build';
    return `${safeContext}-${safeExternal}`;
  }
  const critical = ['assets/js/app.js', 'assets/js/auth-lifecycle.js', 'assets/js/config.js', 'assets/js/app-errors.js', 'assets/js/modal.js', 'assets/css/styles.css', 'assets/css/admin.css'];
  const hash = crypto.createHash('sha256');
  critical.forEach(rel => hash.update(fs.readFileSync(path.join(ROOT, rel))));
  const safeContext = String(context).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'local';
  return safeContext + '-' + hash.digest('hex').slice(0, 16);
}

function preparePublishedArtifacts() {
  const swPath = path.join(OUT_DIR, 'sw.js');
  const buildId = deploymentBuildId();
  const sw = fs.readFileSync(swPath, 'utf8').replace(/__DROPZYY_BUILD_ID__/g, buildId);
  fs.writeFileSync(swPath, sw);
  console.log('  build id   : ' + buildId);
}


function main() {
  const config = getBuildConfig();
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
    preparePublishedArtifacts();
  } catch (err) {
    removeOutDir();
    fail(err && err.message ? err.message : String(err));
    return;
  }

  // Generate environment-specific files only in dist; source assets remain untouched.
  writeGeneratedFiles(config);

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
  try {
    require('./validate_publish_artifact').validate();
  } catch (err) {
    problems.push(err && err.message ? err.message : String(err));
  }

  if (problems.length) {
    removeOutDir();
    fail(
      'the assembled publish directory failed its own safety check:\n  - ' +
        problems.join('\n  - ')
    );
    return;
  }

  try {
    validateGeneratedOutput(config);
  } catch (err) {
    removeOutDir();
    fail(err && err.message ? err.message : String(err));
    return;
  }

  // 4. Report exactly what will be uploaded.
  let bytes = 0;
  for (const rel of published) bytes += fs.statSync(path.join(OUT_DIR, rel)).size;
  console.log('Publish directory assembled: dist/');
  console.log('  environment: ' + config.environment);
  console.log('  Supabase   : ' + config.supabaseUrl);
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
