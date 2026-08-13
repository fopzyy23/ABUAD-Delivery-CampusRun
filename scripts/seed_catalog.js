// ============================================
// ABUAD Delivery — Catalog Seed Script
// ============================================
// Safely upserts the existing SEED_DATA vendors and products into the
// Supabase `vendors` and `products` tables.
//
// - Uses upsert (ON CONFLICT id) so it can be run again safely.
// - Does NOT delete any existing Supabase data.
// - Maps the existing product `vendor` field to `vendor_id`.
// - Preserves ids, names, prices, categories, descriptions, icons,
//   ratings, delivery times, covers, and open/active states.
//
// Usage:
//   npm install @supabase/supabase-js
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed_catalog.js
//
// The service role key is required so the script can write to the tables
// regardless of Row Level Security. Never commit the service role key.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cmfohldnmytmwjynqfpz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Set the SUPABASE_SERVICE_ROLE_KEY environment variable and try again.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================
// Seed data (mirrors SEED_DATA in assets/js/app.js)
// ============================================
const vendors = [
  { id: 'captain-cook', name: 'Captain Cook', icon: '🍔', type: 'Restaurant', rating: '4.8', time: '15–25 min', cover: '#ffe7bc', open: true },
  { id: 'season-deli', name: 'Season Deli', icon: '🥪', type: 'Restaurant', rating: '4.7', time: '10–18 min', cover: '#f4d7a6', open: true },
  { id: 'staff-caf', name: 'Staff Caf', icon: '🍛', type: 'Restaurant', rating: '4.6', time: '12–20 min', cover: '#d8e6ff', open: true },
  { id: 'caf-1', name: 'Caf 1', icon: '🍲', type: 'Restaurant', rating: '4.8', time: '10–18 min', cover: '#d9f5e9', open: true },
  { id: 'caf-2', name: 'Caf 2', icon: '🍝', type: 'Restaurant', rating: '4.5', time: '15–22 min', cover: '#f4def8', open: true },
  { id: 'caf-3', name: 'Caf 3', icon: '🍗', type: 'Restaurant', rating: '4.6', time: '12–20 min', cover: '#ffe1d6', open: true },
  { id: 'streat-food', name: 'Streat food', icon: '🍟', type: 'Restaurant', rating: '4.7', time: '8–15 min', cover: '#fff1bd', open: true },
  { id: 'med-caf', name: 'Med Caf', icon: '🥘', type: 'Restaurant', rating: '4.5', time: '15–25 min', cover: '#dceaff', open: true },
  { id: 'smoothie-shack', name: 'Smoothie Shack', icon: '🥤', type: 'Restaurant', rating: '4.6', time: '10–18 min', cover: '#e4d9ff', open: true },
  { id: 'bookshop', name: 'Campus Bookshop', icon: '📚', type: 'Bookshop', rating: '4.7', time: '5–10 min', cover: '#d8e0ff', open: true },
  { id: 'campus-drinks', name: 'Campus Drinks', icon: '🥤', type: 'Beverages', rating: '4.6', time: '5–10 min', cover: '#ffe4e1', open: true }
];

