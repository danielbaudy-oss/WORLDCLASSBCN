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
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://danielbaudy-oss.github.io/WORLDCLASSBCN/index.html',
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
