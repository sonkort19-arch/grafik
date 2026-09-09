# Supabase OAuth 2.1 — настройка для MA Grafik ChatGPT plugin

Эти настройки выполняются один раз в Supabase Dashboard. Код приложения уже подготовлен.

## 1. Site URL

Откройте **Authentication → URL Configuration**.

Установите:

`Site URL = https://grafik-umber.vercel.app`

## 2. OAuth Server

Откройте **Authentication → OAuth Server**.

Включите **OAuth 2.1 Server**.

Установите Authorization Path:

`/oauth/consent.html`

Включите **Dynamic Client Registration**, если переключатель доступен. Это позволяет ChatGPT зарегистрироваться как OAuth-клиент автоматически.

## 3. Signing key

Проверьте JWT signing key в Authentication. Для OAuth/OIDC с `openid` используйте асимметричный ключ **RS256 или ES256**. Если проект всё ещё использует только старый симметричный HS256, сначала выполните штатную миграцию signing key в Supabase Dashboard и убедитесь, что действующее приложение продолжает авторизовываться.

Не удаляйте старый signing key до завершения штатного периода ротации Supabase.

## 4. Что уже готово в приложении

- Consent UI: `https://grafik-umber.vercel.app/oauth/consent.html`
- Public MCP: `https://grafik-umber.vercel.app/mcp`
- Protected resource metadata: `https://grafik-umber.vercel.app/.well-known/oauth-protected-resource`
- Domain challenge endpoint: `https://grafik-umber.vercel.app/.well-known/openai-apps-challenge`

## 5. Проверка после включения

1. Откройте `https://grafik-umber.vercel.app/oauth/consent.html` без `authorization_id` — страница должна загрузиться и сообщить, что подключение нужно открыть из ChatGPT.
2. Добавьте MCP в ChatGPT Developer mode по адресу `https://grafik-umber.vercel.app/mcp`.
3. ChatGPT должен открыть OAuth-поток Supabase и перенаправить на consent page.
4. Войдите существующей учётной записью владельца MA Grafik и нажмите «Разрешить».
5. После подключения проверьте `get_today` до любых write-тестов.

## 6. Write-тест

Для первого теста не меняйте реальный график сразу. Сначала выполните только `preview_schedule_change` на заранее выбранной дате. Применение `apply_schedule_change` делайте только после проверки preview и с явным подтверждением владельца.
