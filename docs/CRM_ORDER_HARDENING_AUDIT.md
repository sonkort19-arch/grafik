# MA CRM — аудит и журнал production hardening модуля заказов

Дата: 2026-09-13
Ветка: `crm-orders-production-hardening`
PR: #59

## Этап 1 — полный аудит

### Найдено
- Старый `crm.js` сам открывал, рисовал, обновлял и повторно открывал карточку заказа, одновременно с новыми order-модулями.
- В исторических патчах карточкой управляли несколько независимых модулей и DOM observers.
- Категории услуг были зашиты в JS.
- Семантика себестоимости услуги была временно искажена через `item_type=part`.
- У позиций не хватало скидки, исполнителя и ссылки на каталог.
- У платежей не было серверной idempotency и бизнес-категории.
- Не было единого append-only `order_events`.
- Зарплата рассчитывалась из текущих настроек, а не из snapshot начислений.
- Статусы были ограничены check constraint.
- Печать существовала в нескольких местах.
- Склад уже использовал рабочую модель immediate write-off + возврат при удалении позиции.

### Целевая архитектура
`MAOrderController` — единственный владелец жизненного цикла карточки:
- `open(id)`
- `close()`
- `refresh()`
- `updateSnapshot(patch)`
- `registerRenderer(fn)`
- `registerSection(name, loader)`
- `refreshSection(name)`
- request token + AbortController
- section cache

События:
- `ma:order:opening`
- `ma:order:loaded`
- `ma:order:ready`
- `ma:order:changed`
- `ma:order:section-changed`
- `ma:order:error`
- `ma:order:closed`

Результат: завершён.

## Этап 2 — единый OrderController

### Изменено
- Controller теперь сам владеет `open/close/refresh`.
- Добавлены request token и `AbortController`.
- Добавлены section loaders/cache/controllers.
- Быстрое A→B не позволяет позднему A перезаписать B.
- Закрытие карточки отменяет активные запросы.
- Core `crm.js` больше не содержит `openRepair`, `repairDetailHtml`, `setRepairStatus` или `saveRepairChanges`; список заказов делегирует открытие `MAOrderController`.

### Проверено
- Behavioral regression test: A→B, close during load, reopen, section race.
- CI run #302: success.

Результат: завершён.

## Этап 3 — компактная карточка заказа

### Изменено
- Full-screen mobile order на iPhone.
- Номер заказа, сумма, крупный текущий статус.
- Вкладки: Общая информация / Товары и услуги / Платежи / История / Файлы.
- Редактирование скрыто за кнопкой «Изменить».
- Итог заказа readonly и помечен как производный от позиций.
- Контролы iPhone не меньше 16px, touch targets адаптированы.
- Order DOM не обслуживается MutationObserver.

Результат: завершён на branch/Preview; финальный device smoke после backend preview.

## Этап 4 — товары и услуги

### Изменено
- Добавлены DB-backed `ma_crm_service_categories` и `ma_crm_service_catalog`.
- Item picker получает категории и услуги с сервера, а не из JS.
- Поддерживаются service/part, название, количество, цена, себестоимость, скидка, исполнитель, service catalog id и inventory product id.
- Формула: revenue = qty × price − discount; cost = qty × unit_cost; profit = revenue − cost.
- `final_price` определён как кеш производной суммы позиций.
- Добавлена idempotency позиции.
- Складской товар выбирается из реального остатка точки.

Результат: код и миграции готовы; требуется DB preview.

## Этап 5 — платежи и кассы

### Изменено
- Платёж остаётся отдельной сущностью, связан с order/cashbox/customer.
- Добавлены payment category и idempotency key.
- Категории: deposit/payment/additional/final/refund/deposit_refund.
- Серверный RPC `ma_crm_add_order_payment` защищает double-submit.
- Остаток считается из order total и net payments/refunds.
- Операция требует корректную кассу выбранной точки и метода оплаты.

Результат: код и миграции готовы; требуется DB preview.

## Этап 6 — статусы как бизнес-процесс

### Изменено
- Добавлен `ma_crm_status_definitions` с actions и системными статусами.
- Старый фиксированный status check заменяется FK на каталог статусов, чтобы архитектура поддерживала пользовательские статусы.
- Обычные переходы идут через транзакционный status RPC.
- `Выдан` остаётся отдельным атомарным workflow: проверка остатка → финальная оплата → issued timestamps → status history/events → payroll snapshot.
- Отмена окна выдачи не меняет статус.

Результат: код и миграции готовы; требуется DB preview.

## Этап 7 — зарплата

