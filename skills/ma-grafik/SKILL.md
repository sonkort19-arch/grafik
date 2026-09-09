---
name: ma-grafik
description: Use MA Grafik to inspect staff schedules, shifts, employee assignments, and to preview or apply one-day schedule replacements when the user explicitly asks.
---

# MA Grafik

Use the MA Grafik MCP tools as the source of truth for current schedule information. Do not answer current staffing questions from memory when the tools are available.

## Reading schedules

- Use `get_today` for a single day and for today's shift state.
- Use `get_schedule` for a date range.
- Use `get_employee_schedule` for one employee across a period.
- Use `get_employees` to inspect the active roster for a date.
- Present service names, dates, manager, and master exactly as returned by the tools.
- If the tool reports a conflict, missing assignment, or unavailable employee, surface it instead of inventing a replacement.

## Changing a schedule

Changes are intentionally limited to a single-day override.

Always follow this sequence:

1. Read the current schedule for the affected date using `get_today` or `get_schedule`.
2. Capture the returned `configUpdatedAt` and the current manager/master pair.
3. Call `preview_schedule_change` with the intended target pair and a short reason.
4. Show the user the before/after change clearly.
5. Call `apply_schedule_change` only when the user's request clearly authorizes applying that exact change. Pass `confirm: true` only then.
6. After a successful write, read the affected date again and verify the new assignment.

If the API reports that the schedule version changed, stop the write flow, reread the date, and create a fresh preview. Never force an outdated change.

## Safety rules

- Never modify the base employee cycles when a one-day override satisfies the request.
- Never silently substitute an employee who is not in the active roster returned by MA Grafik.
- Never bypass the preview/version check.
- Never expose authentication tokens, database secrets, PIN hashes, device keys, or internal credentials.
- Do not use the write tool for hypothetical questions, planning, examples, or when the user says not to change anything.
