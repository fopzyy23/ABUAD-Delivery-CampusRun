// ============================================================
// Read-only structural validator for
// supabase/migrations/20260904_add_discovery_fields.sql
// ============================================================
// Confirms the migration:
//   1. Adds the four expected discovery columns (vendors.image,
//      vendors.description, vendors.opening_hours, products.image)
//   2. Makes NO RLS / policy / privilege / function / trigger
//      changes (vendor ownership rules must stay untouched)
// ============================================================
const fs = require('fs');

const file = 'supabase/migrations/20260904_add_discovery_fields.sql';
const sql = fs.readFileSync(file, 'utf8');
const sqlNoComments = sql.replace(/--[^\n]*/g, '');

const errors = [];
const warnings = [];

// 1. Required DDL present
const required = [
  'ALTER TABLE public.vendors',
  'ADD COLUMN IF NOT EXISTS image text',
  'ADD COLUMN IF NOT EXISTS description text',
  'ADD COLUMN IF NOT EXISTS opening_hours text',
  'ALTER TABLE public.products',
  'ADD COLUMN IF NOT EXISTS image text'
];
required.forEach(r => {
  if (!sqlNoComments.includes(r)) errors.push('MISSING: ' + r);
});

// 2. No security/ownership changes allowed
if (/CREATE POLICY|DROP POLICY/i.test(sqlNoComments)) errors.push('RLS policy change detected — FORBIDDEN');
if (/GRANT|REVOKE/i.test(sqlNoComments)) errors.push('Privilege change detected — FORBIDDEN');
if (/CREATE OR REPLACE FUNCTION|CREATE FUNCTION|CREATE TRIGGER|DROP TRIGGER/i.test(sqlNoComments)) errors.push('Function/trigger change detected — FORBIDDEN');
if (/CREATE TABLE|DROP TABLE|ALTER TABLE public\.(orders|profiles|order_items|riders)/i.test(sqlNoComments)) errors.push('Unrelated table change detected — FORBIDDEN');

// 3. No DROP COLUMN / destructive statements
if (/DROP COLUMN|DROP CONSTRAINT|TRUNCATE|DELETE FROM/i.test(sqlNoComments)) errors.push('Destructive statement detected — FORBIDDEN');

console.log('=== DISCOVERY MIGRATION VALIDATION ===');
console.log('File: ' + file);
console.log('Errors: ' + (errors.length ? errors.length : 'NONE'));
errors.forEach(e => console.log('  ERR: ' + e));
console.log('Warnings: ' + (warnings.length ? warnings.length : 'NONE'));
warnings.forEach(w => console.log('  WARN: ' + w));
process.exit(errors.length ? 1 : 0);