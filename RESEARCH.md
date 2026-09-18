# Circulation & Availability Platform: Domain Research & System Architecture

## 1. Observed Workflows in Live Library Systems
* **Bibliographic vs. Item-Level Distinction (WorldCat & Evergreen ILS):** Discovery catalogs maintain master bibliographic metadata (Title, Author, ISBN, Classification), while physical circulation operates strictly at the Local Holdings / Copy level (Accession Barcode, Shelving Location, Physical Condition, Copy Status). A title is never checked out; a specific copy is.
  *Source:* [WorldCat Local Holdings Records Model](https://help.oclc.org/Metadata_Services/WorldShare_Record_Manager/Holdings_records) & [Evergreen ILS Copy Status Administration](https://docs.evergreen-ils.org/3.2/copy_status.html)
* **Real-Time Hold Targeting and Pull Queues (Evergreen & Koha):** When an item is returned, the circulation engine does not immediately increment shelf stock if unsatisfied holds exist. Instead, the check-in event triggers target evaluation, places the specific copy in `RESERVED` / `WAITING_FOR_PICKUP` status, assigns a time-limited pickup window (e.g., 3–7 days), and notifies the top-priority patron. If unclaimed within the expiration window, the copy is retargeted or returned to `AVAILABLE`.
  *Source:* [Koha Circulation & Holds Manual](https://koha-community.org/manual/latest/en/html/circulation.html) & [Evergreen Hold Targeting](https://docs.evergreen-ils.org/3.2/holds_targeting.html)
* **Deterministic Patron Eligibility & Hard Circulation Blocks (e-Granthalaya & Koha):** Checkout desks evaluate hard validation gates before issuance: (1) active loan count against max quota, (2) existing overdue items, (3) outstanding unpaid fines exceeding monetary thresholds, (4) patron account status (active/suspended), and (5) copy circulation eligibility (not reference-only, damaged, or reserved for another patron).
  *Source:* [NIC e-Granthalaya Circulation Module](https://egranthalaya.nic.in) & [Koha Patron Restrictions Rules](https://koha-community.org/manual/latest/en/html/patrons.html)
* **Public Availability & Pickup State Communication (NYPL & British Library):** Patrons require transparent real-time status: exact queue rank for pending holds, explicit pickup deadline dates for waiting items, itemized accrual of daily overdue fines, and exact physical shelf location (e.g., *Stack B, Shelf 3*).
  *Source:* [NYPL Account & Hold Policies](https://www.nypl.org/help/borrowing-materials) & [British Library Reader Services](https://www.bl.uk)
* **Universal Accessibility & Operational Ergonomics (IFLA / WCAG 2.1 AA):** High-density desk operations and diverse patron demographics demand WCAG 2.1 AA compliance: contrast ratios >= 4.5:1, status conveyed by text tokens as well as color badges, keyboard-first navigation, full ARIA semantic tree, and instant server-rendered pages without client-side lag.
  *Source:* [IFLA Guidelines for Library Services & Web Accessibility](https://www.ifla.org/publications/guidelines-for-making-libraries-accessible-for-people-with-disabilities/)

---

## 2. Real Problem & Root Causes
* **The Core Problem:** Members locate titles in academic and public catalogs but arrive at physical shelves only to discover that copies are checked out, missing, damaged, or held for others. Simultaneously, patrons cannot determine whether their borrowing quota or past-due fines block them until they wait in desk queues.
* **Root Causes:**
  1. *Scalar Count Anti-Pattern:* Legacy or naive library apps store an integer `available_copies` on the book record. When copies are lost, damaged, or placed on hold, scalar increments/decrements drift out of sync with physical shelf reality.
  2. *Disconnected Hold-to-Return Lifecycle:* Returns increment counters blindly rather than evaluating FIFO reservation queues and locking targeted copies.
  3. *Opaque Eligibility Gates:* Circulation rules live implicitly across spreadsheets or manual registers, leading to unexpected desk rejections with no actionable diagnostic.

---

## 3. Existing Solutions vs. Gaps Left Behind

| Feature Area | Enterprise ILS (Koha, Evergreen) | Institutional Portals (e-Granthalaya, NDLI) | Lightweight Library Apps | Our Unified Platform Architecture |
| :--- | :--- | :--- | :--- | :--- |
| **Inventory State** | Heavy relational item tables; complex MARC21 mapping. | Accession register tied to static desktop/web forms. | Naive integer counters (`available_copies`). | **Derived Copy Model:** Real-time state aggregation from `BookCopy` records with individual barcode tracking. |
| **Hold Queue** | Complex cron-based background targeters with high latency. | Manual reservation slips with librarian reconciliation. | No queue position or auto-expiration. | **Event-Driven FIFO Hold Queue:** Real-time targeting on return, queue position tracking, and pickup expiry clock. |
| **Eligibility Validation** | Distributed across hundreds of sysprefs & MySQL triggers. | Coarse-grained blocks without clear patron-facing reasons. | Unchecked or minimal single-field validation. | **Deterministic Eligibility Engine:** Centralized service running 6 discrete pre-loan checks with human-readable error messages. |
| **Policy Configuration** | Steep XML/Admin syspref learning curve. | Hardcoded institutional presets. | Hardcoded magic numbers. | **Configurable `LibrarySetting` Document:** Dynamic lending period, grace days, fine rate, limits, and pickup windows. |
| **Accessibility & UX** | Dense, cluttered legacy tables; low contrast. | Legacy table layouts; poor mobile responsiveness. | Generic dashboard templates with low utility. | **Civic Institutional UI:** WCAG 2.1 AA compliant, dense operational tables, text-first status tokens, keyboard navigable, 375px responsive. |

---

## 4. Derived Design & Technical Decisions
1. **Schema Separation:** Decouple `Book` (metadata, ISBN, author, category) from `BookCopy` (barcode, copy number, condition, shelf location, status: `AVAILABLE`, `ISSUED`, `RESERVED`, `DAMAGED`, `LOST`, `MAINTENANCE`). Availability count is strictly derived via aggregation queries.
2. **Unified Hold Queue State Machine:** `PENDING` (queued) $\rightarrow$ `AVAILABLE_FOR_PICKUP` (targeted upon return, copy locked, pickup deadline set) $\rightarrow$ `FULFILLED` (issued to reserving member) or `EXPIRED`/`CANCELLED` (auto-retargets next member or unlocks copy to `AVAILABLE`).
3. **Dedicated Eligibility Engine (`EligibilityService`):** Evaluates `[maxLoans, activeOverdues, unpaidFineThreshold, accountRestriction, copyStatus, holdAuthorization]` before issuing. Returns structured `{ allowed: boolean, reasonCode: string, message: string }`.
4. **Transparent Member & Operational Desk Dashboards:**
   - *Patron Dashboard:* Live loans with countdown to due date, accrued fines, pending holds with live queue position, pickup deadlines, borrowing history.
   - *Librarian Desk:* Daily operational overview (today's issues/returns, overdue alerts, holds awaiting capture/pickup, low availability alerts, damaged/lost reports, instant barcode search).
5. **Comprehensive Audit Trail:** Dedicated `AuditLog` collection recording actor, action, target entity, metadata snapshot, and timestamp for every circulation event.
