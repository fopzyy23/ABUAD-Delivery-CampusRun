const fs = require('fs');
const filePath = 'assets/js/app.js';
let c = fs.readFileSync(filePath, 'utf8');

// Find the broken section
const searchStr = "    const email=f.get('email'), password=f.get('password');\n    if(isAdmin){";
const replacement = "    const isAdmin=location.hash==='#'/admin/login';\n    const isRegister=location.hash==='#'/register';\n    const email=f.get('email'), password=f.get('password');\n    if(isAdmin){";

if (c.includes(searchStr)) {
  c = c.replace(searchStr, replacement);
  fs.writeFileSync(filePath, c);
  console.log('FIXED: Added back isAdmin and isRegister declarations');
} else {
  console.log('ERROR: Search string not found');
  // Try the simpler replacement
  const idx = c.indexOf("    const email=f.get('email'), password=f.get('password');\n    if(isAdmin){");
  console.log('Index found:', idx);
}
