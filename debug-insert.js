import { supabaseMainAdmin } from './lib/supabase.js';

(async () => {
  if (!supabaseMainAdmin) {
    console.error('NO admin client available');
    process.exit(1);
  }
  const payload = {
    name: 'Prueba Debug',
    category: 'restaurantes',
    description: 'Descripción de prueba',
    address: 'Av. Ejemplo 123',
    photo_url_1: 'https://example.com/foto.jpg',
    created_by: 'debug-user',
    open_days: [0,1,2,3,4,5,6],
  };
  const res = await supabaseMainAdmin.from('places').insert(payload).select().single();
  console.log(JSON.stringify(res, null, 2));
})();
