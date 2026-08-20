console.log("[TEST] app.js is running");

const SEED_DATA = {
  vendors: [
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
  ],
  products: [
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
  ]
};

const $ = s => document.querySelector(s);
const money = n => `₦${Number(n).toLocaleString('en-NG')}`;
const store = (key, value) => localStorage.setItem(`campusrun_${key}`, JSON.stringify(value));
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`campusrun_${key}`)) ?? fallback; } catch { return fallback; } };
const clone = value => JSON.parse(JSON.stringify(value));
const state = { cart: load('cart', []), orders: load('orders', []), user: load('user', null), notifications: load('notifications', [{ title: 'Welcome to CampusRun', body: 'Order campus essentials and track every step.', time: 'Just now', unread: true }]), catalog: load('catalog_v3', clone(SEED_DATA)), rider: load('rider', null), riderRatings: load('rider_ratings', []), riderPool: load('rider_pool', []), vendorOrders: load('vendor_orders', []), vendorProducts: load('vendor_products', []), vendorLoaded: false };

// Merge any missing seed vendors/products into the loaded catalog. This repairs
// stale localStorage data that predates new catalog entries (e.g. the drinks and
// bookshop vendors) so those sections are always present.
function mergeSeedIntoStored(cat) {
  let changed = false;
  SEED_DATA.vendors.forEach(seedV => {
    if (!cat.vendors.some(v => v.id === seedV.id)) { cat.vendors.push(clone(seedV)); changed = true; }
  });
  SEED_DATA.products.forEach(seedP => {
    if (!cat.products.some(p => p.id === seedP.id)) { cat.products.push(clone(seedP)); changed = true; }
  });
  if (changed) { state.catalog = cat; store('catalog_v3', cat); }
  return cat;
}

// Re-read the catalog from storage on every access (the admin panel shares the
// same 'catalog_v3' key, so this keeps the customer site in sync with admin
// edits). We also prune cart entries that reference now-deleted products so the
// cart/checkout views never crash or show ₦NaN.
const data = () => {
  let cat = load('catalog_v3', clone(SEED_DATA));
  cat = mergeSeedIntoStored(cat);
  if (cat !== state.catalog) state.catalog = cat;
  state.catalog = cat;
  const ids = new Set(state.catalog.products.map(p => p.id));
  if (state.cart.some(x => !ids.has(x.id))) {
    state.cart = state.cart.filter(x => ids.has(x.id));
    store('cart', state.cart);
  }
  return state.catalog;
};

// Load the catalog from Supabase (vendors + products). This is the source of
// truth for the customer-facing catalog. If the request fails, we keep the
// existing localStorage catalog as a temporary fallback.
async function loadCatalogFromSupabase() {
  try {
    const [vendorsRes, productsRes] = await Promise.all([
      supabase.from('vendors').select('*'),
      supabase.from('products').select('*').eq('active', true)
    ]);
    if (vendorsRes.error) throw vendorsRes.error;
    if (productsRes.error) throw productsRes.error;
    // Map Supabase rows back to the frontend catalog shape. products.vendor_id
    // becomes the existing `vendor` field used throughout the UI.
    const vendors = vendorsRes.data.map(v => ({ id: v.id, name: v.name, icon: v.icon, type: v.type, rating: v.rating, time: v.time, cover: v.cover, open: v.open }));
    const products = productsRes.data.map(p => ({ id: p.id, vendor: p.vendor_id, name: p.name, desc: p.desc, price: p.price, icon: p.icon, category: p.category }));
    state.catalog = { vendors, products };
    store('catalog_v3', state.catalog);
    render();
  } catch (err) {
    console.error('Supabase catalog load failed — using localStorage fallback:', err);
  }
}

function vendor(id) { return data().vendors.find(v => v.id === id); }
function product(id) { return data().products.find(p => p.id === Number(id)); }

// Customer-facing persistence. IMPORTANT: this must NOT write the catalog.
// The admin panel writes the same 'catalog_v3' key; if a customer action wrote a
// stale in-memory copy of the catalog here, it would silently revert the admin's
// changes — that was the root cause of the admin-to-main-site sync bug.
function save() { store('cart', state.cart); store('orders', state.orders); store('user', state.user); store('notifications', state.notifications); store('rider', state.rider); store('rider_ratings', state.riderRatings); store('rider_pool', state.riderPool); store('vendor_orders', state.vendorOrders); store('vendor_products', state.vendorProducts); updateChrome(); }

// Admin-facing persistence: persist the catalog AND the rest of state.
function saveCatalog() { store('catalog_v3', state.catalog); save(); }

function addNotification(title, body) { state.notifications.unshift({ title, body, time: 'Now', unread: true }); save(); }
function toast(message, kind = 'success') { const el = document.createElement('div'); el.className = `toast toast--${kind}`; el.textContent = message; $('#toastRoot').append(el); setTimeout(() => el.remove(), 3400); }
function addCart(id) { const p = product(id); const line = state.cart.find(x => x.id === p.id); if (line) line.qty++; else state.cart.push({ id: p.id, qty: 1 }); save(); toast(`${p.name} added to your cart`); }
function cartItems() { return state.cart.map(x => ({ ...product(x.id), qty: x.qty })); }
function cartTotal() { return cartItems().reduce((n, x) => n + x.price * x.qty, 0); }

// ============================================
// Rider Hub: load rider application status from Supabase
// ============================================
async function loadRiderFromSupabase() {
  if (typeof supabase === 'undefined' || !supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return;
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      state.rider = data;
      save();
    }
    const { data: ratings, error: ratingsError } = await supabase
      .from('rider_ratings')
      .select('*')
      .eq('reviewer_id', session.user.id);
    if (!ratingsError && ratings) {
      state.riderRatings = ratings;
      save();
    }
  } catch (err) {
    console.error('Failed to load rider status:', err);
  }
}

// Submit a rider application to Supabase (with duplicate prevention).
async function submitRiderApplication(formData) {
  if (!state.user) { toast('Please sign in to apply as a rider', 'info'); location.hash = '#/login'; return; }
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — application could not be saved', 'error'); return; }
  if (state.rider && ['pending','approved'].includes(state.rider.status)) {
    toast(state.rider.status === 'approved' ? 'You are already an approved rider' : 'You already have a pending application', 'info');
    location.hash = '#/rider';
    return;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Please sign in to apply as a rider', 'info'); location.hash = '#/login'; return; }
    const matricNumber = (formData.get('studentId') || formData.get('matric') || '').trim();
    const phone = (formData.get('phone') || '').trim();
    if (!matricNumber || !phone) { toast('Please fill in all required fields', 'error'); return; }
    const { data, error } = await supabase
      .from('riders')
      .insert({
        user_id: session.user.id,
        matric_number: matricNumber,
        phone: phone,
        status: 'pending',
        available: false
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
        toast('You have already submitted an application', 'info');
      } else {
        console.error('Rider application insert failed:', error);
        toast('Application failed: ' + error.message, 'error');
      }
      return;
    }
    state.rider = data;
    save();
    toast('Application submitted! We\'ll review your details shortly.');
    location.hash = '#/rider';
  } catch (err) {
    console.error('Rider application error:', err);
    toast('Application failed — please try again', 'error');
  }
}

// Rate and review the rider assigned to a delivered order.
async function submitRiderRating(orderId, riderId, rating, review) {
  if (!state.user) { toast('Please sign in to rate your rider', 'info'); return false; }
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — rating could not be saved', 'error'); return false; }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Please sign in to rate your rider', 'info'); return false; }
    const { error } = await supabase
      .from('rider_ratings')
      .insert({
        order_id: orderId,
        rider_id: riderId,
        reviewer_id: session.user.id,
        rating: rating,
        review: review || ''
      });
    if (error) {
      if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
        toast('You have already rated this delivery', 'info');
      } else {
        console.error('Rating insert failed:', error);
        toast('Rating failed: ' + error.message, 'error');
      }
      return false;
    }
    await loadRiderFromSupabase();
    toast('Thanks for rating your rider!', 'success');
    return true;
  } catch (err) {
    console.error('Rating error:', err);
    toast('Rating failed — please try again', 'error');
    return false;
  }
}


// ============================================
// Orders from Supabase
// ============================================
// Tracks whether the current user's orders have been loaded from Supabase.
state.ordersLoadedFromSupabase = false;

