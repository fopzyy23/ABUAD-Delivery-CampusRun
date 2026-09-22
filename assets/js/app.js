const SEED_DATA = {
  vendors: [
    { id: 'captain-cook', name: 'Captain Cook', icon: '🍔', type: 'Restaurant', rating: '4.8', time: '15–25 min', cover: '#ffe7bc', open: true, description: 'Campus favourite for rice, chicken and hearty plates.', opening_hours: 'Mon–Sun 08:00–21:00' },
    { id: 'season-deli', name: 'Season Deli', icon: '🥪', type: 'Restaurant', rating: '4.7', time: '10–18 min', cover: '#f4d7a6', open: true, description: 'Sandwiches, deli-style meals and quick bites.', opening_hours: 'Mon–Sat 09:00–19:00' },
    { id: 'staff-caf', name: 'Staff Caf', icon: '🍛', type: 'Restaurant', rating: '4.6', time: '12–20 min', cover: '#d8e6ff', open: true, description: 'Reliable cafeteria meals for the whole campus.', opening_hours: 'Mon–Fri 07:00–18:00, Sat 08:00–14:00' },
    { id: 'caf-1', name: 'Caf 1', icon: '🍲', type: 'Restaurant', rating: '4.8', time: '10–18 min', cover: '#d9f5e9', open: true, description: 'Wide menu of Nigerian classics and snacks.', opening_hours: 'Mon–Sun 08:00–20:00' },
    { id: 'caf-2', name: 'Caf 2', icon: '🍝', type: 'Restaurant', rating: '4.5', time: '15–22 min', cover: '#f4def8', open: true, description: 'Rice, pasta and shared favourites.', opening_hours: 'Mon–Sun 08:00–20:00' },
    { id: 'caf-3', name: 'Caf 3', icon: '🍗', type: 'Restaurant', rating: '4.6', time: '12–20 min', cover: '#ffe1d6', open: true, description: 'Grilled options and daily specials.', opening_hours: 'Mon–Fri 08:00–18:00, Sat 10:00–16:00' },
    { id: 'streat-food', name: 'Streat food', icon: '🍟', type: 'Restaurant', rating: '4.7', time: '8–15 min', cover: '#fff1bd', open: true, description: 'Suya, chips and street-food classics.', opening_hours: 'Mon–Sun 12:00–22:00' },
    { id: 'med-caf', name: 'Med Caf', icon: '🥘', type: 'Restaurant', rating: '4.5', time: '15–25 min', cover: '#dceaff', open: true, description: 'Wholesome cafeteria meals at student prices.', opening_hours: 'Mon–Sat 08:00–18:00' },
    { id: 'smoothie-shack', name: 'Smoothie Shack', icon: '🥤', type: 'Restaurant', rating: '4.6', time: '10–18 min', cover: '#e4d9ff', open: true, description: 'Fresh smoothies, shakes and cold drinks.', opening_hours: 'Mon–Sun 09:00–20:00' },
    { id: 'bookshop', name: 'Campus Bookshop', icon: '📚', type: 'Bookshop', rating: '4.7', time: '5–10 min', cover: '#d8e0ff', open: true, description: 'Textbooks, stationery and study essentials.', opening_hours: 'Mon–Fri 08:00–17:00, Sat 09:00–13:00' },
    { id: 'campus-drinks', name: 'Campus Drinks', icon: '🥤', type: 'Beverages', rating: '4.6', time: '5–10 min', cover: '#ffe4e1', open: true, description: 'Cold drinks, juices and refreshments.', opening_hours: 'Mon–Sun 08:00–22:00' }
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

// ============================================================
// Reach Us — contact configuration (homepage "Reach Us" cards)
// ============================================================
// TODO: Replace both placeholder values with the real Dropzyy
// support email and WhatsApp Channel invite link. They are used by
// homeReachUs() (WhatsApp / Email cards) — change them here only.
const DROPZYY_SUPPORT_EMAIL = 'zyy.work.zyy@gmail.com'; // ← PASTE EMAIL HERE
const DROPZYY_WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Vb95rgV4tRrjXoGl1I1E'; // ← PASTE WHATSAPP CHANNEL LINK HERE

const $ = s => document.querySelector(s);
const money = n => `₦${Number(n).toLocaleString('en-NG')}`;
const store = (key, value) => localStorage.setItem(`campusrun_${key}`, JSON.stringify(value));
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`campusrun_${key}`)) ?? fallback; } catch { return fallback; } };
const clone = value => JSON.parse(JSON.stringify(value));
// Escape user-controlled text before it is inserted into innerHTML/template
// literals. Prevents HTML/XSS injection via names, descriptions, spots,
// comments, notifications, etc.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&' + 'amp;', '<': '&' + 'lt;', '>': '&' + 'gt;', '"': '&' + 'quot;', "'": '&' + '#39;' }[c]));
const state = { cart: load('cart', []), orders: [], user: null, notifications: load('notifications', [{ title: 'Welcome to Dropzyy', body: 'Order campus essentials and track every step.', time: 'Just now', unread: true }]), notificationsLoading: false, notificationsError: false, notificationsChannel: null, catalog: load('catalog_v3', clone(SEED_DATA)), rider: null, riderPool: [], riderErrors: {}, riderSubmitting: {}, riderStatusError: null, vendorOrders: [], vendorProducts: [], withdrawals: [], withdrawalsLoaded: false, withdrawalsError: null, withdrawalSubmitting: false, vendorLoaded: false, vendorLoadError: null, riderLoaded: false, ordersLoadError: false, catalogLoadError: false, riderLoadError: false, refunds: [], refundsLoaded: false, refundSubmitting: false, refundSuccessNotice: null, reportSubmitting: false, reportSuccess: null, checkoutSubmitting: false, riderEarnings: null };

// Re-read the catalog from storage on every access. The catalog's source of
// truth is Supabase (loadCatalogFromSupabase persists it under 'catalog_v3');
// the localStorage copy is only an offline fallback. We deliberately do NOT
// merge seed data back in here — that would resurrect vendors/products the
// admin deleted in Supabase. We also prune cart entries that reference
// now-deleted products so the cart/checkout views never crash or show ₦NaN.
const data = () => {
  const cat = load('catalog_v3', clone(SEED_DATA));
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
      supabase.from('products').select('*')
    ]);
    if (vendorsRes.error) throw vendorsRes.error;
    if (productsRes.error) throw productsRes.error;
    // Map Supabase rows back to the frontend catalog shape. products.vendor_id
    // becomes the existing `vendor` field used throughout the UI. Optional
    // discovery fields (image / description / opening_hours) are carried
    // through when present; NULL simply means the UI falls back gracefully.
    const vendors = vendorsRes.data.map(v => ({
      id: v.id, name: v.name, icon: v.icon, type: v.type, rating: v.rating,
      time: v.time, cover: v.cover, open: v.open,
      is_restaurant: v.is_restaurant === true,
      image: v.image || '', description: v.description || '',
      opening_hours: v.opening_hours || ''
    }));
    const products = productsRes.data.map(p => ({
      id: p.id, vendor: p.vendor_id, name: p.name, desc: p.desc, price: p.price,
      icon: p.icon, category: p.category, image: p.image || '',
      active: p.active !== false
    }));
    state.catalog = { vendors, products };
    state.catalogLoadError = false;
    store('catalog_v3', state.catalog);
    render();
  } catch (err) {
    console.error('Supabase catalog load failed — using localStorage fallback:', err);
    state.catalogLoadError = true;
  }
}

function vendor(id) { return data().vendors.find(v => v.id === id); }
function product(id) { return data().products.find(p => p.id === Number(id)); }

// Customer-facing persistence. IMPORTANT: this must NOT write the catalog.
// The admin panel writes the same 'catalog_v3' key; if a customer action wrote a
// stale in-memory copy of the catalog here, it would silently revert the admin's
// changes — that was the root cause of the admin-to-main-site sync bug.
function save() { store('cart', state.cart); store('user', state.user); store('notifications', state.notifications); updateChrome(); }

// Active order-admission attempts are deliberately small, local-only retry
// records. They contain no payment secrets or authority fields.
const ORDER_ATTEMPT_STORAGE_KEY = 'order_admission_attempts';
const ORDER_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
let orderAttemptMemory = [];
function safeLoadOrderAttempts() {
  try { return load(ORDER_ATTEMPT_STORAGE_KEY, null); } catch (_) { return null; }
}
function safeStoreOrderAttempts(attempts) {
  try { store(ORDER_ATTEMPT_STORAGE_KEY, attempts); return true; } catch (_) { return false; }
}
function orderAttemptIntent(operation, lines, spot) {
  const items = (lines || []).map(line => ({
    id: String(line.id).trim(),
    qty: Number(line.qty)
  })).sort((a, b) => a.id.localeCompare(b.id) || a.qty - b.qty);
  return JSON.stringify({ operation, items, spot: String(spot ?? '').trim() });
}
function loadOrderAttempts() {
  const now = Date.now();
  const stored = safeLoadOrderAttempts();
  const attempts = Array.isArray(stored) ? stored : orderAttemptMemory;
  const active = Array.isArray(attempts)
    ? attempts.filter(a => a && typeof a.key === 'string' && typeof a.intent === 'string'
      && Number.isFinite(a.createdAt) && now - a.createdAt < ORDER_ATTEMPT_TTL_MS)
    : [];
  orderAttemptMemory = active;
  if (active.length !== attempts.length) safeStoreOrderAttempts(active);
  return active;
}
function getOrCreateOrderAttempt(operation, lines, spot, userId) {
  const intent = orderAttemptIntent(operation, lines, spot);
  const attempts = loadOrderAttempts();
  const namespace = String(userId || 'anonymous');
  const existing = attempts.find(a => a.user === namespace && a.operation === operation && a.intent === intent);
  if (existing) return existing;
  const attempt = { key: crypto.randomUUID(), user: namespace, operation, intent, createdAt: Date.now() };
  orderAttemptMemory = [...attempts, attempt];
  safeStoreOrderAttempts(orderAttemptMemory);
  return attempt;
}
function clearOrderAttempt(operation, lines, spot, key, userId) {
  const intent = orderAttemptIntent(operation, lines, spot);
  const namespace = String(userId || 'anonymous');
  const remaining = loadOrderAttempts().filter(a => !(a.user === namespace && a.operation === operation && a.intent === intent && (!key || a.key === key)));
  orderAttemptMemory = remaining;
  safeStoreOrderAttempts(remaining);
}

// Add a notification for the CURRENT user only. Persisted to Supabase when a
// session exists (RLS notifications_insert_own restricts user_id to
// auth.uid(), so a client can never create one for another user); the
// localStorage copy is the offline fallback. Cross-user notifications (e.g.
// vendor/rider alerts) are created server-side by the notifications trigger.
function addNotification(title, body) {
  const entry = { id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), title, body, time: 'Now', unread: true };
  state.notifications.unshift(entry);
  if (typeof supabase !== 'undefined' && supabase) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || !session.user) return;
      return supabase
        .from('notifications')
        .insert({ user_id: session.user.id, title, message: body, type: 'info', is_read: false })
        .select('id')
        .single()
        .then(({ data, error }) => {
          if (!error && data) { entry.id = data.id; save(); }
        });
    }).catch(() => {});
  }
  save();
}
function toast(message, kind = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  const text = document.createElement('span');
  text.className = 'toast__text';
  text.textContent = message;
  el.appendChild(text);
  if (kind === 'error') {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'toast__dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss message');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => el.remove());
    el.appendChild(dismiss);
  }
  $('#toastRoot').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 9000 : 3400);
}
function addCart(id) { const p = product(id); if (!p || p.active === false) { toast('That item is currently unavailable — please choose another.', 'error'); return; } const line = state.cart.find(x => x.id === p.id); if (line) line.qty++; else state.cart.push({ id: p.id, qty: 1 }); save(); toast(`${p.name} added to your cart`); }
function cartItems() { return state.cart.map(x => ({ ...product(x.id), qty: x.qty })); }
function cartTotal() { return cartItems().reduce((n, x) => n + x.price * x.qty, 0); }
function isVendorProduct(item) {
  const v = vendor(item.vendor);
  return Boolean(v && v.is_restaurant === false);
}

// ============================================
// Order number generation (ACTION 9)
// ============================================
// Previously orders used CR- + 4 random digits, which collided easily.
// Delivery fee: flat ₦1,500 campus delivery charge, kept strictly separate
// from the product subtotal everywhere it is used.
// Split: rider = ₦1,000, Dropzyy/company = ₦500.
const DELIVERY_FEE = 1500;
const RIDER_DELIVERY_SHARE = 1000;
const COMPANY_DELIVERY_SHARE = 500;

// Rider earnings for a single delivery (authoritative fixed share).
function riderShareAmount() {
  return RIDER_DELIVERY_SHARE;
}

