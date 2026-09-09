# MA Grafik — материалы для OpenAI Plugin submission

## Карточка

- Name: `МА График`
- Category: `Productivity`
- Short description: `График сотрудников и безопасные замены`
- Website: `https://grafik-umber.vercel.app/plugin/`
- Support: `https://grafik-umber.vercel.app/plugin/support.html`
- Privacy: `https://grafik-umber.vercel.app/plugin/privacy.html`
- Terms: `https://grafik-umber.vercel.app/plugin/terms.html`
- Universal MCP URL: `https://grafik-umber.vercel.app/mcp`
- OAuth issuer / authorization server: `https://yedzfmibceboncrytbqz.supabase.co/auth/v1`
- Required OAuth scopes: `openid email`

## MCP tools

1. `get_today` — readOnly=true, destructive=false, openWorld=false.
2. `get_schedule` — readOnly=true, destructive=false, openWorld=false.
3. `get_employee_schedule` — readOnly=true, destructive=false, openWorld=false.
4. `get_employees` — readOnly=true, destructive=false, openWorld=false.
5. `preview_schedule_change` — readOnly=true, destructive=false, openWorld=false.
6. `apply_schedule_change` — readOnly=false, destructive=false, openWorld=false. Writes only to the private MA Grafik schedule and does not change public internet state.

## Positive test cases

### 1. Today
Prompt: `Кто сегодня работает в Мобе и Нове?`
Expected: call `get_today`; return date plus manager/master for both services and any actual shift state. Do not answer from memory.

### 2. Date range
Prompt: `Покажи график сотрудников на следующую неделю.`
Expected: call `get_schedule` for the requested dates; return each date and assignments for both services.

### 3. Employee
Prompt: `Покажи график Олега на ближайшие две недели.`
Expected: call `get_employee_schedule`; return work/off days and service/role assignments where present.

### 4. Preview only
Prompt: `На 12 сентября замени мастера в Мобе на Георгия, но пока ничего не меняй.`
Expected: first read the affected date, then call `preview_schedule_change`. Show before/after. Do not call `apply_schedule_change`.

### 5. Confirmed one-day change
Prompt: `Сделай эту замену на 12 сентября.` after a matching preview.
Expected: use the exact current `configUpdatedAt` and pair from the read/preview, call `apply_schedule_change` with `confirm=true`, then read the date again and verify the result. Result includes success/failure; never claim success after an error.

## Negative test cases

### 1. No authorization to write
Scenario: user asks a hypothetical question or says `пока ничего не меняй`.
Expected: no `apply_schedule_change`; preview/read only.
Reason: write action is not authorized.

### 2. Stale configuration
Scenario: schedule changed after the preview and the caller submits the old `configUpdatedAt`.
Expected: conflict/error; no schedule modification. Reread before offering a new preview.
Reason: prevents overwriting newer owner/admin changes.

### 3. Invalid employee or role
Scenario: target employee is not active for that date or a master is supplied as manager where the business rule does not allow it.
Expected: validation error; no schedule modification.
Reason: prevents invalid assignments.

## Release notes

Initial MA Grafik ChatGPT integration: authenticated schedule reads, employee schedule lookup, safe preview of one-day overrides, confirmed writes with optimistic locking, revalidation immediately before write, and audit backup before every applied change.

## Manual portal-only steps

These cannot be completed from repository code alone:

1. Verify developer/business identity in OpenAI Platform.
2. Ensure the submitting account has Apps Management Write permission.
3. Enable Supabase OAuth 2.1 Server and Dynamic Client Registration.
4. Configure Supabase Site URL as `https://grafik-umber.vercel.app` and Authorization Path as `/oauth/consent.html` (or equivalent route matching the deployed page).
5. When OpenAI gives the domain-verification token, expose that exact token at `/.well-known/openai-apps-challenge` using `OPENAI_APPS_CHALLENGE` or a temporary code update.
6. Provide reviewer credentials/fixture account that works without MFA, SMS, or email confirmation if OpenAI requests authenticated review access.
7. Scan Tools, verify metadata, add these test cases, submit for review.
