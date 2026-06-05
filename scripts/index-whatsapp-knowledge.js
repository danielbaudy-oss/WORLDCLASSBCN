// Index the WhatsApp extracted knowledge into material_embeddings for RAG
// Run on Pi: GEMINI_API_KEY=... SUPABASE_SERVICE_KEY=... node scripts/index-whatsapp-knowledge.js
const fs = require('fs');
const https = require('https');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = 'https://ruytavhodexoxkejrgyb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const FILE_NAME = 'WhatsApp Knowledge Base (Procedures, Rules, School Info)';
const DRIVE_FILE_ID = 'whatsapp-knowledge-base-2026';

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
    mime_type: 'text/markdown',
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
  console.log('Deleted any existing whatsapp knowledge chunks');
}

// --- Knowledge sections to embed (prose format for better retrieval) ---

const knowledgeSections = [
  // 1. School Locations
  `WorldClass BCN tiene tres sedes: Raval (la principal, donde está la oficina de administración y la base de Rocío), Monumental (segunda sede) y Glòries (tercera sede, la más nueva). Las aulas tienen nombres propios: Ometepe, Buenos Aires, Cusco, Mallorca, La Mancha y Granada. Los profesores trabajan en varias sedes según su horario. Los materiales y bolsas de juegos están organizados por sede — no se deben mezclar entre ubicaciones. Cada sede tiene impresora (la tinta se acaba con frecuencia) y sala de profes con taquillas y portátiles disponibles.`,

  // 2. Access & Credentials
  `Accesos importantes de la escuela: El formato del email de la escuela es nombre.apellido.worldclassbcn@gmail.com. Espacio Profes está en Google Drive (se accede con el email de la escuela). El Super Excel es el documento central de programación en Drive. Las vacaciones se solicitan en el "calendario de equipo". Google Classroom se crea desde recepción y no se activa hasta la segunda clase (el primer día no se sabe quién se apunta definitivamente). El fichaje digital está en la app de la escuela. Para contraseñas (Campus Difusión, email, wifi), pregunta directamente a Rocío — no se comparten por este canal.`,

  // 3. Course formats
  `Formatos de curso en WorldClass BCN: Intensivo = 20h/semana (4h/día de lunes a viernes). Semi-intensivo = ~10h/semana. Extensivo = 80h en total (antes era 70h, los programas se están actualizando), entre 4-7h/semana. Rotativo = sistema de matrícula continua donde los estudiantes entran y salen en los límites de cada módulo. Los módulos duran aproximadamente 16 horas de clase para A1.`,

  // 4. Levels & Books
  `Niveles y libros en WorldClass BCN: A1.1 y A1.2 usan Aula Plus 1 más cuadernillo. A2.1 y A2.2 usan Aula Plus 2 más cuadernillo. B1 usa Aula Plus 3 (los estudiantes lo compran). B2 usa Gente Hoy (el libro azul, la escuela lo proporciona para uso en clase). C1 existe pero tiene menos estructura. Términos importantes: LT = Libro de Trabajo (complemento de Gente Hoy). Cuadernillo = ~10 páginas de ejercicios suplementarios de mecanización, se da el primer día de cada módulo. Sesión = 55 minutos de clase. Tarea evaluable = tarea calificada al final de cada módulo (los estudiantes PUEDEN usar apuntes). Bolsa de materiales = bolsa con juegos y actividades por nivel y módulo, se controla por sede.`,

  // 5. Evaluation system
  `Sistema de evaluación: La nota media final de todos los módulos debe ser ≥60% para aprobar. No es necesario sacar 60 en cada examen individual de módulo — lo que cuenta es la media de todos juntos. Si suspende (media <60%), el estudiante recibe solo "certificado de asistencia" (no "de aprovechamiento") y no puede continuar al siguiente nivel. Componentes: examen escrito (gramática, vocabulario, comprensión lectora), examen oral (con tarjetas de la carpeta de evaluación por nivel), y tarea evaluable (por módulo, acumulativa). Los exámenes son OBLIGATORIOS para todos los estudiantes (incluso si tienen certificación Cervantes externa). Si un estudiante no puede asistir el día del examen, puede hacerlo otro día. Si no hace la tarea evaluable, todo el porcentaje pasa al examen final. Las rúbricas están disponibles por nivel. Las evaluaciones se guardan en Google Drive.`,

  // 6. Substitution system
  `Sistema de sustituciones (sustis): 1) El profesor informa a Rocío de su ausencia. 2) Rocío envía la lista de fechas disponibles a TODOS los profesores. 3) Los profesores se ofrecen para los huecos (por orden de llegada). 4) Rocío confirma y elimina de la lista. 5) El sustituto recibe información del contenido (por mensaje o programa en Excel). Información necesaria para una susti: nivel y módulo de la clase, número de sesión, deberes asignados, y contexto sobre los estudiantes. Regla clave: se espera que todos contribuyan — los de mañana también cubren tardes y viceversa. Es "fair play".`,

  // 7. HR - Vacaciones
  `Vacaciones y días libres: 31 días naturales al año (incluye fines de semana y festivos dentro del período). Se asignan por antigüedad. Se solicitan en el "calendario de equipo" y Rocío + Silvia aprueban. Hay que organizar las sustituciones ANTES de que se confirmen las vacaciones. Asuntos propios: 3 días/año, el profesor los solicita, necesita aprobación. Días de empresa: 4 días/año, decididos POR la empresa (no los solicita el profesor). Horas extras: se controlan trimestralmente en la "bolsa de horas". Bajas por enfermedad: notificar a Milena Y a Rocío con el máximo tiempo de antelación posible, enviar justificante médico a Milena.`,

  // 8. Fichaje
  `Fichaje (control horario): Es OBLIGATORIO — todos los profesores deben registrar sus horas. Anteriormente se hacía en un formulario físico en recepción que se rellenaba mensualmente. Ahora existe un sistema digital de fichaje. Si se te olvida fichar, avisa a Rocío y ella puede añadirlo manualmente (pero que no sea costumbre). Es fundamental registrar las horas desde el primer día de trabajo.`,

  // 9. Onboarding
  `Proceso de incorporación de nuevos profesores: 1) Entrevista con Silvia (directora/propietaria). 2) Primera reunión con Rocío (jefa de estudios) — normalmente por Zoom o en persona. 3) Firmar contrato + recoger libros en la escuela (primero con Silvia, luego con Rocío). 4) Crear email de la escuela → obtener acceso al Drive. 5) Rocío comparte: Espacio Profes Drive → programas → programa específico para sus clases. 6) Recibir códigos de acceso a Campus Difusión. 7) Ver horario en Super Excel. 8) Aprender el sistema de fichaje (registrar horas desde el día 1). 9) Primeras clases: seguir el programa de cerca, preguntar a Rocío cualquier duda. 10) Observación por parte de Rocío en las primeras semanas.`,

  // 10. What new teachers need Day 1
  `Lo que los nuevos profesores necesitan saber el primer día: Google Classroom (no se activa hasta la 2ª clase — la inscripción es incierta el día 1). Qué libro usa el grupo. Cómo funcionan los módulos y las evaluaciones. Dónde encontrar materiales (sala de profes, bolsas, impresora). El requisito del fichaje. A quién contactar: Rocío para temas académicos, Milena para administración/contratos, Silvia para decisiones de alto nivel.`,

  // 11. Programs & Materials
  `Programas y materiales: Los programas están en Espacio Profes Drive → carpeta "programas 26" → por nivel. Cada sesión está planificada con actividades, páginas y tiempos. Los programas extensivos se están actualizando del formato 70h al de 80h. Materiales disponibles: fichas de trabajo (Campus Difusión), cuadernillos (impresos, uno por módulo), bolsas de juegos (tarjetas, Dobble de vocabulario, Palabrea, dominó de las horas, bingo de partes del cuerpo, herencia de la tía Pepa, tablero de ser/llamarse, actividades de deletreo), infografías por tema gramatical, tarjetas de evaluación (por nivel, en carpeta en Raval), y la Gramática Básica del Estudiante (libro amarillo) como referencia.`,

  // 12. Photocopies & file sharing rules
  `Reglas sobre fotocopias y archivos: Del libro principal Aula Plus las copias están restringidas (regla de Silvia). Del cuadernillo se pueden hacer copias libremente. Los programas son solo impresos, NO se deben digitalizar en PDF (regla de Silvia). No se comparten archivos (PDFs, fotos de materiales, programas escaneados) por canales digitales — todo se gestiona en físico en la escuela.`,

  // 13. No students show up
  `Procedimiento si no viene ningún estudiante a clase: Esperar 15 minutos. Enviar mensaje a Rocío (o si no está disponible, al grupo general). Si se confirma que nadie viene: puedes irte, registra el tiempo.`,

  // 14. Wrong level student
  `Si un estudiante tiene el nivel equivocado: Comunicar INMEDIATAMENTE a Rocío (el mismo día). No esperar hasta el examen — es más difícil de solucionar después.`,

  // 15. Trial class
  `Clases de prueba: Se registran en el "espacio de clases de prueba". Da la bienvenida al estudiante, inclúyelo de forma natural en la clase. Después informa a Rocío de tu evaluación de nivel.`,

  // 16. Material errors
  `Si encuentras errores en los materiales: Repórtalos en el grupo de WhatsApp "Correcciones programa nuevo". Incluye: nivel, módulo, número de actividad y descripción del error. Adjunta foto si es posible.`,

  // 17. Meetings
  `Reuniones de equipo: Normalmente a las 15:15 en Raval (sede Mallorca). Se controla la asistencia. El acta se publica en "calendario de equipo". Si no puedes asistir: lee el acta.`,

  // 18. Private classes
  `Clases privadas: Se organizan a través de recepción → Rocío asigna profesor. Los packs de 10 horas son habituales. Hora de inicio: 15:10 (no en punto, para dar margen al profesor). El profesor debe preparar específicamente según las necesidades del cliente.`,

  // 19. Key people
  `Personas clave y roles en WorldClass BCN: Rocío = Jefa de estudios (preguntas académicas, programas, sustis, evaluaciones, materiales). Silvia = Directora/Propietaria (decisiones de alto nivel, contratos, nuevas contrataciones, presupuesto). Milena = Administración/RRHH (contratos, pagos, justificantes de baja, administración técnica). Kamila (Kami) = Recepción en Monumental/Glòries (logística, materiales, coordinación de clases de prueba). Nicolás (Joan/Nico) = Profesor senior (co-gestiona programas, creó el grupo de correcciones).`,

  // 20. Rotativo system
  `Sistema rotativo: Es un orden específico de unidades (NO secuencial del libro). Los estudiantes entran y salen en los límites de cada módulo. El profesor debe seguir el orden rotativo establecido, no el orden del libro. Cada nivel rotativo tiene su orden propio documentado en el programa.`,

  // 21. Campus Difusión
  `Campus Difusión: Es la plataforma online donde profesores y estudiantes acceden a los libros digitales (Aula Plus y Gente Hoy). Se accede con un código que proporciona Rocío. Tiene fichas de trabajo descargables y materiales proyectables opcionales. El Libro de Trabajo (LT) de Gente Hoy también está disponible como manual hojeable en Campus Difusión. Si tu código no funciona, consulta con Rocío.`,

  // 22. Exam logistics
  `Logística de exámenes: Los exámenes escritos se encuentran en Espacio Profes → carpeta EVALUACIONES. El profesor puede imprimirlos o la escuela los tiene preparados. Tras el examen, los papeles se dejan en recepción para que los recoja el profesor titular. Las tarjetas de evaluación oral están en la "carpeta de evaluación" por nivel en Raval. Las notas se registran en el Super Excel (responsabilidad del profesor).`
];

async function main() {
  if (!GEMINI_API_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('Set GEMINI_API_KEY and SUPABASE_SERVICE_KEY env vars');
    process.exit(1);
  }

  console.log('Knowledge sections:', knowledgeSections.length);

  // Chunk any sections that are too long
  let allChunks = [];
  for (const section of knowledgeSections) {
    const chunks = chunkText(section);
    allChunks = allChunks.concat(chunks);
  }
  console.log('Total chunks after splitting:', allChunks.length);

  await deleteExisting();

  let success = 0, errors = 0;
  for (let i = 0; i < allChunks.length; i++) {
    const embedding = await embed(allChunks[i]);
    if (!embedding) { errors++; continue; }
    const ok = await insertChunk(allChunks[i], i, embedding);
    if (ok) success++;
    else errors++;
    console.log(`Progress: ${i+1}/${allChunks.length} (${success} ok, ${errors} err)`);
    // Rate limit: 500ms between calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone! ${success} chunks indexed, ${errors} errors`);
}

main();
