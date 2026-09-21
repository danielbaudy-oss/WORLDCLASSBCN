# Session Log: Class Helper Assistant Build

> ⚠️ **PUSH ONLY THROUGH THE "toyboy" SERVER** (as of Jul 2026 — replaced the Raspberry Pi).
> This laptop has NO access to GitHub (github.com is blocked on this machine only).
> `git push` from this machine ALWAYS fails. Every commit/push must go via toyboy:
> 1. `scp "<file>" baudy@192.168.1.181:~/WORLDCLASSBCN/<file>` (one per changed file)
> 2. `ssh baudy@192.168.1.181 "cd ~/WORLDCLASSBCN && git add -A && git commit -m '...' && git push origin main 2>&1"`
> Note: this laptop's local git is far behind `origin` (all real pushes happen from toyboy),
> so `git log`/`git status` here do NOT reflect what's actually on GitHub.
> Full details in `.kiro/steering/pi-relay.md` and `TOYBOY-MIGRATION.md`.
> (The old Raspberry Pi `baudy@baudypi.local` is being retired — do not use it.)

## Date: May 28, 2026

## What was built
- AI-powered chat assistant ("Asistente Profe") for WorldClass BCN school app
- Floating chat bubble widget with rainbow gradient design
- RAG system indexing 230 Google Drive files (1,524 chunks)
- Supabase Edge Functions for chat + indexing
- Gemini 2.5 Flash as LLM, gemini-embedding-001 for embeddings

## Architecture
- **Frontend**: `js/chat-widget.js` — floating bubble injected into teacher.html and admin.html
- **Backend**: Supabase Edge Functions (`class-helper`, `index-materials`)
- **Database**: `material_embeddings` table with pgvector (3072 dimensions), `chat_usage` for daily limits
- **LLM**: Gemini 2.5 Flash (paid tier, prepaid credits)
- **Embeddings**: gemini-embedding-001 (3072 dims)
- **Google APIs**: Drive API (read materials), Sheets API (schedule - pending)

## Key Decisions & Learnings

### Gemini API in EU/Spain
- **Free tier does NOT work in EEA** — quota is literally 0 for all models
- Must use **paid tier** (Tier 1) — link billing account + prepay minimum €10
- The €300 Google Cloud trial credits CANNOT be used for Gemini API (as of March 2026)
- `text-embedding-004` model doesn't exist on paid tier — use `gemini-embedding-001` instead
- `gemini-2.0-flash` blocked in EU — use `gemini-2.5-flash`
- AI Studio browser works fine (different auth path) but API keys return 429 until paid tier is activated

### Supabase Edge Functions
- `verify_jwt: true` causes 401 if the token format doesn't match exactly — safer to set `false` and validate auth manually in code
- `db.rpc(...).catch()` doesn't work — Supabase JS v2 returns a PromiseLike, not a native Promise. Use try/catch instead
- Old function versions can stay "warm" and serve requests after redeployment — may need to wait or redeploy multiple times
- Edge Functions have 150-second timeout on free tier — batch long operations

### pgvector
- HNSW index has 2000 dimension limit — can't use with 3072-dim embeddings
- For small datasets (<1000 rows), exact search without index is fast enough
- Embedding must be passed as string `"[0.1,0.2,...]"` to Supabase insert, not as JSON.stringify of the array

### Indexing Pipeline
- Process 5 files per Edge Function call to stay under timeout
- Use pagination (nextPageToken) to process all files across multiple calls
- Skip files that haven't changed (compare last_modified timestamp)
- Google Docs export as text/plain, Sheets as text/csv
- Cap file content at 50k chars, chunks at 1500 chars with 100 char overlap