// ============================================
// ABUAD hostels — single source of truth for the checkout
// "Delivery location" select. The chosen hostel is sent to the
// place_order RPC as part of the free-text `spot` field. The
// orders.spot column has no enum/CHECK restriction, so these values
// are stored exactly as listed here without any database change.
// ============================================
const HOSTELS = [
  { group: 'Female Hostels', items: [
    'Female Hall 1 — ABUAD Hostel',
    'Female Hall 2 — WEMA Hostel',
    'Female Hall 3 — NFH1 (New Female Hall 1)',
    'Female Hall 4 — NFH2 (New Female Hall 2)',
    'Female Hall 5',
    'Female Medical Hall 1 — FMH1',
    'Female Medical Hall 2 — FMH2',
    'Female Medical Hall 3 — FMH3',
    'Female Medical Hall 4 — FMH4',
  ] },
  { group: 'Other Hostels', items: [
    'AMSH',
    'Summer Hostel',
  ] },
  { group: 'Male Hostels', items: [
    'Male Hall 1 — Jamaica',
    'Male Hall 2 — Kuvuki',
    'Male Hall 3 — Freshers Male Hostel',
    'Male Hall 4',
    'Male Hall 5',
    'Male Hall 7',
    'Male Medical Hall 1 — MMH1',
    'Male Medical Hall 2 — MMH2',
    'Male Medical Hall 3 — MMH3',
  ] },
];

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
    state.rider = data || null;
    save();
    // Authoritative pending earnings from the settlement model (B5 cutover):
    // get_rider_earnings() sums delivery_settlements.rider_amount for the
    // rider's pending rows and ownership-checks rider_id against auth.uid().
    // Falls back to the per-delivery estimate below when the RPC is
    // unavailable or the rider has no row yet.
    if (state.rider) {
      const { data: earnings, error: earningsError } = await supabase.rpc('get_rider_earnings', { p_rider_id: state.rider.id });
      if (!earningsError && earnings && earnings.pending_earnings != null) {
        state.riderEarnings = Math.max(0, Number(earnings.pending_earnings));
      }
    }
    const { data: ratings, error: ratingsError } = await supabase
      .from('rider_ratings')
      .select('*')
      .eq('reviewer_id', session.user.id);
    // A7 cleanup: state.riderRatings was write-only (never read anywhere), so its
    // assignment was removed. The fetch above is intentionally left untouched
    // (Supabase queries are out of scope for this hygiene task).
    if (!ratingsError && ratings) {
      save();
    }
  } catch (err) {
    console.error('Failed to load rider status:', err);
    state.riderLoadError = true;
  } finally {
    state.riderLoaded = true;
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
    const full_name = (formData.get('full_name') || '').trim();
    const matricNumber = (formData.get('studentId') || formData.get('matric') || '').trim();
    const college = (formData.get('college') || '').trim();
    const department = (formData.get('department') || '').trim();
    const email = (formData.get('email') || '').trim();
    const phone = (formData.get('phone') || '').trim();
    if (!full_name || !matricNumber || !college || !department || !email || !phone) { toast('Please fill in all required fields', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Please enter a valid email address', 'error'); return; }
    const { data, error } = await supabase
      .from('riders')
      .insert({
        user_id: session.user.id,
        full_name: full_name,
        matric_number: matricNumber,
        college: college,
        department: department,
        email: email,
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

// ============================================
// Rider earnings & withdrawal requests (ACTION 10, B5 cutover)
// ============================================
// Earnings are NEVER client-supplied. They are always DERIVED from the
// authoritative fixed rider delivery share (B5: rider = ₦1,000 per delivery,
// Dropzyy = ₦500) on the rider's completed (Delivered) deliveries.
// The rider share is computed by riderShareAmount() — exactly the same value
// the server-side settlement RPC stores in delivery_settlements.rider_amount —
// so the figure always matches what backs real payouts.
// Because no settlement/payout has occurred, every figure is clearly
// labelled as an ESTIMATE and PENDING.
// A delivery is COMPLETE once it is Delivered OR Rated. Rating happens after
// hand-off, so restricting this set to 'Delivered' alone made a rated delivery
// disappear from the rider's Delivery history the moment the customer rated it.
function riderCompletedDeliveries() {
  return (state.riderPool || []).filter(o =>
    (o.status === 'Delivered' || o.status === 'Rated') && (o.delivery_method || 'rider') !== 'vendor_self'
  );
}
// Estimated pending earnings = sum of the authoritative fixed rider delivery
// share on completed deliveries; when the settlement RPC has already
// returned the authoritative pending_earnings (B5 cutover), that value wins.
function riderPendingEarnings() {
  if (state.riderEarnings != null) return state.riderEarnings;
  return riderCompletedDeliveries().reduce((n, o) => n + riderShareAmount(), 0);
}
// Sum of withdrawal requests still awaiting admin review (status 'pending'),
// so the rider sees how much of their estimate is already requested.
function riderPendingRequestsTotal() {
  return (state.withdrawals || [])
    .filter(w => w.status === 'pending')
    .reduce((n, w) => n + Number(w.amount || 0), 0);
}

// Load the authenticated rider's own withdrawal requests from Supabase.
// RLS (withdrawal_requests_select_own) restricts rows to the caller's own
// rider_id, so only the rider's own requests are ever returned.
async function loadWithdrawalsFromSupabase() {
  if (typeof supabase === 'undefined' || !supabase) {
    state.withdrawalsLoaded = true;
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { state.withdrawalsLoaded = true; return false; }
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .order('requested_at', { ascending: false });
    if (error) throw error;
    state.withdrawals = (data || []).map(w => ({
      id: w.id,
      rider_id: w.rider_id,
      amount: Number(w.amount || 0),
      status: w.status || 'pending',
      requested_at: w.requested_at || null,
      reviewed_at: w.reviewed_at || null,
      admin_note: w.admin_note || ''
    }));
    state.withdrawalsLoaded = true;
    state.withdrawalsError = null;
    save();
    return true;
  } catch (err) {
    console.error('Failed to load withdrawal requests:', err);
    state.withdrawalsLoaded = true;
    state.withdrawalsError = true;
    return false;
  }
}

// Request a withdrawal of `amount` from the rider's PENDING (estimated)
// earnings. This only CREATES a pending/admin-reviewed record — no money
// moves. The server-side INSERT policy requires the caller to be an approved
// rider and the row to be born status = 'pending', so a rider can never forge
// an approved/paid row or an arbitrary rider_id.
async function requestWithdrawal(amount) {
  if (!state.user) { toast('Please sign in to request a withdrawal', 'info'); return false; }
  if (!state.rider || state.rider.status !== 'approved') { toast('Only approved riders can request withdrawals', 'error'); return false; }
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — request could not be saved', 'error'); return false; }
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) { toast('Enter a valid amount greater than ₦0', 'error'); return false; }
  const available = Math.max(0, riderPendingEarnings() - riderPendingRequestsTotal());
  if (value > available) { toast(`Amount exceeds your available estimated earnings of ${money(available)}`, 'error'); return false; }

  state.withdrawalSubmitting = true;
  render();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Please sign in', 'info'); state.withdrawalSubmitting = false; render(); return false; }
    // H-1: the security boundary for withdrawal requests is the server-side
    // request_withdrawal RPC (SECURITY DEFINER). It re-validates rider
    // ownership, eligibility, amount and the authoritative available balance
    // (delivery settlements minus outstanding requests). The client pre-check
    // above is a UX hint only — direct table INSERT is revoked client-side.
    const { error } = await supabase.rpc('request_withdrawal', { p_amount: value });
    if (error) throw error;
    state.withdrawalSubmitting = false;
    await loadWithdrawalsFromSupabase();
    toast('Withdrawal request submitted for admin review', 'success');
    render();
    return true;
  } catch (err) {
    console.error('Withdrawal request failed:', err);
    state.withdrawalSubmitting = false;
    toast('Withdrawal request failed: ' + (err.message || 'unknown error'), 'error');
    render();
    return false;
  }
}

// Handler for the track-page rating form: validates the star selection, then
// delegates to submitRiderRating (which re-validates ownership/Delivered rider
// through RLS), and finally transitions the order to 'Rated' using the
// existing orders_update_own_rating workflow (WithCheck: user_id = auth.uid(),
// status = 'Rated'). The UNIQUE(order_id, reviewer_id) constraint and the
// state.ratingCompleteOrder flag both block duplicate submissions.
async function submitRiderRatingForm(form) {
  const f = new FormData(form);
  const orderId = f.get('orderId');
  const riderId = f.get('riderId');
  const review = (f.get('review') || '').trim();
  const activeStar = form.querySelector('.stars--input button.is-on');
  if (!orderId || !riderId) { toast('Could not submit rating — missing order details', 'error'); return; }
  const rating = activeStar ? Number(activeStar.dataset.rating) : 0;
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) { toast('Please select a star rating (1–5)', 'error'); return; }
  const submitted = await submitRiderRating(orderId, riderId, rating, review);
  if (!submitted) return;
  // Mark as rated locally, then persist the Delivered → Rated transition via
  // the permitted RLS path. On failure keep the order Delivered and show the
  // form again so the user can retry.
  const order = state.orders.find(x => x.dbId === orderId);
  const prevStatus = order ? order.status : null;
  if (order) order.status = 'Rated';
  state.ratingCompleteOrder = orderId;
  save();
  if (typeof supabase !== 'undefined' && supabase) {
    try {
      const { error } = await supabase.from('orders').update({ status: 'Rated' }).eq('id', orderId);
      if (error) throw error;
    } catch (err) {
      console.error('Order mark-as-Rated failed:', err);
      if (order) order.status = prevStatus;
      if (state.ratingCompleteOrder === orderId) delete state.ratingCompleteOrder;
      save();
      toast('Rating saved, but marking the order as rated failed', 'error');
      return;
    }
  }
  render();
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
// used by the existing order UI. Missing/invalid timestamps never claim
// "Just now" — they fall back to a neutral placeholder (F16).
const ORDER_TIME_UNKNOWN = 'Unknown';
function formatOrderCreated(createdAt) {
  if (!createdAt) return ORDER_TIME_UNKNOWN;
  const date = new Date(createdAt);
  if (isNaN(date.getTime())) return ORDER_TIME_UNKNOWN;
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

// Full absolute timestamp for the order details view (ACTION 9).
function formatFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Load the authenticated user's orders from Supabase (orders + order_items)
// and map them into the existing frontend order shape. Supabase is the
// Sort orders newest-first by the authoritative created_at timestamp so the
// My Orders list is correct on every load/render regardless of order status,
// vendor, delivery method, amount or insertion order.
function sortOrdersNewestFirst(arr) {
  return [...arr].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

// source of truth for order data (Rider Hub included); there is no restore
// from localStorage for order history or the rider pool.
async function loadOrdersFromSupabase() {
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('Supabase client is missing — using localStorage orders fallback');
    state.ordersLoadError = true;
    state.ordersLoadedFromSupabase = true;
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      // No authenticated session — clear any cached orders. LocalStorage orders
      // are shared per-browser, so without an authenticated user we cannot know
      // whose orders they are; keeping them would leak the previous user's
      // order history. They are reloaded from Supabase on the next sign-in.

      state.orders = [];
      state.ordersLoadedFromSupabase = true;
      return false;
    }
    const userId = session.user.id;

    // Per-user Rider Hub pool: rebuilt from Supabase below. Never reuse a stale
    // cached/previously-logged-in-user pool — this also guarantees that an error
    // mid-load cannot leave another user's (or a stale) pool visible..
    state.riderPool = [];

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

        // 4. Map Supabase orders into the existing frontend order shape.
    //    rider_id / rider_name / rider_phone are resolved below so the tracking
    //    page can show the actual assigned rider (name + phone during an active
    //    delivery) instead of a hardcoded name.
    const mapOrder = (o, itemsMap, riderNames, riderPhones) => ({
      id: o.order_number,
      dbId: o.id,
      items: (itemsMap && itemsMap[o.id]) || [],
      total: o.total,
      subtotal: o.subtotal != null ? o.subtotal : (o.total - (o.fee != null ? o.fee : DELIVERY_FEE)),
      fee: o.fee != null ? o.fee : DELIVERY_FEE,
      status: o.status || 'Order confirmed',
      payment_status: o.payment_status || 'pending',
      request_type: o.request_type || 'restaurant',
      vendor_delivery_requested: o.vendor_delivery_requested === true,
      delivery_payment_status: o.delivery_payment_status || 'pending',
      delivery_payment_id: o.delivery_payment_id || null,
      rider_delivery_share: o.rider_delivery_share != null ? o.rider_delivery_share : 0,
      company_delivery_share: o.company_delivery_share != null ? o.company_delivery_share : 0,
      payment_reference: o.payment_reference || null,
      transaction_id: o.transaction_id || null,
      spot: o.spot || '',
      delivery_method: o.delivery_method || 'rider',
      rider_id: o.rider_id || null,
      rider_name: (o.rider_id && riderNames && riderNames[o.rider_id]) || null,
      rider_phone: (o.rider_id && riderPhones && riderPhones[o.rider_id]) || null,
      created: formatOrderCreated(o.created_at),
      createdAt: o.created_at || null
    });

        // Resolve rider details (name + phone) for orders that already have an
    // assigned rider. The customer may read the assigned rider's row — including
    // `phone` — via the existing riders_select_order_assigned policy, so phone is
    // "existing profile data where permitted". Only the name is shown on the
    // orders list; the phone is shown on the Track page for an active delivery
    // (see track()) so a customer can contact the rider who is on the way.
    const riderIds = [...new Set((ordersData || []).map(o => o.rider_id).filter(Boolean))];
    const riderNames = {};
    const riderPhones = {};
    if (riderIds.length) {
      const { data: riderRows } = await supabase
        .from('riders')
        .select('id, user_id, phone')
        .in('id', riderIds);
      if (riderRows && riderRows.length) {
        const riderUserIds = [...new Set(riderRows.map(r => r.user_id).filter(Boolean))];
        if (riderUserIds.length) {
          const { data: riderProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', riderUserIds);
          const nameByUser = {};
          (riderProfiles || []).forEach(p => { nameByUser[p.id] = p.full_name; });
          riderRows.forEach(r => {
            riderNames[r.id] = nameByUser[r.user_id] || null;
            // Only expose the rider's phone — never a customer's phone to a rider.
            riderPhones[r.id] = r.phone || null;
          });
        }
      }
    }

        const supabaseOrders = (ordersData || []).map(o => mapOrder(o, itemsByOrder, riderNames, riderPhones));

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
          .eq('delivery_method', 'rider')
          .eq('payment_status', 'success'),
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

        poolRows.forEach(o => poolOrders.push(mapOrder(o, poolItemsByOrder, riderNames)));
      }
    }
    state.riderPool = poolOrders;

    // 5. Replace local orders entirely with the Supabase result, sorted
    //    newest-first by created_at. Supabase queries here are
    //    scoped to the authenticated user (user_id = session.user.id), so this is the
    //    authoritative per-user order set. We do NOT merge with stale localStorage orders —
    //    that merge was the root cause of one user's orders leaking into another user's view
    //    after logout/login. Orders placed earlier in this session were persisted via the
    //    place_order RPC and are included in this Supabase result.
    state.orders = sortOrdersNewestFirst(supabaseOrders);

    state.ordersLoadedFromSupabase = true;
    return true;
  } catch (err) {
    console.error('Supabase orders load failed — using localStorage fallback:', err);
    state.ordersLoadError = true;
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

// ============================================
// Refunds from Supabase (customer-facing)
// ============================================
// Refunds are loaded per-user from Supabase. RLS (customers_read_own_refunds)
// restricts rows to the caller's own orders only.
async function loadRefundsFromSupabase() {
  if (typeof supabase === 'undefined' || !supabase) {
    state.refundsLoaded = true;
    return false;
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      state.refunds = [];
      state.refundsLoaded = true;
      return false;
    }
    const { data, error } = await supabase
      .from('refunds')
      .select('id, order_id, amount, status, reason, gateway_refund_id, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    state.refunds = data || [];
    state.refundsLoaded = true;
    return true;
  } catch (err) {
    console.error('Supabase refunds load failed:', err);
    state.refunds = [];
    state.refundsLoaded = true;
    return false;
  }
}

// Look up the latest refund for a given order.
function getOrderRefund(orderDbId) {
  if (!orderDbId || !state.refunds.length) return null;
  return state.refunds.find(r => r.order_id === orderDbId) || null;
}

// Customer-friendly refund status label.
function refundStatusLabel(status) {
  const labels = {
    requested: 'Refund requested',
    approved: 'Refund approved',
    processed: 'Refund processed',
    failed: 'Refund failed',
    rejected: 'Refund rejected',
    pending: 'Refund pending'
  };
  return labels[status] || 'Refund status unknown';
}

// Submit a refund request for an order.
// Calls the server-side request_refund RPC (ownership + eligibility validated
// server-side). Sends ONLY the order ID and reason — never an amount or
// payment reference. Returns true on a newly created request, 'existing' when
// a refund already exists for the order, false on failure. Does not re-render;
// the caller decides (the dedicated Refund Request page owns navigation).
async function requestRefund(orderDbId, reason, paymentType) {
  if (!state.user) {
    toast('Please sign in to request a refund', 'info');
    location.hash = '#/login';
    return false;
  }
  if (typeof supabase === 'undefined' || !supabase) {
    toast('Supabase unavailable — could not submit refund request', 'error');
    return false;
  }
  try {
    const rpcParams = paymentType
      ? { p_order_id: orderDbId, p_payment_type: paymentType, p_reason: (reason || '').trim() || null }
      : { p_order_id: orderDbId, p_reason: (reason || '').trim() || null };
    const { data, error } = await supabase.rpc('request_refund', rpcParams);
    if (error) {
      // Handle specific RPC errors
      if (error.message && error.message.includes('does not belong to you')) {
        toast('This order does not belong to you', 'error');
      } else if (error.message && (error.message.includes('no successful payment') || error.message.includes('not refundable'))) {
        toast('This order is not eligible for a refund', 'error');
      } else if (error.message && error.message.includes('not found')) {
        toast('Order not found', 'error');
      } else {
        console.error('Refund request failed:', error);
        toast('Refund request failed: ' + (error.message || 'Unknown error'), 'error');
      }
      return false;
    }
    // Success — data contains { refund_id, payment_id, order_id, amount, status, already_existed }
    // Note: The server-side trigger (trg_refund_status_notify) creates the notification
    // authoritatively when the refund row is inserted. We deliberately do NOT call
    // addNotification() here to avoid duplicate notifications.
    await loadRefundsFromSupabase();
    if (data && data.already_existed) {
      toast('A refund request already exists for this order', 'info');
      return 'existing';
    }
    toast('Refund request submitted successfully', 'success');
    return true;
  } catch (err) {
    console.error('Refund request error:', err);
    toast('Refund request failed — please try again', 'error');
    return false;
  }
}
// ============================================
// Dedicated full-page Refund Request view
// ============================================
// Route: #/refund/<order dbId>. Opened from BOTH My Orders and Order Details
// via the shared [data-refund-request] handler, which navigates here instead
// of opening the old popup modal (removed). Uses only existing Dropzyy
// layout/CSS classes (.section/.container/.card/.split/.field/.textarea/...).
const REFUND_REASON_MIN = 10;
const REFUND_REASON_MAX = 500;

async function refundRequestView(orderDbId) {
  if (!state.user) { location.hash = '#/login'; return ''; }
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>Request a Refund</h1><p class="muted">Loading your order…</p></div></div><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
  }
  await ensureOrdersLoaded();
  await loadRefundsFromSupabase();
  const o = state.orders.find(x => x.dbId === orderDbId);
  if (!o) return notFound();
  const items = o.items || [];
  const vnames = orderVendorNames(o);
  const placedAt = o.createdAt ? formatFullDate(o.createdAt) : (o.created || '—');
  const fee = o.fee != null ? o.fee : DELIVERY_FEE;
  const total = o.total != null ? o.total : (o.subtotal != null ? o.subtotal + fee : null);
  const itemLines = items.length ? items.map(it => {
    const p = product(it.id);
    const name = p ? p.name : (it.name || `Item #${it.id}`);
    return `<li>${esc(name)} <span class="muted">× ${it.qty || 0}</span></li>`;
  }).join('') : '<li class="muted">No items recorded for this order.</li>';
  const successNotice = state.refundSuccessNotice === orderDbId
    ? `<div class="card mt-2" style="border-left:4px solid #16a34a"><h3 class="mb-0">✅ Refund request submitted</h3><p class="muted small mb-0">Your refund request has been sent to our team for review. You'll get a notification as soon as its status changes.</p></div>`
    : '';
  // Existing refund for this order → show its status; never allow another request.
  const existingRefund = getOrderRefund(o.dbId);
  if (existingRefund) {
    return `<section class="section container"><a href="#/orders" class="muted small">← Back to My Orders</a><div class="page-head mt-1"><div><h1>Request a Refund</h1></div></div>${successNotice}<div class="card mt-2"><div class="card__head"><h3 class="mb-0">Refund status</h3><span class="badge ${refundStatusBadgeClass(existingRefund.status)}">${esc(refundStatusLabel(existingRefund.status))}</span></div><p class="muted small mb-0">A refund request already exists for this order, so another request can't be submitted.</p><p class="muted small mt-1 mb-0">Amount: <b>${money(existingRefund.amount)}</b></p>${existingRefund.reason ? `<p class="muted small mt-1 mb-0">Reason: ${esc(existingRefund.reason)}</p>` : ''}${existingRefund.gateway_refund_id ? `<p class="muted xs mt-1 mb-0">Reference: ${esc(existingRefund.gateway_refund_id)}</p>` : ''}<p class="muted xs mt-1 mb-0">Requested: ${esc(formatFullDate(existingRefund.created_at))}</p><div class="divider"></div><a class="btn btn--ghost btn--block" href="#/order/${esc(o.id)}">View order</a></div></section>`;
  }
  const refundablePaymentTypes = [
    o.payment_status === 'success' ? 'product' : null,
    o.delivery_payment_status === 'success' ? 'vendor_delivery' : null
  ].filter(Boolean);
  // Backend remains authoritative: without a successful payment the
  // request_refund RPC would reject the request, so don't offer the form.
  if (!refundablePaymentTypes.length) {
    return `<section class="section container"><a href="#/orders" class="muted small">← Back to My Orders</a><div class="page-head mt-1"><div><h1>Request a Refund</h1></div></div><div class="card mt-2"><h3 class="mb-0">This order isn't eligible for a refund</h3><p class="muted small mb-0">Refunds can only be requested for orders whose payment was successful. The payment for this order is currently <b>${esc(o.payment_status || 'pending')}</b>.</p><div class="divider"></div><a class="btn btn--ghost btn--block" href="#/order/${esc(o.id)}">View order</a></div></section>`;
  }
  const paymentTypeField = refundablePaymentTypes.length > 1
    ? `<div class="field"><label for="refundPaymentType">Which payment would you like refunded?</label><select class="input" id="refundPaymentType" name="paymentType"><option value="product">Product payment</option><option value="vendor_delivery">Delivery payment</option></select></div>`
    : (refundablePaymentTypes[0] === 'vendor_delivery' ? '<input type="hidden" name="paymentType" value="vendor_delivery">' : '');
  return `<section class="section container"><a href="#/orders" class="muted small">← Back to My Orders</a><div class="page-head mt-1"><div><h1>Request a Refund</h1><p class="muted">Tell us what went wrong with this order and our team will review your request. Refunds are issued to your original payment method and the amount is determined by our system — you'll get a notification when the status changes.</p></div></div>${successNotice}<div class="split mt-2"><div class="card stack">
    <form id="refundRequestForm" class="stack" novalidate>
      <input type="hidden" name="orderDbId" value="${esc(orderDbId)}">
      ${paymentTypeField}
      <div class="field"><label for="refundReasonInput">What went wrong with this order?</label><textarea class="textarea" id="refundReasonInput" name="reason" rows="6" maxlength="${REFUND_REASON_MAX}" placeholder="Please explain the issue with your order..."></textarea><div class="row row--between mt-1"><span class="muted xs" id="refundReasonError"></span><span class="muted xs" id="refundReasonCount">0 / ${REFUND_REASON_MAX}</span></div></div>
      <p class="muted xs mb-0">By submitting, you request a full refund for this order. The refund amount is determined by our system from the order's payment.</p>
      <button type="submit" class="btn btn--block" id="refundSubmitBtn">Submit Refund Request</button>
      <a class="btn btn--ghost btn--block" href="#/orders">Cancel</a>
    </form>
  </div>
  <aside class="card sticky-side stack">
    <h3 class="mb-0">Order information</h3>
    <div><span class="muted small">Order reference</span><div><b>Order #${esc(o.id)}</b></div></div>
    <div><span class="muted small">Date</span><div><b>${esc(placedAt)}</b></div></div>
    <div><span class="muted small">Items</span><ul class="muted small" style="padding-left:18px">${itemLines}</ul></div>
    <div><span class="muted small">Vendor${items.length > 1 ? 's' : ''}</span><div><b>${esc(vnames)}</b></div></div>
    <div><span class="muted small">Amount paid</span><div><b>${total != null ? money(total) : '—'}</b></div></div>
    <div><span class="muted small">Payment status</span><div><span class="badge badge--success">${esc(o.payment_status)}</span></div></div>
    <div class="divider"></div>
    <a class="btn btn--ghost btn--block" href="#/order/${esc(o.id)}">View full order</a>
  </aside></div></section>`;
}
// Refund status badge CSS class.
function refundStatusBadgeClass(status) {
  const classes = {
    requested: 'badge--info',
    approved: 'badge--brand',
    processed: 'badge--success',
    failed: 'badge--danger',
    rejected: 'badge--danger',
    pending: 'badge--info'
  };
  return classes[status] || 'badge--info';
}
// ============================================
// Issue reports (customer → admin support intake)
// ============================================
// Routes: #/report (Report an Issue) and #/vendor/apply (vendor
// interest — same form, mode 'vendor'). Both write to the Supabase
// `issue_reports` table; RLS hard-guarantees user_id = auth.uid() and
// denies users any read/update access beyond their own rows.
const REPORT_SUBJECTS = ['Order problem', 'Payment problem', 'Delivery / Rider problem', 'Vendor problem', 'App problem', 'Account problem', 'Become a vendor', 'Other'];
const REPORT_DESC_MIN = 10;
const REPORT_DESC_MAX = 1000;

async function reportView(mode = '') {
  if (!state.user) { toast('Please sign in to continue', 'info'); location.hash = '#/login'; return ''; }
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>${mode === 'vendor' ? 'Become a Vendor' : 'Report an Issue'}</h1><p class="muted">Loading…</p></div></div><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
  }
  await ensureOrdersLoaded();
  const isVendor = mode === 'vendor';
  const title = isVendor ? 'Become a Vendor' : 'Report an Issue';
  const intro = isVendor
    ? 'Interested in selling on Dropzyy? Tell us a little about yourself and your offer — the team reviews every application and reaches out once it is approved.'
    : 'Something went wrong? Tell us what happened and our team will look into it. Reports go straight to the Dropzyy Admin Panel.';
  const success = state.reportSuccess
    ? `<div class="card mt-2" style="border-left:4px solid #16a34a"><h3 class="mb-0">✅ ${state.reportSuccess === 'vendor' ? 'Application submitted' : 'Report submitted successfully'}</h3><p class="muted small mb-0">${state.reportSuccess === 'vendor' ? 'Application submitted successfully. The Dropzyy team will review it shortly.' : 'Report submitted successfully. Our team will review it shortly.'}</p><a class="btn btn--ghost btn--sm mt-2" href="${isVendor ? '#/vendor/apply' : '#/report'}">Submit another</a></div>`
    : '';
  // Optional "which order" dropdown — only the user's own Supabase-backed
  // orders are offered (order_id is server-validated to belong to them).
  const ownOrders = sortOrdersNewestFirst(state.orders || []).filter(o => o.dbId);
  const orderField = isVendor || !ownOrders.length
    ? ''
    : `<div class="field"><label for="reportOrder">Related order (optional)</label>
        <select class="select" id="reportOrder" name="order">
          <option value="">No specific order</option>
          ${ownOrders.map(o => `<option value="${esc(o.dbId)}">Order #${esc(o.id)}${o.payment_status === 'success' ? ' · paid' : ''}</option>`).join('')}
        </select></div>`;
  const subjectField = isVendor
    ? `<input type="hidden" name="subject" value="Become a vendor">
       <div class="field"><label>Subject</label><input class="input" value="Become a vendor" aria-label="Subject" disabled></div>`
    : `<div class="field"><label for="reportSubject">Issue subject</label>
        <select class="select" id="reportSubject" name="subject" required>
          <option value="" disabled selected>Select a subject…</option>
          ${REPORT_SUBJECTS.filter(s => s !== 'Become a vendor').map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select></div>`;
  return `<section class="section container">
    <a href="#/" class="muted small">← Back to home</a>
    <div class="page-head mt-1"><div><h1>${esc(title)}</h1><p class="muted">${esc(intro)}</p></div></div>
    ${success}
    <div class="split mt-1">
      <div class="card stack">
        <form id="reportForm" class="stack" novalidate>
          <input type="hidden" name="mode" value="${esc(mode)}">
          ${subjectField}
          <div class="field">
            <label for="reportDescription">${isVendor ? 'About you / your offer' : 'Description'}</label>
            <textarea class="textarea" id="reportDescription" name="description" rows="6" minlength="${REPORT_DESC_MIN}" maxlength="${REPORT_DESC_MAX}" required placeholder="${isVendor ? 'Tell us about yourself and what you would like to offer on Dropzyy...' : 'Please describe the issue — what happened, and any steps we can reproduce.'}"></textarea>
            <div class="row row--between mt-1"><span class="muted xs" id="reportDescError" role="status"></span><span class="muted xs" id="reportDescCount">0 / ${REPORT_DESC_MAX}</span></div>
          </div>
          ${orderField}
          <button type="submit" class="btn btn--block" id="reportSubmitBtn">${isVendor ? 'Submit Vendor Application' : 'Submit Report'}</button>
          <a class="btn btn--ghost btn--block" href="#/">Cancel</a>
        </form>
      </div>
      <aside class="card sticky-side stack">
        <h3 class="mb-0">${isVendor ? 'Application details' : 'Reporting as'}</h3>
        <div><span class="muted small">Name</span><div><b>${esc(state.user.name || '—')}</b></div></div>
        <div><span class="muted small">Email</span><div><b>${esc(state.user.email || '—')}</b></div></div>
        <div class="divider"></div>
        <p class="muted xs mb-0">${isVendor ? 'Your application is submitted to the Dropzyy team for review. Keep an eye on your inbox.' : 'Your report is attached to your Dropzyy account automatically — no need to enter anything we already know.'}</p>
      </aside>
    </div>
  </section>`;
}
// Submit an issue report (or vendor application). Client sends ONLY the
// subject/category, description and an optional order id — the user_id is
// fetched from the authenticated session (never typed in), and the server
// enforces ownership via the issue_reports_insert_own RLS policy.
async function submitIssueReport(formData) {
  if (state.reportSubmitting) return;
  const mode = (formData.get('mode') || '').trim() === 'vendor' ? 'vendor' : '';
  const isVendor = mode === 'vendor';
  const subject = (formData.get('subject') || '').trim();
  const description = (formData.get('description') || '').trim();
  const orderDbId = (formData.get('order') || '').trim() || null;
  const errEl = document.getElementById('reportDescError');
  const submitBtn = document.getElementById('reportSubmitBtn');
  const fail = (msg) => { if (errEl) errEl.textContent = msg; toast(msg, 'error'); };
  if (!subject) { fail('Please choose a subject for your report'); return; }
  if (description.length < REPORT_DESC_MIN) { fail(`Please describe the ${isVendor ? 'application' : 'issue'} — at least ${REPORT_DESC_MIN} characters.`); return; }
  if (!state.user) { toast('Please sign in to continue', 'info'); location.hash = '#/login'; return; }
  if (typeof supabase === 'undefined' || !supabase) { fail('Supabase unavailable — this could not be saved'); return; }
  state.reportSubmitting = true;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
  try {
    const userId = await getSupabaseUserId();
    if (!userId) { fail('Sign in required to submit'); location.hash = '#/login'; return; }
    const payload = { user_id: userId, subject, description };
    if (orderDbId) payload.order_id = orderDbId;
    const { data, error } = await supabase.from('issue_reports').insert(payload).select().single();
    if (error) throw error;
    state.reportSuccess = isVendor ? 'vendor' : 'report';
    toast(isVendor ? 'Application submitted successfully. The Dropzyy team will review it shortly.' : 'Report submitted successfully. Our team will review it shortly.');
    render();
  } catch (err) {
    console.error('Issue report submit failed:', err);
    fail('Could not submit: ' + ((err && err.message) || 'please try again'));
  } finally {
    state.reportSubmitting = false;
    if (submitBtn && document.body.contains(submitBtn)) {
      submitBtn.disabled = false;
      submitBtn.textContent = isVendor ? 'Submit Vendor Application' : 'Submit Report';
    }
  }
}
// ============================================
// Vendor Applications (#/vendor/apply → vendor_applications table)
// ============================================
// A structured intake separate from customer issue reports. Posts to the
// `vendor_applications` table so the Admin Panel can review/approve/reject
// applications and activate the vendor relationship via the existing
// assign_user_to_vendor RPC (approval creates the storefront + links the
// user's profiles.vendor_id server-side). RLS guarantees the applicant only
// ever inserts/reads their OWN row (user_id = auth.uid()).
async function vendorApplyView() {
  if (!state.user) { toast('Please sign in to continue', 'info'); location.hash = '#/login'; return ''; }
  const userId = await getSupabaseUserId();
  if (!userId) { toast('Please sign in to continue', 'info'); location.hash = '#/login'; return ''; }

  let existing = null;
  if (typeof supabase !== 'undefined' && supabase) {
    try {
      const { data, error } = await supabase
        .from('vendor_applications')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error && data) existing = data;
    } catch (err) {
      console.error('Vendor application load failed:', err);
    }
  }

  const back = '<a href="#/" class="muted small">← Back to home</a>';
  const successBanner = state.reportSuccess === 'vendor'
    ? `<div class="card mt-2" style="border-left:4px solid #16a34a"><h3 class="mb-0">✅ Application submitted</h3><p class="muted small mb-0">Application submitted successfully. The Dropzyy team will review it shortly.</p></div>`
    : '';

  // Already applied: show the applicant their own status (no resubmission).
  if (existing) {
    const st = existing.status || 'Pending';
    const icon = st === 'Approved' ? '🎉' : st === 'Rejected' ? 'ℹ️' : '⏳';
    const msg = st === 'Approved'
      ? 'Your vendor account is approved! Head to the Vendor dashboard to manage your storefront and products.'
      : st === 'Rejected'
        ? 'Your application was not approved at this time. You can reach out through the Report an Issue card if you have questions.'
        : 'Our team is reviewing your application. You will be able to manage your storefront once it is approved.';
    const formatted = existing.created_at ? new Date(existing.created_at).toLocaleDateString('en-NG') : '';
    return `<section class="section container">${back}
      <div class="page-head mt-1"><div><h1>Become a Vendor</h1><p class="muted">Your application status</p></div></div>
      ${successBanner}
      <div class="card stack">
        <span style="font-size:2.5rem">${icon}</span>
        <h3 class="mb-0">Application ${esc(st)}</h3>
        <p class="muted mb-0">${msg}</p>
        ${formatted ? `<p class="muted xs mb-0">Submitted ${esc(formatted)}</p>` : ''}
        ${existing.admin_response ? `<div class="divider"></div><div><span class="muted small">Admin response</span><div><b>${esc(existing.admin_response)}</b></div></div>` : ''}
        <div class="divider"></div>
        <div class="row row--wrap" style="gap:8px">
          ${st === 'Approved' ? '<a class="btn" href="#/vendor">Open Vendor Dashboard</a>' : ''}
          <a class="btn btn--ghost" href="#/">Back to home</a>
        </div>
      </div></section>`;
  }
return `<section class="section container">${back}
    <div class="page-head mt-1"><div><h1>Become a Vendor</h1><p class="muted">Tell us about yourself and what you want to sell — the Dropzyy team reviews every application and activates your storefront once approved.</p></div></div>
    ${successBanner}
    <div class="split mt-1">
      <div class="card stack">
        <form id="vendorApplyForm" class="stack" novalidate>
          <div class="form-grid">
            <div class="field"><label for="vaFullName">Full name</label><input class="input" id="vaFullName" name="full_name" required maxlength="120" value="${esc(state.user.name || '')}" autocomplete="name"></div>
            <div class="field"><label for="vaMatric">Matric number</label><input class="input" id="vaMatric" name="matric_number" required maxlength="40" placeholder="e.g. 23/1234" autocomplete="off"></div>
            <div class="field"><label for="vaCollege">College</label><input class="input" id="vaCollege" name="college" required maxlength="120" placeholder="e.g. College of Sciences"></div>
            <div class="field"><label for="vaDept">Department</label><input class="input" id="vaDept" name="department" required maxlength="120" placeholder="e.g. Computer Science"></div>
            <div class="field"><label for="vaEmail">Email</label><input class="input" id="vaEmail" name="email" type="email" required maxlength="120" value="${esc(state.user.email || '')}" autocomplete="email"></div>
            <div class="field"><label for="vaPhone">Phone number</label><input class="input" id="vaPhone" name="phone" required maxlength="20" placeholder="080... " autocomplete="tel"></div>
          </div>
          <div class="field"><label for="vaOffer">What do you want to sell?</label><textarea class="textarea" id="vaOffer" name="what_they_want_to_sell" rows="3" required maxlength="1000" placeholder="Describe the products/services you intend to offer on Dropzyy…"></textarea></div>
          <div class="field"><label for="vaPrice">Expected price range</label><input class="input" id="vaPrice" name="expected_price_range" required maxlength="120" placeholder="e.g. ₦500 – ₦3,000"></div>
          <div class="field"><label for="vaExtra">Additional information (optional)</label><textarea class="textarea" id="vaExtra" name="additional_info" rows="3" maxlength="1000" placeholder="Anything else the team should know…"></textarea><div class="row row--between mt-1"><span class="muted xs" id="vaError" role="status"></span></div></div>
          <button type="submit" class="btn btn--block" id="vaSubmitBtn">Submit Vendor Application</button>
          <a class="btn btn--ghost btn--block" href="#/">Cancel</a>
        </form>
      </div>
      <aside class="card sticky-side stack">
        <h3 class="mb-0">Application details</h3>
        <div><span class="muted small">Signed in as</span><div><b>${esc(state.user.email || '—')}</b></div></div>
        <div class="divider"></div>
        <p class="muted xs mb-0">We attach your application to your Dropzyy account automatically — no need to enter anything we already know. On approval the Admin Panel activates your storefront and you can manage it from the Vendor dashboard.</p>
      </aside>
    </div></section>`;
}

// Submit a vendor application. The client sends ONLY the applicant's details —
// full name, matric, college, department, email, phone, offer, price range,
// optional note. The user_id is taken from the authenticated session (never
// typed in), and the server enforces ownership + one application per user.
async function submitVendorApplication(formData) {
  if (state.reportSubmitting) return;
  const g = (k) => (formData.get(k) || '').trim();
  const full_name = g('full_name');
  const matric_number = g('matric_number');
  const college = g('college');
  const department = g('department');
  const email = g('email');
  const phone = g('phone');
  const what_they_want_to_sell = g('what_they_want_to_sell');
  const expected_price_range = g('expected_price_range');
  const additional_info = g('additional_info') || null;
  const errEl = document.getElementById('vaError');
  const fail = (msg) => { if (errEl) errEl.textContent = msg; toast(msg, 'error'); };
  if (!full_name || !matric_number || !college || !department || !email || !phone || !what_they_want_to_sell || !expected_price_range) {
    fail('Please fill in all required fields before submitting');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fail('Please enter a valid email address'); return; }
  if (!state.user) { toast('Please sign in to continue', 'info'); location.hash = '#/login'; return; }
  if (typeof supabase === 'undefined' || !supabase) { fail('Supabase unavailable — application could not be saved'); return; }
  const userId = await getSupabaseUserId();
  if (!userId) { fail('Sign in required to apply'); location.hash = '#/login'; return; }
  state.reportSubmitting = true;
  const btn = document.getElementById('vaSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    const { data, error } = await supabase
      .from('vendor_applications')
      .insert({
        user_id: userId,
        full_name,
        matric_number,
        college,
        department,
        email,
        phone,
        what_they_want_to_sell,
        expected_price_range,
        additional_info,
        status: 'Pending'
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505' || (error.message && error.message.includes('duplicate'))) {
        fail('You already have an application on file — our team will reach out once it is reviewed.');
      } else {
        console.error('Vendor application insert failed:', error);
        fail('Application failed: ' + error.message);
      }
      return;
    }
    state.reportSuccess = 'vendor';
    toast('Application submitted successfully. The Dropzyy team will review it shortly.');
    location.hash = '#/vendor/apply';
  } catch (err) {
    console.error('Vendor application error:', err);
    fail('Application failed — please try again');
  } finally {
    state.reportSubmitting = false;
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = 'Submit Vendor Application'; }
  }
}

// ============================================
// Notifications from Supabase
// ============================================
// Supabase is the source of truth for the signed-in user's notifications
// (RLS: notifications_select_own — own rows only); the localStorage copy is
// only an offline fallback. Rows are mapped into the existing panel shape
// { id, title, body, time, unread } and are shown newest first.
function mapNotificationRow(n) {
  return {
    id: n.id,
    title: n.title,
    body: n.message,
    time: formatOrderCreated(n.created_at),
    createdAt: n.created_at || null,
    unread: !n.is_read
  };
}

// Pull-based load (works regardless of Realtime availability). Also the
// fallback used when the Realtime channel is unavailable.
async function loadNotificationsFromSupabase() {
  if (typeof supabase === 'undefined' || !supabase) return false;
  state.notificationsLoading = true;
  state.notificationsError = false;
  save();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { state.notificationsLoading = false; save(); return false; }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    state.notifications = (data || []).map(mapNotificationRow);
    state.notificationsLoading = false;
    state.notificationsError = false;
    save();
    return true;
  } catch (err) {
    console.error('Notifications load failed — using localStorage fallback:', err);
    state.notificationsLoading = false;
    state.notificationsError = true;
    save();
    return false;
  }
}

// Scroll the newest incoming realtime notification into view without losing
// the panel's current contents. Keeps the list capped at 50 like the pull load.
function upsertNotificationFromRow(row, isNew) {
  const mapped = mapNotificationRow(row);
  const idx = state.notifications.findIndex(n => n.id === mapped.id);
  if (idx >= 0) {
    // Update in place (e.g. the row was marked as read from another tab).
    state.notifications[idx] = { ...state.notifications[idx], ...mapped };
  } else if (isNew) {
    state.notifications.unshift(mapped);
    if (state.notifications.length > 50) state.notifications.pop();
  }
  save();
}

// Realtime (push): subscribe to this user's notifications so the unread badge
// and list update without a manual refresh. RLS still applies server-side, so
// only rows the user can SELECT (their own) are delivered. If the channel is
// unavailable (or the notifications table/Realtime is not published yet), the
// pull-based fallback above continues to work.
function subscribeNotificationsRealtime() {
  if (typeof supabase === 'undefined' || !supabase) return;
  try {
    if (state.notificationsChannel) {
      supabase.removeChannel(state.notificationsChannel).catch(() => {});
      state.notificationsChannel = null;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || !session.user) return;
      const channel = supabase
        .channel('notifications-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
          payload => {
            if (payload && payload.new) {
              upsertNotificationFromRow(payload.new, true);
              handleVendorNewOrderNotification(payload.new);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
          payload => {
            if (payload && payload.new) upsertNotificationFromRow(payload.new, false);
          }
        )
        .subscribe(status => {
          // If Realtime fails, the pull-based loader (triggered on panel open,
          // login, and boot) remains the fallback — no user-visible error.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Notifications realtime channel unavailable — using pull fallback:', status);
            if (state.notificationsChannel === channel) state.notificationsChannel = null;
          }
        });
      state.notificationsChannel = channel;
    }).catch(() => { /* pull-based fallback only */ });
  } catch (err) {
    console.warn('Notifications realtime setup failed — using pull fallback:', err);
  }
}

// F14 — Realtime "new order" for the vendor dashboard.
// Reuses the existing user-scoped notifications channel above instead of
// subscribing to `orders`/`order_items` (NOT in the supabase_realtime
// publication). New orders arrive via the existing DB trigger
// `trg_order_items_notify_vendor` (20260903), which inserts one
// `type='order_placed'` notification per vendor/order the moment a customer's
// order creates an order_items row for this vendor; RLS keeps that row visible
// only to the addressed vendor. Nothing about order creation, payment,
// settlement, or RLS is changed. The channel is subscribed ONCE at boot (never
// re-created on render), so re-renders can't duplicate it; while the dashboard
// is closed the channel still backs the bell badge but no orders are refreshed
// or toasted (route guard below).
function vendorDashboardIsCurrent() {
  const [path] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  return parts.length === 1 && parts[0] === 'vendor';
}

let vendorLiveBusy = false;

async function handleVendorNewOrderNotification(row) {
  if (!row || row.type !== 'order_placed') return;
  if (!state.user || !state.user.vendor_id) return;
  if (!vendorDashboardIsCurrent() || vendorLiveBusy) return;
  vendorLiveBusy = true;
  try {
    // Reuse the exact query the dashboard itself uses (RLS-scoped to this
    // vendor), so the pending list/UI and stats mirror a fresh manual visit.
    const ok = await loadVendorDataFromSupabase();
    if (ok && vendorDashboardIsCurrent()) await render();
  } catch (err) {
    // Keep the current dashboard intact; the panel already surfaced the new
    // order and the next visit reloads from Supabase.
    console.error('Vendor new-order dashboard refresh failed:', err);
  } finally {
    vendorLiveBusy = false;
  }
  toast(row.title || 'New order received', 'info');
}

// Realtime (push): keep the customer catalog in sync with vendor availability
// flips. `products` is published to `supabase_realtime` by migration 20261003.
// Subscribed ONCE at boot; the guard below means re-renders can never create a
// duplicate channel. If Realtime is unavailable, the pull-based loader on page
// load / navigation remains the fallback — no user-visible error.
function subscribeProductsRealtime() {
  if (typeof supabase === 'undefined' || !supabase) return;
  if (productsChannel) return;
  try {
    const channel = supabase
      .channel('products-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'products' }, () => loadCatalogFromSupabase())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, () => loadCatalogFromSupabase())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'products' }, () => loadCatalogFromSupabase())
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Products realtime channel unavailable — using pull fallback:', status);
          if (productsChannel === channel) productsChannel = null;
        }
      });
    productsChannel = channel;
  } catch (err) {
    console.warn('Products realtime setup failed — using pull fallback:', err);
    productsChannel = null;
  }
}

// Mark all of the current user's notifications as read (Supabase + local UI).
// The UPDATE is scoped to the caller's own user_id (RLS notifications_update_own
// re-asserts ownership server-side), so it can never touch another user's rows.
// Per-notification mark-as-read (approved Fix 1). Requires an authenticated
// session; the recipient is ALWAYS the session user (never taken from the
// DOM) and RLS (notifications_update_own) remains the final boundary.
async function markNotificationRead(notificationId) {
  const id = String(notificationId || '').trim();
  if (!/^[0-9a-fA-F-]{10,}$/.test(id)) return; // ignore malformed/local ids
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', session.user.id);
    if (error) throw error;
    const entry = state.notifications.find(x => x.id === id);
    if (entry) { entry.is_read = true; entry.unread = false; }
    save();
    updateChrome();
    if (typeof loadNotificationsFromSupabase === 'function') await loadNotificationsFromSupabase();
  } catch (err) {
    console.error('Mark notification read failed:', err);
  }
}
function markAllNotificationsRead() {
  state.notifications.forEach(n => n.unread = false);
  save();
  if (typeof supabase === 'undefined' || !supabase) return;
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session || !session.user) return;
    return supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false)
      .then(({ error }) => {
        if (error) console.error('Mark-all-read sync failed:', error);
      });
  }).catch(err => console.error('Mark-all-read error:', err));
}

// Render the notification dropdown list with explicit loading / error /
// empty / list states. Called from updateChrome each time notifications change
// (pull load, realtime events, mark-all-read) so the panel always reflects the
// current loading state, oldest-first ordering comes straight from the query.
function renderNotificationList() {
  if (state.notificationsLoading && !state.notifications.length) {
    return '<div class="muted small center" style="padding:14px">Loading notifications…</div>';
  }
  if (state.notificationsError && !state.notifications.length) {
    return '<div class="muted small center" style="padding:14px">Could not load notifications right now.</div>';
  }
  if (!state.notifications.length) {
    return '<div class="muted small center" style="padding:14px">No notifications yet.</div>';
  }
  return state.notifications.map(n =>
    `<div class="notif ${n.unread ? 'notif--unread' : ''}"><span>🔔</span><div>` +
    `<div class="notif__title" data-notif-id="${esc(n.id)}"${(n.unread || n.is_read === false) ? `<button class="link-btn" data-notif-read="${esc(n.id)}">Mark as read</button>` : ''}>${esc(n.title)}</div>` +
    `<div class="notif__body">${esc(n.body)}</div>` +
    `<div class="notif__time">${esc(n.time)}</div></div></div>`
  ).join('');
}

// ---- Discovery helpers (ACTION 8) ----
// Only http(s) / protocol-relative / absolute-or-relative safe URLs are
// allowed into an <img src>. Dangerous schemes (javascript:, data:, vbscript:,
// file:) are rejected up-front so dynamic content is always escaped and
// validated before rendering.
function safeImageUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') ||
      lower.startsWith('vbscript:') || lower.startsWith('file:')) return '';
  if (/^(https?:)?\/\//i.test(s)) return s;
  if (/^\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/i.test(s)) return s; // absolute path
  if (/^[a-z0-9][a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/i.test(s)) return s; // relative path
  return '';
}

// Day index map: 0 = Sunday … 6 = Saturday (matches Date#getDay()).
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// Parse a single time token ("08:00", "8am", "9:30pm", "12pm"…) → minutes.
function parseTimeToken(t) {
  const s = String(t || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Parse a day-set fragment ("mon-fri", "sat", "daily", "every day") → day indexes.
function parseDaySet(part) {
  const p = String(part || '').trim().toLowerCase();
  if (!p || /every|daily|all\s+day|open\s+7/i.test(p)) return [0, 1, 2, 3, 4, 5, 6];
  const days = new Set();
  const groups = p.split(/[&\s]+/).filter(Boolean);
  for (const g of groups) {
    const m = g.match(/^(sun|mon|tue|wed|thu|fri|sat)(?:\s*[-–]\s*(sun|mon|tue|wed|thu|fri|sat))?$/);
    if (!m) continue;
    const a = DAY_INDEX[m[1]];
    const b = m[2] ? DAY_INDEX[m[2]] : a;
    if (a === undefined) continue;
    if (b >= a) { for (let i = a; i <= b; i++) days.add(i); }
    else { for (let i = a; i <= 6; i++) days.add(i); for (let i = 0; i <= b; i++) days.add(i); }
  }
  return days.size ? [...days] : null;
}

// Parse an opening_hours string into { alwaysOpen, rules } or null.
// Supported shapes: "08:00–18:00", "Mon–Fri 08:00–18:00, Sat 09:00–14:00",
// "8am–6pm", "24 hours", "Daily 08:00–18:00". Unparseable input → null so the
// caller falls back to the vendor's existing `open` boolean.
function parseOpeningHours(text) {
  const s = String(text || '').trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/24\s*(hours|hrs|h)?/.test(s) && /open|always|daily|every/i.test(s)) {
    return { alwaysOpen: true, rules: [] };
  }
  const rules = [];
  const segments = s.split(',').map(x => x.trim()).filter(Boolean);
  for (const seg of segments) {
    const timeMatch = seg.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (!timeMatch) continue;
    const open = parseTimeToken(timeMatch[1]);
    const close = parseTimeToken(timeMatch[2]);
    if (open === null || close === null) continue;
    const dayPart = seg.slice(0, timeMatch.index).trim();
    const days = parseDaySet(dayPart);
    if (!days) continue;
    rules.push({ days, open, close, display: `${timeMatch[1].trim()} – ${timeMatch[2].trim()}` });
  }
  if (!rules.length) return null;
  return { alwaysOpen: false, rules };
}

// Compute a vendor's current open/closed status. When opening_hours is present
// and parseable it is the source of truth; otherwise the existing `open`
// boolean is used (unchanged behaviour for vendors without hours).
function vendorOpenStatus(v) {
  if (v && v.opening_hours) {
    const parsed = parseOpeningHours(v.opening_hours);
    if (parsed) {
      if (parsed.alwaysOpen) return { open: true, label: 'Open now', hint: 'Open 24 hours' };
      const now = new Date();
      const day = now.getDay();
      const mins = now.getHours() * 60 + now.getMinutes();
      const rule = parsed.rules.find(r => r.days.includes(day));
      if (!rule) return { open: false, label: 'Closed', hint: `Hours: ${v.opening_hours}` };
      const isOpen = rule.open <= rule.close
        ? mins >= rule.open && mins < rule.close
        : mins >= rule.open || mins < rule.close; // overnight (e.g. 22:00–02:00)
      const [openTxt, closeTxt] = rule.display.split(' – ');
      return {
        open: isOpen,
        label: isOpen ? 'Open now' : 'Closed',
        hint: isOpen ? `Open until ${closeTxt}` : `Opens ${openTxt}`
      };
    }
  }
  return { open: !!(v && v.open), label: (v && v.open) ? 'Open now' : 'Closed', hint: '' };
}
function productCard(p) {
  const v = vendor(p.vendor);
  const img = safeImageUrl(p.image);
  const available = p.active !== false;
  return `<article class="pcard${available ? '' : ' pcard--unavailable'}">
    <a class="pcard__link" href="#/product/${p.id}">
      <div class="pcard__thumb">
        <span class="pcard__thumb-fallback">${esc(p.icon)}</span>
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : ''}
      </div>
      <div class="pcard__name">${esc(p.name)}</div>
    </a>
    <div class="pcard__vendor">${esc(v ? v.name : 'Campus vendor')}</div>
    <div class="pcard__desc">${esc(p.desc)}</div>
    <div class="pcard__foot"><span class="price">${money(p.price)}</span>${available
      ? `<button class="btn btn--soft btn--sm" data-add="${p.id}">Add +</button>`
      : `<button class="btn btn--soft btn--sm" disabled title="Currently unavailable">Not available</button>`}</div>
    ${available ? '' : '<div class="pcard__badge">🔴 Currently unavailable</div>'}
  </article>`;
}
function vendorCard(v) {
  const status = vendorOpenStatus(v);
  const img = safeImageUrl(v.image);
  return `<a class="vcard" href="#/vendor/${esc(v.id)}">
    <div class="vcard__cover" style="background:${esc(v.cover)}">
      <span class="vcard__cover-fallback">${esc(v.icon)}</span>
      ${img ? `<img src="${esc(img)}" alt="${esc(v.name)}" loading="lazy">` : ''}
      <span class="badge badge--brand">${esc(v.type)}</span>
      ${status.open ? '' : '<span class="vcard__closed">Closed</span>'}
    </div>
    <div class="vcard__body">
      <h3>${esc(v.name)}</h3>
      <div class="vcard__meta"><span class="stars">★★★★★</span><b>${esc(v.rating)}</b><span>• ${esc(v.time)}</span></div>
      ${v.description ? `<div class="vcard__desc">${esc(v.description)}</div>` : ''}
      ${status.hint ? `<div class="vcard__hours ${status.open ? 'is-open' : 'is-closed'}">${status.open ? '●' : '○'} ${esc(status.hint)}</div>` : ''}
    </div>
  </a>`;
}


// Restaurant/vendor showcase card for the homepage. Rendered from the SAME
// vendor data as the rest of the site (Supabase → localStorage fallback), so
// vendor data is never duplicated. The card image prefers the vendor's own
// `image` field.
function homeVendorCard(v, i) {
  const status = vendorOpenStatus(v);
  const img = safeImageUrl(v.image);
  const rating = Number(v.rating) || 0;
  const stars = Math.max(0, Math.min(5, Math.round(rating)));
  const ratingBlock = v.rating
    ? `<span class="showcase-card__rating" aria-label="Rated ${rating.toFixed(1)} out of 5"><span class="stars" aria-hidden="true">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span><b>${esc(v.rating)}</b></span>`
    : '';
  return `<article class="showcase-card">
    <a class="showcase-card__media" href="#/vendor/${esc(v.id)}" aria-label="View menu of ${esc(v.name)}">
      <span class="showcase-card__fallback">${esc(v.icon)}</span>
      ${img ? `<img src="${esc(img)}" alt="${esc(v.name)} restaurant" loading="lazy">` : ''}
      <span class="badge badge--brand">${esc(v.type)}</span>
      ${status.open ? '' : '<span class="showcase-card__closed">Closed</span>'}
    </a>
    <div class="showcase-card__body">
      <div class="showcase-card__top">
        <h3><a href="#/vendor/${esc(v.id)}">${esc(v.name)}</a></h3>
        ${ratingBlock}
      </div>
      <div class="showcase-card__meta">${esc(v.type)}${v.time ? ` • ${esc(v.time)}` : ''}</div>
      ${v.description ? `<p class="showcase-card__desc">${esc(v.description)}</p>` : ''}
      <div class="showcase-card__foot">
        <span class="showcase-card__hours ${status.open ? 'is-open' : 'is-closed'}">${status.open ? '● Open now' : '○ Closed'}${status.hint ? ` · ${esc(status.hint)}` : ''}</span>
        <a class="btn btn--soft btn--sm" href="#/vendor/${esc(v.id)}">View Menu</a>
      </div>
    </div>
  </article>`;
}
function empty(icon, title, copy, action = '') { return `<div class="empty"><div class="empty__icon">${icon}</div><b>${title}</b><span>${copy}</span>${action}</div>`; }

// Shown when the live Supabase catalog could not be fetched and the customer
// site is rendering the cached localStorage copy (offline fallback).
function catalogBanner() {
  return state.catalogLoadError
    ? `<div class="catalog-offline">Showing a saved catalog — live items could not be refreshed. Check your connection.</div>`
    : '';
}

// Vendor display name(s) for an order, derived from its items' vendor ids.
function orderVendorNames(o) {
  const names = [...new Set((o.items || []).map(it => (vendor(it.vendor) || { name: null }).name).filter(Boolean))];
  return names.length ? names.join(', ') : 'Campus vendor';
}

// ---- Homepage "Popular on Campus" vendor carousel (presentation-only) ----
// Page-based carousel over the SAME vendor data rendered by homeVendorCard.
// Cards per page come from the CSS --vper variable (4 desktop / 3 tablet /
// 2 small tablet / 1 phone), so the same markup is genuinely responsive.
// Rotates every ~5s, pauses while hovered, while the tab is hidden or while
// off-screen (IntersectionObserver), and resets its timer on manual
// navigation. With one page or fewer than one page of vendors the controls
// are hidden and it renders as a static row. Reduced-motion users get an
// instant (non-animated) slide via CSS.
let vendorCarouselState = null;
function initVendorCarousel() {
  if (vendorCarouselState) {
    clearInterval(vendorCarouselState.timer);
    if (vendorCarouselState.io) vendorCarouselState.io.disconnect();
    if (vendorCarouselState.ro) vendorCarouselState.ro.disconnect();
    vendorCarouselState = null;
  }
  const root = document.getElementById('vendorCarousel');
  const viewport = document.getElementById('vendorViewport');
  const track = document.getElementById('vendorTrack');
  const dotsWrap = document.getElementById('vendorDots');
  const controls = document.getElementById('vendorControls');
  const prevBtn = document.getElementById('vendorPrev');
  const nextBtn = document.getElementById('vendorNext');
  if (!root || !viewport || !track || !dotsWrap || !controls || !prevBtn || !nextBtn) return;
  const cardCount = track.children.length;
  if (!cardCount) return;
  const perView = () => parseInt(getComputedStyle(track).getPropertyValue('--vper'), 10) || 4;
  const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;
  const pageCount = () => Math.max(1, Math.ceil(cardCount / perView()));
  const maxOffset = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
  let page = 0;
  const st = { timer: null, io: null, ro: null, hovered: false, visible: true };
  vendorCarouselState = st;
  function apply() {
    // Page 1 starts after perView cards + perView gaps, so the shift per page
    // is viewport + one gap. The last (possibly partial) page is clamped so
    // cards never overflow the viewport edge.
    const offset = Math.min(page * (viewport.clientWidth + gap()), maxOffset());
    track.style.transform = `translateX(${-offset}px)`;
    Array.from(dotsWrap.children).forEach((d, i) => d.classList.toggle('is-active', i === page));
  }
  function goTo(p) { page = ((p % pageCount()) + pageCount()) % pageCount(); apply(); }
  function rebuildDots() {
    dotsWrap.innerHTML = Array.from({ length: pageCount() }, (_, i) =>
      `<button class="vcarousel__dot${i === page ? ' is-active' : ''}" type="button" aria-label="Go to vendor group ${i + 1}"></button>`).join('');
  }
  function startTimer() {
    clearInterval(st.timer);
    st.timer = setInterval(() => {
      if (st.hovered || document.hidden || !st.visible) return;
      goTo(page + 1);
    }, 5000);
  }
  rebuildDots();
  apply();
  if (pageCount() > 1) {
    controls.hidden = false;
    prevBtn.addEventListener('click', () => { goTo(page - 1); startTimer(); });
    nextBtn.addEventListener('click', () => { goTo(page + 1); startTimer(); });
    dotsWrap.addEventListener('click', e => {
      const d = e.target.closest('.vcarousel__dot');
      if (!d) return;
      goTo(Array.from(dotsWrap.children).indexOf(d));
      startTimer();
    });
    root.addEventListener('mouseenter', () => { st.hovered = true; });
    root.addEventListener('mouseleave', () => { st.hovered = false; });
    if ('IntersectionObserver' in window) {
      st.io = new IntersectionObserver(entries => { st.visible = entries[0].isIntersecting; }, { threshold: 0.2 });
      st.io.observe(root);
    }
    if ('ResizeObserver' in window) {
      st.ro = new ResizeObserver(() => {
        if (page >= pageCount()) page = pageCount() - 1;
        rebuildDots();
        apply();
      });
      st.ro.observe(viewport);
    }
    startTimer();
  } else {
    controls.hidden = true;
  }
}

// ============================================================
// Homepage "Reach Us" — contact/help section shown near the bottom
// of the homepage, before the footer (see index.html).
//   * WhatsApp channel (updates/coupons/offers/announcements)
//   * Email card (mailto link)
//   * Report an Issue (dedicated #/report route, Supabase-backed)
//   * FAQs (dedicated #/faqs page — full accordion moved off the homepage)
//   * Work With Dropzyy (vendor interest → #/vendor/apply reusing the
//     issue_reports backend; rider application → #/rider/apply)
// All text is escaped where user content is interpolated; the contact
// values come from DROPZYY_SUPPORT_EMAIL / DROPZYY_WHATSAPP_CHANNEL.
// ============================================================
const REACH_FAQ_ITEMS = [
  ['How do I place an order?', 'Restaurant and Bookshop items use normal Dropzyy checkout and secure Paystack payment. Vendor products are requests only: the vendor contacts you directly to arrange product payment.'],
  ['How do vendor requests work?', 'Vendor products are request-only: no product payment is made through Dropzyy. The vendor contacts you directly to arrange product payment. The vendor can self-deliver with no Dropzyy delivery fee, or request a Dropzyy rider and pay the ₦1,500 delivery fee themselves.'],
  ['How long does delivery take?', 'Most campus deliveries arrive in about 15–35 minutes depending on the vendor and how far away you are. Your order page shows the live status as it moves from the vendor to a rider.'],
  ['Can I track my rider?', 'Yes — open any active order to see the status timeline (Order confirmed → Preparing → Ready → Picked up → On the way → Delivered) updated in real time.'],
  ['How do vendors get paid and how do riders earn?', 'Restaurant and Bookshop orders are paid through Dropzyy. Vendor-request product payments are arranged directly between the customer and vendor. If a vendor requests a Dropzyy rider, the vendor pays ₦1,500 and the rider earns ₦1,000 for the completed delivery.'],
  ['What if something goes wrong with my order?', 'Use the Report an Issue card — pick a subject, describe what happened, and our team will review it from the Admin Panel. For paid orders, the Refund option on My Orders covers payment-specific problems.'],
  ['How do I become a rider or vendor?', 'Riders can apply straight from the Rider hub or the Work With Dropzyy section below. Vendors can complete the vendor interest form — the Dropzyy team reviews every application.'],
];
function homeReachUs() {
  const waUrl = String(DROPZYY_WHATSAPP_CHANNEL || '').trim();
  const hasWhatsAppChannel = /^https:\/\/whatsapp\.com\/channel\/(?!PASTE_)/i.test(waUrl);
  const emailHref = `mailto:${encodeURIComponent(String(DROPZYY_SUPPORT_EMAIL || '').trim()).replace(/%40/i, '@')}`;
  return `
<section class="dropzyy-reach" aria-labelledby="reachUsTitle">
  <div class="container dropzyy-reach__inner">
    <div class="dropzyy-reach__head">
      <span class="dropzyy-reach__eyebrow">Reach Us</span>
      <h2 id="reachUsTitle">We're here to help</h2>
      <p>Questions, feedback, or something that went wrong — pick the fastest channel to get it sorted.</p>
    </div>

    <div class="dropzyy-reach__grid">
      ${hasWhatsAppChannel ? `<article class="dropzyy-reach__card dropzyy-reach__card--wa">
        <span class="dropzyy-reach__icon" aria-hidden="true">💬</span>
        <h3>Join Our WhatsApp Channel</h3>
        <p>Get updates, coupons, and offers on WhatsApp. Not for support.</p>
        <a class="btn dropzyy-reach__btn" href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer">Join WhatsApp Channel</a>
      </article>` : ''}

      <article class="dropzyy-reach__card">
        <span class="dropzyy-reach__icon" aria-hidden="true">✉️</span>
        <h3>Email Us</h3>
        <p>Questions or feedback? Send us an email.</p>
        <a class="btn btn--ghost dropzyy-reach__btn" href="${esc(emailHref)}">Send us an Email</a>
      </article>

      <article class="dropzyy-reach__card dropzyy-reach__card--report">
        <span class="dropzyy-reach__icon" aria-hidden="true">🛠️</span>
        <h3>Report an Issue</h3>
        <p>Something went wrong? Let us know.</p>
        <a class="btn btn--accent dropzyy-reach__btn" href="#/report">Report an Issue</a>
      </article>

      <article class="dropzyy-reach__card">
        <span class="dropzyy-reach__icon" aria-hidden="true">❓</span>
        <h3>FAQs</h3>
        <p>Quick answers on ordering, delivery, and riders.</p>
        <a class="btn btn--soft dropzyy-reach__btn" href="#/faqs">View FAQs</a>
      </article>
    </div>

    <div class="dropzyy-work">
      <div class="dropzyy-work__copy">
        <h3>Work With Dropzyy</h3>
        <p>Want to join the Dropzyy community?</p>
      </div>
      <div class="dropzyy-work__actions">
        <a class="btn btn--ghost dropzyy-work__btn" href="#/vendor/apply">Become a Vendor</a>
        <a class="btn btn--soft dropzyy-work__btn" href="#/rider/apply">Become a Rider</a>
      </div>
    </div>
  </div>
</section>`;
}

// Dedicated FAQs page (#/faqs). Public — no auth required. Holds the full
// accordion that used to sit halfway down the homepage "Reach Us" section;
// the homepage FAQs card now simply navigates here.
function faqsView() {
  const emailHref = `mailto:${encodeURIComponent(String(DROPZYY_SUPPORT_EMAIL || '').trim()).replace(/%40/i, '@')}`;
  const items = REACH_FAQ_ITEMS.map(([q, a]) => `
        <details class="dropzyy-faq__item">
          <summary>${esc(q)}</summary>
          <div class="dropzyy-faq__answer">${esc(a)}</div>
        </details>`).join('');
  return `<section class="section container">
    <a href="#/" class="muted small">← Back to home</a>
    <div class="page-head mt-1"><div><h1>Frequently asked questions</h1>
      <p class="muted">Quick answers about ordering, delivery, vendors, riders, and Dropzyy. Can't find what you need? <a href="#/report">Report an issue</a> or <a href="${esc(emailHref)}">email us</a>.</p></div></div>
    <div class="dropzyy-faq" style="margin-top:12px">
      ${items}
    </div>
    <div class="card mt-2" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px">
      <div><h3 class="mb-0">Still stuck?</h3><p class="muted small mb-0">Tell us what went wrong and our team will look into it.</p></div>
      <a class="btn btn--accent dropzyy-reach__btn" style="width:auto; margin-top:0" href="#/report">Report an Issue</a>
    </div>
  </section>`;
}

function home() {
  const vcount = data().vendors.length;
  const books = data().products.filter(p => p.category === 'Bookshop');
  return `${catalogBanner()}
<section class="dropzyy-hero">
  <div class="container dropzyy-hero__inner">
    <div class="dropzyy-hero__copy hero-text">
      <h1 class="dropzyy-hero__title">Caf 2 is far. <span class="dropzyy-hero__title-hl">We know.</span></h1>
      <p class="dropzyy-hero__sub">Order food, drinks, textbooks, or a late-night snack and have another student bring it to your hostel, lecture hall, or wherever you&rsquo;re posted. Track your rider the whole way.</p>
      <div class="dropzyy-hero__actions">
        <a class="btn btn--lg dropzyy-hero__cta" href="#/browse">Start an order</a>
        <a class="btn btn--lg btn--ghost dropzyy-hero__cta-2" href="#/rider/apply">Ride with us &rarr;</a>
      </div>
      <div class="dropzyy-hero__hinted">
        <span class="dropzyy-hero__hinted-label">Jump straight to:</span>
        <a class="dropzyy-hero__hinted-chip" href="#/browse?cat=Food"><svg class="chip-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5"/><path d="M3.5 11h17"/><path d="M4.5 14.5h15V16a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4v-1.5z"/></svg>Food</a>
        <a class="dropzyy-hero__hinted-chip" href="#/browse?cat=Drinks"><svg class="chip-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8.5h11L16 21H8L6.5 8.5z"/><path d="M10 8.5L15.5 3"/><path d="M7 12.5h10"/></svg>Drinks</a>
        <a class="dropzyy-hero__hinted-chip" href="#/browse?cat=Bookshop"><svg class="chip-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Books</a>
        <a class="dropzyy-hero__hinted-chip" href="#/browse?cat=Snacks"><svg class="chip-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9.5h11L16.1 20.5H7.9L6.5 9.5z"/><circle cx="9" cy="6" r="2.1"/><circle cx="12" cy="4.8" r="2.3"/><circle cx="15" cy="6" r="2.1"/></svg>Snacks</a>
      </div>
    </div>
    <div class="dropzyy-hero__visual hero-visual">
      <!-- Rider illustration — right column, above the live-tracking card -->
      <svg class="dropzyy-hero__art" viewBox="0 0 340 250" aria-hidden="true" focusable="false">
        <ellipse class="art-blob" cx="182" cy="140" rx="156" ry="102"/>
        <path class="art-speed" d="M8 116h40"/>
        <path class="art-speed" d="M2 138h32"/>
        <path class="art-speed" d="M14 160h26"/>
        <path class="art-ground" d="M28 226h284"/>
        <circle class="art-ink" cx="92" cy="194" r="30"/>
        <circle class="art-pink" cx="92" cy="194" r="10"/>
        <circle class="art-ink" cx="272" cy="194" r="30"/>
        <circle class="art-pink" cx="272" cy="194" r="10"/>
        <path class="art-ink" d="M92 194l34-64h22l38 40h52"/>
        <path class="art-ink" d="M186 170l16-50 58-22"/>
        <path class="art-ink" d="M260 98l12 96"/>
        <path class="art-ink" d="M260 98l-14-16 12-8"/>
        <path class="art-ink art-seat" d="M116 128l40-6"/>
        <circle class="art-tang" cx="256" cy="102" r="7"/>
        <rect class="art-box" x="26" y="92" width="62" height="54" rx="6"/>
        <path class="art-ink art-thin" d="M57 92v54"/>
        <path class="art-ink art-thin" d="M26 112h62"/>
        <path class="art-ink" d="M154 130l36-56"/>
        <path class="art-ink" d="M154 130l42 10-6 24"/>
        <path class="art-ink" d="M186 76l38 6 22-8"/>
        <circle class="art-helmet" cx="198" cy="52" r="18"/>
        <path class="art-visor" d="M210 46a11 11 0 0 1 5 10"/>
      </svg>
      <div class="dropzyy-hero__waybill" aria-label="Tracking demonstration">
      <div class="dropzyy-hero__waybill-inner">
        <div class="dropzyy-hero__waybill-head">
          <span class="dropzyy-hero__waybill-tag">Demo tracking</span>
          <span class="dropzyy-hero__waybill-code" data-tracking>DZ-4417LG</span>
        </div>
        <div class="dropzyy-hero__waybill-route" id="waybillRoute">
          <div class="dropzyy-hero__waybill-route-track"></div>
          <div class="dropzyy-hero__waybill-route-fill" id="waybillRouteFill"></div>
          <div class="dropzyy-hero__waybill-route-marker" id="waybillRouteMarker" aria-hidden="true">
            <div class="dropzyy-hero__waybill-route-marker-inner"></div>
          </div>
          <div class="dropzyy-hero__waybill-route-truck" id="waybillTruck" aria-hidden="true">🚚</div>
          <div class="dropzyy-hero__waybill-route-runner" aria-hidden="true"></div>
          <div class="dropzyy-hero__waybill-route-origin" aria-label="Origin">Caf 2</div>
          <div class="dropzyy-hero__waybill-route-dest" aria-label="Destination">Your hostel</div>
        </div>
        <div class="dropzyy-hero__waybill-eta" id="waybillEta">
          <span class="dropzyy-hero__waybill-status-live-dot" aria-hidden="true"></span>
          <span class="dropzyy-hero__waybill-status-text">Sample estimate —</span>
          <span class="dropzyy-hero__waybill-eta-value" id="waybillEtaValue">—</span>
        </div>
      </div>
      <div class="dropzyy-hero__waybill-stamp" aria-label="On time">On time</div>
    </div>
    </div>
  </div>
</section>

<section class="dropzyy-vendors">
  <div class="container">
    <div class="dropzyy-vendors__head">
      <div>
        <span class="dropzyy-vendors__eyebrow">${vcount} ${vcount === 1 ? 'campus vendor' : 'campus vendors'}</span>
        <h2>Popular on Campus</h2>
        <p>Discover places students are ordering from.</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="#/vendors">See all vendors →</a>
    </div>
    <div class="vcarousel" id="vendorCarousel" aria-roledescription="carousel" aria-label="Campus vendors">
      <div class="vcarousel__viewport" id="vendorViewport">
        <div class="vcarousel__track" id="vendorTrack">${data().vendors.map(v => homeVendorCard(v)).join('')}</div>
      </div>
      <div class="vcarousel__controls" id="vendorControls" hidden>
        <button class="vcarousel__btn" id="vendorPrev" type="button" aria-label="Previous vendors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="vcarousel__dots" id="vendorDots"></div>
        <button class="vcarousel__btn" id="vendorNext" type="button" aria-label="Next vendors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
  </div>
</section>

${books.length ? `
<section class="dropzyy-bookshop">
  <div class="container dropzyy-bookshop__inner">
    <div class="dropzyy-bookshop__intro">
      <span class="dropzyy-bookshop__eyebrow">Books &amp; materials</span>
      <h2>Featured Bookshop Materials</h2>
      <p>Get the books and materials you need for campus.</p>
      <a class="btn" href="#/browse?cat=Bookshop">Browse Bookshop →</a>
    </div>
    <div class="dropzyy-bookshop__grid">
      ${books.slice(0, 4).map(p => productCard(p)).join('')}
    </div>
  </div>
</section>` : ''}

<section class="dropzyy-features">
  <div class="container">
    <div class="dropzyy-features__head">
      <span class="dropzyy-features__eyebrow">More than food delivery</span>
      <h2>Everything you need, one app</h2>
      <p>Dropzyy brings the campus together — food, drinks, books and deliveries, all in one place.</p>
    </div>
    <div class="dropzyy-features__grid">
      <a class="dropzyy-feature" href="#/browse?cat=Food">
        <span class="dropzyy-feature__icon" aria-hidden="true">🍔</span>
        <span class="dropzyy-feature__title">Food & meals</span>
        <span class="dropzyy-feature__desc">Order from campus vendors — snacks, hostel meals, sandwiches and more.</span>
      </a>
      <a class="dropzyy-feature" href="#/browse?cat=Drinks">
        <span class="dropzyy-feature__icon" aria-hidden="true">🥤</span>
        <span class="dropzyy-feature__title">Drinks & snacks</span>
        <span class="dropzyy-feature__desc">Cold drinks, juices and study fuel, ready when you are.</span>
      </a>
      <a class="dropzyy-feature" href="#/browse?cat=Bookshop">
        <span class="dropzyy-feature__icon" aria-hidden="true">📚</span>
        <span class="dropzyy-feature__title">Books & materials</span>
        <span class="dropzyy-feature__desc">Textbooks, stationery and course materials from campus sellers.</span>
      </a>
      <a class="dropzyy-feature" href="#/orders">
        <span class="dropzyy-feature__icon" aria-hidden="true">📦</span>
        <span class="dropzyy-feature__title">Track your order</span>
        <span class="dropzyy-feature__desc">See your order status in real time — from confirmed to delivered.</span>
      </a>
    </div>
  </div>
</section>

${homeReachUs()}`;
}

function browse() {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const q = (params.get('q') || '').toLowerCase();
  const cat = params.get('cat') || 'All';
  const cats = ['All','Food','Meals','Snacks','Drinks','Bookshop'];
  const vname = p => (vendor(p.vendor) || { name: '' }).name;
  const list = data().products.filter(p => (cat === 'All' || p.category === cat) && `${p.name} ${p.desc} ${vname(p)}`.toLowerCase().includes(q));
  const availCount = list.filter(p => p.active !== false).length;
  return `${catalogBanner()}<section class="section container"><div class="page-head"><div><h1>Browse campus finds</h1><p>Everything you need, from trusted student vendors.</p></div></div><div class="card card--pad-sm mb-2"><form class="searchbar" id="browseSearch"><span>🔍</span><input name="q" value="${esc(q)}" placeholder="Search items or vendors"><button class="btn" type="submit">Search</button></form></div><div class="chips mb-2">${cats.map(x=>`<a class="chip ${cat===x?'is-active':''}" href="#/browse?cat=${x}">${x}</a>`).join('')}</div><div class="row row--between mb-1"><span class="muted small">${availCount} items available</span><span class="badge badge--success">● Delivering now</span></div><div class="grid grid--4">${list.length ? list.map(productCard).join('') : empty('🔍','No matches found','Try another search or category.').replace(/<div class="empty">/, '<div class="empty" style="grid-column:1/-1">')}</div></section>`;
}

function vendors() {
  const list = data().vendors;
  const allOpen = list.length > 0 && list.every(v => vendorOpenStatus(v).open);
  return `<section class="section container"><div class="page-head"><div><h1>Campus Restaurants</h1><p>Your campus, full of options.</p></div><span class="badge badge--${allOpen?'success':'warn'}">● ${allOpen?'All open now':'Some vendors are closed'}</span></div><div class="grid grid--3">${list.map(vendorCard).join('')}</div></section>`;
}
function vendorView(id) {
  const v = vendor(id);
  if (!v) return notFound();
  const items = data().products.filter(p => p.vendor === id);
  const status = vendorOpenStatus(v);
  const img = safeImageUrl(v.image);
  const vendorRequestStore = v.is_restaurant === false;
  return `<section class="section container">
    <a href="#/vendors" class="muted small">← All vendors</a>
    <div class="card mt-1" style="background:linear-gradient(135deg,${esc(v.cover)},var(--surface));">
      <div class="row">
        <div class="vcard__cover" style="width:74px;height:74px;background:var(--surface);border-radius:16px;flex:none;position:relative;overflow:hidden">
          <span class="vcard__cover-fallback">${esc(v.icon)}</span>
          ${img ? `<img src="${esc(img)}" alt="${esc(v.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:relative;z-index:1">` : ''}
        </div>
        <div>
          <h1>${esc(v.name)}</h1>
          <div class="vcard__meta"><span class="stars">★★★★★</span><b>${esc(v.rating)}</b><span>• ${esc(v.type)}</span><span>• ${esc(v.time)}</span></div>
          <p class="muted small mb-0">${status.open ? 'Open now' : 'Closed'} · Campus delivery available</p>
          ${status.hint ? `<p class="muted small mb-0">${esc(status.hint)}</p>` : ''}
        </div>
      </div>
      ${v.description ? `<p class="mt-2 mb-0">${esc(v.description)}</p>` : ''}
    </div>
    <div class="page-head mt-3"><div><h2>${vendorRequestStore ? 'Products' : 'Menu'}</h2><p>${vendorRequestStore ? 'Select products you are interested in, then send the vendor a request. No product payment is made on Dropzyy.' : 'Tap a product for details, or add it straight to your order.'}</p></div></div>
    <div class="grid grid--4">${items.length ? items.map(productCard).join('') : empty('🍽️',vendorRequestStore ? 'No products yet' : 'No menu items yet','This vendor has not added any products.')}</div>
  </section>`;
}

// Product detail page (ACTION 8): image, name, vendor, category, description,
// price and availability. Missing images fall back to the product icon; a
// missing product renders the standard not-found state.
function productView(id) {
  const p = product(id);
  if (!p) return notFound();
  const v = vendor(p.vendor);
  const status = vendorOpenStatus(v);
  const img = safeImageUrl(p.image);
  const available = p.active !== false;
  return `<section class="section container">
    <a href="#/browse" class="muted small">← Back to browse</a>
    <div class="card product-detail mt-1">
      <div class="product-detail__media">
        <span class="product-detail__fallback">${esc(p.icon)}</span>
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : ''}
      </div>
      <div class="product-detail__body">
        <div class="row row--between row--wrap">
          <span class="badge badge--brand">${esc(p.category)}</span>
          <span class="badge ${available ? 'badge--success' : 'badge--warn'}">${available ? 'Available' : 'Currently unavailable'}</span>
        </div>
        <h1 class="mt-1 mb-0">${esc(p.name)}</h1>
        <a class="muted small" href="#/vendor/${esc(v ? v.id : '')}">${esc(v ? v.name : 'Campus vendor')}${v && status.hint ? ` · ${esc(status.hint)}` : ''}</a>
        <p class="mt-2">${esc(p.desc) || 'No description provided yet.'}</p>
        <div class="product-detail__price"><span class="price price--lg">${money(p.price)}</span><span class="muted small">${esc(v ? v.time : '')}</span></div>
        ${available
          ? `<button class="btn btn--lg" data-add="${p.id}">Add to cart · ${money(p.price)}</button>`
          : `<button class="btn btn--lg" disabled>Currently unavailable</button>`}
      </div>
    </div>
  </section>`;
}

function cart() {
  const items = cartItems();
  const subtotal = cartTotal(), fee = items.length ? DELIVERY_FEE : 0;
  const vendorOnly = items.length > 0 && items.every(isVendorProduct);
  const vendorUnavailable = items.filter(x => x.active === false);
  const vendorLines = items.map(x => `<div class="line"><div class="line__thumb">${esc(x.icon)}</div><div class="line__main"><div class="line__name">${esc(x.name)}</div><div class="line__sub">${esc((vendor(x.vendor) || { name: 'Campus vendor' }).name)} Â· ${money(x.price)}</div></div><span>${x.qty}</span><b>${money(x.qty*x.price)}</b></div>`).join('');
  if (vendorOnly) {
    const vendorCheckoutBtn = vendorUnavailable.length
      ? `<button class="btn btn--block mt-2" disabled>Remove unavailable items to continue</button>`
      : `<a class="btn btn--block mt-2" href="#/checkout">Send Request</a>`;
    return `<section class="section container"><div class="page-head"><div><h1>Your request</h1><p>Review the products you want to request from the vendor.</p></div></div><div class="split"><div class="card">${vendorLines}</div><aside class="card sticky-side"><div class="card__head"><h3>Request summary</h3></div><div class="totals"><div><span>Product interest</span><span>${money(subtotal)}</span></div><div><span>Dropzyy payment</span><span>₦0</span></div><div><span>Delivery</span><span>Arranged with vendor</span></div></div><p class="muted small">No payment is made on Dropzyy. The vendor will contact you directly about the product transaction and delivery.</p>${vendorCheckoutBtn}</aside></div></section>`;
  }
  const unavailable = items.filter(x => x.active === false);
  const lines = items.map(x => {
    const avail = x.active !== false;
    return `<div class="line${avail ? '' : ' line--unavailable'}"><div class="line__thumb">${esc(x.icon)}</div><div class="line__main"><div class="line__name">${esc(x.name)}</div><div class="line__sub">${esc((vendor(x.vendor) || { name: 'Campus vendor' }).name)} · ${money(x.price)}${avail ? '' : ' · <b>No longer available</b>'}</div></div><div class="qty">${avail ? `<button data-qty="${x.id}" data-delta="-1" aria-label="Decrease quantity of ${esc(x.name)}">−</button><span>${x.qty}</span><button data-qty="${x.id}" data-delta="1" aria-label="Increase quantity of ${esc(x.name)}">+</button>` : `<span>${x.qty}</span>`}</div><b>${money(x.qty*x.price)}</b><button class="link-btn" data-remove="${x.id}" title="Remove item" aria-label="Remove item from cart">✕</button></div>`;
  }).join('');
  const checkoutBtn = unavailable.length
    ? `<button class="btn btn--block mt-2" disabled title="Remove the unavailable item(s) to continue">Checkout · ${money(subtotal+fee)}</button><p class="muted xs center mt-1 mb-0">Remove the unavailable item(s) to checkout.</p>`
    : `<a class="btn btn--block mt-2" href="#/checkout">Checkout · ${money(subtotal+fee)}</a><p class="muted xs center mt-1 mb-0">Secure payment in Nigerian Naira</p>`;
  return `<section class="section container"><div class="page-head"><div><h1>Your cart</h1><p>${items.length ? 'Review your items before checkout.' : 'Your next campus find awaits.'}</p></div></div>${!items.length ? empty('🛒','Your cart is empty','Explore campus vendors and add what you need.','<a class="btn mt-1" href="#/browse">Browse items</a>') : `<div class="split"><div class="card">${lines}</div><aside class="card sticky-side"><div class="card__head"><h3>Order summary</h3></div><div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>Delivery fee</span><span>${money(fee)}</span></div><div class="totals__grand"><span>Total</span><span>${money(subtotal+fee)}</span></div></div>${checkoutBtn}</aside></div>`}</section>`;
}

// Get the current Supabase user id (or null if not signed in via Supabase).
async function getSupabaseUserId() {
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('Supabase client is missing — check that config.js loaded correctly after the Supabase CDN script.');
    return null;
  }
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Failed to get Supabase session:', sessionError);
      return null;
    }
    if (!session || !session.user) {
      console.error('No authenticated Supabase session found — the user must be signed in via Supabase auth to place an order.');
      return null;
    }
    return session.user.id;
  } catch (err) {
    console.error('Unexpected error getting Supabase session:', err);
    return null;
  }
}

// Save an order to Supabase (ACTION 12: server-side pricing).
// The client sends ONLY product ids + quantities + the delivery spot —
// never prices, totals or fees. The place_order RPC re-prices every line
// from the authoritative products table, rejects inactive/unknown
// products, applies the flat ₦1,500 delivery fee, generates the order
// number server-side and inserts the order + items atomically.
// Returns the authoritative order row, or null on failure.
async function saveOrderToSupabase(order) {
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('Supabase client is missing in saveOrderToSupabase — cannot place order.');
    return null;
  }

  // Client-side sanity only (the DB re-validates everything server-side).
  const lines = (order.items || []).map(it => ({ id: String(it.id), qty: Number(it.qty) }));
  if (!lines.length || lines.some(l => !l.id || !Number.isInteger(l.qty) || l.qty < 1)) {
    console.error('Checkout rejected client-side: invalid cart lines.');
    return null;
  }

  const data = await requestOrderAdmission(order, lines, 'place_order');
  const error = data && data.__error ? data.__error : null;

  if (error) {
    console.error('place_order RPC failed:', error);
    // Surface the REAL Supabase error (message/code/details/hint) to the UI
    // instead of hiding it behind a generic toast.
    state.lastOrderError = [
      error.message,
      error.details,
      error.hint,
      error.code ? `(code ${error.code})` : ''
    ].filter(Boolean).join(' — ') || 'unknown Supabase error';
    return null;
  }
  if (!data || !data.order) {
    console.error('place_order returned no order row.');
    state.lastOrderError = 'place_order returned no order row';
    return null;
  }

  // Adopt the SERVER-authoritative values — the local cart math is only
  // a preview and is never persisted.
  order.id = data.order.order_number;   // server-generated order number
  order.dbId = data.order.id;           // DB uuid, used by later updates
  order.subtotal = Number(data.order.subtotal);
  order.fee = Number(data.order.fee);
  order.total = Number(data.order.total);
  order.status = data.order.status || order.status;
  order.payment_status = data.order.payment_status || 'pending';
  order.createdAt = data.order.created_at || order.createdAt || null;

  // Re-price the displayed lines from what was actually persisted.
  const serverItems = Array.isArray(data.items) ? data.items : [];
  if (serverItems.length) {
    order.items = order.items.map(it => {
      const s = serverItems.find(x => String(x.product_id) === String(it.id));
      return s ? { ...it, price: Number(s.price), name: s.name, icon: s.icon, vendor: s.vendor_id } : it;
    });
  }

  clearOrderAttempt('place_order', lines, order.spot, order.idempotency_key, order.user_id);

  return data.order;
}

// ============================================
// Vendor Order Request: save to Supabase
// ============================================
async function requestOrderAdmission(order, lines, operation) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.access_token) {
    state.lastOrderError = 'Please sign in again before placing this order';
    return { __error: { message: state.lastOrderError } };
  }
  const key = order.idempotency_key;
  if (!key) {
    state.lastOrderError = 'Order attempt is missing its idempotency key';
    return { __error: { message: state.lastOrderError } };
  }
  const edgeUrl = window.SUPABASE_EDGE_URL + '/functions/v1/order-admission';
  let response;
  try {
    response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: lines,
        spot: order.spot,
        vendor_request: operation === 'create_vendor_order_request',
        idempotency_key: key
      })
    });
  } catch (err) {
    state.lastOrderError = 'Order service unavailable — please try again';
    return { __error: { message: state.lastOrderError } };
  }
  let result = null;
  try { result = await response.json(); } catch (_) { result = null; }
  if (!response.ok) {
    if (response.status === 409) {
      state.lastOrderError = 'This order attempt conflicts with an existing request. Please start a new order.';
    } else if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      state.lastOrderError = retry
        ? `Too many order attempts. Please try again in ${retry} seconds.`
        : 'Too many order attempts. Please try again later.';
    } else if (response.status === 401) {
      state.lastOrderError = 'Your session has expired. Please sign in again.';
    } else {
      state.lastOrderError = (result && result.error) || `Order service failed (${response.status})`;
    }
    return { __error: { message: state.lastOrderError, status: response.status } };
  }
  if (result && result.order && result.order.order) {
    return { order: result.order.order, items: result.order.items || [] };
  }
  return { __error: { message: 'Order service returned no order' } };
}

// Dedicated function for vendor order requests.
// Calls create_vendor_order_request RPC (not place_order).
// No payment, no fee, no Paystack redirect.
async function saveVendorOrderRequestToSupabase(order) {
  if (typeof supabase === 'undefined' || !supabase) {
    console.error('Supabase client missing — cannot create vendor order request.');
    return null;
  }

  const lines = (order.items || []).map(it => ({ id: String(it.id), qty: Number(it.qty) }));
  if (!lines.length || lines.some(l => !l.id || !Number.isInteger(l.qty) || l.qty < 1)) {
    console.error('Vendor request rejected client-side: invalid cart lines.');
    return null;
  }

  const data = await requestOrderAdmission(order, lines, 'create_vendor_order_request');
  const error = data && data.__error ? data.__error : null;

  if (error) {
    console.error('create_vendor_order_request RPC failed:', error);
    state.lastOrderError = [
      error.message,
      error.details,
      error.hint,
      error.code ? `(code ${error.code})` : ''
    ].filter(Boolean).join(' — ') || 'unknown Supabase error';
    return null;
  }
  if (!data || !data.order) {
    console.error('create_vendor_order_request returned no order row.');
    state.lastOrderError = 'create_vendor_order_request returned no order row';
    return null;
  }

  // Adopt server-authoritative values
  order.id = data.order.order_number;
  order.dbId = data.order.id;
  order.subtotal = Number(data.order.subtotal);
  order.fee = Number(data.order.fee);
  order.total = Number(data.order.total);
  order.status = data.order.status || order.status;
  order.payment_status = data.order.payment_status || 'pending_vendor';
  order.request_type = data.order.request_type;
  order.delivery_method = data.order.delivery_method;
  order.vendor_delivery_requested = data.order.vendor_delivery_requested;
  order.createdAt = data.order.created_at || order.createdAt || null;

  const serverItems = Array.isArray(data.items) ? data.items : [];
  if (serverItems.length) {
    order.items = order.items.map(it => {
      const s = serverItems.find(x => String(x.product_id) === String(it.id));
      return s ? { ...it, price: Number(s.price), name: s.name, icon: s.icon, vendor: s.vendor_id } : it;
    });
  }

  clearOrderAttempt('create_vendor_order_request', lines, order.spot, order.idempotency_key, order.user_id);

  return data.order;
}

// ============================================
// Vendor Dashboard: load vendor data from Supabase
// ============================================
// Loads the authenticated vendor's own orders and products. The RLS policies
// added by 20260820_add_vendor_dashboard_workflow.sql only return rows whose
// vendor_id matches the vendor_id on the caller's profile (role = 'vendor'),
// so Vendor A can never see Vendor B's data through these queries.

// Reset ALL vendor-session state (in-memory only — never touches Supabase
// rows). Called on logout and whenever a NEW authenticated session is
// established, so a different account can never inherit the previous
// vendor's cached orders/products, the one-shot vendorLoaded flag, or the
// withdrawal-request list/loaded flag. The RLS-protected loaders
// (loadVendorDataFromSupabase / loadWithdrawalsFromSupabase) refetch
// everything for the current authenticated user on next use.
function resetVendorSessionState() {
  state.vendorOrders = [];
  state.vendorProducts = [];
  state.vendorLoaded = false;
  state.vendorLoadError = null;
  state.withdrawals = [];
  state.withdrawalsLoaded = false;
  state.withdrawalsError = null;
  state.withdrawalSubmitting = false;
  // Rider earnings belong to the account that was signed in. Clearing this on
  // logout / new-session guarantees the next user never sees the previous
  // rider's authoritative pending_earnings figure (loadRiderFromSupabase()
  // repopulates it for the current account).
  state.riderEarnings = null;
}

async function loadVendorDataFromSupabase() {
  state.vendorLoaded = true;
  state.vendorLoadError = null;
  if (!state.user || !state.user.vendor_id) return false; // vendor capability = linked vendor_id (multi-role)
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
      fee: o.fee != null ? o.fee : DELIVERY_FEE,
      status: o.status || 'Order confirmed',
      spot: o.spot || '',
      delivery_method: o.delivery_method || 'rider',
      rider_id: o.rider_id || null,
      payment_status: o.payment_status || 'pending',
      request_type: o.request_type || 'restaurant',
      vendor_delivery_requested: o.vendor_delivery_requested === true,
      delivery_payment_status: o.delivery_payment_status || 'pending',
      delivery_payment_id: o.delivery_payment_id || null,
      rider_delivery_share: o.rider_delivery_share != null ? o.rider_delivery_share : 0,
      company_delivery_share: o.company_delivery_share != null ? o.company_delivery_share : 0,
      created: formatOrderCreated(o.created_at),
      createdAt: o.created_at || null
    }));

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
      image: p.image || '',
      active: p.active !== false
    }));

    return true;
  } catch (err) {
    console.error('Vendor data load failed:', err);
    state.vendorLoadError = err.message || 'Unknown error';
    return false;
  }
}

async function ensureVendorLoaded() {
  if (!state.vendorLoaded) {
    await loadVendorDataFromSupabase();
  }
}

// ============================================
// Vendor Dashboard: product management (own products only)
// ============================================
// Every operation below is scoped to the signed-in vendor's own vendor_id
// (profiles.vendor_id) — and RLS (products_select/insert/update_vendor)
// independently enforces the same restriction, so a vendor can never read or
// modify another vendor's products. "Delete" is a soft delete (active=false)
// because RLS grants vendors no products DELETE policy; this mirrors the
// admin panel's deactivateProductInSupabase() pattern and keeps order_items
// foreign keys intact. Supabase is always the source of truth; the
// localStorage vendor_products copy is only a cache/fallback.
async function refreshVendorProducts() {
  if (typeof supabase === 'undefined' || !supabase) return false;
  if (!state.user || !state.user.vendor_id) return false; // vendor capability = linked vendor_id (multi-role)
  try {
    const vid = state.user.vendor_id;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vid);
    if (error) throw error;
    state.vendorProducts = (data || []).map(p => ({
      id: p.id,
      vendor: p.vendor_id,
      name: p.name,
      desc: p.desc,
      price: p.price,
      icon: p.icon,
      category: p.category,
      image: p.image || '',
      active: p.active !== false
    }));
    return true;
  } catch (err) {
    console.error('Vendor products refresh failed:', err);
    toast('Could not refresh your products: ' + (err.message || 'unknown error'), 'error');
    return false;
  }
}

// New product ids: products.id is numeric with no client-usable server
// default, so mirror the admin panel's max-id + 1 approach. The public
// products SELECT policy (active = true) plus products_select_vendor let the
// vendor read existing product ids to compute the next one.
async function nextVendorProductId() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    const maxId = data && data.length ? Number(data[0].id) : 0;
    return maxId + 1;
  } catch (err) {
    console.error('Could not determine the next product id:', err);
    return null;
  }
}

// Handle the vendor Add/Edit product form. A hidden "id" field decides
// between INSERT (new product) and UPDATE (own product only).
async function submitVendorProductForm(form) {
  if (!state.user || !state.user.vendor_id) return; // vendor capability = linked vendor_id (multi-role)
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — product changes could not be saved', 'error'); return; }
  const f = new FormData(form);
  const editId = (f.get('id') || '').toString().trim();
  const name = (f.get('name') || '').trim();
  const priceRaw = (f.get('price') || '').toString().trim();
  const category = (f.get('category') || '').trim();
  const icon = (f.get('icon') || '').trim() || '🍽️';
  const desc = (f.get('desc') || '').trim();
  const image = safeImageUrl(f.get('image')); // empty string when blank/invalid

  // Validation: non-blank name/category, non-negative numeric price.
  if (!name) { toast('Product name cannot be blank', 'error'); return; }
  const price = Number(priceRaw);
  if (priceRaw === '' || !Number.isFinite(price) || price < 0) { toast('Price must be a non-negative number', 'error'); return; }
  if (!category) { toast('Category cannot be blank', 'error'); return; }

  try {
    if (editId) {
      // UPDATE: .eq('vendor_id', ...) guarantees we only ever touch this
      // vendor's own row (RLS products_update_vendor enforces the same).
      const { error } = await supabase
        .from('products')
        .update({ name, price, category, icon, desc, image: image || null })
        .eq('id', Number(editId))
        .eq('vendor_id', state.user.vendor_id);
      if (error) throw error;
      toast('Product updated');
    } else {
      // INSERT with a client-assigned id. nextVendorProductId() can collide when
      // the highest id belongs to a hidden product (public catalog RLS hides it)
      // or when two vendors add products concurrently — so a unique primary-key
      // violation (Postgres 23505) is retried exactly ONCE with a freshly fetched
      // id. Any other error — and any second failure — surfaces as before.
      // No upsert; an existing product is never overwritten.
      const insertProduct = (newId) => supabase
        .from('products')
        .insert({ id: newId, vendor_id: state.user.vendor_id, name, price, category, icon, desc, image: image || null, active: true });
      const isDuplicateKey = (e) => e && (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message || ''));
      let id = await nextVendorProductId();
      if (id == null) { toast('Could not create the product — please try again', 'error'); return; }
      let inserted = await insertProduct(id);
      if (inserted.error && isDuplicateKey(inserted.error)) {
        id = await nextVendorProductId(); // fresh max id before the single retry
        if (id == null) { toast('Could not create the product — please try again', 'error'); return; }
        inserted = await insertProduct(id);
      }
      if (inserted.error) throw inserted.error;
      toast('Product added');
    }
    form.reset();
    form.querySelector('input[name="id"]').value = '';
    const title = document.getElementById('vendorProductFormTitle');
    if (title) title.textContent = 'Add Product';
    await refreshVendorProducts();
    await loadCatalogFromSupabase(); // refresh the shared customer catalog cache
    render();
  } catch (err) {
    console.error('Vendor product save failed:', err);
    toast('Product save failed: ' + (err.message || 'unknown error'), 'error');
  }
}

function editVendorProduct(productId) {
  const p = (state.vendorProducts || []).find(x => x.id === Number(productId));
  if (!p) return;
  const form = document.getElementById('vendorProductForm');
  if (!form) return;
  form.querySelector('input[name="id"]').value = p.id;
  form.querySelector('input[name="name"]').value = p.name;
  form.querySelector('input[name="price"]').value = p.price;
  form.querySelector('input[name="category"]').value = p.category;
  form.querySelector('input[name="icon"]').value = p.icon;
  form.querySelector('input[name="image"]').value = p.image || '';
  form.querySelector('textarea[name="desc"]').value = p.desc || '';
  const title = document.getElementById('vendorProductFormTitle');
  if (title) title.textContent = 'Edit Product';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetVendorProductForm() {
  const form = document.getElementById('vendorProductForm');
  if (!form) return;
  form.reset();
  form.querySelector('input[name="id"]').value = '';
  const title = document.getElementById('vendorProductFormTitle');
  if (title) title.textContent = 'Add Product';
}

// Toggle availability: flips products.active for the vendor's OWN product.
async function toggleVendorProductActive(productId) {
  const p = (state.vendorProducts || []).find(x => x.id === Number(productId));
  if (!p) return;
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — availability could not be updated', 'error'); return; }
  const newActive = !(p.active !== false);
  try {
    const { error } = await supabase
      .from('products')
      .update({ active: newActive })
      .eq('id', p.id)
      .eq('vendor_id', state.user.vendor_id);
    if (error) throw error;
    toast(newActive ? 'Product is now available to customers' : 'Product is now not available to customers', 'info');
    await refreshVendorProducts();
    await loadCatalogFromSupabase();
    render();
  } catch (err) {
    console.error('Vendor product availability toggle failed:', err);
    toast('Could not update availability: ' + (err.message || 'unknown error'), 'error');
  }
}

// Delete = soft delete (active = false) with a confirmation step. Vendors
// have no products DELETE RLS policy, so the row is kept for order_items
// foreign-key integrity and simply hidden from the customer catalog.
async function deleteVendorProduct(productId) {
  const p = (state.vendorProducts || []).find(x => x.id === Number(productId));
  if (!p) return;
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — product could not be deleted', 'error'); return; }
  if (!(await DropzyyModal.confirm({ title:'Delete product', message:`Delete "${p.name}"? It will be removed from the customer menu. This cannot be undone from the vendor dashboard.`, confirmText:'Delete product', danger:true }))) return;
  try {
    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', p.id)
      .eq('vendor_id', state.user.vendor_id);
    if (error) throw error;
    toast('Product deleted');
    if (document.getElementById('vendorProductForm') && document.querySelector('#vendorProductForm input[name="id"]').value === String(p.id)) {
      resetVendorProductForm();
    }
    await refreshVendorProducts();
    await loadCatalogFromSupabase();
    render();
  } catch (err) {
    console.error('Vendor product delete failed:', err);
    toast('Delete failed: ' + (err.message || 'unknown error'), 'error');
  }
}

// ============================================
// Vendor Dashboard: views
// ============================================
function vendorOrderCard(o, activeTab) {
  const itemsHtml = o.items.map(item => `<div class="line"><span class="line__thumb">${esc(item.icon)}</span><span class="line__main"><b>${esc(item.name)}</b><small class="line__sub">× ${item.qty}</small></span><b>${money(item.price * item.qty)}</b></div>`).join('');
  // Your products subtotal = ONLY this vendor's own lines on this order
  // (price × qty). `orders.total` is deliberately NOT shown as the vendor's
  // value: it includes the ₦1,500 delivery fee and, on multi-vendor orders,
  // other vendors' items. o.items is the RLS-scoped own-lines list from
  // loadVendorDataFromSupabase().
  const mySubtotal = (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  const statusBadge = `<span class="badge badge--${o.status==='Delivered'||o.status==='Cancelled'?'info':'warn'}">${o.status}</span>`;
  const deliveryBadge = `<span class="badge badge--brand">${o.delivery_method||'rider'}</span>`;

  // Check if this is a vendor request awaiting response
  const isVendorRequest = o.request_type === 'vendor_request' && o.status === 'Order confirmed';

  // Check if this is an accepted vendor request awaiting delivery choice
  const isAwaitingDeliveryChoice = o.request_type === 'vendor_request'
    && o.status === 'Preparing'
    && o.delivery_method === 'both';

  // Actions depend on current status + delivery method.
  let actions = '';
  if (isVendorRequest) {
    // Vendor request awaiting acceptance/decline
    actions = `
      <div class="row mt-1">
        <button class="btn btn--sm" data-vendor-respond="${o.id}" data-action="accept">Accept</button>
        <button class="btn btn--ghost btn--sm" data-vendor-respond="${o.id}" data-action="decline">Decline</button>
      </div>`;
  } else if (isAwaitingDeliveryChoice) {
    // Vendor accepted request, now must choose delivery method
    const vendorObj = vendor(o.items[0]?.vendor);
    const pickupLocation = vendorObj?.pickup_location || 'Not set';

    actions = `
      <div class="card mb-2" style="background:#f8fafc; border-left:4px solid #2563eb;">
        <div class="p-3">
          <h4 class="mb-2">Choose Delivery Method</h4>
          <p class="muted small mb-2">Pickup: <b>${esc(pickupLocation)}</b> | Drop-off: <b>${esc(o.spot || 'Not set')}</b></p>

          <div class="grid grid--2 mb-2">
            <button class="btn btn--sm" data-vendor-delivery-choice="${o.id}" data-method="vendor_self">
              <div class="text-center">
                <div class="text-lg">🚶</div>
                <div class="font-medium">Self Delivery</div>
                <div class="muted xs">₦0</div>
                <div class="muted xs">I will deliver myself</div>
              </div>
            </button>
            <button class="btn btn--sm" data-vendor-delivery-choice="${o.id}" data-method="rider">
              <div class="text-center">
                <div class="text-lg">🛵</div>
                <div class="font-medium">Dropzyy Rider</div>
                <div class="muted xs">₦1,500</div>
                <div class="muted xs">Rider: ₦1,000 · Dropzyy: ₦500</div>
              </div>
            </button>
          </div>
        </div>
      </div>`;
  } else if (o.status === 'Order confirmed') {
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
    if (o.delivery_method === 'rider') {
      actions = `<button class="btn btn--sm" data-vendor-status="${o.id}" data-to="Ready for pickup">Ready for pickup</button>`;
    } else if (o.delivery_method === 'vendor_self') {
      actions = `<button class="btn btn--sm" data-vendor-status="${o.id}" data-to="Delivered">Mark delivered</button>`;
    } else {
      // 'both': the vendor must still choose rider vs self-delivery before
      // progressing — the DB only permits vendor 'Delivered' on vendor_self
      // deliveries; rider-delivery orders are completed by the rider.
      actions = `
        <div class="row mt-1">
          <button class="btn btn--sm" data-vendor-delivery="${o.id}" data-method="rider">Use rider</button>
          <button class="btn btn--sm" data-vendor-delivery="${o.id}" data-method="vendor_self">Self deliver</button>
        </div>`;
    }
  } else if (o.status === 'Ready for pickup') {
    actions = `<span class="muted small">Awaiting rider pickup</span>`;
  } else if (o.status === 'Rider assigned' || o.status === 'Picked up' || o.status === 'On the Way') {
    actions = `<span class="muted small">In transit with rider</span>`;
  }

  return `<article class="card mb-2">
    <div class="row row--between row--wrap">
      <div>
        ${statusBadge} ${deliveryBadge}
        <h3 class="mt-1">Order #${o.id}</h3>
        <p class="muted small mb-0">${o.items.length} of your item${o.items.length>1?'s':''} · Your products: <b>${money(mySubtotal)}</b> · ${esc(o.spot)}</p>
      </div>
      <div class="right">
        <span class="muted small">Your products</span><br>
        <b class="price price--lg">${money(mySubtotal)}</b>
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

  // Separate vendor requests (new vendor_request orders in 'Order confirmed') from regular orders
  const vendorRequests = orders.filter(o =>
    o.request_type === 'vendor_request' && o.status === 'Order confirmed'
  );

  // Regular pending orders (non-vendor_request or vendor_request that have been accepted)
  const regularPending = orders.filter(o =>
    o.status === 'Order confirmed' && !(o.request_type === 'vendor_request' && o.status === 'Order confirmed')
  );

  const active = orders.filter(o => ['Preparing','Ready for pickup','Rider assigned','Picked up','On the Way'].includes(o.status));
  const completed = orders.filter(o => ['Delivered','Cancelled'].includes(o.status));

  const revenue = orders
    .filter(o => o.status === 'Delivered')
    .reduce((n, o) => n + (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0), 0);
  const products = state.vendorProducts || [];

  const vendorRequestsHtml = vendorRequests.length
    ? vendorRequests.map(o => vendorOrderCard(o)).join('')
    : empty('📥','No new vendor requests','Customer requests will appear here.');

  const pendingHtml = regularPending.length
    ? regularPending.map(o => vendorOrderCard(o)).join('')
    : empty('📦','No pending orders','New orders will appear here when customers place them.');
  const activeHtml = active.length
    ? active.map(o => vendorOrderCard(o)).join('')
    : empty('⏳','No active orders','Orders you accept will appear here.');
  const completedHtml = completed.length
    ? completed.map(o => vendorOrderCard(o)).join('')
    : empty('✅','No completed orders','Delivered and cancelled orders will appear here.');

  const productsHtml = products.length
    ? products.map(p => `<tr><td>${esc(p.icon)} <b>${esc(p.name)}</b>${p.desc?`<div class="muted small">${esc(p.desc)}</div>`:''}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td><span class="badge badge--${p.active!==false?'success':'warn'}">${p.active!==false?'🟢 Available':'🔴 Not available'}</span></td><td><button class="link-btn" data-vp-edit="${p.id}">Edit</button> · <button class="link-btn" data-vp-toggle="${p.id}">${p.active!==false?'Turn off':'Turn on'}</button> · <button class="link-btn btn--danger" data-vp-delete="${p.id}">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="muted center">No products yet — add your first item with the form.</td></tr>';

  return `<section class="section container">
    <div class="page-head"><div><span class="badge badge--brand">Vendor</span><h1 class="mt-1">${esc(name)}</h1><p class="muted">Manage orders and products.</p></div><a class="btn btn--ghost btn--sm" href="#/">← Back to site</a></div>
    <div class="grid grid--stats">
      <div class="stat stat--brand"><span class="stat__label">New Requests</span><span class="stat__value">${vendorRequests.length}</span><span class="stat__hint">Awaiting your response</span></div>
      <div class="stat"><span class="stat__label">Pending</span><span class="stat__value">${regularPending.length}</span><span class="stat__hint">Awaiting action</span></div>
      <div class="stat"><span class="stat__label">Active</span><span class="stat__value">${active.length}</span><span class="stat__hint">Preparing / in transit</span></div>
      <div class="stat"><span class="stat__label">Completed</span><span class="stat__value">${completed.length}</span><span class="stat__hint">Delivered or cancelled</span></div>
      <div class="stat"><span class="stat__label">Product Revenue</span><span class="stat__value">${money(revenue)}</span><span class="stat__hint">Your own items on delivered orders · excludes the ₦1,500 delivery fee</span></div>
    </div>
    <div class="page-head mt-3"><div><h2>New Vendor Requests</h2><p>Accept or decline customer requests.</p></div></div>${vendorRequestsHtml}
    <div class="page-head mt-3"><div><h2>Pending Orders</h2><p>Accept or reject incoming orders.</p></div></div>${pendingHtml}
    <div class="page-head mt-3"><div><h2>Active Orders</h2><p>Orders you are preparing or delivering.</p></div></div>${activeHtml}
    <div class="page-head mt-3"><div><h2>Completed Orders</h2><p>Delivered and cancelled history.</p></div></div>${completedHtml}
    <div class="page-head mt-3"><div><h2>Products</h2><p>Add, edit or toggle the availability of your menu items.</p></div></div>
    ${state.vendorLoadError ? `<div class="card mb-2"><b>Could not load your products:</b> <span class="muted">${state.vendorLoadError}</span></div>` : ''}
    <div class="split mt-1">
      <form class="card stack" id="vendorProductForm">
        <div class="card__head"><h3 id="vendorProductFormTitle">Add Product</h3><button class="link-btn" type="button" id="vendorProductClear">Clear</button></div>
        <input type="hidden" name="id">
        <div class="form-grid">
          <div class="field"><label for="vpName">Product name</label><input class="input" name="name" id="vpName" required placeholder="e.g. Jollof Rice"></div>
          <div class="field"><label for="vpPrice">Price (₦)</label><input class="input" name="price" id="vpPrice" type="number" min="0" step="0.01" required placeholder="1000"></div>
          <div class="field"><label for="vpCategory">Category</label><input class="input" name="category" id="vpCategory" required placeholder="Food"></div>
          <div class="field"><label for="vpIcon">Icon</label><input class="input" name="icon" id="vpIcon" value="🍽️" maxlength="8"></div>
          <div class="field col-2"><label for="vpImage">Image URL (optional)</label><input class="input" name="image" id="vpImage" placeholder="https://… (shown when available, else the icon)"></div>
          <div class="field col-2"><label for="vpDesc">Description</label><textarea class="textarea" name="desc" id="vpDesc" placeholder="A short description for customers."></textarea></div>
        </div>
        <button class="btn btn--block" type="submit">Save Product</button>
      </form>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>${productsHtml}</tbody></table></div></div>
    </div>
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
  const checkoutItems = cartItems();
  const vendorOnly = checkoutItems.length > 0 && checkoutItems.every(isVendorProduct);
  if (vendorOnly) {
    return `<section class="section container"><div class="page-head"><div><h1>Send vendor request</h1><p>No payment is made on Dropzyy. The vendor will contact you directly.</p></div></div><div class="split"><form id="checkoutForm" class="card stack"><div class="card__head"><h3>Delivery details</h3><span class="badge badge--brand">Campus only</span></div><div class="form-grid"><div class="field"><label for="checkoutLocation">Hostel / Delivery location</label><select class="select" name="location" id="checkoutLocation" required><option value="" disabled selected>Select your hostel</option>${HOSTELS.map(g=>`<optgroup label="${esc(g.group)}">${g.items.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="field"><label for="checkoutSpot">Room, block or landmark</label><input required class="input" name="spot" id="checkoutSpot" placeholder="e.g. Room B12, block C"></div></div><button class="btn btn--block btn--lg mt-1" type="submit">Send Request</button><p class="muted xs center mb-0">The vendor will contact you to arrange product payment directly.</p></form><aside class="card sticky-side"><h3>Your request</h3>${checkoutItems.map(x=>`<div class="line"><span class="line__thumb">${esc(x.icon)}</span><span class="line__main"><b>${esc(x.name)}</b><small class="line__sub">× ${x.qty}</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="totals mt-1"><div><span>Dropzyy payment</span><span>₦0</span></div><div><span>Delivery</span><span>Arranged with vendor</span></div></div></aside></div></section>`;
  }
  const mixedCart = checkoutItems.some(isVendorProduct) && checkoutItems.some(item => !isVendorProduct(item));
  if (mixedCart) {
    const restaurantItems = checkoutItems.filter(item => !isVendorProduct(item));
    const vendorItems = checkoutItems.filter(isVendorProduct);
    const restaurantSubtotal = restaurantItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const restaurantTotal = restaurantSubtotal + DELIVERY_FEE;
    const renderCheckoutItem = x => `<div class="line"><span class="line__thumb">${esc(x.icon)}</span><span class="line__main"><b>${esc(x.name)}</b><small class="line__sub">× ${x.qty}</small></span><b>${money(x.price*x.qty)}</b></div>`;
    return `<section class="section container"><div class="page-head"><div><h1>Checkout & vendor requests</h1><p>Your cart contains two separate flows.</p></div></div><div class="split"><form id="checkoutForm" class="card stack"><div class="card__head"><h3>Restaurant / Bookshop</h3><span class="badge badge--success">Customer payment</span></div>${restaurantItems.map(renderCheckoutItem).join('')}<p class="muted small">These items use normal Dropzyy checkout. Customer payment applies here.</p><div class="totals"><div><span>Restaurant/Bookshop total</span><span>${money(restaurantTotal)}</span></div></div><div class="divider"></div><div class="card__head"><h3>Vendor requests</h3><span class="badge badge--info">No Dropzyy product payment</span></div>${vendorItems.map(renderCheckoutItem).join('')}<p class="muted small">These items are requests only. The vendor will contact you directly, and product payment is handled privately with the vendor. Any later vendor delivery is paid by the vendor.</p><div class="divider"></div><div class="card__head"><h3>Delivery details</h3><span class="badge badge--brand">Campus only</span></div><div class="form-grid"><div class="field"><label for="checkoutLocation">Hostel / Delivery location</label><select class="select" name="location" id="checkoutLocation" required><option value="" disabled selected>Select your hostel</option>${HOSTELS.map(g=>`<optgroup label="${esc(g.group)}">${g.items.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="field"><label for="checkoutSpot">Room, block or landmark</label><input required class="input" name="spot" id="checkoutSpot" placeholder="e.g. Room B12, block C"></div></div><button class="btn btn--block btn--lg mt-1" type="submit">Pay ${money(restaurantTotal)} & send vendor requests</button><p class="muted xs center mb-0">Only restaurant/Bookshop items are paid through Dropzyy. Vendor items create requests only.</p></form></div></section>`;
  }
  const fee = DELIVERY_FEE;
  const total = cartTotal()+fee;
  return `<section class="section container"><div class="page-head"><div><h1>Checkout</h1><p>Where should your order meet you?</p></div></div><div class="split"><form id="checkoutForm" class="card stack"><div class="card__head"><h3>Delivery details</h3><span class="badge badge--brand">Campus only</span></div><div class="form-grid"><div class="field"><label for="checkoutLocation">Hostel / Delivery location</label><select class="select" name="location" id="checkoutLocation" required><option value="" disabled selected>Select your hostel</option>${HOSTELS.map(g=>`<optgroup label="${esc(g.group)}">${g.items.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="field"><label for="checkoutSpot">Room, block or landmark</label><input required class="input" name="spot" id="checkoutSpot" placeholder="e.g. Room B12, block C"></div></div><div class="divider"></div><div class="card__head"><h3>Pay securely</h3><span class="badge badge--success">🔒 Secure</span></div><div class="radio-cards"><label class="radio-card"><input type="radio" name="payment" checked> <span>💳 Card / Transfer</span></label><label class="radio-card"><input type="radio" name="wallet-soon" disabled> <span>👛 Campus wallet</span> <span class="muted small">Coming soon</span></label></div><button class="btn btn--block btn--lg mt-1" type="submit">Pay ${money(total)} & place order</button><p class="muted xs center mb-0">You'll be redirected to Paystack to complete payment securely.</p></form><aside class="card sticky-side"><h3>Your order</h3>${cartItems().map(x=>`<div class="line"><span class="line__thumb">${esc(x.icon)}</span><span class="line__main"><b>${esc(x.name)}</b><small class="line__sub">× ${x.qty}</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="totals mt-1"><div><span>Delivery</span><span>${money(fee)}</span></div><div class="totals__grand"><span>Total</span><span>${money(total)}</span></div></div></aside></div></section>`;
}

// F18: lightweight skeleton card for async views. Uses the existing shimmer
// keyframes; purely presentational (aria-hidden) so it is never announced.
function skeletonCard(rows) {
  const n = typeof rows === 'number' && rows > 0 ? rows : 3;
  let bars = '';
  for (let i = 0; i < n; i++) {
    bars += '<div class="sk-row"><div class="sk sk--thumb"></div>' +
            '<div class="sk-lines"><div class="sk"></div><div class="sk sk--w60"></div></div></div>';
  }
  return `<div class="card skeleton-block" aria-hidden="true">${bars}</div>`;
}

async function orders() {
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Loading your orders…</p></div></div>${skeletonCard()}</section>`;
  }
  await ensureOrdersLoaded();
  if (state.ordersLoadError && !state.orders.length) {
    return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you’ve ordered on campus.</p></div></div><div class="card"><b>Could not load your orders</b><span class="muted">Showing offline data if available. Please check your connection and try again.</span></div></section>`;
  }
  if (!state.orders.length) {
    return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you’ve ordered on campus.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">Order again</a></div>${empty('📦','No orders yet','When you place an order, it will appear here.','<a class="btn mt-1" href="#/browse">Browse campus finds</a>')}</section>`;
  }
  // Always render newest-first by created_at (covers in-session drift after a
  // new order is placed or refunds are refreshed).
  const sortedOrders = sortOrdersNewestFirst(state.orders);
  // Load refund data up front so each card can show a refund action or status.
  if (typeof supabase !== 'undefined' && supabase) await loadRefundsFromSupabase();
  const cards = sortedOrders.map(o => {
    const vnames = orderVendorNames(o);
    const cancellable = ['Order confirmed','Preparing'].includes(o.status);
    const reorderable = ['Delivered','Rated'].includes(o.status);
    const riderLine = o.rider_name ? ` · 🛵 ${esc(o.rider_name)}` : (o.rider_id ? ' · 🛵 Rider assigned' : '');
    const items = (o.items || []).map(item =>
      `<div class="line"><span class="line__thumb">${esc(item.icon)}</span><span class="line__main"><b>${esc(item.name)}</b><small class="line__sub">× ${item.qty}</small></span><b>${money(item.price*item.qty)}</b></div>`
    ).join('');
    const cancelBtn = cancellable ? `<br><button class="link-btn small" data-cancel="${o.id}">Cancel order</button>` : '';
    const reorderBtn = reorderable ? `<br><button class="link-btn small" data-reorder="${o.id}">🔁 Reorder</button>` : '';
    const vendorDelivery = o.request_type === 'vendor_request';
    // Refund action/status for this card. Mirrors orderView eligibility exactly:
    // a successful payment + no existing/terminal refund. Request amount is NEVER
    // sent from the client — the backend is authoritative.
    const existingRefund = getOrderRefund(o.dbId);
    const refundUi = existingRefund
      ? `<br><span class="muted small">Refund: ${esc(refundStatusLabel(existingRefund.status))}</span>`
      : (o.payment_status === 'success'
          ? `<br><button class="link-btn small" data-refund-request="${esc(o.dbId)}">Request Refund</button>`
          : '');
    if (vendorDelivery) {
      return `<article class="card"><div class="row row--between row--wrap"><div>${customerOrderStatusBadge(o)}<h3 class="mt-1">Order #${o.id}</h3><p class="muted small mb-0">${esc(vnames)} · ${(o.items||[]).length} item${(o.items||[]).length>1?'s':''} · ${o.created}</p><p class="muted small mb-0">📍 ${esc(o.spot||'No delivery location')}${riderLine}</p></div><div class="right"><b class="price price--lg">${money(o.subtotal)} product value</b><br>${vendorDeliveryStatusMessage(o)}<a class="link-btn small" href="#/order/${o.id}">Details</a> · <a class="link-btn small" href="#/track/${o.id}">Track order →</a>${refundUi}${reorderBtn}${cancelBtn}</div></div><div class="divider"></div>${items}</article>`;
    }
    return `<article class="card"><div class="row row--between row--wrap"><div>${customerOrderStatusBadge(o)}<h3 class="mt-1">Order #${o.id}</h3><p class="muted small mb-0">${esc(vnames)} · ${(o.items||[]).length} item${(o.items||[]).length>1?'s':''} · ${o.created}</p><p class="muted small mb-0">📍 ${esc(o.spot||'No delivery location')}${riderLine}</p></div><div class="right"><b class="price price--lg">${money(o.subtotal)} + ${money(o.fee)} delivery</b><b class="price price--lg">${money(o.total)}</b><br><a class="link-btn small" href="#/order/${o.id}">Details</a> · <a class="link-btn small" href="#/track/${o.id}">Track order →</a>${o.payment_status==='pending' && o.status==='Order confirmed' ? ` · <a class="link-btn small" href="#/pay/${o.id}">Pay →</a>` : ''}${refundUi}${reorderBtn}${cancelBtn}</div></div><div class="divider"></div>${items}</article>`;
}).join('');
  return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you've ordered on campus.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">Order again</a></div><div class="stack">${cards}</div></section>`;
}

// ============================================
// Vendor Requests View (Customer)
// ============================================
async function vendorRequestsView() {
  if (!state.user) { location.hash = '#/login'; return ''; }
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>My Vendor Requests</h1><p>Loading your requests...</p></div></div>${skeletonCard()}</section>`;
  }
  await ensureOrdersLoaded();
  await loadRefundsFromSupabase();

  // Filter for vendor_request orders only
  const vendorRequests = state.orders.filter(o => o.request_type === 'vendor_request');
  if (!vendorRequests.length) {
    return `<section class="section container"><div class="page-head"><div><h1>My Vendor Requests</h1><p>Order requests you've sent to vendors.</p></div></div>${empty('📦','No vendor requests yet','When you request products from a vendor, they will appear here.','<a class="btn mt-1" href="#/browse">Browse campus finds</a>')}</section>`;
  }

  const sortedRequests = sortOrdersNewestFirst(vendorRequests);
  const cards = sortedRequests.map(o => {
    const vnames = orderVendorNames(o);
    const items = (o.items || []).map(item =>
      `<div class="line"><span class="line__thumb">${esc(item.icon)}</span><span class="line__main"><b>${esc(item.name)}</b><small class="line__sub">× ${item.qty}</small></span><b>${money(item.price*item.qty)}</b></div>`
    ).join('');

    let statusBadge = customerOrderStatusBadge(o);
    let statusInfo = '';
    const isVendorSelf = o.delivery_method === 'vendor_self';
    const isVendorRider = o.delivery_method === 'rider' && o.request_type === 'vendor_request';
    if (o.status === 'Order confirmed') {
      statusInfo = '<p class="muted small">Vendor has not yet responded.</p>';
    } else if (o.status === 'Preparing') {
      if (o.delivery_method === 'both') {
        statusInfo = '<p class="muted small">Vendor accepted — choosing delivery method.</p>';
      } else if (isVendorSelf) {
        statusInfo = '<p class="muted small">Vendor accepted and is preparing your order for self-delivery.</p>';
      } else if (isVendorRider) {
        statusInfo = '<p class="muted small">Vendor accepted and is preparing your order. A rider will be requested.</p>';
      } else {
        statusInfo = '<p class="muted small">Vendor accepted and is preparing your order.</p>';
      }
    } else if (o.status === 'Cancelled') {
      statusInfo = '<p class="muted small">Vendor declined this request.</p>';
    } else if (o.status === 'Delivered') {
      statusInfo = '<p class="muted small">Order completed.</p>';
    } else if (o.status === 'Ready for pickup') {
      if (isVendorSelf) {
        statusInfo = '<p class="muted small">Vendor is on the way to deliver your order.</p>';
      } else {
        statusInfo = '<p class="muted small">Ready for rider pickup.</p>';
      }
    } else if (o.status === 'Rider assigned' || o.status === 'Picked up' || o.status === 'On the Way') {
      statusInfo = '<p class="muted small">Your order is with a rider.</p>';
    }
    if (isVendorSelf || isVendorRider) statusInfo += vendorDeliveryStatusMessage(o, true);

    const cancelBtn = ['Order confirmed','Preparing'].includes(o.status)
      ? `<br><button class="link-btn small" data-cancel="${o.id}">Cancel request</button>` : '';

    return `<article class="card"><div class="row row--between row--wrap"><div>${statusBadge}<h3 class="mt-1">Request #${o.id}</h3><p class="muted small mb-0">${esc(vnames)} · ${(o.items||[]).length} item${(o.items||[]).length>1?'s':''} · ${o.created}</p><p class="muted small mb-0">📍 ${esc(o.spot||'No delivery location')}</p></div><div class="right"><b class="price price--lg">${money(o.subtotal)}</b><br><a class="link-btn small" href="#/order/${o.id}">Details</a>${cancelBtn}</div></div><div class="divider"></div>${items}<div class="mt-2">${statusInfo}</div></article>`;
  }).join('');

  return `<section class="section container"><div class="page-head"><div><h1>My Vendor Requests</h1><p>Order requests you've sent to vendors. Payment is arranged directly with each vendor.</p></div></div><div class="stack">${cards}</div></section>`;
}
// ---- Track page: live status update for the single tracked order --------------
// Two complementary mechanisms, both scoped to ONE order (the one being tracked):
//   1. Supabase Realtime (primary): postgres_changes UPDATE on orders where
//      id = <dbId>. RLS already restricts the customer to their own orders, so the
//      user never receives another customer's order data, and no new permissions are
//      granted. The channel is cleaned up when the track route is left.
//   2. Safety-net poll (fallback): a single-order Supabase fetch every ~20s while
//      the track page is open, in case Realtime broadcasts are unavailable or a
//      status change came from a source that did not broadcast (e.g. an admin edit).
// Both mechanisms update only status / payment_status / rider_id on the in-memory
// order and then re-render the track view (not the whole app). rider_name and
// rider_phone are intentionally NOT re-resolved here — they remain as loaded by
// loadOrdersFromSupabase() — because the orders table does not hold them. If a rider
// is assigned while the track page is open the status still advances; the rider name
// will be picked up on the next full load or page reload. No schema, RLS, or auth
// changes. No broad/public subscription. No schema change at all.

let productsChannel = null;
let trackChannel = null;
let trackPollTimer = null;

function clearTrackSubscription() {
  if (trackChannel && typeof supabase !== 'undefined' && supabase) {
    try { supabase.removeChannel(trackChannel); } catch (e) { /* ignore */ }
    trackChannel = null;
  }
  if (trackPollTimer) { clearTimeout(trackPollTimer); trackPollTimer = null; }
}

async function refreshTrackedOrder(dbId) {
  if (typeof supabase === 'undefined' || !supabase) return false;
  let data, error;
  try {
    const r = await supabase.from('orders').select('*').eq('id', dbId).single();
    data = r.data; error = r.error;
  } catch (e) { console.error('Track order refresh query failed:', e); return false; }
  if (error || !data) return false;
  const idx = state.orders.findIndex(o => o.dbId === dbId);
  if (idx < 0) return false;
  const prev = state.orders[idx];
  const ns = data.status || prev.status;
  const nps = data.payment_status || prev.payment_status;
  const nrider = data.rider_id != null ? data.rider_id : prev.rider_id;
  if (prev.status === ns && prev.payment_status === nps && prev.rider_id === nrider) return false;
  state.orders[idx] = {
    ...prev,
    status: ns,
    payment_status: nps,
    rider_id: nrider,
    createdAt: data.created_at || prev.createdAt,
  };
  return true;
}

function startTrackSubscription(dbId) {
  clearTrackSubscription();
  if (typeof supabase === 'undefined' || !supabase) return;
  const order = state.orders.find(o => o.dbId === dbId);
  const currentStatus = order ? order.status : null;

  // Realtime (primary): listen for UPDATEs on this specific order only.
  try {
    trackChannel = supabase
      .channel('track:' + dbId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: 'id=eq.' + dbId
      }, (payload) => {
        const prev = state.orders.find(o => o.dbId === dbId);
        if (!prev) return;
        const next = payload.new;
        const ns = next.status || prev.status;
        const nps = next.payment_status || prev.payment_status;
        const nrider = next.rider_id != null ? next.rider_id : prev.rider_id;
        if (prev.status === ns && prev.payment_status === nps && prev.rider_id === nrider) return;
        const idx = state.orders.indexOf(prev);
        if (idx < 0) return;
        state.orders[idx] = { ...prev, status: ns, payment_status: nps, rider_id: nrider };
        render();
      })
      .subscribe();
  } catch (e) {
    console.error('Track Realtime subscription failed:', e);
    trackChannel = null;
  }

  // Safety-net poll: refresh the single tracked order from Supabase ~every 20s.
  const poll = async () => {
    if (!location.hash.startsWith('#/track/')) return;
    try {
      const changed = await refreshTrackedOrder(dbId);
      if (changed) render();
    } catch (e) { console.error('Track poll refresh failed:', e); }
    trackPollTimer = setTimeout(poll, 20000);
  };
  trackPollTimer = setTimeout(poll, 20000);
}

async function track(id) {
  await ensureOrdersLoaded();
  const o = state.orders.find(x=>x.id===id);
  if (!o) return notFound();
  const stages = ['Order confirmed','Preparing','Ready for pickup','Rider assigned','Picked up','On the Way','Delivered'];
  const stageIndex = { 'Order confirmed':0,'Preparing':1,'Ready for pickup':2,'Rider assigned':3,'Picked up':4,'On the Way':5,'Delivered':6 };
  const current = o.status==='Rated' ? 6 : (stageIndex[o.status] ?? 0);
  const cancelled = o.status === 'Cancelled';
  const vendorNames = orderVendorNames(o);
  const riderInitial = o.rider_name ? o.rider_name.charAt(0).toUpperCase() : '🚵';
  const riderTitle = o.rider_name || (o.rider_id ? 'Rider assigned' : 'No rider assigned yet');
  // The assigned rider's phone is shown only during an ACTIVE delivery
  // (Rider assigned → On the Way). This is already permitted by RLS
  // (riders_select_order_assigned + profiles_select_rider_details) and is
  // intentionally hidden once the order is completed so contact details are
  // not left exposed unnecessarily.
  const riderIsActive = ['Rider assigned', 'Picked up', 'On the Way'].includes(o.status);
  const riderMeta = o.rider_name
    ? (riderIsActive && o.rider_phone ? `Your delivery rider · 📞 ${esc(o.rider_phone)}` : 'Your delivery rider')
    : 'A rider will be assigned once your order is ready';
  const canCancel = ['Order confirmed','Preparing'].includes(o.status);
  // Presentation-only flag: when payment is still pending the stage list
  // (and stageIndex) keep the internal 'Order confirmed' workflow value,
  // but the timeline DISPLAYS the first step as "Awaiting payment".
  const payPending = o.payment_status === 'pending' && o.status === 'Order confirmed';

  // Rider rating: only for the customer's own DELIVERED order that had an
  // assigned rider (rider-delivery only — vendor-self orders have no rider).
  // The existing rider_ratings RLS (rider_ratings_insert_own) re-validates
  // ownership/Delivered/assigned-rider server-side, and UNIQUE(order_id,
  // reviewer_id) plus the client-side state.ratingCompleteOrder guard prevent
  // duplicate submissions. 'Rated' order status also hides the form.
  let ratingUi = '';
  if (o.rider_id && o.status === 'Delivered') {
    if (state.ratingCompleteOrder === o.dbId) {
      ratingUi = `<div class="card"><div class="row row--between row--wrap"><div><b>Your rating was submitted</b><div class="small muted">Thanks for rating your rider!</div></div><span class="badge badge--success">★ Rated</span></div></div>`;
    } else {
      ratingUi = `
      <div class="card">
        <h3>Rate your rider</h3>
        <p class="muted small">How was your delivery from ${esc(riderTitle)}? Tap a star to choose, then submit.</p>
        <form id="riderRatingForm" class="stack mt-1">
          <input type="hidden" name="orderId" value="${o.dbId}">
          <input type="hidden" name="riderId" value="${o.rider_id}">
          <div class="stars stars--input" id="ratingStars">
            ${[1,2,3,4,5].map(n=>`<button type="button" data-star-order="${o.dbId}" data-rating="${n}" aria-label="${n} star${n>1?'s':''}">★</button>`).join('')}
          </div>
          <div class="field"><label>Comment (optional)</label><textarea class="textarea" name="review" maxlength="500" placeholder="Tell others about your delivery experience…"></textarea></div>
          <button class="btn" type="submit">Submit rating</button>
        </form>
      </div>`;
    }
  }

  // ---- Track page live-update subscription ----------------------------------
  // Start the Realtime + safety-net poll for this specific order. startTrackSubscription()
  // is idempotent (it clears any previous subscription first), so re-renders while the
  // track page is open do not create duplicate subscriptions. The subscription is cleaned
  // up automatically when the route leaves #/track/ (see the hashchange wrapper below).
  startTrackSubscription(o.dbId);

  return `<section class="section container"><a href="#/orders" class="muted small">← My orders</a><div class="split mt-1"><div class="card">${customerOrderStatusBadge(o)}<h1 class="mt-1">Order #${o.id}</h1><p class="muted">From ${esc(vendorNames)} · Delivering to ${esc(o.spot || 'your location')}</p>${cancelled?`<div class="empty mt-3"><div class="empty__icon">🚫</div><b>Order cancelled</b><span>This order was cancelled and will not be delivered.</span></div>`:`<div class="timeline mt-3">${stages.map((s,i)=>`<div class="tl ${i<current?'tl--done':i===current?'tl--now':''}"><span class="tl__dot">${i<current?'✓':i===current?'●':'○'}</span><div><b>${(s==='Order confirmed' && payPending)?'Awaiting payment':s}</b><small>${i<=current ? (i===current?(payPending?'Payment not confirmed yet':'In progress now'):'Completed'):'Waiting for update'}</small></div></div>`).join('')}</div>`}${canCancel?`<button class="btn btn--ghost btn--block mt-2" data-cancel="${o.id}">Cancel order</button><p class="muted xs center mt-1 mb-0">You can cancel until the vendor marks it ready.</p>`:''}</div><aside class="card sticky-side"><h3>Your rider</h3><div class="row mt-1"><span class="avatar avatar--lg">${esc(riderInitial)}</span><div><b>${esc(riderTitle)}</b><div class="small muted">${esc(riderMeta)}</div></div></div><div class="divider"></div><p class="small muted">Delivery location</p><b>${esc(o.spot || '—')}</b><p class="small muted mt-2">Delivery method</p><b>${o.delivery_method==='vendor_self'?'Delivered by the vendor':'Campus rider'}</b>${riderIsActive && o.rider_phone ? `<div class="divider"></div><p class="small muted">Contact for this delivery</p><b>📞 ${esc(o.rider_phone)}</b><p class="muted xs mb-0 mt-1">Use it only to coordinate this delivery.</p>` : ''}${['Delivered','Rated'].includes(o.status)?`<button class="btn btn--block mt-2" data-reorder="${o.id}">🔁 Reorder</button>`:''}</aside></div>${ratingUi?`<div class="mt-3">${ratingUi}</div>`:''}</section>`;
}
// ============================================
// Order details view (ACTION 9)
// ============================================
// Full receipt-style view of a single past order: items with quantities, the
// price actually paid (from order_items), the CURRENT catalog price when it
// differs, subtotal, the flat ₦1,500 delivery fee, total, status, delivery
// method, vendor(s) and the placed-at timestamp. Loading / not-found / empty
// states mirror the orders() view.
async function orderView(id) {
  if (!state.user) { location.hash = '#/login'; return ''; }
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>Order details</h1><p>Loading your order…</p></div></div>${skeletonCard()}</section>`;
  }
  await ensureOrdersLoaded();
  const o = state.orders.find(x=>x.id===id);
  if (!o) return notFound();
  const items = o.items || [];
  const vnames = orderVendorNames(o);
  const canReorder = ['Delivered','Rated'].includes(o.status);
  const subtotal = o.subtotal != null ? o.subtotal : items.reduce((n,it)=>n+(it.price||0)*(it.qty||0),0);
  const fee = o.fee != null ? o.fee : DELIVERY_FEE;
  const total = o.total != null ? o.total : subtotal + fee;
  const placedAt = o.createdAt ? formatFullDate(o.createdAt) : (o.created || '—');
  const rows = items.length ? items.map(it => {
    const p = product(it.id);
    const ordered = it.price != null ? it.price : (p ? p.price : null);
    const changed = p && ordered != null && p.price !== ordered;
    return `<tr>
      <td><b>${esc(p ? p.name : (it.name || `Item #${it.id}`))}</b>${p ? `<div class="small muted">${esc(p.category || '')}</div>` : '<div class="small muted">No longer available</div>'}</td>
      <td>× ${it.qty || 0}</td>
      <td>${ordered != null ? money(ordered) : '—'}${changed ? `<div class="small muted">Now ${money(p.price)}</div>` : ''}</td>
      <td><b>${ordered != null ? money(ordered * (it.qty || 0)) : '—'}</b></td>
    </tr>`;
  }).join('') : `<tr><td colspan="4" class="muted center">No items recorded for this order.</td></tr>`;
  const badge = o.status==='Delivered' || o.status==='Rated' ? 'success' : o.status==='Cancelled' ? 'danger' : 'info';
  // Refund UI for this order
  await loadRefundsFromSupabase();
  const existingRefund = getOrderRefund(o.dbId);
  const refundTerminal = existingRefund && ['processed','failed','rejected'].includes(existingRefund.status);
  const canRequestRefund = o.payment_status === 'success' && !refundTerminal;
  let refundUi = '';
  if (existingRefund) {
    refundUi = `<div class="card mt-2"><div class="card__head"><h3 class="mb-0">Refund status</h3><span class="badge ${refundStatusBadgeClass(existingRefund.status)}">${esc(refundStatusLabel(existingRefund.status))}</span></div><p class="muted small mb-0">Amount: <b>${money(existingRefund.amount)}</b></p>${existingRefund.reason ? `<p class="muted small mt-1 mb-0">Reason: ${esc(existingRefund.reason)}</p>` : ''}${existingRefund.gateway_refund_id ? `<p class="muted xs mt-1 mb-0">Reference: ${esc(existingRefund.gateway_refund_id)}</p>` : ''}<p class="muted xs mt-1 mb-0">Requested: ${esc(formatFullDate(existingRefund.created_at))}</p></div>`;
  } else if (canRequestRefund) {
    refundUi = `<div class="card mt-2"><h3 class="mb-0">Request a refund</h3><p class="muted small">If there's a problem with this order, you can request a full refund. All refunds are reviewed by our team.</p><button class="btn btn--block" data-refund-request="${esc(o.dbId)}">Request refund</button></div>`;
  }
  return `<section class="section container"><a href="#/orders" class="muted small">← My orders</a><div class="split mt-1"><div class="card stack">
    <div class="card__head"><div><h3 class="mb-0">Order #${esc(o.id)}</h3><span class="muted small">Placed ${esc(placedAt)}</span></div>${customerOrderStatusBadge(o)}</div>
    <p class="muted small mb-0">🏪 ${esc(vnames)} · ${o.delivery_method==='vendor_self'?'Delivered by the vendor':'Campus rider delivery'} · 📍 ${esc(o.spot || 'No delivery location')}${o.rider_name ? ` · 🛵 ${esc(o.rider_name)}` : ''}</p>
    ${o.request_type === 'vendor_request' ? vendorDeliveryStatusMessage(o, true) : ''}
    <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>${o.request_type === 'vendor_request' ? (o.delivery_method === 'vendor_self' ? 'Delivery: Vendor self-delivery — no Dropzyy delivery fee' : 'Vendor delivery fee — ₦1,500 (paid by vendor)') : 'Delivery fee'}</span><span>${o.request_type === 'vendor_request' ? '' : money(fee)}</span></div><div class="totals__grand"><span>Total</span><span>${money(total)}</span></div></div>
    <p class="muted xs mb-0">Prices shown are what you paid at order time. “Now” notes highlight where today's catalog price has changed.</p>
    ${refundUi}
  </div>
  <aside class="card sticky-side stack">
    <h3 class="mb-0">Order actions</h3>
    <a class="btn btn--ghost btn--block" href="#/track/${esc(o.id)}">Track order</a>
    ${canReorder ? `<button class="btn btn--block" data-reorder="${esc(o.id)}">🔁 Reorder</button><p class="muted xs center mb-0">Rebuilds your cart at today's prices — unavailable items are skipped.</p>` : `<p class="muted xs mb-0">Reordering is available for completed (delivered) orders.</p>`}
    <div class="divider"></div>
    <div><span class="muted small">Delivery location</span><div><b>${esc(o.spot || '—')}</b></div></div>
    <div><span class="muted small">Product payment status</span><div>${moneyStatusBadge(o.payment_status || 'pending')}</div></div>
    ${o.request_type === 'vendor_request' && o.delivery_method === 'rider' ? `<div><span class="muted small">Vendor delivery payment</span>${vendorDeliveryStatusMessage(o, true)}</div>` : ''}
    <div><span class="muted small">Placed</span><div><b>${esc(placedAt)}</b></div></div>
  </aside></div></section>`;
}

// ============================================
// Reorder (ACTION 9)
// ============================================
// Rebuilds the cart from a previous Delivered/Rated order using the CURRENT
// catalog — prices and availability come from live products, never from the
// historical order_items rows. Items that no longer resolve in the live
// catalog (deleted, deactivated by the vendor/admin, or dropped by the
// active=true customer query) are skipped and clearly reported — they are
// never silently added.
function reorder(orderId) {
  if (!state.user) { toast('Please sign in to reorder', 'info'); location.hash = '#/login'; return; }
  const o = state.orders.find(x => x.id === orderId);
  if (!o) { toast('Order not found', 'error'); return; }
  if (!['Delivered', 'Rated'].includes(o.status)) { toast('Only completed orders can be reordered', 'info'); return; }
  const items = o.items || [];
  if (!items.length) { toast('This order has no items to reorder', 'info'); return; }
  const merged = new Map();   // product id -> qty (duplicate lines combined)
  const unavailable = [];
  items.forEach(it => {
    const p = product(it.id);
    if (!p || !p.price) { unavailable.push(it.name || `item #${it.id}`); return; }
    merged.set(p.id, (merged.get(p.id) || 0) + (it.qty || 1));
  });
  if (!merged.size) {
    toast('None of the items in this order are available anymore', 'error');
    return;
  }
  // Merge into the existing cart rather than wiping it.
  merged.forEach((qty, id) => {
    const existing = state.cart.find(x => x.id === id);
    if (existing) existing.qty += qty; else state.cart.push({ id, qty });
  });
  save();
  const shown = unavailable.slice(0, 3).join(', ');
  const skippedNote = unavailable.length
    ? ` Skipped ${unavailable.length} unavailable item${unavailable.length > 1 ? 's' : ''}: ${shown}${unavailable.length > 3 ? ` and ${unavailable.length - 3} more` : ''}.`
    : '';
  toast(`Added ${merged.size} item${merged.size > 1 ? 's' : ''} to your cart at today's prices.${skippedNote}`, unavailable.length ? 'info' : 'success');
  location.hash = '#/cart';
}

function auth(kind) { const login = kind==='login'; return `<section class="container"><div class="auth-wrap"><div class="card"><div class="center"><span class="brand__logo" style="display:inline-grid">🛵</span><h1 class="mt-1">${login?'Welcome back':'Create your account'}</h1><p class="muted">${login?'Sign in to order, track and earn.':'Join Dropzyy to order, track and earn.'}</p></div><form id="authForm" class="stack mt-2"><div class="field"><label for="authEmail">University email</label><input required class="input" type="email" name="email" id="authEmail" placeholder="you@dropzyy.app"></div>${!login?'<div class="field"><label for="authName">Full name</label><input required class="input" name="name" id="authName" placeholder="Your full name"></div><div class="field"><label for="authPhone">Phone (optional)</label><input class="input" name="phone" id="authPhone" placeholder="080..."></div><div class="field"><label for="authHostel">Hostel / Residence (optional)</label><input class="input" name="hostel" id="authHostel" placeholder="e.g. Adams Hall"></div>':''}<div class="field"><label for="authPassword">Password</label><input required class="input" type="password" name="password" id="authPassword" placeholder="••••••••" autocomplete="${login?'current-password':'new-password'}"${login?'':' aria-describedby="authPasswordHint"'}${login?'':'<small id="authPasswordHint">At least 6 characters.</small>'}</div>${!login?'<div class="field"><label for="authConfirmPassword">Confirm password</label><input required class="input" type="password" name="confirmPassword" id="authConfirmPassword" placeholder="Re-enter your password" autocomplete="new-password"></div>':''}<button class="btn btn--block btn--lg" type="submit">${login?'Sign in':'Create student account'}</button></form><p class="center small muted mt-2 mb-0">${login?'New here? <a class="link-btn" href="#/register">Create an account</a>':'Already have an account? <a class="link-btn" href="#/login">Sign in</a>'}</p></div></div></section>`; }

// ============================================
// Customer Profile
// ============================================
// Shows full name, email (read-only), phone and hostel. Phone and hostel are
// editable and saved to the existing profiles table via RLS
// (profiles_update_own: id = auth.uid(); the prevent_profile_role_escalation
// trigger blocks any role/id/vendor_id tampering). Email is read-only because
// changing it requires Supabase auth email-change flows that are not part of
// this app's auth architecture. state.user is refreshed after a successful
// save. Loading / success / error states are shown.
function profile() {
  if (!state.user) { location.hash = '#/login'; return ''; }
  if (state.profileLoading) {
    return `<section class="section container"><div class="page-head"><div><h1>My profile</h1><p>Loading your details…</p></div></div><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
  }
  const u = state.user;
  const phone = u.phone || '';
  const hostel = u.hostel || '';
  return `<section class="section container">
    <div class="page-head"><div><h1>My profile</h1><p>Manage your personal details.</p></div><a class="btn btn--ghost btn--sm" href="#/">← Back to site</a></div>
    ${state.profileError ? `<div class="card mb-2"><b>Could not load your profile:</b> <span class="muted">${esc(state.profileError)}</span></div>` : ''}
    ${state.profileSaved ? `<div class="card mb-2"><b>Profile updated</b> <span class="muted">Your changes were saved.</span></div>` : ''}
    <div class="split">
      <form id="profileForm" class="card stack">
        <div class="card__head"><h3>Account details</h3></div>
        <div class="field"><label>Full name</label><input class="input" value="${esc(u.name)}" disabled></div>
        <div class="field"><label>Email</label><input class="input" type="email" value="${esc(u.email)}" disabled><p class="muted xs">Email cannot be changed here.</p></div>
        <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(phone)}" placeholder="080..."></div>
        <div class="field"><label>Hostel / Residence</label><input class="input" name="hostel" value="${esc(hostel)}" placeholder="e.g. Adams Hall"></div>
        <button class="btn btn--block" type="submit">Save changes</button>
      </form>
      <div class="card"><div class="card__head"><h3>Account summary</h3></div><div class="stack"><div><span class="muted small">Role</span><div><b>${esc(u.role || 'user')}</b></div></div><div><span class="muted small">Vendor</span><div><b>${u.vendor_id ? esc((vendor(u.vendor_id) || { name: u.vendor_id }).name) : 'Not assigned'}</b></div></div></div></div>
    </div>
  </section>`;
}

// Save phone/hostel to the existing profiles table. Only the caller's own row
// is updated (RLS profiles_update_own + the role-escalation trigger keep
// role/vendor_id/id untouched). state.user is refreshed from the returned row.
async function submitProfileForm(form) {
  if (!state.user) { toast('Please sign in to edit your profile', 'info'); location.hash = '#/login'; return; }
  if (typeof supabase === 'undefined' || !supabase) { toast('Supabase unavailable — profile could not be saved', 'error'); return; }
  const f = new FormData(form);
  const phone = (f.get('phone') || '').trim();
  const hostel = (f.get('hostel') || '').trim();
  if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) { toast('Please enter a valid phone number', 'error'); return; }
  if (hostel && hostel.length > 120) { toast('Hostel / residence is too long', 'error'); return; }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) { toast('Please sign in to edit your profile', 'info'); location.hash = '#/login'; return; }
    const { data, error } = await supabase
      .from('profiles')
      .update({ phone, hostel })
      .eq('id', session.user.id)
      .select('full_name, phone, hostel, role, vendor_id')
      .single();
    if (error) throw error;
    if (data) {
      state.user = { ...state.user, name: data.full_name || state.user.name, phone: data.phone || '', hostel: data.hostel || '', role: data.role || state.user.role, vendor_id: data.vendor_id || null };
    }
    state.profileSaved = true;
    state.profileError = null;
    save();
    toast('Profile updated');
    render();
  } catch (err) {
    console.error('Profile update failed:', err);
    state.profileError = err.message || 'Unknown error';
    state.profileSaved = false;
    render();
    toast('Profile update failed: ' + (err.message || 'unknown error'), 'error');
  }
}

// Rider Hub order-items renderer. Uses the persisted order_items snapshot
// (o.items — mapped from the Supabase order_items rows fetched in
// loadOrdersFromSupabase) so item names/prices stay historically accurate even
// if a product later changes. Reuses the same .line markup as the customer's
// My Orders page. No localStorage/catalog reconstruction — Supabase is the
// source of truth and RLS (order_items_select_rider) gates what is returned.
function riderOrderItemsHtml(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return '';
  const lines = items.map(it => `<div class="line"><span class="line__thumb">${esc(it.icon || '🛒')}</span><span class="line__main"><b>${esc(it.name || 'Item')}</b><small class="line__sub">× ${it.qty || 0}</small></span><b>${money((Number(it.price) || 0) * (it.qty || 0))}</b></div>`).join('');
  return `<div class="stack mt-1" style="gap:4px">${lines}<div class="divider"></div><div class="row row--between"><span class="muted small">Order total</span><b>${money(o.total)}</b></div></div>`;
}

function rider() {
  const riderStatus = state.rider ? state.rider.status : null;
  if (!state.riderLoaded) {
    return `<section class="section container"><div class="page-head"><div><h1>Rider hub</h1><p>Loading…</p></div></div><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
  }
  const isApprovedRider = riderStatus === 'approved';
  const isOnline = !!(state.rider && state.rider.available === true);
  const pending = state.riderPool.filter(o => {
    if (!['Order confirmed', 'Ready for pickup'].includes(o.status)
        || o.rider_id
        || (o.delivery_method ?? 'rider') === 'vendor_self') return false;
    return o.request_type === 'vendor_request'
      ? o.vendor_delivery_requested === true && o.delivery_payment_status === 'success'
      : o.payment_status === 'success';
  });
  const active = state.riderPool.filter(o => (o.status === 'Rider assigned' || o.status === 'Picked up' || o.status === 'On the Way') && (o.delivery_method ?? 'rider') !== 'vendor_self');
  const done = riderCompletedDeliveries();
  const isBusy = active.length > 0;
  const earnings = riderPendingEarnings();
  const pendingRequestsTotal = riderPendingRequestsTotal();
  const pendingRequestsCount = (state.withdrawals || []).filter(w => w.status === 'pending').length;
  const pickupName = o => { const v = o.items[0] ? vendor(o.items[0].vendor) : null; return `${esc(v ? v.name : 'Campus vendor')} → ${esc(o.spot)}`; };
  // Transparent ETA estimate: exact routing data is unavailable, so the figure
  // is derived from the order size + queue position and is always clearly
  // labelled as an ESTIMATE — never presented as a guaranteed ETA.
  const pickupEstimate = (o, i) => `≈ ${10 + ((o.items && o.items.length) || 1) * 2 + i * 3} min (est.)`;
  const statusBadge = !state.rider
    ? '<span class="badge badge--warn">● Not a rider yet</span>'
    : riderStatus === 'pending'
      ? '<span class="badge badge--warn">● Application pending review</span>'
      : riderStatus === 'rejected'
        ? '<span class="badge badge--danger">● Application rejected — you can reapply</span>'
        : riderStatus === 'suspended'
          ? '<span class="badge badge--danger">● Account suspended</span>'
          : isBusy
            ? '<span class="badge badge--info">● On a delivery — busy</span>'
            : isOnline
              ? '<span class="badge badge--success">● Online — available</span>'
              : '<span class="badge badge--warn">● Offline — unavailable</span>';

  const actionBtn = isApprovedRider
    ? (isBusy
        ? '<button class="btn btn--soft" disabled title="Finish your active delivery first">On delivery…</button>'
        : `<button class="btn btn--soft" id="riderToggle">${isOnline ? 'Go offline' : 'Go online'}</button>`)
    : riderStatus === 'pending'
      ? '<button class="btn btn--ghost" disabled>Application pending</button>'
      : '<a class="btn btn--soft" href="#/rider/apply">Become a rider</a>';
  const ratingCard = state.rider ? `
    <div class="card mt-3">
      <div class="card__head"><h3>My rider profile</h3></div>
      <div class="row"><span class="avatar avatar--lg">🛵</span><div>
        <b>${esc(state.user ? state.user.name : 'Rider')}</b>
        <div class="small muted">Matric: ${esc(state.rider.matric_number || '—')} · Phone: ${esc(state.rider.phone || '—')}</div>
        <div class="small"><span class="stars">${'★'.repeat(Math.round(Number(state.rider.rating_avg) || 5))}${'☆'.repeat(5 - Math.round(Number(state.rider.rating_avg) || 5))}</span>
        <b>${state.rider.rating_avg ? Number(state.rider.rating_avg).toFixed(1) : '5.0'}</b>
        <span class="muted">(${state.rider.rating_count || 0} ratings)</span></div>
      </div></div>
    </div>` : '';

  const errorBanner = state.riderLoadError
    ? '<div class="card mt-3"><b>Could not refresh rider status</b><span class="muted">Showing the last known status. Check your connection and try again.</span></div>'
    : '';

  const statusErrorHtml = state.riderStatusError
    ? `<div class="card mt-3" role="alert"><div class="row row--between row--wrap" style="gap:10px"><div><b>⚠️ Order #${esc(state.riderStatusError.orderId)} not updated</b><div class="muted small">${esc(state.riderStatusError.message)}</div></div><button class="btn btn--soft btn--sm" data-retry-rider-status="${esc(state.riderStatusError.dbId)}">Retry</button></div></div>`
    : '';

  // Available deliveries — only shown to an approved rider who is ONLINE.
  // Eligibility is enforced by RLS (orders_select_unassigned): the server only
  // returns unassigned rider-delivery orders to approved riders.
  const availableHtml = (isApprovedRider && isOnline)
    ? (pending.length
        ? `<div class="grid grid--2">${pending.map((o, i) => { const busy = state.riderSubmitting[o.id]; return `<article class="card"><div class="row row--between"><span class="badge badge--warn">${money(riderShareAmount())} rider earnings</span><span class="small muted">${pickupEstimate(o, i)}</span></div><h3 class="mt-1">${pickupName(o)}</h3><p class="muted small">${(o.items || []).length} item${(o.items || []).length > 1 ? 's' : ''} · Order #${o.id}</p>${riderOrderItemsHtml(o)}<a class="btn btn--ghost btn--block" href="#/track/${o.id}">View details</a><button class="btn btn--block" data-accept="${o.id}" ${busy ? 'disabled' : ''}>${busy ? 'Claiming…' : 'Accept delivery'}</button></article>`; }).join('')}</div>`
        : `<div class="empty"><div class="empty__icon">🛵</div><b>No available deliveries</b><span>New orders will appear here as soon as they are placed.</span></div>`)
    : isApprovedRider
      ? `<div class="empty"><div class="empty__icon">🌙</div><b>You're offline</b><span>Go online above to see available deliveries.</span></div>`
      : `<div class="empty"><div class="empty__icon">🛵</div><b>Become a rider first</b><span>Submit an application to unlock deliveries.</span><a class="btn mt-1" href="#/rider/apply">Apply now</a></div>`;
  const activeHtml = active.length
    ? `<div class="stack">${active.map(o => { const busy = state.riderSubmitting[o.id]; const b = busy ? 'disabled' : ''; const action = o.status === 'Rider assigned' ? `<button class="btn btn--block" data-pickup="${o.id}" ${b}>${busy ? 'Updating…' : 'Mark as picked up'}</button>` : o.status === 'Picked up' ? `<button class="btn btn--block" data-onway="${o.id}" ${b}>${busy ? 'Updating…' : 'On the way'}</button>` : `<button class="btn btn--block" data-delivered="${o.id}" ${b}>${busy ? 'Updating…' : 'Mark delivered'}</button>`; return `<article class="card"><div class="row row--between"><span class="badge badge--info">${o.status}</span><span class="small muted">Order #${o.id}</span></div><h3 class="mt-1">${pickupName(o)}</h3><p class="muted small">${(o.items || []).length} item${(o.items || []).length > 1 ? 's' : ''} · 📍 ${esc(o.spot || 'No location')} · ${money(riderShareAmount(o.fee))} rider earnings</p>${riderOrderItemsHtml(o)}${action}</article>`; }).join('')}</div>`
    : '<div class="empty"><div class="empty__icon">📭</div><b>No active deliveries</b><span>Accept an available delivery to get started.</span></div>';
  const historyHtml = done.length
    ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Route</th><th>Rider earnings</th></tr></thead><tbody>${done.map(o => `<tr><td>#${esc(o.id)}</td><td>${pickupName(o)}</td><td><b>${money(riderShareAmount(o.fee))}</b></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty"><div class="empty__icon">📦</div><b>No completed deliveries yet</b><span>Your delivery history and estimated earnings will appear here.</span></div>`;

  // Withdrawal foundation — approved riders only. Requests are pending /
  // admin-reviewed records; nothing in this UI transfers money.
  let withdrawalHtml = '';
  if (isApprovedRider) {
    const list = state.withdrawals || [];
    const rowsHtml = !state.withdrawalsLoaded
      ? '<div class="muted center" style="padding:16px">Loading your requests…</div>'
      : state.withdrawalsError
        ? '<div class="muted center" style="padding:16px">Could not load your requests — please try again.</div>'
        : list.length
          ? `<div class="table-wrap"><table class="table"><thead><tr><th>Amount</th><th>Status</th><th>Requested</th><th>Reviewed</th><th>Admin note</th></tr></thead><tbody>${list.map(w => `<tr><td><b>${money(w.amount)}</b></td><td><span class="badge badge--${w.status === 'pending' ? 'warn' : w.status === 'approved' ? 'success' : w.status === 'paid' ? 'info' : 'danger'}">${esc(w.status)}</span></td><td>${w.requested_at ? formatFullDate(w.requested_at) : '—'}</td><td>${w.reviewed_at ? formatFullDate(w.reviewed_at) : '—'}</td><td class="muted small">${esc(w.admin_note || '—')}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="empty"><div class="empty__icon">🏦</div><b>No withdrawal requests yet</b><span>Request a payout from your estimated earnings below.</span></div>`;
    const requestable = Math.max(0, earnings - pendingRequestsTotal);
    withdrawalHtml = `
      <div class="card mt-3">
        <div class="card__head"><h3>Withdrawals</h3><span class="muted small">Pending admin review — no money moves in-app</span></div>
        ${rowsHtml}
        <div class="divider"></div>
        <form id="withdrawalForm" class="row row--wrap row--between" style="gap:8px">
          <div class="muted small">Requestable now (estimated): <b>${money(requestable)}</b></div>
          <div class="row row--wrap" style="gap:8px">
            <input class="input" name="amount" type="number" min="1" step="any" placeholder="Amount (₦)" style="max-width:180px" required>
            <button class="btn" type="submit" ${state.withdrawalSubmitting ? 'disabled' : ''}>${state.withdrawalSubmitting ? 'Submitting…' : 'Request withdrawal'}</button>
          </div>
        </form>
        <p class="muted xs mb-0 mt-1">Requests are validated against your estimated earnings and stay pending until an admin reviews them.</p>
      </div>`;
  }

  return `<section class="section container"><div class="page-head"><div><h1>Rider hub</h1><p>Deliver around campus, on your own schedule.</p></div>${statusBadge} ${actionBtn}</div><div class="grid grid--stats"><div class="stat stat--brand"><span class="stat__label">Estimated earnings</span><span class="stat__value">${money(earnings)}</span><span class="stat__hint">${done.length} completed delivery${done.length === 1 ? '' : 'ies'} · pending settlement</span></div><div class="stat"><span class="stat__label">Deliveries completed</span><span class="stat__value">${done.length}</span><span class="stat__hint">${active.length} active now</span></div><div class="stat"><span class="stat__label">Pending withdrawals</span><span class="stat__value">${money(pendingRequestsTotal)}</span><span class="stat__hint">${pendingRequestsCount} awaiting admin review</span></div></div>${errorBanner}${statusErrorHtml}${ratingCard}<div class="page-head mt-3"><div><h2>Available deliveries</h2><p>Only unassigned rider deliveries are shown — assigned ones appear in Active deliveries.</p></div>${isApprovedRider ? (isOnline ? '<span class="badge badge--success">● Online</span>' : '<span class="badge badge--warn">● Offline</span>') : ''}</div>${availableHtml}<div class="page-head mt-3"><div><h2>Active deliveries</h2><p>Progress on the deliveries you accepted.</p></div></div>${activeHtml}<div class="page-head mt-3"><div><h2>Delivery history & earnings</h2><p>Completed deliveries and the estimated delivery-fee earnings they earned.</p></div></div>${historyHtml}${withdrawalHtml}</section>`;
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
  return `<section class="container"><div class="auth-wrap" style="max-width:640px"><div class="card"><h1>Earn by delivering</h1><p class="muted">Use your free time to help fellow students and earn per delivery.</p><div class="grid grid--3 mt-2"><div class="stat"><span>🕒</span><b>Flexible hours</b><small class="muted">Go online when it works for you.</small></div><div class="stat"><span>💸</span><b>Weekly payouts</b><small class="muted">Keep track of every delivery.</small></div><div class="stat"><span>🛡️</span><b>Campus-only</b><small class="muted">A verified student community.</small></div></div><form id="riderForm" class="stack mt-3"><div class="form-grid"><div class="field"><label for="riderFullName">Full name</label><input class="input" name="full_name" id="riderFullName" required maxlength="120" value="${esc(state.user && state.user.name || '')}" autocomplete="name"></div><div class="field"><label for="riderStudentId">Student ID / Matric number</label><input class="input" name="studentId" id="riderStudentId" required maxlength="40" placeholder="e.g. 23/1234" autocomplete="off"></div><div class="field"><label for="riderCollege">College</label><input class="input" name="college" id="riderCollege" required maxlength="120" placeholder="e.g. College of Sciences"></div><div class="field"><label for="riderDepartment">Department</label><input class="input" name="department" id="riderDepartment" required maxlength="120" placeholder="e.g. Computer Science"></div><div class="field"><label for="riderEmail">Email</label><input class="input" name="email" id="riderEmail" type="email" required maxlength="120" value="${esc(state.user && state.user.email || '')}" autocomplete="email"></div><div class="field"><label for="riderPhone">Phone number</label><input class="input" name="phone" id="riderPhone" required maxlength="20" placeholder="080... " autocomplete="tel"></div></div><button class="btn btn--block" type="submit">Submit rider application</button></form></div></div></section>`;
}
function notFound() { return `<section class="section container">${empty('🧭','Page not found','This campus path does not exist.','<a class="btn mt-1" href="#/">Go home</a>')}</section>`; }

// Small inline SVG icon set for the account dropdown — dependency-free
// (no icon library) and theme-aware via currentColor, matching the
// Dropzyy light + green design system.
const ACCT_ICONS = {
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  store: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'
};
function acctIcon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACCT_ICONS[name] || ''}</svg>`;
}

function updateChrome() { const count = state.cart.reduce((n,x)=>n+x.qty,0); $('#cartCount').hidden=!count; $('#cartCount').textContent=count; const unreadCount=state.notifications.filter(n=>n.unread).length; const notifCount=document.getElementById('notifCount'); if(notifCount){notifCount.hidden=!unreadCount; notifCount.textContent=unreadCount;} if (state.user) { $('#userAvatar').textContent = state.user.name.charAt(0).toUpperCase(); } else { $('#userAvatar').innerHTML = acctIcon('user'); } const isActiveNav=(h)=>location.hash.startsWith(h)&&h!=='#/'||location.hash==='#/'&&h==='#/'; const nav=[['#/','Home'],['#/browse','Browse'],['#/vendors','Vendors'],['#/rider','Earn']]; $('#topnav').innerHTML=nav.map(([h,n])=>`<a href="${h}" class="${isActiveNav(h)?'is-active':''}"${isActiveNav(h)?' aria-current="page"':''}>${n}</a>`).join(''); $('#bottomnav').innerHTML=[['#/','⌂','Home'],['#/browse','⌕','Browse'],['#/cart','🛒','Cart'],['#/orders','◷','Orders'],['#/rider','₦','Earn']].map(([h,i,n])=>`<a href="${h}" class="${isActiveNav(h)?'is-active':''}"${isActiveNav(h)?' aria-current="page"':''}><i>${i}</i>${n}${n==='Cart'&&count?`<span class="badge-count">${count}</span>`:''}</a>`).join(''); $('#userPanel').innerHTML=state.user?`<div class="dropdown__meta"><b>${esc(state.user.name)}</b><br><span class="muted small">${esc(state.user.email)}</span></div><div class="dropdown__sep"></div><a class="dropdown__item" href="#/profile">${acctIcon('user')} My profile</a><a class="dropdown__item" href="#/orders">${acctIcon('package')} My orders</a><a class="dropdown__item" href="#/rider">${acctIcon('bike')} Rider hub</a><a class="dropdown__item" href="#/vendor">${acctIcon('store')} Vendor dashboard</a><a class="dropdown__item" href="#/admin">${acctIcon('dashboard')} Admin dashboard</a><div class="dropdown__sep"></div><button class="dropdown__item" id="logoutBtn">${acctIcon('logout')} Sign out</button>`:`<a class="dropdown__item" href="#/login">${acctIcon('login')} Sign in</a><a class="dropdown__item" href="#/register">${acctIcon('user-plus')} Create account</a>`; $('#notifList').innerHTML=renderNotificationList();
  // Show/hide Admin link based on user role (profiles.role === 'admin')
  // (footer Admin link removed — role-gated entry is via the account dropdown)
}


async function supabaseEdgeFunctionRequest(functionName, body) {
  // Call a Supabase Edge Function with the user's JWT.
  // Used for Paystack initialization — secret never leaves the server.
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    toast('Please sign in to continue', 'info');
    location.hash = '#/login';
    return null;
  }
  const edgeUrl = window.SUPABASE_EDGE_URL + '/functions/v1/' + functionName;
  const res = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) {
    toast((result && result.error) || ('Payment init failed (' + res.status + ')'), 'error');
    return null;
  }
  return result;
}

function customerOrderStatusBadge(o) {
  // Payment-state aware customer badge: an unpaid (pending) or failed
  // Paystack payment always outranks the internal workflow status.
  if (o.payment_status === 'failed') return '<span class="badge badge--danger">Payment Failed</span>';
  if (o.payment_status === 'pending' && o.status === 'Order confirmed') return '<span class="badge badge--warn">Payment Pending</span>';
  const badge = o.status==='Delivered' || o.status==='Rated' ? 'success' : o.status==='Cancelled' ? 'danger' : 'info';
  return '<span class="badge badge--'+badge+'">'+esc(o.status)+'</span>';
}

function vendorDeliveryStatusMessage(o, block = false) {
  if (o.request_type !== 'vendor_request') return '';
  let message = '';
  if (o.delivery_method === 'vendor_self') {
    message = 'Vendor self-delivery — no Dropzyy delivery fee.';
  } else if (o.delivery_method === 'rider') {
    const status = o.delivery_payment_status || 'pending';
    if (status === 'success') message = 'Vendor delivery payment successful.';
    else if (status === 'failed') message = 'Vendor delivery payment failed. The vendor must retry.';
    else message = 'Awaiting vendor delivery payment. The vendor pays ₦1,500; you are not charged.';
  }
  return message ? `<p class="muted small${block ? ' mt-1' : ''}">${message}</p>` : '';
}

function moneyStatusBadge(p) {
  const m = { pending:['Awaiting payment','badge--info'], success:['Payment successful','badge--success'], failed:['Payment failed','badge--danger'] };
  const [l,cls] = m[p]||['Pending','badge--info'];
  return '<span class="badge '+cls+'">'+l+'</span>';
}

// ============================================
// Paystack checkout start — visible failure handling (audit F1)
// ============================================
// Message shown when Paystack initialization fails (network error, Edge
// Function error, or a response without a redirect URL). It is revealed
// inline on the pay card (role="alert" so screen readers announce it) with a
// Try Again button, and echoed as a toast. Previously a failed initialize
// left the pay button permanently disabled with no error and no way to retry.
const PAY_INIT_ERROR_TEXT = 'Payment couldn\'t start. Check your connection and try again.';

// Hidden-by-default inline error banner rendered on both the pending and the
// failed payment cards. Revealed by startPaystackCheckout() on failure.
const PAY_ERROR_BANNER_HTML =
  '<div class="pay-error" id="payErrorBanner" role="alert" hidden>'
  + '<span id="payErrorMessage">' + PAY_INIT_ERROR_TEXT + '</span>'
  + '<button class="btn btn--sm" type="button" id="payTryAgain">Try Again</button>'
  + '</div>';

// Initialize the Paystack transaction for order id `tid` (the order's dbId —
// never an amount or payment reference; the Edge Function prices the order
// server-side) with full failure handling. Success → the browser is
// redirected to Paystack (the button stays disabled during the handoff). Any
// failure → the pay button is re-enabled with its original label, the inline
// error banner is revealed, and both the pay button and the banner's Try
// ============================================
// Unified Paystack Checkout Handler
// Handles BOTH product payments (restaurant/vendor products) AND
// vendor delivery payments (₦1,500 rider delivery fee)
// ============================================
async function startPaystackCheckout(tid, payBtn, busyLabel, paymentType = 'product') {
  const banner = document.getElementById('payErrorBanner');
  const tryAgainBtn = document.getElementById('payTryAgain');
  const originalLabel = payBtn.dataset.payLabel || payBtn.textContent;
  payBtn.dataset.payLabel = originalLabel;

  const fail = (err) => {
    console.error('Paystack initialization failed:', err);
    payBtn.disabled = false;
    payBtn.textContent = originalLabel;
    if (tryAgainBtn) tryAgainBtn.disabled = false;
    if (banner) banner.hidden = false;
    toast(PAY_INIT_ERROR_TEXT, 'error');
  };

  payBtn.disabled = true;
  payBtn.textContent = busyLabel;
  if (tryAgainBtn) tryAgainBtn.disabled = true;
  if (banner) banner.hidden = true;

  let response = null;
  try {
    const edgeFunction = paymentType === 'vendor_delivery' ? 'paystack-initialize-delivery' : 'paystack-initialize';
    response = await supabaseEdgeFunctionRequest(edgeFunction, {
      order_id: tid,
      email: state.user.email
    });
    if (response && response.authorization_url) {
      window.location.href = response.authorization_url;
      return;
    }
    fail(new Error((response && (response.error || response.message)) || 'No authorization_url in Paystack initialization response'));
  } catch (err) {
    fail(err);
  }
}

async function pay(orderId) {
  if (!state.user) { toast('Please sign in to view payment','info'); location.hash='#/login'; return ''; }
  await ensureOrdersLoaded();
  const order = state.orders.find(x => x.dbId === orderId) || state.orders.find(x => x.id === orderId);
  if (!order) return notFound();

  // Check if this is a vendor delivery payment
  const isVendorDelivery = order.request_type === 'vendor_request' && order.delivery_method === 'rider';
  const deliveryPaymentStatus = order.delivery_payment_status;

  // Product payment status
  const ps = order.payment_status;
  const tid = order.dbId || order.id;

  // ---- VENDOR DELIVERY PAYMENT ----
  if (isVendorDelivery) {
    if (deliveryPaymentStatus === 'success') {
      return '<section class="section container"><div class="page-head"><div><h1>Delivery Payment</h1><p>'+moneyStatusBadge(deliveryPaymentStatus)+'</p></div></div><div class="card"><div class="row"><span>'+moneyStatusBadge(deliveryPaymentStatus)+'</span><span class="muted small">Delivery fee: ₦1,500 paid</span></div><div class="divider"></div><p><span class="muted small">Rider: ₦1,000 · Dropzyy: ₦500</span></p></div></section>';
    }
    if (deliveryPaymentStatus === 'pending') {
      return '<section class="section container"><div class="page-head"><div><h1>Delivery Payment</h1><p>Your vendor has requested a Dropzyy Rider.</p></div></div><div class="card"><h3>Awaiting vendor delivery payment</h3><p class="muted">The vendor is responsible for the ₦1,500 Dropzyy delivery fee.</p><p class="muted small">Breakdown: Rider ₦1,000 · Dropzyy ₦500</p><p class="muted small">Rider delivery will become available after the vendor payment succeeds.</p></div></section>';
    }
    if (deliveryPaymentStatus === 'failed') {
      return '<section class="section container"><div class="page-head"><div><h1>Delivery Payment</h1><p>'+moneyStatusBadge(deliveryPaymentStatus)+'</p></div></div><div class="card"><h3>Vendor delivery payment failed</h3><p class="muted">The vendor must retry the ₦1,500 Dropzyy delivery payment.</p><p class="muted small">Rider delivery will remain unavailable until that payment succeeds.</p></div></section>';
    }
  }

  // ---- PRODUCT PAYMENT (Restaurant / Vendor Products) ----
  if (ps === 'success') {
    return '<section class="section container"><div class="page-head"><div><h1>Payment</h1><p>'+moneyStatusBadge(ps)+'</p></div></div><div class="card"><div class="row"><span>'+moneyStatusBadge(ps)+'</span><span class="muted small">Ref: '+esc(order.payment_reference||'—')+'</span></div><div class="divider"></div><p><span class="muted small">Paid at</span> '+esc(order.paid_at?formatDate(order.paid_at):'—')+'</p></div></section>';
  }
  if (ps === 'pending') {
    let html = '<section class="section container"><div class="page-head"><div><h1>Payment</h1><p>'+moneyStatusBadge(ps)+'</p></div></div><div class="card"><h3>Complete your payment</h3><p class="muted">Your order total: <b>'+money(order.total)+'</b></p><p class="muted small">Click below to pay securely with Paystack.</p><button class="btn btn--block btn--lg mt-2" id="paystackBtn">Pay '+money(order.total)+' with Paystack</button>'+PAY_ERROR_BANNER_HTML+'<p class="muted xs center mt-1 mb-0">You will be redirected to Paystack. You will NOT be charged until you confirm on Paystack.</p></div></section>';
    setTimeout(()=>{ const b=document.getElementById('paystackBtn'); if(!b) return; b.addEventListener('click', ()=>startPaystackCheckout(tid,b,'Redirecting to Paystack...')); const t=document.getElementById('payTryAgain'); if(t) t.addEventListener('click', ()=>startPaystackCheckout(tid,b,'Redirecting to Paystack...')); },50);
    // While this pending payment page is open (e.g. right after returning from
    // Paystack), poll the Supabase source of truth so the page flips to
    // "Payment successful" and opens My Orders as soon as the server-side
    // webhook confirms the payment.
    schedulePayConfirmationPoll(orderId, tid);

    return html;
  }
  if (ps === 'failed') {
    let html = '<section class="section container"><div class="page-head"><div><h1>Payment</h1><p>'+moneyStatusBadge(ps)+'</p></div></div><div class="card"><h3>Payment failed</h3><p class="muted">Your payment attempt was not completed. You can retry below.</p><button class="btn btn--block btn--lg mt-2" id="paystackRetry">Retry payment</button>'+PAY_ERROR_BANNER_HTML+'</div></section>';
    setTimeout(()=>{ const b=document.getElementById('paystackRetry'); if(!b) return; b.addEventListener('click', ()=>startPaystackCheckout(tid,b,'Redirecting...')); const t=document.getElementById('payTryAgain'); if(t) t.addEventListener('click', ()=>startPaystackCheckout(tid,b,'Redirecting...')); },50);
    return html;
  }
  return '<section class="section container"><div class="page-head"><div><h1>Payment</h1>'+moneyStatusBadge(ps)+'</div></section>';
}

// ============================================
// Post-payment flow: Paystack return handling
// ============================================
// Paystack redirects back to the site with ?reference=…&trxref=… appended to
// the callback URL. The redirect alone is NOT proof of payment — the
// server-side webhook (paystack-webhook → handle_paystack_payment_success) is
// the only thing that marks payment as successful. The reference is used
// purely as a routing hint: refresh the customer's orders from Supabase
// (source of truth) and only announce success once the order row itself is
// confirmed as paid. If the webhook has not confirmed yet (or the
// refresh fails), the order is never deleted or hidden — the user lands on
// My Orders where it remains visible with its current status.
async function handlePaystackReturn() {
  let ref = '';
  try {
    const search = new URLSearchParams(location.search);
    const qIndex = location.hash.indexOf('?');
    const hashSearch = qIndex >= 0 ? new URLSearchParams(location.hash.slice(qIndex + 1)) : null;
    ref = search.get('reference') || search.get('trxref')
      || (hashSearch && (hashSearch.get('reference') || hashSearch.get('trxref'))) || '';
    if (ref) {
      // Strip the query so a manual refresh doesn't replay this flow
      const cleanHash = qIndex >= 0 ? location.hash.slice(0, qIndex) : location.hash;
      history.replaceState(null, '', location.pathname + (cleanHash || '#/'));
    }
  } catch (e) { ref = ''; }
  if (!ref || !state.user) return;
  toast('Payment received — confirming your order…', 'info');
  for (let attempt = 0; attempt < 5; attempt++) {
    // Existing source-of-truth loader (RLS-scoped to the authenticated user)
    await loadOrdersFromSupabase();
    const order = (state.orders || []).find(o => o.payment_reference === ref);
    if (order && order.payment_status === 'success') {
      toast('Payment successful — opening your orders…');
      if (location.hash !== '#/orders') location.hash = '#/orders'; else render();
      return;
    }
    // Webhook may lag a moment behind the redirect — brief retry.
    await new Promise(r => setTimeout(r, 2000));
  }
  // Not confirmed yet: keep the order visible in My Orders (never hidden).
  toast('Your payment is being confirmed. Track it in My Orders.', 'info');
  if (location.hash !== '#/orders') location.hash = '#/orders'; else render();
}

// While a customer is on a pending Payment page, poll the Supabase source of
// truth so the UI moves to My Orders as soon as the webhook confirms payment.
// Stops as soon as the user navigates away from this pay page.
function schedulePayConfirmationPoll(routeOrderId, dbId) {
  const attempts = 30, interval = 4000;
  let n = 0;
  const tick = async () => {
    if (!location.hash.startsWith('#/pay/') || !location.hash.includes(routeOrderId)) return;
    n++;
    try { await loadOrdersFromSupabase(); } catch (e) { /* retry next tick; order stays visible */ }
    const order = (state.orders || []).find(x => x.dbId === dbId || x.id === routeOrderId);
    if (order && order.payment_status === 'success') {
      toast('Payment successful — opening your orders…');
      location.hash = '#/orders';
      return;
    }
    if (n < attempts) setTimeout(tick, interval);
  };
  setTimeout(tick, interval);
}

/* ---- Presentation-only: hero waybill route animation ----------------------
   Fills the route line and moves the truck marker along it once on page
   load. Respects prefers-reduced-motion and pauses while the stub is
   scrolled out of view. Visual only — no app logic. */
let waybillAnim = null;
function playWaybill() {
  if (waybillAnim) { waybillAnim.stopped = true; if (waybillAnim.raf) cancelAnimationFrame(waybillAnim.raf); waybillAnim = null; }
  const fill = document.getElementById('waybillRouteFill');
  const truck = document.getElementById('waybillTruck');
  const marker = document.getElementById('waybillRouteMarker');
  const eta = document.getElementById('waybillEtaValue');
  if (!fill || !truck || !fill.parentElement) return;
  const route = fill.parentElement;
  const finish = () => {
    fill.style.width = Math.max(0, route.clientWidth - 32) + 'px';
    const x = Math.max(16, route.clientWidth - 16);
    truck.style.left = x + 'px';
    if (marker) marker.style.left = x + 'px';
    if (eta) eta.textContent = '18 min';
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }

  const DUR = 3200; // one deliberate moment — runs once, does not loop
  const anim = { stopped: false, raf: 0 };
  waybillAnim = anim;
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }, { threshold: 0.15 }).observe(route);
  }
  const start = performance.now();
  const step = now => {
    if (anim.stopped || !document.body.contains(fill)) return;
    const t = Math.min(1, (now - start) / DUR);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    if (visible) {
      const w = Math.max(0, route.clientWidth - 32);
      fill.style.width = (eased * w) + 'px';
      const x = 16 + eased * w;
      truck.style.left = x + 'px';
      if (marker) marker.style.left = x + 'px';
      if (eta) eta.textContent = Math.max(18, Math.round(21 - 3 * eased)) + ' min';
    }
    if (t < 1) anim.raf = requestAnimationFrame(step);
  };
  anim.raf = requestAnimationFrame(step);
}