// Format a Supabase created_at timestamp into the same "Just now" style
// used by the existing order UI.
function formatOrderCreated(createdAt) {
  if (!createdAt) return 'Just now';
  const date = new Date(createdAt);
  if (isNaN(date.getTime())) return 'Just now';
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hr${diffHrs > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Load the authenticated user's orders from Supabase (orders + order_items)
// and map them into the existing frontend order shape. Falls back to
// localStorage if Supabase is unavailable.
async function loadOrdersFromSupabase() {
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('Supabase client is missing — using localStorage orders fallback');
    state.ordersLoadedFromSupabase = true;
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      // No authenticated session — keep localStorage orders
      state.ordersLoadedFromSupabase = true;
      return false;
    }
    const userId = session.user.id;

    // 1. Fetch the user's orders from Supabase
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId);
    if (ordersError) throw ordersError;

    // 2. Fetch order_items for all the user's orders
    let orderItemsData = [];
    if (ordersData && ordersData.length > 0) {
      const orderIds = ordersData.map(o => o.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);
      if (itemsError) throw itemsError;
      orderItemsData = itemsData || [];
    }

    // 3. Group order_items by order_id
    const itemsByOrder = {};
    orderItemsData.forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.product_id,
        vendor: item.vendor_id,
        name: item.name,
        price: item.price,
        icon: item.icon,
        desc: '',
        category: '',
        qty: item.qty
      });
    });

    // 4. Map Supabase orders into the existing frontend order shape
    const mapOrder = (o, itemsMap) => ({
      id: o.order_number,
      dbId: o.id,
      items: (itemsMap && itemsMap[o.id]) || [],
      total: o.total,
      fee: o.fee || 500,
      status: o.status || 'Order confirmed',
      spot: o.spot || '',
      delivery_method: o.delivery_method || 'rider',
      created: formatOrderCreated(o.created_at)
    });

    const supabaseOrders = (ordersData || []).map(o => mapOrder(o, itemsByOrder));

    // 4b. If the user is an approved rider, also load the rider delivery pool:
    //     unassigned rider-delivery orders (status = 'Order confirmed',
    //     rider_id = null, delivery_method = 'rider') plus orders already
    //     assigned to this rider. vendor_self / both-pending orders stay out.
    const poolOrders = [];
    const { data: riderRow } = await supabase
      .from('riders')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .maybeSingle();
    if (riderRow && riderRow.id) {
      const [unassignedRes, assignedRes] = await Promise.all([
        supabase.from('orders')
          .select('*')
          .in('status', ['Order confirmed','Ready for pickup'])
          .is('rider_id', null)
          .eq('delivery_method', 'rider'),
        supabase.from('orders')
          .select('*')
          .eq('rider_id', riderRow.id)
      ]);
      if (unassignedRes.error) throw unassignedRes.error;
      if (assignedRes.error) throw assignedRes.error;

      const poolRows = [...(unassignedRes.data || []), ...(assignedRes.data || [])];
      if (poolRows.length) {
        const poolIds = poolRows.map(o => o.id);
        const { data: poolItems, error: poolItemsError } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', poolIds);
        if (poolItemsError) throw poolItemsError;

        const poolItemsByOrder = {};
        (poolItems || []).forEach(item => {
          if (!poolItemsByOrder[item.order_id]) poolItemsByOrder[item.order_id] = [];
          poolItemsByOrder[item.order_id].push({
            id: item.product_id,
            vendor: item.vendor_id,
            name: item.name,
            price: item.price,
            icon: item.icon,
            desc: '',
            category: '',
            qty: item.qty
          });
        });

        poolRows.forEach(o => poolOrders.push(mapOrder(o, poolItemsByOrder)));
      }
    }
    state.riderPool = poolOrders;
    store('rider_pool', state.riderPool);

    // 5. Merge with existing localStorage orders (e.g. ones just placed in this
    //    session that may not be in Supabase yet). Avoid duplicates by id.
    const existingIds = new Set(state.orders.map(x => x.id));
    const newOrders = supabaseOrders.filter(o => !existingIds.has(o.id));
    if (newOrders.length > 0) {
      state.orders = [...newOrders, ...state.orders];
      store('orders', state.orders);
    }

    state.ordersLoadedFromSupabase = true;
    return true;
  } catch (err) {
    console.error('Supabase orders load failed — using localStorage fallback:', err);
    state.ordersLoadedFromSupabase = true;
    return false;
  }
}

// Ensure orders have been loaded from Supabase at least once before rendering.
async function ensureOrdersLoaded() {
  if (!state.ordersLoadedFromSupabase) {
    await loadOrdersFromSupabase();
  }
}

function productCard(p) { return `<article class="pcard"><div class="pcard__thumb">${p.icon}</div><div class="pcard__name">${p.name}</div><div class="pcard__desc">${p.desc}</div><div class="pcard__foot"><span class="price">${money(p.price)}</span><button class="btn btn--soft btn--sm" data-add="${p.id}">Add +</button></div></article>`; }
function vendorCard(v) { return `<a class="vcard" href="#/vendor/${v.id}"><div class="vcard__cover" style="background:${v.cover}">${v.icon}<span class="badge badge--brand">${v.type}</span>${v.open?'':'<span class="vcard__closed">Closed</span>'}</div><div class="vcard__body"><h3>${v.name}</h3><div class="vcard__meta"><span class="stars">★★★★★</span><b>${v.rating}</b><span>• ${v.time}</span></div></div></a>`; }
function empty(icon, title, copy, action = '') { return `<div class="empty"><div class="empty__icon">${icon}</div><b>${title}</b><span>${copy}</span>${action}</div>`; }

function home() {
  const vcount = data().vendors.length;
  const drinks = data().products.filter(p => p.category === 'Drinks');
  const books = data().products.filter(p => p.category === 'Bookshop');
  return `<section class="hero"><div class="container hero__inner"><div><span class="hero__eyebrow">⚡ Built by students, for students</span><h1>Anything on campus.<br>At your door.</h1><p>Food, books, essentials and more — delivered by a fellow student whenever you need it.</p><form class="searchbar" id="heroSearch"><span>🔎</span><input name="q" placeholder="Search food, snacks, books..." autocomplete="off"><button class="btn btn--accent" type="submit">Find it</button></form><div class="hero__stats"><div class="hero__stat"><b>25 min</b><span>average delivery</span></div><div class="hero__stat"><b>${vcount}</b><span>ABUAD restaurants</span></div><div class="hero__stat"><b>₦500</b><span>delivery from</span></div></div></div><div class="hero__art"><div class="hero__card"><span>🍜</span><div><b>Order placed</b><small>Indomie Special from Staff Caf.</small></div><em>✓</em></div><div class="hero__card"><span>🛵</span><div><b>Rider on the way</b><small>Amara is 4 mins away</small></div><em>→</em></div><div class="hero__card"><span>🏠</span><div><b>Delivered to your hostel</b><small>Enjoy your order!</small></div><em>★</em></div></div></div></section><section class="section container"><div class="page-head"><div><h2>What do you need today?</h2><p>Pick a category and get it delivered around campus.</p></div></div><div class="grid grid--4">${[['🍔','Food','Fresh campus favourites','Food'],['🍞','Hostel meals','Quick & filling','Meals'],['🍿','Snacks','Study fuel','Snacks'],['🥤','Drinks','Cold beverages & refreshments','Drinks'],['📚','Book Shop','Textbooks & materials','Bookshop']].map((c,i)=>`<a class="cat" href="#/browse?cat=${c[3]}"><span class="cat__icon">${c[0]}</span><b>${c[1]}</b><small>${c[2]}</small></a>`).join('')}</div></section><section class="section container"><div class="page-head"><div><h2>Popular around campus</h2><p>Student favourites, ready when you are.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">See all items →</a></div><div class="grid grid--4">${data().products.slice(0,4).map(productCard).join('')}</div></section>${drinks.length?`<section class="section container"><div class="page-head"><div><h2>🥤 Drinks & Beverages</h2><p>Cold drinks, juices and refreshments delivered fast.</p></div><a class="btn btn--ghost btn--sm" href="#/browse?cat=Drinks">View all drinks →</a></div><div class="grid grid--4">${drinks.slice(0,4).map(productCard).join('')}</div></section>`:''}${books.length?`<section class="section container"><div class="page-head"><div><h2>📚 Book Shop</h2><p>Textbooks, stationery and study essentials.</p></div><a class="btn btn--ghost btn--sm" href="#/browse?cat=Bookshop">Visit the Book Shop →</a></div><div class="grid grid--4">${books.slice(0,4).map(productCard).join('')}</div></section>`:''}<section class="section container"><div class="page-head"><div><h2>ABUAD restaurants</h2><p>Reliable campus kitchens students love.</p></div><a class="btn btn--ghost btn--sm" href="#/vendors">View restaurants →</a></div><div class="scroll-x">${data().vendors.map(vendorCard).join('')}</div></section>`;
}

