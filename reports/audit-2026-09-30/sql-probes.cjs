const fs=require('fs'), path=require('path');
const toolRoot=process.env.DROPZYY_AUDIT_TOOLS || path.join(require('os').tmpdir(),'dropzyy-audit-tools');
const {PGlite}=require(path.join(toolRoot,'node_modules/@electric-sql/pglite'));
const root=path.resolve(__dirname,'../..');
function fn(file,name){const s=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8');const start=s.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');if(start<0)throw Error(name);const tail=s.slice(start);const tag=tail.match(/AS\s+(\$\w*\$)/i);const end=tail.indexOf(tag[1],tag.index+tag[0].length);return tail.slice(0,end+tag[1].length)+';';}
async function main(){const db=new PGlite();
await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.require_admin_aal2() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE admin_action_audit(admin_id uuid,action text,entity_type text,entity_id text,before_state jsonb,after_state jsonb);
CREATE TABLE issue_reports(id uuid,status text,admin_response text,admin_reviewed_at timestamptz,admin_reviewed_by uuid);
CREATE TABLE orders(id uuid,user_id uuid,status text,total numeric,final_order_total numeric,additional_amount_due numeric,rider_id uuid,delivery_method text,payment_status text,request_type text,delivery_payment_status text,vendor_delivery_requested boolean,cancellation_stage text,cancellation_requested_at timestamptz,final_financial_status text);
CREATE TABLE payments(id uuid DEFAULT gen_random_uuid(),order_id uuid,reference text,amount numeric,currency text,status text,payment_type text,replacement_obligation_id uuid,authorization_url text,access_code text,created_at timestamptz DEFAULT now(),updated_at timestamptz);
CREATE TABLE riders(id uuid,user_id uuid,status text,available boolean);
CREATE TABLE purchase_funding(id uuid,order_id uuid);
CREATE TABLE cancellations(id uuid DEFAULT gen_random_uuid(),order_id uuid,initiated_by uuid,reason text,stage text,reimbursement_amount numeric);
CREATE TABLE transfers(id uuid,purchase_funding_id uuid,cancellation_id uuid,withdrawal_request_id bigint,delivery_settlement_id uuid,status text,amount numeric,created_at timestamptz);
CREATE TABLE withdrawal_requests(id bigint,rider_id uuid,amount numeric,status text,reviewed_at timestamptz,reviewed_by uuid,admin_note text);
CREATE TABLE delivery_settlements(id uuid,rider_id uuid,rider_amount numeric,status text);
CREATE TABLE rider_daily_bonuses(rider_id uuid,qualifying_settlement_id uuid,amount numeric,qualifying_date date);`);
for(const [file,name] of [
['20270105_admin_mutation_hardening.sql','_admin_audit'],['20270105_admin_mutation_hardening.sql','admin_reject_withdrawal'],['20270108_admin_support_workspaces.sql','admin_review_issue_report'],['20261209_fix_replacement_payment_duplicate.sql','store_replacement_payment_checkout'],['20261211_fix_customer_cancellation.sql','request_customer_cancellation'],['20270107_admin_delivery_assignment.sql','admin_assign_delivery_rider'],['20261114_financial_transfer_balance_webhook_repair.sql','_calculate_rider_balance'],['20261107_delivery_settlement_withdrawal_reconciliation.sql','guard_withdrawal_state_transition']]) await db.exec(fn(file,name));
await db.exec(`CREATE TRIGGER withdrawal_guard BEFORE UPDATE OF status ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION guard_withdrawal_state_transition();
INSERT INTO issue_reports(id,status) VALUES('00000000-0000-0000-0000-000000000002','Open');
INSERT INTO orders(id,user_id,status,total,additional_amount_due,payment_status,delivery_method) VALUES('00000000-0000-0000-0000-000000000003',auth.uid(),'Ready for pickup',1000,100,'success','rider');
INSERT INTO payments(order_id,reference,amount,status,payment_type,replacement_obligation_id) VALUES('00000000-0000-0000-0000-000000000003','existing',100,'pending','replacement','00000000-0000-0000-0000-000000000003');
INSERT INTO riders VALUES('00000000-0000-0000-0000-000000000004',auth.uid(),'approved',true);`);
async function probe(name,sql){try{console.log(name,JSON.stringify((await db.query(sql)).rows));}catch(e){console.log(name,'ERROR',e.code,e.message);}}
await probe('support-review',`SELECT admin_review_issue_report('00000000-0000-0000-0000-000000000002','Resolved','done')`);
await probe('replacement-checkout',`SELECT store_replacement_payment_checkout('00000000-0000-0000-0000-000000000003','new',100,'https://example.com','test')`);
await probe('customer-cancellation',`SELECT request_customer_cancellation('00000000-0000-0000-0000-000000000003','test')`);
await probe('assign-ready-order',`SELECT admin_assign_delivery_rider('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004')`);
await db.exec(`INSERT INTO delivery_settlements VALUES('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004',1000,'pending'); INSERT INTO withdrawal_requests(id,rider_id,amount,status) VALUES(1,'00000000-0000-0000-0000-000000000004',1000,'approved'); INSERT INTO transfers(id,withdrawal_request_id,status,amount) VALUES(gen_random_uuid(),1,'processing',1000);`);
await probe('balance-before-reject',`SELECT _calculate_rider_balance('00000000-0000-0000-0000-000000000004')`);
await probe('reject-processing-withdrawal',`SELECT admin_reject_withdrawal(1,'test')`);
await probe('balance-after-reject',`SELECT _calculate_rider_balance('00000000-0000-0000-0000-000000000004')`);
await db.exec(`CREATE TABLE refunds(id uuid,order_id uuid,payment_id uuid,status text); ALTER TABLE transfers ADD COLUMN transfer_kind text; CREATE TABLE financial_resolution_reservations(order_id uuid PRIMARY KEY,owner text,state text,payment_id uuid,refund_id uuid,cancellation_id uuid);`);
const backfill=fs.readFileSync(path.join(root,'supabase/migrations/20261223_financial_resolution_exclusivity.sql'),'utf8');
await db.exec(backfill.slice(backfill.indexOf('INSERT INTO public.financial_resolution_reservations'),backfill.indexOf('CREATE OR REPLACE FUNCTION')));
await probe('reservation-without-refund-or-reimbursement',`SELECT * FROM financial_resolution_reservations`);
await db.exec(fn('20261227_financial_resolution_proof_hardening.sql','reserve_financial_resolution'));
await probe('refund-reservation-after-backfill',`SELECT reserve_financial_resolution('00000000-0000-0000-0000-000000000003','refund')`);
await db.exec(`CREATE ROLE authenticated; GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT,UPDATE ON public.issue_reports TO authenticated; ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY; CREATE POLICY issue_reports_select_admin ON issue_reports FOR SELECT USING(public.is_admin()); CREATE POLICY issue_reports_update_admin ON issue_reports FOR UPDATE USING(public.is_admin()) WITH CHECK(public.is_admin()); CREATE OR REPLACE FUNCTION public.require_admin_aal2() RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AAL2 required'; END $$; SET ROLE authenticated;`);
await probe('aal1-admin-rpc',`SELECT admin_review_issue_report('00000000-0000-0000-0000-000000000002','Resolved','rpc')`);
await probe('aal1-admin-direct-write',`UPDATE issue_reports SET status='Resolved',admin_response='direct write bypass' WHERE id='00000000-0000-0000-0000-000000000002' RETURNING status,admin_response`);
await db.exec('RESET ROLE');
await probe('support-audit-rows-after-direct-write',`SELECT count(*) FROM admin_action_audit WHERE entity_type='issue_report'`);
await db.close();}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