// F12: admin.js is only fetched when a #/admin route is actually rendered.
// The loader is cached so the module is injected once per page session; if
// loading fails, the cached promise is reset so a later navigation can retry.
//
// The path is ROOT-ABSOLUTE on purpose. The SPA shell is served at whatever
// path the visitor used (/, /orders, /admin/login, ...) via the Netlify
// rewrite, so a relative '../js/admin.js' resolved against that path and
// 404'd into the HTML fallback — the browser then refused the script on MIME
// type and the in-app admin route reported "Admin panel unavailable".
let adminJsPromise = null;
function ensureAdminJs() {
  if (window.AdminHub) return Promise.resolve();
  if (adminJsPromise) return adminJsPromise;
  adminJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/assets/js/admin.js';
    s.onload = () => resolve();
    s.onerror = () => {
      adminJsPromise = null; // allow a later retry
      reject(new Error('Failed to load admin.js'));
    };
    document.head.appendChild(s);
  });
  return adminJsPromise;
}

// F17: keep document.title in sync with the current major route. Unknown or
// nested routes fall back to the plain brand name.
const ROUTE_TITLES = {
  browse:'Browse', vendors:'Vendors', product:'Product', cart:'Cart',
  checkout:'Checkout', 'report-issue':'Report an Issue', report:'Report an Issue',
  faqs:'FAQs', orders:'My Orders', track:'Track Order', order:'Order',
  refund:'Request Refund', pay:'Payment', profile:'My Profile', login:'Sign in',
  register:'Create account', admin:'Admin'
};
function setDocumentTitle(parts) {
  let label = ROUTE_TITLES[parts[0]] || '';
  if (parts[0]==='vendor') label = parts[1]==='apply' ? 'Become a Vendor' : 'Vendor';
  else if (parts[0]==='rider') label = parts[1]==='apply' ? 'Apply as Rider' : 'Rider Hub';
  document.title = label ? `${label} · Dropzyy` : 'Dropzyy';
}

