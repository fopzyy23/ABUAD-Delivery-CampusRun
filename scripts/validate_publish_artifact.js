'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets/js/app.js');
const artifactPath = path.join(root, 'dist/assets/js/app.js');

function riderImplementation(source, label) {
  const start = source.indexOf('async function runRiderStatusUpdate');
  const end = source.indexOf('// Broken/missing product pictures', start);
  if (start < 0 || end < 0) throw new Error(`${label}: rider status implementation markers missing`);
  return source.slice(start, end);
}

function validate() {
  if (!fs.existsSync(sourcePath) || !fs.existsSync(artifactPath)) {
    throw new Error('publish artifact or source app.js is missing');
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  const artifact = fs.readFileSync(artifactPath, 'utf8');
  const sourceRider = riderImplementation(source, 'source');
  const artifactRider = riderImplementation(artifact, 'publish artifact');
  if (sourceRider !== artifactRider) {
    throw new Error('dist/assets/js/app.js rider status implementation differs from assets/js/app.js');
  }
  if (!artifactRider.includes("supabase.rpc('update_rider_order_status'")) {
    throw new Error('publish artifact rider status implementation does not call update_rider_order_status');
  }
  if (/\.from\(['"]orders['"]\)\s*\.update\(\{\s*status\s*:\s*nextStatus/.test(artifactRider)) {
    throw new Error('publish artifact contains a direct rider orders status update');
  }
  for (const status of ['Picked up', 'On the Way', 'Delivered']) {
    if (!artifact.includes(`runRiderStatusUpdate(o,'${status}'`)) {
      throw new Error(`publish artifact is missing the ${status} rider handler`);
    }
  }
  if (!artifact.includes('data-retry-rider-status') || !artifact.includes('runRiderStatusUpdate(o, next')) {
    throw new Error('publish artifact Retry handler is missing or bypasses runRiderStatusUpdate');
  }
}

if (require.main === module) {
  validate();
  console.log('Publish artifact rider status validation passed');
}

module.exports = { validate };
