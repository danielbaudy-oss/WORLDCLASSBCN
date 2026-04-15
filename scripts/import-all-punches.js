var fs = require('fs');
var { createClient } = require('@supabase/supabase-js');

var sb = createClient(
  'https://ruytavhodexoxkejrgyb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1eXRhdmhvZGV4b3hrZWpyZ3liIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczMTM0MSwiZXhwIjoyMDkxMzA3MzQxfQ.Y66lSD_ufs6_4L-uRzLu09YgMHfy43Z6vPWXvJ37vlg'
);

async function main() {
  // 1. Load profile mapping
  console.log('Loading profiles...');
  var { data: profiles, error: pErr } = await sb.from('profiles').select('id, email');
  if (pErr) { console.error('Profile error:', pErr); return; }
  
  var emailToId = {};
  profiles.forEach(function(p) { emailToId[p.email.toLowerCase()] = p.id; });
  console.log('Loaded ' + Object.keys(emailToId).length + ' profiles');

  // 2. Clear existing punches
  console.log('Clearing existing punches...');
  var { error: delErr } = await sb.from('time_punches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) console.error('Delete error:', delErr.message);

  // 3. Read CSV
  var csv = fs.readFileSync('WorldCLassBCNpunch V1.03ES - Time_Punches (1).csv', 'utf8');
  var lines = csv.split('\n').filter(function(l) { return l.trim().length > 0; });
  
  // Skip header
  var header = lines[0];
  var dataLines = lines.slice(1);
  console.log('CSV has ' + dataLines.length + ' punch rows');

  // 4. Parse punches
  var punches = [];
  var skipped = 0;
  
  for (var i = 0; i < dataLines.length; i++) {
    var line = dataLines[i];
    // Simple CSV parse (handle commas in fields)
    var parts = [];
    var current = '';
    var inQuotes = false;
    for (var j = 0; j < line.length; j++) {
      var ch = line[j];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { parts.push(current); current = ''; }
      else { current += ch; }
    }
    parts.push(current);

    // PunchID,TeacherName,TeacherEmail,Date,Time,PunchType,CreatedAt,EditedAt,Notes
    var email = (parts[2] || '').trim().toLowerCase();
    var date = (parts[3] || '').trim();
    var time = (parts[4] || '').trim();
    var punchType = (parts[5] || '').trim().toUpperCase();
    var createdAt = (parts[6] || '').trim();
    var notes = (parts[8] || '').trim();

    if (!email || !date || !punchType) { skipped++; continue; }
    if (punchType !== 'IN' && punchType !== 'OUT' && punchType !== 'PREP') { skipped++; continue; }

    var userId = emailToId[email];
    if (!userId) {
      // Try with LOU -> lourdes mapping
      if (email === 'lourdes.perez.worldclass@gmail.com') userId = emailToId['lourdes.perez.worldclass@gmail.com'];
      if (!userId) { skipped++; continue; }
    }

    // Normalize time
    var timeStr = time || '00:00';
    var tp = timeStr.split(':');
    timeStr = tp[0].padStart(2, '0') + ':' + (tp[1] || '00').padStart(2, '0') + ':00';

    // Parse created_at timestamp — CSV times are in Spain (Europe/Madrid) time
    var createdAtTs = null;
    if (createdAt) {
      // Append Madrid timezone offset to preserve the original time
      var parsed = new Date(createdAt);
      if (!isNaN(parsed.getTime())) {
        // Re-parse as Madrid time by appending the offset
        // Spain is UTC+2 in summer (CEST), UTC+1 in winter (CET)
        // Simplest: store the raw string with a +02:00 offset for CEST
        var month = parsed.getMonth();
        var offset = (month >= 2 && month <= 9) ? '+02:00' : '+01:00'; // rough CEST/CET
        createdAtTs = createdAt.replace(/\s+/g, 'T') + offset;
      }
    }

    punches.push({
      user_id: userId,
      date: date,
      time: timeStr,
      punch_type: punchType,
      notes: notes || null,
      created_at: createdAtTs || new Date(date + 'T' + timeStr).toISOString()
    });
  }

  console.log('Parsed ' + punches.length + ' valid punches (skipped ' + skipped + ')');

  // 5. Insert in batches
  var BATCH = 200;
  var inserted = 0;
  var errors = 0;

  for (var b = 0; b < punches.length; b += BATCH) {
    var batch = punches.slice(b, b + BATCH);
    var { error: insErr } = await sb.from('time_punches').insert(batch);
    if (insErr) {
      console.error('Batch ' + b + ' error: ' + insErr.message);
      errors++;
    } else {
      inserted += batch.length;
    }
    if ((b % 1000) === 0 || b + BATCH >= punches.length) {
      console.log('  Progress: ' + inserted + '/' + punches.length);
    }
  }

  console.log('\nDone! Inserted: ' + inserted + ', Errors: ' + errors);
  
  // Verify
  var { count } = await sb.from('time_punches').select('*', { count: 'exact', head: true });
  console.log('Total punches in DB: ' + count);
}

main().catch(console.error);