async function render() {
  const [path] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  // Success banner on the Refund Request page is one-shot: cleared as soon as
  // the customer navigates anywhere else. Same for the Issue Report / Vendor
  // application confirmation (reportView shows it, then it is reset).
  if (parts[0] !== 'refund') state.refundSuccessNotice = null;
  if (parts[0] !== 'report' && !(parts[0] === 'vendor' && parts[1] === 'apply')) state.reportSuccess = null;
  setDocumentTitle(parts);
  let view;
  if (!parts.length) view = home();
  else if (parts[0]==='browse') view = browse();
  else if (parts[0]==='vendors') view = vendors();
  else if (parts[0]==='vendor' && parts[1]==='apply') view = await vendorApplyView();
  else if (parts[0]==='vendor' && parts[1]) view = vendorView(parts[1]);
  else if (parts[0]==='product' && parts[1]) view = productView(parts[1]);
  else if (parts[0]==='cart') view = cart();
  else if (parts[0]==='checkout') view = checkout();
  else if (parts[0]==='report' || parts[0]==='report-issue') view = await reportView('');
  else if (parts[0]==='faqs') view = faqsView();
  else if (parts[0]==='orders') view = await orders();
  else if (parts[0]==='track') view = await track(parts[1]);
  else if (parts[0]==='order' && parts[1]) view = await orderView(parts[1]);
  else if (parts[0]==='refund' && parts[1]) view = await refundRequestView(decodeURIComponent(parts[1]));
  else if (parts[0]==='pay' && parts[1]) view = await pay(parts[1]);
  else if (parts[0]==='vendor-requests') view = await vendorRequestsView();
  else if (parts[0]==='profile') view = profile();
  else if (parts[0]==='login' || parts[0]==='register') view = auth(parts[0]);
  else if (parts[0]==='rider' && parts[1]==='apply') view = riderApply();
  else if (parts[0]==='rider') view = rider();
  else if (parts[0]==='vendor') {
    // Vendor dashboard gate: require Supabase auth + a linked vendor_id
    // (vendor capability). RLS on orders/products enforces that the data
    // returned belongs to this vendor only.
    if (!state.user || !state.user.vendor_id) {
      view = `<section class="section container"><div class="auth-wrap" style="max-width:640px"><div class="card center">
        <span style="font-size:3rem">🏪</span>
        <h1 class="mt-1">Vendor dashboard</h1>
        <p class="muted">Only accounts with a linked vendor can access this page.</p>
        <a class="btn mt-2" href="#/">Back to home</a>
      </div></div></section>`;
    } else {
      await ensureVendorLoaded();
      if (!state.vendorLoaded) {
        view = `<section class="section container"><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
      } else {
        view = vendorDashboard();
      }
    }
  }
  else if (parts[0]==='admin') {
    // F12: load admin.js lazily (and only once) before touching AdminHub.
    try {
      await ensureAdminJs();
    } catch (err) {
      // Loading failed — show a small user-friendly error and stop.
      console.error('Admin module failed to load:', err);
      $('#app').innerHTML = `<section class="section container"><div class="auth-wrap" style="max-width:640px"><div class="card center"><h1>⚠️ Admin panel unavailable</h1><p class="muted">The admin panel could not be loaded. This is probably a network problem — please try again.</p><a class="btn mt-2" href="#/">Back to home</a></div></div></section>`;
      updateChrome();
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
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
  playWaybill();
  initVendorCarousel();
  updateChrome();
       window.scrollTo({ top: 0, behavior: 'instant' });
}

// ============================================
// Rider order-action sync (F6): never pretend a server-side status change
// succeeded. Each rider action:
//   - guards against duplicate submissions while a request is in flight
//   - keeps the local UI state consistent with the server result
//   - retries once for transient failures, then shows a persistent Retry
//   - surfaces user-friendly errors only — raw DB/RLS errors are logged and
//     never shown to the rider
// The server-side race protection (RLS claim policy, order-status transition
// trigger) and all RPC/DB logic are UNTOUCHED — this is frontend error
// handling only.
// ============================================

function riderOrderByDbId(dbId) {
  return (state.riderPool || []).find(x => x.dbId === dbId) || null;
}

function riderStatusLabel(status) {
  if (status === 'Picked up') return 'picked up';
  if (status === 'On the Way') return 'on the way';
  if (status === 'Delivered') return 'delivered';
  return status;
}

// Refresh the authoritative pool/order state from Supabase and report how the
// server sees the order: 'applied' (the target state is persisted), 'unchanged'
// (still in the previous state), 'gone' (no longer in this rider's pool — e.g.
// another rider claimed it), 'other' (server shows some other state) or
// 'unknown' (the refresh itself failed).
async function riderReconcileOrder(dbId, prevStatus, nextStatus) {
  try {
    await loadOrdersFromSupabase();
  } catch (err) {
    console.error('Rider reconcile refresh failed:', err);
    return 'unknown';
  }
  const fresh = riderOrderByDbId(dbId);
  if (!fresh) return 'gone';
  if (fresh.status === nextStatus) return 'applied';
  if (fresh.status === prevStatus) return 'unchanged';
  return 'other';
}

// Core pickup / on-the-way / delivered sync. Applies the optimistic local
// update (preserving the existing workflow), then persists to Supabase with ONE
// safe retry (same-status updates are a server-side no-op, so a retry can never
// create an illegal transition). The success toast fires ONLY after the server
// confirms. On final failure the local state is reconciled with the server and
// a persistent Retry banner is shown in the Rider hub.
async function runRiderStatusUpdate(order, nextStatus, opts) {
  const dbId = order.dbId;
  const orderId = order.id;
  opts = opts || {};
  if (state.riderSubmitting[orderId]) return false; // duplicate-submission guard
  const prevStatus = order.status;

  // Offline / no-Supabase fallback: the local store is the only source, so the
  // optimistic result stands (matches the app's existing offline behaviour).
  if (typeof supabase === 'undefined' || !supabase || !dbId) {
    if (opts.onSuccess) opts.onSuccess();
    toast(opts.successToast || `Order marked as ${riderStatusLabel(nextStatus)}`);
    return true;
  }

  state.riderSubmitting[orderId] = true;
  order.status = nextStatus;
  save();
  render();

  let ok = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) await new Promise(r => setTimeout(r, 600));
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', dbId);
    if (!error) { ok = true; break; }
    console.error(`Rider status update failed (attempt ${attempt + 1} of 2):`, error);
  }

  if (!ok) {
    const reconciled = await riderReconcileOrder(dbId, prevStatus, nextStatus);
    if (reconciled === 'applied') ok = true;
    else if (reconciled === 'unknown') {
      // Refresh failed — pull the optimistic pool entry back so the UI matches
      // the last known server state.
      const stale = riderOrderByDbId(dbId);
      if (stale && stale.status === nextStatus) stale.status = prevStatus;
      save();
    }
  }

  delete state.riderSubmitting[orderId];

  if (ok) {
    if (state.riderStatusError && state.riderStatusError.dbId === dbId) state.riderStatusError = null;
    if (opts.onSuccess) opts.onSuccess();
    toast(opts.successToast || `Order marked as ${riderStatusLabel(nextStatus)}`);
    render();
    return true;
  }

  state.riderStatusError = {
    dbId,
    orderId,
    nextStatus,
    message: `We could not mark Order #${orderId} as ${riderStatusLabel(nextStatus)}. This may be a network or server problem — tap Retry below to try again.`
  };
  render();
  return false;
}

document.addEventListener('click', async e=>{
  const add=e.target.closest('[data-add]'); if(add) addCart(add.dataset.add);
  const ro=e.target.closest('[data-reorder]'); if(ro) reorder(ro.dataset.reorder);
  // Rider rating: star selection (visual only — submit is the only mutation)
  const star=e.target.closest('[data-star-order]'); if(star){ const orderId=star.dataset.starOrder; document.querySelectorAll(`[data-star-order="${orderId}"]`).forEach(b=>{ b.classList.toggle('is-on', Number(b.dataset.rating)<=Number(star.dataset.rating)); }); }
  // Vendor product management (own products only, enforced by RLS + vendor_id filter)
  const vpEdit=e.target.closest('[data-vp-edit]'); if(vpEdit){ editVendorProduct(vpEdit.dataset.vpEdit); }
  const vpToggle=e.target.closest('[data-vp-toggle]'); if(vpToggle){ toggleVendorProductActive(vpToggle.dataset.vpToggle); }
  const vpDelete=e.target.closest('[data-vp-delete]'); if(vpDelete){ deleteVendorProduct(vpDelete.dataset.vpDelete); }
  if(e.target.id==='vendorProductClear'){ resetVendorProductForm(); }
  const q=e.target.closest('[data-qty]'); if(q){const line=state.cart.find(x=>x.id===Number(q.dataset.qty)); if(!line)return; line.qty+=Number(q.dataset.delta); if(line.qty<1) state.cart=state.cart.filter(x=>x!==line); save(); render();}
  const rm=e.target.closest('[data-remove]'); if(rm){ state.cart=state.cart.filter(x=>x.id!==Number(rm.dataset.remove)); save(); render(); toast('Item removed from your cart','info'); }
  const accept=e.target.closest('[data-accept]'); if(accept){const o=state.riderPool.find(x=>x.id===accept.dataset.accept); if(o && state.rider && state.rider.id){
    // Duplicate-submission guard: ignore taps while this claim is in flight.
    if(state.riderSubmitting[o.id]) return;
    state.riderSubmitting[o.id]=true;
    const prevStatus=o.status;
    o.status='Rider assigned';
    save();
    render();
    (async()=>{
      // Success toasts fire ONLY after the server confirms (or the offline
      // fallback path); failures never show a success message. Raw DB/RLS text
      // is logged for debugging and never displayed to the rider.
      let ok=false;
      let reconciled='unknown';
      if(typeof supabase!=='undefined' && supabase && o.dbId){
        let claimErr=null;
        // One safe retry for transient failures. A repeated claim attempt can
        // never corrupt state: if the first attempt actually persisted, the
        // retry is a same-status no-op on the server.
        for(let attempt=0; attempt<2; attempt++){
          if(attempt===1) await new Promise(r=>setTimeout(r,600));
          const res=await supabase.from('orders')
            .update({ status:'Rider assigned', rider_id: state.rider.id }).eq('id', o.dbId);
          if(!res.error){ ok=true; break; }
          claimErr=res.error;
          console.error('Rider claim failed (attempt '+(attempt+1)+' of 2):', res.error);
        }
        if(!ok){
          reconciled=await riderReconcileOrder(o.dbId, prevStatus, 'Rider assigned');
          if(reconciled==='applied') ok=true;
          else if(reconciled==='unknown'){
            // Refresh failed — revert the local pool entry to the last known
            // server state so the UI stays consistent.
            const stale=riderOrderByDbId(o.dbId);
            if(stale && stale.status==='Rider assigned') stale.status=prevStatus;
            save();
          } else {
            console.warn('Rider claim rejected by server:', claimErr && claimErr.message);
          }
        }
      } else {
        ok=true; // offline / local-only fallback preserves existing behaviour
      }
      delete state.riderSubmitting[o.id];
      if(ok){
        // Refresh the Rider Hub from Supabase so the persisted assignment
        // (rider_id = currentRider.id, status = 'Rider assigned') is the source
        // of truth — the order moves from Available to Active deliveries.
        await loadOrdersFromSupabase();
        addNotification('Rider assigned',`A rider accepted order #${o.id}. They are on their way to the pickup point.`);
        toast('Delivery added to your rider queue');
      } else if(reconciled==='gone' || reconciled==='other'){
        toast('This delivery is no longer available. Another rider accepted it.','error');
      } else {
        toast('Could not accept this delivery. Check your connection and try again.','error');
      }
      render();
    })();
  }}
  const pickup=e.target.closest('[data-pickup]'); if(pickup){const o=state.riderPool.find(x=>x.id===pickup.dataset.pickup); if(o){
    runRiderStatusUpdate(o,'Picked up',{
      successToast:'Order marked as picked up',
      onSuccess:()=>addNotification('Order picked up',`Order #${o.id} has been picked up and is on its way.`)
    });
  }}
  const onway=e.target.closest('[data-onway]'); if(onway){const o=state.riderPool.find(x=>x.id===onway.dataset.onway); if(o){
    runRiderStatusUpdate(o,'On the Way',{
      successToast:'Order marked as on the way',
      onSuccess:()=>addNotification('Order on the way',`Order #${o.id} is on the way to the customer.`)
    });
  }}
  // Customer cancellation: only while the order is still cancellable
  // ('Order confirmed' / 'Preparing'). The order is never deleted — its status
  // becomes 'Cancelled' locally and in Supabase (orders_update_own_cancel RLS).
  // For PAID orders, warn the customer that cancellation may require a separate
  // refund process instead of promising an immediate refund.
  const cancel=e.target.closest('[data-cancel]'); if(cancel){const o=state.orders.find(x=>x.id===cancel.dataset.cancel); if(o && ['Order confirmed','Preparing'].includes(o.status)){
    const hasSuccessfulPayment = o.payment_status === 'success' || o.delivery_payment_status === 'success';
    if (hasSuccessfulPayment && !(await DropzyyModal.confirm({ title:'Cancel this order?', message:'Your order will be cancelled, but your payment may require a separate refund process.', confirmText:'Cancel order', danger:true }))) return;
    const prevStatus=o.status;
    o.status='Cancelled'; save();
    addNotification('Order cancelled',`Your order #${o.id} has been cancelled.`);
    if(typeof supabase!=='undefined' && supabase && o.dbId){
      supabase.from('orders').update({ status:'Cancelled' }).eq('id',o.dbId)
        .then(({ error })=>{ if(error){ console.error('Customer cancel sync failed:', error); o.status=prevStatus; save(); } })
        .catch(err=>console.error('Customer cancel sync error:', err));
    }
    toast('Order cancelled','info'); render();
  }}
  // Refund request: navigate to the dedicated Refund Request page (shared by
  // the My Orders and Order Details entry points — no popup modal).
  const refundReq=e.target.closest('[data-refund-request]'); if(refundReq){ location.hash = '#/refund/' + encodeURIComponent(refundReq.dataset.refundRequest); }
  const delivered=e.target.closest('[data-delivered]'); if(delivered){const o=state.riderPool.find(x=>x.id===delivered.dataset.delivered); if(o){
    runRiderStatusUpdate(o,'Delivered',{
      successToast:'Delivery completed — earnings added!',
      onSuccess:()=>addNotification('Order delivered',`Order #${o.id} was delivered successfully. Well done!`)
    });
  }}
  // Retry a previously failed rider status change from the persistent Retry
  // banner in the Rider Hub.
  const retryRider=e.target.closest('[data-retry-rider-status]'); if(retryRider){
    const err=state.riderStatusError;
    const dbId=retryRider.dataset.retryRiderStatus;
    const o=err && dbId && err.dbId===dbId ? riderOrderByDbId(dbId) : null;
    if(!o || !err){ toast('This delivery is no longer in your active queue.','info'); return; }
    const next=err.nextStatus;
    state.riderStatusError=null;
    runRiderStatusUpdate(o, next, {
      successToast:`Order marked as ${riderStatusLabel(next)}`,
      onSuccess:()=>addNotification('Order updated',`Order #${o.id} is now ${next}.`)
    });
  }
  // Vendor order status transitions (accept 'Preparing' / reject 'Cancelled' /
  // mark 'Ready for pickup' / vendor-self 'Delivered'). Every change is
  // persisted to Supabase then re-renders the dashboard.
  // Rejecting a PAID order requires explicit confirmation: the customer has
  // already paid, and cancelling does not trigger an automatic refund.
  // A local status guard also prevents accidental double submissions when the
  // user taps the same button again before the UI re-renders.
  const vstatus=e.target.closest('[data-vendor-status]'); if(vstatus){
    const order=state.vendorOrders.find(x=>x.id===vstatus.dataset.vendorStatus);
    const to=vstatus.dataset.to;
    if(!order || !to) return;
    if (order.status === to) return;
    if (to === 'Cancelled' && order.payment_status === 'success'
        && !(await DropzyyModal.confirm({ title:'Reject this order?', message:'The customer has already paid for this order.', confirmText:'Reject order', danger:true }))) return;
    const prev=order.status;
    order.status=to;
    save();
    addNotification('Order updated',`Order #${order.id} is now ${to}.`);
    if(typeof supabase!=='undefined' && supabase && order.dbId){
      supabase.rpc('vendor_update_order_status', { p_order_id: order.dbId, p_status: to })
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
      supabase.rpc('set_vendor_delivery_method', {
        p_order_id: order.dbId,
        p_delivery_method: method
      }).then(({ error })=>{ if(error){ console.error('Vendor delivery-method update failed:', error); order.delivery_method=prevMethod; save(); } })
        .catch(err=>console.error('Vendor delivery-method update error:', err));
    }
    toast(`Order #${order.id}: ${method==='rider'?'Rider will deliver':'You will deliver this order'}`);
    render();
  }
  // Vendor chooses delivery method after accepting a request (vendor_self vs rider)
  const vdelChoice = e.target.closest('[data-vendor-delivery-choice]'); if (vdelChoice) {
    const order = state.vendorOrders.find(x => x.id === vdelChoice.dataset.vendorDeliveryChoice);
    const method = vdelChoice.dataset.method; // 'vendor_self' or 'rider'
    if (!order || !method) return;
    if (!(await DropzyyModal.confirm({
      title: method === 'rider' ? 'Request Dropzyy Rider?' : 'Self Deliver?',
      message: method === 'rider'
        ? '₦1,500 delivery fee applies (Rider: ₦1,000, Dropzyy: ₦500). Pickup from your saved location. You will pay this delivery fee.'
        : 'You will deliver this order yourself. No delivery fee applies.',
      confirmText: method === 'rider' ? 'Request Rider' : 'Self Deliver',
      danger: false
    }))) return;
    const prevMethod = order.delivery_method;
    try {
      const { data, error } = await supabase.rpc('set_vendor_delivery_method', {
        p_order_id: order.dbId,
        p_delivery_method: method
      });
      if (error) throw error;
      order.delivery_method = method;
      order.vendor_delivery_requested = method === 'rider';
      order.fee = data.fee;
      order.rider_delivery_share = data.rider_delivery_share;
      order.company_delivery_share = data.company_delivery_share;
      if (method === 'rider') {
        const payment = await supabaseEdgeFunctionRequest('paystack-initialize-delivery', {
          order_id: order.dbId
        });
        if (!payment || !payment.authorization_url) throw new Error('Vendor delivery payment could not be initialized');
        order.delivery_payment_status = 'pending';
        save();
        window.location.href = payment.authorization_url;
        return;
      }
      save();
      toast(data.delivery_method === 'rider' ? 'Rider requested — awaiting rider' : 'Self delivery confirmed');
      render();
    } catch (err) {
      console.error('Vendor delivery choice failed:', err);
      order.delivery_method = prevMethod;
      save();
      toast('Failed: ' + (err.message || 'unknown error'), 'error');
      render();
    }
  }
  // Vendor responds to vendor request (accept/decline)
  const vrespond = e.target.closest('[data-vendor-respond]'); if (vrespond) {
    const order = state.vendorOrders.find(x => x.id === vrespond.dataset.vendorRespond);
    const action = vrespond.dataset.action; // 'accept' or 'decline'
    if (!order || !action) return;
    if (!(await DropzyyModal.confirm({ title: action === 'accept' ? 'Accept this request?' : 'Decline this request?', message: action === 'accept' ? 'The customer will be notified and you can arrange payment directly.' : 'The customer will be notified that you cannot fulfill this request.', confirmText: action === 'accept' ? 'Accept' : 'Decline', danger: action === 'decline' }))) return;
    const prev = order.status;
    try {
      const { data, error } = await supabase.rpc('vendor_respond_to_request', {
        p_order_id: order.dbId,
        p_action: action
      });
      if (error) throw error;
      order.status = data.status;
      order.vendor_decision_at = data.vendor_decision_at || new Date().toISOString();
      save();
      toast(`Request ${action}ed`);
      render();
    } catch (err) {
      console.error('Vendor respond failed:', err);
      order.status = prev;
      save();
      toast('Failed to ' + action + ': ' + (err.message || 'unknown error'), 'error');
      render();
    }
  }
  if(e.target.id==='riderToggle' && state.rider){
    // Safety guard: never toggle availability while carrying an active
    // delivery (the UI also disables the button in this case).
    const hasActive = (state.riderPool || []).some(o =>
      (o.status === 'Rider assigned' || o.status === 'Picked up' || o.status === 'On the Way')
      && (o.delivery_method ?? 'rider') !== 'vendor_self'
    );
    if (hasActive) { toast('Finish your active delivery before going offline', 'info'); render(); return; }
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
  if(e.target.id==='logoutBtn'){
    // Clear ONLY this account's in-memory/session UI state. Supabase orders are
    // never deleted/overwritten — they are reloaded fresh for the next sign-in..
    state.user=null; state.rider=null; state.orders=[]; state.riderPool=[]; resetVendorSessionState(); save();
    // Tear down any realtime channel bound to the previous user's session (recreated
    // for the next sign-in by subscribeNotificationsRealtime()).
    if(typeof supabase!=='undefined' && supabase){
      if(state.notificationsChannel){ supabase.removeChannel(state.notificationsChannel).catch(()=>{}); state.notificationsChannel=null; }
      supabase.auth.signOut().catch(()=>{});
    }
    location.hash='#/'; toast('Signed out','info');
  }
});

// F20: clear inline password-validation errors as soon as the user edits the field.
document.addEventListener('input', e => {
  const t = e.target;
  if (t && (t.id === 'authPassword' || t.id === 'authConfirmPassword')) t.removeAttribute('aria-invalid');
});

document.addEventListener('submit', e=>{
  if(e.target.id==='profileForm'){e.preventDefault(); submitProfileForm(e.target); return;}
  if(e.target.id==='riderRatingForm'){e.preventDefault(); submitRiderRatingForm(e.target); return;}
  if(e.target.id==='vendorProductForm'){e.preventDefault(); submitVendorProductForm(e.target); return;}
  if(e.target.id==='heroSearch'||e.target.id==='browseSearch'){e.preventDefault(); location.hash=`#/browse?q=${encodeURIComponent(new FormData(e.target).get('q'))}`;}
  if(e.target.id==='reportForm'){e.preventDefault(); submitIssueReport(new FormData(e.target)); return;}
  if(e.target.id==='vendorApplyForm'){e.preventDefault(); submitVendorApplication(new FormData(e.target)); return;}
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
        const c=document.getElementById('authConfirmPassword');
        if(c){ c.setAttribute('aria-invalid','true'); c.focus(); }
        return;
      }
      if(password.length<6){
        toast('Password must be at least 6 characters','error');
        const p=document.getElementById('authPassword');
        if(p){ p.setAttribute('aria-invalid','true'); p.focus(); }
        return;
      }
      const full_name=f.get('name')||'';
      const phone=f.get('phone')||'';
      const hostel=f.get('hostel')||'';
      supabase.auth.signUp({ email, password, options: { data: { full_name, phone, hostel } } })
        .then(async ({ data, error }) => {
          if(error){ toast(error.message,'error'); return; }
          if(data.user){
            if(data.session){
              // Email confirmation is DISABLED: signUp returned an authenticated
              // session, so auth.uid() is set and the profiles_insert_own RLS
              // policy (WITH CHECK id = auth.uid()) permits the INSERT.
              // Create the profile now with the default role ('user').
              const { error: profileError } = await supabase
                .from('profiles')
                .insert({ id: data.user.id, email, full_name, phone, hostel, role: 'user' });
              if(profileError){ console.error('Profile insert error:', profileError); toast('Could not create your profile: ' + profileError.message,'error'); }
            } else {
              // Email confirmation is REQUIRED: signUp returned a user but no
              // session, so the client is unauthenticated and auth.uid() is NULL.
              // The profiles_insert_own RLS policy (WITH CHECK id = auth.uid())
              // would reject the INSERT, so we must NOT attempt it here. The
              // signup metadata (full_name/phone/hostel) was already persisted by
              // Supabase in auth.users.user_metadata via signUp's options.data,
              // and the profile row is created safely on the next sign-in (login
              // handler below) once a session — and therefore auth.uid() — exists.
            }
          }
          if(data.session){
            // Email confirmation is disabled — sign the user in immediately.
            state.user={name:full_name||email.split('@')[0],email,role:'user'};
            save();
            resetVendorSessionState();
            await loadRiderFromSupabase();
            await loadOrdersFromSupabase();
            addNotification('You\'re signed in','Start exploring what\'s available around campus.');
            location.hash='#/';
            toast('Welcome to Dropzyy!');
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
            if(!profile && data.session){
              // Deferred profile creation: the user signed up with email
              // confirmation enabled (signUp returned no session, so no profile
              // could be inserted at signup). signInWithPassword has now
              // established a session, so auth.uid() is set and the
              // profiles_insert_own RLS policy permits the INSERT. Build the
              // row from user_metadata (set by signUp's options.data) with the
              // default role ('user'). The INSERT runs only when a session
              // exists; any error is surfaced via toast (not silently logged).
              const md = (data.user.user_metadata) || {};
              const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                  id: data.user.id,
                  email: data.user.email || email,
                  full_name: md.full_name || '',
                  phone: md.phone || '',
                  hostel: md.hostel || '',
                  role: 'user'
                });
              if(profileError){ console.error('Profile insert error:', profileError); toast('Could not create your profile: ' + profileError.message,'error'); }
              if(md.full_name) name = md.full_name;
            }
          }
          state.user={name,email,role,vendor_id};
          save();
          // A NEW session is established: drop any previous account's vendor
          // dashboard/withdrawal state so ensureVendorLoaded() refetches for
          // THIS user (never reuse a prior vendor's vendorLoaded === true).
          resetVendorSessionState();
          // Reload the rider record for THIS session, then the Rider Hub order pool
          // (assigned orders included) from Supabase — never reuse a prior user's
          // stale cached pool..
          await loadRiderFromSupabase();
          await loadOrdersFromSupabase();
          addNotification('You\'re signed in','Start exploring what\'s available around campus.');
          // A session now exists: load this user's notifications and start the
          // realtime subscription for them (no-op-safe, re-uses the channel).
          loadNotificationsFromSupabase();
          subscribeNotificationsRealtime();
          location.hash='#/';
          toast('Welcome to Dropzyy!');
        });
    }
  }
  if(e.target.id==='checkoutForm'){
    e.preventDefault();
    if(state.checkoutSubmitting){ toast('Order is being placed — please wait…', 'info'); return; }
    // Require the user to be logged in before placing an order
    if(!state.user){ toast('Please sign in to place an order','info'); location.hash='#/login'; return; }
    const f=new FormData(e.target);
    const items=cartItems();
    const unavailableItem=items.find(x => x.active === false);
    if (unavailableItem){ toast(`Order failed: "${unavailableItem.name}" is no longer available — remove it from your cart and try again.`, 'error'); return; }

    // Split cart by vendor type: restaurant vs vendor
    const restaurantItems = [];
    const vendorItemsByVendor = {}; // vendor_id -> items[]

    items.forEach(item => {
      const v = vendor(item.vendor);
      if (v && v.is_restaurant === false) {
        // Vendor product
        if (!vendorItemsByVendor[item.vendor]) vendorItemsByVendor[item.vendor] = [];
        vendorItemsByVendor[item.vendor].push(item);
      } else {
        // Restaurant product (or unknown vendor defaults to restaurant flow)
        restaurantItems.push(item);
      }
    });

    // The checkout form no longer collects a delivery note: there is no
    // delivery_note column on orders and neither place_order nor
    // create_vendor_order_request accepts one, so the old note field and
    // its concatenation were dead code and have been removed.
    const spot = `${f.get('location')}: ${f.get('spot')}`;

    if (typeof supabase === 'undefined' || !supabase) {
      toast('Order failed: Supabase client not available', 'error');
      return;
    }
    state.checkoutSubmitting = true;

    getSupabaseUserId().then(async userId => {
      if(!userId){
        toast('Order failed: Not authenticated with Supabase', 'error');
        state.checkoutSubmitting = false;
        return;
      }

      let anySuccess = false;
      let firstOrderId = null;

      try {
        // 1. Handle restaurant items (existing flow)
        if (restaurantItems.length > 0) {
          const subtotal = restaurantItems.reduce((n, x) => n + x.price * x.qty, 0);
          const fee = DELIVERY_FEE;
          const total = subtotal + fee;
          const order = {
            id: null, items: restaurantItems, subtotal, fee, total,
            status: 'Order confirmed', payment_status: 'pending',
            spot, created: 'Just now', delivery_method: 'rider',
            idempotency_key: getOrCreateOrderAttempt('place_order', restaurantItems.map(item => ({ id: String(item.id), qty: Number(item.qty) })), spot, userId).key
          };
          order.user_id = userId;
          const saved = await saveOrderToSupabase(order);
          if (saved) {
            anySuccess = true;
            if (!firstOrderId) firstOrderId = order.id;
            state.orders.unshift(order);
          } else {
            toast('Restaurant order failed: ' + (state.lastOrderError || 'unknown error'), 'error');
          }
        }

        // 2. Handle vendor items - one request per vendor
        for (const [vendorId, vItems] of Object.entries(vendorItemsByVendor)) {
          const order = {
            id: null, items: vItems, subtotal: 0, fee: 0, total: 0,
            status: 'Order confirmed', payment_status: 'pending_vendor',
            spot, created: 'Just now', delivery_method: 'both',
            request_type: 'vendor_request', vendor_delivery_requested: false,
            idempotency_key: getOrCreateOrderAttempt('create_vendor_order_request', vItems.map(item => ({ id: String(item.id), qty: Number(item.qty) })), spot, userId).key
          };
          order.user_id = userId;
          const saved = await saveVendorOrderRequestToSupabase(order);
          if (saved) {
            anySuccess = true;
            if (!firstOrderId) firstOrderId = order.id;
            state.orders.unshift(order);
          } else {
            const vname = vendor(vendorId)?.name || vendorId;
            toast(`Vendor request failed for ${vname}: ` + (state.lastOrderError || 'unknown error'), 'error');
          }
        }

        if (anySuccess) {
          state.cart = [];
          save();
          if (firstOrderId) {
            // If there's a restaurant order, redirect to payment
            // If only vendor requests, show confirmation
            const hasRestaurantOrder = restaurantItems.length > 0;
            if (hasRestaurantOrder) {
              location.hash = `#/pay/${firstOrderId}`;
              toast('Order placed — redirecting to payment...');
            } else {
              // All vendor requests - show confirmation page
              location.hash = `#/vendor-requests`;
              toast('Order request(s) sent! Vendors will contact you to arrange payment.');
            }
          }
        } else {
          toast('Order failed: Could not save to Supabase', 'error');
        }
      } finally {
        state.checkoutSubmitting = false;
      }
    });
  }
  if(e.target.id==='riderForm'){
    e.preventDefault();
    submitRiderApplication(new FormData(e.target));
  }
  if(e.target.id==='withdrawalForm'){
    e.preventDefault();
    requestWithdrawal(new FormData(e.target).get('amount'));
  }
});

