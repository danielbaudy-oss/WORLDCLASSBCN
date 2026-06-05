# Session Log: Class Helper Assistant Build

> ⚠️ **PUSH ONLY THROUGH THE RASPBERRY PI.**
> This laptop has NO access to GitHub (github.com is blocked at the network level).
> `git push` from this machine ALWAYS fails. Every commit/push must go via the Pi:
> 1. `scp "<file>" baudy@baudypi.local:~/WORLDCLASSBCN/<file>` (one per changed file)
> 2. `ssh baudy@baudypi.local "cd ~/WORLDCLASSBCN && git add -A && git commit -m '...' && git push origin main 2>&1"`
> Note: this laptop's local git is far behind `origin` (all real pushes happen from the Pi),
> so `git log`/`git status` here do NOT reflect what's actually on GitHub.
> Full details in `.kiro/steering/pi-relay.md` and `PI-INTERACTION-GUIDE.md`.

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
