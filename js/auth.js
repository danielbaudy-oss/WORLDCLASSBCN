// Auth module - handles login, session, and routing

async function getSession() {
  const { data: { session } } = await db.auth.getSession();
  return session;
}

async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  // First try matching by auth user ID
  var { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!data && session.user.email) {
    // No profile with this auth ID — try linking via RPC
    try {
      await db.rpc('link_profile_by_email', { user_email: session.user.email });
      // Re-fetch
      var { data: linked } = await db
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      return linked;
    } catch (e) {
      console.error('Profile link error:', e);
    }
    return null;
  }

  if (error) {
    console.error('Profile fetch error:', error);
    return null;
  }
  return data;
}

async function signInWithGoogle() {
  // Use localhost redirect when running locally, GitHub Pages when deployed
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const redirectUrl = isLocal
    ? window.location.origin + '/'
    : 'https://danielbaudy-oss.github.io/WORLDCLASSBCN/';

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        prompt: 'select_account'
      }
    }
  });
  if (error) {
    console.error('Login error:', error);
    showToast('Error al iniciar sesión', 'error');
  }
}

async function signOut() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

// Route user based on role after login
async function routeUser() {
  const profile = await getProfile();
  if (!profile) return null;

  if (profile.status === 'Pending') return 'pending';
  if (profile.status === 'Inactive') return 'inactive';

  return profile;
}

// Check auth on page load and redirect if needed
async function requireAuth(allowedRoles) {
  const session = await getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const profile = await getProfile();
  if (!profile || profile.status !== 'Active') {
    window.location.href = 'index.html';
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    window.location.href = 'index.html';
    return null;
  }

  return profile;
}

// ========================================
// DEV ROLE SWITCHER (localhost only)
// ========================================

const TEST_ACCOUNT_EMAIL = 'danielbaudy@googlemail.com';

function isDevMode() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

async function initDevRoleSwitcher(profile) {
  if (!isDevMode() || !profile || profile.email !== TEST_ACCOUNT_EMAIL) return;

  var switcher = document.createElement('div');
  switcher.id = 'devRoleSwitcher';
  switcher.innerHTML =
    '<div style="position:fixed;bottom:70px;right:16px;z-index:9999;background:#1e293b;border-radius:12px;padding:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:flex;flex-direction:column;gap:4px;font-family:monospace;font-size:12px">' +
      '<div style="color:#94a3b8;text-align:center;padding:2px 8px;font-weight:700">🧪 DEV ROLE</div>' +
      '<button onclick="switchDevRole(\'teacher\')" style="padding:6px 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;' + (profile.role === 'teacher' ? 'background:#3b82f6;color:#fff' : 'background:#334155;color:#94a3b8') + '">👩‍🏫 Teacher</button>' +
      '<button onclick="switchDevRole(\'admin\')" style="padding:6px 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;' + (profile.role === 'admin' ? 'background:#3b82f6;color:#fff' : 'background:#334155;color:#94a3b8') + '">📊 Admin</button>' +
      '<button onclick="switchDevRole(\'super_admin\')" style="padding:6px 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;' + (profile.role === 'super_admin' ? 'background:#3b82f6;color:#fff' : 'background:#334155;color:#94a3b8') + '">👑 Super Admin</button>' +
    '</div>';
  document.body.appendChild(switcher);
}

async function switchDevRole(newRole) {
  var { error } = await db.rpc('switch_dev_role', { new_role: newRole });

  if (error) {
    showToast('Error switching role: ' + error.message, 'error');
    return;
  }

  showToast('Switched to ' + newRole + ' — reloading...');
  setTimeout(function() { window.location.href = 'index.html'; }, 500);
}

// ========================================

function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}