function browse() {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const q = (params.get('q') || '').toLowerCase();
  const cat = params.get('cat') || 'All';
  const cats = ['All','Food','Meals','Snacks','Drinks','Bookshop'];
  const vname = p => (vendor(p.vendor) || { name: '' }).name;
  const list = data().products.filter(p => (cat === 'All' || p.category === cat) && `${p.name} ${p.desc} ${vname(p)}`.toLowerCase().includes(q));
  return `<section class="section container"><div class="page-head"><div><h1>Browse campus finds</h1><p>Everything you need, from trusted student vendors.</p></div></div><div class="card card--pad-sm mb-2"><form class="searchbar" id="browseSearch"><span>🔍</span><input name="q" value="${q}" placeholder="Search items or vendors"><button class="btn" type="submit">Search</button></form></div><div class="chips mb-2">${cats.map(x=>`<a class="chip ${cat===x?'is-active':''}" href="#/browse?cat=${x}">${x}</a>`).join('')}</div><div class="row row--between mb-1"><span class="muted small">${list.length} items available</span><span class="badge badge--success">● Delivering now</span></div><div class="grid grid--4">${list.length ? list.map(productCard).join('') : empty('🔍','No matches found','Try another search or category.').replace(/<div class="empty">/, '<div class="empty" style="grid-column:1/-1">')}</div></section>`;
}

function vendors() {
  const allOpen = data().vendors.every(v => v.open);
  return `<section class="section container"><div class="page-head"><div><h1>ABUAD Restaurants</h1><p>Your campus, full of options.</p></div><span class="badge badge--${allOpen?'success':'warn'}">● ${allOpen?'All open now':'Some vendors are closed'}</span></div><div class="grid grid--3">${data().vendors.map(vendorCard).join('')}</div></section>`;
}
function vendorView(id) { const v = vendor(id); if (!v) return notFound(); const items = data().products.filter(p=>p.vendor===id); return `<section class="section container"><a href="#/vendors" class="muted small">← All vendors</a><div class="card mt-1" style="background:linear-gradient(135deg,${v.cover},var(--surface));"><div class="row"><div class="vcard__cover" style="width:74px;height:74px;background:var(--surface);border-radius:16px;flex:none">${v.icon}</div><div><h1>${v.name}</h1><div class="vcard__meta"><span class="stars">★★★★★</span><b>${v.rating}</b><span>• ${v.type}</span><span>• ${v.time}</span></div><p class="muted small mb-0">Open now · Campus delivery available</p></div></div></div><div class="page-head mt-3"><div><h2>Menu</h2><p>Tap add to include items in your order.</p></div></div><div class="grid grid--4">${items.map(productCard).join('')}</div></section>`; }

function cart() {
  const items = cartItems();
  const subtotal = cartTotal(), fee = items.length ? 500 : 0;
  return `<section class="section container"><div class="page-head"><div><h1>Your cart</h1><p>${items.length ? 'Review your items before checkout.' : 'Your next campus find awaits.'}</p></div></div>${!items.length ? empty('🛒','Your cart is empty','Explore campus vendors and add what you need.','<a class="btn mt-1" href="#/browse">Browse items</a>') : `<div class="split"><div class="card">${items.map(x=>`<div class="line"><div class="line__thumb">${x.icon}</div><div class="line__main"><div class="line__name">${x.name}</div><div class="line__sub">${(vendor(x.vendor) || { name: 'Campus vendor' }).name} · ${money(x.price)}</div></div><div class="qty"><button data-qty="${x.id}" data-delta="-1">−</button><span>${x.qty}</span><button data-qty="${x.id}" data-delta="1">+</button></div><b>${money(x.qty*x.price)}</b></div>`).join('')}</div><aside class="card sticky-side"><div class="card__head"><h3>Order summary</h3></div><div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>Delivery fee</span><span>${money(fee)}</span></div><div><span>Service fee</span><span>₦0</span></div><div class="totals__grand"><span>Total</span><span>${money(subtotal+fee)}</span></div></div><a class="btn btn--block mt-2" href="#/checkout">Checkout · ${money(subtotal+fee)}</a><p class="muted xs center mt-1 mb-0">Secure payment in Nigerian Naira</p></aside></div>`}</section>`;
}

// Get the current Supabase user id (or null if not signed in via Supabase).
async function getSupabaseUserId() {
  console.log('[TEST] getSupabaseUserId() is running');
  // DIAGNOSTIC: Check if the Supabase client is available
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('[CHECKOUT-DIAG] Supabase client is MISSING — `supabase` is undefined or null. Check that config.js loaded correctly after the Supabase CDN script.');
    return null;
  }
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('[CHECKOUT-DIAG] Failed to get Supabase session:', sessionError);
      return null;
    }
    if (!session || !session.user) {
      console.error('[CHECKOUT-DIAG] No authenticated Supabase session found. The user is NOT signed in via Supabase auth. state.user exists but there is no Supabase session — the user may have logged in via demo mode (hardcoded credentials) instead of Supabase auth.');
      return null;
    }
    console.log('[TEST] getSupabaseUserId() returned user_id =', session.user.id);
    return session.user.id;
  } catch (err) {
    console.error('[CHECKOUT-DIAG] Unexpected error getting Supabase session:', err);
    return null;
  }
}

// Save an order to Supabase (orders + order_items). Returns the order row or null on failure.
async function saveOrderToSupabase(order) {
  console.log('[TEST] saveOrderToSupabase() is running. Order =', order.id, '| user_id =', order.user_id);
  // DIAGNOSTIC: Check if the Supabase client is available
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('[CHECKOUT-DIAG] Supabase client is MISSING in saveOrderToSupabase — cannot insert order.');
    return null;
  }
  
  // DIAGNOSTIC: Log the order payload being sent
  console.log('[CHECKOUT-DIAG] Attempting to insert order into public.orders:', {
    order_number: order.id,
    user_id: order.user_id,
    total: order.total,
    fee: order.fee,
    status: order.status,
    spot: order.spot
  });

  // 1. Insert the order
  console.log('[TEST] BEFORE orders insert');
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: order.id,
      user_id: order.user_id,
      total: order.total,
      fee: order.fee,
      status: order.status,
      spot: order.spot,
      delivery_method: order.delivery_method || 'rider'
    })
    .select()
    .single();
  console.log('[TEST] AFTER orders insert. orderError =', orderError ? orderError.message : 'null', '| orderData =', orderData ? JSON.stringify(orderData) : 'null');

  if (orderError) {
    console.error('[CHECKOUT-DIAG] ORDERS INSERT FAILED:', orderError);
    console.error('[CHECKOUT-DIAG] Error code:', orderError.code, '| Message:', orderError.message, '| Details:', orderError.details, '| Hint:', orderError.hint);
    return null;
  }
  console.log('[CHECKOUT-DIAG] Order inserted successfully. order row id =', orderData.id);

  // 2. Insert all order items
  const orderId = orderData.id;
  const orderItems = order.items.map(item => ({
    order_id: orderId,
    product_id: item.id,
    qty: item.qty,
    price: item.price,
    name: item.name,
    icon: item.icon,
    vendor_id: item.vendor
  }));

  // DIAGNOSTIC: Log the order_items payload being sent
  console.log('[CHECKOUT-DIAG] Attempting to insert', orderItems.length, 'items into public.order_items:', orderItems);

  console.log('[TEST] BEFORE order_items insert');
  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);
  console.log('[TEST] AFTER order_items insert. itemsError =', itemsError ? itemsError.message : 'null');

  if (itemsError) {
    console.error('[CHECKOUT-DIAG] ORDER_ITEMS INSERT FAILED:', itemsError);
    console.error('[CHECKOUT-DIAG] Error code:', itemsError.code, '| Message:', itemsError.message, '| Details:', itemsError.details, '| Hint:', itemsError.hint);
    return null;
  }
  console.log('[CHECKOUT-DIAG] All', orderItems.length, 'order_items inserted successfully.');

  return orderData;
}

// ============================================
// Vendor Dashboard: load vendor data from Supabase
// ============================================
// Loads the authenticated vendor's own orders and products. The RLS policies
// added by 20260820_add_vendor_dashboard_workflow.sql only return rows whose
// vendor_id matches the vendor_id on the caller's profile (role = 'vendor'),
// so Vendor A can never see Vendor B's data through these queries.
async function loadVendorDataFromSupabase() {
  state.vendorLoaded = true;
  if (!state.user || state.user.role !== 'vendor' || !state.user.vendor_id) return false;
  if (typeof supabase === 'undefined' || !supabase) return false;
  try {
    const vid = state.user.vendor_id;

    // 1. Vendor's OWN order_items (RLS order_items_select_vendor restricts
    //    to this vendor's vendor_id only — never another vendor's lines).
    const { data: vendorItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('vendor_id', vid);
    if (itemsError) throw itemsError;

    // 2. Distinct order ids that contain this vendor's items.
    const vendorOrderIds = [...new Set((vendorItems || []).map(i => i.order_id))];

    // 3. Fetch those orders (RLS orders_select_vendor allows them because
    //    they contain this vendor's items).
    let ordersData = [];
    if (vendorOrderIds.length) {
      const { data, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .in('id', vendorOrderIds);
      if (ordersError) throw ordersError;
      ordersData = data || [];
    }

    // 4. Group ONLY the vendor's own items by order_id.
    const itemsByOrder = {};
    (vendorItems || []).forEach(item => {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        id: item.product_id,
        vendor: item.vendor_id,
        name: item.name,
        price: item.price,
        icon: item.icon,
        desc: '',
        category: '',
        qty: item.qty
      });
    });

    // 5. Map orders to the frontend order shape (same mapOrder used elsewhere).
    state.vendorOrders = ordersData.map(o => ({
      id: o.order_number,
      dbId: o.id,
      items: itemsByOrder[o.id] || [],
      total: o.total,
      fee: o.fee || 500,
      status: o.status || 'Order confirmed',
      spot: o.spot || '',
      delivery_method: o.delivery_method || 'rider',
      created: formatOrderCreated(o.created_at)
    }));
    store('vendor_orders', state.vendorOrders);

    // 4. Vendor's OWN products (RLS products_select_vendor).
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vid);
    if (productsError) throw productsError;
    state.vendorProducts = (productsData || []).map(p => ({
      id: p.id,
      vendor: p.vendor_id,
      name: p.name,
      desc: p.desc,
      price: p.price,
      icon: p.icon,
      category: p.category,
      active: p.active !== false
    }));
    store('vendor_products', state.vendorProducts);

    return true;
  } catch (err) {
    console.error('Vendor data load failed:', err);
    return false;
  }
}

