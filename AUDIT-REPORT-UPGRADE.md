# Porting the MIKAN audit-report upgrades to WorldClass

This doc hands off the audit-export improvements built for MIKAN so they can be
re-applied against the WorldClass Supabase project in a single session. It
assumes you're working in the WorldClass repo
(`https://github.com/danielbaudy-oss/WORLDCLASSBCN`) with its Supabase MCP
server connected to the WorldClass project.

---

## What MIKAN got that WorldClass still needs

1. **Postgres audit trigger captures `auth.uid()`** — so every row in
   `audit_log` records *who* made the change (resolves to `profiles.name`),
   not just a generic actor or null.
2. **Name propagation skips the audit log** — renaming a profile cascades the
   new name into `time_punches.user_id`-joined rows (or wherever
   `user_name`-style denormalized copies live). Those cascaded updates are
   suppressed from `audit_log` so they don't drown real edits.
3. **Audit report redesign** — two sheets:
   - **Fichajes**: every punch (including deleted ones), status column,
     `Punched by` column (admin vs. teacher), `Last modified` column.
   - **Auditoría**: edits and deletions only (no INSERT noise), with explicit
     `What changed / Before / After` columns in plain language.

The MIKAN reference code lives in its repo at `admin.html` inside
`exportAuditReport()`. The patterns below should be copied into WorldClass's
`js/admin.js` `exportAuditReport()`.

---

## Differences in table/column names

| Concept                  | MIKAN                    | WorldClass                               |
| ------------------------ | ------------------------ | ---------------------------------------- |
| Employee table           | `employees`              | `profiles`                               |
| Employee PK column       | `id`                     | `id` (= `auth.users.id`)                 |
| Actor link column        | `auth_user_id`           | `id` (direct match with `auth.uid()`)    |
| Punches table            | `punches`                | `time_punches`                           |
| Punch date column        | `punch_date`             | `date`                                   |
| Punch time column        | `punch_time`             | `time`                                   |
| Foreign key on punches   | `employee_id`            | `user_id`                                |
| Denormalized name column | `employee_name` (copy)   | *none — reads from `profiles` via join*  |
| Holiday requests         | `holidays`               | `holiday_requests`                       |

Because WorldClass doesn't denormalize names into child tables, the
`propagate_name` noise problem is smaller there — the only "noise" is if
someone edits `profiles.name`, which only hits the `profiles` audit row
itself. Keep that in mind when writing the filter.

---

## Step 1 — Postgres migration

Apply this to the WorldClass database via the Supabase MCP's
`apply_migration` action. It only touches the audit trigger and grants — no
schema changes. Safe to re-run.

```sql
-- Capture the authenticated user on every audit entry and resolve their name
-- via profiles.id = auth.users.id.
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $fn$
DECLARE
  v_uid   UUID;
  v_actor TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT name INTO v_actor FROM public.profiles WHERE id = v_uid LIMIT 1;
    IF v_actor IS NULL THEN v_actor := 'auth:' || v_uid::text; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_actor, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_actor, NOW());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_actor, NOW());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth;
```

**Verify** with a quick smoke-test: edit a punch in the UI, then
`SELECT changed_by, action, old_data->>'time', new_data->>'time' FROM audit_log WHERE table_name='time_punches' ORDER BY changed_at DESC LIMIT 3;`

You should see the signed-in user's name, not NULL.

---

## Step 2 — Rewrite `exportAuditReport()` in `js/admin.js`

The existing function in WorldClass builds a two-sheet Excel XML with raw
JSON in Old/New columns. Replace its body with the MIKAN pattern adapted to
WorldClass field names:

