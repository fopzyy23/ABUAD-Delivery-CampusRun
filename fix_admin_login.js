const fs = require('fs');
const filePath = 'assets/js/app.js';
let c = fs.readFileSync(filePath, 'utf8');

// Find the exact old block to replace
// From "    const isAdmin=location.hash" through "    const email=f.get('email'), password=f.get('password');" and "    if(isRegister){"
const startIdx = c.indexOf("    const isAdmin=location.hash");
const endIdx = c.indexOf("    if(isRegister){", startIdx);

if (startIdx === -1 || endIdx === -1) {
  console.log('ERROR: Could not find the block to replace');
  process.exit(1);
}

const oldBlock = c.substring(startIdx, endIdx);
console.log('Old block (length=' + oldBlock.length + '):');
console.log(oldBlock);

const newBlock = `    const email=f.get('email'), password=f.get('password');
    if(isAdmin){
      // Use Supabase to verify admin role instead of hardcoded credentials
      // Step 1: Sign in with Supabase Auth using the provided credentials
      const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({ email: email, password: password });
      if (signInError) {
        toast('Invalid credentials', 'error');
        location.hash = '#/login';
        return;
      }
      if (!session || !session.user) {
        toast('Not authenticated with Supabase', 'error');
        location.hash = '#/login';
        return;
      }
      // Step 2: Check if user has admin role in profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profileError || !profile || profile.role !== 'admin') {
        // User is authenticated but not an admin — deny access and sign out
        await supabase.auth.signOut().catch(() => {});
        toast('Access denied: this account does not have admin privileges.', 'error');
        location.hash = '#/login';
        return;
      }
      state.user = { name: profile.full_name || session.user.email.split('@')[0], email: session.user.email, role: 'admin' };
      save();
      addNotification('Admin access granted','Welcome to the admin dashboard.');
      location.hash='#/admin';
      toast('Admin access granted');
      return;
    }
`;

c = c.substring(0, startIdx) + newBlock + "    if(isRegister){" + c.substring(endIdx + "    if(isRegister){".length);

fs.writeFileSync(filePath, c);
console.log('\nReplacement complete!');
