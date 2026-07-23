TOPIC: A branching order-processing flowchart follows an order from receipt through validation, possible correction or fraud review, payment, stock handling, and either shipment or refund.

NODES:
- Board title: `Eval Suite S2 — Branching Flowchart`
- `Order received`
- `Request correction`
- `Order valid?`
- `Fraud review`
- `Charge payment`
- `In stock?`
- `Create backorder`
- `Await restock`
- `Pick & pack`
- `Order shipped`
- `Order refunded`
- Annotation box: `backorders rejoin the line / a refund only happens when / the card declines / or the restock window / lapses.`

EDGES:
- `Order received` → `Order valid?` (`new order`; solid gray)
- `Order valid?` → `Request correction` (`No`; dashed red, arrow points left)
- `Request correction` → `Order valid?` (`resubmitted`; large hollow gray right-pointing arrow)
- `Order valid?` → `Charge payment` (`Yes`; solid path into the payment box)
- `Order valid?` → `Fraud review` (`Flagged`; solid purple)
- `Fraud review` → `Charge payment` (`cleared`; solid purple, merging into the route entering payment)
- `Fraud review` → `Order refunded` (`confirmed fraud`; dashed red)
- `Charge payment` → `In stock?` (`charged`; solid gray)
- `Charge payment` → `Order refunded` (`charge declined`; dashed red)
- `In stock?` → `Pick & pack` (`Yes`; solid gray)
- `In stock?` → `Create backorder` (`No`; solid gray, downward)
- `Create backorder` → `Await restock` (`queued`; solid gray)
- `Await restock` → `Pick & pack` (`stock arrived`; solid gray, upward)
- `Await restock` → `Order refunded` (`restock window expired`; dashed red)
- `Pick & pack` → `Order shipped` (`handed to carrier`; solid gray)

GROUPS:
- No explicit enclosing group containers are drawn; the following groupings are conveyed by layout, color, and role.
- Intake and validation: `Order received`, `Order valid?`, and `Request correction`. This area contains the new-order entry and the correction/resubmission loop.
- Review and payment: `Fraud review` and `Charge payment`. Flagged orders detour through review; cleared orders rejoin at payment, while payment or review failures lead toward refund.
- Inventory and fulfillment: `In stock?`, `Create backorder`, `Await restock`, and `Pick & pack`. In-stock orders go directly to packing; out-of-stock orders wait and later rejoin packing if stock arrives.
- Terminal outcomes: `Order shipped` is the successful outcome and `Order refunded` is the exception/failure outcome.
- The annotation box explains the backorder rejoin and states a rule about when refunds occur.

ORDER:
1. Start at `Order received`, then follow `new order` to `Order valid?`.
2. At validation, `No` goes left to `Request correction`, and `resubmitted` returns right to `Order valid?`, forming a correction loop. `Flagged` goes down to `Fraud review`; `Yes` proceeds to `Charge payment`.
3. In the fraud branch, `cleared` rejoins the flow at `Charge payment`, while `confirmed fraud` is drawn to `Order refunded`.
4. After payment, `charged` proceeds to `In stock?`; `charge declined` ends at `Order refunded`.
5. At stock checking, `Yes` goes to `Pick & pack`; `No` goes to `Create backorder`, then `queued` goes to `Await restock`.
6. From `Await restock`, `stock arrived` rejoins the main fulfillment line at `Pick & pack`; `restock window expired` goes to `Order refunded`.
7. From `Pick & pack`, `handed to carrier` ends at `Order shipped`.

CONVENTIONS:
- Arrowheads establish direction; small pill-shaped labels name decisions, events, or statuses on each route.
- Solid gray lines carry the ordinary intake, payment, stock, and fulfillment flow.
- Purple boxes/lines mark the fraud-review detour and its cleared return to payment.
- Dashed red lines mark negative, exception, or refund-producing routes, including invalid-order correction, confirmed fraud, declined payment, and an expired restock window.
- Orange boxes are decision points (`Order valid?`, `In stock?`); ordinary process steps are gray rectangles.
- Rounded capsules distinguish the initial state (`Order received`) and terminal outcomes: green for `Order shipped`, coral/red for `Order refunded`.
- The large hollow arrow labeled `resubmitted` denotes the correction loop back toward validation.

UNCERTAIN:
- The large `resubmitted` arrow floats above the two boxes rather than visibly attaching to their outlines. Its rightward direction and placement support `Request correction` → `Order valid?`, but that endpoint attribution is not physically connected.
- The routes entering `Charge payment` overlap at a shared segment: the validation `Yes` route and the purple `cleared` route from `Fraud review` visually converge immediately before payment. Their labels and surrounding paths support the two edges listed above, but the precise merge point is not marked with a junction symbol.
- The picture is internally inconsistent about refunds: it visibly draws `Fraud review` → `Order refunded` with `confirmed fraud`, while the annotation says “a refund only happens when the card declines or the restock window lapses.” Thus the drawn flow shows three refund triggers, but the note names only two and excludes the fraud route.
- There is no explicit legend, so the color, dash, and shape meanings above are inferred from their consistent use in the flow.
