const fs = require('fs');
const filePath = 'assets/js/app.js';
let c = fs.readFileSync(filePath, 'utf8');

// Fix the mangled string literals
// The issue: '#' was used instead of '#/...'
// Current (broken): location.hash==='#'/admin/login'
// Should be: location.hash==='#/admin/login'
c = c.replace(
  "location.hash==='#'/admin/login'",
  "location.hash==='#/admin/login'"
);
c = c.replace(
  "location.hash==='#'/register'",
  "location.hash==='#/register'"
);

fs.writeFileSync(filePath, c);
console.log('Fixed string literals');
