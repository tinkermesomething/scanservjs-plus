import { reactive } from 'vue';

const auth = reactive({
  loading: true,
  oidcEnabled: false,
  isGuest: true,
  user: null,
});

export async function loadAuth() {
  try {
    const res = await fetch('/api/v1/user/me');
    if (res.ok) {
      const data = await res.json();
      auth.oidcEnabled = data.oidcEnabled;
      auth.isGuest = data.isGuest;
      auth.user = data.user;
    }
  } catch {
    // auth info unavailable — treat as guest
  } finally {
    auth.loading = false;
  }
}

export default auth;
