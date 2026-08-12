// ============================================
// CampusRun Admin Panel
// ============================================

// Admin credentials (in production, use server-side validation)
const ADMIN_CREDENTIALS = {
  email: 'admin@abuad.edu.ng',
password: 'Moyin123'
};

// State management
let state = {
  isAuthenticated: false,
  catalog: null
};

// ============================================
// Utility Functions
// ============================================
const $ = s => document.querySelector(s);
const money = n => `₦${Number(n).toLocaleString('en-NG')}`;
const store = (key, value) => localStorage.setItem(`campusrun_${key}`, JSON.stringify(value));
const load = (key, fallback) => { 
  try { 
    return JSON.parse(localStorage.getItem(`campusrun_${key}`)) ?? fallback; 
  } catch { 
    return fallback; 
  } 
};
const clone = value => JSON.parse(JSON.stringify(value));

// Seed data (same as main app)
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

// ============================================
// Toast Notifications
// ============================================
function toast(message, kind = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  $('#toastRoot').append(el);
  setTimeout(() => el.remove(), 3400);
}

// ============================================
// Authentication
// ============================================
function checkAuth() {
  const adminSession = load('admin_session', null);
  if (adminSession && adminSession.isAuthenticated) {
    state.isAuthenticated = true;
    return true;
  }
  return false;
}

function login(email, password) {
  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    state.isAuthenticated = true;
    store('admin_session', { isAuthenticated: true, email, loginTime: Date.now() });
    return true;
  }
  return false;
}

function logout() {
  state.isAuthenticated = false;
  localStorage.removeItem('campusrun_admin_session');
  renderLogin();
}

// ============================================
// Catalog Management
// ============================================

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

function loadCatalog() {
  state.catalog = mergeSeedIntoStored(load('catalog_v3', clone(SEED_DATA)));
}

function saveCatalog() {
  // 'catalog_v3' is the shared localStorage key used by both the admin
  // panel and the main customer site, so saving here automatically keeps
  // them in sync (as long as the main app re-reads this key before writing).
  store('catalog_v3', state.catalog);
}

function resetCatalog() {
  if (confirm('Restore the original demo catalog? All changes will be lost.')) {
    state.catalog = clone(SEED_DATA);
    saveCatalog();
    renderAdminWorkspace();
    toast('Catalog restored to default');
  }
}

// ============================================
// Vendor Management
// ============================================
function addVendor(formData) {
  const vendor = {
    id: formData.get('id') || `${formData.get('name').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`,
    name: formData.get('name').trim(),
    type: formData.get('type').trim(),
    icon: formData.get('icon').trim() || '🏪',
    time: formData.get('time').trim() || '15–25 min',
    rating: formData.get('rating') || '4.5',
    cover: formData.get('cover') || '#d9f5e9',
    open: formData.get('open') === 'on'
  };
  
  const existingIndex = state.catalog.vendors.findIndex(v => v.id === vendor.id);
  if (existingIndex >= 0) {
    state.catalog.vendors[existingIndex] = vendor;
  } else {
    state.catalog.vendors.push(vendor);
  }
  
  saveCatalog();
  renderAdminWorkspace();
  toast('Vendor saved successfully');
}

function deleteVendor(vendorId) {
  if (confirm('Delete this vendor and all its products?')) {
    const vendorProductIds = state.catalog.products.filter(p => p.vendor === vendorId).map(p => p.id);
    state.catalog.vendors = state.catalog.vendors.filter(v => v.id !== vendorId);
    state.catalog.products = state.catalog.products.filter(p => p.vendor !== vendorId);
    // Remove any cart entries that referenced the deleted vendor's products
    const cart = load('cart', []);
    store('cart', cart.filter(x => !vendorProductIds.includes(x.id)));
    saveCatalog();
    renderAdminWorkspace();
    toast('Vendor deleted');
  }
}

function toggleVendor(vendorId) {
  const vendor = state.catalog.vendors.find(v => v.id === vendorId);
  if (vendor) {
    vendor.open = !vendor.open;
    saveCatalog();
    renderAdminWorkspace();
    toast(`Vendor ${vendor.open ? 'opened' : 'closed'}`);
  }
}

// ============================================
// Product Management
// ============================================
function addProduct(formData) {
  const product = {
    id: formData.get('id') ? Number(formData.get('id')) : Math.max(0, ...state.catalog.products.map(p => p.id)) + 1,
    vendor: formData.get('vendor'),
    name: formData.get('name').trim(),
    price: Number(formData.get('price')),
    category: formData.get('category').trim(),
    icon: formData.get('icon').trim() || '🍽️',
    desc: formData.get('desc').trim()
  };
  
  const existingIndex = state.catalog.products.findIndex(p => p.id === product.id);
  if (existingIndex >= 0) {
    state.catalog.products[existingIndex] = product;
  } else {
    state.catalog.products.push(product);
  }
  
  saveCatalog();
  renderAdminWorkspace();
  toast('Product saved successfully');
}