async function ensureVendorLoaded() {
  if (!state.vendorLoaded) {
    await loadVendorDataFromSupabase();
  }
}

// ============================================
// Vendor Dashboard: views
// ============================================
function vendorOrderCard(o, activeTab) {
  const itemsHtml = o.items.map(item => `<div class="line"><span class="line__thumb">${item.icon}</span><span class="line__main"><b>${item.name}</b><small class="line__sub">× ${item.qty}</small></span><b>${money(item.price * item.qty)}</b></div>`).join('');
  const statusBadge = `<span class="badge badge--${o.status==='Delivered'||o.status==='Cancelled'?'info':'warn'}">${o.status}</span>`;
  const deliveryBadge = `<span class="badge badge--brand">${o.delivery_method||'rider'}</span>`;

  // Actions depend on current status + delivery method.
  let actions = '';
  if (o.status === 'Order confirmed') {
    if (o.delivery_method === 'both') {
      // Vendor must pick rider vs vendor_self before progressing.
      actions = `
        <div class="row mt-1">
          <button class="btn btn--sm" data-vendor-delivery="${o.id}" data-method="rider">Use rider</button>
          <button class="btn btn--sm" data-vendor-delivery="${o.id}" data-method="vendor_self">Self deliver</button>
        </div>`;
    } else {
      // Accept or reject.
      actions = `
        <div class="row mt-1">
          <button class="btn btn--sm" data-vendor-status="${o.id}" data-to="Preparing">Accept & prepare</button>
          <button class="btn btn--ghost btn--sm" data-vendor-status="${o.id}" data-to="Cancelled">Reject</button>
        </div>`;
    }
  } else if (o.status === 'Preparing') {
    actions = o.delivery_method === 'rider'
      ? `<button class="btn btn--sm" data-vendor-status="${o.id}" data-to="Ready for pickup">Ready for pickup</button>`
      : `<button class="btn btn--sm" data-vendor-status="${o.id}" data-to="Delivered">Mark delivered</button>`;
  } else if (o.status === 'Ready for pickup') {
    actions = `<span class="muted small">Awaiting rider pickup</span>`;
  } else if (o.status === 'Rider assigned' || o.status === 'Picked up') {
    actions = `<span class="muted small">In transit with rider</span>`;
  }

  return `<article class="card mb-2">
    <div class="row row--between row--wrap">
      <div>
        ${statusBadge} ${deliveryBadge}
        <h3 class="mt-1">Order #${o.id}</h3>
        <p class="muted small mb-0">${o.items.length} item${o.items.length>1?'s':''} · ${money(o.total)} · ${o.spot}</p>
      </div>
      <div class="right">
        <b class="price price--lg">${money(o.total)}</b>
      </div>
    </div>
    <div class="divider"></div>
    ${itemsHtml}
    ${actions}
  </article>`;
}

function vendorDashboard() {
  const vid = state.user && state.user.vendor_id;
  const vobj = vendor(vid || '');
  const name = vobj ? vobj.name : 'Your vendor storefront';
  const orders = state.vendorOrders || [];
  const pending = orders.filter(o => o.status === 'Order confirmed');
  const active = orders.filter(o => ['Preparing','Ready for pickup','Rider assigned','Picked up'].includes(o.status));
  const completed = orders.filter(o => ['Delivered','Cancelled'].includes(o.status));
  const earnings = orders.filter(o => o.status === 'Delivered').reduce((n,o)=> n + (o.total || 0), 0);
  const products = state.vendorProducts || [];

  const pendingHtml = pending.length
    ? pending.map(o => vendorOrderCard(o)).join('')
    : empty('📦','No pending orders','New orders will appear here when customers place them.');
  const activeHtml = active.length
    ? active.map(o => vendorOrderCard(o)).join('')
    : empty('⏳','No active orders','Orders you accept will appear here.');
  const completedHtml = completed.length
    ? completed.map(o => vendorOrderCard(o)).join('')
    : empty('✅','No completed orders','Delivered and cancelled orders will appear here.');

  const productsHtml = products.length
    ? products.map(p => `<tr><td>${p.icon} <b>${p.name}</b></td><td>${p.category}</td><td>${money(p.price)}</td><td><span class="badge badge--${p.active?'success':'warn'}">${p.active?'Live':'Hidden'}</span></td></tr>`).join('')
    : '<tr><td colspan="4" class="muted center">No products yet.</td></tr>';

  return `<section class="section container">
    <div class="page-head"><div><span class="badge badge--brand">Vendor</span><h1 class="mt-1">${name}</h1><p class="muted">Manage orders and products.</p></div><a class="btn btn--ghost btn--sm" href="#/">← Back to site</a></div>
    <div class="grid grid--stats">
      <div class="stat stat--brand"><span class="stat__label">Pending</span><span class="stat__value">${pending.length}</span><span class="stat__hint">Awaiting action</span></div>
      <div class="stat"><span class="stat__label">Active</span><span class="stat__value">${active.length}</span><span class="stat__hint">Preparing / in transit</span></div>
      <div class="stat"><span class="stat__label">Completed</span><span class="stat__value">${completed.length}</span><span class="stat__hint">Delivered or cancelled</span></div>
      <div class="stat"><span class="stat__label">Revenue</span><span class="stat__value">${money(earnings)}</span><span class="stat__hint">Delivered order value</span></div>
    </div>
    <div class="page-head mt-3"><div><h2>Pending orders</h2><p>Accept or reject incoming orders.</p></div></div>${pendingHtml}
    <div class="page-head mt-3"><div><h2>Active orders</h2><p>Orders you are preparing or delivering.</p></div></div>${activeHtml}
    <div class="page-head mt-3"><div><h2>Completed orders</h2><p>Delivered and cancelled history.</p></div></div>${completedHtml}
    <div class="page-head mt-3"><div><h2>Products</h2><p>Your live product catalog.</p></div></div>
    <div class="card mt-1"><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Status</th></tr></thead><tbody>${productsHtml}</tbody></table></div></div>
  </section>`;
}