```javascript
async function exportAuditReport() {
  showToast('Generando informe de auditoría...', 'success');
  try {
    // Fetch everything in parallel
    var [pR, aR, proR] = await Promise.all([
      db.from('time_punches').select('*, profiles!time_punches_user_id_fkey(name, email)')
        .order('date', { ascending: false }).order('time', { ascending: false }),
      db.from('audit_log').select('*').order('changed_at', { ascending: false }),
      db.from('profiles').select('id, name, email')
    ]);
    var punches = pR.data || [];
    var profileMap = {};
    (proR.data || []).forEach(function (p) { profileMap[p.id] = p; });
    var now = new Date().toLocaleString('es-ES');

    // Map: record_id -> { by, at } for the first INSERT, and the latest UPDATE
    var creatorMap = {}, lastEditMap = {};
    (aR.data || []).forEach(function (a) {
      if (a.table_name !== 'time_punches') return;
      if (a.action === 'INSERT' && !creatorMap[a.record_id]) {
        creatorMap[a.record_id] = { by: a.changed_by || '', at: a.changed_at };
      }
      if (a.action === 'UPDATE') {
        var prev = lastEditMap[a.record_id];
        if (!prev || a.changed_at > prev.at) {
          lastEditMap[a.record_id] = { by: a.changed_by || '', at: a.changed_at };
        }
      }
    });

    // Audit trail: edits and deletions only (INSERTs are already on the
    // Fichajes sheet).
    var auditRows = (aR.data || []).filter(function (a) {
      if (a.action === 'INSERT') return false;
      if (a.action === 'DELETE') return true;
      // UPDATE: drop rows where nothing meaningful changed (e.g. just
      // profiles.updated_at or similar timestamps).
      if (a.action === 'UPDATE' && a.old_data && a.new_data) {
        var keys = new Set([].concat(Object.keys(a.old_data), Object.keys(a.new_data)));
        var meaningful = false;
        keys.forEach(function (k) {
          if (k === 'updated_at' || k === 'created_at') return;
          if (JSON.stringify(a.old_data[k]) !== JSON.stringify(a.new_data[k])) meaningful = true;
        });
        return meaningful;
      }
      return true;
    });

    // Human-readable change summary: { what, before, after }
    function summarize(a) {
      if (a.action === 'INSERT') {
        var n = a.new_data || {};
        if (a.table_name === 'time_punches') return { what: (n.punch_type || '') + ' fichaje creado', before: '—', after: n.date + ' ' + (n.time || '').substring(0, 5) };
        if (a.table_name === 'holiday_requests') return { what: 'Solicitud creada (' + (n.type || '') + ')', before: '—', after: n.start_date + ' → ' + n.end_date };
        return { what: 'Registro creado', before: '—', after: '' };
      }
      if (a.action === 'DELETE') {
        var o = a.old_data || {};
        return { what: 'Eliminado permanentemente', before: JSON.stringify({ id: o.id, name: o.user_name || o.name }), after: '—' };
      }
      // UPDATE — surface the single most important changed field
      var o = a.old_data || {}, n = a.new_data || {};
      // WorldClass uses hard delete on time_punches — no is_deleted flag
      if (o.time != null && n.time != null && o.time !== n.time) {
        return {
          what: 'Hora de fichaje editada',
          before: (o.time || '').substring(0, 5),
          after: (n.time || '').substring(0, 5) + (n.edit_reason ? ' — motivo: "' + n.edit_reason + '"' : '')
        };
      }
      if (o.punch_type && n.punch_type && o.punch_type !== n.punch_type) {
        return { what: 'Tipo cambiado', before: o.punch_type, after: n.punch_type };
      }
      if (o.status && n.status && o.status !== n.status) {
        return { what: 'Estado cambiado', before: o.status, after: n.status };
      }
      if (o.name && n.name && o.name !== n.name) return { what: 'Usuario renombrado', before: o.name, after: n.name };
      if ((o.email || '') !== (n.email || '')) return { what: 'Email cambiado', before: o.email || '(ninguno)', after: n.email || '(ninguno)' };
      if (o.role && n.role && o.role !== n.role) return { what: 'Rol cambiado', before: o.role, after: n.role };
      return { what: 'Modificado', before: JSON.stringify(o).substring(0, 200), after: JSON.stringify(n).substring(0, 200) };
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function cell(v, style) { return '<Cell' + (style ? ' ss:StyleID="' + style + '"' : '') + '><Data ss:Type="String">' + esc(v) + '</Data></Cell>'; }

    var xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>'
      + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'
      + '<Styles>'
      +   '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#FFFFFF"/><Interior ss:Color="#092b50" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'
      +   '<Style ss:ID="header"><Font ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/><Interior ss:Color="#092b50" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'
      +   '<Style ss:ID="header2"><Font ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/><Interior ss:Color="#8b5cf6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'
      +   '<Style ss:ID="edited"><Interior ss:Color="#fef3c7" ss:Pattern="Solid"/></Style>'
      +   '<Style ss:ID="deleted"><Interior ss:Color="#fee2e2" ss:Pattern="Solid"/><Font ss:Italic="1"/></Style>'
      +   '<Style ss:ID="info"><Interior ss:Color="#f1f5f9" ss:Pattern="Solid"/><Font ss:Size="9"/></Style>'
      +   '<Style ss:ID="small"><Font ss:Size="9"/><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>'
      + '</Styles>';

    // === FICHAJES SHEET =================================================
    xml += '<Worksheet ss:Name="Fichajes"><Table>';
    xml += '<Row><Cell ss:StyleID="title" ss:MergeAcross="10"><Data ss:Type="String">📊 REGISTRO DE FICHAJES — WorldClass BCN</Data></Cell></Row>';
    xml += '<Row><Cell ss:StyleID="info" ss:MergeAcross="5"><Data ss:Type="String">Exportado: ' + esc(now) + '</Data></Cell><Cell ss:StyleID="info" ss:MergeAcross="4"><Data ss:Type="String">Total: ' + punches.length + ' registros</Data></Cell></Row>';
    var headers1 = ['Empleado', 'Email', 'Fecha', 'Hora', 'Tipo', 'Estado', 'GPS Lat', 'GPS Lng', 'Fichado por', 'Creado', 'Última modificación'];
    xml += '<Row>' + headers1.map(function (h) { return '<Cell ss:StyleID="header"><Data ss:Type="String">' + h + '</Data></Cell>'; }).join('') + '</Row>';
    punches.forEach(function (p) {
      var status = p.edit_reason ? 'Editado' : 'Activo';    // time_punches doesn't soft-delete; if it's here it's active
      var style = p.edit_reason ? 'edited' : '';
      var creator = (creatorMap[p.id] && creatorMap[p.id].by) || (p.profiles ? p.profiles.name : '') || '';
      var lastEdit = lastEditMap[p.id];
      var lastEditStr = lastEdit ? new Date(lastEdit.at).toLocaleString('es-ES') + ' — ' + (lastEdit.by || '?') : '';
      xml += '<Row>'
        + cell(p.profiles ? p.profiles.name : '?', style)
        + cell(p.profiles ? p.profiles.email : '', style)
        + cell(p.date, style)
        + cell((p.time || '').substring(0, 5), style)
        + cell(p.punch_type, style)
        + cell(status, style)
        + cell(p.latitude, style)
        + cell(p.longitude, style)
        + cell(creator, style)
        + cell(new Date(p.created_at).toLocaleString('es-ES'), style)
        + cell(lastEditStr, style)
        + '</Row>';
    });
    xml += '</Table></Worksheet>';

    // === AUDITORIA SHEET ================================================
    xml += '<Worksheet ss:Name="Auditoría"><Table>';
    xml += '<Row><Cell ss:StyleID="title" ss:MergeAcross="6"><Data ss:Type="String">🔍 REGISTRO DE AUDITORÍA — Inalterable</Data></Cell></Row>';
    xml += '<Row><Cell ss:StyleID="info" ss:MergeAcross="3"><Data ss:Type="String">Total: ' + auditRows.length + ' eventos</Data></Cell><Cell ss:StyleID="info" ss:MergeAcross="2"><Data ss:Type="String">Generado por triggers de Postgres</Data></Cell></Row>';
    var headers2 = ['Fecha/Hora', 'Tabla', 'Evento', 'Realizado por', 'Qué cambió', 'Antes', 'Después'];
    xml += '<Row>' + headers2.map(function (h) { return '<Cell ss:StyleID="header2"><Data ss:Type="String">' + h + '</Data></Cell>'; }).join('') + '</Row>';
    if (!auditRows.length) {
      xml += '<Row><Cell ss:MergeAcross="6"><Data ss:Type="String">✅ No se han registrado modificaciones ni eliminaciones</Data></Cell></Row>';
    } else {
      auditRows.forEach(function (a) {
        var style = a.action === 'DELETE' ? 'deleted' : 'edited';
        var who = a.changed_by || (profileMap[a.changed_by] ? profileMap[a.changed_by].name : '') || 'Sistema';
        var label = a.action === 'UPDATE' ? 'Modificado' : 'Eliminado';
        var s = summarize(a);
        xml += '<Row>'
          + cell(new Date(a.changed_at).toLocaleString('es-ES'), style)
          + cell(a.table_name, style)
          + cell(label, style)
          + cell(who, style)
          + cell(s.what, style || 'small')
          + cell(s.before, style || 'small')
          + cell(s.after, style || 'small')
          + '</Row>';
      });
    }
    xml += '</Table></Worksheet></Workbook>';

    var blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var d = new Date();
    a.download = 'WorldClass_audit_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.xls';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Informe exportado', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
```

