const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'assets', 'js', 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add admin link visibility logic to updateChrome function
// Find the end of updateChrome function (the closing brace after notifList)
const notifListMarker = "$('#notifList').innerHTML=state.notifications.map(n=>`<div class=\"notif ${n.unread?'notif--unread':''}\"><span>🔔</span><div><div class=\"notif__title\">${n.title}</div><div class=\"notif__body\">${n.body}</div><div class=\"notif__time\">${n.time}</div></div></div>`).join('');";

const idx = content.indexOf(notifListMarker);
if (idx === -1) {
  console.error('ERROR: Could not find notifList marker in app.js');
  process.exit(1);
}

// Find the end of the updateChrome function - it's the closing } after the notifList line
const afterNotif = content.indexOf('}', idx + notifListMarker.length);
if (afterNotif === -1) {
  console.error('ERROR: Could not find closing brace of updateChrome');
  process.exit(1);
}

// Insert admin link logic before the closing brace
const adminLinkLogic = `\n  // Show/hide Admin link based on user role (profiles.role === 'admin')\n  const adminLink = document.getElementById('adminLink');\n  if (adminLink) {\n    adminLink.hidden = !(state.user && state.user.role === 'admin');\n  }\n`;

content = content.slice(0, afterNotif) + adminLinkLogic + content.slice(afterNotif);

// 2. Update the session persistence to read role from profiles
const oldSessionBlock = `supabase.auth.getSession().then(async ({ data: { session } }) => {
  if(session && session.user){
    // Ensure a profiles row exists for this auth user on every page load.
    // This repairs users who signed up before profile creation was reliable.
    const profile = await ensureProfileForUser(session);
    state.user={name:(profile && profile.full_name) || session.user.email.split('@')[0],email:session.user.email,role:'user'};
    save();
    render();
  }
});`;

const newSessionBlock = `supabase.auth.getSession().then(async ({ data: { session } }) => {
  if(session && session.user){
    // Ensure a profiles row exists for this auth user on every page load.
    // This repairs users who signed up before profile creation was reliable.
    const profile = await ensureProfileForUser(session);
    // Read role from profiles table (defaults to 'user' if no role set)
    const userRole = (profile && profile.role) || 'user';
    state.user={name:(profile && profile.full_name) || session.user.email.split('@')[0],email:session.user.email,role:userRole};
    save();
    render();
  }
});`;

if (content.includes(oldSessionBlock)) {
  content = content.replace(oldSessionBlock, newSessionBlock);
  console.log('SUCCESS: Session persistence updated to read role from profiles');
} else {
  console.log('WARNING: Could not find exact session block - checking for partial match...');
  // Try a more flexible match
  const partialOld = "state.user={name:(profile && profile.full_name) || session.user.email.split('@')[0],email:session.user.email,role:'user'};";
  if (content.includes(partialOld)) {
    content = content.replace(partialOld, "const userRole = (profile && profile.role) || 'user';\n    state.user={name:(profile && profile.full_name) || session.user.email.split('@')[0],email:session.user.email,role:userRole};");
    console.log('SUCCESS: Session persistence updated (partial match)');
  } else {
    console.log('WARNING: Could not find session role assignment');
  }
}

// 3. Update the login handler to read role from profiles
const oldLoginBlock = `state.user={name,email,role:'user'};
          save();
          addNotification('You\\'re signed in','Start exploring what\\'s available around campus.');
          location.hash='#/';
          toast('Welcome to CampusRun!');`;

const newLoginBlock = `const userRole = (profile && profile.role) || 'user';
          state.user={name,email,role:userRole};
          save();
          addNotification('You\\'re signed in','Start exploring what\\'s available around campus.');
          location.hash='#/';
          toast('Welcome to CampusRun!');`;

if (content.includes(oldLoginBlock)) {
  content = content.replace(oldLoginBlock, newLoginBlock);
  console.log('SUCCESS: Login handler updated to read role from profiles');
} else {
  console.log('WARNING: Could not find login role assignment block');
}

// 4. Update the register handler to read role from profiles
const oldRegisterBlock = `state.user={name:full_name||email.split('@')[0],email,role:'user'};`;
const newRegisterBlock = `state.user={name:full_name||email.split('@')[0],email,role:'user'};`;

// Register already sets role to 'user' which is correct for new signups

// 5. Update the user dropdown to only show Admin dashboard link for admins
const oldDropdown = `<a class="dropdown__item" href="admin.html">⚙️ Admin dashboard</a>`;
const newDropdown = `\${state.user && state.user.role === 'admin' ? '<a class="dropdown__item" href="admin.html">⚙️ Admin dashboard</a>' : ''}`;

if (content.includes(oldDropdown)) {
  content = content.replace(oldDropdown, newDropdown);
  console.log('SUCCESS: User dropdown admin link made conditional');
} else {
  console.log('WARNING: Could not find admin dashboard dropdown link');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('DONE: All changes applied to app.js');