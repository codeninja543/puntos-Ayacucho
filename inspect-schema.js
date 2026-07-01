import { supabaseMainAdmin } from './lib/supabase.js';

async function run() {
  if (!supabaseMainAdmin) {
    console.error('No admin client');
    process.exit(1);
  }

  const tables = ['user_roles', 'profiles'];
  for (const table of tables) {
    try {
      const { data, error, status } = await supabaseMainAdmin.from(table).select('*').limit(1);
      console.log('TABLE:', table, 'STATUS:', status);
      if (error) {
        console.error('ERROR:', error);
      } else {
        console.log('DATA:', data);
      }
    } catch (err) {
      console.error('EXCEPTION:', err);
    }
  }
}

run();
