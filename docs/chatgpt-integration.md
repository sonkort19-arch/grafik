# MA Grafik — ChatGPT integration

## Current status

Stages 1–5 are implemented on the feature branch.

Supabase Edge Functions:

- `ma-grafik-api` — protected read API for schedule data.
- `ma-grafik-write-api` — protected write API for one-day schedule overrides.

The production MA Grafik frontend is not modified by these API files.

## Read API

Owner-authenticated endpoints require `Authorization: Bearer <Supabase user access token>` and the authenticated user must match the configured owner email.

- `GET /today?date=YYYY-MM-DD` — planned schedule plus actual open/close shift records.
- `GET /schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` — calculated schedule for up to 62 days.
- `GET /employee?name=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD` — one employee schedule.
- `GET /employees?date=YYYY-MM-DD` — active employees and assignments for a date.

The read API normalizes the raw `ma_schedule_config.settings` before calculating the schedule so removed staff, staff changes, fixed rotations and day overrides are applied consistently with MA Grafik.

## Write API

The write function is deployed with platform JWT verification enabled and also verifies that the authenticated email is the configured owner.

Available commands:

- `POST /preview-change` — validate a proposed one-day override without saving it.
- `POST /apply-change` — save the override only when `confirm: true` is provided.

Required write fields:

- `date`
- `service`
- `expectedConfigUpdatedAt` from the read API
- `expectedCurrent.manager` and `expectedCurrent.master` from the read API
- `target.manager` and `target.master`
- `confirm: true` for the apply route

## Write safety rules

1. The write API checks `expectedConfigUpdatedAt` so a stale read cannot overwrite a newer schedule.
2. Immediately before preview/apply, it calls the read API again and verifies that `expectedCurrent` still matches the real calculated pair.
3. Only a one-day `dayOverrides` entry is changed; the base employee cycle is not rewritten.
4. The target employees are checked against the active roster and their roles.
5. Before the actual config update, a `pending` row containing `previous_settings` is stored in `ma_grafik_api_audit`.
6. If the optimistic update loses a race, the write is rejected with a conflict and the audit row is marked accordingly.
7. The audit table has RLS enabled and direct access for `anon` and `authenticated` is revoked; the Edge Function uses the service role internally.

## Remaining stages

6. Add the ChatGPT plugin/MCP tool layer and authentication wiring.
7. Run end-to-end owner-authenticated tests and final acceptance checks before merging into `main`.