const products = [
  { id: 1, vendor: 'caf-1', name: 'Jollof Rice', desc: 'Caf 1 serving.', price: 400, icon: '🍛', category: 'Food' },
  { id: 2, vendor: 'caf-1', name: 'Spaghetti', desc: 'Caf 1 serving.', price: 500, icon: '🍝', category: 'Meals' },
  { id: 3, vendor: 'caf-1', name: 'Chicken', desc: 'Caf 1 serving.', price: 1500, icon: '🍗', category: 'Food' },
  { id: 4, vendor: 'caf-1', name: 'Egg Sauce', desc: 'Caf 1 serving.', price: 650, icon: '🍳', category: 'Meals' },
  { id: 5, vendor: 'caf-1', name: 'Rice & Chicken Sauce', desc: 'Caf 1 serving.', price: 3900, icon: '🍛', category: 'Food' },
  { id: 6, vendor: 'caf-1', name: 'White Beans', desc: 'Caf 1 serving.', price: 500, icon: '🥣', category: 'Meals' },
  { id: 7, vendor: 'caf-1', name: 'Sausages', desc: 'Caf 1 serving.', price: 350, icon: '🌭', category: 'Snacks' },
  { id: 8, vendor: 'caf-1', name: 'Fried Egg', desc: 'Caf 1 serving.', price: 450, icon: '🍳', category: 'Meals' },
  { id: 9, vendor: 'caf-1', name: 'Chicken Pasta', desc: 'Caf 1 serving.', price: 3000, icon: '🍝', category: 'Meals' },
  { id: 10, vendor: 'caf-1', name: 'Moi Moi', desc: 'Caf 1 serving.', price: 500, icon: '🫔', category: 'Meals' },
  { id: 11, vendor: 'caf-1', name: 'Suga Moi Moi', desc: 'Caf 1 serving.', price: 1000, icon: '🫔', category: 'Meals' },
  { id: 12, vendor: 'caf-1', name: 'Salad', desc: 'Caf 1 serving.', price: 500, icon: '🥗', category: 'Food' },
  { id: 13, vendor: 'caf-1', name: 'Plantain Portion', desc: 'Three plantains per portion.', price: 200, icon: '🍌', category: 'Food' },
  { id: 14, vendor: 'caf-1', name: 'Diced Plantain', desc: 'Caf 1 serving.', price: 600, icon: '🍌', category: 'Food' },
  { id: 15, vendor: 'caf-1', name: 'Boiled Egg', desc: 'Caf 1 serving.', price: 350, icon: '🥚', category: 'Meals' },
  { id: 16, vendor: 'caf-1', name: 'Indomie', desc: 'Price per pack.', price: 700, icon: '🍜', category: 'Meals' },
  { id: 17, vendor: 'caf-1', name: 'Porridge Yam (Half Pack)', desc: 'Caf 1 serving.', price: 1200, icon: '🍲', category: 'Meals' },
  { id: 18, vendor: 'caf-1', name: 'Porridge Yam (Full Pack)', desc: 'Caf 1 serving.', price: 2400, icon: '🍲', category: 'Meals' },
  { id: 19, vendor: 'caf-1', name: 'Emerald Delight', desc: 'White rice and vegetable soup.', price: 3200, icon: '🍚', category: 'Food' },
  { id: 20, vendor: 'caf-1', name: 'Swallow with Soup', desc: 'Caf 1 serving.', price: 2500, icon: '🥘', category: 'Meals' },
  { id: 21, vendor: 'caf-1', name: 'Extra Swallow Wrap', desc: 'Caf 1 serving.', price: 600, icon: '🥘', category: 'Meals' },
  { id: 22, vendor: 'caf-1', name: 'Pizza', desc: 'Listed mid-range price (₦7,000–₦8,000).', price: 7500, icon: '🍕', category: 'Food' },
  { id: 23, vendor: 'captain-cook', name: 'Jollof Rice', desc: 'Captain Cook serving.', price: 800, icon: '🍛', category: 'Food' },
  { id: 24, vendor: 'captain-cook', name: 'Fried Rice', desc: 'Captain Cook serving.', price: 800, icon: '🍚', category: 'Food' },
  { id: 25, vendor: 'captain-cook', name: 'Chicken (Small)', desc: 'Captain Cook serving.', price: 900, icon: '🍗', category: 'Food' },
  { id: 26, vendor: 'captain-cook', name: 'Chicken (Large)', desc: 'Captain Cook serving.', price: 1500, icon: '🍗', category: 'Food' },
  { id: 27, vendor: 'captain-cook', name: 'Basmati Rice', desc: 'Jollof or fried rice.', price: 1000, icon: '🍛', category: 'Food' },
  { id: 28, vendor: 'captain-cook', name: 'Spaghetti', desc: 'Captain Cook serving.', price: 800, icon: '🍝', category: 'Meals' },
  { id: 29, vendor: 'captain-cook', name: 'Porridge Beans', desc: 'Captain Cook serving.', price: 1000, icon: '🥣', category: 'Meals' },
  { id: 30, vendor: 'captain-cook', name: 'Beef', desc: 'Captain Cook serving.', price: 500, icon: '🥩', category: 'Food' },
  { id: 31, vendor: 'captain-cook', name: 'Fish (Regular)', desc: 'Captain Cook serving.', price: 600, icon: '🐟', category: 'Food' },
  { id: 32, vendor: 'captain-cook', name: 'Fish (Large)', desc: 'Captain Cook serving.', price: 800, icon: '🐟', category: 'Food' },
  { id: 33, vendor: 'captain-cook', name: 'Ofada Rice', desc: 'Captain Cook serving.', price: 800, icon: '🍚', category: 'Food' },
  { id: 34, vendor: 'captain-cook', name: 'Ofada Sauce', desc: 'Captain Cook serving.', price: 500, icon: '🥘', category: 'Meals' },
  { id: 35, vendor: 'captain-cook', name: 'Ice Cream Cone', desc: 'Captain Cook serving.', price: 1000, icon: '🍦', category: 'Snacks' },
  { id: 36, vendor: 'captain-cook', name: 'Ice Cream Container', desc: 'Captain Cook serving.', price: 2000, icon: '🍨', category: 'Snacks' },
  { id: 37, vendor: 'caf-2', name: 'Jollof Rice', desc: 'Caf 2 price aligned with Caf 1.', price: 400, icon: '🍛', category: 'Food' },
  { id: 38, vendor: 'caf-2', name: 'Spaghetti', desc: 'Caf 2 price aligned with Caf 1.', price: 500, icon: '🍝', category: 'Meals' },
  { id: 39, vendor: 'caf-2', name: 'Chicken', desc: 'Caf 2 price aligned with Caf 1.', price: 1500, icon: '🍗', category: 'Food' },
  { id: 40, vendor: 'caf-2', name: 'Moi Moi', desc: 'Caf 2 price aligned with Caf 1.', price: 500, icon: '🫔', category: 'Meals' },
  { id: 41, vendor: 'caf-2', name: 'Plantain Portion', desc: 'Three plantains per portion; Caf 1 price range.', price: 200, icon: '🍌', category: 'Food' },
  { id: 42, vendor: 'caf-3', name: 'White Rice', desc: 'Caf 3 serving.', price: 500, icon: '🍚', category: 'Food' },
  { id: 43, vendor: 'caf-3', name: 'Jollof Rice', desc: 'Caf 3 serving.', price: 500, icon: '🍛', category: 'Food' },
  { id: 44, vendor: 'caf-3', name: 'Chicken Curry', desc: 'Caf 3 serving; availability may be limited.', price: 2000, icon: '🍛', category: 'Food' },
  { id: 45, vendor: 'med-caf', name: 'Jollof Rice', desc: 'Listed price is subject to confirmation.', price: 500, icon: '🍛', category: 'Food' },
  { id: 46, vendor: 'med-caf', name: 'White Rice', desc: 'Listed price is subject to confirmation.', price: 500, icon: '🍚', category: 'Food' },
  { id: 47, vendor: 'season-deli', name: 'Jollof Rice', desc: 'Season Deli serving.', price: 500, icon: '🍛', category: 'Food' },
  { id: 48, vendor: 'season-deli', name: 'Fried Rice', desc: 'Season Deli serving.', price: 500, icon: '🍚', category: 'Food' },
  { id: 49, vendor: 'season-deli', name: 'White Rice', desc: 'Season Deli serving.', price: 500, icon: '🍚', category: 'Food' },
  { id: 50, vendor: 'season-deli', name: 'Boiled Egg', desc: 'Price is subject to confirmation.', price: 350, icon: '🥚', category: 'Meals' },
  { id: 51, vendor: 'streat-food', name: 'Suya', desc: 'Streat food serving.', price: 800, icon: '🍢', category: 'Food' },
  { id: 52, vendor: 'streat-food', name: 'Suya (Other Stall)', desc: 'Alternative Streat food stall.', price: 500, icon: '🍢', category: 'Food' },
  { id: 53, vendor: 'streat-food', name: 'Ponmo Sauce', desc: 'Streat food serving.', price: 700, icon: '🥘', category: 'Meals' },
  { id: 54, vendor: 'streat-food', name: 'Chicken Sauce', desc: 'Streat food serving.', price: 500, icon: '🍗', category: 'Meals' },
  { id: 55, vendor: 'streat-food', name: 'Asun', desc: 'Listed mid-range price (₦1,000–₦1,200).', price: 1100, icon: '🍖', category: 'Food' },
  { id: 56, vendor: 'streat-food', name: 'Chips', desc: 'Without pack.', price: 1500, icon: '🍟', category: 'Snacks' },
  { id: 57, vendor: 'streat-food', name: 'Chips (With Pack)', desc: 'Streat food serving.', price: 1750, icon: '🍟', category: 'Snacks' },
  { id: 58, vendor: 'streat-food', name: 'Chicken & Chips', desc: 'Listed mid-range price (₦3,500–₦4,000).', price: 3750, icon: '🍗', category: 'Food' },
  { id: 59, vendor: 'streat-food', name: 'Fish Pepper Soup', desc: 'Streat food serving.', price: 2500, icon: '🍲', category: 'Meals' },
  { id: 60, vendor: 'streat-food', name: 'Akara', desc: 'Price per piece.', price: 200, icon: '🧆', category: 'Snacks' },
  { id: 61, vendor: 'streat-food', name: 'Masa', desc: 'Listed higher price per piece.', price: 200, icon: '🫓', category: 'Snacks' },
  { id: 62, vendor: 'streat-food', name: 'Coated Yam', desc: 'Price per piece.', price: 200, icon: '🍠', category: 'Snacks' },
  { id: 63, vendor: 'streat-food', name: 'Shawarma', desc: 'Streat food serving.', price: 3000, icon: '🌯', category: 'Food' },
  { id: 64, vendor: 'streat-food', name: 'Grilled Fish', desc: 'Listed entry price; sizes range to ₦7,000.', price: 1500, icon: '🐟', category: 'Food' },
  { id: 65, vendor: 'streat-food', name: 'Toast', desc: 'Streat food serving.', price: 2300, icon: '🥪', category: 'Food' },
  { id: 66, vendor: 'streat-food', name: 'Cheesesteak', desc: 'Streat food serving.', price: 5000, icon: '🥪', category: 'Food' },
  { id: 67, vendor: 'streat-food', name: 'Bread & Egg', desc: 'Streat food serving.', price: 2500, icon: '🍞', category: 'Food' },
  { id: 68, vendor: 'streat-food', name: 'Fried Egg', desc: 'Streat food serving.', price: 500, icon: '🍳', category: 'Meals' },
  { id: 69, vendor: 'smoothie-shack', name: 'Jollof Rice', desc: 'Price is subject to confirmation.', price: 500, icon: '🍛', category: 'Food' },
  { id: 70, vendor: 'smoothie-shack', name: 'Fried Rice', desc: 'Price is subject to confirmation.', price: 500, icon: '🍚', category: 'Food' },
  { id: 71, vendor: 'smoothie-shack', name: 'White Rice', desc: 'Smoothie Shack serving.', price: 500, icon: '🍚', category: 'Food' },
  { id: 72, vendor: 'smoothie-shack', name: 'Chicken', desc: 'Smoothie Shack serving.', price: 2500, icon: '🍗', category: 'Food' },
  { id: 73, vendor: 'smoothie-shack', name: 'Boiled Egg', desc: 'Listed higher price pending confirmation.', price: 350, icon: '🥚', category: 'Meals' },
  { id: 74, vendor: 'smoothie-shack', name: 'Macaroni', desc: 'Price is subject to confirmation.', price: 500, icon: '🍝', category: 'Meals' },
  { id: 75, vendor: 'bookshop', name: 'Engineering Mathematics Textbook', desc: 'Advanced Engineering Mathematics by Kreyszig.', price: 15000, icon: '📘', category: 'Bookshop' },
  { id: 76, vendor: 'bookshop', name: 'University Physics Textbook', desc: 'Physics for Scientists and Engineers.', price: 12000, icon: '📕', category: 'Bookshop' },
  { id: 77, vendor: 'bookshop', name: 'Organic Chemistry Textbook', desc: 'Organic Chemistry by Morrison and Boyd.', price: 10000, icon: '📗', category: 'Bookshop' },
  { id: 78, vendor: 'bookshop', name: 'Biology Textbook', desc: 'Campbell Biology for students.', price: 18000, icon: '📙', category: 'Bookshop' },
  { id: 79, vendor: 'bookshop', name: 'Calculus Textbook', desc: 'Calculus by Thomas.', price: 14000, icon: '📐', category: 'Bookshop' },
  { id: 80, vendor: 'bookshop', name: 'Law Textbook', desc: 'Nigerian Legal Methods.', price: 20000, icon: '⚖️', category: 'Bookshop' },
  { id: 81, vendor: 'bookshop', name: 'Anatomy Textbook', desc: 'Gray Anatomy for Students.', price: 25000, icon: '🩺', category: 'Bookshop' },
  { id: 82, vendor: 'bookshop', name: 'A4 Notebook (80 pages)', desc: 'Hardcover lecture notebook.', price: 1500, icon: '📓', category: 'Bookshop' },
  { id: 83, vendor: 'bookshop', name: 'Pen (Biro)', desc: 'Blue or black ink pen.', price: 200, icon: '🖊️', category: 'Bookshop' },
  { id: 84, vendor: 'bookshop', name: 'Pencil Set', desc: 'HB pencil with eraser.', price: 150, icon: '✏️', category: 'Bookshop' },
  { id: 85, vendor: 'bookshop', name: 'Scientific Calculator', desc: 'Casio fx-991S.', price: 12000, icon: '🧮', category: 'Bookshop' },
  { id: 86, vendor: 'bookshop', name: 'Geometry Set', desc: 'Ruler, set square and protractor.', price: 1000, icon: '📏', category: 'Bookshop' },
  { id: 87, vendor: 'bookshop', name: 'Highlighters (Pack of 4)', desc: 'Assorted colours.', price: 1200, icon: '🖍️', category: 'Bookshop' },
  { id: 88, vendor: 'bookshop', name: 'A4 Drawing Book', desc: 'For technical drawing and art.', price: 2000, icon: '🎨', category: 'Bookshop' },
  { id: 89, vendor: 'bookshop', name: 'File Folder', desc: 'Document folder for assignments.', price: 800, icon: '📁', category: 'Bookshop' },
  { id: 90, vendor: 'bookshop', name: 'Stapler and Staples', desc: 'Office stapler with pins.', price: 2500, icon: '📎', category: 'Bookshop' },
  { id: 91, vendor: 'campus-drinks', name: 'Coca-Cola', desc: 'Classic refreshing cola drink.', price: 300, icon: '🥤', category: 'Drinks' },
  { id: 92, vendor: 'campus-drinks', name: 'Fanta Orange', desc: 'Sweet orange flavored soda.', price: 300, icon: '🍊', category: 'Drinks' },
  { id: 93, vendor: 'campus-drinks', name: 'Fanta Pineapple', desc: 'Tropical pineapple flavor.', price: 300, icon: '🍍', category: 'Drinks' },
  { id: 94, vendor: 'campus-drinks', name: 'Exotic Juice', desc: 'Premium mixed fruit juice.', price: 500, icon: '🧃', category: 'Drinks' },
  { id: 95, vendor: 'campus-drinks', name: 'Red Wine', desc: 'Premium quality red wine.', price: 3500, icon: '🍷', category: 'Drinks' },
  { id: 96, vendor: 'campus-drinks', name: 'Pepsi', desc: 'Refreshing cola beverage.', price: 300, icon: '🥤', category: 'Drinks' },
  { id: 97, vendor: 'campus-drinks', name: 'Sprite', desc: 'Lemon-lime flavored soda.', price: 300, icon: '🥤', category: 'Drinks' },
  { id: 98, vendor: 'campus-drinks', name: 'Malt Drink', desc: 'Nutritious malt beverage.', price: 400, icon: '🍺', category: 'Drinks' },
  { id: 99, vendor: 'campus-drinks', name: 'Chivita Orange Juice', desc: 'Fresh squeezed orange juice.', price: 600, icon: '🍊', category: 'Drinks' },
  { id: 100, vendor: 'campus-drinks', name: 'Bottled Water', desc: 'Pure drinking water 50cl.', price: 200, icon: '💧', category: 'Drinks' },
  { id: 101, vendor: 'campus-drinks', name: 'Energy Drink', desc: 'Boost your energy levels.', price: 800, icon: '⚡', category: 'Drinks' }
];

// ============================================
// Seed logic (upsert — safe to run repeatedly)
// ============================================
async function seed() {
  // 1. Upsert vendors (preserves id, name, icon, type, rating, time, cover, open)
  const { error: vendorError } = await supabase
    .from('vendors')
    .upsert(vendors, { onConflict: 'id' });

  if (vendorError) {
    console.error('Vendor upsert failed:', vendorError.message);
    process.exit(1);
  }
  console.log(`✓ Upserted ${vendors.length} vendors`);

  // 2. Upsert products — map existing `vendor` field to `vendor_id`,
  //    and set `active: true` (products are enabled by default).
  const productRows = products.map(p => ({
    id: p.id,
    vendor_id: p.vendor,
    name: p.name,
    desc: p.desc,
    price: p.price,
    icon: p.icon,
    category: p.category,
    active: true
  }));

  const { error: productError } = await supabase
    .from('products')
    .upsert(productRows, { onConflict: 'id' });

  if (productError) {
    console.error('Product upsert failed:', productError.message);
    process.exit(1);
  }
  console.log(`✓ Upserted ${productRows.length} products`);

  console.log('Seed complete. No existing data was deleted.');
}

seed();