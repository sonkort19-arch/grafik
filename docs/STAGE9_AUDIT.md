# MA График — этап 9: финальная проверка и очистка

Точка старта и отката: `cdf071d6d36f040b4bc2d7ac36664511217154f5` (`checkpoint/pre-stage-9-20260912`).

## Цель
Завершить редизайн без изменения бизнес-логики: провести финальную техническую проверку, убрать только подтверждённые дубли, закрепить единый визуальный контракт MA График / MA CRM и усилить production-smoke.

## Что изменяется
- `styles.css`: финальный entry-point остаётся из трёх уже проверенных слоёв; добавлены только светлая системная тема, единый focus и iPhone 16px input guard. Новый `styles-stage9.css` специально не создаётся.
- `crm-final.css`: финальный светлый режим, единый focus и централизованный iPhone input guard.
- `crm-final-legacy.css`: удалён только дублирующий 16px input guard. Остальные legacy-правила сохранены, потому что там всё ещё есть рабочие стили drawer/modal/mobile.
- `tests/redesign-final-check.js`: автоматический контракт финального редизайна.
- `.github/workflows/ma-tests.yml`: финальный guard включён в CI, production-smoke теперь отдельно проверяет финальные CSS entry-points и синюю иконку помощника.

## Что намеренно НЕ удаляется
- `styles-legacy.css` — всё ещё содержит базовые стили рабочих компонентов, которые не полностью заменены новыми слоями.
- `crm-final-legacy.css` — содержит действующие drawer/modal/iPhone safeguards.
- старый `assets/ma-assistant-icon.svg` — пока остаётся как compatibility resource, потому что текущий runtime помощника всё ещё содержит ссылку на него; финальный визуальный слой уже использует синюю MA-иконку.

Удалять эти файлы целиком без отдельного доказательства не считается безопасной очисткой.

## Финальный визуальный контракт
- Основной акцент: `#246BFD`.
- Светлая тема закреплена для нативных элементов браузера.
- На iPhone поля ввода не должны вызывать Safari zoom.
- Keyboard focus должен быть видимым и одинаковым.
- MA График загружает: shell → core modules → remaining UI.
- MA CRM загружает: compatibility styles → stage 7 redesign.

## Финальные проверки
1. Structural stability gates.
2. JavaScript syntax.
3. MA Grafik regression suite.
4. Assistant parser/robustness/date/routing/launcher/mobile tests.
5. CRM regression checks.
6. Final redesign guard.
7. Deno checks protected Supabase Functions.
8. Vercel Preview READY + HTTP smoke.
9. После merge: Production READY + production smoke.
10. Runtime error/fatal log check.

## Условие завершения
Этап 9 считается завершённым только после успешного PR CI, Preview, merge, Production deployment и production smoke. После этого редизайн 1–9 закрывается.
