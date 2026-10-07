const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'../..');
const appSource=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const adminSource=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');

assert.match(appSource,/rpc\(['"]update_rider_order_status['"]/);
assert.doesNotMatch(appSource,/from\(['"]orders['"]\)\s*\.update\(\{ status: nextStatus \}\)/);
assert.match(appSource,/\[400,401,403,404\]\.includes\(status\)/);

function sourceBetween(start,end){
  const a=appSource.indexOf(start),b=appSource.indexOf(end,a);
  assert.notEqual(a,-1,`missing source marker: ${start}`);
  assert.notEqual(b,-1,`missing source marker: ${end}`);
  return appSource.slice(a,b);
}
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
  console.log('PASS overlapping modals settle the prior promise exactly once');
  console.log('PASS admin support filters use persistent state and restore controls');
  console.log('PASS admin control-center navigation, lifecycle actions, rider picker, details, and metrics are wired');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
