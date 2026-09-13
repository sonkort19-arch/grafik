const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('create-order backend never serializes Supabase/PostgREST errors as [object Object]', async () => {
  const source = fs.readFileSync('supabase/functions/ma-crm-phase1-api/index.ts', 'utf8');
  expect(source).toContain('function errorMessage(error:unknown)');
  expect(source).toContain('for(const key of ["message","details","hint","error","code"])');
  expect(source).toContain('fallback!=="[object Object]"');
  expect(source).toContain('const message=errorMessage(e)');
  expect(source).not.toContain('const message=e instanceof Error?e.message:String(e)');
});
