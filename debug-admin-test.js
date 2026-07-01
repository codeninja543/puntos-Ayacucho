import fetch from 'node-fetch';
import { supabaseMainAdmin } from './lib/supabase.js';

async function main() {
  if (!supabaseMainAdmin) {
    console.error('No admin client');
    process.exit(1);
  }

  const email = 'debug-admin-user-2026@example.com';
  const password = 'DebugUser123!';

  console.log('Creating admin user:', email);
  const { data: user, error: createError } = await supabaseMainAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { role: 'admin' },
    email_confirm: true,
  });

  if (createError) {
    if (createError.message?.includes('duplicate')) {
      console.log('User already exists, continuing');
    } else {
      console.error('Create user error:', createError);
      process.exit(1);
    }
  } else {
    console.log('Created user', user?.id);
  }

  console.log('Signing in via backend auth route');
  const signinRes = await fetch('http://localhost:3001/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const signinBody = await signinRes.text();
  console.log('signin status', signinRes.status);
  console.log('signin body', signinBody);

  if (!signinRes.ok) {
    process.exit(1);
  }

  const signinJson = JSON.parse(signinBody);
  console.log('Signin result', JSON.stringify(signinJson, null, 2));

  const token = signinJson.session?.access_token;
  if (!token) {
    console.error('No token returned');
    process.exit(1);
  }

  console.log('Posting place with token');
  const postRes = await fetch('http://localhost:3001/api/places', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Debug Lugar desde script',
      category: 'restaurantes',
      description: 'Lugar creado desde debug script',
      address: 'Calle Debug 123',
      photo_url_1: 'https://example.com/photo.jpg',
      open_days: [0,1,2,3,4,5,6],
    }),
  });

  const postBody = await postRes.text();
  console.log('POST /api/places status', postRes.status);
  console.log('POST body', postBody);
}

main().catch(err => {
  console.error('Unexpected error', err);
  process.exit(1);
});
