// Re-embed the evaluation chunk after text correction
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = 'https://ruytavhodexoxkejrgyb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const newText = `Sistema de evaluación: Cada examen final de nivel se aprueba con un 65/100. Pero lo que realmente cuenta para pasar de nivel es la nota media de todos los módulos: si la media es ≥60%, el estudiante aprueba aunque algún módulo individual esté por debajo. Si suspende (media <60%), el estudiante recibe solo "certificado de asistencia" (no "de aprovechamiento") y no puede continuar al siguiente nivel. También necesitan un 70% de asistencia para obtener el certificado. Componentes de evaluación: examen escrito (gramática, vocabulario, comprensión lectora), examen oral (con tarjetas de la carpeta de evaluación por nivel), y tarea evaluable (por módulo, acumulativa — los estudiantes PUEDEN usar apuntes). Los exámenes son OBLIGATORIOS para todos los estudiantes (incluso si tienen certificación Cervantes externa). Si un estudiante no puede asistir el día del examen, puede hacerlo otro día. Si no hace la tarea evaluable, todo el porcentaje pasa al examen final. Las rúbricas están disponibles por nivel en Google Drive (Espacio Profes).`;

function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch(e) { resolve({ status: res.statusCode, data }); } });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  // Get embedding
  const embRes = await fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: newText }] } })
  });
  if (embRes.status !== 200) { console.error('Embed failed:', embRes.status); process.exit(1); }
  const embedding = embRes.data.embedding.values;
  console.log('Got embedding, dims:', embedding.length);

  // Update the row
  const embStr = `[${embedding.join(',')}]`;
  const updateRes = await fetchJSON(`${SUPABASE_URL}/rest/v1/material_embeddings?drive_file_id=eq.whatsapp-knowledge-base-2026&chunk_index=eq.4`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ embedding: embStr })
  });
  console.log('Update status:', updateRes.status);
  if (updateRes.status <= 204) console.log('Done! Evaluation chunk re-embedded.');
  else console.error('Error:', updateRes.data);
}

main();
