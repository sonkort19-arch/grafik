# MA CRM — аудит модуля заказов перед production hardening

Дата: 2026-09-13
Ветка: `crm-orders-production-hardening`

## Текущее состояние

### Уже хорошо
- Есть `MAOrderController` и событийный lifecycle без старых DOM-observer-модулей.
- Заказ связан с клиентом, позициями, платежами, историей статусов, файлами и гарантией.
- Есть атомарное создание заказа, атомарная выдача, складские RPC и автоворот товара при удалении складской позиции.
- Есть отдельные кассы по точкам и способам оплаты.
- Есть мобильная компактная карточка и bottom sheet добавления позиции.
- Есть CI и production smoke.

### Найденные архитектурные долги
1. `MAOrderController` пока не владеет `open/refresh`: фактическую загрузку и первичный render делает `crm.js`, а controller перехватывает `fetch`.
2. `crm.js` после изменения статуса/заказа заново открывает карточку через `openRepair(id)`, что создаёт лишние полные циклы загрузки.
3. `crm-phase1.js` грузит позиции/платежи отдельным запросом после базовой карточки; controller не владеет section loaders/cache.
4. `crm-item-picker.js` содержит категории услуг прямо в JS; каталога услуг и категорий в БД нет.
5. Себестоимость услуги реализована через временную совместимость `display_type=service`, но `item_type=part`, если себестоимость > 0. Это искажает семантику данных и отчётов.
6. У позиций нет скидки, исполнителя и ссылки на каталог услуги.
7. Платежи не имеют idempotency key и бизнес-категории (предоплата/доплата/финальная оплата/возврат предоплаты). Double-submit защищён только UI-кнопкой, не БД.
8. Платёж напрямую связан с заказом и кассой, но customer_id не фиксируется в самой операции.
9. Нет единого append-only `order_events`; сейчас есть только история статусов.
10. Зарплата рассчитывается динамически по текущим процентам. Нет snapshot начислений, поэтому изменение процента способно изменить расчёт прошлого периода.
11. Статусы зашиты в код и check constraint; нет таблицы метаданных статусов и действий.
12. Печать реализована в двух местах (`crm-issue.js` и `crm-final.js`), то есть есть два конкурирующих генератора документов.
13. Складская модель — immediate write-off при добавлении складского товара. Модель рабочая, но item picker пока не выбирает реальные складские товары.
14. У item/payment/server mutations нет единого event log, поэтому аудит изменений неполный.
15. У controller нет AbortController для быстрого A→B→C открытия и закрытия во время загрузки.

## Целевая архитектура

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

## Модель данных, которую добавляем обратно-совместимо

- `ma_crm_service_categories`
- `ma_crm_service_catalog`
- новые поля `ma_crm_repair_items`: discount, executor, service_catalog_id
- новые поля `ma_crm_payments`: category, customer_id, idempotency_key
- `ma_crm_order_events`
- `ma_crm_payroll_entries` как immutable-ish snapshots
- `ma_crm_status_definitions` для метаданных/будущих пользовательских статусов
- `ma_crm_document_templates` для будущих шаблонов

## Источник истины

- Итог заказа: сумма `repair_items` после скидок. `repairs.final_price` — кеш производного значения.
- Оплачено: сумма payment minus refund из `ma_crm_payments`.
- Остаток: `order_total - net_paid`.
- Прибыль: `revenue - cost`, где revenue учитывает скидку.
- Семантический тип позиции хранится честно в `item_type` (`service`/`part`); `display_type` остаётся только для backward compatibility.
- Зарплата прошлого заказа берётся из `ma_crm_payroll_entries`, а не пересчитывается задним числом текущими процентами.
- Склад: immediate write-off для inventory-backed part; удаление позиции возвращает остаток.

## Стратегия внедрения

1. Additive migration + regression guards.
2. Controller ownership + abort/race protection.
3. Section API/cache and compact UI tabs.
4. Service catalog + product inventory picker.
5. Idempotent payments.
6. Transaction-safe statuses / issue flow.
7. Payroll snapshots.
8. Unified order events.
9. One document generator + files/warranty.
10. Inventory integration tests.
11. Stress guards.
12. CI.
13. Cleanup.
14. Preview → PR → production → smoke.

Production не меняется до зелёного CI и preview.