function deleteProduct(productId) {
  if (confirm('Delete this product?')) {
    state.catalog.products = state.catalog.products.filter(p => p.id !== Number(productId));
    // Remove any cart entries that referenced the deleted product
    const cart = load('cart', []);
    store('cart', cart.filter(x => x.id !== Number(productId)));
    saveCatalog();
    renderAdminWorkspace();
    toast('Product deleted');
  }
}

// ============================================
// View Renderers
// ============================================
function renderLogin() {
  const app = $('#app');
  app.innerHTML = `
    <section class="container">
      <div class="auth-wrap">
        <div class="card">
          <div class="center">
            <span class="brand__logo" style="display:inline-grid">🛵</span>
            <h1 class="mt-1">Admin Access</h1>
            <p class="muted">Enter admin credentials to continue.</p>
          </div>
          <form id="loginForm" class="stack mt-2">
            <div class="field">
              <label>Admin email</label>
              <input required class="input" type="email" name="email" placeholder="admin@abuad.edu.ng" autocomplete="email">
            </div>
            <div class="field">
              <label>Admin password</label>
              <input required class="input" type="password" name="password" placeholder="Enter admin password" autocomplete="current-password">
            </div>
            <button class="btn btn--block btn--lg" type="submit">Access Admin Panel</button>
          </form>
        </div>
      </div>
    </section>
  `;
  
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    
    if (login(email, password)) {
      toast('Admin access granted');
      loadCatalog();
      renderAdminWorkspace();
    } else {
      toast('Invalid credentials', 'error');
    }
  });
}