function checkout() {
  if (!state.cart.length) { location.hash = '#/cart'; return ''; }
  // Require the user to be logged in before placing an order
  if (!state.user) {
    toast('Please sign in to place an order', 'info');
    location.hash = '#/login';
    return '';
  }
  const total = cartTotal()+500;
  return `<section class="section container"><div class="page-head"><div><h1>Checkout</h1><p>Where should your order meet you?</p></div></div><div class="split"><form id="checkoutForm" class="card stack"><div class="card__head"><h3>Delivery details</h3><span class="badge badge--brand">Campus only</span></div><div class="form-grid"><div class="field"><label>Delivery location</label><select class="select" name="location"><option>Hostel</option><option>Faculty / department</option><option>Library</option><option>Campus landmark</option></select></div><div class="field"><label>Hostel, room or landmark</label><input required class="input" name="spot" placeholder="e.g. Adams Hall, Room B12"></div><div class="field col-2"><label>Delivery note (optional)</label><textarea class="textarea" name="note" placeholder="Help your rider find you quickly."></textarea></div></div><div class="divider"></div><div class="card__head"><h3>Pay securely</h3><span class="badge badge--success">🔒 Secure</span></div><div class="radio-cards"><label class="radio-card"><input type="radio" name="payment" checked> <span>💳 Card / Transfer</span></label><label class="radio-card"><input type="radio" name="payment"> <span>👛 Campus wallet</span></label></div><button class="btn btn--block btn--lg mt-1" type="submit">Pay ${money(total)} & place order</button><p class="muted xs center mb-0">Demo payment — no money will be charged.</p></form><aside class="card sticky-side"><h3>Your order</h3>${cartItems().map(x=>`<div class="line"><span class="line__thumb">${x.icon}</span><span class="line__main"><b>${x.name}</b><small class="line__sub">× ${x.qty}</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="totals mt-1"><div><span>Delivery</span><span>₦500</span></div><div class="totals__grand"><span>Total</span><span>${money(total)}</span></div></div></aside></div></section>`;
}

async function orders() {
  await ensureOrdersLoaded();
  return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you’ve ordered on campus.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">Order again</a></div>${!state.orders.length ? empty('📦','No orders yet','When you place an order, it will appear here.','<a class="btn mt-1" href="#/browse">Browse campus finds</a>') : `<div class="stack">${state.orders.map(o=>`<article class="card"><div class="row row--between row--wrap"><div><span class="badge badge--${o.status==='Delivered'?'success':'info'}">${o.status}</span><h3 class="mt-1">Order #${o.id}</h3><p class="muted small mb-0">${o.items.length} item${o.items.length>1?'s':''} · ${o.created}</p></div><div class="right"><b class="price price--lg">${money(o.total)}</b><br><a class="link-btn small" href="#/track/${o.id}">Track order →</a></div></div><div class="divider"></div>${o.items.map(item=>`<div class="line"><span class="line__thumb">${item.icon}</span><span class="line__main"><b>${item.name}</b><small class="line__sub">× ${item.qty}</small></span><b>${money(item.price*item.qty)}</b></div>`).join('')}</article>`).join('')}</div>`}</section>`;
}
async function track(id) {
  await ensureOrdersLoaded();
  const o = state.orders.find(x=>x.id===id);
  if (!o) return notFound();
  const stages = ['Order confirmed','Rider assigned','Picked up','Delivered'];
  const current = o.status==='Delivered'?3:o.status==='Picked up'?2:o.status==='Rider assigned'?1:0;
  return `<section class="section container"><a href="#/orders" class="muted small">← My orders</a><div class="split mt-1"><div class="card"><span class="badge badge--info">${o.status}</span><h1 class="mt-1">Order #${o.id}</h1><p class="muted">Delivering to ${o.spot}</p><div class="timeline mt-3">${stages.map((s,i)=>`<div class="tl ${i<current?'tl--done':i===current?'tl--now':''}"><span class="tl__dot">${i<current?'✓':i===current?'●':'○'}</span><div><b>${s}</b><small>${i<=current ? (i===current?'In progress now':'Completed'):'Waiting for update'}</small></div></div>`).join('')}</div></div><aside class="card sticky-side"><h3>Your rider</h3><div class="row mt-1"><span class="avatar avatar--lg">A</span><div><b>Amara Okoye</b><div><span class="stars">★★★★★</span> <span class="small">4.9 · 126 deliveries</span></div></div></div><div class="divider"></div><p class="small muted">Estimated arrival</p><b>About 12 minutes</b><button class="btn btn--ghost btn--block mt-2" onclick="toast('Rider call is simulated in this demo','info')">📞 Contact rider</button></aside></div></section>`;
}

function auth(kind) { const login = kind==='login'; return `<section class="container"><div class="auth-wrap"><div class="card"><div class="center"><span class="brand__logo" style="display:inline-grid">🛵</span><h1 class="mt-1">${login?'Welcome back':'Create your account'}</h1><p class="muted">${login?'Sign in to order, track and earn.':'Join Dropzyy to order, track and earn.'}</p></div><form id="authForm" class="stack mt-2"><div class="field"><label>University email</label><input required class="input" type="email" name="email" placeholder="you@abuad.edu.ng"></div>${!login?'<div class="field"><label>Full name</label><input required class="input" name="name" placeholder="Your full name"></div><div class="field"><label>Phone (optional)</label><input class="input" name="phone" placeholder="080..."></div><div class="field"><label>Hostel / Residence (optional)</label><input class="input" name="hostel" placeholder="e.g. Adams Hall"></div>':''}<div class="field"><label>Password</label><input required class="input" type="password" name="password" placeholder="••••••••"></div>${!login?'<div class="field"><label>Confirm password</label><input required class="input" type="password" name="confirmPassword" placeholder="Re-enter your password"></div>':''}<button class="btn btn--block btn--lg" type="submit">${login?'Sign in':'Create student account'}</button></form><p class="center small muted mt-2 mb-0">${login?'New here? <a class="link-btn" href="#/register">Create an account</a>':'Already have an account? <a class="link-btn" href="#/login">Sign in</a>'}</p></div></div></section>`; }