// F19: keep the theme toggle's current state communicated (aria-pressed) and
// reflected in its title. Emoji/icon rendering and visuals are unchanged.
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('title', dark ? 'Currently dark — switch to light' : 'Currently light — switch to dark');
  }
}
$('#themeBtn').addEventListener('click',()=>{ const next=document.documentElement.dataset.theme==='dark'?'light':'dark'; applyTheme(next); localStorage.setItem('campusrun_theme',next); });
// Shared dropdown panel control: toggles the panel and keeps the trigger
// button's aria-expanded in sync on EVERY open/close path (button click,
// outside click, Escape). Set open=true to expand, false to collapse.
function setDropdownOpen(triggerId, panelId, open){
  const btn=document.getElementById(triggerId);
  const panel=document.getElementById(panelId);
  if(!btn || !panel) return;
  panel.hidden=!open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
$('#notifBtn').addEventListener('click',()=>{ setDropdownOpen('notifBtn','notifPanel', $('#notifPanel').hidden); loadNotificationsFromSupabase(); }); $('#userBtn').addEventListener('click',()=>setDropdownOpen('userBtn','userPanel', $('#userPanel').hidden)); $('#notifClear').addEventListener('click',()=>markAllNotificationsRead());
document.addEventListener('click',e=>{if(e.target.closest('[data-notif-read]')){e.stopPropagation();markNotificationRead(e.target.closest('[data-notif-read]').getAttribute('data-notif-read'));return;}if(!e.target.closest('#notifWrap'))setDropdownOpen('notifBtn','notifPanel',false); if(!e.target.closest('#userWrap'))setDropdownOpen('userBtn','userPanel',false);});
// Escape closes open dropdown panels (account + notifications) — ARIA stays in sync.
// Skip-to-content: preventDefault so the bare "#app" hash never collides with
// the "#/route" router, and focus the routed main container without scrolling.
const skipLink=document.getElementById('skipLink');
if(skipLink){ skipLink.addEventListener('click',e=>{ e.preventDefault(); const main=document.getElementById('app'); if(main && typeof main.focus==='function') main.focus({ preventScroll: true }); }); }

document.addEventListener('keydown',e=>{if(e.key==='Escape'){setDropdownOpen('userBtn','userPanel',false); setDropdownOpen('notifBtn','notifPanel',false);}});

// Cross-tab sync: when another tab/page (e.g. the admin panel) writes to
// localStorage, refresh the in-memory catalog and re-render so the customer
// site reflects admin changes live. Also refresh when the tab becomes visible.
window.addEventListener('storage', (e) => {
  if (e.key === 'campusrun_catalog_v3') {
    state.catalog = load('catalog_v3', clone(SEED_DATA));
    render();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    state.catalog = load('catalog_v3', clone(SEED_DATA));
    render();
  }
});

// Refund Request page: form submit handling (delegated — the page is
// re-rendered on every route change, so listeners live at document level).
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form || form.id !== 'refundRequestForm') return;
  e.preventDefault();
  const dbId = form.querySelector('input[name="orderDbId"]').value;
  const paymentTypeField = form.querySelector('[name="paymentType"]');
  const paymentType = paymentTypeField ? paymentTypeField.value : null;
  const textarea = form.querySelector('textarea[name="reason"]');
  const reason = (textarea ? textarea.value : '').trim();
  const errEl = $('#refundReasonError');
  const submitBtn = $('#refundSubmitBtn');
  const fail = (msg) => { if (errEl) errEl.textContent = msg; toast(msg, 'error'); };
  if (errEl) errEl.textContent = '';
  // Complaint is required and must be meaningful (not a very short stub).
  if (!reason) return fail('Please explain the issue with your order before submitting.');
  if (reason.length < REFUND_REASON_MIN) return fail(`Please add a little more detail (at least ${REFUND_REASON_MIN} characters).`);
  // Double-click / double-submission guard.
  if (state.refundSubmitting) return;
  state.refundSubmitting = true;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
  let result = false;
  try {
    result = await requestRefund(dbId, reason, paymentType);
  } finally {
    state.refundSubmitting = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Refund Request'; }
  }
  // Re-render only on success so a failed attempt keeps the typed complaint.
  if (result === true) { state.refundSuccessNotice = dbId; render(); }
  else if (result === 'existing') { render(); }
});