function renderAdminWorkspace() {
  const vendors = state.catalog.vendors;
  const products = state.catalog.products;
  
  const app = $('#app');
  app.innerHTML = `
    <section class="section container">
      <div class="page-head">
        <div>
          <span class="badge badge--brand">Platform Control</span>
          <h1 class="mt-1">Content Manager</h1>
          <p class="muted">Changes are saved instantly and appear across the customer pages.</p>
        </div>
        <button class="btn btn--ghost" id="resetCatalog">Restore Demo Catalog</button>
      </div>

      <!-- Stats -->
      <div class="grid grid--stats">
        <div class="stat stat--brand">
          <span class="stat__label">Vendors</span>
          <span class="stat__value">${vendors.length}</span>
          <span class="stat__hint">Visible on the marketplace</span>
        </div>
        <div class="stat">
          <span class="stat__label">Products</span>
          <span class="stat__value">${products.length}</span>
          <span class="stat__hint">Available menu items</span>
        </div>
        <div class="stat">
          <span class="stat__label">Status</span>
          <span class="stat__value">●</span>
          <span class="stat__hint">Live and synced</span>
        </div>
      </div>

      <!-- Add Vendor Form -->
      <div class="split mt-3">
        <form class="card stack" id="vendorForm">
          <div class="card__head">
            <h3 id="vendorFormTitle">Add Vendor</h3>
            <button class="link-btn" type="button" id="clearVendorForm">Clear</button>
          </div>
          <input type="hidden" name="id">
          <div class="form-grid">
            <div class="field">
              <label>Vendor Name</label>
              <input class="input" name="name" required placeholder="e.g. Campus Pharmacy">
            </div>
            <div class="field">
              <label>Type</label>
              <input class="input" name="type" required placeholder="e.g. Essentials">
            </div>
            <div class="field">
              <label>Icon</label>
              <input class="input" name="icon" value="🏪" maxlength="8">
            </div>
            <div class="field">
              <label>Delivery Time</label>
              <input class="input" name="time" value="15–25 min">
            </div>
            <div class="field">
              <label>Rating</label>
              <input class="input" name="rating" type="number" min="0" max="5" step="0.1" value="4.5">
            </div>
            <div class="field">
              <label>Cover Colour</label>
              <input class="input" name="cover" value="#d9f5e9" pattern="#[0-9a-fA-F]{6}">
            </div>
          </div>
          <label class="radio-card">
            <input name="open" type="checkbox" checked> Open for orders
          </label>
          <button class="btn btn--block" type="submit">Save Vendor</button>
        </form>

        <!-- Add Product Form -->
        <form class="card stack" id="productForm">
          <div class="card__head">
            <h3 id="productFormTitle">Add Product</h3>
            <button class="link-btn" type="button" id="clearProductForm">Clear</button>
          </div>
          <input type="hidden" name="id">
          <div class="form-grid">
            <div class="field">
              <label>Product Name</label>
              <input class="input" name="name" required placeholder="e.g. Meat pie">
            </div>
            <div class="field">
              <label>Vendor</label>
              <select class="select" name="vendor" required>
                ${vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Price (₦)</label>
              <input class="input" name="price" required min="0" type="number" placeholder="1000">
            </div>
            <div class="field">
              <label>Category</label>
              <input class="input" name="category" required placeholder="Food">
            </div>
            <div class="field">
              <label>Icon</label>
              <input class="input" name="icon" value="🍽️" maxlength="8">
            </div>
            <div class="field col-2">
              <label>Description</label>
              <textarea class="textarea" name="desc" required placeholder="A short description for customers."></textarea>
            </div>
          </div>
          <button class="btn btn--block" type="submit">Save Product</button>
        </form>
      </div>

      <!-- Vendors Table -->
      <div class="card mt-3">
        <div class="card__head">
          <h3>Vendors</h3>
          <span class="muted small">Edit availability or details</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Type</th>
                <th>Time</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${vendors.map(v => `
                <tr>
                  <td>${v.icon} <b>${v.name}</b></td>
                  <td>${v.type}</td>
                  <td>${v.time}</td>
                  <td><button class="link-btn" data-toggle-vendor="${v.id}">${v.open ? 'Open' : 'Closed'}</button></td>
                  <td>
                    <button class="link-btn" data-edit-vendor="${v.id}">Edit</button> · 
                    <button class="link-btn" data-delete-vendor="${v.id}">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Products Table -->
      <div class="card mt-3">
        <div class="card__head">
          <h3>Products</h3>
          <span class="muted small">${products.length} live items</span>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${products.map(p => {
                const vendor = vendors.find(v => v.id === p.vendor);
                return `
                  <tr>
                    <td>${p.icon} <b>${p.name}</b></td>
                    <td>${vendor ? vendor.name : '—'}</td>
                    <td>${p.category}</td>
                    <td>${money(p.price)}</td>
                    <td>
                      <button class="link-btn" data-edit-product="${p.id}">Edit</button> · 
                      <button class="link-btn" data-delete-product="${p.id}">Delete</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
  
  // Attach event listeners
  attachAdminEventListeners();
}

function attachAdminEventListeners() {
  // Reset catalog
  $('#resetCatalog')?.addEventListener('click', resetCatalog);
  
  // Vendor form submission
  $('#vendorForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addVendor(new FormData(e.target));
  });
  
  // Product form submission
  $('#productForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    addProduct(new FormData(e.target));
  });
  
  // Clear forms
  $('#clearVendorForm')?.addEventListener('click', () => {
    $('#vendorForm').reset();
    $('#vendorForm').querySelector('input[name="id"]').value = '';
    $('#vendorFormTitle').textContent = 'Add Vendor';
  });
  
  $('#clearProductForm')?.addEventListener('click', () => {
    $('#productForm').reset();
    $('#productForm').querySelector('input[name="id"]').value = '';
    $('#productFormTitle').textContent = 'Add Product';
  });
  
  // Edit/Delete/Toggle buttons
  document.querySelectorAll('[data-edit-vendor]').forEach(btn => {
    btn.addEventListener('click', () => editVendor(btn.dataset.editVendor));
  });
  
  document.querySelectorAll('[data-delete-vendor]').forEach(btn => {
    btn.addEventListener('click', () => deleteVendor(btn.dataset.deleteVendor));
  });
  
  document.querySelectorAll('[data-toggle-vendor]').forEach(btn => {
    btn.addEventListener('click', () => toggleVendor(btn.dataset.toggleVendor));
  });
  
  document.querySelectorAll('[data-edit-product]').forEach(btn => {
    btn.addEventListener('click', () => editProduct(btn.dataset.editProduct));
  });
  
  document.querySelectorAll('[data-delete-product]').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProduct));
  });
}

function editVendor(vendorId) {
  const vendor = state.catalog.vendors.find(v => v.id === vendorId);
  if (!vendor) return;
  
  const form = $('#vendorForm');
  form.querySelector('input[name="id"]').value = vendor.id;
  form.querySelector('input[name="name"]').value = vendor.name;
  form.querySelector('input[name="type"]').value = vendor.type;
  form.querySelector('input[name="icon"]').value = vendor.icon;
  form.querySelector('input[name="time"]').value = vendor.time;
  form.querySelector('input[name="rating"]').value = vendor.rating;
  form.querySelector('input[name="cover"]').value = vendor.cover;
  form.querySelector('input[name="open"]').checked = vendor.open;
  $('#vendorFormTitle').textContent = 'Edit Vendor';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function editProduct(productId) {
  const product = state.catalog.products.find(p => p.id === Number(productId));
  if (!product) return;
  
  const form = $('#productForm');
  form.querySelector('input[name="id"]').value = product.id;
  form.querySelector('input[name="name"]').value = product.name;
  form.querySelector('select[name="vendor"]').value = product.vendor;
  form.querySelector('input[name="price"]').value = product.price;
  form.querySelector('input[name="category"]').value = product.category;
  form.querySelector('input[name="icon"]').value = product.icon;
  form.querySelector('textarea[name="desc"]').value = product.desc;
  $('#productFormTitle').textContent = 'Edit Product';
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================
// Initialization
// ============================================
// The logout button lives in the admin header on every screen (login form,
// workspace, etc.), so attach its handler once as a delegated listener on the
// document — this also covers the case where the user just logged in via the
// form and the workspace (with its per-render listeners) isn't mounted yet.
document.addEventListener('click', (e) => {
  if (e.target.id === 'logoutBtn') {
    if (confirm('Sign out of admin panel?')) {
      logout();
    }
  }
});

function init() {
  // Check authentication
  if (!checkAuth()) {
    renderLogin();
    return;
  }
  
  // Load catalog data
  loadCatalog();
  
  // Render admin workspace
  renderAdminWorkspace();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
