const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const root = path.resolve(__dirname, '../..');

async function database(until = '99999999', compatibility = true) {
  const db = new PGlite({ extensions: { pgcrypto } });
  // Supabase platform fixtures only. All public business tables, policies,
  // triggers and functions below come from the repository migration replay.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage;
    CREATE SCHEMA vault; CREATE SCHEMA cron;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    GRANT USAGE ON SCHEMA auth, public TO anon,authenticated,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
    CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
    CREATE TABLE cron.job(jobid bigint,jobname text,command text);
    CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
  `);
  const files = ['supabase/bootstrap/00000000_base_schema.sql', ...fs.readdirSync(path.join(root,'supabase/migrations'))
    .filter(n => n.endsWith('.sql') && n.split('_')[0] <= until).sort().map(n => 'supabase/migrations/'+n)];
  try {
    for (const file of files) {
      if (compatibility && file.endsWith('20260919_create_refund_infrastructure.sql')) {
        // Historical migration searches pg_get_constraintdef for IN, but PG
        // deparses it as ANY. Do not alter deployed migration history.
        await db.exec('ALTER TABLE public.orders DROP CONSTRAINT orders_payment_status_check');
        console.log('TEST-ONLY historical compatibility: drop replaced payment-status constraint before 20260919');
      }
      // PGlite has no network worker process. Skip only installation of these
      // platform extensions; scheduler SQL still executes against empty fixtures.
      const sql = fs.readFileSync(path.join(root,file),'utf8')
        .replace(/^CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net);\s*$/gmi,'');
      try { await db.exec(sql); } catch (e) { throw new Error(file+': '+e.message, {cause:e}); }
    }
  } catch(e) { await db.close(); throw e; }
  console.log(`Replayed ${files.length-1} migrations + bootstrap in PostgreSQL (PGlite; platform fixtures).`);
  return db;
}

async function asUser(db, user, aal, run, role='authenticated') {
  return db.transaction(async tx => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)`,
      [user || '', JSON.stringify({sub:user,aal,role})]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return run(tx);
  });
}
module.exports = { database, asUser, root };
if(require.main===module) database('99999999', !process.argv.includes('--strict')).then(db=>db.close()).catch(e=>{console.error(e.message);process.exitCode=1;});
