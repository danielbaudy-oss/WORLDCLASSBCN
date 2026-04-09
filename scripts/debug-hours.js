var { createClient } = require('@supabase/supabase-js');
var sb = createClient(
  'https://ruytavhodexoxkejrgyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1eXRhdmhvZGV4b3hrZWpyZ3liIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczMTM0MSwiZXhwIjoyMDkxMzA3MzQxfQ.Y66lSD_ufs6_4L-uRzLu09YgMHfy43Z6vPWXvJ37vlg'
);

function calculateDayHours(punches) {
  var sorted = punches
    .filter(function(p) { return p.punch_type === 'IN' || p.punch_type === 'OUT'; })
    .sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });
  var total = 0;
  for (var i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].punch_type === 'IN' && sorted[i + 1] && sorted[i + 1].punch_type === 'OUT') {
      var inParts = sorted[i].time.split(':').map(Number);
      var outParts = sorted[i + 1].time.split(':').map(Number);
      var diff = (outParts[0] * 60 + outParts[1]) - (inParts[0] * 60 + inParts[1]);
      if (diff > 0) total += diff / 60;
    }
  }
  return Math.round(total * 100) / 100;
}

async function main() {
  var { data: alfonso } = await sb.from('profiles').select('id, name').eq('name', 'ALFONSO').single();
  
  var { data: punches } = await sb.from('time_punches').select('date, time, punch_type')
    .eq('user_id', alfonso.id).in('punch_type', ['IN', 'OUT']).order('date').order('time');
  
  console.log('ALFONSO total IN/OUT punches:', punches.length);
  
  // Group by date and calculate
  var byDate = {};
  punches.forEach(function(p) {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });
  
  var totalHours = 0;
  var dates = Object.keys(byDate).sort();
  
  dates.forEach(function(date) {
    var dayPunches = byDate[date];
    var hours = calculateDayHours(dayPunches);
    totalHours += hours;
    if (hours > 0) {
      console.log(date + ': ' + dayPunches.length + ' punches, ' + hours + 'h');
      // Show the actual times
      dayPunches.sort(function(a,b) { return a.time.localeCompare(b.time); });
      dayPunches.forEach(function(p) {
        console.log('  ' + p.punch_type + ' ' + p.time);
      });
    }
  });
  
  console.log('\nTotal hours for ALFONSO:', totalHours);
  console.log('Old app shows: 236.6h');
  console.log('Difference:', 236.6 - totalHours);
}

main().catch(console.error);
