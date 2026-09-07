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

const $ = s => document.querySelector(s);
const money = n => `₦${Number(n).toLocaleString('en-NG')}`;
const store = (key, value) => localStorage.setItem(`campusrun_${key}`, JSON.stringify(value));
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`campusrun_${key}`)) ?? fallback; } catch { return fallback; } };
const clone = value => JSON.parse(JSON.stringify(value));
// Escape user-controlled text before it is inserted into innerHTML/template
// literals. Prevents HTML/XSS injection via names, descriptions, spots,
// comments, notifications, etc.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&' + 'amp;', '<': '&' + 'lt;', '>': '&' + 'gt;', '"': '&' + 'quot;', "'": '&' + '#39;' }[c]));
const state = { cart: load('cart', []), orders: [], user: null, notifications: load('notifications', [{ title: 'Welcome to Dropzyy', body: 'Order campus essentials and track every step.', time: 'Just now', unread: true }]), notificationsLoading: false, notificationsError: false, notificationsChannel: null, catalog: load('catalog_v3', clone(SEED_DATA)), rider: null, riderPool: [], vendorOrders: [], vendorProducts: [], withdrawals: [], withdrawalsLoaded: false, withdrawalsError: null, withdrawalSubmitting: false, vendorLoaded: false, vendorLoadError: null, riderLoaded: false, ordersLoadError: false, catalogLoadError: false, riderLoadError: false };

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
      supabase.from('products').select('*').eq('active', true)
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
      image: v.image || '', description: v.description || '',
      opening_hours: v.opening_hours || ''
    }));
    const products = productsRes.data.map(p => ({
      id: p.id, vendor: p.vendor_id, name: p.name, desc: p.desc, price: p.price,
      icon: p.icon, category: p.category, image: p.image || ''
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
function toast(message, kind = 'success') { const el = document.createElement('div'); el.className = `toast toast--${kind}`; el.textContent = message; $('#toastRoot').append(el); setTimeout(() => el.remove(), 3400); }
function addCart(id) { const p = product(id); const line = state.cart.find(x => x.id === p.id); if (line) line.qty++; else state.cart.push({ id: p.id, qty: 1 }); save(); toast(`${p.name} added to your cart`); }
function cartItems() { return state.cart.map(x => ({ ...product(x.id), qty: x.qty })); }
function cartTotal() { return cartItems().reduce((n, x) => n + x.price * x.qty, 0); }

// ============================================
// Order number generation (ACTION 9)
// ============================================
// Previously orders used CR- + 4 random digits, which collided easily.
// Delivery fee: flat ₦1,000 campus delivery charge, kept strictly separate
// from the product subtotal everywhere it is used.
const DELIVERY_FEE = 1000;

// B5: rider/deliverer receives 80% of the delivery fee, Dropzyy 20%.
// For the flat ₦1,000 fee: rider = ₦800, Dropzyy = ₦200.
// Authoritative rider share — never derived from browser input.
const RIDER_FEE_SHARE = 0.8;
// Rider earnings for a single delivery (authoritative 80% of the DB fee).
function riderShareAmount(fee) {
  return Math.round((fee || DELIVERY_FEE) * RIDER_FEE_SHARE);
}

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

// ============================================
// Rider earnings & withdrawal requests (ACTION 10, B5 cutover)
// ============================================
// Earnings are NEVER client-supplied. They are always DERIVED from the
// authoritative 80% rider share of the delivery fee (B5: rider = 80%,
// Dropzyy = 20%) on the rider's completed (Delivered) deliveries.
// The rider share is computed by riderShareAmount() — exactly the same
// rounding rule the server-side settlement RPC uses — so the figure always
// matches the delivery_settlements.rider_amount that backs real payouts.
// Because no settlement/payout has occurred, every figure is clearly
// labelled as an ESTIMATE and PENDING.
function riderCompletedDeliveries() {
  return (state.riderPool || []).filter(o =>
    o.status === 'Delivered' && (o.delivery_method || 'rider') !== 'vendor_self'
  );
}
// Estimated pending earnings = sum of the authoritative 80% rider share
// on completed deliveries (B5: rider/deliverer = 80% of delivery fee).
function riderPendingEarnings() {
  return riderCompletedDeliveries().reduce((n, o) => n + riderShareAmount(o.fee), 0);
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
    const { error } = await supabase
      .from('withdrawal_requests')
      .insert({ rider_id: state.rider.id, amount: value, status: 'pending' });
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

// Full absolute timestamp for the order details view (ACTION 9).
function formatFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Load the authenticated user's orders from Supabase (orders + order_items)
// and map them into the existing frontend order shape. Supabase is the
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
      subtotal: o.subtotal != null ? o.subtotal : (o.total - (o.fee || DELIVERY_FEE)),
      fee: o.fee || DELIVERY_FEE,
      status: o.status || 'Order confirmed',
      payment_status: o.payment_status || 'pending',
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

    // 5. Replace local orders entirely with the Supabase result. Supabase queries here are
    //    scoped to the authenticated user (user_id = session.user.id), so this is the
    //    authoritative per-user order set. We do NOT merge with stale localStorage orders —
    //    that merge was the root cause of one user's orders leaking into another user's view
    //    after logout/login. Orders placed earlier in this session were persisted via the
    //    place_order RPC and are included in this Supabase result.
    state.orders = supabaseOrders;

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
            if (payload && payload.new) upsertNotificationFromRow(payload.new, true);
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
  return `<article class="pcard">
    <a class="pcard__link" href="#/product/${p.id}">
      <div class="pcard__thumb">
        <span class="pcard__thumb-fallback">${esc(p.icon)}</span>
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ''}
      </div>
      <div class="pcard__name">${esc(p.name)}</div>
    </a>
    <div class="pcard__vendor">${esc(v ? v.name : 'Campus vendor')}</div>
    <div class="pcard__desc">${esc(p.desc)}</div>
    <div class="pcard__foot"><span class="price">${money(p.price)}</span><button class="btn btn--soft btn--sm" data-add="${p.id}">Add +</button></div>
  </article>`;
}
function vendorCard(v) {
  const status = vendorOpenStatus(v);
  const img = safeImageUrl(v.image);
  return `<a class="vcard" href="#/vendor/${esc(v.id)}">
    <div class="vcard__cover" style="background:${esc(v.cover)}">
      <span class="vcard__cover-fallback">${esc(v.icon)}</span>
      ${img ? `<img src="${esc(img)}" alt="${esc(v.name)}" loading="lazy" onerror="this.remove()">` : ''}
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

function home() {
  const vcount = data().vendors.length;
  const drinks = data().products.filter(p => p.category === 'Drinks');
  const books = data().products.filter(p => p.category === 'Bookshop');
  return `${catalogBanner()}<section class="hero"><div class="container hero__inner"><div><span class="hero__eyebrow">⚡ Built by students, for students</span><h1>Anything on campus.<br>At your door.</h1><p>Food, books, essentials and more — delivered by a fellow student whenever you need it.</p><form class="searchbar" id="heroSearch"><span>🔎</span><input name="q" placeholder="Search food, snacks, books..." autocomplete="off"><button class="btn btn--accent" type="submit">Find it</button></form><div class="hero__stats"><div class="hero__stat"><b>25 min</b><span>average delivery</span></div><div class="hero__stat"><b>${vcount}</b><span>campus restaurants</span></div><div class="hero__stat"><b>₦1,000</b><span>delivery from</span></div></div></div><div class="hero__art"><div class="hero__card"><span>🍜</span><div><b>Order placed</b><small>Indomie Special from Staff Caf.</small></div><em>✓</em></div><div class="hero__card"><span>🛵</span><div><b>Rider on the way</b><small>Your rider is 4 mins away</small></div><em>→</em></div><div class="hero__card"><span>🏠</span><div><b>Delivered to your hostel</b><small>Enjoy your order!</small></div><em>★</em></div></div></div></section><section class="section container"><div class="page-head"><div><h2>What do you need today?</h2><p>Pick a category and get it delivered around campus.</p></div></div><div class="grid grid--4">${[['🍔','Food','Fresh campus favourites','Food'],['🍞','Hostel meals','Quick & filling','Meals'],['🍿','Snacks','Study fuel','Snacks'],['🥤','Drinks','Cold beverages & refreshments','Drinks'],['📚','Book Shop','Textbooks & materials','Bookshop']].map((c,i)=>`<a class="cat" href="#/browse?cat=${c[3]}"><span class="cat__icon">${c[0]}</span><b>${c[1]}</b><small>${c[2]}</small></a>`).join('')}</div></section><section class="section container"><div class="page-head"><div><h2>Popular around campus</h2><p>Student favourites, ready when you are.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">See all items →</a></div><div class="grid grid--4">${data().products.slice(0,4).map(productCard).join('')}</div></section>${drinks.length?`<section class="section container"><div class="page-head"><div><h2>🥤 Drinks & Beverages</h2><p>Cold drinks, juices and refreshments delivered fast.</p></div><a class="btn btn--ghost btn--sm" href="#/browse?cat=Drinks">View all drinks →</a></div><div class="grid grid--4">${drinks.slice(0,4).map(productCard).join('')}</div></section>`:''}${books.length?`<section class="section container"><div class="page-head"><div><h2>📚 Book Shop</h2><p>Textbooks, stationery and study essentials.</p></div><a class="btn btn--ghost btn--sm" href="#/browse?cat=Bookshop">Visit the Book Shop →</a></div><div class="grid grid--4">${books.slice(0,4).map(productCard).join('')}</div></section>`:''}<section class="section container"><div class="page-head"><div><h2>Campus restaurants</h2><p>Reliable campus kitchens students love.</p></div><a class="btn btn--ghost btn--sm" href="#/vendors">View restaurants →</a></div><div class="scroll-x">${data().vendors.map(vendorCard).join('')}</div></section>`;
}

function browse() {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const q = (params.get('q') || '').toLowerCase();
  const cat = params.get('cat') || 'All';
  const cats = ['All','Food','Meals','Snacks','Drinks','Bookshop'];
  const vname = p => (vendor(p.vendor) || { name: '' }).name;
  const list = data().products.filter(p => (cat === 'All' || p.category === cat) && `${p.name} ${p.desc} ${vname(p)}`.toLowerCase().includes(q));
  return `${catalogBanner()}<section class="section container"><div class="page-head"><div><h1>Browse campus finds</h1><p>Everything you need, from trusted student vendors.</p></div></div><div class="card card--pad-sm mb-2"><form class="searchbar" id="browseSearch"><span>🔍</span><input name="q" value="${q}" placeholder="Search items or vendors"><button class="btn" type="submit">Search</button></form></div><div class="chips mb-2">${cats.map(x=>`<a class="chip ${cat===x?'is-active':''}" href="#/browse?cat=${x}">${x}</a>`).join('')}</div><div class="row row--between mb-1"><span class="muted small">${list.length} items available</span><span class="badge badge--success">● Delivering now</span></div><div class="grid grid--4">${list.length ? list.map(productCard).join('') : empty('🔍','No matches found','Try another search or category.').replace(/<div class="empty">/, '<div class="empty" style="grid-column:1/-1">')}</div></section>`;
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
  return `<section class="section container">
    <a href="#/vendors" class="muted small">← All vendors</a>
    <div class="card mt-1" style="background:linear-gradient(135deg,${esc(v.cover)},var(--surface));">
      <div class="row">
        <div class="vcard__cover" style="width:74px;height:74px;background:var(--surface);border-radius:16px;flex:none;position:relative;overflow:hidden">
          <span class="vcard__cover-fallback">${esc(v.icon)}</span>
          ${img ? `<img src="${esc(img)}" alt="${esc(v.name)}" loading="lazy" onerror="this.remove()" style="width:100%;height:100%;object-fit:cover;position:relative;z-index:1">` : ''}
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
    <div class="page-head mt-3"><div><h2>Menu</h2><p>Tap a product for details, or add it straight to your order.</p></div></div>
    <div class="grid grid--4">${items.length ? items.map(productCard).join('') : empty('🍽️','No menu items yet','This vendor has not added any products.')}</div>
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
        ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ''}
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
  return `<section class="section container"><div class="page-head"><div><h1>Your cart</h1><p>${items.length ? 'Review your items before checkout.' : 'Your next campus find awaits.'}</p></div></div>${!items.length ? empty('🛒','Your cart is empty','Explore campus vendors and add what you need.','<a class="btn mt-1" href="#/browse">Browse items</a>') : `<div class="split"><div class="card">${items.map(x=>`<div class="line"><div class="line__thumb">${esc(x.icon)}</div><div class="line__main"><div class="line__name">${esc(x.name)}</div><div class="line__sub">${esc((vendor(x.vendor) || { name: 'Campus vendor' }).name)} · ${money(x.price)}</div></div><div class="qty"><button data-qty="${x.id}" data-delta="-1">−</button><span>${x.qty}</span><button data-qty="${x.id}" data-delta="1">+</button></div><b>${money(x.qty*x.price)}</b><button class="link-btn" data-remove="${x.id}" title="Remove item" aria-label="Remove item from cart">✕</button></div>`).join('')}</div><aside class="card sticky-side"><div class="card__head"><h3>Order summary</h3></div><div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>Delivery fee</span><span>${money(fee)}</span></div><div><span>Service fee</span><span>₦0</span></div><div class="totals__grand"><span>Total</span><span>${money(subtotal+fee)}</span></div></div><a class="btn btn--block mt-2" href="#/checkout">Checkout · ${money(subtotal+fee)}</a><p class="muted xs center mt-1 mb-0">Secure payment in Nigerian Naira</p></aside></div>`}</section>`;
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
// products, applies the flat ₦1,000 delivery fee, generates the order
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

  const { data, error } = await supabase.rpc('place_order', {
    p_items: lines,
    p_spot: order.spot
  });

  if (error) {
    console.error('place_order RPC failed:', error);
    return null;
  }
  if (!data || !data.order) {
    console.error('place_order returned no order row.');
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
}

async function loadVendorDataFromSupabase() {
  state.vendorLoaded = true;
  state.vendorLoadError = null;
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
      fee: o.fee || DELIVERY_FEE,
      status: o.status || 'Order confirmed',
      spot: o.spot || '',
      delivery_method: o.delivery_method || 'rider',
      rider_id: o.rider_id || null,
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
  if (!state.user || state.user.role !== 'vendor' || !state.user.vendor_id) return false;
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
  if (!state.user || state.user.role !== 'vendor' || !state.user.vendor_id) return;
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
    toast(newActive ? 'Product is now live' : 'Product hidden from customers', 'info');
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
  if (!confirm(`Delete "${p.name}"? It will be removed from the customer menu. This cannot be undone from the vendor dashboard.`)) return;
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
  // value: it includes the ₦1,000 delivery fee and, on multi-vendor orders,
  // other vendors' items. o.items is the RLS-scoped own-lines list from
  // loadVendorDataFromSupabase().
  const mySubtotal = (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
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
  const pending = orders.filter(o => o.status === 'Order confirmed');
  const active = orders.filter(o => ['Preparing','Ready for pickup','Rider assigned','Picked up','On the Way'].includes(o.status));
  const completed = orders.filter(o => ['Delivered','Cancelled'].includes(o.status));
  // Vendor revenue = ONLY this vendor's own order_items (price × qty) on
  // Delivered orders. `orders.total` is deliberately NEVER used here: it
  // includes the flat ₦1,000 delivery fee (which belongs to the
  // deliverer/platform, not the vendor) and, on multi-vendor orders, other
  // vendors' items. `o.items` contains ONLY this vendor's own lines — they
  // are grouped in loadVendorDataFromSupabase() from the RLS-scoped
  // order_items query (order_items_select_vendor) — so this sum can never
  // include the delivery fee or another vendor's products.
  const revenue = orders
    .filter(o => o.status === 'Delivered')
    .reduce((n, o) => n + (o.items || []).reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0), 0);
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
    ? products.map(p => `<tr><td>${esc(p.icon)} <b>${esc(p.name)}</b>${p.desc?`<div class="muted small">${esc(p.desc)}</div>`:''}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td><span class="badge badge--${p.active!==false?'success':'warn'}">${p.active!==false?'Live':'Hidden'}</span></td><td><button class="link-btn" data-vp-edit="${p.id}">Edit</button> · <button class="link-btn" data-vp-toggle="${p.id}">${p.active!==false?'Hide':'Show'}</button> · <button class="link-btn btn--danger" data-vp-delete="${p.id}">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="muted center">No products yet — add your first item with the form.</td></tr>';

  return `<section class="section container">
    <div class="page-head"><div><span class="badge badge--brand">Vendor</span><h1 class="mt-1">${esc(name)}</h1><p class="muted">Manage orders and products.</p></div><a class="btn btn--ghost btn--sm" href="#/">← Back to site</a></div>
    <div class="grid grid--stats">
      <div class="stat stat--brand"><span class="stat__label">Pending</span><span class="stat__value">${pending.length}</span><span class="stat__hint">Awaiting action</span></div>
      <div class="stat"><span class="stat__label">Active</span><span class="stat__value">${active.length}</span><span class="stat__hint">Preparing / in transit</span></div>
      <div class="stat"><span class="stat__label">Completed</span><span class="stat__value">${completed.length}</span><span class="stat__hint">Delivered or cancelled</span></div>
      <div class="stat"><span class="stat__label">Product Revenue</span><span class="stat__value">${money(revenue)}</span><span class="stat__hint">Your own items on delivered orders · excludes the ₦1,000 delivery fee</span></div>
    </div>
    <div class="page-head mt-3"><div><h2>Pending orders</h2><p>Accept or reject incoming orders.</p></div></div>${pendingHtml}
    <div class="page-head mt-3"><div><h2>Active orders</h2><p>Orders you are preparing or delivering.</p></div></div>${activeHtml}
    <div class="page-head mt-3"><div><h2>Completed orders</h2><p>Delivered and cancelled history.</p></div></div>${completedHtml}
    <div class="page-head mt-3"><div><h2>Products</h2><p>Add, edit or hide the items on your menu.</p></div></div>
    ${state.vendorLoadError ? `<div class="card mb-2"><b>Could not load your products:</b> <span class="muted">${state.vendorLoadError}</span></div>` : ''}
    <div class="split mt-1">
      <form class="card stack" id="vendorProductForm">
        <div class="card__head"><h3 id="vendorProductFormTitle">Add Product</h3><button class="link-btn" type="button" id="vendorProductClear">Clear</button></div>
        <input type="hidden" name="id">
        <div class="form-grid">
          <div class="field"><label>Product name</label><input class="input" name="name" required placeholder="e.g. Jollof Rice"></div>
          <div class="field"><label>Price (₦)</label><input class="input" name="price" type="number" min="0" step="0.01" required placeholder="1000"></div>
          <div class="field"><label>Category</label><input class="input" name="category" required placeholder="Food"></div>
          <div class="field"><label>Icon</label><input class="input" name="icon" value="🍽️" maxlength="8"></div>
          <div class="field col-2"><label>Image URL (optional)</label><input class="input" name="image" placeholder="https://… (shown when available, else the icon)"></div>
          <div class="field col-2"><label>Description</label><textarea class="textarea" name="desc" placeholder="A short description for customers."></textarea></div>
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
  const fee = DELIVERY_FEE;
  const total = cartTotal()+fee;
  return `<section class="section container"><div class="page-head"><div><h1>Checkout</h1><p>Where should your order meet you?</p></div></div><div class="split"><form id="checkoutForm" class="card stack"><div class="card__head"><h3>Delivery details</h3><span class="badge badge--brand">Campus only</span></div><div class="form-grid"><div class="field"><label>Delivery location</label><select class="select" name="location"><option>Hostel</option><option>Faculty / department</option><option>Library</option><option>Campus landmark</option></select></div><div class="field"><label>Hostel, room or landmark</label><input required class="input" name="spot" placeholder="e.g. Adams Hall, Room B12"></div><div class="field col-2"><label>Delivery note (optional)</label><textarea class="textarea" name="note" placeholder="Help your rider find you quickly."></textarea></div></div><div class="divider"></div><div class="card__head"><h3>Pay securely</h3><span class="badge badge--success">🔒 Secure</span></div><div class="radio-cards"><label class="radio-card"><input type="radio" name="payment" checked> <span>💳 Card / Transfer</span></label><label class="radio-card"><input type="radio" name="payment"> <span>👛 Campus wallet</span></label></div><button class="btn btn--block btn--lg mt-1" type="submit">Pay ${money(total)} & place order</button><p class="muted xs center mb-0">You'll be redirected to Paystack to complete payment securely.</p></form><aside class="card sticky-side"><h3>Your order</h3>${cartItems().map(x=>`<div class="line"><span class="line__thumb">${esc(x.icon)}</span><span class="line__main"><b>${esc(x.name)}</b><small class="line__sub">× ${x.qty}</small></span><b>${money(x.price*x.qty)}</b></div>`).join('')}<div class="totals mt-1"><div><span>Delivery</span><span>${money(fee)}</span></div><div class="totals__grand"><span>Total</span><span>${money(total)}</span></div></div></aside></div></section>`;
}

async function orders() {
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Loading your orders…</p></div></div><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
  }
  await ensureOrdersLoaded();
  if (state.ordersLoadError && !state.orders.length) {
    return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you’ve ordered on campus.</p></div></div><div class="card"><b>Could not load your orders</b><span class="muted">Showing offline data if available. Please check your connection and try again.</span></div></section>`;
  }
  if (!state.orders.length) {
    return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you’ve ordered on campus.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">Order again</a></div>${empty('📦','No orders yet','When you place an order, it will appear here.','<a class="btn mt-1" href="#/browse">Browse campus finds</a>')}</section>`;
  }
  const cards = state.orders.map(o => {
    const vnames = orderVendorNames(o);
    const cancellable = ['Order confirmed','Preparing'].includes(o.status);
    const reorderable = ['Delivered','Rated'].includes(o.status);
    const riderLine = o.rider_name ? ` · 🛵 ${esc(o.rider_name)}` : (o.rider_id ? ' · 🛵 Rider assigned' : '');
    const items = (o.items || []).map(item =>
      `<div class="line"><span class="line__thumb">${esc(item.icon)}</span><span class="line__main"><b>${esc(item.name)}</b><small class="line__sub">× ${item.qty}</small></span><b>${money(item.price*item.qty)}</b></div>`
    ).join('');
    const cancelBtn = cancellable ? `<br><button class="link-btn small" data-cancel="${o.id}">Cancel order</button>` : '';
    const reorderBtn = reorderable ? `<br><button class="link-btn small" data-reorder="${o.id}">🔁 Reorder</button>` : '';
    return `<article class="card"><div class="row row--between row--wrap"><div><span class="badge badge--${o.status==='Delivered'?'success':o.status==='Cancelled'?'danger':'info'}">${o.status}</span><h3 class="mt-1">Order #${o.id}</h3><p class="muted small mb-0">${esc(vnames)} · ${(o.items||[]).length} item${(o.items||[]).length>1?'s':''} · ${o.created}</p><p class="muted small mb-0">📍 ${esc(o.spot||'No delivery location')}${riderLine}</p></div><div class="right"><b class="price price--lg">${money(o.subtotal)} + ${money(o.fee)} delivery</b><b class="price price--lg">${money(o.total)}</b><br><a class="link-btn small" href="#/order/${o.id}">Details</a> · <a class="link-btn small" href="#/track/${o.id}">Track order →</a>${reorderBtn}${cancelBtn}</div></div><div class="divider"></div>${items}</article>`;
  }).join('');
  return `<section class="section container"><div class="page-head"><div><h1>My orders</h1><p>Track everything you’ve ordered on campus.</p></div><a class="btn btn--ghost btn--sm" href="#/browse">Order again</a></div><div class="stack">${cards}</div></section>`;
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

  return `<section class="section container"><a href="#/orders" class="muted small">← My orders</a><div class="split mt-1"><div class="card"><span class="badge badge--${cancelled?'danger':'info'}">${o.status}</span><h1 class="mt-1">Order #${o.id}</h1><p class="muted">From ${esc(vendorNames)} · Delivering to ${esc(o.spot || 'your location')}</p>${cancelled?`<div class="empty mt-3"><div class="empty__icon">🚫</div><b>Order cancelled</b><span>This order was cancelled and will not be delivered.</span></div>`:`<div class="timeline mt-3">${stages.map((s,i)=>`<div class="tl ${i<current?'tl--done':i===current?'tl--now':''}"><span class="tl__dot">${i<current?'✓':i===current?'●':'○'}</span><div><b>${s}</b><small>${i<=current ? (i===current?'In progress now':'Completed'):'Waiting for update'}</small></div></div>`).join('')}</div>`}${canCancel?`<button class="btn btn--ghost btn--block mt-2" data-cancel="${o.id}">Cancel order</button><p class="muted xs center mt-1 mb-0">You can cancel until the vendor marks it ready.</p>`:''}</div><aside class="card sticky-side"><h3>Your rider</h3><div class="row mt-1"><span class="avatar avatar--lg">${esc(riderInitial)}</span><div><b>${esc(riderTitle)}</b><div class="small muted">${esc(riderMeta)}</div></div></div><div class="divider"></div><p class="small muted">Delivery location</p><b>${esc(o.spot || '—')}</b><p class="small muted mt-2">Delivery method</p><b>${o.delivery_method==='vendor_self'?'Delivered by the vendor':'Campus rider'}</b>${riderIsActive && o.rider_phone ? `<div class="divider"></div><p class="small muted">Contact for this delivery</p><b>📞 ${esc(o.rider_phone)}</b><p class="muted xs mb-0 mt-1">Use it only to coordinate this delivery.</p>` : ''}${['Delivered','Rated'].includes(o.status)?`<button class="btn btn--block mt-2" data-reorder="${o.id}">🔁 Reorder</button>`:''}</aside></div>${ratingUi?`<div class="mt-3">${ratingUi}</div>`:''}</section>`;
// ============================================
// Order details view (ACTION 9)
// ============================================
// Full receipt-style view of a single past order: items with quantities, the
// price actually paid (from order_items), the CURRENT catalog price when it
// differs, subtotal, the flat ₦1,000 delivery fee, total, status, delivery
// method, vendor(s) and the placed-at timestamp. Loading / not-found / empty
// states mirror the orders() view.
async function orderView(id) {
  if (!state.user) { location.hash = '#/login'; return ''; }
  if (!state.ordersLoadedFromSupabase) {
    return `<section class="section container"><div class="page-head"><div><h1>Order details</h1><p>Loading your order…</p></div></div><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
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
  return `<section class="section container"><a href="#/orders" class="muted small">← My orders</a><div class="split mt-1"><div class="card stack">
    <div class="card__head"><div><h3 class="mb-0">Order #${esc(o.id)}</h3><span class="muted small">Placed ${esc(placedAt)}</span></div><span class="badge badge--${badge}">${esc(o.status)}</span></div>
    <p class="muted small mb-0">🏪 ${esc(vnames)} · ${o.delivery_method==='vendor_self'?'Delivered by the vendor':'Campus rider delivery'} · 📍 ${esc(o.spot || 'No delivery location')}${o.rider_name ? ` · 🛵 ${esc(o.rider_name)}` : ''}</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Line total</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>Delivery fee</span><span>${money(fee)}</span></div><div class="totals__grand"><span>Total</span><span>${money(total)}</span></div></div>
    <p class="muted xs mb-0">Prices shown are what you paid at order time. “Now” notes highlight where today's catalog price has changed.</p>
  </div>
  <aside class="card sticky-side stack">
    <h3 class="mb-0">Order actions</h3>
    <a class="btn btn--ghost btn--block" href="#/track/${esc(o.id)}">Track order</a>
    ${canReorder ? `<button class="btn btn--block" data-reorder="${esc(o.id)}">🔁 Reorder</button><p class="muted xs center mb-0">Rebuilds your cart at today's prices — unavailable items are skipped.</p>` : `<p class="muted xs mb-0">Reordering is available for completed (delivered) orders.</p>`}
    <div class="divider"></div>
    <div><span class="muted small">Delivery location</span><div><b>${esc(o.spot || '—')}</b></div></div>
    <div><span class="muted small">Payment status</span><div><b>${esc(o.payment_status || 'pending')}</b></div></div>
    <div><span class="muted small">Placed</span><div><b>${esc(placedAt)}</b></div></div>
  </aside></div></section>`;
}

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

function auth(kind) { const login = kind==='login'; return `<section class="container"><div class="auth-wrap"><div class="card"><div class="center"><span class="brand__logo" style="display:inline-grid">🛵</span><h1 class="mt-1">${login?'Welcome back':'Create your account'}</h1><p class="muted">${login?'Sign in to order, track and earn.':'Join Dropzyy to order, track and earn.'}</p></div><form id="authForm" class="stack mt-2"><div class="field"><label>University email</label><input required class="input" type="email" name="email" placeholder="you@dropzyy.app"></div>${!login?'<div class="field"><label>Full name</label><input required class="input" name="name" placeholder="Your full name"></div><div class="field"><label>Phone (optional)</label><input class="input" name="phone" placeholder="080..."></div><div class="field"><label>Hostel / Residence (optional)</label><input class="input" name="hostel" placeholder="e.g. Adams Hall"></div>':''}<div class="field"><label>Password</label><input required class="input" type="password" name="password" placeholder="••••••••"></div>${!login?'<div class="field"><label>Confirm password</label><input required class="input" type="password" name="confirmPassword" placeholder="Re-enter your password"></div>':''}<button class="btn btn--block btn--lg" type="submit">${login?'Sign in':'Create student account'}</button></form><p class="center small muted mt-2 mb-0">${login?'New here? <a class="link-btn" href="#/register">Create an account</a>':'Already have an account? <a class="link-btn" href="#/login">Sign in</a>'}</p></div></div></section>`; }

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
  const pending = state.riderPool.filter(o => (o.status === 'Order confirmed' || o.status === 'Ready for pickup') && !o.rider_id && (o.delivery_method ?? 'rider') !== 'vendor_self' && o.payment_status === 'success');
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

  // Available deliveries — only shown to an approved rider who is ONLINE.
  // Eligibility is enforced by RLS (orders_select_unassigned): the server only
  // returns unassigned rider-delivery orders to approved riders.
  const availableHtml = (isApprovedRider && isOnline)
    ? (pending.length
        ? `<div class="grid grid--2">${pending.map((o, i) => `<article class="card"><div class="row row--between"><span class="badge badge--warn">${money(riderShareAmount(o.fee))} rider earnings</span><span class="small muted">${pickupEstimate(o, i)}</span></div><h3 class="mt-1">${pickupName(o)}</h3><p class="muted small">${(o.items || []).length} item${(o.items || []).length > 1 ? 's' : ''} · Order #${o.id}</p>${riderOrderItemsHtml(o)}<a class="btn btn--ghost btn--block" href="#/track/${o.id}">View details</a><button class="btn btn--block" data-accept="${o.id}">Accept delivery</button></article>`).join('')}</div>`
        : `<div class="empty"><div class="empty__icon">🛵</div><b>No available deliveries</b><span>New orders will appear here as soon as they are placed.</span></div>`)
    : isApprovedRider
      ? `<div class="empty"><div class="empty__icon">🌙</div><b>You're offline</b><span>Go online above to see available deliveries.</span></div>`
      : `<div class="empty"><div class="empty__icon">🛵</div><b>Become a rider first</b><span>Submit an application to unlock deliveries.</span><a class="btn mt-1" href="#/rider/apply">Apply now</a></div>`;
  const activeHtml = active.length
    ? `<div class="stack">${active.map(o => { const action = o.status === 'Rider assigned' ? `<button class="btn btn--block" data-pickup="${o.id}">Mark as picked up</button>` : o.status === 'Picked up' ? `<button class="btn btn--block" data-onway="${o.id}">On the way</button>` : `<button class="btn btn--block" data-delivered="${o.id}">Mark delivered</button>`; return `<article class="card"><div class="row row--between"><span class="badge badge--info">${o.status}</span><span class="small muted">Order #${o.id}</span></div><h3 class="mt-1">${pickupName(o)}</h3><p class="muted small">${(o.items || []).length} item${(o.items || []).length > 1 ? 's' : ''} · 📍 ${esc(o.spot || 'No location')} · ${money(riderShareAmount(o.fee))} rider earnings</p>${riderOrderItemsHtml(o)}${action}</article>`; }).join('')}</div>`
    : '<div class="empty"><div class="empty__icon">📭</div><b>No active deliveries</b><span>Accept an available delivery to get started.</span></div>';
  const historyHtml = done.length
    ? `<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Route</th><th>Rider earnings (80%)</th></tr></thead><tbody>${done.map(o => `<tr><td>#${esc(o.id)}</td><td>${pickupName(o)}</td><td><b>${money(riderShareAmount(o.fee))}</b></td></tr>`).join('')}</tbody></table></div>`
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

  return `<section class="section container"><div class="page-head"><div><h1>Rider hub</h1><p>Deliver around campus, on your own schedule.</p></div>${statusBadge} ${actionBtn}</div><div class="grid grid--stats"><div class="stat stat--brand"><span class="stat__label">Estimated earnings</span><span class="stat__value">${money(earnings)}</span><span class="stat__hint">${done.length} completed delivery${done.length === 1 ? '' : 'ies'} · pending settlement</span></div><div class="stat"><span class="stat__label">Deliveries completed</span><span class="stat__value">${done.length}</span><span class="stat__hint">${active.length} active now</span></div><div class="stat"><span class="stat__label">Pending withdrawals</span><span class="stat__value">${money(pendingRequestsTotal)}</span><span class="stat__hint">${pendingRequestsCount} awaiting admin review</span></div></div>${errorBanner}${ratingCard}<div class="page-head mt-3"><div><h2>Available deliveries</h2><p>Only unassigned rider deliveries are shown — assigned ones appear in Active deliveries.</p></div>${isApprovedRider ? (isOnline ? '<span class="badge badge--success">● Online</span>' : '<span class="badge badge--warn">● Offline</span>') : ''}</div>${availableHtml}<div class="page-head mt-3"><div><h2>Active deliveries</h2><p>Progress on the deliveries you accepted.</p></div></div>${activeHtml}<div class="page-head mt-3"><div><h2>Delivery history & earnings</h2><p>Completed deliveries and the estimated delivery-fee earnings they earned.</p></div></div>${historyHtml}${withdrawalHtml}</section>`;
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
function notFound() { return `<section class="section container">${empty('🧭','Page not found','This campus path does not exist.','<a class="btn mt-1" href="#/">Go home</a>')}</section>`; }

function updateChrome() { const count = state.cart.reduce((n,x)=>n+x.qty,0); $('#cartCount').hidden=!count; $('#cartCount').textContent=count; const unreadCount=state.notifications.filter(n=>n.unread).length; const notifCount=document.getElementById('notifCount'); if(notifCount){notifCount.hidden=!unreadCount; notifCount.textContent=unreadCount;} $('#userAvatar').textContent=state.user ? state.user.name.charAt(0).toUpperCase() : '👤'; const nav=[['#/','Home'],['#/browse','Browse'],['#/vendors','Vendors'],['#/rider','Earn']]; $('#topnav').innerHTML=nav.map(([h,n])=>`<a href="${h}" class="${location.hash.startsWith(h) && h!=='#/' || location.hash==='#/'&&h==='#/'?'is-active':''}">${n}</a>`).join(''); $('#bottomnav').innerHTML=[['#/','⌂','Home'],['#/browse','⌕','Browse'],['#/cart','🛒','Cart'],['#/orders','◷','Orders'],['#/rider','₦','Earn']].map(([h,i,n])=>`<a href="${h}" class="${location.hash.startsWith(h)&&h!=='#/'||location.hash==='#/'&&h==='#/'?'is-active':''}"><i>${i}</i>${n}${n==='Cart'&&count?`<span class="badge-count">${count}</span>`:''}</a>`).join(''); $('#userPanel').innerHTML=state.user?`<div class="dropdown__meta"><b>${esc(state.user.name)}</b><br><span class="muted small">${esc(state.user.email)}</span></div><div class="dropdown__sep"></div><a class="dropdown__item" href="#/profile">👤 My profile</a><a class="dropdown__item" href="#/orders">📦 My orders</a><a class="dropdown__item" href="#/rider">🛵 Rider hub</a><a class="dropdown__item" href="#/vendor">🏪 Vendor dashboard</a><a class="dropdown__item" href="#/admin">⚙️ Admin dashboard</a><div class="dropdown__sep"></div><button class="dropdown__item" id="logoutBtn">↪ Sign out</button>`:`<a class="dropdown__item" href="#/login">↪ Sign in</a><a class="dropdown__item" href="#/register">✦ Create account</a>`; $('#notifList').innerHTML=renderNotificationList(); 
  // Show/hide Admin link based on user role (profiles.role === 'admin')
  const adminLink = document.getElementById('adminLink');
  if (adminLink) {
    adminLink.hidden = !(state.user && state.user.role === 'admin');
  }
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

function moneyStatusBadge(p) {
  const m = { pending:['Awaiting payment','badge--info'], success:['Payment successful','badge--success'], failed:['Payment failed','badge--danger'] };
  const [l,cls] = m[p]||['Pending','badge--info'];
  return '<span class="badge '+cls+'">'+l+'</span>';
}

async function pay(orderId) {
  if (!state.user) { toast('Please sign in to view payment','info'); location.hash='#/login'; return ''; }
  await ensureOrdersLoaded();
  const order = state.orders.find(x => x.dbId === orderId) || state.orders.find(x => x.id === orderId);
  if (!order) return notFound();
  const ps = order.payment_status;
  const tid = order.dbId || order.id;
  if (ps === 'success') {
    return '<section class="section container"><div class="page-head"><div><h1>Payment</h1><p>'+moneyStatusBadge(ps)+'</p></div></div><div class="card"><div class="row"><span>'+moneyStatusBadge(ps)+'</span><span class="muted small">Ref: '+esc(order.payment_reference||'—')+'</span></div><div class="divider"></div><p><span class="muted small">Paid at</span> '+esc(order.paid_at?formatDate(order.paid_at):'—')+'</p></div></section>';
  }
  if (ps === 'pending') {
    let html = '<section class="section container"><div class="page-head"><div><h1>Payment</h1><p>'+moneyStatusBadge(ps)+'</p></div></div><div class="card"><h3>Complete your payment</h3><p class="muted">Your order total: <b>'+money(order.total)+'</b></p><p class="muted small">Click below to pay securely with Paystack.</p><button class="btn btn--block btn--lg mt-2" id="paystackBtn">Pay '+money(order.total)+' with Paystack</button><p class="muted xs center mt-1 mb-0">You will be redirected to Paystack. You will NOT be charged until you confirm on Paystack.</p></div></section>';
    setTimeout(()=>{ const b=document.getElementById('paystackBtn'); if(!b) return; b.addEventListener('click', async()=>{ b.disabled=true; b.textContent='Redirecting to Paystack...'; const r=await supabaseEdgeFunctionRequest('paystack-initialize',{order_id:tid,email:state.user.email}); if(r&&r.authorization_url) window.location.href=r.authorization_url; }); },50);
    // While this pending payment page is open (e.g. right after returning from
    // Paystack), poll the Supabase source of truth so the page flips to
    // "Payment successful" and opens My Orders as soon as the server-side
    // webhook confirms the payment.
    schedulePayConfirmationPoll(orderId, tid);

    return html;
  }
  if (ps === 'failed') {
    let html = '<section class="section container"><div class="page-head"><div><h1>Payment</h1><p>'+moneyStatusBadge(ps)+'</p></div></div><div class="card"><h3>Payment failed</h3><p class="muted">Your payment attempt was not completed. You can retry below.</p><button class="btn btn--block btn--lg mt-2" id="paystackRetry">Retry payment</button></div></section>';
    setTimeout(()=>{ const b=document.getElementById('paystackRetry'); if(!b) return; b.addEventListener('click', async()=>{ b.disabled=true; b.textContent='Redirecting...'; const r=await supabaseEdgeFunctionRequest('paystack-initialize',{order_id:tid,email:state.user.email}); if(r&&r.authorization_url) window.location.href=r.authorization_url; }); },50);
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

async function render() {
  const [path] = location.hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  let view;
  if (!parts.length) view = home();
  else if (parts[0]==='browse') view = browse();
  else if (parts[0]==='vendors') view = vendors();
  else if (parts[0]==='vendor' && parts[1]) view = vendorView(parts[1]);
  else if (parts[0]==='product' && parts[1]) view = productView(parts[1]);
  else if (parts[0]==='cart') view = cart();
  else if (parts[0]==='checkout') view = checkout();
  else if (parts[0]==='orders') view = await orders();
  else if (parts[0]==='track') view = await track(parts[1]);
  else if (parts[0]==='order' && parts[1]) view = await orderView(parts[1]);
  else if (parts[0]==='pay' && parts[1]) view = await pay(parts[1]);
  else if (parts[0]==='profile') view = profile();
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
      if (!state.vendorLoaded) {
        view = `<section class="section container"><div class="card"><div class="muted center" style="padding:24px">Loading…</div></div></section>`;
      } else {
        view = vendorDashboard();
      }
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
    const prevStatus=o.status;
    o.status='Rider assigned'; save();
    addNotification('Rider assigned',`A rider accepted order #${o.id}. They are on their way to the pickup point.`);
    if(typeof supabase!=='undefined' && supabase && o.dbId){
      supabase.from('orders').update({ status:'Rider assigned', rider_id: state.rider.id }).eq('id',o.dbId)
        .then(async ({ error })=>{
          if(error){ console.error('Rider claim sync failed:', error); o.status=prevStatus; save(); }
          else {
            // Refresh the Rider Hub from Supabase so the persisted assignment (rider_id =
            // currentRider.id, status = 'Rider assigned')is the source of truth —
            // the order moves from Available to Active deliveries without relying
            // on the optimistic local mutation..
            await loadOrdersFromSupabase();
          }
          render();
        })
        .catch(err=>{ console.error('Rider claim sync error:', err); render(); });
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
  const onway=e.target.closest('[data-onway]'); if(onway){const o=state.riderPool.find(x=>x.id===onway.dataset.onway); if(o){
    o.status='On the Way'; save();
    addNotification('Order on the way',`Order #${o.id} is on the way to the customer.`);
    if(typeof supabase!=='undefined' && supabase && o.dbId){
      supabase.from('orders').update({ status:'On the Way' }).eq('id',o.dbId)
        .then(({ error })=>{ if(error) console.error('Rider on-the-way sync failed:', error); })
        .catch(err=>console.error('Rider on-the-way sync error:', err));
    }
    toast('Order marked as on the way'); render();
  }}
  // Customer cancellation: only while the order is still cancellable
  // ('Order confirmed' / 'Preparing'). The order is never deleted — its status
  // becomes 'Cancelled' locally and in Supabase (orders_update_own_cancel RLS).
  const cancel=e.target.closest('[data-cancel]'); if(cancel){const o=state.orders.find(x=>x.id===cancel.dataset.cancel); if(o && ['Order confirmed','Preparing'].includes(o.status)){
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

document.addEventListener('submit', e=>{
  if(e.target.id==='profileForm'){e.preventDefault(); submitProfileForm(e.target); return;}
  if(e.target.id==='riderRatingForm'){e.preventDefault(); submitRiderRatingForm(e.target); return;}
  if(e.target.id==='vendorProductForm'){e.preventDefault(); submitVendorProductForm(e.target); return;}
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
    // Require the user to be logged in before placing an order
    if(!state.user){ toast('Please sign in to place an order','info'); location.hash='#/login'; return; }
    const f=new FormData(e.target);
    const subtotal=cartTotal();
    const fee=DELIVERY_FEE;
    const total=subtotal+fee;
    const items=cartItems();
    // C5 cleanup: the client no longer generates a temporary order number.
    // The place_order RPC generates the authoritative order number server-side;
    // saveOrderToSupabase() overwrites order.id with it before persistence.
    const order={id:null,items,subtotal,fee,total,status:'Order confirmed',payment_status:'pending',spot:`${f.get('location')}: ${f.get('spot')}`,created:'Just now',delivery_method:'rider'};
    
    
    if (typeof supabase === 'undefined' || !supabase) {
      toast('Order failed: Supabase client not available', 'error');
      return;
    }
    
    getSupabaseUserId().then(async userId => {
      if(!userId){
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
        // Redirect to the payment page for this order
        location.hash=`#/pay/${order.id}`;
        toast('Order placed — redirecting to payment...');
        return;
      }
      
      toast('Order failed: Could not save to Supabase', 'error');
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

$('#themeBtn').addEventListener('click',()=>{const d=document.documentElement; d.dataset.theme=d.dataset.theme==='dark'?'light':'dark'; $('#themeBtn').textContent=d.dataset.theme==='dark'?'☀️':'🌙'; localStorage.setItem('campusrun_theme',d.dataset.theme);});
$('#notifBtn').addEventListener('click',()=>{ $('#notifPanel').hidden=!$('#notifPanel').hidden; loadNotificationsFromSupabase(); }); $('#userBtn').addEventListener('click',()=>$('#userPanel').hidden=!$('#userPanel').hidden); $('#notifClear').addEventListener('click',()=>markAllNotificationsRead());
document.addEventListener('click',e=>{if(e.target.closest('[data-notif-read]')){e.stopPropagation();markNotificationRead(e.target.closest('[data-notif-read]').getAttribute('data-notif-read'));return;}if(!e.target.closest('#notifWrap'))$('#notifPanel').hidden=true; if(!e.target.closest('#userWrap'))$('#userPanel').hidden=true;});

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

document.documentElement.dataset.theme=localStorage.getItem('campusrun_theme')||'light'; $('#themeBtn').textContent=document.documentElement.dataset.theme==='dark'?'☀️':'🌙'; $('#year').textContent=new Date().getFullYear(); window.addEventListener('hashchange',render); if(!location.hash) location.hash='#/'; else render();

// Load the catalog from Supabase (falls back to localStorage on failure).
loadCatalogFromSupabase();

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
// Paystack return: if the browser came back from Paystack with a payment
// reference in the URL, refresh orders from Supabase and open My Orders.
handlePaystackReturn();


// Session persistence: restore the Supabase session on load so a page refresh
// keeps the user signed in (and restores their profile name).
supabase.auth.getSession().then(({ data: { session } }) => {
  if(session && session.user){
    supabase.from('profiles').select('full_name').eq('id', session.user.id).single()
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
      })
      .catch(async ()=>{
        state.user={name:session.user.email.split('@')[0],email:session.user.email,role:'user'};
        save();
        await loadRiderFromSupabase();
        await loadOrdersFromSupabase();
        render();
      });
  }
});