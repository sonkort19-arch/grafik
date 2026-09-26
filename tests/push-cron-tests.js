"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");

const server=fs.readFileSync("supabase/functions/ma-shifts/index.ts","utf8");
const migration=fs.readFileSync("supabase/migrations/20260926222500_schedule_ma_grafik_checks.sql","utf8");
const app=fs.readFileSync("app.js","utf8");

function check(condition,message){assert.ok(condition,message);console.log("PASS "+message);}

check(migration.includes("CREATE EXTENSION IF NOT EXISTS pg_cron") &&
      migration.includes("CREATE EXTENSION IF NOT EXISTS pg_net"),
      "Cron and HTTP extensions are enabled");
check(migration.includes("vault.create_secret") &&
      migration.includes("ma_grafik_cron_secret") &&
      migration.includes("REVOKE ALL ON FUNCTION public.ma_grafik_verify_cron_secret"),
      "Scheduler credential lives in Vault; verification is service-role only");
check(migration.includes("'*/5 * * * *'") &&
      migration.includes("'ma-grafik-shift-check-every-5-minutes'"),
      "Cron runs every five minutes");
check(server.includes('admin.rpc("ma_grafik_verify_cron_secret"') &&
      server.includes('if(!authorized) throw new Error("Неверный cron secret")'),
      "Cron rejects requests without a validated secret");
check(server.includes('from("ma_grafik_cron_runs").insert') &&
      server.includes('body.op==="scheduler-status"'),
      "Cron records successful runs and exposes authenticated diagnostics");
check(server.includes("verifyEmployeeSubscriptionPin(employee,pin)") &&
      server.includes('if(!await getAdminIfValid(req))') &&
      server.includes('body.op==="subscription-status"'),
      "Employee push registration requires identity verification and reports active state");
check(server.includes("const delivered=await sendWebPush(row,") &&
      server.includes("if(!delivered) throw new Error("),
      "Subscription reports delivery failures instead of false success");
check(server.includes('if(sent===0) await admin.from("ma_shift_alerts").delete()') &&
      server.includes('if(sent===0) await admin.from("ma_employee_reminder_alerts").delete()'),
      "Failed alert deliveries can be retried");
check(app.includes('op:"subscription-status",audience:"employee"') &&
      app.includes('op:"subscription-status",audience:"admin"') &&
      app.includes("Введите личный PIN") &&
      app.includes("Тестовое уведомление"),
      "Browser detects stale subscriptions and provides verified recovery");
check(server.includes("raw.githubusercontent.com/sonkort19-arch/grafik/ce8b50b9c2d76203b4bf49c87b6fef607bc2e9bc/schedule.js"),
      "Server does not import a mutable schedule branch");
console.log("All scheduler/push safety checks passed.");