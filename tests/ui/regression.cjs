const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'../..');
const appSource=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const adminSource=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
const swSource=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const dispatcherSource=fs.readFileSync(path.join(root,'supabase/functions/push-dispatcher/index.ts'),'utf8');
const shellSource=fs.readFileSync(path.join(root,'assets/html/index.html'),'utf8');
const netlifyConfig=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');

assert.match(appSource,/rpc\(['"]update_rider_order_status['"]/);
assert.doesNotMatch(appSource,/from\(['"]orders['"]\)\s*\.update\(\{ status: nextStatus \}\)/);
assert.match(appSource,/\[400,401,403,404\]\.includes\(status\)/);
assert.match(swSource,/dropzyy-static-__DROPZYY_BUILD_ID__/);
assert.doesNotMatch(swSource,/u\.pathname === '\/assets\/js\/app\.js'/);
assert.doesNotMatch(swSource,/skipWaiting|clients\.claim/);
assert.match(swSource,/k\.startsWith\('dropzyy-static-'/);
assert.match(appSource,/DROPZYY_BUILD_ID/);
assert.match(appSource,/initialBootCatalog/);
assert.doesNotMatch(appSource,/Enable phone alerts/);
assert.match(appSource,/function renderCustomerActiveOrders\(\)[\s\S]*?Your active orders/);
assert.match(shellSource,/id="notifList"/);
assert.match(shellSource,/id="notifCount"/);
assert.match(appSource,/Order alerts/);
assert.match(appSource,/data-enable-push/);
assert.match(dispatcherSource,/order_number/);
assert.match(dispatcherSource,/target_url/);
assert.match(dispatcherSource,/replacement\|unavailable\|payment/);
assert.match(swSource,/showNotification/);
assert.match(swSource,/notificationclick/);
assert.match(swSource,/target_url/);
const unavailableMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270129_unavailable_push_notification.sql'),'utf8');
assert.match(unavailableMigration,/Dropzyy — Item unavailable/);
assert.match(unavailableMigration,/order_number/);
assert.match(unavailableMigration,/trg_queue_notification_push|20270125/);
const fallbackAt=netlifyConfig.indexOf('from = "/*"');
assert.notEqual(fallbackAt,-1);
for (const blocked of ['/.env','/.env.*','/.git/*','/supabase/*','/scripts/*','/tests/*','/package.json','/package-lock.json','/netlify.toml','/*.bak','/*.old','/*.backup','/*.tmp','/*.sql','/*.ps1','/*.yml','/*.yaml']) {
  const ruleAt=netlifyConfig.indexOf(`from = "${blocked}"`);
  assert.ok(ruleAt !== -1 && ruleAt < fallbackAt, `sensitive path is not blocked before SPA fallback: ${blocked}`);
}
assert.match(netlifyConfig,/from = "\/assets\/\*"[\s\S]*?status = 200/);
assert.match(netlifyConfig,/from = "\/\*"[\s\S]*?to = "\/assets\/html\/index\.html"[\s\S]*?status = 200/);
const gitignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
for (const ignored of ['*.bak','*.old','*.backup','*.tmp','*.dump','*.sql.dump','*.sql.gz']) assert.ok(gitignore.split(/\r?\n/).includes(ignored), `missing gitignore rule: ${ignored}`);

function sourceBetween(start,end){
  const a=appSource.indexOf(start),b=appSource.indexOf(end,a);
  assert.notEqual(a,-1,`missing source marker: ${start}`);
  assert.notEqual(b,-1,`missing source marker: ${end}`);
  return appSource.slice(a,b);
}

function refundDisplayRegression(){
  const refundFns=sourceBetween('function getOrderRefunds(', '// Customer-friendly refund status label.');
  const displayFns=sourceBetween('function classifyRefund(', '// Submit a refund request for an order.');
  const context=vm.createContext({
    state:{refunds:[]},
    esc:value=>String(value??''),
    money:value=>`₦${Number(value).toLocaleString('en-NG')},`,
    Date,Number,String,Boolean
  });
  vm.runInContext(refundFns+displayFns,context);
  const run=(order,refunds)=>{
    context.state.refunds=refunds;
    return vm.runInContext(`orderCardRefundUi(${JSON.stringify(order)}) + orderAdjustmentUi(${JSON.stringify(order)})`,context);
  };
  assert.equal(run({dbId:'order-a'},[]),'');
  assert.equal(run({dbId:'order-a'},[{order_id:'order-b',status:'approved',created_at:'2026-01-02'}]),'');
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'approved',amount:500,created_at:'2026-01-02'}]),/refund pending for replacement item/);
  assert.doesNotMatch(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'approved',amount:500,created_at:'2026-01-02'}]),/Refund: Refund approved/);
  assert.match(run({dbId:'order-a',status:'Cancelled'},[{order_id:'order-a',refund_kind:'full_order',status:'requested',created_at:'2026-01-02'}]),/Refund pending/);
  assert.match(run({dbId:'order-a',status:'Cancelled'},[{order_id:'order-a',refund_kind:'full_order',status:'processed',created_at:'2026-01-02'}]),/Refund completed/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'full_order',status:'processing',created_at:'2026-01-02'}]),/Refund processing/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'processed',amount:300,created_at:'2026-01-01'},{order_id:'order-a',refund_kind:'replacement_adjustment',status:'pending',amount:200,created_at:'2026-01-02'}]),/₦300, refund completed for replacement item[\s\S]*₦200, refund pending/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'processed',amount:500,created_at:'2026-01-01'},{order_id:'order-a',refund_kind:'full_order',status:'requested',created_at:'2026-01-02'}]),/Refund: Refund pending[\s\S]*₦500, refund completed for replacement item/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'full_order',status:'failed',created_at:'2026-01-01'}]),/Refund failed/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'full_order',status:'rejected',created_at:'2026-01-01'}]),/Refund rejected/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'processing',amount:500,created_at:'2026-01-01'}]),/refund processing for replacement item/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'failed',amount:500,created_at:'2026-01-01'}]),/refund failed for replacement item/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',status:'rejected',amount:500,created_at:'2026-01-01'}]),/refund rejected for replacement item/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',adjustment_kind:'removed_item',status:'approved',amount:500,created_at:'2026-01-01'}]),/₦500, refund pending for removed item/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',adjustment_kind:'removed_item',status:'processed',amount:500,created_at:'2026-01-01'}]),/₦500, refund completed for removed item/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',adjustment_kind:'removed_item',status:'failed',amount:500,created_at:'2026-01-01'}]),/₦500, removed-item refund failed/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'replacement_adjustment',adjustment_kind:'removed_item',status:'rejected',amount:500,created_at:'2026-01-01'}]),/₦500, removed-item refund rejected/);
  assert.doesNotMatch(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'legacy_unknown',status:'processed',amount:500,created_at:'2026-01-01'}]),/Refund: Refund completed/);
  assert.match(run({dbId:'order-a'},[{order_id:'order-a',refund_kind:'legacy_unknown',status:'processed',amount:500,created_at:'2026-01-01'}]),/Financial adjustment: Update completed/);
  assert.match(sourceBetween('async function orders()', 'async function vendorRequestsView'),/customerOrderStatusBadge\(o\)/);
  assert.match(sourceBetween('function customerOrderStatusBadge(o)', 'function vendorDeliveryStatusMessage'),/Product check in progress/);
  assert.match(appSource,/table: 'refunds'/);
  assert.match(appSource,/refreshCustomerOrderRefunds\(orderId\)/);
  assert.match(appSource,/refund_kind/);
  assert.match(appSource,/adjustment_kind/);
  assert.match(appSource,/source_order_item_id/);
  assert.match(appSource,/automaticAdjustmentPending/);
  const removedItemRefundMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270213_removed_item_refunds.sql'),'utf8');
  assert.match(removedItemRefundMigration,/source_order_item_id uuid REFERENCES public\.order_items\(id\)/);
  assert.match(removedItemRefundMigration,/adjustment_kind text/);
  assert.match(removedItemRefundMigration,/removed_item/);
  assert.match(removedItemRefundMigration,/cheaper_replacement/);
  assert.match(removedItemRefundMigration,/uq_refunds_active_item_adjustment/);
  assert.match(removedItemRefundMigration,/ensure_order_item_refund_obligations/);
  assert.match(removedItemRefundMigration,/adjustment_amount := public\.ensure_order_item_refund_obligations/);
  assert.match(removedItemRefundMigration,/remaining_product_refund_amount/);
  assert.match(removedItemRefundMigration,/status='processed'/);
  assert.match(removedItemRefundMigration,/apply_refund_result/);
  assert.match(removedItemRefundMigration,/refund_kind='full_order'/);
  assert.match(removedItemRefundMigration,/refund_kind='replacement_adjustment'/);
  const classificationMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270131_refund_kind_realtime_hardening.sql'),'utf8');
  assert.match(classificationMigration,/DEFAULT 'legacy_unknown'/);
  assert.match(classificationMigration,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.refunds/);
  assert.match(classificationMigration,/refund_kind\)\s*VALUES/);
  assert.doesNotMatch(classificationMigration,/CREATE OR REPLACE FUNCTION public\.classify_refund_kind_on_insert/);
  const rewardsFoundation=fs.readFileSync(path.join(root,'supabase/migrations/20270201_rewards_promotions_foundation.sql'),'utf8');
  const lifecycleMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270202_promotion_reservation_lifecycle.sql'),'utf8');
  const expiryMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270203_promotion_expiry_vendor_delivery.sql'),'utf8');
  const adminCouponMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270204_coupon_admin_management.sql'),'utf8');
  const notificationMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270205_rewards_notifications.sql'),'utf8');
  const phase4Migration=fs.readFileSync(path.join(root,'supabase/migrations/20270206_phase4_promotion_hardening.sql'),'utf8');
  const phase5Migration=fs.readFileSync(path.join(root,'supabase/migrations/20270207_promotion_refund_restoration.sql'),'utf8');
  const phase4DbTests=fs.readFileSync(path.join(root,'tests/db/rewards_phase4.sql'),'utf8');
  const phase5DbTests=fs.readFileSync(path.join(root,'tests/db/rewards_phase5.sql'),'utf8');
  const firstOrderDbTests=fs.readFileSync(path.join(root,'tests/db/first_order_coupon.sql'),'utf8');
  assert.match(rewardsFoundation,/customer_credit_ledger/);
  assert.match(rewardsFoundation,/issue_customer_signup_reward/);
  assert.match(rewardsFoundation,/qualify_referral_on_delivery/);
  assert.match(lifecycleMigration,/credit_reservation_allocations/);
  assert.match(lifecycleMigration,/finalize_delivery_promotion/);
  assert.match(lifecycleMigration,/release_delivery_promotion/);
  assert.match(expiryMigration,/interval '30 minutes'/);
  assert.match(expiryMigration,/release_expired_promotion_reservations/);
  assert.match(expiryMigration,/create_vendor_delivery_payment/);
  assert.match(adminCouponMigration,/require_admin_aal2/);
  assert.match(adminCouponMigration,/admin_coupon_usage/);
  assert.match(notificationMigration,/trg_notify_reward_credit_issued/);
  assert.match(phase4Migration,/promotion_reservations_one_active_per_order/);
  assert.match(phase4Migration,/replace_delivery_promotion/);
  assert.match(phase4Migration,/release_my_delivery_promotion/);
  assert.match(phase4Migration,/status <> 'success'/);
  assert.match(appSource,/data-apply-delivery-promotion/);
  assert.match(appSource,/replace_delivery_promotion/);
  assert.match(appSource,/release_my_delivery_promotion/);
  assert.match(adminSource,/admin_update_coupon/);
  assert.match(adminSource,/data-coupon-edit/);
  assert.match(phase4DbTests,/Credit concurrency/);
  assert.match(phase4DbTests,/Coupon concurrency/);
  assert.match(phase4DbTests,/ROLLBACK/);
  assert.match(phase5Migration,/promotion_restorations/);
  assert.match(phase5Migration,/refund_kind<>'full_order'/);
  assert.match(phase5Migration,/refund_not_full_amount/);
  assert.match(phase5Migration,/coupon_redemptions_status_check/);
  assert.match(phase5Migration,/status='reversed'/);
  assert.match(phase5Migration,/trg_restore_promotion_after_refund/);
  assert.match(phase5Migration,/trg_restore_promotion_after_reimbursement/);
  assert.match(phase5Migration,/ALTER PUBLICATION supabase_realtime ADD TABLE public\.customer_credit_ledger/);
  assert.match(appSource,/customerRewardsChannel/);
  assert.match(appSource,/promotion_restorations/);
  assert.match(appSource,/final_resolution_complete/);
  assert.match(appSource,/function loadAssignedOrderEnriched\(dbId\)/);
  assert.match(appSource,/no_funding_required/);
  const removalMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270209_rider_post_removal_resolution.sql'),'utf8');
  assert.match(removalMigration,/customer_remove_unavailable_item/);
  assert.match(removalMigration,/status='cancelled'/);
  assert.match(removalMigration,/product_availability_status='in_progress'/);
  assert.match(removalMigration,/funding_amount<=0/);
  assert.match(removalMigration,/purchase_funding_status='not_required'/);
  const riderAvailability=sourceBetween('function riderAvailabilityHtml(', 'function rider()');
  const riderContext=vm.createContext({
    esc:value=>String(value??''), money:value=>`₦${Number(value||0).toLocaleString('en-NG')}`,
    Number, String, Boolean, Array
  });
  vm.runInContext(riderAvailability,riderContext);
  const riderCard=(order)=>vm.runInContext(`riderAvailabilityHtml(${JSON.stringify(order)})`,riderContext);
  assert.match(riderCard({id:'A',status:'Rider assigned',product_availability_status:'in_progress',final_resolution_complete:true,additional_amount_due:0,final_financial_status:'settled',items:[{name:'Chicken',qty:1,availability_state:'available'}]}),/Confirm products & request funding/);
  assert.match(riderCard({id:'A',status:'Rider assigned',product_availability_status:'in_progress',final_resolution_complete:true,all_items_removed:true,additional_amount_due:0,final_financial_status:'cancelled',items:[]}),/Confirm product resolution/);
  assert.doesNotMatch(riderCard({id:'A',status:'Rider assigned',product_availability_status:'in_progress',final_resolution_complete:true,all_items_removed:true,additional_amount_due:0,items:[]}),/Confirm products & request funding/);
  assert.doesNotMatch(riderCard({id:'A',status:'Rider assigned',product_availability_status:'needs_customer_decision',final_resolution_complete:false,additional_amount_due:0,items:[]}),/Confirm products & request funding/);
const allUnavailableMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270212_all_items_unavailable_cancellation.sql'),'utf8');
assert.match(allUnavailableMigration,/final_removed IS DISTINCT FROM true/);
assert.match(allUnavailableMigration,/final_resolution IS DISTINCT FROM 'removed'/);
assert.match(allUnavailableMigration,/resolve_all_items_unavailable/);
assert.match(allUnavailableMigration,/reason[\s\S]*All items unavailable/);
assert.match(allUnavailableMigration,/purchase_funding_status='not_required'/);
assert.match(allUnavailableMigration,/status='Cancelled'/);
assert.match(allUnavailableMigration,/SUM\(p\.amount\)/);
assert.match(allUnavailableMigration,/promotion_restorations/);
assert.match(allUnavailableMigration,/all_removed THEN c\.reimbursement_amount/);
assert.match(allUnavailableMigration,/trg_restore_promotion_after_reimbursement_completion/);
assert.match(appSource,/all_items_removed/);
assert.match(appSource,/Confirm product resolution/);
  assert.match(phase5DbTests,/partial refund/);
  assert.match(phase5DbTests,/expired credit/);
  assert.match(phase5DbTests,/ROLLBACK/);
  const firstOrderMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270208_first_order_coupon_eligibility.sql'),'utf8');
  assert.match(firstOrderMigration,/customer_has_prior_qualifying_order/);
  assert.match(firstOrderMigration,/is_first_order_coupon_eligible/);
  assert.match(firstOrderMigration,/p_exclude_order_id/);
  assert.match(firstOrderMigration,/order_has_authoritative_full_reversal/);
  assert.match(firstOrderMigration,/refund_kind='full_order'/);
  assert.match(firstOrderMigration,/status='processed'/);
  assert.match(firstOrderDbTests,/Partial refund/);
  assert.match(firstOrderDbTests,/current checkout order/);
  assert.match(firstOrderDbTests,/ROLLBACK/);
  console.log('PASS order-card refund mapping is order-scoped and distinguishes partial replacement refunds');
  console.log('PASS active order workflow status remains independent of refund display');
}
const homeSource=sourceBetween('function home()', 'function browse()');
assert.doesNotMatch(homeSource,/renderCustomerActiveOrders\(\)/);
assert.doesNotMatch(homeSource,/Your active orders/);
assert.doesNotMatch(homeSource,/Live updates for orders still in progress\./);
assert.match(homeSource,/Caf 2 is far\./);
assert.match(appSource,/function renderCustomerActiveOrders\(\)/);
assert.match(appSource,/function orders\(/);
assert.match(appSource,/function orderView\(/);
assert.match(appSource,/function track\(/);
assert.match(appSource,/update_rider_order_status/);
assert.match(appSource,/record_product_availability_check/);
assert.match(appSource,/Your cart already contains items from another restaurant/);
assert.match(appSource,/PACKAGING_MAX_QUANTITY/);
assert.match(appSource,/function packagingSnapshotHtml\(\)/);
assert.match(appSource,/function persistPackagingQuantity\(\)/);
assert.match(appSource,/data-cart-packaging/);
assert.match(appSource,/data-packaging-snapshot/);
assert.match(appSource,/data-copy-referral/);
assert.match(appSource,/referralCodeForSignup/);
assert.match(appSource,/packaging_quantity/);
const packagingMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270210_food_packaging_fee.sql'),'utf8');
const packagingFundingMigration=fs.readFileSync(path.join(root,'supabase/migrations/20270211_packaging_purchase_funding.sql'),'utf8');
assert.match(packagingMigration,/food_packaging_unit_price numeric/);
assert.match(packagingMigration,/packaging_quantity integer/);
assert.match(packagingMigration,/packaging_quantity >= 0 AND packaging_quantity <= 10/);
assert.match(packagingMigration,/packaging_amount=p_packaging_quantity\*v_unit_price/);
assert.match(packagingMigration,/total=subtotal\+COALESCE\(packaging_amount,0\)\+fee-discount/);
assert.match(packagingMigration,/recalculate_final_order_financials/);
assert.match(packagingFundingMigration,/food_amount numeric NOT NULL DEFAULT 0/);
assert.match(packagingFundingMigration,/packaging_amount numeric NOT NULL DEFAULT 0/);
assert.match(packagingFundingMigration,/restaurant_purchase_amount numeric NOT NULL DEFAULT 0/);
assert.match(packagingFundingMigration,/restaurant_purchase_amount = food_amount \+ packaging_amount/);
assert.match(packagingFundingMigration,/restaurant_purchase_amount := final_food_amount \+ packaging_amount/);
assert.match(packagingFundingMigration,/IF final_food_amount<=0 THEN/);
assert.match(packagingFundingMigration,/no-product\/cancellation path/);
assert.match(packagingFundingMigration,/INSERT INTO public\.purchase_funding\([\s\S]*food_amount,packaging_amount/);
assert.doesNotMatch(packagingFundingMigration,/rider_share|company_share|promotion_discount/);
const riderPurchaseSource=sourceBetween('function riderOrderItemsHtml(', 'function riderAvailabilityHtml(');
const riderPurchaseContext=vm.createContext({
  esc:value=>String(value??''), money:value=>`₦${Number(value||0).toLocaleString('en-NG')}`, Number, String, Array
});
vm.runInContext(riderPurchaseSource,riderPurchaseContext);
const riderPurchaseCard=order=>vm.runInContext(`riderOrderItemsHtml(${JSON.stringify(order)})`,riderPurchaseContext);
assert.match(riderPurchaseCard({items:[{name:'Food',qty:1,price:3000}],packaging_amount:200,final_order_total:4700}),/Food[\s\S]*₦3,200/);
assert.match(riderPurchaseCard({items:[{name:'Food',qty:1,price:3000}],packaging_amount:400,final_order_total:4900}),/Packaging[\s\S]*₦400[\s\S]*₦3,400/);
assert.doesNotMatch(riderPurchaseCard({items:[{name:'Food',qty:1,price:3000}],packaging_amount:0}),/Packaging/);
assert.doesNotMatch(riderPurchaseCard({items:[],packaging_amount:200}),/Total to restaurant/);
const packagingFns=sourceBetween('function packagingSnapshotHtml()', 'function checkout()');
const packagingContext=vm.createContext({
  money:value=>`₦${Number(value||0).toLocaleString('en-NG')}`, esc:value=>String(value??''),
  checkoutPackagingQuantity:1, foodPackagingUnitPrice:200, Number, String
});
vm.runInContext(packagingFns,packagingContext);
assert.match(vm.runInContext('packagingSnapshotHtml()',packagingContext),/1 pack/);
packagingContext.checkoutPackagingQuantity=0;
assert.match(vm.runInContext('packagingSnapshotHtml()',packagingContext),/0 pack/);
assert.match(vm.runInContext('packagingSnapshotHtml()',packagingContext),/₦0/);
packagingContext.checkoutPackagingQuantity=2;
assert.match(vm.runInContext('packagingSnapshotHtml()',packagingContext),/₦400/);
packagingContext.checkoutPackagingQuantity=10;
assert.match(vm.runInContext('packagingSnapshotHtml()',packagingContext),/₦2,000/);
const admissionSource=fs.readFileSync(path.join(root,'supabase/functions/order-admission/index.ts'),'utf8');
assert.match(admissionSource,/packaging_quantity/);
assert.match(admissionSource,/packagingQuantity < 0 \|\| packagingQuantity > 10/);
assert.match(appSource,/function refreshEnrichedOrder\(dbId/);
assert.match(appSource,/const orderRefreshGenerations = new Map\(\)/);
assert.match(appSource,/await loadAssignedOrderEnriched\(dbId\)/);
assert.doesNotMatch(appSource,/function mapSupabaseOrderToState\(/);
assert.doesNotMatch(appSource,/state\.riderPool\[[^\]]+\] = mapped/);
assert.doesNotMatch(appSource,/state\.orders\[[^\]]+\] = mapped/);
assert.match(appSource,/Suggest an available replacement/);
assert.match(appSource,/Rider suggestion/);
assert.match(appSource,/table: 'order_notes'/);
function adminBetween(start,end){
  const a=adminSource.indexOf(start),b=adminSource.indexOf(end,a);
  assert.notEqual(a,-1,`missing admin source marker: ${start}`);
  assert.notEqual(b,-1,`missing admin source marker: ${end}`);
  return adminSource.slice(a,b);
}

async function vendorProductDomRegression(){
  const {window}=parseHTML('<html><body><main id="app"></main></body></html>');
  const state={user:{vendor_id:'ofada-sauce-5661'},vendorProducts:[{id:103,name:'Test product',desc:'',price:500,category:'Food',icon:'🍽️',active:true,image:''}],vendorProductSubmitting:false};
  const calls={submit:0,insert:0,edit:0,toggle:0,delete:0,rpc:0,update:0};
  const context=vm.createContext({
    window,document:window.document,Event:window.Event,console,setTimeout,clearTimeout,
    currentAppState:()=>state,vendor:()=>({name:'Test store'}),renderVendorLocalNav:()=>'',
    safeImageUrl:()=>'',esc:value=>String(value??''),money:value=>`₦${value}`,
    vendorProductFormIcon:()=> '🍽️',PRODUCT_IMAGE_ACCEPT:'image/png',
    editVendorProduct:()=>{calls.edit++;},
    toggleVendorProductActive:()=>{calls.toggle++;},
    deleteVendorProduct:()=>{calls.delete++;},
    submitVendorProductForm:()=>{calls.submit++; calls.insert++;}
  });
  vm.runInContext(sourceBetween('function renderVendorProductsSection','function vendorDashboard()'),context);
  vm.runInContext(sourceBetween('function handleVendorProductSubmit','document.addEventListener(\'submit\', handleVendorProductSubmit'),context);
  vm.runInContext("document.addEventListener('submit', handleVendorProductSubmit, true); document.addEventListener('click', handleVendorProductControlClick, true);",context);
  window.document.getElementById('app').innerHTML=vm.runInContext('renderVendorProductsWorkspace()',context);

  const form=window.document.getElementById('vendorProductForm');
  const save=form.querySelector('[data-vp-save]');
  assert.equal(save.getAttribute('type'),'button');
  let nativeNavigation=false;
  window.document.addEventListener('submit',event=>{ if(event.target===form && !event.defaultPrevented) nativeNavigation=true; });
  save.click();
  assert.equal(nativeNavigation,false);
  assert.equal(calls.submit,1);
  assert.equal(calls.insert,1);

  window.document.querySelector('[data-vp-action="delete"]').click();
  assert.equal(calls.delete,1);
  assert.equal(calls.toggle,0);
  window.document.querySelector('[data-vp-action="availability"]').click();
  assert.equal(calls.toggle,1);
  assert.equal(calls.delete,1);

  const mutationContext=vm.createContext({
    document:window.document,console,Number,String,
    currentAppState:()=>state,toast:()=>{},render:()=>{},resetVendorProductForm:()=>{},
    refreshVendorProducts:async()=>{},loadCatalogFromSupabase:async()=>{},deleteProductImageIfOrphaned:()=>{},
    DropzyyModal:{confirm:async()=>true},
    supabase:{
      rpc:async(name,payload)=>{calls.rpc++; assert.equal(name,'delete_vendor_product'); assert.equal(payload.p_product_id,103); assert.equal(Object.keys(payload).join(','),'p_product_id'); return {error:null};},
      from:table=>({update:payload=>({eq:()=>({eq:async()=>{calls.update++; assert.equal(table,'products'); assert.equal(payload.active,false); assert.equal(Object.keys(payload).join(','),'active'); return {error:null};}})})})
    }
  });
  vm.runInContext(sourceBetween('async function toggleVendorProductActive','// Delete permanently removes'),mutationContext);
  vm.runInContext(sourceBetween('async function deleteVendorProduct','function vendorOrderCard'),mutationContext);
  await vm.runInContext('deleteVendorProduct(103)',mutationContext);
  assert.equal(calls.rpc,1);
  assert.equal(calls.update,0);
  await vm.runInContext('toggleVendorProductActive(103)',mutationContext);
  assert.equal(calls.update,1);
  assert.equal(calls.rpc,1);

  console.log('PASS vendor product Save DOM path prevents native navigation and inserts exactly once');
  console.log('PASS vendor product Delete DOM path invokes only delete_vendor_product exactly once');
  console.log('PASS vendor product Availability DOM path updates active without invoking delete RPC');
}
async function main(){
  const {window}=parseHTML('<html><body><main id="app"></main><div id="modalRoot"></div></body></html>');
  const context=vm.createContext({window,document:window.document,console,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/js/modal.js'),'utf8'),context);
  let first='pending',second='pending';
  window.DropzyyModal.confirm({title:'First'}).then(v=>first=v);
  window.DropzyyModal.confirm({title:'Second'}).then(v=>second=v);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(first,false); assert.equal(second,'pending');
  window.document.querySelector('.modal__actions button').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(second,false);
  const admin=adminSource;
  assert.match(admin,/supportFilters\[id\]=el\.value/);
  assert.match(admin,/const q=supportFilters\.ratingSearch\.toLowerCase\(\)/);
  assert.match(admin,/Object\.entries\(supportFilters\)/);
  assert.match(admin,/function renderUsersWorkspace\(\)/);
  assert.match(admin,/key: 'users', label: 'Users'/);
  assert.match(admin,/key: 'financial', label: 'Financial Resolution'/);
  assert.match(admin,/admin_set_admin_role/);
  assert.match(admin,/admin_set_account_status/);
  assert.match(admin,/assignUserToVendor\(id/);
  assert.match(admin,/function chooseEligibleRider\(orderId\)/);
  assert.doesNotMatch(admin,/prompt\([^\n]*rider/i);
  assert.match(admin,/Remove Vendor/);
  assert.match(admin,/Reactivate Vendor/);
  assert.match(admin,/admin_set_vendor_active/);
  assert.match(admin,/Marketplace: \$\{v\.active === false \? 'Removed' : 'Active'\}/);
  assert.doesNotMatch(admin,/data-delete-vendor[^\n]*admin_deactivate_product/);
  assert.match(appSource,/from\('vendors'\)\.select\('\*'\)\.eq\('active', true\)/);
  const vendorRemoval=fs.readFileSync(path.join(root,'supabase/migrations/20270120_reversible_vendor_removal.sql'),'utf8');
  assert.match(vendorRemoval,/admin_set_vendor_active/);
  assert.match(vendorRemoval,/reject_archived_vendor_order_item/);
  assert.match(vendorRemoval,/vendors_select_public/);
  assert.match(admin,/Deactivate Product/);
  assert.match(admin,/Payout readiness/);
  assert.match(admin,/Successful payments/);
  assert.match(appSource,/account_status === 'suspended'/);
  const financialRenderer=adminBetween('function renderFinancialResolutionWorkspace()', 'function renderFinanceWorkspace(kind)');
  assert.match(financialRenderer,/financialResolutionQueue/);
  assert.doesNotMatch(financialRenderer,/state\.(?:transfers|payments|withdrawals|cancellations)/);
  assert.match(admin,/admin_get_financial_resolution_queue/);
  await vendorProductDomRegression();
  refundDisplayRegression();
  console.log('PASS overlapping modals settle the prior promise exactly once');
  console.log('PASS admin support filters use persistent state and restore controls');
  console.log('PASS admin control-center navigation, lifecycle actions, rider picker, details, and metrics are wired');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
