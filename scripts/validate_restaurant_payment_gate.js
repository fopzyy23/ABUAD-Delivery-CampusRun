const fs = require('fs');
const s = fs.readFileSync('supabase/migrations/20261225_restaurant_payment_gate.sql', 'utf8');
for (const x of ['payment_status IS DISTINCT FROM \'success\'', 'restaurant_vendor_update_order_status', 'guard_restaurant_preparing_payment', "p_status NOT IN ('Preparing','Ready for pickup','Delivered','Cancelled')"]) if (!s.includes(x)) throw new Error(`restaurant gate missing ${x}`);
console.log('restaurant payment gate validator: PASS');
