# MA Grafik — ChatGPT integration

## Current status

Stage 1: read-only API.

Supabase Edge Function: `ma-grafik-api`.

The production MA Grafik frontend is not changed by this branch.

## Public service endpoints

- `GET /health` — service status only, no business data.
- `GET /capabilities` — list of available read-only commands, no business data.

## Owner-authenticated endpoints

All data endpoints require `Authorization: Bearer <Supabase user access token>` and the authenticated user must match the configured owner email.

- `GET /today?date=YYYY-MM-DD` — planned schedule plus actual open/close shift records.
- `GET /schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` — calculated schedule for up to 62 days.
- `GET /employee?name=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD` — one employee schedule.
- `GET /employees?date=YYYY-MM-DD` — active employees and assignments for a date.

## Important design rule

The API normalizes the raw `ma_schedule_config.settings` before calculating the schedule. This mirrors MA Grafik behavior: removed staff, staff changes, fixed master rotation, manager rules and day overrides must be applied before data is returned to ChatGPT.

## Next stages

1. Verify authenticated calls with the owner Supabase session.
2. Add OpenAPI/MCP tool definitions for ChatGPT.
3. Connect owner authentication to the ChatGPT plugin.
4. Add write commands only after read commands are verified.
5. For write commands, add conflict checks, audit logging and confirmation-sensitive operations.