// Live character counter for the refund complaint textarea.
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'refundReasonInput') {
    const counter = $('#refundReasonCount');
    if (counter) counter.textContent = `${e.target.value.length} / ${REFUND_REASON_MAX}`;
  }
});

// Live character counter for the issue report / vendor application textarea.
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'reportDescription') {
    const counter = $('#reportDescCount');
    const errorEl = $('#reportDescError');
    if (counter) counter.textContent = `${e.target.value.length} / ${REPORT_DESC_MAX}`;
        if (errorEl && e.target.value.length >= REPORT_DESC_MIN) errorEl.textContent = '';
  }
});

// Broken-image guard. When a product/vendor photo fails to load (stale or
// unreachable URL), remove the <img> so the card's emoji/icon fallback shows
// through. <img> error events do not bubble, but they DO fire in the capture
// phase, so this listener is attached at the document level — matching the
// app's existing delegated-listener pattern for pages re-rendered into $app
// on every route change (see the refund/submit listeners above).
document.addEventListener('error', (e) => {
  if (e.target && e.target.nodeName === 'IMG') e.target.remove();
}, true);

applyTheme(localStorage.getItem('campusrun_theme')||'light'); $('#year').textContent=new Date().getFullYear();
// Footer support email — kept in sync with the single DROPZYY_SUPPORT_EMAIL
// constant so the address is pasted/changed in one place only.
const footerEmailLink=$('#footerEmail'); if(footerEmailLink){ const em=String(DROPZYY_SUPPORT_EMAIL||'').trim(); if(em){ footerEmailLink.textContent=em; footerEmailLink.href='mailto:'+em; } }

