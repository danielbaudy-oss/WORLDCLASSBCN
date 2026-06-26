# Atlas Punch SOP (deterministic flow)

How Atlas (`supabase/functions/class-helper`) handles a **punch action** request. The goal is to
remove control-flow decisions from the LLM so the preview → confirm → execute sequence is
deterministic, not dependent on the model "choosing" to call a tool.

## 1. Intent gate (`isPunchActionIntent`)
On each incoming message, a code-level detector decides if it's a punch ACTION
("ficha junio", "fíchame como la primera semana", "registra mis horas") vs a how-to question
("¿cómo ficho?"). Accents are stripped before matching; question words (cómo/qué/puedo/cuánt…)
disqualify it. Procedural questions still go to `search_materials`.

## 2. Forced tool-calling (Gemini `mode: "ANY"`)
While a punch action is in progress, the Gemini call uses:
```
tool_config: { function_calling_config: { mode: "ANY", allowed_function_names: ["get_work_hours","add_punches"] } }
```
The model **cannot reply with prose** — it must call a tool. This makes it physically impossible
for Atlas to free-text "¿quieres que fiche?" / "¿confirmo?". It is forced to:
- read the existing schedule with `get_work_hours` when the request is "same as [day/week]", then
- call `add_punches` with `confirmed=false`, which returns `needs_confirmation` → the frontend
  shows the ✓ Confirmar / ✗ Cancelar buttons.

## 3. Drop back to AUTO after the preview
As soon as `add_punches` returns any result, `forcePunch` is set to false, so the next model turn
runs in `AUTO` mode and writes the natural-language summary that sits next to the buttons.

## 4. Execute
`confirmed=true` only runs after the user clicks Confirmar. The server still enforces all
safety checks (HH:MM format, out > in, no future, 180-day window, skip already-punched / holidays
/ school closures). No per-punch rounding — times are stored as given (manager rounds at year-end).

## Known limits / future hardening
- The intent gate is keyword-based: rare false positives/negatives possible (tune the regex).
- The confirm step still round-trips through the LLM (it reliably calls `add_punches(confirmed=true)`
  from context). A fully deterministic confirm (backend stores the resolved `pending_action` and
  executes it directly on the button click, no LLM) is the next step if needed.
