const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { database, asUser, root } = require('./database.cjs');
let passed = 0;
async function check(name, run) { await run(); console.log('PASS '+name); passed++; }
async function main() {
  const db = await database('20270109');
  const q = async (sql, params=[]) => (await db.query(sql,params)).rows;
  async function user(role='user') {
    const id=randomUUID();
    await q('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,id+'@test.invalid']);
    await q("INSERT INTO public.profiles(id,role,full_name) VALUES($1,'user',$2)",[id,role]);
    if (role !== 'user') {
      // Production's first admin is provisioned by a trusted SQL operator.
      // Mirror only that bootstrap action; runtime paths remain fully enabled.
      await db.exec('ALTER TABLE public.profiles DISABLE TRIGGER USER');
      try { await q('UPDATE public.profiles SET role=$2 WHERE id=$1',[id,role]); }
      finally { await db.exec('ALTER TABLE public.profiles ENABLE TRIGGER USER'); }
    }
    return id;
  }
  const admin=await user('admin'), customer=await user(), riderUser=await user();
  const rider=randomUUID();
  await q(`INSERT INTO riders(id,user_id,matric_number,phone,status,available) VALUES($1,$2,'TEST','08000000000','approved',true)`,[rider,riderUser]);
  const adminCall=(sql,params=[],aal='aal2')=>asUser(db,admin,aal,tx=>tx.query(sql,params));
  const customerCall=(sql,params=[])=>asUser(db,customer,'aal1',tx=>tx.query(sql,params));
  const service=(sql,params=[])=>asUser(db,null,'aal2',tx=>tx.query(sql,params),'service_role');
  async function order(options={}) {
    const id=randomUUID();
    await q(`INSERT INTO orders(id,order_number,user_id,total,subtotal,fee,status,payment_status,delivery_method,request_type)
      VALUES($1,$2,$3,1000,1000,0,$4,$5,'rider','restaurant')`,[id,'TEST-'+id,customer,options.status||'Order confirmed',options.payment||'success']);
    return id;
  }
  async function payment(oid,type='product',status='success') {
    return (await q(`INSERT INTO payments(order_id,reference,amount,status,payment_type,replacement_obligation_id)
      VALUES($1,$2,1000,$3,$4,CASE WHEN $4='replacement' THEN $1::uuid ELSE NULL END) RETURNING id`,[oid,'pay-'+randomUUID(),status,type]))[0].id;
  }
  try {
    const cancelled=await order(); await payment(cancelled);
    const replacement=await order();
    await q('UPDATE orders SET additional_amount_due=1000 WHERE id=$1',[replacement]);
    await payment(replacement,'replacement','pending');
    const report=(await q(`INSERT INTO issue_reports(user_id,subject,description) VALUES($1,'Test','Test') RETURNING id`,[customer]))[0].id;
    await check('original cancellation ambiguity is reproduced',()=>assert.rejects(customerCall('SELECT request_customer_cancellation($1,$2)',[cancelled,'test']),e=>e.code==='42702'));
    await check('original replacement ambiguity is reproduced',()=>assert.rejects(service('SELECT store_replacement_payment_checkout($1,$2,1000,$3,$4)',[replacement,'replacement-ref','https://checkout.test','access']),e=>e.code==='42702'));
    await check('original support audit signature failure is reproduced',()=>assert.rejects(adminCall('SELECT admin_review_issue_report($1,$2,$3)',[report,'Resolved','done']),e=>e.code==='42883'));

    const earned=await order({status:'Delivered'});
    await q(`INSERT INTO delivery_settlements(order_id,rider_id,delivery_fee,rider_amount,platform_amount) VALUES($1,$2,1500,1000,500)`,[earned,rider]);
    await q(`INSERT INTO transfer_recipients(payee_type,profile_id,recipient_code,recipient_status,is_active) VALUES('rider',$1,'RCP_TEST','verified',true)`,[riderUser]);
    const withdrawal=(await asUser(db,riderUser,'aal1',tx=>tx.query(`SELECT request_withdrawal(1000,'Test','0123456789','Test Bank','058') AS w`))).rows[0].w.withdrawal_id;
    const approval=(await service('SELECT approve_withdrawal_for_payout($1,$2) AS t',[withdrawal,admin])).rows[0].t;
    await service('SELECT claim_transfer_for_execution($1)',[approval.transfer_id]);
    const balance=async()=>Number((await service('SELECT _calculate_rider_balance($1) AS b',[rider])).rows[0].b.available_balance);
    await check('original processing rejection releases money',async()=>{
      assert.equal(await balance(),0);
      await adminCall('SELECT admin_reject_withdrawal($1,$2)',[withdrawal,'original defect']);
      assert.equal(await balance(),1000);
    });

    // Seed the exact bad historical backfill row for a normal paid order.
    const normal=await order(); await payment(normal);
    await q(`INSERT INTO financial_resolution_reservations(order_id,owner,state) VALUES($1,'reimbursement','reserved')`,[normal]);
    await check('original false reservation blocks refund',()=>assert.rejects(service(`SELECT reserve_financial_resolution($1,'refund')`,[normal]),/already owned/));
    // Evidence fixtures before corrective backfill. Ledger INSERTs as owner are
    // fixture setup, not an exposed client path; normal triggers remain enabled.
    const refundOnly=await order(), terminal=await order();
    // This obsolete historical constraint is removed by 20270112. Remove it
    // before constructing pre-repair evidence fixtures it otherwise forbids.
    await db.exec('ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_one_payout_source_check');
    await db.exec('ALTER TABLE public.refunds DISABLE TRIGGER USER; ALTER TABLE public.transfers DISABLE TRIGGER USER');
    for(const [oid,status] of [[refundOnly,'approved'],[terminal,'processed']]) {
      const pid=await payment(oid);
      await q('INSERT INTO refunds(order_id,payment_id,amount,status) VALUES($1,$2,1000,$3)',[oid,pid,status]);
    }
    const reimbursement=await order(), conflict=await order();
    await q(`INSERT INTO transfer_recipients(payee_type,profile_id,recipient_code,recipient_status,is_active) VALUES('customer',$1,'RCP_CUSTOMER','verified',true)`,[customer]);
    for(const oid of [reimbursement,conflict]) {
      const cid=(await q(`INSERT INTO cancellations(order_id,initiated_by,reason,stage,reimbursement_amount) VALUES($1,$2,'test','eligible_for_reimbursement',1000) RETURNING id`,[oid,customer]))[0].id;
      await q(`INSERT INTO transfers(transfer_kind,cancellation_id,attempt_no,payee_type,amount,currency,status,paystack_reference,recipient_code) VALUES('customer_reimbursement',$1,1,'customer',1000,'NGN','pending',$2,'RCP_CUSTOMER')`,[cid,'reimburse-'+oid]);
      if(oid===conflict) { const pid=await payment(oid); await q(`INSERT INTO refunds(order_id,payment_id,amount,status) VALUES($1,$2,1000,'approved')`,[oid,pid]); }
    }
    await db.exec('ALTER TABLE public.refunds ENABLE TRIGGER USER; ALTER TABLE public.transfers ENABLE TRIGGER USER');
    const migrationDir=path.join(root,'supabase/migrations');
    for(const file of fs.readdirSync(migrationDir).filter(n=>n.split('_')[0]>'20270109').sort()) {
      try { await db.exec(fs.readFileSync(path.join(migrationDir,file),'utf8')); }
      catch (error) { throw new Error(`Corrective migration ${file}: ${error.message}`, {cause:error}); }
      console.log('Applied corrective migration '+file);
    }
    const riderCall=(userId,sql,params=[])=>asUser(db,userId,'aal1',tx=>tx.query(sql,params));
    const claimOrder=async(userId,orderId)=>(await riderCall(userId,'SELECT claim_order($1) AS result',[orderId])).rows[0].result;
    const claimUser=await user(), claimRider=randomUUID();
    await q(`INSERT INTO riders(id,user_id,matric_number,phone,status,available) VALUES($1,$2,'CLAIM','08000000004','approved',true)`,[claimRider,claimUser]);
    async function claimFixture(options={}) {
      const id=randomUUID();
      await q(`INSERT INTO orders(
        id,order_number,user_id,total,subtotal,fee,status,payment_status,
        delivery_method,request_type,vendor_delivery_requested,delivery_payment_status,rider_id
      ) VALUES($1,$2,$3,1000,1000,$4,$5,$6,$7,$8,$9,$10,$11)`,[
        id,'CLAIM-'+id,options.customer||customer,options.fee||0,
        options.status||'Order confirmed',options.payment||'success',
        options.deliveryMethod||'rider',options.requestType||'restaurant',
        options.vendorRequested??false,options.deliveryPayment||'pending',options.riderId||null
      ]);
      return id;
    }
    await check('rider claim RPCs install with authenticated-only grants',async()=>{
      const routines=await q(`SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
        WHERE n.nspname='public' AND proname IN ('claim_order','get_rider_details_for_orders')`);
      assert.deepEqual(new Set(routines.map(row=>row.proname)),new Set(['claim_order','get_rider_details_for_orders']));
      const oid=await claimFixture();
      await assert.rejects(claimOrder(customer,oid),error=>error.code==='42501' && /Rider not found/.test(error.message));
    });
    await check('eligible paid restaurant order is claimed through final triggers',async()=>{
      const oid=await claimFixture();
      const result=await claimOrder(claimUser,oid);
      assert.equal(result.rider_id,claimRider); assert.equal(result.status,'Rider assigned');
      const stored=(await q('SELECT rider_id,status FROM orders WHERE id=$1',[oid]))[0];
      assert.equal(stored.rider_id,claimRider); assert.equal(stored.status,'Rider assigned');
    });
    await check('already assigned and double claim are rejected with useful messages',async()=>{
      const riderUser2=await user(), rider2=randomUUID();
      await q(`INSERT INTO riders(id,user_id,matric_number,phone,status,available) VALUES($1,$2,'CLAIM2','08000000002','approved',true)`,[rider2,riderUser2]);
      const oid=await claimFixture();
      await claimOrder(claimUser,oid);
      await assert.rejects(claimOrder(riderUser2,oid),/Order already has a rider assigned/);
    });
    await check('claim rejects unpaid, vendor self-delivery, and unpaid vendor delivery',async()=>{
      const unpaid=await claimFixture({payment:'pending'});
      await assert.rejects(claimOrder(claimUser,unpaid),/Order payment not successful/);
      const selfDelivery=await claimFixture({requestType:'vendor_request',deliveryMethod:'vendor_self'});
      await assert.rejects(claimOrder(claimUser,selfDelivery),/Order is not a rider delivery/);
      const unpaidVendor=await claimFixture({requestType:'vendor_request',vendorRequested:true,deliveryPayment:'pending',fee:1500});
      await assert.rejects(claimOrder(claimUser,unpaidVendor),/Vendor delivery payment not successful/);
    });
    await check('claim enforces the canonical two-active-delivery cap',async()=>{
      const capUser=await user(), capRider=randomUUID();
      await q(`INSERT INTO riders(id,user_id,matric_number,phone,status,available) VALUES($1,$2,'CAP','08000000003','approved',true)`,[capRider,capUser]);
      for(const status of ['Rider assigned','On the Way']) await claimFixture({status,riderId:capRider});
      const candidate=await claimFixture();
      await assert.rejects(claimOrder(capUser,candidate),/Rider already has 2 active deliveries \(maximum 2\)/);
      assert.equal((await q('SELECT rider_id FROM orders WHERE id=$1',[candidate]))[0].rider_id,null);
    });
    await check('batch rider details matches customer-only name-and-phone boundary',async()=>{
      const oid=await claimFixture({riderId:claimRider,status:'Rider assigned'});
      const owned=(await customerCall('SELECT * FROM get_rider_details_for_orders($1)',[[oid]])).rows[0].get_rider_details_for_orders;
      assert.deepEqual(Object.keys(owned).sort(),['full_name','order_id','phone','rider_id']);
      assert.equal(owned.rider_id,claimRider); assert.equal(owned.phone,'08000000004');
      assert.equal((await riderCall(claimUser,'SELECT * FROM get_rider_details_for_orders($1)',[[oid]])).rows.length,0);
      assert.equal((await adminCall('SELECT * FROM get_rider_details_for_orders($1)',[[oid]])).rows.length,0);
    });
    await check('processing transfer stays reserved even with historical rejected status',async()=>assert.equal(await balance(),0));
    await check('rejecting processing withdrawal fails and preserves reservation',async()=>{
      await assert.rejects(adminCall('SELECT admin_reject_withdrawal($1,$2)',[withdrawal,'retry']),/cannot be rejected|active/);
      assert.equal(await balance(),0);
    });
    await check('duplicate approval returns same transfer, duplicate claim cannot execute',async()=>{
      const a=(await service('SELECT approve_withdrawal_for_payout($1,$2) AS t',[withdrawal,admin])).rows[0].t;
      assert.equal(a.transfer_id,approval.transfer_id);
      assert.equal((await service('SELECT claim_transfer_for_execution($1) AS t',[a.transfer_id])).rows[0].t.claim,false);
    });
    const reference=(await q('SELECT paystack_reference FROM transfers WHERE id=$1',[approval.transfer_id]))[0].paystack_reference;
    await check('success and duplicate webhook withdraw once',async()=>{
      for(let i=0;i<2;i++) await service(`SELECT apply_transfer_webhook_event($1,'TRF_TEST','success','{}')`,[reference]);
      const b=(await service('SELECT _calculate_rider_balance($1) AS b',[rider])).rows[0].b;
      assert.equal(Number(b.withdrawn_amount),1000); assert.equal(Number(b.available_balance),0);
      assert.equal((await q('SELECT status FROM withdrawal_requests WHERE id=$1',[withdrawal]))[0].status,'paid');
    });
    await check('provider reversal releases once and preserves attempt history',async()=>{
      for(let i=0;i<2;i++) await service(`SELECT apply_transfer_webhook_event($1,'TRF_TEST','reversed','{}')`,[reference]);
      assert.equal(await balance(),1000);
      assert.equal((await q('SELECT status FROM withdrawal_requests WHERE id=$1',[withdrawal]))[0].status,'rejected');
      assert.equal((await q('SELECT count(*) AS n FROM rider_payout_reconciliation_attempts WHERE withdrawal_request_id=$1',[withdrawal]))[0].n,1);
    });
    await check('contradictory late success holds funds for admin resolution',async()=>{
      await service(`SELECT apply_transfer_webhook_event($1,'TRF_TEST','success','{}')`,[reference]);
      assert.equal(await balance(),0);
      assert.equal((await q('SELECT payout_resolution_required FROM withdrawal_requests WHERE id=$1',[withdrawal]))[0].payout_resolution_required,true);
      await assert.rejects(service('SELECT approve_withdrawal_for_payout($1,$2)',[withdrawal,admin]),/reconciliation/);
    });
    await check('reservation backfill normal/refund/reimbursement/conflict/terminal fixtures',async()=>{
      assert.equal((await q('SELECT * FROM financial_resolution_reservations WHERE order_id=$1',[normal])).length,0);
      for(const [oid,owner,state] of [[refundOnly,'refund','reserved'],[reimbursement,'reimbursement','reserved'],[conflict,'conflict','admin_resolution_required'],[terminal,'refund','terminal']]) {
        const r=(await q('SELECT * FROM financial_resolution_reservations WHERE order_id=$1',[oid]))[0];
        assert.equal(r.owner,owner); assert.equal(r.state,state);
      }
      await service(`SELECT reserve_financial_resolution($1,'refund')`,[normal]);
      await assert.rejects(service(`SELECT reserve_financial_resolution($1,'reimbursement')`,[normal]),/already owned/);
      await assert.rejects(service(`SELECT reserve_financial_resolution($1,'refund')`,[conflict]),/already owned/);
    });
    await check('eligible paid cancellation completes through real triggers',async()=>{
      const result=(await customerCall('SELECT request_customer_cancellation($1,$2) AS c',[cancelled,'test'])).rows[0].c;
      assert.equal(result.stage,'eligible_for_reimbursement'); assert.equal(Number(result.reimbursement_amount),1000);
      assert.equal((await q('SELECT status FROM orders WHERE id=$1',[cancelled]))[0].status,'Cancelled');
    });
    await check('unpaid cancellation resolves without reimbursement',async()=>{
      const oid=await order({payment:'pending'});
      const c=(await customerCall('SELECT request_customer_cancellation($1,$2) AS c',[oid,'test'])).rows[0].c;
      assert.equal(c.stage,'resolved'); assert.equal(c.reimbursement_amount,null);
    });
    await check('replacement checkout persists provider metadata and retains pricing',async()=>{
      await service('SELECT store_replacement_payment_checkout($1,$2,1000,$3,$4)',[replacement,'replacement-ref','https://checkout.test','access']);
      const p=(await q('SELECT * FROM payments WHERE order_id=$1',[replacement]))[0];
      assert.equal(p.reference,'replacement-ref'); assert.equal(p.authorization_url,'https://checkout.test'); assert.equal(p.access_code,'access'); assert.equal(Number(p.amount),1000);
      await assert.rejects(service('SELECT store_replacement_payment_checkout($1,$2,1,$3,$4)',[replacement,'bad','url','bad']),/amount mismatch/);
    });
    await check('AAL1 sensitive direct writes and RPC rejected, AAL2 direct write rejected',async()=>{
      for(const aal of ['aal1','aal2']) await assert.rejects(adminCall(`UPDATE issue_reports SET status='Resolved' WHERE id=$1`,[report],aal),/permission denied/);
      await assert.rejects(adminCall('SELECT admin_review_issue_report($1,$2,$3)',[report,'Resolved','done'],'aal1'),/AAL2/);
      for(const table of ['orders','products','vendors','riders','profiles']) {
        // Statement triggers are row-based; security tests below use actual rows.
        assert.equal((await q(`SELECT count(*) AS n FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='trg_reject_direct_admin_mutation'`,[table]))[0].n,1);
      }
      await assert.rejects(adminCall(`UPDATE orders SET spot='bypass' WHERE id=$1`,[normal]),/audited AAL2/);
      await assert.rejects(adminCall(`UPDATE profiles SET full_name='bypass' WHERE id=$1`,[customer]),/audited AAL2/);
    });
    await check('AAL2 support RPC succeeds, audits, and rejects reopening',async()=>{
      await adminCall('SELECT admin_review_issue_report($1,$2,$3)',[report,'Resolved','done']);
      assert.equal((await q('SELECT status FROM issue_reports WHERE id=$1',[report]))[0].status,'Resolved');
      assert.equal((await q(`SELECT count(*) AS n FROM admin_action_audit WHERE entity_type='issue_report' AND entity_id=$1`,[report]))[0].n,1);
      await assert.rejects(adminCall('SELECT admin_review_issue_report($1,$2,$3)',[report,'Open','bad']),/Invalid report state/);
    });
    await check('normal AAL2 admin order RPC remains functional and audited',async()=>{
      const oid=await order();
      await adminCall('SELECT admin_update_order_status($1,$2)',[oid,'Preparing']);
      assert.equal((await q('SELECT status FROM orders WHERE id=$1',[oid]))[0].status,'Preparing');
      assert.equal((await q(`SELECT count(*) AS n FROM admin_action_audit WHERE entity_type='order' AND entity_id=$1`,[oid]))[0].n,1);
    });
    await check('admin rider assignment produces a progressable lifecycle',async()=>{
      const ready=await order({status:'Ready for pickup'});
      const assigned=(await adminCall('SELECT admin_assign_delivery_rider($1,$2) AS a',[ready,rider])).rows[0].a;
      assert.equal(assigned.status,'Rider assigned');
      await asUser(db,riderUser,'aal1',tx=>tx.query(`UPDATE orders SET status='Picked up' WHERE id=$1`,[ready]));
      assert.equal((await q('SELECT status FROM orders WHERE id=$1',[ready]))[0].status,'Picked up');
    });
    await check('reassignment preserves in-progress state and vendor delivery eligibility',async()=>{
      const riderUser2=await user(), rider2=randomUUID();
      await q(`INSERT INTO riders(id,user_id,matric_number,phone,status,available) VALUES($1,$2,'TEST2','08000000001','approved',true)`,[rider2,riderUser2]);
      const oid=randomUUID();
      await q(`INSERT INTO orders(id,order_number,user_id,total,subtotal,fee,status,payment_status,delivery_method,request_type,
        vendor_delivery_requested,delivery_payment_status,rider_id)
        VALUES($1,$2,$3,1000,1000,1500,'Picked up','pending_vendor','rider','vendor_request',true,'success',$4)`,
        [oid,'VENDOR-'+oid,customer,rider]);
      const reassigned=(await adminCall('SELECT admin_assign_delivery_rider($1,$2) AS a',[oid,rider2])).rows[0].a;
      assert.equal(reassigned.status,'Picked up'); assert.equal(reassigned.rider_id,rider2);
      await asUser(db,riderUser2,'aal1',tx=>tx.query(`UPDATE orders SET status='On the Way' WHERE id=$1`,[oid]));
    });
    await check('authoritative admin metrics exceed a single API response page',async()=>{
      await q(`INSERT INTO orders(id,order_number,user_id,total,subtotal,fee,status,payment_status,delivery_method,request_type)
        SELECT gen_random_uuid(),'BULK-'||g,$1,10,10,0,'Order confirmed','pending','rider','restaurant' FROM generate_series(1,1105) g`,[customer]);
      const metrics=(await adminCall('SELECT admin_get_dashboard_metrics() AS m')).rows[0].m;
      const actual=Number((await q('SELECT count(*) AS n FROM orders'))[0].n);
      assert.equal(Number(metrics.total_orders),actual); assert.ok(actual>1000);
    });
    console.log(`${passed} executable database regression scenarios passed.`);
  } finally { await db.close(); }
}
main().catch(e=>{console.error(e.message); if(e.cause)console.error(e.cause.message); process.exitCode=1;});
