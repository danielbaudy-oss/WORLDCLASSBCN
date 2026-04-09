const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://ruytavhodexoxkejrgyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1eXRhdmhvZGV4b3hrZWpyZ3liIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczMTM0MSwiZXhwIjoyMDkxMzA3MzQxfQ.Y66lSD_ufs6_4L-uRzLu09YgMHfy43Z6vPWXvJ37vlg'
);
(async () => {
  const { data, error } = await sb.from('profiles').select('email, name, role').order('name');
  if (error) { console.error('ERROR:', error); return; }
  console.log(`Found ${data.length} profiles:`);
  data.forEach(p => console.log(`  ${p.name} (${p.email}) - ${p.role}`));
  
  const { count } = await sb.from('time_punches').select('*', { count: 'exact', head: true });
  console.log(`\nTime punches in DB: ${count}`);
})();
