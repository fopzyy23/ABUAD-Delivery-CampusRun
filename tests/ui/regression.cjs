const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'../..');
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
  const admin=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
  assert.match(admin,/supportFilters\[id\]=el\.value/);
  assert.match(admin,/const q=supportFilters\.ratingSearch\.toLowerCase\(\)/);
  assert.match(admin,/Object\.entries\(supportFilters\)/);
  console.log('PASS overlapping modals settle the prior promise exactly once');
  console.log('PASS admin support filters use persistent state and restore controls');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
