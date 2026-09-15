const fs = require('fs');
const migration = fs.readFileSync('supabase/migrations/20261011_vendor_delivery_refund.sql', 'utf8');

// Check the vendor_delivery branch more precisely
const idx = migration.indexOf("v_payment.payment_type = 'vendor_delivery'");
if (idx >= 0) {
  const branch = migration.substring(idx, idx + 500);
  console.log('Has payment_status = refunded in 500 chars:', /payment_status = 'refunded'/.test(branch));
  console.log('Branch content:', branch);
}