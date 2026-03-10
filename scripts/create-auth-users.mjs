/**
 * One-time script to create 5 team users in Supabase Auth.
 * Run: SUPABASE_SERVICE_ROLE_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx node scripts/create-auth-users.mjs
 * Or set env in .env.local and run: node --env-file=.env.local scripts/create-auth-users.mjs
 */

import { createClient } from '@supabase/supabase-js';

const EMAILS = [
  'Kezia@hanindo.co.id',
  'Dinda@hanindo.co.id',
  'vira@hanindo.co.id',
  'hanssen@hanindo.co.id',
  'admin@hanindo.co.id',
];
const PASSWORD = 'test123';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const email of EMAILS) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) {
    if (error.message.includes('already been registered')) {
      console.log(`Skip (exists): ${email}`);
    } else {
      console.error(`${email}:`, error.message);
    }
  } else {
    console.log(`Created: ${email}`);
  }
}

console.log('Done. Users can sign in with the given email and password test123.');
