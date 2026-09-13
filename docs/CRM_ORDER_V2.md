# MA CRM — Order module v2

## Goal
The repair order is one feature with one lifecycle. The page shell (`crm.js`) renders the basic order once; the order controller owns enhancements and coordinates child features. No feature is allowed to watch the order DOM with its own `MutationObserver`, reload the page after a successful action, or patch the same UI independently.

## Order entities

- `ma_crm_repairs` — order header, customer/device link, status, manager/master, dates, final price, warranty metadata.
- `ma_crm_repair_items` — services and parts; `display_type`, quantity, client price, unit cost.
- `ma_crm_payments` — payments/refunds linked to the order and cashbox.
- status history — status changes and actor.
- payroll / compensation — employee earnings linked to the order.
- documents — acceptance receipt and completion act generated from the current order snapshot.

## Frontend ownership

### `crm.js`
Owns application shell, navigation, lists, base order fetch and base order markup. It must not contain add-on business workflows.

### `crm-order-controller.js`
Single coordinator for an opened repair order. It owns the current order snapshot and emits lifecycle events.

Lifecycle:

1. user opens order;
2. base API returns `repair`;
3. controller captures the snapshot and waits for the base order markup;
4. controller emits `ma:order:ready` once for that render;
5. detail modules render their sections from that event;
6. after a write, the affected section refreshes in place; the whole page is not reloaded.

### `crm-phase1.js`
Order detail data adapter for deadline/warranty, line items and payments. It renders into the current order only when the controller tells it an order is ready. No DOM observer.

### Issue / print flow
The controller intercepts only the `issued` action. Payment + issue must be atomic on the server. Printing happens after success from the returned order snapshot.

## Rules

1. One active order id at a time.
2. One fetch for the base order per explicit open/refresh.
3. No `MutationObserver` for order business logic.
4. No `window.location.reload()` after order actions.
5. No independent modules patching the same fields without controller events.
6. Every write updates only its section and then emits `ma:order:changed`.
7. Totals come from server responses, not duplicated client formulas except temporary previews.
8. Service cost is first-class: `display_type=service` may still have a non-zero `unit_cost`.
9. Closing an order invalidates its render token; late responses are ignored.
10. Mobile and desktop use the same data lifecycle; only presentation differs.

## Target UI

Header: order number, amount, current status.

Tabs:
- General — customer, device, issue, deadline, warranty, manager/master.
- Goods & services — catalog picker, one-off service, parts, client price, cost, quantity, profit.
- Payments — paid, balance, payment/refund history, new payment.

Issue flow:
`Issued` -> payment dialog -> payment method and amount -> document checkboxes -> atomic server action -> print preview -> card stays open in issued state.

## Migration plan

1. Architecture and lifecycle contract.
2. Single controller and stable open/close lifecycle.
3. Goods/services and cost/profit.
4. Payments and cashboxes.
5. Statuses and issue flow.
6. Payroll/profit integration.
7. Documents, files and customer history.
8. Regression tests and production verification.
