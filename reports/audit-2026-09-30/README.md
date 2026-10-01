# Audit evidence

These are diagnostic reproductions, not production fixes or a complete integration suite. SQL functions are extracted from the repository and executed in a fresh in-memory PGlite database. Identity helpers and reduced table schemas are fixtures. DOM probes use LinkeDOM rather than a browser. The probes print observed outcomes; they do not implement regression assertions.

- `validation.log`: original successful `npm run validate` output.
- `runtime.log`: SQL reproductions, including expected errors and accounting observations.
- `dependency-audit.log`: failed npm advisory request; this is not a clean vulnerability result.
- `sql-probes.cjs`: source for the local SQL reproductions.
- `dom-probes.cjs`: source for filter-reset and overlapping-modal reproductions.
- `dom.log`: DOM reproduction output.

Re-run from PowerShell using isolated tooling dependencies:

```powershell
$env:DROPZYY_AUDIT_TOOLS = Join-Path $env:TEMP 'dropzyy-audit-tools'
npm install --prefix $env:DROPZYY_AUDIT_TOOLS --no-audit --no-fund --ignore-scripts @electric-sql/pglite linkedom
node reports/audit-2026-09-30/sql-probes.cjs
node reports/audit-2026-09-30/dom-probes.cjs
```

No Supabase or Paystack credentials are needed; the probes do not call those services. The audit-time dependency manifest and lockfile are retained as `tools-package.json` and `tools-package-lock.json` for exact version reference.