function rider() {
  const riderStatus = state.rider ? state.rider.status : null;
  const isApprovedRider = riderStatus === 'approved';
  const pending=state.riderPool.filter(o=>o.status==='Order confirmed'&&(o.delivery_method??'rider')!=='vendor_self');
  const active=state.riderPool.filter(o=>(o.status==='Rider assigned'||o.status==='Picked up')&&(o.delivery_method??'rider')!=='vendor_self');
  const done=state.riderPool.filter(o=>o.status==='Delivered'&&(o.delivery_method??'rider')!=='vendor_self');
  const earnings=done.reduce((n,o)=>n+(o.fee||500),0);
  const pickupName=o=>{const v=o.items[0]?vendor(o.items[0].vendor):null;return `${v?v.name:'Campus vendor'} → ${o.spot}`;};
  const statusBadge = riderStatus === 'approved'
    ? '<span class="badge badge--success">● Approved rider</span>'
    : riderStatus === 'pending'
      ? '<span class="badge badge--warn">● Application pending review</span>'
      : riderStatus === 'rejected'
        ? '<span class="badge badge--danger">● Application rejected — you can reapply</span>'
        : riderStatus === 'suspended'
          ? '<span class="badge badge--danger">● Account suspended</span>'
          : '<span class="badge badge--warn">● Not a rider yet</span>';
  const actionBtn = riderStatus === 'approved'
    ? '<button class="btn btn--soft" id="riderToggle">Go offline / online</button>'
    : riderStatus === 'pending'
      ? '<button class="btn btn--ghost" disabled>Application pending</button>'
      : '<a class="btn btn--soft" href="#/rider/apply">Become a rider</a>';
  const ratingCard = state.rider ? `
    <div class="card mt-3">
      <div class="card__head"><h3>My rider profile</h3></div>
      <div class="row"><span class="avatar avatar--lg">🛵</span><div>
        <b>${state.user ? state.user.name : 'Rider'}</b>
        <div class="small muted">Matric: ${state.rider.matric_number || '—'} · Phone: ${state.rider.phone || '—'}</div>
        <div class="small"><span class="stars">${'★'.repeat(Math.round(Number(state.rider.rating_avg) || 5))}${'☆'.repeat(5 - Math.round(Number(state.rider.rating_avg) || 5))}</span>
        <b>${state.rider.rating_avg ? Number(state.rider.rating_avg).toFixed(1) : '5.0'}</b>
        <span class="muted">(${state.rider.rating_count || 0} ratings)</span></div>
      </div></div>
    </div>` : '';
  const availableHtml = pending.length && isApprovedRider
    ? `<div class="grid grid--2">${pending.map((o,i)=>`<article class="card"><div class="row row--between"><span class="badge badge--warn">${money(o.fee||500)} earnings</span><span class="small muted">${i+2} min away</span></div><h3 class="mt-1">${pickupName(o)}</h3><p class="muted small">${o.items.length} item${o.items.length>1?'s':''} · Order #${o.id}</p><a class="btn btn--ghost btn--block" href="#/track/${o.id}">View details</a><button class="btn btn--block" data-accept="${o.id}">Accept delivery</button></article>`).join('')}</div>`
    : isApprovedRider
      ? `<div class="empty"><div class="empty__icon">🛵</div><b>No available deliveries</b><span>New orders will appear here as soon as they are placed.</span></div>`
      : `<div class="empty"><div class="empty__icon">🛵</div><b>Become a rider first</b><span>Submit an application to unlock deliveries.</span><a class="btn mt-1" href="#/rider/apply">Apply now</a></div>`;
  const activeHtml = active.length
    ? `<div class="stack">${active.map(o=>{const picked=o.status==='Picked up';return `<article class="card"><div class="row row--between"><span class="badge badge--info">${o.status}</span><span class="small muted">Order #${o.id}</span></div><h3 class="mt-1">${pickupName(o)}</h3><p class="muted small">${o.items.length} item${o.items.length>1?'s':''} · ${money(o.fee||500)} earnings</p>${picked?`<button class="btn btn--block" data-delivered="${o.id}">Mark delivered</button>`:`<button class="btn btn--block" data-pickup="${o.id}">Mark as picked up</button>`}</article>`;}).join('')}</div>`
    : '<div class="empty"><div class="empty__icon">📭</div><b>No active deliveries</b><span>Accept an available delivery to get started.</span></div>';
  return `<section class="section container"><div class="page-head"><div><h1>Rider hub</h1><p>Deliver around campus, on your own schedule.</p></div>${statusBadge} ${actionBtn}</div><div class="grid grid--stats"><div class="stat stat--brand"><span class="stat__label">Today’s earnings</span><span class="stat__value">${money(earnings)}</span><span class="stat__hint">${done.length} completed delivery${done.length===1?'':'ies'}</span></div><div class="stat"><span class="stat__label">Deliveries today</span><span class="stat__value">${done.length}</span><span class="stat__hint">${active.length} active now</span></div><div class="stat"><span class="stat__label">Acceptance rate</span><span class="stat__value">96%</span><span class="stat__hint">Great work!</span></div></div>${ratingCard}<div class="page-head mt-3"><div><h2>Available deliveries</h2><p>Accept one when you’re ready.</p></div>${isApprovedRider?'<span class="badge badge--success">● You\'re online</span>':'<span class="badge badge--warn">● Applying required</span>'}</div>${availableHtml}<div class="page-head mt-3"><div><h2>Active deliveries</h2><p>Progress on the deliveries you accepted.</p></div></div>${activeHtml}</section>`;
}
function riderApply() {
  if (state.rider && ['pending','approved','suspended'].includes(state.rider.status)) {
    return `<section class="container"><div class="auth-wrap" style="max-width:640px"><div class="card center">
      <span style="font-size:3rem">${state.rider.status === 'approved' ? '🛵' : state.rider.status === 'suspended' ? '⛔' : '⏳'}</span>
      <h1 class="mt-1">${state.rider.status === 'approved' ? 'You are an approved rider!' : state.rider.status === 'suspended' ? 'Account suspended' : 'Application pending'}</h1>
      <p class="muted">${state.rider.status === 'approved' ? 'You can now accept deliveries from the Rider hub.' : state.rider.status === 'suspended' ? 'Contact admin to resolve your account status.' : 'We are reviewing your application. You will be able to accept deliveries once approved.'}</p>
      <a class="btn mt-2" href="#/rider">Back to Rider hub</a>
    </div></div></section>`;
  }
  return `<section class="container"><div class="auth-wrap" style="max-width:640px"><div class="card"><h1>Earn by delivering</h1><p class="muted">Use your free time to help fellow students and earn per delivery.</p><div class="grid grid--3 mt-2"><div class="stat"><span>🕒</span><b>Flexible hours</b><small class="muted">Go online when it works for you.</small></div><div class="stat"><span>💸</span><b>Weekly payouts</b><small class="muted">Keep track of every delivery.</small></div><div class="stat"><span>🛡️</span><b>Campus-only</b><small class="muted">A verified student community.</small></div></div><form id="riderForm" class="stack mt-3"><div class="form-grid"><div class="field"><label>Student ID / Matric number</label><input class="input" name="studentId" required placeholder="e.g. 23/1234"></div><div class="field"><label>Phone number</label><input class="input" name="phone" required placeholder="080... "></div></div><button class="btn btn--block" type="submit">Submit rider application</button></form></div></div></section>`;
}
function saveAdminForm(form) {
  const f=new FormData(form), isVendor=form.id==='vendorForm', id=f.get('id');
  if(isVendor) { const item={id:id||`${f.get('name').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now().toString().slice(-4)}`,name:f.get('name').trim(),type:f.get('type').trim(),icon:f.get('icon').trim()||'🏪',time:f.get('time').trim()||'15–25 min',rating:f.get('rating')||'4.5',cover:f.get('cover')||'#d9f5e9',open:f.get('open')==='on'}, i=data().vendors.findIndex(v=>v.id===id); i<0?data().vendors.push(item):data().vendors[i]=item; }
  else { const item={id:id?Number(id):Math.max(0,...data().products.map(p=>p.id))+1,vendor:f.get('vendor'),name:f.get('name').trim(),price:Number(f.get('price')),category:f.get('category').trim(),icon:f.get('icon').trim()||'🍽️',desc:f.get('desc').trim()},i=data().products.findIndex(p=>p.id===Number(id)); i<0?data().products.push(item):data().products[i]=item; }
  saveCatalog(); render(); toast(`${isVendor?'Vendor':'Product'} saved and now live`); return false;
}
function adminWorkspace() {
  setTimeout(() => {
    $('#resetCatalog')?.addEventListener('click', ()=>adminAction('reset'));
    document.querySelectorAll('[data-edit-vendor]').forEach(b=>b.addEventListener('click',()=>adminAction('vendor',b.dataset.editVendor)));
    document.querySelectorAll('[data-edit-product]').forEach(b=>b.addEventListener('click',()=>adminAction('product',b.dataset.editProduct)));
    document.querySelectorAll('[data-delete-vendor]').forEach(b=>b.addEventListener('click',()=>adminAction('deleteVendor',b.dataset.deleteVendor)));
    document.querySelectorAll('[data-delete-product]').forEach(b=>b.addEventListener('click',()=>adminAction('deleteProduct',b.dataset.deleteProduct)));
    document.querySelectorAll('[data-toggle-vendor]').forEach(b=>b.addEventListener('click',()=>adminAction('toggle',b.dataset.toggleVendor)));
    document.querySelectorAll('[data-clear-form]').forEach(b=>b.addEventListener('click',()=>adminAction(b.dataset.clearForm)));
  }, 0);
  const vendors = data().vendors, products = data().products;
  return `<section class="section container"><div class="page-head"><div><span class="badge badge--brand">Platform control</span><h1 class="mt-1">Content manager</h1><p>Changes are saved instantly and appear across the customer pages.</p></div><button class="btn btn--ghost" id="resetCatalog">Restore demo catalog</button></div>
  <div class="grid grid--stats"><div class="stat stat--brand"><span class="stat__label">Vendors</span><span class="stat__value">${vendors.length}</span><span class="stat__hint">Visible on the marketplace</span></div><div class="stat"><span class="stat__label">Products</span><span class="stat__value">${products.length}</span><span class="stat__hint">Available menu items</span></div><div class="stat"><span class="stat__label">Orders</span><span class="stat__value">${state.orders.length}</span><span class="stat__hint">Stored on this device</span></div></div>
  <div class="split mt-3"><form class="card stack" id="vendorForm"><div class="card__head"><h3 id="vendorFormTitle">Add vendor</h3><button class="link-btn" type="button" data-clear-form="vendor">Clear</button></div><input type="hidden" name="id"><div class="form-grid"><div class="field"><label>Vendor name</label><input class="input" name="name" required placeholder="e.g. Campus Pharmacy"></div><div class="field"><label>Type</label><input class="input" name="type" required placeholder="e.g. Essentials"></div><div class="field"><label>Icon</label><input class="input" name="icon" value="🏪" maxlength="8"></div><div class="field"><label>Delivery time</label><input class="input" name="time" value="15–25 min"></div><div class="field"><label>Rating</label><input class="input" name="rating" type="number" min="0" max="5" step="0.1" value="4.5"></div><div class="field"><label>Cover colour</label><input class="input" name="cover" value="#d9f5e9" pattern="#[0-9a-fA-F]{6}"></div></div><label class="radio-card"><input name="open" type="checkbox" checked> Open for orders</label><button class="btn btn--block" type="submit">Save vendor</button></form>
  <form class="card stack" id="productForm"><div class="card__head"><h3 id="productFormTitle">Add product</h3><button class="link-btn" type="button" data-clear-form="product">Clear</button></div><input type="hidden" name="id"><div class="form-grid"><div class="field"><label>Product name</label><input class="input" name="name" required placeholder="e.g. Meat pie"></div><div class="field"><label>Vendor</label><select class="select" name="vendor" required>${vendors.map(v=>`<option value="${v.id}">${v.name}</option>`).join('')}</select></div><div class="field"><label>Price (₦)</label><input class="input" name="price" required min="0" type="number" placeholder="1000"></div><div class="field"><label>Category</label><input class="input" name="category" required placeholder="Food"></div><div class="field"><label>Icon</label><input class="input" name="icon" value="🍽️" maxlength="8"></div><div class="field col-2"><label>Description</label><textarea class="textarea" name="desc" required placeholder="A short description for customers."></textarea></div></div><button class="btn btn--block" type="submit">Save product</button></form></div>
  <div class="card mt-3"><div class="card__head"><h3>Vendors</h3><span class="muted small">Edit availability or details</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Vendor</th><th>Type</th><th>Time</th><th>Status</th><th></th></tr></thead><tbody>${vendors.map(v=>`<tr><td>${v.icon} <b>${v.name}</b></td><td>${v.type}</td><td>${v.time}</td><td><button class="link-btn" data-toggle-vendor="${v.id}">${v.open?'Open':'Closed'}</button></td><td><button class="link-btn" data-edit-vendor="${v.id}">Edit</button> · <button class="link-btn" data-delete-vendor="${v.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></div>
  <div class="card mt-3"><div class="card__head"><h3>Products</h3><span class="muted small">${products.length} live items</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Vendor</th><th>Category</th><th>Price</th><th></th></tr></thead><tbody>${products.map(p=>`<tr><td>${p.icon} <b>${p.name}</b></td><td>${vendor(p.vendor)?.name || '—'}</td><td>${p.category}</td><td>${money(p.price)}</td><td><button class="link-btn" data-edit-product="${p.id}">Edit</button> · <button class="link-btn" data-delete-product="${p.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></div></section>`;
}
function notFound() { return `<section class="section container">${empty('🧭','Page not found','This campus path does not exist.','<a class="btn mt-1" href="#/">Go home</a>')}</section>`; }

function updateChrome() { const count = state.cart.reduce((n,x)=>n+x.qty,0); $('#cartCount').hidden=!count; $('#cartCount').textContent=count; $('#notifDot').hidden=!state.notifications.some(n=>n.unread); $('#userAvatar').textContent=state.user ? state.user.name.charAt(0).toUpperCase() : '👤'; const nav=[['#/','Home'],['#/browse','Browse'],['#/vendors','Vendors'],['#/rider','Earn']]; $('#topnav').innerHTML=nav.map(([h,n])=>`<a href="${h}" class="${location.hash.startsWith(h) && h!=='#/' || location.hash==='#/'&&h==='#/'?'is-active':''}">${n}</a>`).join(''); $('#bottomnav').innerHTML=[['#/','⌂','Home'],['#/browse','⌕','Browse'],['#/cart','🛒','Cart'],['#/orders','◷','Orders'],['#/rider','₦','Earn']].map(([h,i,n])=>`<a href="${h}" class="${location.hash.startsWith(h)&&h!=='#/'||location.hash==='#/'&&h==='#/'?'is-active':''}"><i>${i}</i>${n}${n==='Cart'&&count?`<span class="badge-count">${count}</span>`:''}</a>`).join(''); $('#userPanel').innerHTML=state.user?`<div class="dropdown__meta"><b>${state.user.name}</b><br><span class="muted small">${state.user.email}</span></div><div class="dropdown__sep"></div><a class="dropdown__item" href="#/orders">📦 My orders</a><a class="dropdown__item" href="#/rider">🛵 Rider hub</a><a class="dropdown__item" href="#/vendor">🏪 Vendor dashboard</a><a class="dropdown__item" href="#/admin">⚙️ Admin dashboard</a><div class="dropdown__sep"></div><button class="dropdown__item" id="logoutBtn">↪ Sign out</button>`:`<a class="dropdown__item" href="#/login">↪ Sign in</a><a class="dropdown__item" href="#/register">✦ Create account</a>`; $('#notifList').innerHTML=state.notifications.map(n=>`<div class="notif ${n.unread?'notif--unread':''}"><span>🔔</span><div><div class="notif__title">${n.title}</div><div class="notif__body">${n.body}</div><div class="notif__time">${n.time}</div></div></div>`).join(''); 
  // Show/hide Admin link based on user role (profiles.role === 'admin')
  const adminLink = document.getElementById('adminLink');
  if (adminLink) {
    adminLink.hidden = !(state.user && state.user.role === 'admin');
  }
}

async function render() {
  const [path] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  let view;
  if (!parts.length) view = home();
  else if (parts[0]==='browse') view = browse();
  else if (parts[0]==='vendors') view = vendors();
  else if (parts[0]==='vendor' && parts[1]) view = vendorView(parts[1]);
  else if (parts[0]==='cart') view = cart();
  else if (parts[0]==='checkout') view = checkout();
  else if (parts[0]==='orders') view = await orders();
  else if (parts[0]==='track') view = await track(parts[1]);
  else if (parts[0]==='login' || parts[0]==='register') view = auth(parts[0]);
  else if (parts[0]==='rider' && parts[1]==='apply') view = riderApply();
  else if (parts[0]==='rider') view = rider();
  else if (parts[0]==='vendor') {
    // Vendor dashboard gate: require Supabase auth + profile role='vendor'
    // + a linked vendor_id. RLS on orders/products enforces that the data
    // returned belongs to this vendor only.
    if (!state.user || state.user.role !== 'vendor' || !state.user.vendor_id) {
      view = `<section class="section container"><div class="auth-wrap" style="max-width:640px"><div class="card center">
        <span style="font-size:3rem">🏪</span>
        <h1 class="mt-1">Vendor dashboard</h1>
        <p class="muted">Only accounts with the vendor role and a linked vendor can access this page.</p>
        <a class="btn mt-2" href="#/">Back to home</a>
      </div></div></section>`;
    } else {
      await ensureVendorLoaded();
      view = vendorDashboard();
    }
  }
  else if (parts[0]==='admin') {
    if (parts[1] === 'login') {
      if (window.AdminHub) window.AdminHub.renderLogin();
    } else {
      const authed = window.AdminHub ? await AdminHub.init() : false;
      if (!authed) { location.hash = '#/admin/login'; return; }
    }
    updateChrome();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  else view = notFound();
  $('#app').innerHTML = view;
  updateChrome();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.addEventListener('click', e=>{
  const add=e.target.closest('[data-add]'); if(add) addCart(add.dataset.add);
  const q=e.target.closest('[data-qty]'); if(q){const line=state.cart.find(x=>x.id===Number(q.dataset.qty)); if(!line)return; line.qty+=Number(q.dataset.delta); if(line.qty<1) state.cart=state.cart.filter(x=>x!==line); save(); render();}
  const accept=e.target.closest('[data-accept]'); if(accept){const o=state.riderPool.find(x=>x.id===accept.dataset.accept); if(o && state.rider && state.rider.id){
    const prevStatus=o.status;
    o.status='Rider assigned'; save();
    addNotification('Rider assigned',`A rider accepted order #${o.id}. They are on their way to the pickup point.`);
    if(typeof supabase!=='undefined' && supabase && o.dbId){
      supabase.from('orders').update({ status:'Rider assigned', rider_id: state.rider.id }).eq('id',o.dbId)
        .then(({ error })=>{ if(error){ console.error('Rider claim sync failed:', error); o.status=prevStatus; save(); } })
        .catch(err=>console.error('Rider claim sync error:', err));
    }
    toast('Delivery added to your rider queue'); render();
  }}
  const pickup=e.target.closest('[data-pickup]'); if(pickup){const o=state.riderPool.find(x=>x.id===pickup.dataset.pickup); if(o){
    o.status='Picked up'; save();
    addNotification('Order picked up',`Order #${o.id} has been picked up and is on its way.`);
    if(typeof supabase!=='undefined' && supabase && o.dbId){
      supabase.from('orders').update({ status:'Picked up' }).eq('id',o.dbId)
        .then(({ error })=>{ if(error) console.error('Rider pickup sync failed:', error); })
        .catch(err=>console.error('Rider pickup sync error:', err));
    }
    toast('Order marked as picked up'); render();
  }}
  const delivered=e.target.closest('[data-delivered]'); if(delivered){const o=state.riderPool.find(x=>x.id===delivered.dataset.delivered); if(o){
    o.status='Delivered'; save();
    addNotification('Order delivered',`Order #${o.id} was delivered successfully. Well done!`);
    if(typeof supabase!=='undefined' && supabase && o.dbId){
      supabase.from('orders').update({ status:'Delivered' }).eq('id',o.dbId)
        .then(({ error })=>{ if(error) console.error('Rider delivery sync failed:', error); })
        .catch(err=>console.error('Rider delivery sync error:', err));
    }
    toast('Delivery completed — earnings added!'); render();
  }}
  // Vendor order status transitions (accept 'Preparing' / reject 'Cancelled' /
  // mark 'Ready for pickup' / vendor-self 'Delivered'). Every change is
  // persisted to Supabase then re-renders the dashboard.
  const vstatus=e.target.closest('[data-vendor-status]'); if(vstatus){
    const order=state.vendorOrders.find(x=>x.id===vstatus.dataset.vendorStatus);
    const to=vstatus.dataset.to;
    if(!order || !to) return;
    const prev=order.status;
    order.status=to;
    save();
    addNotification('Order updated',`Order #${order.id} is now ${to}.`);
    if(typeof supabase!=='undefined' && supabase && order.dbId){
      supabase.from('orders').update({ status: to }).eq('id', order.dbId)
        .then(({ error })=>{ if(error){ console.error('Vendor status update failed:', error); order.status=prev; save(); } })
        .catch(err=>console.error('Vendor status update error:', err));
    }
    toast(`Order #${order.id}: ${to}`);
    render();
  }
  // Vendor chooses delivery method for 'both' orders.
  const vdelivery=e.target.closest('[data-vendor-delivery]'); if(vdelivery){
    const order=state.vendorOrders.find(x=>x.id===vdelivery.dataset.vendorDelivery);
    const method=vdelivery.dataset.method;
    if(!order || !method) return;
    const prevMethod=order.delivery_method;
    order.delivery_method=method;
    if(method==='vendor_self' && order.status==='Order confirmed') order.status='Preparing';
    save();
    addNotification('Delivery method set',`Order #${order.id} will use ${method} delivery.`);
    if(typeof supabase!=='undefined' && supabase && order.dbId){
      supabase.from('orders').update({ delivery_method: method, status: order.status }).eq('id', order.dbId)
        .then(({ error })=>{ if(error){ console.error('Vendor delivery-method update failed:', error); order.delivery_method=prevMethod; save(); } })
        .catch(err=>console.error('Vendor delivery-method update error:', err));
    }
    toast(`Order #${order.id}: ${method==='rider'?'Rider will deliver':'You will deliver this order'}`);
    render();
  }
  if(e.target.id==='riderToggle' && state.rider){
    state.rider.available = !state.rider.available;
    save();
    if (typeof supabase !== 'undefined' && supabase && state.rider.id) {
      supabase.from('riders').update({ available: state.rider.available }).eq('id', state.rider.id)
        .then(({ error }) => { if (error) console.error('Rider availability sync failed:', error); })
        .catch(err => console.error('Rider availability sync error:', err));
    }
    toast(state.rider.available ? 'You are now online' : 'You are now offline', 'info');
    render();
  }
  if(e.target.id==='logoutBtn'){state.user=null; save(); location.hash='#/'; toast('Signed out','info'); supabase.auth.signOut().catch(()=>{});}
});

document.addEventListener('submit', e=>{
  if(e.target.id==='vendorForm'||e.target.id==='productForm'){e.preventDefault(); saveAdminForm(e.target); return;}
  if(e.target.id==='heroSearch'||e.target.id==='browseSearch'){e.preventDefault(); location.hash=`#/browse?q=${encodeURIComponent(new FormData(e.target).get('q'))}`;}
  if(e.target.id==='authForm'){
    e.preventDefault();
    const f=new FormData(e.target);
    const isRegister=location.hash==='#/register';
    const email=f.get('email'), password=f.get('password');
    if(isRegister){
      // Confirm-password validation: must match the password field.
      const confirmPassword=f.get('confirmPassword')||'';
      if(password!==confirmPassword){
        toast('Passwords do not match','error');
        return;
      }
      if(password.length<6){
        toast('Password must be at least 6 characters','error');
        return;
      }
      const full_name=f.get('name')||'';
      const phone=f.get('phone')||'';
      const hostel=f.get('hostel')||'';
      supabase.auth.signUp({ email, password, options: { data: { full_name, phone, hostel } } })
        .then(async ({ data, error }) => {
          if(error){ toast(error.message,'error'); return; }
          if(data.user){
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({ id: data.user.id, email, full_name, phone, hostel });
            if(profileError){ console.error('Profile insert error:', profileError); }
          }
          if(data.session){
            // Email confirmation is disabled — sign the user in immediately.
            state.user={name:full_name||email.split('@')[0],email,role:'user'};
            save();
            addNotification('You\'re signed in','Start exploring what\'s available around campus.');
            location.hash='#/';
            toast('Welcome to CampusRun!');
          } else {
            // Email confirmation is required — the account is created but not
            // yet active, so ask the user to confirm before signing in.
            toast('Account created! Check your email to confirm your account.','info');
            location.hash='#/login';
          }
        });
    } else {
      supabase.auth.signInWithPassword({ email, password })
        .then(async ({ data, error }) => {
          if(error){ toast(error.message,'error'); return; }
          let name=email.split('@')[0];
          let role='user';
          let vendor_id=null;
          if(data.user){
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, role, vendor_id')
              .eq('id', data.user.id)
              .single();
            if(profile && profile.full_name) name=profile.full_name;
            if(profile && profile.role) role=profile.role;
            if(profile && profile.vendor_id) vendor_id=profile.vendor_id;
          }
          state.user={name,email,role,vendor_id};
          save();
          addNotification('You\'re signed in','Start exploring what\'s available around campus.');
          location.hash='#/';
          toast('Welcome to CampusRun!');
        });
    }
  }
  if(e.target.id==='checkoutForm'){
    e.preventDefault();
    console.log('[TEST] Checkout submit handler started');
    // Require the user to be logged in before placing an order
    if(!state.user){ toast('Please sign in to place an order','info'); location.hash='#/login'; return; }
    const f=new FormData(e.target), total=cartTotal()+500;
    const orderNumber=`CR-${Math.floor(1000+Math.random()*8999)}`;
    const items=cartItems();
    const order={id:orderNumber,items,total,fee:500,status:'Order confirmed',spot:`${f.get('location')}: ${f.get('spot')}`,created:'Just now',delivery_method:'rider'};
    
    // DIAGNOSTIC: Log the checkout flow start
    console.log('[CHECKOUT-DIAG] Checkout form submitted. Order number =', orderNumber, '| Cart items =', order.items.length, '| Total =', total);
    
    // DIAGNOSTIC: Check if Supabase client is available
    if (typeof supabase === 'undefined' || !supabase) {
      console.error('[CHECKOUT-DIAG] FATAL: Supabase client is MISSING at checkout time. Cannot save order to public.orders. Check that config.js loaded correctly.');
      toast('Order failed: Supabase client not available', 'error');
      return;
    }
    
    // DIAGNOSTIC: Check if user is authenticated via Supabase
    getSupabaseUserId().then(async userId => {
      if(!userId){
        console.error('[CHECKOUT-DIAG] FATAL: No Supabase user_id obtained. Order NOT saved to public.orders. The user must be signed in via Supabase auth (not demo mode) to place an order.');
        toast('Order failed: Not authenticated with Supabase', 'error');
        return;
      }
      
      order.user_id=userId;
      const saved=await saveOrderToSupabase(order);
      if(saved){
        // Only clear the cart after the Supabase order and all order_items are successfully saved
        state.orders.unshift(order);
        state.cart=[];
        addNotification('Order confirmed',`Your order #${order.id} is being matched with a rider.`);
        save();
        location.hash=`#/track/${order.id}`;
        toast('Order placed successfully!');
        return;
      }
      
      // DIAGNOSTIC: saveOrderToSupabase already logged the specific error
      console.error('[CHECKOUT-DIAG] FATAL: Order was NOT saved to Supabase. See error above. Cart NOT cleared.');
      toast('Order failed: Could not save to Supabase', 'error');
    });
  }
  if(e.target.id==='riderForm'){
    e.preventDefault();
    submitRiderApplication(new FormData(e.target));
  }
});

$('#themeBtn').addEventListener('click',()=>{const d=document.documentElement; d.dataset.theme=d.dataset.theme==='dark'?'light':'dark'; $('#themeBtn').textContent=d.dataset.theme==='dark'?'☀️':'🌙'; localStorage.setItem('campusrun_theme',d.dataset.theme);});
$('#notifBtn').addEventListener('click',()=>$('#notifPanel').hidden=!$('#notifPanel').hidden); $('#userBtn').addEventListener('click',()=>$('#userPanel').hidden=!$('#userPanel').hidden); $('#notifClear').addEventListener('click',()=>{state.notifications.forEach(n=>n.unread=false); save();});
document.addEventListener('click',e=>{if(!e.target.closest('#notifWrap'))$('#notifPanel').hidden=true; if(!e.target.closest('#userWrap'))$('#userPanel').hidden=true;});

// Cross-tab sync: when another tab/page (e.g. the admin panel) writes to
// localStorage, refresh the in-memory catalog and re-render so the customer
// site reflects admin changes live. Also refresh when the tab becomes visible.
window.addEventListener('storage', (e) => {
  if (e.key === 'campusrun_catalog_v3') {
    state.catalog = mergeSeedIntoStored(load('catalog_v3', clone(SEED_DATA)));
    render();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    state.catalog = mergeSeedIntoStored(load('catalog_v3', clone(SEED_DATA)));
    render();
  }
});

document.documentElement.dataset.theme=localStorage.getItem('campusrun_theme')||'light'; $('#themeBtn').textContent=document.documentElement.dataset.theme==='dark'?'☀️':'🌙'; $('#year').textContent=new Date().getFullYear(); window.addEventListener('hashchange',render); if(!location.hash) location.hash='#/'; else render();

// Load the catalog from Supabase (falls back to localStorage on failure).
loadCatalogFromSupabase();

// Load the authenticated user's orders from Supabase (falls back to localStorage).
loadOrdersFromSupabase();

// Load the authenticated user's rider status from Supabase.
loadRiderFromSupabase();

// Session persistence: restore the Supabase session on load so a page refresh
// keeps the user signed in (and restores their profile name).
supabase.auth.getSession().then(({ data: { session } }) => {
  if(session && session.user){
    supabase.from('profiles').select('full_name').eq('id', session.user.id).single()
      .then(({ data: profile }) => {
        const userRole = (profile && profile.role) || 'user';
    state.user={name:(profile && profile.full_name) || session.user.email.split('@')[0],email:session.user.email,role:userRole,vendor_id:(profile && profile.vendor_id) || null};
        save();
        render();
      })
      .catch(()=>{
        state.user={name:session.user.email.split('@')[0],email:session.user.email,role:'user'};
        save();
        render();
      });
  }
});