### Изменено
- Добавлен `ma_crm_payroll_entries`.
- Snapshot начисления создаётся при выдаче и не пересчитывает старый заказ после изменения процента.
- Поддержана привязка к repair item, basis amount, percent/fixed amount, role, entry type, config snapshot.
- Поддержаны service compensation rules.
- Order payroll panel читает snapshot entries.

Результат: код и миграции готовы; требуется DB preview.

## Этап 8 — история заказа

### Изменено
- Добавлен append-oriented `ma_crm_order_events`.
- История включает order creation, status, payment/refund, item changes, files и warranty relation.
- Source id + unique index делают повторную запись идемпотентной.
- DB triggers гарантируют запись создания заказа, платежа и файла даже через совместимый старый API path.
- UI «История» работает через controller section.

Результат: код и миграции готовы; требуется DB preview.

## Этап 9 — файлы, документы и гарантия

### Изменено
- Файлы продолжают храниться в private Supabase Storage с signed URLs и MIME/size validation.
- Новый `crm-order-documents.js` является активным единым генератором квитанции/акта.
- Документы берут текущие items, discounts, totals, payment state и warranty из order snapshot/commerce section.
- Issue flow делегирует печать этому же генератору.
- Warranty создаёт отдельный заказ с `warranty_parent_id` и причиной.

### Технический долг
- Старый print helper физически ещё остаётся внутри `crm-final.js`, но capture-listener нового генератора уже блокирует его выполнение. Удалять его будем только после функционального preview печати.

Результат: функционально готов на branch; физический cleanup после preview.

## Этап 10 — склад

### Выбранная модель
Immediate write-off.

### Существующая и сохранённая защита
- `SELECT ... FOR UPDATE` по остатку.
- Списание только при подтверждённом добавлении inventory-backed позиции.
- Отрицательный остаток блокируется.
- Изменение складской позиции in-place блокируется — удалить и добавить заново.
- DELETE trigger восстанавливает остаток и пишет `repair_return` movement.
- Item idempotency защищает двойной submit; при конфликте компенсирующий delete возвращает вторичное списание.

Результат: код готов; требуется DB preview/stress test.

## Этап 11 — надёжность

### Автоматически покрыто
- A→B race.
- Close during load.
- Reopen.
- Competing section requests.
- AbortController/timeouts.
- Double-submit idempotency guards для item/payment.
- Отсутствие order MutationObserver loops.
- Отсутствие whole-page reload в order actions.

### Остаётся для device preview
- реальный iPhone keyboard/orientation/PWA resume;
- печать popup;
- upload/delete file;
- реальные authenticated flows на отдельной DB branch без production данных.

Результат: автоматическая часть завершена; device/backend preview ожидается.

## Этап 12 — автоматические tests

Добавлены/усилены:
- `tests/crm-order-v2-tests.js`
- `tests/crm-order-controller-tests.js`
- stability gates
- JS syntax checks
- Deno check `ma-crm-order-api`
- существующие MA График regression suites продолжают запускаться.

Последний подтверждённый GitHub Actions: run #302 — success.

Результат: завершён для текущего head.

## Этап 13 — cleanup

### Удалено / отключено
- `crm-order-stability.js`
- `crm-service-cost.js`
- legacy order lifecycle из `crm.js`
- старые order MutationObserver paths
- manual writable `final_price` в новой карточке

### Не удалено преждевременно
- старые production edge functions остаются, пока main/production ещё используют совместимый путь;
- legacy print helper в `crm-final.js` физически оставлен до functional print preview;
- активные CSS зависимости не удаляются по имени.

Результат: основная уборка завершена; финальная физическая уборка после preview smoke.

## Этап 14 — Preview / Production

### Выполнено
- отдельная branch создана;
- PR #59 открыт как draft;
- GitHub CI зелёный;
- Vercel Preview для изменённого frontend-кода достигает `READY`.

### Блокер перед backend E2E
У Supabase-проекта сейчас нет development branches. Hardening migrations и новый `ma-crm-order-api` намеренно не применяются прямо к production без отдельного preview database. Создание Supabase development branch является отдельной тарифицируемой операцией и требует явного подтверждения стоимости владельцем.

Production остаётся без этих hardening migrations до безопасного DB preview.

## Источник истины после hardening
- Итог заказа: сумма `repair_items` после скидок. `repairs.final_price` — кеш производного значения.
- Оплачено: payment minus refund из `ma_crm_payments`.
- Остаток: `order_total - net_paid`.
- Прибыль: revenue − cost, где revenue учитывает скидку.
- Семантический тип позиции: `service` / `part`.
- Зарплата прошлого заказа: `ma_crm_payroll_entries`, а не текущие проценты.
- Склад: immediate write-off для inventory-backed part; удаление позиции возвращает остаток.
