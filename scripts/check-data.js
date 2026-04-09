var { createClient } = require('@supabase/supabase-js');
var sb = createClient(
  'https://ruytavhodexoxkejrgyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1eXRhdmhvZGV4b3hrZWpyZ3liIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczMTM0MSwiZXhwIjoyMDkxMzA3MzQxfQ.Y66lSD_ufs6_4L-uRzLu09YgMHfy43Z6vPWXvJ37vlg'
);

async function main() {
  // Check total punches
  var { count: totalPunches } = await sb.from('time_punches').select('*', { count: 'exact', head: true });
  console.log('Total punches in DB:', totalPunches);

  // Check date range
  var { data: earliest } = await sb.from('time_punches').select('date').order('date', { ascending: true }).limit(1);
  var { data: latest } = await sb.from('time_punches').select('date').order('date', { ascending: false }).limit(1);
  console.log('Date range:', earliest[0]?.date, 'to', latest[0]?.date);

  // Check ALFONSO specifically
  var { data: alfonso } = await sb.from('profiles').select('id, name').eq('name', 'ALFONSO').single();
  if (alfonso) {
    var { data: alfonsoPunches } = await sb.from('time_punches').select('date, time, punch_type')
      .eq('user_id', alfonso.id).in('punch_type', ['IN', 'OUT']).order('date');
    console.log('\nALFONSO punches:', alfonsoPunches?.length);
    
    // Count by month
    var byMonth = {};
    (alfonsoPunches || []).forEach(function(p) {
      var m = p.date.substring(0, 7);
      if (!byMonth[m]) byMonth[m] = 0;
      byMonth[m]++;
    });
    console.log('ALFONSO by month:', byMonth);
  }

  // Check PREP punches for ALFONSO
  if (alfonso) {
    var { data: prepPunches } = await sb.from('time_punches').select('date, notes, punch_type')
      .eq('user_id', alfonso.id).eq('punch_type', 'PREP');
    console.log('ALFONSO PREP punches:', prepPunches?.length);
    (prepPunches || []).forEach(function(p) {
      console.log('  ', p.date, p.notes);
    });
  }

  // Check punch count per profile for top 5
  var { data: profiles } = await sb.from('profiles').select('id, name').eq('role', 'teacher').eq('status', 'Active').order('name').limit(5);
  for (var p of (profiles || [])) {
    var { count } = await sb.from('time_punches').select('*', { count: 'exact', head: true })
      .eq('user_id', p.id).in('punch_type', ['IN', 'OUT']);
    console.log(p.name + ': ' + count + ' IN/OUT punches');
  }
}

main().catch(console.error);