### Things to double-check when pasting

1. WorldClass's old function lives inside the big monolithic `js/admin.js`
   — replace the whole `async function exportAuditReport()` body, keep the
   function name (the Export button wiring is unchanged).
2. Confirm `time_punches` has `edit_reason` and `edited_at` columns. If it
   has `is_deleted` / `deleted_reason` the soft-delete branch from MIKAN
   can be copied over too — look for this block in MIKAN's admin.html:
   ```js
   if (o.is_deleted === false && n.is_deleted === true) {
     return { what: 'Marcado como eliminado', before: (o.time||'').substring(0,5) + ' · activo', after: 'eliminado — motivo: "' + (n.deleted_reason||'') + '"' };
   }
   ```
3. If WorldClass has a `user_name` denormalized column anywhere (some
   projects added it after the fact), add `user_name` to the filter's
   ignore-list alongside `updated_at`/`created_at`.

---

## Step 3 — Sanity-check & deploy

1. Run the migration via Supabase MCP against the WorldClass project.
   Confirm the MCP is on WorldClass, not MIKAN, with
   `mcp_supabase_get_project_url` first.
2. Edit a test punch in the UI. Export the audit report. Verify:
   - The "Realizado por" column shows the signed-in user's name.
   - The edit appears on the Auditoría sheet as "Hora de fichaje editada"
     with readable Antes / Después values.
   - The original creation does **not** appear on the Auditoría sheet.
   - The Fichajes sheet shows "Fichado por" (original actor) and
     "Última modificación" (if edited).
3. Commit and push to `main`, GitHub Pages deploys in ~1 min.

---

## Reference: related MIKAN commits

- `f943fde` — first audit export rewrite (status columns, readable change descriptions, filtered noise)
- `fe46069` — explicit Before/After/What columns instead of raw JSON
- `4c16c55` — Audit Trail = edits+deletes only, Punches sheet gains "Punched by" + "Last modified"

Search those commits at https://github.com/danielbaudy-oss/MIKAN/commits/main
for the exact diff if anything above is unclear.