// ============================================
// Deep-link bootstrap: real URL path -> SPA hash route
// ============================================
// The router is hash-based (render() reads location.hash only). Netlify serves
// this same shell for real paths such as /orders or /rider using a 200 rewrite
// (so the address bar keeps the pretty path), and without this bootstrap those
// requests arrived with an empty hash and silently rendered the home route.
//
// Deliberately narrow:
//   * only route prefixes the router actually understands are mapped;
//   * an existing "#/..." hash ALWAYS wins, so normal in-app navigation and
//     every existing link are untouched;
//   * unknown paths are left alone, so the pre-existing "no hash -> #/"
//     fallback below still applies.
// history.replaceState is used because it does NOT fire a hashchange event, so
// boot still renders exactly once and no extra history entry is created.
// location.search is preserved verbatim so the Paystack return parameters
// (?reference= / ?trxref=) reach handlePaystackReturn().
const PATH_ROUTE_PREFIXES = [
  'browse', 'vendors', 'vendor', 'product', 'cart', 'checkout', 'orders',
  'order', 'track', 'refund', 'pay', 'profile', 'login', 'register', 'faqs',
  'report', 'report-issue', 'vendor-requests', 'rider'
];
function pathRouteFromLocation() {
  const segments = location.pathname.split('/').filter(Boolean);
  if (!segments.length) return '';                  // "/" -> home
  if (segments[0].toLowerCase() === 'admin') {
    return segments[1] === 'login' ? '#/admin/login' : '#/admin';
  }
  if (!PATH_ROUTE_PREFIXES.includes(segments[0].toLowerCase())) return '';
  return '#/' + segments.join('/');
}
function applyPathRouteBootstrap() {
  if (location.hash) return;                        // an existing hash wins
  const route = pathRouteFromLocation();
  if (!route) return;                               // leave "" for the fallback
  history.replaceState(null, '', location.pathname + location.search + route);
}
applyPathRouteBootstrap();

