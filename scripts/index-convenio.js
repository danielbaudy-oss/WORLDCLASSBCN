// Index the convenio text into material_embeddings for RAG
const fs = require('fs');
const https = require('https');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = 'https://ruytavhodexoxkejrgyb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const FILE_NAME = 'X Convenio Colectivo Enseñanza No Reglada (BOE 2025)';
const DRIVE_FILE_ID = 'convenio-boe-2025-local';

function chunkText(text) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned || cleaned.length < 50) return [];
  if (cleaned.length <= 1500) return [cleaned];
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + 1500;
    if (end < cleaned.length) {
      const p = cleaned.lastIndexOf('\n\n', end);
      const s = cleaned.lastIndexOf('. ', end);
      if (p > start + 750) end = p + 2;
      else if (s > start + 750) end = s + 2;
    }
    chunks.push(cleaned.substring(start, Math.min(end, cleaned.length)));
    start = end - 100;
  }
  return chunks;
}

function fetchJSON(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function embed(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text: text.substring(0, 8000) }] }
  });
  const res = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (res.status !== 200) {
    console.error('Embed error:', res.status, JSON.stringify(res.data).substring(0, 200));
    return null;
  }
  return res.data.embedding?.values || null;
}

async function insertChunk(chunk, index, embedding) {
  const embeddingStr = `[${embedding.join(',')}]`;
  const url = `${SUPABASE_URL}/rest/v1/material_embeddings`;
  const body = JSON.stringify({
    drive_file_id: DRIVE_FILE_ID,
    file_name: FILE_NAME,
    file_path: FILE_NAME,
    mime_type: 'application/pdf',
    chunk_index: index,
    chunk_text: chunk,
    embedding: embeddingStr,
    last_modified: new Date().toISOString()
  });
  const res = await fetchJSON(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body
  });
  if (res.status > 201) {
    console.error('Insert error chunk', index, ':', res.status, JSON.stringify(res.data).substring(0, 200));
    return false;
  }
  return true;
}

async function deleteExisting() {
  const url = `${SUPABASE_URL}/rest/v1/material_embeddings?drive_file_id=eq.${DRIVE_FILE_ID}`;
  await fetchJSON(url, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  console.log('Deleted any existing convenio chunks');
}

async function main() {
  if (!GEMINI_API_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('Set GEMINI_API_KEY and SUPABASE_SERVICE_KEY env vars');
    process.exit(1);
  }

  const text = fs.readFileSync('/home/baudy/convenio.txt', 'utf8');
  console.log('Text length:', text.length, 'chars');

  const chunks = chunkText(text);
  console.log('Chunks:', chunks.length);

  await deleteExisting();

  let success = 0, errors = 0;
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embed(chunks[i]);
    if (!embedding) { errors++; continue; }
    const ok = await insertChunk(chunks[i], i, embedding);
    if (ok) success++;
    else errors++;
    if (i % 10 === 0) console.log(`Progress: ${i+1}/${chunks.length} (${success} ok, ${errors} err)`);
    // Rate limit: 500ms between calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone! ${success} chunks indexed, ${errors} errors`);
}

main();