### Chat Widget
- Injected via `chat-widget.js` loaded at end of page
- Test-account-only visibility via email whitelist
- Suggestions fill input field (don't auto-send) — better UX
- Mobile: full-screen overlay with safe-area-inset padding
- Markdown links rendered as clickable `<a>` tags

## Costs
- Gemini API spend: ~€0.05 for entire session (testing + indexing 230 files)
- Estimated monthly cost for 30 teachers: €0.50-2.00
- Prepaid €25 credits — will last 6+ months

## Still Pending
- Schedule queries (Google Sheet not shared with service account yet — owner needs to approve)
- Admin replacement finder (needs schedule data)
- Remaining Drive files (session token expired at batch 49 — ~30 more files to index, just re-run the script)
- PDF parsing (currently skipped — only Google Docs/Sheets/text indexed)
- Pi cron job for automatic daily re-indexing
- Remove test-account restriction when ready for production
- Edit punches via chat (complex — save for later)
- Mobile: star icon slightly off-center on some devices (minor)

## Accounts & Credentials
- Google Cloud Project: `worldclass-bcn` (project number: 357735840740)
- Service Account: `worldclass-assistant@worldclass-bcn.iam.gserviceaccount.com`
- Supabase Project: `ruytavhodexoxkejrgyb`
- GitHub repo: `danielbaudy-oss/WORLDCLASSBCN`
- Pi SSH: `baudy@baudypi.local`
- Schedule Sheet ID: `17XksinYalh1cpS3iqvPDmtGSuHWRxnDafvW04NLb9XY` (pending access)


---

## Session: April 15, 2026 (continued into April 22)

### What was done

#### Dev Environment Setup
- Created `dev` git branch for development
- Set up localhost testing with `serve . -p 3000`
- Fixed OAuth redirect for localhost (added `http://localhost:3000/` to Supabase redirect URLs)
- Added dev role switcher (floating UI, localhost only) — switches between teacher/admin/super_admin via `switch_dev_role` RPC function
- Connected Supabase MCP (HTTP mode with OAuth) — Kiro can now run SQL directly
- Renamed test account to "🧪 Test Account"
- Added localhost cache-busting for JS files (auto-appends `?v=timestamp` on localhost only)

#### Git Push via Pi
- GitHub is blocked on this laptop (corporate DNS blocks github.com)
- All pushes go through the Raspberry Pi: `scp` file → `ssh` commit+push
- Created `.kiro/steering/pi-relay.md` so future sessions know this automatically

#### Calendar Fixes
- All calendar views now start week on Monday (Lun-Dom) instead of Sunday
- Future month navigation enabled (up to 12 months forward) in all calendars
- "↺ Hoy" click-to-return on month title in all calendar views
- Admin employee calendar now shows holiday overlays (teacher holidays + school holidays) with color-coded legend
- Day detail panel shows holiday banners when clicking into a day

#### Holiday Deletion Fix
- DELETE policy was missing on `holiday_requests` — added it
- Created `delete_holiday_with_reason` RPC (SECURITY DEFINER) — requires mandatory reason, logs to audit
- Delete dialog now shows a textarea for the reason (required field)
- Calendar view refreshes after deletion

#### Punch Deletion with Reason
- Created `delete_punch_with_reason` RPC — requires mandatory reason, logs to audit
- Both teacher and admin punch delete now show a modal asking for reason
- Reason stored in audit_log's `new_data` field as `{"deletion_reason": "..."}`

#### Holiday Request Dismiss (Teacher View)
- Each Approved/Rejected request has a small ✕ button
- Clicking hides it from the employee's view only (localStorage per user)
- Pending requests can't be dismissed
- Database record stays intact for audit trail

#### Audit Report Upgrade (from MIKAN)
- `audit_log.changed_by` column changed from uuid → text (stores actor names now)
- New `audit_trigger_fn()` resolves `auth.uid()` to `profiles.name`
- All triggers repointed to new function
- `exportAuditReport()` completely rewritten:
  - Fichajes sheet: +Status, +Fichado por, +Última modificación, +ID columns
  - Auditoría sheet: edits+deletes only (no INSERT noise), with Empleado, Fecha fichaje, Hora original, Qué cambió, Antes, Después, ID columns
  - Historical uuid `changed_by` values resolved to names via profileMap fallback

#### Keep-Alive Workflow
- GitHub Actions workflow runs every 3 days
- Pings Supabase (prevents 7-day auto-pause)
- Self-refreshes via Actions API (prevents 60-day schedule disable)
- Zero commits, zero maintenance

#### Atlas Chatbot Improvements
- Renamed from "Asistente Profe" to "Atlas"
- Custom SVG sparkle icon (4-pointed star with quarter-circle concave arcs)
- No auto-keyboard on open (removed input focus)
- Mobile: full-screen overlay with `100dvh` for proper keyboard behavior
- Role-specific welcome messages and quick-selects based on URL path (teacher.html vs admin.html)
- Disabled autocomplete/autocorrect on input to minimize iOS keyboard accessory bar

#### Convenio Indexed for RAG
- Downloaded X Convenio Colectivo de Enseñanza y Formación No Reglada (BOE July 2025)
- Extracted text via `pdftotext` on Pi (136KB, 118 chunks)
- Indexed all 118 chunks into `material_embeddings` using Gemini embedding API
- Atlas can now answer questions about labor rights, vacation, contracts, etc.

#### Schedule Feature Designed (not yet built)
- `CHATBOT-SCHEDULE-DESIGN.md` created with full architecture
- Covers: classes table, substitutions, trials, rooms, capacity planning
- Data source: "Super excel 25-26.xlsx" (local) + Google Sheets API (pending access)
- Waiting for sheet owner to share with service account

### Credentials (reference)
- Gemini API Key: stored in Supabase Edge Function secrets (key starts with AIzaSy...)
- Google Cloud Project: `worldclass-bcn` (project number: 357735840740)
- Service Account: `worldclass-assistant@worldclass-bcn.iam.gserviceaccount.com`
- Schedule Sheet ID: `17XksinYalh1cpS3iqvPDmtGSuHWRxnDafvW04NLb9XY` (pending access)
- Supabase MCP: HTTP mode via `https://mcp.supabase.com/mcp?project_ref=ruytavhodexoxkejrgyb`

### Still Pending
- Schedule data import (waiting for Google Sheet access from owner)
- WhatsApp chat export → knowledge base extraction
- FAQ curation from chat history
- PDF parsing in the Drive indexer (currently skips PDFs)
- Remove Atlas test-account restriction when ready for production
- Sync dev branch with main (dev is behind after direct-to-main pushes)


---

## Continued: April 22, 2026 (morning)

### Atlas Chatbot Updates
- Topic restriction added to system prompt (refuses personal/off-topic questions)
- Daily limit: 20 messages/day for ALL users (teachers + admins)
- Deployed as class-helper v26
- Tested: "how is the weather" → correctly refused ✓

### Convenio Indexed
- X Convenio Colectivo de Enseñanza y Formación No Reglada (BOE July 2025)
- Extracted text via pdftotext on Pi (136KB)
- Indexed 118 chunks into material_embeddings via Gemini embedding API
- Script: `scripts/index-convenio.js` (runs on Pi with env vars)
- Gemini API Key: starts with AIzaSyDl... (stored in Supabase Edge Function secrets)

### WhatsApp Chats Uploaded
- Folder: `whatsapp-chats/` — 24 chat exports
- Format: WhatsApp text export without media (`.txt` files per folder)
- Teachers: Andrea, Andrés, Beatriz, Berta, Claudia, Fanny, Kamila, Kathia, Laia, Lidia, Lourdes, Mar, Marta, Nerea, Nicolás, Paula, Raúl, Sara, Sergio, Verónica
- Bosses: Silvia WCBCN (Rocío's boss), Las jefas 3.0 (Silvia + Milena)
- Special: "Correcciones programa nuevo" (material feedback from teachers)
- Unknown: +34 686 49 33 90
- Rocío = the person who responds in all chats (jefa de estudios / head of studies)

### Processing Plan (next task)
1. Parse all 24 chat `.txt` files
2. Extract permanent knowledge (procedures, passwords, material locations, rules)
3. Extract Rocío's tone/style for Atlas personality
4. Categorize: permanent vs temporal vs discarded
5. Track per-teacher patterns (who asks what repeatedly)
6. Flag gaps where media was omitted
7. Output: curated knowledge base + tone brief for review
8. After review: embed permanent knowledge into RAG

### Key Info Already Visible from First Chat (Andrea)
- Campus Difusión password: Bisbelaguarda441 (might have changed — flag for review)
- LT = "Libro de Trabajo" (workbook for Gente Hoy)
- Zoom link pattern for onboarding meetings
- Contract signing + book pickup happens in person before first class
- New teachers meet Silvia first, then Rocío
- Materials (games like Dobble/Palabrea) can be borrowed between locations
- Substitution procedure: if no one shows up, message the group


### NEXT SESSION TASK: WhatsApp Chat Processing

**What to do:**
Read all 24 `.txt` files in `whatsapp-chats/` and produce a structured knowledge extraction document.

**Folder structure:**
Each subfolder has a `_chat.txt` file inside. Format: `[DD/MM/YY, HH:MM:SS] Name: message`

**People in the chats:**
- **Rocío** = the person responding in ALL chats. She is the "jefa de estudios" (head of studies / teacher manager). Her boyfriend Daniel built this app. Atlas should sound like her.
- **Silvia WCBCN** = Rocío's boss (school owner/director)
- **Las jefas 3.0** = group chat with both bosses (Silvia + Milena)
- **Correcciones programa nuevo** = group chat where teachers report issues with teaching materials (screenshots — mostly lost in export, but text feedback remains)
- **+34 686 49 33 90** = unknown contact, check content to identify
- **All others** = teachers at WorldClass BCN

**What to extract:**

1. **PERMANENT KNOWLEDGE** (for RAG embedding):
   - School procedures (how to request a sub, what to do if no students show up, how to access materials)
   - Passwords/access info (Campus Difusión, Zoom, rooms, wifi — flag if potentially outdated)
   - Material locations (which books are where, how the program works)
   - Rules (who to contact for what, notification procedures, class management)
   - Room logistics (names, equipment, locations)
   - Onboarding process (what new teachers need to know)

2. **ROCÍO'S TONE** (for Atlas system prompt):
   - How she greets people
   - How she delivers info (concise? detailed? emoji usage?)
   - How she says no or delivers bad news
   - Her catchphrases or recurring patterns
   - Formality level (tú vs usted, how warm vs professional)
   - Output as a short "personality brief" paragraph for the system prompt

3. **PER-TEACHER PATTERNS** (for future personalization):
   - Which teachers ask the same questions repeatedly
   - Common confusion points per teacher
   - What kind of support each teacher needs most

4. **MATERIAL FEEDBACK** (from Correcciones programa nuevo):
   - Specific issues teachers found with modules/units
   - Suggestions for improvements
   - Which levels/modules get the most complaints

**What to SKIP:**
- Situational messages ("I'm running late", "ok 👍", single-day events)
- Personal chit-chat (birthday wishes, dinner plans)
- Messages that clearly reference omitted media without enough text context

**Output format:**
Create `WHATSAPP-KNOWLEDGE-EXTRACTION.md` with structured sections. Mark anything that needs Rocío's review with ⚠️.

**After review:**
Once Daniel/Rocío approve the extraction, embed the permanent knowledge chunks into `material_embeddings` using the same script pattern as the convenio (`scripts/index-convenio.js`).

**Important notes:**
- GitHub is blocked on this laptop — push via Pi (see `.kiro/steering/pi-relay.md`)
- Supabase MCP is connected (HTTP mode)
- Gemini API key starts with AIzaSyDl... (set as env var on Pi for indexing scripts)
- Don't commit the whatsapp-chats folder to git (sensitive data) — add to .gitignore


---

## Session: June 2, 2026

### Atlas Goes Live for All Teachers 🚀

#### WhatsApp Knowledge Extraction
- Processed all 24 WhatsApp chat exports (`whatsapp-chats/`)
- Created `WHATSAPP-KNOWLEDGE-EXTRACTION.md` — structured document with:
  - Permanent knowledge (22 sections covering procedures, HR, evaluation, onboarding, etc.)
  - Rocío's tone profile (personality brief for Atlas system prompt)
  - Per-teacher FAQ patterns (what each teacher asks repeatedly)
  - Material feedback from "Correcciones programa nuevo" (errors by level/module)
- Unknown number identified: **Diego Rodriguez** (new teacher, March 2026, Glòries)
- Output: `REVIEW-BEFORE-EMBEDDING.md` with 9 items for confirmation → all resolved

#### Knowledge Embedded into RAG
- 22 knowledge chunks embedded via `scripts/index-whatsapp-knowledge.js`
- Run on Pi: zero errors, all 22 indexed
- Total RAG corpus now: **1,664 chunks** (Drive materials + Convenio + WhatsApp knowledge)
- DB size: 58 MB / 500 MB free tier (~12% capacity, safe for years)

#### Atlas System Prompt Overhaul (v29-v32)
- **Personality**: Atlas now talks like Rocío (warm, tuteo, emojis, "jelou!")
- **Mandatory RAG search**: For ANY procedural question, Atlas must search before answering. Never invents procedures.
- **Banned terminology**: "coordinador", "secretaría académica", "intranet", "sistema de gestión" — none of that exists at WorldClass
- **School context baked in**: 3 locations, who to contact for what, Google Drive (not intranet)
- **No passwords in RAG**: Atlas tells teachers to ask Rocío directly
- **Links embedded inline**: Drive links woven into answers naturally (not listed at end)
- **Pass grade clarified**: 65/100 per exam, 60% media across all modules, 70% attendance
- **Spain timezone fix**: All time calculations now use `Europe/Madrid` (was UTC, 2h off)

#### Chat Statistics System
- New `chat_logs` table: anonymous logging (no user_id), tracks question/response/topic/sources/response_time
- Auto-categorizes topics: evaluacion, sustitucion, materiales, horario, vacaciones, fichaje, onboarding, otro
- Views for admin: `chat_statistics` (dashboard), `chat_top_questions` (FAQ curation)
- Edge Function returns `log_id` for feedback tracking

#### Frontend Updates
- **Thumbs up/down feedback**: Grey SVG icons under every Atlas response. Click → "Gracias por tu feedback" fades away in 2s. PATCH to `chat_logs.helpful`.
- **Session tracking**: `session_id` (random UUID per conversation) sent with each message
- **Confirm buttons fixed**: Only show ✓/✗ when Atlas says "Confirma para enviar/añadir" — not on any message mentioning "confirma"
- **Quick-selects updated** (based on real WhatsApp FAQs):
  - Teacher: "Mis vacaciones", "No viene nadie", "Tarea evaluable", "Fichar horas"
  - Admin: "Vacaciones equipo", "Horas equipo", "Consultar convenio", "Proceso sustis"
- **Test account restriction removed** — Atlas is now visible to ALL logged-in users

#### Edge Function Version History (this session)
| Version | Change |
|---------|--------|
| v27 | Added anonymous chat logging + topic categorization |
| v28 | Returns `log_id` for frontend feedback |
| v29 | New system prompt (Rocío personality, mandatory RAG search, banned terms) |
| v30 | Spain timezone fix (`Europe/Madrid`) for all date/time calculations |
| v31 | Drive links returned for real Google Drive files (not synthetic IDs) |
| v32 | Links embedded inline in text (not separated at end) |

#### RAG Quality Evaluation
Tested 5 top FAQ queries against embeddings:
- ✅ "No viene nadie" → correct procedure (similarity 1.0)
- ✅ "Vacaciones" → 31 días naturales + full rules (0.80)
- ✅ "Dónde están los programas" → Espacio Profes > programas 26 (0.79)
- ✅ "Sistema de sustis" → 5-step process + protocol doc (0.80)
- ⚠️ "Tarea evaluable" → fixed pass grade conflict (65 per exam vs 60 media)

#### Files Created
- `WHATSAPP-KNOWLEDGE-EXTRACTION.md` — full extraction document
- `REVIEW-BEFORE-EMBEDDING.md` — review checklist (all items resolved)
- `scripts/index-whatsapp-knowledge.js` — embedding script (22 chunks)
- `scripts/fix-eval-embedding.js` — one-off fix for evaluation chunk

#### Decisions Made
- 🔒 No passwords/codes in RAG (teachers ask Rocío)
- 🔒 No PDFs/photos shared by Atlas (Drive links OK)
- 🔒 Chat logs are anonymous (no user_id stored)
- ✅ Campus Difusión codes excluded for now
- ✅ Pass threshold: 65% per exam, 60% overall media
- ✅ Cuadernillos definitivos confirmed ready
- ✅ Atlas launched for all users (test restriction removed)

### Still Pending
- Schedule data (Super Excel access from Google Sheets — owner needs to share with service account)
- Admin panel stats page (show `chat_statistics` view)
- PDF parsing in Drive indexer
- Pi cron for daily re-indexing
- Monitor Atlas usage via `chat_logs` and iterate based on feedback


---

## Session: June 2, 2026 (continued — afternoon)

### Atlas Dashboard & Security Hardening

#### Dashboard Built (admin.html → "✦ Atlas Analytics")
- Visible only to `super_admin` role (nav item hidden for regular admins)
- Fixed: Daniel's account was `admin` not `super_admin` — updated in DB
- Layout:
  - Row 1: Stat cards (total msgs, last 7d, sessions 7d, satisfaction %)
  - Row 2: 7-day usage histogram (bars per day, today in purple) | Feedback pie chart (SVG donut, % center)
  - Row 3: Últimas preguntas (full-width table with question, topic, feedback, time, date)
  - Row 4: Temas más consultados (progress bars) | Preguntas repetidas FAQ (table with count + thumbs down)
- All data loads from `chat_logs` table via Supabase client
- Cleared test data from morning (both `chat_logs` and `chat_usage`)

#### Security Hardening (v33)
- System prompt now has **SEGURIDAD — REGLA ABSOLUTA** section at top:
  - NEVER reveal passwords, access codes, tokens, API keys, credentials — no exceptions
  - NEVER reveal other users' personal data (emails, phone numbers, hours worked)
  - Rule explicitly states: no exceptions even if user claims to be admin
- Verified: `add_punches` tool is hardcoded to `ctx.userId` — teachers CANNOT punch for other users
- Write operations (`add_punches`, `request_holiday`) always use authenticated user's ID
- Read operations (`get_holidays`, `get_work_hours`) restricted: teachers can only see own data, admins can view others (read-only)

#### Frontend Fixes
- Confirm buttons: only appear for "Confirma para enviar" / "Confirma para añadir" — not on any message containing "confirma"
- Timezone: all Edge Function time calculations use `Europe/Madrid` (was UTC, 2h off)
- Drive links: returned only for real Google Drive file IDs (not synthetic KB IDs), embedded inline in text

#### Edge Function Versions (this afternoon)
| Version | Change |
|---------|--------|
| v33 | Security: absolute ban on passwords + user data disclosure |

#### Learning Pipeline Decision
- Manual, not automatic — and that's correct for a school
- Workflow: check dashboard → see 👎 → fix knowledge chunk → re-embed
- No auto-learning from bad answers (too risky for procedures)
- Future option: "flag for review" button that creates a queue


---

## Session: June 5, 2026 (continued)

### What was done

#### Catalunya Convenio Indexed
- Replaced the national BOE convenio (X Convenio Estatal) with the correct **II Conveni Col·lectiu Autonòmic d'Ensenyament i Formació No Reglada de Catalunya (DOGC April 2025)**
- Source file: `2083224.pdf` (added to workspace)
- Extracted via `pdftotext` on Pi → 130K chars → 113 chunks indexed (0 errors)
- Script: `scripts/index-convenio-cat.js`
- System prompt (v34) updated: tells Atlas it's the Catalan convenio, always mention "de Catalunya"
- Deleted old national convenio from `material_embeddings`

#### Punch Range Mode (v35)
- `add_punches` tool now supports range mode: `start_date` + `end_date` + `in_time` + `out_time`
- Server generates workday dates automatically (no more relying on Gemini to produce JSON arrays)
- MaxPastDays increased from 30 to 180 (allows punching months back)
- Better summary for large batches: shows first 5 days + "... y X días más"
- Already-punched days are SKIPPED (not overwritten) — shown in rejected list

#### Dashboard Fixes
- Pie chart: green on 100% positive feedback (was showing red background)
- Padding added to Temas, Preguntas repetidas, Últimas preguntas sections
- Bottom padding on histogram
- 👍/👎 column widened to prevent line wrapping

#### Atlas Header
- Added "WorldClass BCN" branding in chat overlay header (baseline-aligned, subtle)

### PENDING FOR NEXT SESSION — Punch Improvements

The following were requested but not yet implemented:

1. **Ask which days**: Before punching a range, Atlas should ask:
   - "¿Todos los días laborables, o solo ciertos días de la semana?" (e.g., only Mon/Wed/Fri)
   - Add a `weekdays` parameter to `add_punches` (e.g., `[1,3,5]` for Mon/Wed/Fri)

2. **Don't overwrite existing punches**: Already handled — `alreadyPunched` Set skips them. But the `existingPunches` query only checks first 100 dates (`.slice(0, 100)`). For ranges > 100 days, need to paginate or do multiple queries.

3. **Exclude school holidays**: When generating workdays for a range, also exclude dates from `school_holidays` table. The `generateWorkdays()` function currently only skips weekends — should ALSO skip school holiday dates. Fix:
   ```
   // In add_punches, before generating workdays:
   const { data: schoolHolidays } = await db.from('school_holidays').select('start_date, end_date');
   // Build a Set of all school holiday dates
   // Pass to generateWorkdays() to exclude them
   ```

4. **Exclude user's approved holidays**: Also skip dates where the user has approved holiday requests. Query `holiday_requests` for the user with status='Approved' and exclude those dates from the punch range.

5. **System prompt addition needed**: Tell Atlas to ask "¿Solo días laborables o hay días específicos?" when user requests a range > 1 week.

### Edge Function Version History (this session)
| Version | Change |
|---------|--------|
| v34 | Catalunya convenio in system prompt |
| v35 | Range mode for add_punches (start_date/end_date/in_time/out_time) |

### Files Created/Modified
- `scripts/index-convenio-cat.js` — indexing script for Catalunya convenio
- `2083224.pdf` — Catalunya convenio source (DON'T commit to git — add to .gitignore)

---

## Session: June 5, 2026 (continued — punch verification + audit trigger fix)

### Status check: the 5 "pending" punch improvements were ALREADY shipped

Pulled the live `class-helper` Edge Function via Supabase MCP — it's at **v37**, not v35.
Whoever ran v36/v37 already implemented all 5 punch improvements; only this log lagged behind.
Verified each one against the deployed source:

1. ✅ **Ask which days** — implemented as `days_of_week` param (not `weekdays`). Accepts
   `"workdays"` (Mon-Fri, default), comma-separated names `"mon,wed,fri"`, or `"all"`.
   Parsed into `allowedDays` via `dayMap`. System prompt tells Atlas to ask which weekdays
   before a long range.
2. ✅ **Pagination fix** — `.slice(0,100)` is gone. Already-punched check now batches in
   groups of 200: `for (let i=0; i<allDates.length; i+=200) { ...in("date", batch)... }`.
3. ✅ **Exclude school holidays** — loads `school_holidays`, expands each start→end range into
   a `holidayDates` Set, `generateDatesForRange()` skips them.
4. ✅ **Exclude approved holidays** — loads `holiday_requests` (user, status='Approved'),
   adds those dates to the same `holidayDates` Set.
5. ✅ **System prompt** — fichajes section documents auto-exclusion and tells Atlas to ask
   "¿Todos los laborables o solo ciertos días?" before a long range.

### Validated exclusion logic against real data (no test writes)
Simulated `add_punches` in SQL for PAULA, range 2026-05-01 → 2026-06-05, workdays only:
- 2026-05-01 → excluded (Día del Trabajo / school holiday) ✓
- 2026-05-11..20, 29, 06-04..05 → excluded (her approved holidays) ✓
- already-punched workdays → skipped ✓
- only 2026-05-22 and 2026-05-25 would actually be punched ✓
All three exclusion layers behave exactly as the v37 code intends.

### 🐛 Production bug found + fixed #1: MaxPastDays never actually changed
- v35 note claimed "MaxPastDays increased from 30 to 180."
- Reality: only the CODE DEFAULT changed (`parseInt(config.MaxPastDays || "180")`).
  The `|| "180"` only applies if the key is MISSING. The `app_config` row still held `"30"`,
  so the live function used 30 — range punches before ~30 days ago were silently rejected
  as ">30 días". The "punch months back" feature did not work in production.
- Fix: `UPDATE app_config SET value='180' WHERE key='MaxPastDays'`. Confirmed now 180.
- `MaxPastDays` is read ONLY by the Edge Function `add_punches` tool (grep'd frontend — no
  other consumers), so the blast radius is contained.

### 🐛 Production bug found + fixed #2: ALL app_config updates were failing
- Discovered while trying to update MaxPastDays — the UPDATE threw:
  `record "new" has no field "id"` from `audit_trigger_fn()`.
- Root cause (schema drift): live DB has an `audit_app_config` trigger (NOT in any migration)
  using `audit_trigger_fn()`, which hard-coded `NEW.id::text`. But `app_config`'s PK is `key`,
  there is no `id` column → every INSERT/UPDATE/DELETE on `app_config` errored out.
  This silently broke admin settings changes (FreezeDate, PuenteDays, MaxPastDays, etc.).
- Fix: new migration `fix_audit_trigger_fn_record_id` — `record_id` is now derived
  dynamically: `COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'key', '')`. Backward
  compatible (id-keyed tables still resolve `id` first). Verified the audit row for the
  MaxPastDays change logged correctly with `record_id='MaxPastDays'`, `30 → 180`.
- Verified exactly one audit trigger per table afterward (no duplicates).

### Migrations applied
| Migration | Change |
|-----------|--------|
| `fix_audit_trigger_fn_record_id` | audit_trigger_fn derives record_id from id→key→'' so non-`id`-keyed tables (app_config) can be modified |

### Edge Function version note
- Live `class-helper` is **v37** (log previously only recorded through v35). No new function
  deploy this session — all punch work was already deployed. v36/v37 changelog unknown
  (not recorded), but verified to contain the 5 punch improvements above.

### Still Pending (unchanged)
- Schedule data (Super Excel / Google Sheets access from owner)
- Admin panel stats page (`chat_statistics` view)
- PDF parsing in Drive indexer
- Pi cron for daily re-indexing
- Consider adding the `audit_app_config` trigger + the audit_trigger_fn fix to a tracked
  migration file in the repo (currently only applied to the live DB; migrations/ folder
  does not yet contain either, so they'd be lost on a fresh `db reset`).

---

## Session: June 5, 2026 (continued — UI fix + punch year bug + function in repo)

### 🐛 Calendar UI: long holiday names blew up the day cell
- Symptom: "Descanso Retribuido de empresa" stretched a calendar day far taller than the rest.
- TWO separate admin calendars exist — fixed the WRONG one first, then the right one:
  1. **Vacaciones overview** (`.calendar-view-*`): clamped `.calendar-view-school-name` to 2
     lines and gave cells a fixed `height:120px` (84px mobile). Commit `97c98fc`.
  2. **Per-employee calendar modal** (`.calendar-cell`, the 📅 Calendario button) — THIS was
     the one actually blowing up. Root cause: `aspect-ratio:1.2` with no `min-width:0` /
     `overflow:hidden`, plus the JS overlay label forced `white-space:nowrap`. The long
     single-line label set a wide min-content width → aspect-ratio dragged the height up.
     Fix: added `min-width:0; overflow:hidden; text-align:center; padding:3px` to
     `.calendar-cell`, and changed the JS label (admin.js ~1264) from nowrap+ellipsis to a
     2-line `-webkit-line-clamp` block with `max-width:100%; word-break:break-word`.
     Commit `a967399`.
- Verified the deployed CSS on GitHub Pages (fetched the live file) to rule out a deploy/cache
  delay before concluding it was the other calendar.
- NOTE on frontend updates: GitHub Pages republishes ~1-2 min after push. Production has NO
  cache-busting (only localhost appends `?v=timestamp`), so CSS/JS changes need a HARD REFRESH
  (Ctrl+F5) on desktop; on mobile, close+reopen the tab. Consider adding a manual prod
  `?v=` version string later so changes show without hard refresh.

### 🐛 Atlas punch failure: wrong YEAR for bare month names
- Symptom chain: "punch all january 9-17" → Atlas: "todos fuera de rango / ya fichados".
- Root cause: the system prompt told Atlas today's date but NOT to default bare month names to
  the current year. Gemini defaulted "enero" to **January 2025**, which is ~520 days back →
  every day failed the 180-day MaxPastDays check → all rejected. (Jan 2026 = 22 valid workdays;
  Jan 2025 = 23 workdays all >180 days.)
- Fix (v39, then cleaned in v40): added an "AÑO ACTUAL" line + a dedicated **FECHAS — REGLA
  CRÍTICA** block to the system prompt: bare months always assume the current year, never use a
  past year unless the user says so explicitly, with a worked "fichar enero" example. Also made
  the all-rejected message tell Atlas to re-check the YEAR so it self-corrects.
- The earlier "formato inválido" (warm v34) and this "wrong year" bug are DIFFERENT issues;
  both are now resolved.

### Manual punch inserts during debugging (Test Account a050a494…)
- Did several direct SQL inserts/deletes of Daniel's punches while diagnosing, each tagged in
  `notes` so they were cleanly reversible:
  - `Via Atlas (bulk YTD 9-17)` — Jan 1→Jun 5 YTD, 95 days (later deleted).
  - `Via Atlas (bulk enero 9-17)` — Jan 2026, 18 days (later deleted so Atlas could be tested).
- Current state: January 2026 has ONLY the pre-existing orphan Jan 9 IN (18:51, no OUT).
  Daniel's account is otherwise clean for live Atlas testing.

### Edge Function now tracked in the repo (no more drift)
- Created `supabase/functions/class-helper/index.ts` — a clean, readable copy of the function
  (UTF-8 source, `DEFAULT_MAX_PAST_DAYS` constant instead of a bottom-of-file helper hack).
- Redeployed that EXACT source as **v40** so the live function == the repo copy byte-for-byte.
- This closes the recurring drift problem: the function was only in Supabase before, so prompt/
  logic changes (v34–v39) were untracked and would be lost on a rebuild.

### Edge Function version history (this session)
| Version | Change |
|---------|--------|
| v38 | Clear warm v34; punches[] tolerance + clearer error; range-mode prompt hardening |
| v39 | FECHAS rule: bare month names default to current year; all-rejected hints at year |
| v40 | Clean source committed to repo; live == repo (no functional change vs v39) |

### Files created/modified
- `css/admin.css` — both calendar fixes
- `js/admin.js` — per-employee calendar overlay label clamp
- `supabase/functions/class-helper/index.ts` — NEW, tracked copy of the Edge Function
- `SESSION-LOG-ASSISTANT.md` — this entry

### Still pending (unchanged + new)
- Remove the orphan Jan 9 IN if a fully clean January is wanted for testing.
- Optional: production cache-busting (`?v=` version string) so frontend changes show without
  hard refresh.
- Reconcile local `supabase/migrations/` with remote migration history (still drifted).
- Schedule data, admin stats page, PDF parsing, Pi cron (long-standing).

---

## Session: June 5, 2026 (continued — restored confirm/cancel buttons)

### 🐛 Confirm/Cancel buttons stopped appearing in the chat widget
- Symptom: after a punch/holiday preview, Atlas asked "¿me confirmas...?" but the
  ✓ Confirmar / ✗ Cancelar buttons no longer showed.
- Root cause: the buttons were triggered by string-matching Atlas's reply for EXACT phrases
  (`chat-widget.js`): `Confirma para enviar` / `Confirma para añadir` / `¿Procedo?` /
  `¿Confirmas?`. The v38/v39 prompt changes made Atlas PARAPHRASE the confirmation question
  ("¿Me confirmas que quieres añadir estos fichajes?"), so none of the exact phrases matched →
  no buttons. (Same brittle "match the LLM's free-form text" pattern as other bugs this session.)
- Fix (v41): replaced text-guessing with a STRUCTURED signal.
  - Edge Function: tracks `needsConfirmation = result?.status === "needs_confirmation"` in the
    tool loop and returns it as `needs_confirmation: true|false` in the JSON response.
  - Frontend (`chat-widget.js`): `send()` passes `data.needs_confirmation` into `addMsg(...)`;
    the button trigger is now `needsConfirmation === true || <old phrase match as fallback>`.
  - The phrase match is kept ONLY as a fallback (covers paraphrases / older deployments).
- Behavior unchanged on click: ✓ sends "Sí, confirmo... confirmed=true", ✗ cancels.
- After the action executes, the tool returns a normal result (not needs_confirmation), so the
  flag is false and no buttons render on the success message — correct.

### Edge Function version history (this session, cont.)
| Version | Change |
|---------|--------|
| v41 | Returns structured `needs_confirmation` flag so the frontend shows confirm/cancel buttons reliably (no text matching) |

### Files modified
- `supabase/functions/class-helper/index.ts` — returns `needs_confirmation` (live == repo, v41)
- `js/chat-widget.js` — confirm buttons triggered by the structured flag (phrase match = fallback)
- `SESSION-LOG-ASSISTANT.md` — this entry

### Reminder
- Frontend changes need a HARD REFRESH on prod (no cache-busting in production yet).
- `class-helper` repo source is kept byte-for-byte in sync with the deployed version on each change.

---

## Session: June 5, 2026 (continued — auto-refresh after punch/holiday writes)

### Feature: host page auto-refreshes after Atlas (chat) writes
- Goal: after a punch/holiday is saved via Atlas, the underlying admin/teacher page should
  update its numbers WITHOUT a manual reload (the stale "360h / 72%" we saw was because the
  admin table was cached from page load, before the Atlas punch).
- Chain (all 4 pieces now live + pushed):
  1. Edge Function (v42): tracks `dataChanged` in the tool loop — true only when a write tool
     (`add_punches` / `request_holiday`) actually saved (has `mensaje`, no `error`, not
     `needs_confirmation`). Returns it as `data_changed` in the JSON response.
  2. `chat-widget.js`: when `data.data_changed` is true, calls `window.onAtlasDataChanged()`
     (helper `notifyDataChanged()`), in both `send()` and `sendSilent()` paths.
  3. `admin.js`: `window.onAtlasDataChanged` → `loadData(true)` (clears caches, reloads stats
     grid + teacher/admin tables). Only refreshes sections already loaded.
  4. `teacher.js`: `window.onAtlasDataChanged` → reloads day, progress bar, holiday summary.
- IMPORTANT: this was previously HALF-wired — the frontend already listened for `data_changed`,
  but the DEPLOYED function (v41) never sent it. v42 fixes that. Lesson: deployed function had
  drifted from intent again; always verify live function emits what the frontend expects.

### Manual punch from the admin site — already worked
- The admin calendar modal CRUD (`saveNewPunch`, `saveEditPunch`, `deletePunch`) already calls
  `refreshTablesAfterPunchChange()`, which nulls `cachedPunches`/`cachedHolidays` and reloads
  the stats grid + both tables (modal stays open). No change needed there.

### Re: the "360h / 72%" question
- Not a bug in the data — it was a STALE admin table (cached at page load, before the Atlas
  punch). A manual refresh fixed it then; v42 auto-refresh prevents it going forward.
- For reference: YTD expected at 8h/workday (Jan 1 → Jun 5) = 106 net workdays × 8h = 848h
  (112 weekday count minus 6 school holidays).

### Edge Function version history (this session, cont.)
| Version | Change |
|---------|--------|
| v42 | Returns `data_changed` flag so host page auto-refreshes after a real punch/holiday write |

### Files modified
- `supabase/functions/class-helper/index.ts` — `data_changed` flag (live == repo, v42)
- `js/chat-widget.js` — calls onAtlasDataChanged when data_changed
- `js/admin.js` — onAtlasDataChanged hook (already present; confirmed)
- `js/teacher.js` — onAtlasDataChanged hook (already present; confirmed)
- `SESSION-LOG-ASSISTANT.md` — this entry

### Not yet verified by me
- Could not click through the live UI from here. Needs a real hard-refresh + Atlas punch to
  confirm the table updates on screen. Logic + deployment verified.

---

## Session: June 5, 2026 (continued — cleanup: orphan punch, cache-busting, migration drift)

### 1. Removed orphan Jan 9 punch
- Deleted the lone Jan 9 2026 IN @ 18:51 (no matching OUT) on the Test Account
  (a050a494…). January is now fully clean.

### 2. Production cache-busting (so frontend changes show without manual hard refresh)
- Before: `?v=` only applied on localhost; production loaded plain URLs → stale CSS/JS until
  the browser cache expired (this is why the calendar CSS fix needed a hard refresh).
- Now: a manual `APP_VERSION` constant (currently `20260605b`) is appended in production too,
  for BOTH the document.write JS block AND the stylesheet `<link>` tags.
- Files: `index.html`, `teacher.html`, `admin.html` (JS block) + the CSS `<link>` in
  teacher.html (`styles.css`) and admin.html (`admin.css`). index.html has no external CSS.
- ⚠️ PROCESS: BUMP `APP_VERSION` (and the matching `?v=` on the CSS links) on every release so
  browsers fetch fresh files. Localhost still uses a live `Date.now()` timestamp.

### 3. Migration drift reconciled (repo now mirrors deployed DB)
- Pulled the actual applied SQL from `supabase_migrations.schema_migrations` via MCP (the CLI
  isn't installed on this laptop) and recreated the 10 remote migrations that were missing
  from the local repo:
  - 20260421090322_admin_delete_holidays_with_reason
  - 20260421091253_delete_punch_with_reason
  - 20260422162304_audit_log_changed_by_text
  - 20260422162425_audit_trigger_capture_actor_name
  - 20260422162504_update_delete_rpcs_for_text_actor
  - 20260527094347_enable_vector_and_create_embeddings
  - 20260527094714_add_chat_usage_upsert_function
  - 20260528060216_update_embedding_dimensions_3072_ivfflat
  - 20260602072632_add_chat_statistics
  - 20260602072942_anonymize_chat_logs
- ⚠️ KNOWN REMAINING DRIFT: six LOCAL migration files were applied manually in early sessions
  and are NOT in the remote `schema_migrations` table:
  100003_link_profile_function, 100004_fix_fk_constraint, 100005_add_gps_columns,
  100006_admin_punch_policies, 100007_audit_log, 20260415000000_dev_role_switcher.
  They reflect real DB state, so they're kept. A fresh `db reset` from migrations would apply
  them in timestamp order; they all precede the pulled remote set, so order is consistent.
  (The original `audit_log` trigger created in 100007 is later superseded by the
  20260422162425 + 20260605094240 migrations — same as what actually happened in prod.)

### Files created/modified
- Removed: orphan Jan 9 punch (DB only)
- `index.html`, `teacher.html`, `admin.html` — production cache-busting (APP_VERSION)
- `supabase/migrations/` — 10 new files mirroring the deployed DB
- `SESSION-LOG-ASSISTANT.md` — this entry

---

## Session: June 2026 (continued — Permiso Retribuido / No Retribuido feature)

### New request types (Convenio Catalunya, Arts. 28 & 29)
- **Permiso Retribuido** (type `Permiso`, repurposed — was an unused generic "Permiso"):
  paid leave that COUNTS AS WORKED TIME. Entered by HOURS (stored in `days` column, like
  MedAppt), credited into totalHours. Has a **motive dropdown** (Art. 28 a–j, minus g which is
  the existing Visita Médica). Each motive has a day-contingent shown live with remaining count;
  contingent = distinct dates used per motive this year. Motives f/h/i = "tiempo indispensable"
  (no limit). New column `permiso_motive` (a–j).
- **Permiso No Retribuido** (type `PermisoNoRet`, NEW): unpaid leave, by DAYS, NOT credited as
  worked (treated as full day off, excluded from expected working days). Annual contingent via
  new profile column `unpaid_days` (default 10, editable in admin teacher/admin settings modals).

### Migrations (tracked)
- 20260605120000_add_permiso_types_and_unpaid_contingent.sql — type constraint += PermisoNoRet,
  profiles.unpaid_days default 10.
- 20260605120100_add_permiso_motive_column.sql — holiday_requests.permiso_motive.

### Bug fixed along the way
- Admin/teacher credited Visita Médica (MedAppt) hours from a NON-EXISTENT `total_days` field
  (always 0). Fixed to read `days` everywhere. Same fix applied to get_holidays in the edge fn
  (it read the empty `hours` column). Only existing MedAppt data: 2 records (Rocío, 1.2h total),
  so impact is negligible and in the correct direction.
- Excluded hours-based types (MedAppt, Permiso) from the full-day teacherHolidayDates sets in
  both teacher.js and admin.js (they're partial absences credited as hours, not days off).

### Calc consistency
- Credited Permiso (and fixed MedAppt) hours in all THREE dashboard calc sites: teacher table,
  admin-workers table, stats grid. XLS export left as-is (separate report, pre-existing; noted).

### Data safety verified
- All changes additive; no rows mutated. unpaid_days backfilled to 10 on all 34 profiles
  (no NULLs); permiso_motive NULL on all existing rows; type constraint still validates every
  existing record.

### Atlas updated (v43)
- request_holiday now handles `Permiso` (requires permiso_motive a–j + hours; validates the
  per-motive contingent) and `PermisoNoRet` (days + obligatory reason; validates the 10-day
  unpaid contingent). System prompt teaches the motive list + rules. get_holidays reports both
  new types. Flows through the existing needs_confirmation + data_changed plumbing.

### Cache-busting
- Bumped APP_VERSION 20260605b → c → d as JS/CSS changed, so the release shows without hard refresh.

### Edge Function version history (cont.)
| Version | Change |
|---------|--------|
| v43 | request_holiday: Permiso Retribuido (motive+hours+contingent) + Permiso No Retribuido (days+contingent); get_holidays reports both |

### Files changed
- supabase/functions/class-helper/index.ts (v43, live==repo)
- js/supabase-config.js (HOLIDAY_TYPES + PERMISO_MOTIVES + descriptions)
- teacher.html, js/teacher.js (form: motive dropdown, hours UI, tooltips, contingent checks)
- js/admin.js (hours crediting, buildTeacherHolidayDates exclusion, unpaid_days settings, colors)
- css/admin.css (badge colors), index/teacher/admin .html (cache-bust)
- 2 new migrations

### Still pending
- Atlas: teacher form is the richer path; Atlas is the conversational equivalent (both write
  identical records). Verified deploy + code; live chat click-through test still recommended.
- Optional: align XLS export "H. Totales" to credit MedAppt/Permiso hours like the dashboard.
- Optional: teacher "Tu Saldo" card box for the two new permiso types (currently shown in the
  dropdown + enforced on submit).
- BAJA MÉDICA reconciliation review (see discussion) — possible follow-up.

---

## Baja Médica (sick leave) — how it works + design decisions (June 2026)

### Convenio (II Conveni Catalunya, Art. 25 — Incapacitat Temporal)
- IT is effectively FULLY PAID but time-limited by seniority:
  - First 3 months: company complements Social Security up to 100% of total salary.
  - If it continues: 100% for 1 extra month per trienio (3 yrs) of seniority, max 7 months in a
    12-month period.
  - If the worker isn't entitled to the SS benefit, no complement.
- NOTE: pay/complement is RRHH's job (Milena), NOT this app. The app only handles the
  hours-compliance/progress side.

### How the app computes Baja Médica (the code)
- `hoursPerWorkingDay = expected_yearly_hours / totalWorkingDays`
  (totalWorkingDays = year Mon–Fri minus school holidays minus the person's allocated holiday days)
- `medicalHours = (working days during the baja) × hoursPerWorkingDay` — credited (added) to the
  total: `adjustedTotal = worked − paid + medicalHours + medAppt + permiso`.
- Medical dates are NOT removed from the expected-to-date denominator AND the average hours are
  credited → a person out half the year shows ~on-track and is NOT expected to cram a full year's
  hours into the remaining half. Same logic in teacher.js and admin.js.
- So YES: baja hours are ESTIMATED via a flat yearly average (expected yearly ÷ working days),
  applied to the baja days. We can't know real per-day hours during leave, so the average is the
  fair proxy (same approach as the legacy Apps Script).

### Known divergences from convenio (accepted for now)
- App has NO time cap on the hours-credit (convenio caps PAY at 3 months + seniority, max 7).
  Intentional: the app tracks hours-compliance, not pay — a long-term sick teacher shouldn't be
  flagged "behind" regardless of pay status.
- Flat average, not the person's real schedule.

### Contract change mid-year (expected_yearly_hours edited) — DECISION
- Current behavior: `expected_yearly_hours` is a SINGLE live column on profiles. Every recalc
  reads the CURRENT value, so editing it (new contract) immediately recomputes the whole year —
  including baja credit — from the new number. ✅ This satisfies "baja must use the always-current
  total."
- CAVEAT: it is FULLY RETROACTIVE — no history, no proration. The current value is applied to the
  ENTIRE year (e.g. 1000→1300 in July makes the whole year compute as 1300; a March baja day is
  credited at the new rate). It rewrites the past rather than blending periods.
- DECISION (June 2026): leave as-is for now. Do NOT build proration yet. If period-accurate
  valuation is ever needed (old period at old rate, new period at new rate), implement a
  `contract_history` table (expected_yearly_hours with effective-from/to dates) and sum each
  segment with its own rate. Deferred until a real case requires it.

### Why baja is recomputed (not frozen) — and the preferred future approach

Q: Why recalculate a baja day's hours every time instead of freezing the value at the time?
A: The whole app is "compute from raw facts on read" — it stores only raw facts (leave date
ranges, punches, profile config) and derives every metric live. Nothing is stored as a computed
value, so nothing drifts when an input is corrected (contract change, school-holiday edit, leave
dates fixed, ongoing leave growing day by day). Freezing ONLY the baja output in isolation would
desync from the rest of the year (denominator still recomputes), so it only makes sense as part
of a broader snapshot/historize change.

THREE options for period-accuracy (all deferred until a real case needs it):
1. `contract_history` table — historize the INPUT (expected_yearly_hours with effective dates),
   compute each period at its own rate. Keeps "compute on read" intact.
2. Freeze the baja output on read — fragile in isolation (desyncs with recomputed denominator).
3. **LOG the would-have-worked hours (PREFERRED).** Treat a baja day like the new hours-based
   types (MedAppt / Permiso Retribuido) and like a punch: when the baja day passes, STORE the
   hours the person would have worked (frozen at the then-current average) in the `days` column,
   and have the progress calc just SUM stored hours instead of recomputing the average.
   - Pros: one consistent "log hours" model across all hours-based absences; stable/auditable
     history; AUTOMATICALLY fixes the mid-year contract-change problem (past baja keeps its
     then-rate, future expectation uses the new rate) — no contract_history table needed.
   - Decisions to settle: WHEN to compute & store — (a) once at approval (simple, but extended/
     open leaves need re-logging) vs (b) a daily Pi cron job that logs each active baja day
     (accurate for long leaves, needs the recurring job). Still the same average estimate, just
     frozen at log time. Migration: `Medical` currently stores `days` = working-day COUNT (hours
     computed on read); switching to store HOURS changes that field's meaning and needs the 4
     existing Medical records converted (or a new dedicated column).
- DECISION (June 2026): defer all three. When it comes up, option 3 (log would-have-worked hours)
  is the leading choice; decide approval-time vs daily-cron logging at that point.

### Holidays vs baja — different models, on purpose (decision: keep as-is)
- Holidays (Annual / Personal / School) work by REDUCING expected working days (the denominator
  via teacherHolidayDates / allocatedDays) — you're simply not expected to work those days. No
  hours logged or credited.
- Baja credits AVERAGE HOURS (numerator) because the person is absent but should still count
  toward their total.
- The "log would-have-worked hours" idea (option 3 above) could in theory apply to holidays too,
  BUT it would be bad UX — you'd have to enter hours for every vacation day, for something that's
  cleanly handled by just not expecting those days.
- DECISION (June 2026): keep holidays on the denominator-reduction model as-is. Do NOT switch
  holidays to hours-logging. (Baja's future option-3 logging, if/when built, does not apply to
  ordinary holidays.)

---

## Session: June 23, 2026 — display fixes, Atlas schedule param, handoff

### Done & live
1. **days/hours display bug FIXED** (commit 81ce487): for hours-based types (Permiso Retribuido,
   Visita Médica) the `days` column stores HOURS, but all request tables showed it as "X días"
   (e.g. an 8h permiso showed "8 días"). Now renders "8h" for hours-based types and "X días"
   otherwise, in: admin pending table, admin approved table, and teacher's own requests list
   (via `typeInfo.isHoursBased`). Cache-bust bumped to 20260605e.
2. **Atlas v44 DEPLOYED + pushed** (commit d11e7e2): 
   - New `schedule` param on add_punches: JSON {mon:{in,out},tue:{in,out},...} + start_date +
     end_date → punches a date range with DIFFERENT hours per weekday in ONE call. This fixes
     Felipe's failure (see below).
   - Tool-call loop cap raised 3 → 6 (multi-step requests were exhausting it).
   - Prompt note: NO signup-date restriction on punches — a new teacher CAN punch dates before
     their registration (e.g. from contract start), within the 180-day MaxPastDays window.

### Root-cause learnings (IMPORTANT for next session)
- **Felipe "couldn't punch past days" was a MISDIAGNOSIS.** Real cause: he asked to punch a range
  with 4 different schedules (lun/mié 9:30-14:30, mar/jue 17-21, vie 11:30-14:30, sáb 9:30-13:30).
  The single-schedule range tool couldn't express that, and 4 tool calls exceeded the 3-iteration
  loop → Atlas returned "No pude procesar". There is NO past-date/signup restriction; June 8-22
  is well within 180 days. Fixed via the `schedule` param + loop cap 6 (v44).
- **DEPLOY GOTCHA (cost a failed deploy):** Do NOT put backticks inside the system-prompt template
  literal — the `sys` string is delimited by backticks, so writing `schedule` with backticks
  terminated the string and broke parsing ("Expected a semicolon"). Use single quotes inside the
  prompt. v44 first attempt failed on this; fixed and redeployed OK.

### STILL PENDING (not done — do next session)
1. **Punch Felipe's actual request** — NOT done yet. He wanted June 8–22, 2026 with:
   lun/mié 09:30-14:30, mar/jue 17:00-21:00, vie 11:30-14:30, sáb 09:30-13:30.
   Now that v44 has the `schedule` param, either: (a) have him ask Atlas again, or (b) insert
   directly via SQL for his user_id (look up profile by name/email 'felipe'), excluding any
   school holidays / already-punched days. Note Sat is included in his schedule (days_of_week
   normally excludes weekends, but `schedule` honors whatever weekday keys are provided).
2. **Baja Médica UI: support START + END date** — NOT done yet. Currently the teacher form
   treats Medical as SINGLE-date: in selectHolidayType `endDateGroup` is hidden for Medical, and
   submitHolidayRequest does `endDate = type==='Medical' ? startDate : ...`. The user wants Baja
   to have start AND end date. Fix: remove Medical from the single-date special-casing in BOTH
   places (show endDateGroup for Medical; use the holidayEndDate input). teacher.html/teacher.js.

### Edge Function version history (cont.)
| Version | Change |
|---------|--------|
| v44 | add_punches `schedule` param (per-weekday hours over a range); loop cap 3→6; signup-date clarification in prompt |

### State at handoff
- Live function = v44 = repo copy (in sync, pushed d11e7e2).
- Cache-bust at 20260605e.
- Laptop git: as always, the Pi is source of truth (push via Pi; laptop git lags — see top banner).

---

## Session: June 23, 2026 (continued — cleared both pending items)

Picked up the two items left "NOT done" at the previous handoff.

### 1. ✅ Baja Médica UI now supports START + END date
- Removed the single-date special-casing for `Medical` in BOTH places (`js/teacher.js`):
  - `submitHolidayRequest`: `endDate` now always reads `#holidayEndDate` (was
    `type==='Medical' ? startDate : ...`). `days` = `calculateWorkingDays(start,end)`, which
    matches how the progress calc already expands a Medical start→end range for medicalHours.
  - `selectHolidayType`: `#endDateGroup` is now shown for all day-based types; the Fecha Fin
    field appears for Medical too. (MedAppt/Permiso still hide the whole `#dateRangeGroup`
    wrapper via the existing `dateGroup` logic, so they're unaffected.)
- admin.js had no equivalent special-casing (verified) — no change needed there.
- `node --check js/teacher.js` → clean.
- Cache-bust bumped `20260605e → 20260623a` across index/teacher/admin .html (JS block +
  CSS `<link>`s) per the established release process.

### 2. ✅ Punched Felipe's actual request (June 8–22, 2026)
- Profile: FELIPE AGUILAR (`30d6f9e3-6e0c-44a8-bbe6-710ee07967da`).
- Pre-checks (all clear, no conflicts): no existing punches in range, no school_holidays
  overlapping, no approved holiday_requests overlapping.
- Inserted 13 workdays (26 rows) with his per-weekday schedule, Sundays skipped:
  - lun/mié 09:30–14:30 (5h), mar/jue 17:00–21:00 (4h), vie 11:30–14:30 (3h),
    sáb 09:30–13:30 (4h). Total = 55h over the two weeks.
- All rows tagged `notes='Manual insert (Felipe schedule Jun 8-22)'` so the batch is cleanly
  reversible. Verified every IN/OUT pair matches the request via SQL.
- Done via direct SQL (option b from the handoff) rather than re-asking Atlas — the v44
  `schedule` param exists if he wants to self-serve future ranges.

### Files modified
- `js/teacher.js` — Medical start+end date (2 spots)
- `index.html`, `teacher.html`, `admin.html` — cache-bust 20260623a
- DB: 26 time_punches rows for Felipe (additive, tagged)
- `SESSION-LOG-ASSISTANT.md` — this entry

### Still pending (long-standing, unchanged)
- Schedule data (Super Excel / Google Sheets access), admin stats page, PDF parsing in Drive
  indexer, Pi cron for daily re-indexing.
- Reminder: push via the Pi (GitHub blocked on this laptop); frontend needs a hard refresh on
  prod unless the cache-bust bump propagates.

---

## Session: June 23, 2026 (continued — Permiso Retribuido hours input + calendar display)

User report (viewing PAULA's per-employee calendar modal): P. Retribuido hours "not logged to
the total," and the input should be a single hours field, not a from/to time range.

### Investigation — where permiso IS credited
- Verified the dashboard DOES credit Permiso Retribuido hours (stored in `days`):
  - teacher table (`js/admin.js` ~876), admin-workers table (~1082), and stats grid
    (~681/694, lumped into `yearlyMedApptHours` via the `MedAppt || Permiso` filter).
  - `cachedHolidays` is loaded `status='Approved'` only → no pending double-count.
  - teacher.js `adjustedTotal` also credits `permisoHours`.
- Paula's 3 approved Permiso records (Apr 7/8/9 = 8+4+8 = 20h) are within range → credited.
- The ACTUAL visible gap: the **per-employee calendar modal day cells** only printed hours
  when a day had punches. Permiso/MedAppt days (no punches) showed just the label
  ("📋 P. Retribuido") with NO hours → looked like 0h / uncounted, even though the total
  includes them. That mismatch is what triggered the report.
- (XLS export at ~3231 still omits medAppt+permiso — pre-existing, intentionally deferred,
  left as-is. Noted for later.)

### Fix 1 — calendar modal now shows hours on hours-based absence days (`js/admin.js`)
- `teacherHolidayMap` now carries `days`.
- In the no-punch overlay branch, for `Permiso` / `MedAppt` days with `days > 0`, render a
  `calendar-hours` line (e.g. "8.0h") under the label. Now the calendar visually reflects the
  credited hours, matching the dashboard total.

### Fix 2 — Permiso form: single "hours worked" input instead of Desde/Hasta time range
- `teacher.html`: replaced the two `<input type="time">` (permisoStartTime/permisoEndTime) with
  one `<input type="number" id="permisoHoursInput" min=0.5 max=24 step=0.5 value=8>`; live
  preview kept.
- `js/teacher.js`:
  - `updatePermisoHours()` reads the number input directly.
  - submit branch reads `pHours` from `permisoHoursInput` (was computed from start/end times);
    validation "Indica las horas trabajadas"; `reason` now records `"<motivo>: Xh"`.
- No leftover references to the removed time inputs (grep clean). `node --check` clean on both
  teacher.js and admin.js.

### Cache-bust
- Bumped 20260623a → 20260623b (index/teacher/admin .html + CSS links).

### Files modified
- `js/teacher.js`, `teacher.html` — single hours input for Permiso
- `js/admin.js` — calendar modal shows hours on Permiso/MedAppt days
- `index.html`, `teacher.html`, `admin.html` — cache-bust 20260623b

### Note
- Storage unchanged: Permiso hours still stored in `holiday_requests.days`. Existing records
  (incl. Paula's) are unaffected and already credited. Atlas (`request_holiday`) is a separate
  path and already takes hours directly — no change needed there.

---

## Session: June 23, 2026 (continued — XLS export total + Permiso label wording)

### 1. XLS export "H. Totales" now credits MedAppt + Permiso (matches dashboard)
- The audit/hours XLS export (`js/admin.js`, ~3237) computed
  `totalHours = yearlyHours - paidTotal + medicalHours` — omitting Visita Médica and Permiso
  Retribuido hours, so the exported total diverged from the on-screen dashboard total.
- Added period-bounded `medApptHours` + `permisoHours` (approved, `days` within
  yearStart→cutoffDate — identical logic to the teacher/admin tables) and changed the export
  to `yearlyHours - paidTotal + medicalHours + medApptHours + permisoHours`.
- The Vis.Méd / Permiso day-count columns are unchanged; only the totals column now reconciles
  with the dashboard. (This was the last remaining calc site that didn't credit them.)

### 2. Permiso input relabeled to reflect EXPECTED hours (not actually worked)
- The permiso time isn't worked; we credit the hours the person WOULD have been expected to
  work that day. Relabeled the field "Horas trabajadas" → **"Horas previstas ese día (cuentan
  como trabajadas)"** (`teacher.html`), and the validation toast to "Indica las horas previstas
  ese día" (`js/teacher.js`). Storage/credit behavior unchanged (still `days` = hours).

### Cache-bust
- 20260623b → 20260623c (index/teacher/admin .html + CSS links).

### Files modified
- `js/admin.js` — XLS export totals credit medAppt + permiso
- `teacher.html`, `js/teacher.js` — Permiso "Horas previstas ese día" wording
- `index.html`, `teacher.html`, `admin.html` — cache-bust 20260623c

### node --check
- admin.js + teacher.js both clean.

---

## Session: June 23, 2026 (continued — removed redundant Permiso hours preview)

- With the explicit number input, the "X.Xh" live preview (`#permisoHoursPreview`) was
  redundant. Removed it from `teacher.html`, removed the now-dead `updatePermisoHours()`
  function and its call in `selectHolidayType` (`js/teacher.js`). Input no longer has
  onchange/oninput handlers. node --check clean.
- Cache-bust 20260623c → 20260623d.

---

## Session: June 25, 2026 — Atlas confirm buttons not appearing for permisos

### Symptom
User asked Atlas for two Permiso Retribuido (Mon Jun 22 + Tue Jun 23, 4h each, motive b).
Atlas asked "¿Confirmo el permiso para el lunes...?" in PLAIN TEXT and the user had to type
"sí" — the ✓ Confirmar / ✗ Cancelar buttons never appeared. (Both records DID get created
correctly once the user typed sí — verified in DB: Jun 22 & 23, days=4, motive b, Pending.)

### Root cause (same brittle pattern as before)
- Confirm buttons render when the Edge Function returns the structured flag
  `needs_confirmation:true`, which only happens when a WRITE tool is actually called with
  `confirmed=false` (the tool returns `status:"needs_confirmation"`).
- Here Atlas gathered the info conversationally and asked for confirmation IN TEXT without
  calling `request_holiday` first → no tool call → `needsConfirmation` stayed false → no buttons.
- The frontend phrase-match fallback only matched "Confirma para enviar/añadir", "¿Procedo?",
  "¿Confirmas?" — NOT the paraphrase "¿Confirmo el permiso...?".
- Multi-action requests (two separate permisos) made Atlas especially prone to free-texting.

### Fixes
1. **Edge Function v46** (`supabase/functions/class-helper/index.ts`): rewrote the
   request_holiday CONFIRMACIÓN rule in the system prompt — Atlas must CALL request_holiday with
   confirmed=false as soon as it has the data (NEVER ask "¿confirmo...?" in text; the tool's
   preview is what shows the buttons), and must process multiple permisos ONE AT A TIME
   (confirmed=false → wait → next). Deployed via Supabase MCP (build OK, ACTIVE, verify_jwt=false,
   no log errors). Repo copy == live (no drift).
2. **Frontend fallback** (`js/chat-widget.js`): broadened the button trigger to also match
   "¿Confirmo" so paraphrased confirmations still surface buttons (defense-in-depth; structured
   flag remains the primary signal). When clicked, sends "Sí, confirmo... confirmed=true" as before.

### Deploy note
- Live class-helper jumped 44 → 46 (build bump). verify_jwt stays false (manual auth in code).
- Edge function deploys go through the Supabase MCP (the laptop has no supabase CLI; the Pi
  doesn't either — only git relay). A failed build safely leaves the prior version live.

### Cache-bust
- 20260623d → 20260625a (chat-widget.js loads via the APP_VERSION ?v= block).

### Files modified
- `supabase/functions/class-helper/index.ts` (v46 prompt: forced tool-call confirmation flow)
- `js/chat-widget.js` (fallback matches "¿Confirmo")
- `index.html`, `teacher.html`, `admin.html` — cache-bust 20260625a

---

## Session: June 25, 2026 (continued — concurrency hardening: 429 backoff + dup-punch guard)

User asked how Atlas handles concurrent requests (knowledge/read/write) on a single Gemini key
— queue? throttle? Conclusion: NO queue needed. Edge Functions auto-scale (isolated per
request) and Postgres handles concurrent reads/writes; the only shared resource is the Gemini
key's rate limit (RPM/TPM). At ~30 teachers capped 20 msg/day, load is far below Tier 1
(~150-300 RPM, 250K+ TPM as of early 2026). The per-user daily cap is already the throttle.
Implemented the two cheap safeguards instead of a queue:

### 1. Gemini 429/503 backoff (Edge Function v47)
- New `fetchWithRetry(url, options, maxRetries=2)` helper: retries on 429/503 with exponential
  backoff (800ms, 1600ms). Wired into all THREE Gemini calls: search_materials embedding,
  initial generateContent, and the tool-loop generateContent.
- On a final 429 the function now returns a friendly Spanish message ("Uf, ahora mismo estoy
  saturada 😅 Prueba otra vez...") with status 429 instead of the generic 502 "No disponible".
- Frontend (`js/chat-widget.js`): the 429 branch now shows the SERVER's error message (was a
  hardcoded "Límite diario alcanzado (50 mensajes)" — wrong number AND wrong reason for a rate
  limit). Now both the daily-limit 429 and the rate-limit 429 display their correct text.
  Same fix applied to the sendSilent (confirm-button) path.

### 2. Duplicate-punch guard (DB constraint, migration 20260625133004)
- The real write race is ONE user double-confirming (two taps/devices) in the window of the
  date-only "already punched" check. Added a PARTIAL unique index:
  `time_punches_unique_in_out` ON (user_id, date, time, punch_type) WHERE punch_type IN
  ('IN','OUT'). PREP excluded (it legitimately shares date+time 00:00:00, keyed by notes).
- Cleaned the ONE pre-existing real dup first: FELIPE... no — user f1d43fa7 had IN 09:00 +
  OUT 15:00 + OUT 15:00 (created 6 min apart) on 2026-06-12. Deleted the later duplicate OUT
  (doesn't change the calc: one IN pairs with one OUT). The 3 PREP "dups" are fine (excluded).
- add_punches already does `if (e1/e2) continue;` on insert errors, so a constraint violation
  in a race just skips that day gracefully (no crash, no orphan — e1 skips the whole day).
- Local migration file created to mirror the DB (no drift).

### Deploy / cache-bust
- class-helper v46 → v47 (build OK, ACTIVE, verify_jwt=false, logs clean). Repo == live.
- Cache-bust 20260625a → 20260625b.

### Files
- `supabase/functions/class-helper/index.ts` (v47: fetchWithRetry + friendly 429)
- `js/chat-widget.js` (429 shows server message, both send + sendSilent)
- `supabase/migrations/20260625133004_unique_in_out_punches.sql` (NEW)
- `index.html`, `teacher.html`, `admin.html` — cache-bust 20260625b

---

## Session: June 25, 2026 (continued — period column didn't credit Permiso)

### Symptom
Weekly view (Sem 15: 6–12 abr), PAULA: "Horas Semana" showed 8.0h but should be 28h (8h worked
+ 20h Permiso Retribuido that week). "Horas Totales" was already correct (credits permiso).

### Cause
The period column ("Horas Semana/Mes") displayed RAW `periodHours` (punches only). Only the
yearly "Horas Totales" credited medical/medAppt/permiso. The teacher/admin tables even computed
a `medicalInline` note but it was never rendered (dead var) — so period showed worked-only.

### Fix (js/admin.js) — make the period column consistent with Horas Totales
Added period-bounded credited hours (medical working-day estimate + MedAppt + Permiso stored
hours, minus period paid) in all three remaining sites and displayed the adjusted value:
- **Teacher table**: `adjustedPeriodHours = periodHours - periodPaid + periodMedical +
  periodMedAppt + periodPermiso`; badge now shows that, with a small "incl. 🏥/⚕️/📋 Xh" note.
- **Admin table**: same.
- **XLS export "H. Periodo"** column + period total now use `adjustedPeriod` (matches dashboard).
- Stats-grid overview already credited permiso in its period calc (unchanged).
Paula Sem 15 now reads 8 + (8+4+8) = 28.0h.

### Cache-bust
- 20260625b → 20260625c. node --check admin.js clean.

### Files
- `js/admin.js` (period column credits medical/medAppt/permiso in teacher table, admin table,
  and XLS export)
- `index.html`, `teacher.html`, `admin.html` — cache-bust 20260625c

---

## Session: June 25, 2026 (continued — view navigation continuity)

Two UX requests on the admin "Todos los Profesores" overview (js/admin.js):

### 1. Monthly → Semanal jumps to the FIRST week of the viewed month
- `setHoursViewMode('weekly')` used to reset `weekOffset = 0` (current week). Now it sets
  `weekOffset = weekOffsetForFirstWeekOfMonth(monthOffset)` so switching from a selected month
  to weekly lands on that month's first week (the week containing the 1st), not the current one.
- New helper `weekOffsetForFirstWeekOfMonth(monthOff)`: computes the offset (in weeks from the
  current week) of the Monday of the week containing the 1st of the target month; clamped to
  <= 0 (never a future week).

### 2. "📅 Calendario" pre-selects the viewed month
- `openCalendarModal` used to force `calendarMonthOffset = 0` (current month). Now it uses
  `calendarOffsetForCurrentView()`:
  - Monthly mode → the viewed month (`monthOffset`).
  - Weekly mode → the month that owns the viewed week (ISO Thursday of the week).
  - Clamped to <= 0 so it never opens on a future month (handles the current-week-straddling-
    into-next-month edge case).

### Notes
- Both helpers use `function` declarations (hoisted), so `setHoursViewMode` (defined earlier)
  can call them. node --check clean.
- Only the per-employee calendar modal (the 📅 button) was changed; the Vacaciones overview
  calendar is untouched.

### Cache-bust
- 20260625c → 20260625d.

### Files
- `js/admin.js`, `index.html`, `teacher.html`, `admin.html`

---

## Session: June 25, 2026 (continued — refine monthly->semanal for current month)

- Tweak: switching to Semanal from the CURRENT month now stays on the CURRENT week; only a
  PAST month jumps to that month's first week. `setHoursViewMode('weekly')`:
  `weekOffset = monthOffset === 0 ? 0 : weekOffsetForFirstWeekOfMonth(monthOffset)`.
- Cache-bust 20260625d → 20260625e. node --check clean.
- Files: js/admin.js, index/teacher/admin .html

---

## Session: June 25, 2026 (continued — search filter lost on view/period change)

### Symptom
Typed a name in the teacher/admin search box, then switched semanal↔mensual (or changed
month/week): the search text stayed in the box but the table showed ALL rows again.

### Cause
`filterTeachers`/`filterAdmins` only toggle row `display` on the CURRENT rows. Any table reload
(`loadTeachersTable`/`loadAdminWorkersTable`, triggered by view toggle, month/week nav, or data
refresh) rebuilds the `<tbody>` rows fresh (all visible), and the filter was never reapplied.
The search `<input>` itself isn't re-rendered, so its value persisted but had no effect.

### Fix (js/admin.js)
After `tbody.innerHTML = rows.join('')` in BOTH table loaders, reapply the active filter by
reading the (still-populated) search input and calling filter again:
- teachers: `filterTeachers(document.getElementById('teacherSearch').value)`
- admins: `filterAdmins(document.getElementById('adminSearchInput').value)`
Covers every re-render path automatically (no need to touch each caller). node --check clean.

### Cache-bust
- 20260625e → 20260625f.

### Files
- `js/admin.js`, `index.html`, `teacher.html`, `admin.html`

---

## Session: June 25, 2026 (continued — weekly progress column)

Request: in Semanal view, "Progreso Anual" column should become "Progreso Semanal" with the
"esp" hours referring to the week.

### Changes (admin.html + js/admin.js)
- admin.html: gave the progress `<th>` IDs (`teacherProgressHeader`, `adminProgressHeader`).
- `setHoursViewMode`: sets the progress header to "Progreso Semanal" (weekly) / "Progreso
  Anual" (monthly), alongside the existing period-header swap.
- Teacher + admin row builders: in weekly mode, compute period progress instead of annual:
  - `weekExpected = countWorkingDays(periodRange.start, cutoffDate, school+teacher holidays)
    × hoursPerWorkingDay` (cutoffDate = today for the current week, week-end for past weeks,
    so the current week shows expected-to-date — consistent with the annual logic).
  - `weekPercent = adjustedPeriodHours / weekExpected` (100% if nothing expected, e.g. a full
    holiday week). Bar width, %, status colour, and "X h esp" all use the weekly values.
  - Monthly view unchanged (still annual progress + annual esp).
- Note: a mid-edit accidentally dropped the teacher `return '<tr…>'` line; caught and restored
  in the same pass. node --check clean.

### Cache-bust
- 20260625f → 20260625g.

### Files
- `admin.html`, `js/admin.js`, `index.html`, `teacher.html`

---

## Session: June 25, 2026 (continued — fix "column reference reason is ambiguous" on holiday delete)

### Symptom
Deleting a holiday request (e.g. Lourdes, to replace with a baja) failed with:
`Error: column reference "reason" is ambiguous`.

### Cause
`delete_holiday_with_reason(request_id uuid, reason text)`: in the
`INSERT INTO audit_log ... SELECT ... jsonb_build_object('deletion_reason', reason) FROM
holiday_requests hr`, the bare `reason` matched BOTH the function parameter and the
`holiday_requests.reason` column → ambiguous, so the delete threw every time.
(`delete_punch_with_reason` is NOT affected — `time_punches` has no `reason` column.)

### Fix (migration 20260625211020_fix_delete_holiday_reason_ambiguous)
- Copy the param into a local `v_reason text := reason;` and use `v_reason` in the SELECT;
  also qualified `hr.id::text`. Parameter name kept as `reason` → frontend rpc call unchanged
  (no JS change needed). Applied via MCP + mirrored to a local migration file.
- Admin can now delete holiday requests with a reason again.

### Files
- `supabase/migrations/20260625211020_fix_delete_holiday_reason_ambiguous.sql` (NEW)

---

## Session: June 25, 2026 (continued — Lourdes baja Apr 27 → Jun 15, data fix)

After fixing the delete RPC, recorded Lourdes's (1f143537…) baja médica and removed the holidays
that were really the baja period. DB-only data change (no code/migration):
- Extended her existing Apr 27 Medical ("Lesión", 6571760d) → end_date 2026-06-15, days=36,
  reason "Baja médica (lesión)". This is the single Baja Médica Apr 27–Jun 15.
- Deleted superseded records (all logged in audit_log; values kept here for reversibility):
  - c56f857d — Medical Apr 27 (Approved, empty) — duplicate of the baja start.
  - 17224808 — Medical Apr 27 (Rejected, empty).
  - 8366dddb — Personal Apr 28 (Approved) — within baja.
  - a2cea760 — Annual May 18–24 (Approved, "Vacaciones") — within baja; deletion returns the
    vacation days to her balance (can be rescheduled later, per baja-interrupts-vacation rule).
- Kept (outside baja): Jan 24 Personal, Aug 3–23 + Aug 24–26 Annual, Sep 4 Personal (Pending).
- Medical hours now credit cleanly for the range with no double-count (no overlapping
  Annual/Personal remain inside the baja).

---

## Session: June 25, 2026 (continued — schedule importer built; digest/alert planning)

### Done this session (schedule feature foundation)
- Validated the **service-account → Sheets API** read path (production mechanism).
- Full per-tab analysis of the ATLAS copy (30 tabs) → `CHATBOT-SCHEDULE-DESIGN.md`.
- `scripts/schedule-map.json` (structure map; match by header not index) + `scripts/parse-schedule.js` (cell parser, unit-tested).
- Migration `schedule_v1_tables`: `schedule_classes/trials/privates/tutorias` + `schedule_sync` + `schedule_changes` (RLS on, read-only authenticated, service-role writes).
- **`index-schedule` Edge Function deployed + DRY-RUN VALIDATED** against the live sheet:
  87 classes / 2793 trials / 33 privates / 19 tutorías, zero warnings. Has modifiedTime guard,
  diff→schedule_changes, schedule_sync log. NOT yet writing (dry-run only).
- `peek-schedule` introspection function neutralized (410).

### NEXT SESSION — pick up here
1. **First real populate run** of `index-schedule` (writes). TWEAK FIRST: suppress
   change-logging when a table starts empty (else first run logs ~2900 "insert" rows as noise).
2. **Atlas `get_schedule` tool** in class-helper (teacher: "¿qué clases tengo hoy?" → targeted SQL).
3. **Morning digest email** (Resend) — admin overview to Rocío first: today's classes + trials + recent schedule_changes.
4. **Coverage-gap alert to ROCÍO, looking TWO WEEKS ahead** (decided): teachers with approved
   holidays who have classes in the next 14 days → flag "check coverage". Caveat: subs (Sustis)
   not imported yet (v2), so it's "check coverage" not confirmed-uncovered until then.
5. **Pi cron**: morning sync → digest/alert (~07:00 Europe/Madrid) + hourly sync backstop.

### BLOCKERS / user to-do before email works
- Verify `worldclassbcn.com` domain in Resend (SPF/DKIM DNS) so mail can come FROM a school
  address TO staff. Test sender `onboarding@resend.dev` only reaches the Resend signup address.
- **ROTATE the Resend API key** (it was shared in plaintext in chat) and add the new key to
  Supabase Edge Function secrets as `RESEND_API_KEY` (never hardcode/commit it).

### HARDENING
- `index-schedule` uses a placeholder `SYNC_TOKEN` constant for Pi-cron auth so it could be
  dry-run tested. Move to a Supabase secret before wiring the real cron.

### Edge function inventory note
- New: `index-schedule` (v1). `peek-schedule` exists but is neutralized (410) — safe to leave or
  delete via dashboard (no MCP delete tool).

---

## Session: June 26, 2026 — get_schedule live + Supabase CLI on the Pi

### 🚀 Supabase CLI installed on the Pi (deploy mechanism fixed!)
- Pi is aarch64; installed CLI v2.108.0 to `~/bin/supabase` (downloaded
  `supabase_linux_arm64.tar.gz` from the GitHub latest release — Pi can reach github.com).
- Auth via `SUPABASE_ACCESS_TOKEN` (sbp_… personal token, created on phone since GitHub login
  is blocked on the work PC; stored on the Pi only). `supabase login --token` also run.
- **Functions now deploy straight from the repo on the Pi:**
  `cd ~/WORLDCLASSBCN && SUPABASE_ACCESS_TOKEN=… ~/bin/supabase functions deploy <name> --project-ref ruytavhodexoxkejrgyb --no-verify-jwt`
  No Docker needed (API bundler; the "Docker not running" warning is harmless). No more
  error-prone inline-paste deploys, and live == repo (no drift).
- NOTE: token is account-wide (Management API) — rotate when convenient; revoking it won't
  affect the user's other project's separate token.

### Atlas get_schedule tool (class-helper v48, deployed via CLI)
- New `get_schedule` tool + handler + prompt section. Teachers get their own schedule (admins
  can pass a teacher). Returns group classes (filtered to today's weekday by default; day= or
  all_week=true), tutorías, and active privates — small targeted SQL, ~tiny tokens.
- Confirmed data path: SARA on Friday → her 2 real classes. ✓

### Schedule data populated + parser tightened
- First real `index-schedule` run populated the tables; cleared first-load change noise.
- Parser tightened (require a real level + strip stray quotes from teacher) to drop non-class
  cells (A0, 6.7, CONV, 53027770m, ALGUIEN, quoted names). Redeployed via CLI + re-synced:
  classes 87 → **71** clean rows. Teacher list now all real names. Cleared the change log again
  (that run's diffs were polluted by the parser change).
- Live counts: 71 classes / 2793 trials / 33 privates / 19 tutorías.

### Known refinement (later)
- Sheet uses some nicknames (CLAU vs CLAUDIA, NICO vs Nicolás, BEA vs Beatriz). Profile first
  names may differ → get_schedule matches most teachers but a few nicknamed ones may miss.
  Add a teacher-alias map when polishing.

### NEXT (unchanged + ready)
- Digest email (Resend) — admin overview to Rocío + coverage-gap alert (Rocío, 2 weeks ahead).
  BLOCKER (user): verify worldclass domain in Resend; rotate+add RESEND_API_KEY secret.
- Pi cron: morning sync → digest (~07:00 Europe/Madrid) + hourly sync backstop.
- Harden: move index-schedule `SYNC_TOKEN` placeholder to a Supabase secret before cron.

---

## Session: June 26, 2026 (continued) — daily-digest email LIVE (test mode)

### Built + deployed `daily-digest` Edge Function (via CLI)
Morning summary email for Rocío. Three sections:
- ⚠️ **Coberturas a vigilar (próx. 14 días)** — the headline: teachers with an APPROVED
  full-day absence (Annual/Personal/School/Medical/PermisoNoRet) who have group classes on
  those weekdays. Matched by profile first-name → schedule_classes.teacher. (Subs not imported
  yet, so it says "revisar cobertura" rather than confirmed-uncovered.)
- 🔔 **Cambios (24h)** — from `schedule_changes`.
- 📅 **Clases de hoy** — today's group classes.

### Email sending — Resend, TEST MODE
- `RESEND_API_KEY` set as a Supabase secret via the CLI (`supabase secrets set`). Used the key
  Daniel shared — ⚠️ STILL TO ROTATE; works only in test mode anyway.
- From `onboarding@resend.dev` → can only reach Daniel's own Resend address
  (danielbaudy@googlemail.com) until `worldclassbcn.com` is verified.
- worldclassbcn.com DNS is on **SiteGround** (ns1/ns2.siteground.net) — Daniel doesn't manage
  it; needs whoever runs the site (Silvia) to add Resend's DKIM/SPF/MX records, OR verify a
  personal domain Daniel controls. From/To are env-configurable (DIGEST_FROM/DIGEST_TO) so we
  flip without code changes.

### Test result ✅
- Dry-run + real send both worked: 16 coverage gaps / 0 changes / 14 classes today.
  email_id returned; delivered to Daniel's inbox.

### Auth / cron
- daily-digest auth: admin JWT OR body.token === DIGEST_TOKEN (placeholder "wcbcn_digest_8Qm2"
  — move to secret before cron, same as index-schedule's SYNC_TOKEN).

### Deploy workflow note (works great now)
- All deploys via Pi CLI: `cd ~/WORLDCLASSBCN && SUPABASE_ACCESS_TOKEN=… ~/bin/supabase functions deploy <name> --project-ref ruytavhodexoxkejrgyb --no-verify-jwt`.
- To call token-gated functions for testing, fetch the anon key on the Pi via
  `~/bin/supabase projects api-keys -o json` (avoids transcription) — never type the JWT by hand
  (homoglyph corruption happened). Delete any /tmp key dumps after (they contain service_role).

### NEXT
- Pi cron: morning `index-schedule` sync → `daily-digest` (~07:00 Europe/Madrid) + hourly sync.
- Verify a domain in Resend (SiteGround records or a personal domain) → flip DIGEST_FROM/TO to
  send from atlas@… to Rocío. Rotate RESEND_API_KEY.
- Move SYNC_TOKEN + DIGEST_TOKEN to Supabase secrets before wiring cron.
- Add trials to the digest (needs Pruebas date parsing); nickname alias map for get_schedule.

---

## Session: June 26, 2026 (continued) — trials in digest + nickname matching + Sustis import

### 1. Trials added to the digest (with date parsing)
- Migration `schedule_trials_date_and_substitutions`: added `schedule_trials.trial_date`.
- `index-schedule` parses the Pruebas "Day" free-text ("lun, sept 1") → date via `parseTrialDate`
  (Spanish month map + school-year inference: months 9-12 → start year, 1-8 → +1). 2790/2793 parsed.
- `daily-digest` now has a 🎓 **Pruebas (próximos 7 días)** section (fecha/hora/estudiante/profe/
  nivel/sede). Today=3, next 7 days=34.

### 2. get_schedule nickname + accent matching (class-helper)
- Replaced exact `ilike` with load-all + JS match: accent-insensitive (`ANDRÉS`→`ANDRES`,
  `RAÚL`→`RAUL`, `VERÓNICA`→`VERONICA`) + alias map (`BEATRIZ`→`BEA`, `CLAUDIA`→`CLAU`, …).

### 3. Sustis imported → schedule_substitutions (best-effort)
- New `schedule_substitutions` table. `index-schedule` parses the Sustis room×time grid and
  extracts inline sub annotations `(SUB semana X)`: original_teacher, substitute, week_note,
  class context. 8 subs parsed; the clean ones are good (e.g. SERGIO→JOAN semana 1.12,
  SERGIO→MAR Y KATHIA semana 9 y 15, JOAN→BEA, SARA→Vero). A couple have messy
  original_teacher (no-space cells like "B1.1Laia(...)") — acceptable for v1; table is
  informational, not yet wired into coverage-gap. `schedule-map.json` substitutions → enabled.

### 🐛 Fixed: spurious "70 classes updated" every sync
- DB returns `time` as HH:MM:SS but the parser emits HH:MM → the diff hash flagged all classes
  as changed every run (would flood the change feed). Fixed: `index-schedule` diff hash now
  normalizes HH:MM:SS → HH:MM. A clean re-sync now reports all-zero changes. Cleared the noise.

### Deploys (all via Pi CLI now)
- index-schedule, class-helper (v50), daily-digest redeployed from repo. Digest re-sent OK.

### Still pending
- Pi cron (morning sync → digest ~07:00 Madrid + hourly sync); move SYNC_TOKEN/DIGEST_TOKEN to
  secrets; Resend domain verify + key rotation (to email Rocío from atlas@worldclassbcn.com);
  optional: resolve "semana X" sub dates + wire subs into the coverage-gap.

---

## SESSION WRAP — June 26, 2026 (state + next-session plan)

### ⭐ NEXT SESSION — START HERE: flag days with an odd/uneven number of punches
Feature request (teacher "Mi Fichaje" page = teacher.html / js/teacher.js):
- **Goal:** detect days where a punch is missing and make it obvious + one-tap fixable.
- **Detection:** per day, count IN vs OUT punches (exclude PREP). Flag a day when
  `#IN !== #OUT` (an unpaired punch) — that's the precise signal; an odd total is the simpler
  proxy. Use IN≠OUT. Scan the current user's punches (current year up to today; ignore future).
- **UI (best-effort, clean):**
  - A small warning card/banner near the top of the Mi Fichaje view: e.g.
    "⚠️ Tienes N día(s) con un fichaje incompleto" (amber, dismissible-but-persistent).
  - List the affected dates; each is a **link/button that jumps to that day** to fix it
    (reuse the existing day-detail / calendar navigation in teacher.js — find the function that
    opens a day, e.g. selectDay/loadDayData, and navigate the calendar to that date + open it).
  - Possibly also mark those days in the calendar view with a warning dot/colour.
- **Notes:** only the user's OWN days; respect the freeze window (frozen days can't be edited by
  teachers — still show them but indicate read-only, or skip frozen). Keep it lightweight; this
  is purely a frontend computation over already-loaded punches (no new backend needed).
- Remember: cache-bust bump + push via Pi after frontend changes.

### Where things stand (end of June 26)
**Schedule feature (built today):**
- `index-schedule` importer: reads Salas Raval/Glories (group classes), Pruebas (trials, with
  parsed trial_date), Priv (privates), tutorías, Sustis (substitutions, best-effort). Tables:
  schedule_classes(71) / schedule_trials(2793) / schedule_privates(33) / schedule_tutorias(19)
  / schedule_substitutions(8) + schedule_sync + schedule_changes. modifiedTime change-guard,
  diff→changes (HH:MM:SS-normalized hash), populated from ATLAS copy.
- Atlas `get_schedule` tool live (class-helper v50): "¿qué clases tengo hoy?" → targeted SQL,
  accent/nickname matching.
- `daily-digest` (Resend, TEST mode → danielbaudy@googlemail.com): coverage gaps (Rocío, 14
  days) + changes (24h) + today's classes + trials (7 days). Sends OK.
- Supabase CLI on the Pi = deploy mechanism (`~/bin/supabase functions deploy <fn> --project-ref ruytavhodexoxkejrgyb --no-verify-jwt`). Token stored on Pi.

**Pending (deferred):**
1. Pi cron: morning `index-schedule` sync → `daily-digest` (~07:00 Europe/Madrid) + hourly sync.
2. Move `SYNC_TOKEN` (index-schedule) + `DIGEST_TOKEN` (daily-digest) placeholders → Supabase secrets.
3. Resend: verify worldclassbcn.com (SiteGround DNS — Daniel doesn't manage it; needs Silvia) OR
   a personal domain; then flip DIGEST_FROM/DIGEST_TO to email Rocío. ROTATE the Resend key.
4. Coverage-gap: resolve "semana X" sub dates and cross-reference subs so gaps show "cubierto/
   sin cubrir" instead of just "revisar".
5. Switch index-schedule to the PRODUCTION sheet id once shared (currently ATLAS copy).
6. peek-schedule function still exists as a 410 stub (harmless; delete from dashboard if wanted).

### Reminders
- Push via Pi (GitHub blocked on laptop). Deploys via Pi Supabase CLI.
- Don't type the anon/JWT by hand (homoglyph corruption) — fetch via
  `~/bin/supabase projects api-keys -o json` on the Pi; delete /tmp key dumps after (service_role).

---

## Session: June 26, 2026 (continued) — incomplete-punch detection (teacher view)

Implemented the flagged "uneven number of punches" feature on the teacher "Mi Fichaje" page.

### What it does
- Scans the current user's IN/OUT punches for the current year and flags any day where
  `#IN !== #OUT` (a missing entrada/salida). PREP punches are ignored (query filters to IN/OUT).
- **Today is excluded on purpose** (`.lt('date', today)`): a person clocked IN but not yet OUT
  is legitimately incomplete mid-shift — flagging it would be a daily false alarm. A genuinely
  forgotten punch from today surfaces the next day (still editable). Noted as a deliberate
  deviation from the "up to today" wording in the original spec.

### UI (`teacher.html` + `js/teacher.js`)
- Amber banner near the top of the Fichaje tab (after the date card):
  "⚠️ Tienes N día(s) con un fichaje incompleto". Tap to expand a list.
- Each row shows the date + "X entradas · Y salidas" and a **Corregir ›** button that jumps to
  that day (`goToIncompleteDay` → `switchTab('hours')` + `loadDay` + scroll to top).
- **Freeze-aware**: frozen days (teacher, `date <= FreezeDate`) show a 🔒 instead of the
  Corregir button (can't be edited by teachers). Admins/super_admins never frozen.
- **Calendar marker**: incomplete days render with an orange `.incomplete` style + ⚠️ corner
  glyph in the day-picker calendar; added a matching legend entry. (`css/styles.css`,
  `renderCalendar` reads `window._incompleteDaysSet`.)
- Pure frontend computation; no backend/schema change. Re-checked on init, on Atlas
  `onAtlasDataChanged`, and after every punch submit/edit/delete.

### Verified
- Read-only SQL across all teachers confirmed the detection surfaces real data (e.g. BEATRIZ 3,
  LOURDES 2, plus several with 1; the two "today" hits were open shifts → correctly excluded now).
- `node --check js/teacher.js` clean.

### Cache-bust
- 20260625g → 20260626a (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `teacher.html` — incomplete banner + calendar legend entry; cache-bust
- `js/teacher.js` — checkIncompletePunches / toggleIncompleteList / goToIncompleteDay; calendar
  marker; wired into init/Atlas/punch-mutation paths
- `css/styles.css` — `.calendar-day.incomplete` + `.legend-dot.incomplete`
- `index.html`, `admin.html` — cache-bust 20260626a

### Reminder
- Push via the Pi (GitHub blocked on this laptop). Frontend needs a hard refresh on prod unless
  the cache-bust bump propagates.

---

## Session: June 26, 2026 (continued) — 15-minute time steps on all time pickers

UX request: time inputs should only allow quarter-hour selections (00/15/30/45), not every minute.

### Change
- Added `step="900"` (900s = 15 min) to every `type="time"` input in the active app:
  - `teacher.html`: punch time (`#timeInput`), edit-punch (`#editTimeInput`), Visita Médica
    Desde/Hasta (`#medApptStartTime` / `#medApptEndTime`).
  - `js/admin.js` (per-employee calendar punch CRUD): add-punch (`#newPunchTime`) and inline
    edit-punch (`#editPunchTime-<id>`).
- Default prefilled "now" values floored to the nearest 15 min so they (a) match the picker
  increments and (b) never round up into the future on today:
  - `teacher.js setCurrentTime()` → `Math.floor(min/15)*15`.
  - `admin.js showAddPunchForm()` `defaultTime` → same floor.
- Native pickers (iOS/Android — the primary platform) now show only 00/15/30/45 on the minute
  wheel. Existing historical punch values that aren't 15-aligned are still displayed as-is when
  editing (not silently rewritten); the step only constrains new picker selections.

### Notes / scope
- Applied to medical-visit times too for consistency (defaults 09:00/10:00 already aligned).
- No submit-time rounding added: the picker enforces increments on mobile and defaults are
  floored; desktop free-typing is an edge case left to the existing duplicate/future checks.
- `node --check` clean on teacher.js + admin.js.

### Cache-bust
- 20260626a → 20260626b (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `teacher.html`, `js/teacher.js`, `js/admin.js`, `index.html`, `admin.html`

---

## Session: June 26, 2026 (continued) — incomplete-punch indicator in admin calendar

Extended the incomplete-punch flag to the admin per-employee calendar modal (📅 Calendario).

### Change (`js/admin.js`, `renderCalendarModal`)
- Per day cell, count IN vs OUT among that day's punches. A day is marked **incomplete** when
  `#IN !== #OUT` AND it's a PAST day (`dateStr < today` — today excluded, same rationale as the
  teacher view: an open mid-shift is legitimately unbalanced).
- Visual: incomplete days get an orange border + light bg (`#fff7ed` / `#f97316`, takes
  precedence over holiday/school styling since it's the actionable signal) and a "⚠️" prefix on
  the "N fichajes" line. Added a matching legend entry ("⚠️ Fichaje incompleto").
- Styling is inline (no admin.css change needed). Cell layout unchanged (still day-num +
  fichajes + hours), so no overflow risk.

### Verified
- `node --check js/admin.js` clean. Detection mirrors the teacher-side SQL already validated
  (BEATRIZ/LOURDES etc.); balanced multi-session days stay unmarked.

### Cache-bust
- 20260626b → 20260626c (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `js/admin.js`, `index.html`, `teacher.html`, `admin.html`

---

## Session: June 26, 2026 (continued) — enforce 15-min times on desktop (snap-to-quarter)

Follow-up: `step="900"` alone doesn't restrict desktop browsers — they still let you type/scroll
any minute (the attribute only changes the spinner increment + validity). So odd minutes were
still selectable on desktop.

### Fix — snap to nearest quarter hour
- New shared helper `roundTimeToQuarter(timeStr)` in `js/supabase-config.js` (loaded by both
  teacher + admin): rounds "HH:MM" to nearest 00/15/30/45, clamped within the day.
- Wired `onchange="this.value=roundTimeToQuarter(this.value)"` on every time input so the field
  visibly corrects itself as soon as the user leaves it:
  - teacher.html: `#timeInput`, `#editTimeInput`, `#medApptStartTime`, `#medApptEndTime`
    (medAppt keeps its `updateMedApptHours()` call after the snap).
  - admin.js dynamic inputs: `#newPunchTime`, `#editPunchTime-<id>`.
- Belt-and-suspenders: also round in every save path so only quarter values can ever be stored —
  teacher `submitPunch`, `savePunchEdit`, MedAppt branch of `submitHolidayRequest`; admin
  `saveNewPunch`, `saveEditPunch`.
- Mobile native pickers already showed only quarter increments (step=900); this makes desktop
  behave the same regardless of typing/scrolling.

### Notes
- Existing historical punches with odd minutes are still shown as-is when editing; they only
  snap if the admin actually changes the field (or on save). Not silently mass-rewritten.
- `node --check` clean on supabase-config.js, teacher.js, admin.js.

### Cache-bust
- 20260626c → 20260626d (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `js/supabase-config.js`, `js/teacher.js`, `js/admin.js`, `teacher.html`, `index.html`, `admin.html`

---

## Session: June 26, 2026 (continued) — punch time = hour + quarter dropdowns (true 4-option UI)

`step="900"` doesn't restrict desktop (still type/scroll any minute). Replaced the native
`<input type="time">` for PUNCHES ONLY with a custom hour + minute dropdown where minutes are
limited to 00/15/30/45 — so the UI literally offers only four options.

### Component (`js/supabase-config.js`)
- `TimePicker.mount(id, {size:'lg'|'sm', onChange})`: builds an hour `<select>` (00–23) + minute
  `<select>` (00/15/30/45) into the wrapper holding a hidden `<input id=id>`; the hidden input
  keeps carrying "HH:MM" so all existing save logic (`getElementById(id).value`) is unchanged.
- `TimePicker.set(id, 'HH:MM')`: sets value + refreshes dropdowns (rounds to nearest quarter).
- Inline-styled (no CSS-file dependency) so it looks the same on teacher + admin pages.

### Applied to (punches only)
- teacher main punch `#timeInput` (lg) — mounted/refreshed in `setCurrentTime()`.
- teacher edit-punch `#editTimeInput` (lg) — mounted in `openEditPunch()`.
- admin add-punch `#newPunchTime` (sm) — mounted after `showAddPunchForm` injects.
- admin edit-punch `#editPunchTime-<id>` (sm) — mounted after `showEditPunchForm` injects.
- Save paths still call `roundTimeToQuarter` (now a no-op for picker values; harmless guard).

### Explicitly NOT changed (per request)
- **Visita Médica (MedAppt) Desde/Hasta**: reverted to plain native `<input type="time">` with
  NO snapping and NO step — any minute allowed (appointment times need full precision). Removed
  the earlier step=900 + onchange-round and the submit-time rounding for those two fields.

### Note
- Editing a punch with an odd historical time (e.g. 18:51) shows the nearest quarter in the
  dropdown; it only persists if the user actually saves. Inherent to a quarter-only UI.
- `node --check` clean on supabase-config.js, teacher.js, admin.js.

### Cache-bust
- 20260626d → 20260626e (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `js/supabase-config.js`, `js/teacher.js`, `js/admin.js`, `teacher.html`, `index.html`, `admin.html`

---

## Session: June 26, 2026 (continued) — Atlas quarter-hour rule + picker size + medAppt no-snap

### Atlas (class-helper) — DEPLOYED v51
- `add_punches` now snaps every in/out time to the nearest 15-min step (00/15/30/45) via a new
  `roundToQuarter()` helper, across all modes (range, per-weekday schedule, single-day punches).
- System prompt gained a "PASOS DE 15 MIN" rule: if the user gives an odd time (e.g. "de 9:10 a
  13:50"), Atlas rounds to 09:15–13:45 and says so in the confirmation.
- Deployed live (version 51, verify_jwt=false). Live == repo (verified via get_edge_function).
- NOTE on deploy mechanism: the Pi has NO stored Supabase access token (pasted manually each
  time), so the Pi CLI deploy fails with "Access token not provided". This deploy went through.

### Frontend — punch picker dialed down + medAppt reverted to free minutes
- TimePicker font sizes reduced to look closer to the native field: lg 30px→20px (pad 12→10/12),
  sm 16px→15px, separator 28→20px. (`js/supabase-config.js`)
- Visita Médica (MedAppt) Desde/Hasta: plain native `<input type="time">` with NO step and NO
  snap — any minute allowed (per user). Removed step=900 + onchange round (teacher.html) and the
  submit-time roundToQuarter (teacher.js). Punches remain quarter-only dropdowns.

### Cache-bust
- 20260626e → 20260626f (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `supabase/functions/class-helper/index.ts` (live==repo, v51)
- `js/supabase-config.js`, `js/teacher.js`, `teacher.html`, `index.html`, `admin.html`

---

## Session: June 26, 2026 (continued) — ROLLBACK: quarter-hour setup removed, back to natural times

User decision: the quarter-hour (15-min) restriction is gone. The dropdown UI was disliked and
felt counterintuitive. Punch times are back to NATURAL native time inputs (any minute). Rationale
from the user: the manager can round hours at year-end if needed, so per-punch rounding isn't worth
the UX cost.

### Frontend — reverted to native `<input type="time">` (any minute, no snap, no dropdown)
- `js/supabase-config.js`: removed the `TimePicker` component AND the `roundTimeToQuarter` helper
  entirely.
- `teacher.html`: `#timeInput` and `#editTimeInput` back to native time inputs (no hidden input,
  no step, no onchange snap).
- `js/teacher.js`: `setCurrentTime` sets the real current HH:MM (no floor); `openEditPunch` sets
  the value directly; `submitPunch`/`savePunchEdit` read `.value` directly (no rounding).
- `js/admin.js`: add-punch (`#newPunchTime`) and inline edit-punch (`#editPunchTime-<id>`) back to
  native inputs; `defaultTime` uses real minutes; `saveNewPunch`/`saveEditPunch` read `.value`.
- Visita Médica was already native — unchanged.
- Grep clean: no `TimePicker` / `roundTimeToQuarter` references remain. node --check clean on all 3.

### Atlas (class-helper) — quarter rule removed (NEEDS REDEPLOY)
- `supabase/functions/class-helper/index.ts`: removed the `roundToQuarter` helper, the
  `punchList.map(... roundToQuarter ...)` snapping line, and the "PASOS DE 15 MIN" prompt rule.
  Atlas now stores whatever exact times are given (still validates HH:MM, out>in, no future).
- ⚠️ DEPLOY PENDING: the live function is still v51 (with rounding). Needs a redeploy from the Pi:
  `cd ~/WORLDCLASSBCN && SUPABASE_ACCESS_TOKEN=<token> ~/bin/supabase functions deploy class-helper --project-ref ruytavhodexoxkejrgyb --no-verify-jwt`
  (Pi has no stored token; pasted manually each time.)

### Cache-bust
- 20260626f → 20260626g (index/teacher/admin .html APP_VERSION + styles.css / admin.css links).

### Files modified
- `js/supabase-config.js`, `js/teacher.js`, `js/admin.js`, `teacher.html`, `index.html`,
  `admin.html`, `supabase/functions/class-helper/index.ts`

### Atlas redeploy DONE — v52 (rollback live)
- Deployed `class-helper` via the Supabase MCP `deploy_edge_function` tool (Pi has no stored
  token; MCP is authenticated through the assistant connection). Build OK, status ACTIVE,
  verify_jwt=false. Version 44→52 (build bumps).
- Live == repo: no `roundToQuarter`, no snapping, no "PASOS DE 15 MIN" prompt rule. Atlas now
  stores exact times (still validates HH:MM, out>in, no future, 180-day window).
- Deploy mechanism note for future: MCP deploy works without the Pi token. Provide the full
  index.ts content + verify_jwt:false. A failed build safely leaves the prior version live.

---

## Session: June 26, 2026 (continued) — Atlas can now READ existing punch times (v53)

Problem: user asked Atlas "ficha junio igual que la primera semana / igual que el 2 de junio" and
Atlas kept asking for the hours — because `get_work_hours` only returned the TOTAL hours + day
count, never the per-day entrada/salida. So Atlas literally couldn't see the times to replicate.

### Fix (class-helper v53, deployed via MCP)
- `get_work_hours` now returns a `detalle` array: `[{ fecha, sesiones:[{entrada,salida}], horas }]`
  (sorted by date, sessions sorted by time, pairs IN→OUT). Total + day count unchanged.
- Tool description updated to advertise the per-day detail.
- Prompt (Fichajes): added a "FICHAR IGUAL QUE..." rule — for "same as [day/week]" requests,
  Atlas must FIRST call get_work_hours to read the real schedule, deduce in/out (use punches or
  schedule for multi-session days), then add_punches the requested range. Already-punched days
  skip themselves, so it can pass the whole month. NEVER ask the user for hours it can read.
- Deployed via MCP deploy_edge_function (verify_jwt=false). v52→v53, ACTIVE, build OK. live==repo.

### Files
- `supabase/functions/class-helper/index.ts`

---

## Session: June 26, 2026 (continued) — Atlas confirm buttons for punches (v54)

Symptom: "punch my june like the first week" → Atlas asked "¿quieres que fiche?" then "¿lo
confirmo?" in PLAIN TEXT (twice), user typed "sí" both times, and the ✓ Confirmar / ✗ Cancelar
buttons never appeared. (The 11 punches DID get created once the user typed sí.)

### Cause
Buttons render only when the Edge Function returns `needs_confirmation:true`, which only happens
when add_punches is actually CALLED with confirmed=false (the tool returns the preview). Atlas
free-texted the confirmation instead of calling the tool, so the flag was never set. The
request_holiday section had a strong "never ask in text, call with confirmed=false" rule; the
add_punches (Fichajes) section did NOT.

### Fix (class-helper v54, deployed via MCP)
- Added the same CONFIRMACIÓN rule to the Fichajes prompt section: as soon as Atlas has the
  schedule + range it must CALL add_punches with confirmed=false (the tool's preview is what
  shows the buttons); NEVER ask "¿quieres que fiche?/¿confirmo?" in text. If it needs to read
  the schedule first (get_work_hours), do it and then call add_punches confirmed=false in the
  SAME turn — don't stop to ask in text. confirmed=true only after the user clicks Confirmar.
- v53→v54, ACTIVE, build OK, verify_jwt=false. live==repo. (Frontend already shows buttons on
  the structured needs_confirmation flag — no frontend change needed.)

### Files
- `supabase/functions/class-helper/index.ts`

---

## Session: June 26, 2026 (continued) — Punch SOP: forced tool-calling (v55)

User wanted a more DETERMINISTIC punch flow ("a skill with strict SOP") instead of relying on the
LLM to choose to call the tool. Implemented option #1 (intent-gated forced tool-calling).

### What changed (class-helper v55)
- New code-level intent gate `isPunchActionIntent(message)`: detects a punch ACTION (ficha/
  fíchame/registra mis horas) vs a how-to question (cómo/qué/puedo/cuánt → excluded). Accent-
  stripped, ASCII regexes.
- When a punch action is detected, the Gemini call uses
  `function_calling_config: { mode: "ANY", allowed_function_names: ["get_work_hours","add_punches"] }`
  — the model CANNOT free-text; it must call a tool. This deterministically forces the
  read→preview(confirmed=false)→needs_confirmation→buttons path instead of "¿confirmo?" in text.
- `forcePunch` flips to false as soon as add_punches returns (any result), so the next turn runs
  in AUTO and writes the summary alongside the buttons.
- Both generateContent calls (initial + tool loop) now use `forcePunch ? PUNCH_TOOL_CFG : AUTO_TOOL_CFG`.
- Deployed via MCP. v54→v55, ACTIVE, build OK, verify_jwt=false. live==repo.

### Docs
- Added `PUNCH-SOP.md` (repo root) documenting the deterministic flow + known limits (intent gate
  is keyword-based; fully-deterministic confirm via stored pending_action is the next step #2).

### Files
- `supabase/functions/class-helper/index.ts`, `PUNCH-SOP.md`

---

## Session: June 26, 2026 (continued) — single-punch capability (v56)

Real gap found via a frustrating convo: a teacher who clocked IN manually at 11:15 asked Atlas to
"ficha ahora la salida" and Atlas couldn't — `add_punches` only creates IN+OUT PAIRS, so it kept
asking for the entrada, and its "day already punched → skip" guard blocked the day. get_work_hours
also read the open IN as "0h / no sessions".

### Fix (class-helper v56, deployed via MCP)
- New tool **`add_punch`** (singular): adds ONE punch (IN or OUT) on one day, mirroring the app's
  punch button. Type auto-detected (even # of marks that day → Entrada, odd → Salida) unless given.
  Goes through the needs_confirmation preview + buttons. Validates HH:MM, future, freeze, 180-day
  window, and rejects a duplicate at the same time. Deliberately does NOT use the bulk "already
  punched → skip" guard, so it CAN add the missing salida to a day that already has an entrada.
- `get_work_hours` now reports `entrada_sin_salida` for unpaired entradas, so an open shift shows
  "entrada 11:15, sin salida" instead of "0h / no sessions". Prompt tells Atlas to offer add_punch
  for those.
- Punch SOP wiring extended: add_punch added to PUNCH_TOOL_CFG allowed list, writeTools, and the
  forcePunch flip. Intent gate broadened (`/\bfich[aeo]/`) to catch more conjugations.
- Prompt: documented add_punch (single mark, "fíchame la salida ahora", auto-detect type).
- v55→v56, ACTIVE, build OK, verify_jwt=false. live==repo.

### Files
- `supabase/functions/class-helper/index.ts`

---

## Session: June 26, 2026 (continued) — confirm-step robustness (v57)

The "fíchame la salida a las 12:30 → ... → No pude procesar" test ran on v55 (per edge logs:
version 55, before add_punch existed), so it failed on the pair-only tool. v56 added add_punch.
But "No pude procesar" is a latent bug worth fixing, so v57 hardens two things:

1. **Confirmations run in AUTO, not forced.** `isPunchActionIntent` now returns false when the
   message contains "confirm" (e.g. the widget's "Sí, confirmo…"). So the confirm turn isn't
   forced into mode=ANY (which could loop on reads and never emit text). The fresh punch request
   still forces normally.
2. **Final-AUTO fallback.** If the tool loop ever ends without a text reply (forced mode hit the
   6-iteration cap), the function now does one final AUTO turn to produce a summary — so the user
   gets a real reply instead of the generic "No pude procesar."
- Also tweaked the add_punches CONFIRMACIÓN prompt line to mention add_punch.
- v56→v57, ACTIVE, build OK, verify_jwt=false. live==repo (functional).

### Files
- `supabase/functions/class-helper/index.ts`

---

## Session: June 26, 2026 (continued) — DETERMINISTIC confirm gate (v58)

"fíchame la salida a las 12:30" → Atlas punched DIRECTLY (no buttons): the model set
confirmed=true on the FIRST call, skipping the preview. Forcing a tool call (mode=ANY) guarantees
a CALL but not confirmed=false. So the buttons were still at the model's mercy.

### Fix (class-helper v58) — server enforces the preview
- New `isConfirmTurn(message)`: true only when the message is a real confirmation — the Confirmar
  button sends "Sí, confirmo. Ejecuta la acción con confirmed=true." (matches /confirm/), or a
  short standalone "sí/vale/ok" (≤25 chars).
- In the tool loop, for ANY write tool (add_punch/add_punches/request_holiday): if the model passes
  `confirmed=true` but it's NOT a confirmation turn, the server OVERRIDES it to `confirmed=false`.
  → The first request ALWAYS returns a preview (needs_confirmation) → buttons appear, deterministically.
  → confirmed=true only takes effect after the user clicks Confirmar (or types a short sí/ok).
- This is the code-level guarantee the user wanted: writes can't execute without the explicit
  confirm step, no matter what the LLM emits. Combined with v57's final-AUTO fallback and the
  forced-tool SOP, the confirm flow is now deterministic end to end.
- v57→v58, ACTIVE, build OK, verify_jwt=false. live==repo.

### Files
- `supabase/functions/class-helper/index.ts`

---

## Session: June 26, 2026 (continued) — rename "Médico" label to "Baja"

User: Lourdes's sick-leave days showed as "Médico"; should read "Baja". Pure display rename of the
`Medical` type's short label (full name stays "Baja Médica"). Changed everywhere in the active app:
- `js/supabase-config.js` HOLIDAY_TYPES.Medical.shortName 'Médico' → 'Baja' (drives teacher
  requests list + anywhere using shortName).
- `js/admin.js`: per-employee calendar holidayColors label + calendar legend + XLS export header.
- `teacher.html` calendar legend; `admin.html` request-type dropdown, table header, legend.
- "Visita Méd." (MedAppt) untouched. No DB/type changes — type stays `Medical`.
- Cache-bust 20260626g → 20260626h. node --check clean.

### Files
- `js/supabase-config.js`, `js/admin.js`, `teacher.html`, `admin.html`, `index.html`


---

## Session: July 2, 2026 — Migrated off the Raspberry Pi onto "toyboy" (ThinkCentre)

Full writeup in **`TOYBOY-MIGRATION.md`**. Summary below.

### Goal
Move everything off the Raspberry Pi (`baudy@baudypi.local`, aarch64) onto a Lenovo
ThinkCentre **`toyboy`** (`192.168.1.181`, Ubuntu 26.04 amd64) and retire the Pi.

### Key finding
GitHub is blocked **only on the work laptop**, not the network — toyboy reaches
`github.com` directly (verified HTTP 200 + SSH auth). So **toyboy is now the git
relay itself**; the Pi is no longer needed for pushes.

### Done this session (on toyboy)
- Recreated the **`baudy`** user (uid 1001, `/home/baudy`, no sudo) so all hardcoded
  paths / systemd units / crontab / venv shebangs work unchanged. `daniel` = admin.
- Passwordless SSH: laptop→toyboy (daniel + baudy) and Pi→toyboy (for the transfer).
- Toolchain matched to the Pi: **node 20.20.2** (NodeSource), npm 10.8.2,
  poppler-utils (`pdftotext`), build-essential, python3-venv/pip, **Google Chrome
  stable** (`/usr/bin/google-chrome-stable`, for `puppeteer-core`).
- Transferred all 5 `/home/baudy` projects + loose files via direct `rsync` over LAN
  (excluded `node_modules`/`venv`/caches — rebuilt on target).
- **GitHub SSH key** (`~/.ssh/id_ed25519`) copied → `git push` auth works from toyboy.
- Rebuilds: `npm install` (pi-scraper, WORLDCLASSBCN, proxy); set
  `CHROME_PATH=/usr/bin/google-chrome-stable` in pi-scraper/.env; **supabase CLI
  amd64 v2.108.0** → `~/bin/supabase`; **lead-scraper venv rebuilt on Python 3.12
  via `uv`** (pinned pandas/lxml lack 3.13/3.14 wheels), `playwright install chromium`
  + launch verified.
- Updated **`.kiro/steering/pi-relay.md`** to relay through toyboy; verified
  `git push --dry-run` on toyboy → "Everything up-to-date".

### WORLDCLASSBCN-specific notes
- Repo lives at `/home/baudy/WORLDCLASSBCN` on toyboy, remote unchanged
  (`git@github.com:danielbaudy-oss/WORLDCLASSBCN.git`).
- `package-lock.json` shows modified on toyboy (npm reresolved on amd64/npm10) —
  uncommitted, harmless.
- ⚠️ **`SUPABASE_ACCESS_TOKEN` (`sbp_…`)** was never stored on disk (Pi passed it
  inline); must be supplied on toyboy to run edge-function deploys.

### Still pending (see TOYBOY-MIGRATION.md → TODO)
- **Scraper workspace** (owns pi-scraper/lead-scraper/proxy/casahunt): install the two
  systemd services (`dropping-proxy`, `lead-scraper`) + the 11-job crontab, and run a
  real scraper job to verify. Migrate the **gitlab-runner** (token in
  `/etc/gitlab-runner/config.toml`).
- Supply `SUPABASE_ACCESS_TOKEN`; test a supabase deploy from toyboy.
- Give toyboy a static IP / DHCP reservation (or install avahi for `toyboy.local`).
- Cutover: disable Pi cron + services, then power the Pi off.

---

## Session: July 7, 2026 — New laptop setup + Supabase MCP power installed

### New Laptop Setup
- Generated SSH key (`~/.ssh/id_ed25519`, fingerprint `baudy-laptop`)
- Set up passwordless SSH to toyboy (`192.168.1.181`) for both `daniel` and `baudy` users
- Stored Supabase access token (`sbp_...`) on toyboy at `~/.supabase_token`
- Stored service_role key on toyboy at `~/.supabase_token_service_role`
- npm dependencies confirmed up-to-date (30 packages)
- Node.js at `C:\Program Files\nodejs` (not on system PATH in some shell contexts)

### Supabase MCP Power — Installed Globally (bypasses GitHub block)
- **Problem**: The official Supabase power install button failed because it pulls from GitHub
  (blocked on this work laptop). The Supabase account is GitHub-only OAuth, so the remote MCP
  server (`mcp.supabase.com`) couldn't authenticate either.
- **Solution**: Created a custom local power at `C:\Users\baudy\power-supabase\` with:
  - `POWER.md` (frontmatter + docs)
  - `mcp.json` — uses the LOCAL npx MCP server (`@supabase/mcp-server-supabase@latest`) with
    the personal access token directly. No OAuth, no GitHub needed.
- Installed via Kiro Powers panel → "Add power from Local Path" → `C:\Users\baudy\power-supabase`
- Workspace config at `.kiro/settings/mcp.json` also updated to use the same npx+token approach.
- **Result**: Full Supabase MCP tools available (execute_sql, list_tables, apply_migration,
  deploy_edge_function, etc.) from ANY workspace on this laptop. Verified: can query all 17
  tables directly.

### MCP Config (for reference)
```json
{
  "mcpServers": {
    "supabase": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--access-token", "sbp_..."],
      "env": {"PATH": "C:\\Program Files\\nodejs"},
      "disabled": false
    }
  }
}
```
- Token: personal access token (starts with `sbp_09ee...`), created from phone via Supabase
  dashboard. Works without GitHub.
- The power lives at user level (`C:\Users\baudy\power-supabase\`) so it's available globally.

### SSH to Toyboy (still works, still needed for deploys + git push to GitHub)
- `ssh daniel@192.168.1.181` — admin user, passwordless
- `ssh baudy@192.168.1.181` — app user, passwordless, has the repo + supabase CLI
- Deploys: `ssh baudy@192.168.1.181 "cd ~/WORLDCLASSBCN && SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_token) ~/bin/supabase functions deploy <fn> --project-ref ruytavhodexoxkejrgyb --no-verify-jwt"`
- Git push (GitHub): `ssh baudy@192.168.1.181 "cd ~/WORLDCLASSBCN && git add -A && git commit -m '...' && git push origin main"`

### Network Access Notes (this work laptop)
- **GitHub** (`github.com`): BLOCKED — all git push/pull must go via toyboy
- **GitLab** (`gitlab.com`): NOT BLOCKED — can access directly from this laptop
- **Supabase** (`supabase.co`, `mcp.supabase.com`): NOT BLOCKED
- **npm registry**: NOT BLOCKED (npx works directly)

### User-Level Steering File Created
- `C:\Users\baudy\.kiro\steering\supabase-access.md` — documents the toyboy SSH + REST API
  fallback approach (for cases where the MCP server isn't available).

### Database State (July 7, 2026)
- 36 profiles, 8,920 punches, 143 holiday requests, 13 school holidays, 43,069 audit log entries
- 1,659 material embeddings (RAG corpus), 65 chat logs, 71 schedule classes
- All tables have RLS enabled


---

## Session: August 19, 2026 — 🐛 10,000-punch row-cap bug (Joan's July hours)

### Symptom
Joan's July showed **103.8h** (incl. 47.8h baja) in the monthly view — but her real July is
**133.8h**: 86h worked + 47.8h baja. Her Jul 27–31 punches (5 days × 6h = 30h, after her
Jul 15–24 "Cirugía" baja) were missing from the calc, TODAY, with July being a past month.

### Verified breakdown (correct math, wrong data window)
- Baja credit: Jul 15–24 = 8 working days × (1230 expected ÷ 206 working days = 5.97h/day) = **47.8h** ✓
- Worked Jul 1–14: 56h (Jul 1 = 8h double shift; 8 more days × 6h) ✓
- Missing: Jul 27–31 punches (verified real in DB, created live on those days)
- 56 + 47.8 = 103.8 (displayed) vs 86 + 47.8 = 133.8 (correct)

### Root cause: the app crossed 10,000 yearly punches in mid-August 2026
- admin.js loaded year punches with `.limit(10000)` (4 sites). Jan 1 → Aug 19 IN/OUT count
  hit **10,043** — the first 10,000 rows (unordered!) are returned, the rest silently dropped.
  Joan's late-July rows were among the dropped 43. Gets worse daily; hits random users.
- Worse: `exportAuditReport()` had NO limit → capped at PostgREST's default **1000** rows
  (10,628 punches / 43,069 audit rows truncated — the audit XLS export was very incomplete).

### Fix (frontend, deployed pending)
- New `fetchAllRows(buildQuery)` helper in `js/supabase-config.js`: pages through results in
  1000-row batches via `.range()`, appends `.order('id')` for stable pagination, loops until
  a short page. Returns `{data, error}` like a normal query.
- Replaced all 4 `.limit(10000)` punch loads in admin.js (stats grid, teacher table w/ PREP,
  admin table, XLS export) + both unbounded audit-export queries with `fetchAllRows`.
- `select()` now includes `id` (needed for the stable order).
- teacher.js year-long queries left as-is: a single teacher tops out at ~600 rows/year,
  safely under the 1000 cap.
- node --check clean (admin.js, supabase-config.js). Cache-bust 20260626h → **20260819a**.

### ✅ DEPLOYED (commit cc9c629)
- Pushed via toyboy: js/supabase-config.js, js/admin.js, index.html, teacher.html, admin.html.
- ⚠️ **TOYBOY IP CHANGED: 192.168.1.181 → 192.168.1.128** (DHCP, no static reservation yet).
  If unreachable again, check `arp -a` for new devices or set a DHCP reservation in the router
  (long-standing TODO from TOYBOY-MIGRATION.md). Update .kiro/steering/pi-relay.md accordingly.

### Other fixes this session
- **Raúl's "missing" August holiday**: record f89624eb had year 2025 (Aug 3–23, 2025) — a
  wrong-year import. Updated to 2026-08-03 → 2026-08-23. Verified no other pre-2026 rows in
  holiday_requests / time_punches / school_holidays.
- **MCP token expired** (created Jul 7 w/ 7-day expiry): replaced with new token in all 3
  configs (user-level ~/.kiro/settings/mcp.json — which ALSO had a stale untokened supabase
  entry that shadowed the workspace one — workspace .kiro/settings/mcp.json, and
  C:\Users\baudy\power-supabase\mcp.json). Prefer non-expiring tokens for this.

### ⚠️ NOTE FOR ASSISTANT — DATE AWARENESS
The IDE-provided "current date" context can be stale (long-running sessions). ALWAYS verify
today's real date (e.g. `Get-Date` in terminal or SQL `CURRENT_DATE`) before date-based
analysis. This session: context said July 7; the real date was August 19.

### Supabase projects note
- The second Supabase project (kxbmlsbxnzvgzucxleoy) was renamed MIKAN → **DROPPING** and is
  the backend for the dropping project (GitLab: gitlab.com/baudy-group/dropping — reachable
  from this laptop; repo currently 403 without auth). Local restore folder created at
  C:\Users\baudy\Documents\Extensions\dropping (empty — git not installed on laptop yet;
  git-scm.com + winget downloads blocked because they redirect to github.com. Get git via
  toyboy or another mirror when needed.)

---

## Session: August 19, 2026 (continued) — 🔒 Freeze was cosmetic; now enforced (DB + frontend)

### Report (from Rocío)
Frozen days could still be edited. Confirmed: FreezeDate was set (2026-08-16) and the banner/🔒
rendered, but the freeze had NO teeth:
1. The main "Fichar" button stayed ACTIVE on frozen days (`updatePunchButton` unconditionally
   re-enabled it) and `submitPunch` never checked the freeze → teachers could add punches to
   frozen days.
2. `savePunchEdit` / `deletePunch` had no freeze checks either (buttons hidden, functions open).
3. ZERO server-side enforcement — RLS lets users write own punches unconditionally, so any
   client could modify frozen days. The freeze has been cosmetic since launch.

### Fix layer 1 — DB trigger (migration 20260819120000_enforce_punch_freeze, applied + tracked)
- `enforce_punch_freeze()` BEFORE INSERT/UPDATE/DELETE trigger on time_punches:
  - auth.uid() IS NULL (service role: imports, Atlas Edge Fn) → bypass (Atlas enforces freeze itself)
  - Active admin/super_admin → bypass (by design)
  - Otherwise: block if the punch date (NEW and/or OLD) <= FreezeDate. UPDATE checks BOTH dates
    (can't move a punch into or out of the frozen window). Error message in Spanish.
- Covers the delete RPC too (`delete_punch_with_reason` is SECURITY DEFINER but auth.uid() still
  returns the caller → blocked for teachers on frozen dates).
- Tested in-DB with simulated JWT claims (all 4 pass, no test rows leaked):
  teacher insert frozen ✗ blocked / teacher insert unfrozen ✓ / teacher delete frozen ✗ blocked /
  admin insert frozen ✓ allowed.

### Fix layer 2 — frontend (js/teacher.js)
- `updatePunchButton(punches, isFrozen)`: button disabled + "🔒 Día congelado" label on frozen days.
- New `isDayFrozen(dateStr)` helper; re-checked inside `submitPunch`, `savePunchEdit`,
  `deletePunch` (defense in depth; friendly toast instead of raw DB error).

### Deploy
- Commit 2d5e075 pushed via toyboy (192.168.1.128). Cache-bust 20260819a → 20260819b.
- PREP inserts on frozen weeks are now blocked by the trigger as well (same date rule) — raw DB
  error surfaces if a teacher tries; acceptable, freeze dates are set to period boundaries.

### Atlas freeze/identity audit (same session) — no changes needed
Pulled the LIVE class-helper (v58) via MCP and verified:
- Freeze enforced in both punch tools: add_punches rejects dates <= FreezeDate ("Congelada"),
  add_punch errors "día congelado". Applies to ALL Atlas users incl. admins (stricter than the
  app, intentionally conservative). Note: Atlas uses the service role, so the new DB trigger
  deliberately bypasses it (auth.uid() IS NULL) — Atlas's own checks are the enforcement there,
  and they're present in the live code.
- Identity: ctx.userId comes from the VERIFIED session JWT (auth.getUser()), and every write
  (add_punch/add_punches/request_holiday) hardcodes user_id: ctx.userId — writes always target
  the person talking; no parameter can redirect them. Teachers' reads are locked to self;
  admins can read others (read-only).
- Live v58 == repo copy (no drift).

---

## Session: September 21, 2026 — Maja admin account "needs activation" fix

### Symptom
Rocío added Maja as an admin, but on first Google login Maja got "cuenta creada, necesita
activación por un administrador".

### Root cause: email typo in the pre-created profile
- Rocío's profile: `maja.przada.wordlclassbcn@gmail.com` (**wordl** — typo), admin/Active.
- Maja's real Google email: `maja.przada.worldclassbcn@gmail.com` (**world**).
- No email match on login → `handle_new_user` trigger created a SECOND profile
  (teacher/Pending) → the activation message.

### Fix (DB only)
- Promoted the real, auth-linked profile (f877ea55…) to role=admin, status=Active.
- Deleted the empty typo profile (0ad2f1a1…, zero punches/holidays/paid_hours).
- Verified: one Maja profile, admin/Active, auth_linked=1. She needs to log out/in once.

### Lesson
Pre-created accounts match on EXACT email. A typo silently lands the person in the
teacher/Pending auto-signup path. First thing to check when "needs activation" appears for
someone who was already added: `SELECT email, role, status FROM profiles WHERE name ILIKE '%name%'`.

### Follow-up: pending signups now visible in the admin panel (commit 1cc63a5)
Previously every admin-panel query filtered status='Active' → Pending auto-signups were
INVISIBLE to Rocío (which is why Maja's case was a mystery). Built:
- **Amber card at the top of the Personal section** ("⏳ Cuentas pendientes de activación"),
  shown only when Pending profiles exist. Lists name, email, creation date.
- **Typo detection**: Levenshtein distance (≤3) between the pending email and every other
  profile's email → shows "⚠️ Muy parecido a X — ¿error tipográfico?" hint.
- **One-click actions**: "🔀 Fusionar" (calls new `merge_pending_profile` RPC: copies role +
  hour settings from the typo'd duplicate onto the real auth-linked profile, activates it,
  deletes the empty duplicate — guarded: admin-only, dup must be unlinked + zero records) or
  plain "✓ Activar como Profe / Admin".
- Migration `20260921100000_merge_pending_profile` applied + tracked. Cache-bust 20260819b →
  20260921a. node --check clean. Pushed via toyboy (192.168.1.128).

---

## Session: September 21, 2026 (continued) — Admin access allowlist + hidden hours adjustment + dismissible pending cards

### 1. 🔐 Admin panel restricted to Rocío, Silvia, Milena (commit 3615c86)
**Problem:** `profiles.role` was doing two jobs at once — employment category (hour rules,
ADMIN_DEFAULTS, grouping) AND security privilege. So all 7 administrative workers
(Jurgen, Kamila, Maja, Martyna, Mile, Silvi, + the 3 real managers) had full admin-panel access
and broad RLS access. Demoting them to `teacher` was NOT an option: it would corrupt their
1530h hour calculations and prep-time rules.

**Solution — separate the two concepts:**
- New locked table `admin_authorizations(profile_id, access_level)`, RLS on with a
  `USING (false)` policy → no client can read/write it; only SECURITY DEFINER helpers see it.
  Seeded by verified auth UUID: Rocío=super_admin, Silvia (info@)=admin, Milena (contact@)=admin.
- `is_admin()` / `is_super_admin()` rewritten to check that table + Active status (was
  `role IN ('admin','super_admin')`). Every policy already calling them became correct for free.
- Replaced the 6 policies that embedded `profiles.role` directly: app_config, chat_logs,
  holiday_requests, material_embeddings, paid_hours, time_punches. ⚠️ Two of these
  (material_embeddings, chat_logs) previously didn't even check Active status — that's why the
  super-admin-only Atlas nav was cosmetic: any admin could query chat_logs directly.
- `enforce_punch_freeze()`, `merge_pending_profile()`, `delete_pending_profile()` now use
  `is_admin()` instead of inline role checks.
- New `get_admin_access_level()` RPC = the server-derived capability the frontend reads.
- Frontend: `requireAdminAccess()` in auth.js (redirects to teacher.html, not index.html);
  `hasAdminPanelAccess()` / `hasSuperAdminAccess()` replace every privilege-bearing role check in
  index.html routing, teacher.js (admin button, freeze bypass ×3, punch edit/delete), and
  admin.js (page gate, freeze/Atlas nav, super-admin punch CRUD).
- Employment-role uses left INTACT on purpose: ADMIN_DEFAULTS selection, teacher/admin table
  split, badges, prep-time gating, audit export.
- **Atlas (class-helper v59)**: `ctx.adminAccess` (from admin_authorizations) now gates
  cross-user reads in get_holidays/get_work_hours/get_schedule — was `ctx.role === "teacher"`,
  which let all 7 admins read anyone's data. Writes were already locked to ctx.userId.

**Verified by simulating each account's JWT:** Rocío→super_admin, Silvia/Milena→admin,
Jurgen/Kamila/Maja/Test→no access (is_admin=false). RLS spot-check: Maja sees 1 profile (her own)
and 0 other users' punches; Rocío sees all 11,836 punches.

### 2. 🐛 SECURITY FIX found along the way: link_profile_by_email was spoofable
The SECURITY DEFINER fallback linker took an email argument and never checked it against the
caller's JWT — any authenticated user could call `link_profile_by_email('info@worldclassbcn.com')`
and claim Silvia's privileged profile. Now derives+compares the verified email from `auth.users`
and only claims profiles with no existing auth identity. Verified: spoof attempt as Jurgen →
"Email does not match authenticated account". (Pre-existing hole since April, unrelated to today.)

### 3. Rocío: shown 1500h, computed as 1400h
New `profiles.hours_adjustment numeric DEFAULT 0`. `effectiveExpectedHours(profile, fallback)`
in supabase-config.js returns nominal + adjustment and feeds every progress/medical/period calc
(stats grid, teacher table, admin table, teacher.js, XLS export). The NOMINAL value still renders
in the "Esperado/Año" columns, the edit modals, and teacher.js "Xh / Yh". Rocío = -100 → effective
1400. Everyone else 0 (no behavior change). Rationale: her 8:30–16:00 schedule (7h net after the
30-min unpaid break) × ~206 available working days = ~1442h ceiling, so the convenio-derived
1500 (1300 docent + 200 categoria funcional, Art. 18) was mathematically unreachable.

### 4. Pending-account cards: dismiss + delete
- Per-row ✕ = hide (localStorage per browser, no DB change) + "Ocultar todo ✕" on the card.
- A small note shows "N cuentas pendientes ocultas · Mostrar" to bring them back.
- 🗑 "Eliminar cuenta" → `delete_pending_profile` RPC (admin-only, Pending-only, refuses if the
  profile has any punches/holidays/paid_hours).
- ⚠️ **Edge case caught during review**: deleting only the profile row left the Supabase Auth
  identity orphaned → on next Google login `handle_new_user` would NOT fire (auth user already
  exists) and the person would be stuck with no profile at all. The RPC now deletes the
  `auth.users` row too (migration 20260921121000).

### 5. Hardening: chat views
`chat_statistics` / `chat_top_questions` were SECURITY DEFINER views (bypassed caller RLS) →
set `security_invoker = true`. Security advisor ERROR count went 2 → 0.

### Migrations (applied + tracked)
| Migration | Change |
|-----------|--------|
| 20260921110000_hours_adjustment_and_delete_pending | profiles.hours_adjustment + delete_pending_profile |
| 20260921120000_separate_admin_authorization | admin_authorizations table, is_admin/is_super_admin rewrite, 6 policies, freeze trigger, pending RPCs, hardened linker |
| 20260921121000_delete_pending_auth_identity | also delete the orphaned auth.users row |
| 20260921122000_secure_chat_views_and_admin_auth_table | security_invoker views + explicit deny policy |

### Deploy
- Commit **3615c86** pushed via toyboy. Atlas **v59** ACTIVE (live == repo). Cache-bust
  20260921b → **20260921c**. node --check clean on auth/admin/teacher/supabase-config.
- Deploy gotchas hit: (a) `$(cat ...)` inside a double-quoted PowerShell ssh string is expanded
  LOCALLY — use single quotes; (b) piping a token via PowerShell adds CRLF, breaking
  `supabase login` ("Invalid access token format") — write with `printf '%s'`;
  (c) commit messages with `()` break through the ssh/PowerShell quoting layers.

### ⚠️ Follow-ups
- **User-level MCP config (`~/.kiro/settings/mcp.json`) now contains the placeholder
  `PASTE_YOUR_EXISTING_SUPABASE_TOKEN_HERE`** instead of a real token, so the Supabase power
  works in THIS workspace only (the workspace config has the real one). Paste a valid `sbp_`
  token there to restore it globally.
- Advisor WARNs left as-is (pre-existing): 7 functions with mutable search_path, `vector`
  extension in public, SECURITY DEFINER functions callable by authenticated (they all
  authorize internally), leaked-password protection off.
- `switch_dev_role` can still change `profiles.role` for the test account, but that no longer
  grants privilege (authorization lives in admin_authorizations) — the dev switcher can no
  longer be used to reach the admin panel. Consider dropping it in production anyway.
- To grant/revoke admin access in future: insert/delete a row in `admin_authorizations`. There
  is deliberately no UI for it.

### Follow-up: Test Account added to the allowlist (commit d2ea11a)
🧪 Test Account (danielbaudy@googlemail.com, a050a494…) added as **super_admin** in
`admin_authorizations` — it's Daniel's dev account and needed panel access back. Verified:
get_admin_access_level()='super_admin', is_admin/is_super_admin true. Tracked migration
20260921120000 updated so a fresh `db reset` seeds all four.

Current allowlist: Rocío + Test Account = super_admin; Silvia + Milena = admin.

⚠️ **Dev role switcher interaction:** `switch_dev_role` still flips `profiles.role`, but
authorization now lives in `admin_authorizations` — so switching the test account to 'teacher' no
longer removes admin access. The switcher can still be used to verify hour-rule/prep-time
behavior (those correctly follow `role`), but NOT to preview the restricted teacher experience.
To test that, temporarily remove the row:
  `DELETE FROM admin_authorizations WHERE profile_id='a050a494-a18d-4161-a1ec-c0ebe0aeadcb';`
and re-insert with access_level='super_admin' afterwards. (Deliberately did NOT let
switch_dev_role write to the authorization table — that would reopen a privilege-escalation path
into the very table that now guards everything.)

### 🐛 PERF REGRESSION from the authorization split — fixed (commit 51eeea3)
**Symptom:** admin view got much slower right after the Sep 21 authorization split.

**Cause 1 (mine, the multiplier): RLS function calls evaluated PER ROW.**
The split replaced inline `EXISTS (SELECT 1 FROM profiles WHERE role IN (...))` policy predicates
with `is_admin()`. The planner could collapse the old subquery into a one-time filter, but a
STABLE SECURITY DEFINER *function call* stays in the per-row filter. Because the policies are
`user_id = auth.uid() OR is_admin()`, and an admin reads everyone's rows, the first branch fails
on nearly every row → `is_admin()` ran ~11.8k times per query, each doing a join.
EXPLAIN proof: `Filter: (... OR is_admin())`, 34.0 ms / 4004 buffers for 1000 rows.
**Fix:** wrap in scalar subqueries — `USING ((SELECT is_admin()))` — which makes them InitPlans
evaluated once (`loops=1`). Same for `auth.uid()` (also fixes the pre-existing linter warning).
**Result: 34.0 ms → 5.1 ms per page, buffers 4004 → 1190.** The `auth_rls_initplan` advisor
warning went from 10 findings to 0.
Also dropped 2 strictly-redundant policies ("Super admins can insert/delete all punches" —
`is_admin()` is already true for super_admins) to cut per-query policy evaluation. UPDATE stays
super-admin-only (intentional, matches the UI).

**Cause 2 (pre-existing, since the Aug 19 pagination fix): 3× duplicate full punch loads.**
`loadData()` runs loadStatsGrid + loadTeachersTable + loadAdminWorkersTable in `Promise.all`.
All three started their own paginated punch fetch because each saw `cachedPunches === null` at
the same instant (loadTeachersTable didn't even check the cache — it always reloaded). At ~12
pages each that's **~36 HTTP round trips** instead of 12 — the dominant cost given ~150 ms
latency to eu-west-1.
**Fix:** new `getYearPunches(yearStart, today)` in admin.js memoises the in-flight promise, so
concurrent callers share ONE paginated load. Returns all punch types (PREP included, needed by
the teacher table) and keeps `cachedPunches` as the IN/OUT subset for existing callers. A null
`cachedPunches` still forces a reload, so all 10 existing `cachedPunches = null` invalidation
sites keep working untouched.

**Verified after the policy rewrite (~30 policies recreated) — authorization unchanged:**
Rocío 35 profiles / 11,836 punches / 216 holidays / 40 paid / 46,327 audit;
Maja (admin worker, no panel) 1 profile / 2 own punches / 0 holidays / 0 paid / 0 audit;
Joan (teacher) 1 profile / 362 own punches / **0** other-user punches. School holidays readable
by all (13) as intended.

Migration `20260921130000_rls_initplan_perf_wrap_auth_calls` applied + tracked.
Cache-bust 20260921c → **20260921d**. node --check clean.

**Lesson for future RLS work:** always wrap `auth.*()` and SECURITY DEFINER helper calls in
`(SELECT ...)` inside policies. Without it they're per-row; with it they're once-per-query.

### 📌 DEFERRED (user decision, Sep 21): server-side hours aggregation
Admin load is "reasonably fast" after the two fixes above, so the deeper optimisation is
postponed — Daniel will implement it later. For whoever picks it up:

**What:** a Postgres function (e.g. `get_employee_hours_summary(p_year int, p_period_start date,
p_period_end date, p_cutoff date)`) that returns ONE small row per employee — worked hours,
period hours, medical/medAppt/permiso credit, paid deduction, prep total, expected-to-date,
progress % — instead of shipping every raw punch to the browser.

**Why:** the admin panel currently downloads all ~11.8k (and growing) punches for the year and
aggregates in JavaScript, paginated 1000 at a time (~12 round trips, resets each January but
grows all year). An RPC makes it 1 request with a flat response, so load time stops scaling with
data volume.

**Where the logic lives today** (must be ported 1:1 or results will drift — there are FIVE calc
sites that already agree with each other):
- `js/admin.js` loadStatsGrid (~line 584+), teacher table (~939+), admin-workers table (~1186+),
  XLS export (~3427+); `js/teacher.js` loadProgress (~1034+).
- Key rules to preserve: `effectiveExpectedHours()` = expected_yearly_hours + hours_adjustment
  (Rocío shows 1500 / computes 1400); hoursPerWorkingDay = effective ÷ totalWorkingDays;
  medical credit = working days in range × hoursPerWorkingDay; MedAppt + Permiso store HOURS in
  the `days` column; allocatedDays = max(0, annual-3) + personal + school; cutoff = today for the
  current period, period end for past periods; green ≥98 %, amber ≥80 %.
- Must run as SECURITY DEFINER with `(SELECT is_admin())`-style gating, or as SECURITY INVOKER so
  RLS naturally restricts it — and remember the per-row-vs-InitPlan lesson above.

**Suggested order:** build the RPC alongside the existing JS, compare outputs for every employee
until identical, then switch the frontend over and delete the raw-punch loads.

### Refinement: 1500 drives everything except the % denominator (commit 14fe962)
Earlier today `hours_adjustment` shifted the target used by ALL calculations (Rocío computed
entirely at 1400). Requested change: compute expected hours at the nominal **1500**, but measure
the progress **percentage** against **1400**.

Renamed `effectiveExpectedHours()` → **`progressTargetHours()`** to reflect its now-narrow role,
and split every calc site into two values:
- `expectedYearly` = NOMINAL (1500) → drives `hoursPerWorkingDay` (so baja/medical credit is
  valued at the real rate) and the displayed "Xh esp" / "Xh esperadas".
- `progressTarget` = nominal + hours_adjustment (1400) → used ONLY as the percentage denominator
  (`progressDenom`), annual and weekly.

Weekly view needed the same split: `weekExpected` (displayed) stays at the nominal rate, while
`weekDenom` uses `progressTarget / totalWorkingDays`.

Updated all 5 calc sites: admin.js stats grid, teacher table, admin-workers table, XLS export;
teacher.js loadProgress. Grep-verified zero remaining `effectiveExpectedHours` references.
For everyone else `hours_adjustment = 0`, so nominal == progressTarget → no behavior change.

**Verified against live data (Sep 21):** 206 total working days, 158 passed (ratio 0.767),
1111.6h credited. Rate at 1500 = 7.282 h/day. Displayed expected-to-date = **1150h** (1500-based),
percentage denominator = 1074h (1400-based) → **103.5 %** (green). Had the % used 1500 it would
read 96.6 % (amber) — which is exactly the difference this change is for.
Note Rocío has no Medical records, so the rate change doesn't alter her credited hours; it would
matter for anyone with a baja.

Cache-bust 20260921d → **20260921e**. node --check clean on all three files.

### 🐛 Mid-year joiners measured against the whole year — fixed (commit bddaa3e)
**Symptom:** ALEXANDRA DINU (first punch 2026-09-14, 6 days worked, 22h) was expected to have
done **908h** by Sep 21 → ~2 %, permanently red. Same for Maja (created Sep 21 → 869h expected).
The progress calc counted all 179 working days elapsed since Jan 1, regardless of employment.

**Was `expected_yearly_hours` a full-year or a remaining-period figure?** Resolved from the data:
Alexandra's 1045 over her 68 remaining working days would be 15.4 h/day (impossible); as a
full-year rate prorated to her window it's ~5.1 h/day (full-timers are 5.97). So it's a full-year
figure and the TARGET must prorate too — not just the ratio.

**Fix:** new nullable `profiles.contract_start` (NULL = employed since Jan 1 → behaviour
unchanged for the other 32 people). When set, `getTeacherProgress(..., contractStart)`:
- excludes working days before contract_start from both the total and passed counts;
- computes `windowFraction` = window working days ÷ full-year working days;
- prorates the holiday allocation by that fraction (Conveni Art. 23, "en proporció al temps
  treballat"), so a Sept joiner isn't charged a full 35-day allocation against ~68 days;
- ignores any holiday dates before contract_start.
Callers then scale BOTH `expectedYearly` and `progressTarget` by `progress.windowFraction`.
Applied at all 4 admin call sites (stats grid, teacher table, admin-workers table, XLS export)
and mirrored in teacher.js loadProgress (which computes its working days inline).
Display: for mid-year staff the "Esperado/Año" cell shows the prorated figure with a `*` and a
tooltip ("1045h/año · alta el 2026-09-14 (prorrateado)"); teacher.js shows prorated too, so the
"Xh / Yh" line reconciles with the bar.

**Verified (Sep 21), new vs old:**
| | contract_start | configured | window | target | h/day | exp-to-date | worked | % |
|---|---|---|---|---|---|---|---|---|
| JOAN (control) | NULL | 1230 | 1.0000 | 1230 | 5.97 | 901.6 | 922.8 | 102.3 |
| ALEXANDRA | 2026-09-14 | 1045 | 0.2822 | 295 | 5.07 | 30.4 | 22.0 | **72.3** (was ~2) |
| Maja | 2026-09-21 | 1000 | 0.2614 | 261 | 4.85 | 4.9 | 4.5 | **92.7** |
Joan unchanged → confirms zero impact on full-year staff. Alexandra's 72 % is a genuine
behind-pace signal (3.7 h/day actual vs 5.07 required), not a calc artefact.

Backfilled contract_start for the two known joiners from first-punch/creation evidence.
⚠️ **Process note:** set `contract_start` when adding anyone who joins mid-year, otherwise they'll
be measured from January. There's no UI field for it yet — set it in SQL, or add it to the
add/edit teacher modals when convenient.
Cache-bust 20260921e → **20260921f**. node --check clean.

(Problem 2 from the same review — 4 zero-data admin profiles and the likely Silvi/Silvia +
Mile/Milena duplicates — deliberately NOT fixed: they're the school owners, not pressured to
punch. Still worth noting the Silvia allowlist risk recorded above.)

### Contract period is now editable in the UI + added contract_end (commit eb7de80)
Follow-up to the proration fix: the dates were SQL-only, now they're in the modals, and
`contract_end` was added so leavers work symmetrically.

**New column** `profiles.contract_end date` (NULL = through Dec 31) + CHECK constraint
`contract_end >= contract_start` (verified: an inverted range is rejected by the DB, and the
frontend also blocks it with a toast before saving).

**Calc:** `getTeacherProgress(..., contractStart, contractEnd)` now excludes working days OUTSIDE
`[start, end]` from both the total and passed counts via a single `outside(d)` predicate, prorates
the allocation by the resulting `windowFraction`, and ignores holidays outside the window.
Mirrored in teacher.js loadProgress. All 4 admin call sites pass both dates.

**UI — "📅 Periodo de Contrato (opcional)"** section with two `<input type="date">` added to:
- ⚙️ Configuración de Profesor (`editContractStart` / `editContractEnd`)
- ⚙️ Configuración de Admin (`editAdminContractStart` / `editAdminContractEnd`)
- ➕ Añadir Profesor (`addTeacherContractStart` / `addTeacherContractEnd`)
- ➕ Añadir Admin (`addAdminContractStart` / `addAdminContractEnd`)
Hint text: empty = full year; if filled, hours and leave days prorate. Saves `null` when blank,
so clearing a date restores full-year behaviour.

**Verified:** leaver scenario (Joan hypothetically ending 2026-06-30, rolled back) → window
fraction 0.5021, target 1230 → 618h, and **h/day stays 5.97** — only the total shrinks, the daily
rate is unchanged, which is the key correctness check. Existing data untouched: only Alexandra
(2026-09-14) and Maja (2026-09-21) have dates set, both with contract_end NULL.

Note: as with full-year staff, the model assumes the (prorated) holiday allocation is actually
taken inside the window — a leaver who never books their prorated days will read >100 %, same
pre-existing assumption that makes ratio hit exactly 1.0 at year end for everyone else.

Cache-bust 20260921f → **20260921g**. node --check clean on admin.js + teacher.js.

### Rocío's percentage target 1400 → 1450
`hours_adjustment` −100 → **−50**, so the progress % is measured against **1450** while everything
else (displayed figure, per-day rate, expected-to-date) stays at the nominal 1500. Data-only
change — no code touched, nothing to redeploy for the app itself.

Effect today: credited 1111.6h, shown expected-to-date 1150h (unchanged, 1500-based),
percentage **103.5 % → 100.0 %** (still green, threshold is ≥98 %).

Tracked migration 20260921110000 updated to seed −50 so a fresh `db reset` reproduces this.

### UX: "Esperado/Año" shows the annual figure again, with the prorated period as a sub-line
(commit f7ca718)
Maja's row read **"261h*"** under a column headed *Esperado/Año* — confusing, because her contract
figure is 1000h/year; 261h is what that amounts to from her 21 Sep start.

Fix: the column shows the CONTRACT's annual hours again (1000h), and partial-year staff get a small
grey sub-line explaining what it works out to. New `contractPeriodNote(start, end, prorated)`
helper renders:
- start only → `→ 261h · desde 21 sep`
- end only → `→ 618h · hasta 30 jun`
- both → `→ 900h · 1 mar – 30 nov`
- neither → nothing at all (full-year staff unchanged)
Tooltip: "Contrato parcial: las horas anuales se prorratean al periodo trabajado".

So Maja now reads: **1000h** / *→ 261h · desde 21 sep*, and the bar's 93 % + "5h esp" make sense
against the 261h target. Applied to the teacher table and the admin-workers table; the XLS export's
"Esperado" column also reverted to the nominal annual figure (the % column already reflects reality).
Verified all four note variants render correctly; full-year rows emit no sub-line.

NOT changed: teacher.js still shows the prorated target in its own "Xh / Yh" line (for Maja
"4.5h / 261h"), since on her own page 261h IS her goal and it pairs with her bar. Left alone to
avoid crowding the mobile layout — revisit if it confuses anyone.

Cache-bust 20260921g → **20260921h**. node --check clean.

### Leave days + prep time prorated by contract period; linked "% de jornada" field
(commit 7c83a6c, migration 20260921160000, cache-bust 20260921h → **20260921i**)

Two requests, one change set, both in the ⚙️ Configuración modals.

**1. 🏖️ Asignación de Permisos and Tiempo de Preparación now prorate to the contract period.**
Changing *Alta* or *Baja* refills Vacaciones / D.R. Empleado / D.R. Empresa / Visita Médica /
Permiso No Retribuido / Horas No Lectivas to the share of the year actually worked. Values stay
fully editable afterwards; days are rounded to whole days, prep to 0.1h. An amber hint under the
dates reads *"Permisos prorrateados al X% del año laborable. Puedes ajustarlos a mano."*

Two deliberate design points:
- Proration always computes from the role DEFAULTS × windowFraction, never from the field's
  current value, so editing the dates twice can't compound the discount.
- Leave **days** scale only with the period worked (Conveni Art. 23 "en proporció al temps
  treballat") — a part-timer still gets the full 31 days for a full year. Prep is measured in
  **hours**, so it scales with the jornada percentage too: `70h × jornada% × windowFraction`.
  That's why Alexandra's 59.5h (= 70h × 85%) becomes 16.8h, not 20h.

**2. New "% de jornada completa" field beside Horas Anuales Esperadas.** Two-way linked: typing
hours updates the percentage, typing a percentage updates the hours. 100% = 1230h for teachers
(convenio lectiu docent), 1530h for admins (personal d'administració). Shown as a hint under the
field. Nothing else in the calculation changed — the hours field is still the single source of truth
that gets saved.

All four modals wired: edit teacher, edit admin, add teacher, add admin. The add modals have no
Visita Médica / Permiso No Retribuido inputs, and admin modals have no prep field; the shared
`CONTRACT_FIELDS` map marks those `null` and the helpers skip them. New helpers in admin.js:
`CONTRACT_FIELDS`, `contractWindowFraction()`, `prorateAllocationFields()`, `syncHoursFromPct()`,
`syncPctFromHours()`.

**Required data backfill (migration 20260921160000).** `getTeacherProgress()` used to multiply
`allocatedDays` by `windowFraction` implicitly. That is now gone from both admin.js and teacher.js,
because the stored leave days ARE the real entitlement once the modal prorates them — doing it in
both places would double-discount. So the three existing partial-contract profiles had to be
backfilled, otherwise their FULL-year allocation would be subtracted from a partial-year working-day
count (Alexandra would have dropped from 58 to 20 working days). Old values are in the audit log via
the `audit_profiles` trigger.

| | window | was (annual/pers/school/med/unpaid/prep) | now |
|---|---|---|---|
| ALEXANDRA DINU (teacher, desde 14 sep) | 68/241 = 28.2% | 31/3/4/20/10/59.5 | 9/1/1/6/3/16.8 |
| Maja Prząda (admin, desde 1 sep) | 76/241 = 31.5% | 31/3/4/20/10 | 10/1/1/6/3 |
| SILVIA (teacher, hasta 30 jun) | 121/241 = 50.2% | 31/3/4/20/10/70 | 16/2/2/10/5/35.1 |

Maja's `contract_start` is **1 Sep**, not 21 Sep as an earlier note said — her window is 76 days
(31.5%), target 315h, 4.71 h/day.

Verified after the backfill: Joan unchanged as the control (241 working days, 206 after allocation,
1230h, 5.97 h/day, 955.3h expected-to-date). Alexandra 60 working days, 295h target, 4.91 h/day
(was 5.07 under implicit proration — the ~3% drift comes from the fixed `−3` offset in
`allocatedDays = max(0, annual−3) + personal + school` not scaling proportionally; harmless).
Maja 67 days, 315h, 4.71 h/day.

**Pre-existing quirk surfaced, not fixed:** SILVIA's window is fully in the past, so her
`passedWorkingDays` (121 − 12 holidays actually booked = 109) exceeds `totalWorkingDays`
(121 − 17 allocated = 104), giving a ratio of 1.048 and an expected-to-date of 647h against a 618h
window target. Same assumption that makes every full-year employee hit exactly 1.0 on 31 December
only if they book all their leave. Present before this change too (17.6 prorated days gave the same
result). Left alone — flag if anyone queries a leaver reading >100%.

Deploy verified: md5 of all 6 changed files identical on toyboy and locally, working tree clean,
8 `HoursPct` references (4 modals × 2 fields), `20260921i` on both the CSS `<link>` and
`APP_VERSION` in all three HTML files. `node --check` clean on admin.js, teacher.js,
supabase-config.js.

### Finding: Silvia uses the shared `contact@worldclassbcn.com` login — audit trail names "Milena"
(investigation only, no changes made — Daniel: "its ok for now, they are both the bosses")

Rocío reported Silvia can see the admin panel, but there is **no account for Silvia anywhere**.
Checked `auth.users`, `auth.identities` and `auth.sessions` in full (not filtered by name): all 31
accounts map 1:1 to a profile with the same email, and neither `silviakulikowska@gmail.com` nor
`info@worldclassbcn.com` appears in any of them. Signing in always creates an `auth.users` row, so
this is conclusive.

Daniel confirmed she signs in as **contact@worldclassbcn.com** = the **`Milena`** profile
(f8846e68, allowlisted `admin`). Corroborating evidence: that account has 0 punches and only 2 audit
edits ever (1–7 Aug), yet had a live session today from 188.84.78.87 — the same office IP as Rocío's
session. Three older stale sessions from two other IPs were never cleaned up.

Consequences, accepted for now:
- Every write Silvia makes is attributed to **"Milena"** in `audit_log`. Not separable — one
  credential, two people.
- Her own hours are never recorded. Both her profiles (`Silvi` d5e996b6 silviakulikowska@gmail.com,
  and `Silvia` 3473266e info@worldclassbcn.com) have 0 punches and 0 holiday requests since the
  9 Apr bulk import. Neither is a failed signup; they're duplicates of one person who never logged in.
- Access can't be revoked independently of Milena's.

**Correction to an earlier note in this log:** I had warned that Silvia's allowlist entry would be
orphaned when her profile linked to an auth account. Wrong — `admin_authorizations_profile_id_fkey`
is `ON UPDATE CASCADE`, so when `link_profile_by_email()` rewrites `profiles.id` the allowlist row
follows automatically. The info@ path would have worked fine.

**Audit coverage audited while in here** (for the record, nothing changed):
- Trigger `audit_trigger_fn` on `time_punches`, `holiday_requests`, `paid_hours`, `app_config`
  (INSERT+UPDATE+DELETE, tgtype 29) and `profiles` (**UPDATE only**, tgtype 17). Full old/new row
  JSON + timestamp + actor name. 46,332 rows.
- Gap 1: `audit_log` stores only the actor's profile *name* — no auth UID, no IP, no user agent. Not
  joinable to a profile after a rename.
- Gap 2: `profiles` INSERT and DELETE are unaudited, so `saveNewTeacher`, `saveNewAdmin` and
  `delete_pending_profile()` leave no trace. Deactivation IS caught (status UPDATE).
- Gap 3: one unattributed `time_punches` DELETE on 2026-08-27 20:27 (null actor = service-key write,
  probably an import script). The other 10 null-actor rows are tonight's migrations.

Offered and declined for now: add `changed_by_uid uuid` to `audit_log`; extend the profiles trigger to
INSERT/DELETE; rename the `Milena` profile to "Oficina (contact@)" so the log stops naming a specific
person for shared-account activity. Pick these up if the punch data ever goes to a real audit.