window.addEventListener('hashchange', () => {
  // If we're navigating away from a track page, tear down the live
  // channel + poll so neither leaks across route changes.
  if (!location.hash.startsWith('#/track/')) clearTrackSubscription();
  render().then(()=>{
    // #app keeps tabindex="-1" so it can receive programmatic focus without
    // turning up in the tab order. preventScroll avoids a focus-induced scroll
    // jump on top of render()'s deliberate scrollTo-top.
    const main=document.getElementById('app');
    if(main && typeof main.focus==='function') main.focus({ preventScroll: true });
  });
}); if(!location.hash) location.hash='#/'; else render();

// Load the catalog from Supabase (falls back to localStorage on failure).
loadCatalogFromSupabase();

// Realtime (push): subscribe ONCE so vendor availability flips propagate to
// the customer site live. Re-renders never re-subscribe (see the guard in
// subscribeProductsRealtime), so the channel is created exactly once.
subscribeProductsRealtime();

// Load the authenticated user's orders from Supabase (falls back to localStorage).
loadOrdersFromSupabase();

// Load the authenticated user's rider status from Supabase.
loadRiderFromSupabase();

// Load the authenticated rider's own withdrawal requests from Supabase
// (RLS: own rows only). No-op for non-riders.
loadWithdrawalsFromSupabase();

// Load the signed-in user's notifications from Supabase (RLS: own rows only).
loadNotificationsFromSupabase();

// Realtime (push): subscribe to this user's notifications so the unread badge
// and list update without a manual refresh. Falls back to the pull-based
// loader above (panel open / login / boot) when Realtime is unavailable.
subscribeNotificationsRealtime();
// NOTE: handlePaystackReturn() is deliberately NOT called here. It requires
// state.user (it can only confirm a payment against the signed-in user's own
// orders) and state.user is populated by the async session restore below, so
// calling it at this point always returned immediately and the whole
// payment-return flow was dead. It is invoked at the end of the session
// restore instead.


// Session persistence: restore the Supabase session on load so a page refresh
// keeps the user signed in (and restores their profile name).
supabase.auth.getSession().then(({ data: { session } }) => {
  if(session && session.user){
    supabase.from('profiles').select('full_name, role, vendor_id').eq('id', session.user.id).single()
      .then(async ({ data: profile }) => {
        const userRole = (profile && profile.role) || 'user';
        if(!profile){
          // No profiles row exists for this authenticated session — create a
          // default customer profile from the signup metadata stored in
          // user_metadata. A session exists (getSession) so auth.uid() is set
          // and the profiles_insert_own RLS policy permits the INSERT. role is
          // strictly 'user'; an existing profile is never modified.
          const md = (session.user.user_metadata) || {};
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: session.user.id,
              email: session.user.email,
              full_name: md.full_name || '',
              phone: md.phone || '',
              hostel: md.hostel || '',
              role: 'user'
            });
          if(insertError){
            console.error('Profile insert error:', insertError);
            toast('Could not create your profile: ' + insertError.message,'error');
          }
        }
        state.user={name:(profile && profile.full_name) || session.user.email.split('@')[0],email:session.user.email,role:userRole,vendor_id:(profile && profile.vendor_id) || null};
        save();
        // Session restored: explicitly reload the rider record and the Rider Hub orders
        // (pool + assigned orders) from Supabase for THIS user before rendering..
        await loadRiderFromSupabase();
        await loadOrdersFromSupabase();
        render();
        // Paystack return: state.user and this user's orders are finally
        // available, so a ?reference= / ?trxref= left in the URL can be
        // resolved and confirmed. No-op when the URL has no reference.
        await handlePaystackReturn();
      })
      .catch(async ()=>{
        state.user={name:session.user.email.split('@')[0],email:session.user.email,role:'user'};
        save();
        await loadRiderFromSupabase();
        await loadOrdersFromSupabase();
        render();
        // Same as the branch above: only now is there an authenticated user to
        // match the returned payment reference against.
        await handlePaystackReturn();
      });
  }
});
