# Central Library Circulation & Real-Time Availability Platform

An enterprise-grade, civic institutional library circulation, hold queue targeting, and copy-level availability web platform.

Built with **Node.js, Express, EJS Server-Side Rendering, and MongoDB Atlas**.

---

## 1. Domain Problem & Value Proposition

In legacy college and institutional libraries, members search a catalogue only to discover at the shelf that a book is checked out, damaged, or reserved for someone else. Furthermore, patrons are often turned away at checkout desks due to opaque quotas or past-due fines.

This platform solves this by providing **trustworthy, derived availability and a unified borrowing lifecycle**:
$$\text{Discover} \longrightarrow \text{Real Availability} \longrightarrow \text{Hold Queue} \longrightarrow \text{Eligibility Check} \longrightarrow \text{Issue} \longrightarrow \text{Due Tracking} \longrightarrow \text{Return} \longrightarrow \text{Next Hold Targeted}$$

### Key Architectural Pillars
1. **Copy-Level Inventory (Not an Integer Counter):** Each physical copy maintains its own barcode (`BC-CSE-001-A`), shelf location (*Stack A / Row 2 / Shelf 1*), physical condition (*New, Good, Fair, Damaged*), status (`AVAILABLE`, `ISSUED`, `RESERVED`, `DAMAGED`, `LOST`, `MAINTENANCE`), and issue audit history. Shelf availability is strictly derived from copy statuses.
2. **Event-Driven FIFO Hold Queue:** When all copies are checked out, members can place a hold and track their exact queue rank (#1, #2, etc.). On return, the check-in engine automatically targets the top-priority patron, locks the copy in `RESERVED` status, sets a time-limited pickup window, and dispatches a notification.
3. **Deterministic Eligibility Engine:** Before issuing any book, 6 discrete validation checks run: active loan limit, overdue items, account suspension, blocking fine balance threshold, copy availability, and hold ownership. Any failure returns an explicit human-readable diagnostic message.
4. **Zero Magic Numbers (Configurable `LibrarySetting`):** Lending duration (14 days), loan quotas (4 books), daily fine rates (₹5/day), grace periods (1 day), maximum fine caps (₹500), hold limits (3), and pickup windows (5 days) are dynamically configurable from the Librarian Policy interface.
5. **Civic Institutional Design System:** WCAG 2.1 AA compliant, dense practical tables, high contrast ratios (>= 4.5:1), dual text/color status badges, keyboard navigable, and fully responsive down to 375px viewports.

---

## 2. Technology Stack & Project Structure

- **Backend Runtime:** Node.js (v18+ / v20+ / v26+)
- **Web Framework:** Express 4.x (MVC + Isolated Domain Service Layer)
- **View Engine:** EJS (Server-Side Rendered semantic templates)
- **Database & ODM:** MongoDB Atlas / Mongoose ODM
- **Authentication & Security:** `express-session`, `connect-mongo`, `bcryptjs`, `express-rate-limit`, `sanitize-html`, `express-validator`

```
├── config/
│   └── db.js                 # MongoDB connection & reconnect handlers
├── models/
│   ├── User.js               # Member, Librarian, and Admin accounts
│   ├── Category.js           # Dewey / Subject classification
│   ├── Book.js               # Bibliographic master metadata & text search
│   ├── BookCopy.js           # Physical copies with barcodes & shelf locations
│   ├── Loan.js               # Circulation checkouts & due dates
│   ├── Reservation.js        # FIFO hold queue & targeted pickup states
│   ├── Fine.js               # Overdue charge ledger & settlement receipts
│   ├── Notification.js       # Patron alerts & pickup notices
│   ├── AuditLog.js           # State change audit trail
│   └── LibrarySetting.js     # Configurable circulation policy document
├── services/
│   ├── EligibilityService.js # Pre-loan validation gates
│   ├── CirculationService.js # Issue, check-in, return, renewal orchestration
│   ├── ReservationService.js # Hold queue ranking, return targeting, expiry sweeps
│   ├── InventoryService.js   # Copy state machine & derived availability
│   ├── FineService.js        # Overdue synchronization & fee calculations
│   ├── SettingService.js     # Dynamic policy retrieval & modification
│   ├── AuditService.js       # Centralized transaction logging
│   └── NotificationService.js# Dispatcher for patron alerts
├── controllers/              # HTTP request orchestration
├── routes/                   # Route declarations & role guards
├── middlewares/              # RBAC, session context, validation, error handlers
├── views/                    # EJS templates (Civic Institutional UI)
├── public/                   # Custom WCAG 2.1 AA CSS & vanilla JS
├── seed/
│   └── seedData.js           # 34 titles, 75 copies, active loans, overdues, holds
├── test/
│   ├── verify-flows.js       # Verification test suite for F1-F5
│   └── verify-http-routes.js # Full-stack HTTP route & view audit
├── RESEARCH.md               # Domain research document & citations
└── server.js                 # Server entry point with background sweeps
```

---

## 3. Quick Start & Local Setup

### Prerequisites
- Node.js (v18.0.0 or higher)
- MongoDB (Local instance or MongoDB Atlas connection string)

### Installation
```bash
# 1. Clone repository & install dependencies
git clone <repository-url>
cd "Assignment 2"
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Seed database with rich library dataset
npm run seed

# 4. Run automated verification suite
npm test

# 5. Start the application
npm start
# or for development mode with file watching:
npm run dev
```
Open your browser at **`http://localhost:3000`**.

---

## 4. Demo Credentials

| Role | Email | Password | Account Context |
| :--- | :--- | :--- | :--- |
| **Librarian (Staff)** | `librarian@library.gov.in` | `Librarian@2026` | Full Circulation Desk operator access |
| **Assistant Librarian** | `assistant.librarian@library.gov.in` | `Librarian@2026` | Technical services & catalogue ingestion |
| **Administrator** | `admin@library.gov.in` | `Admin@2026` | Policy configuration & administration |
| **Member (Active Loan)** | `aarav.sharma@institution.edu` | `Member@2026` | Member ID: `MEM-2026-0101` · Has 1 active loan |
| **Member (Hold Queue #1)** | `ananya.sen@institution.edu` | `Member@2026` | Member ID: `MEM-2026-0104` · Queue #1 on *Clean Code* |
| **Member (Hold Ready)** | `sneha.reddy@institution.edu` | `Member@2026` | Member ID: `MEM-2026-0106` · Targeted copy awaiting pickup |
| **Member (Overdue & Fine)**| `karan.mehta@institution.edu` | `Member@2026` | Member ID: `MEM-2026-0107` · Has 1 overdue loan with fine |
| **Member (Restricted)** | `manish.tiwari@institution.edu` | `Member@2026` | Member ID: `MEM-2026-0111` · Borrowing suspended |

---

## 5. Verification Test Checklist (Flows F1 — F5)

| Code | Flow Description | Observed System Verification | Status |
| :--- | :--- | :--- | :--- |
| **F1** | **Issue Lifecycle & Availability Derivation** | Issuing available copy `BC-CSE-3320-A` to Member `MEM-2026-0102` decremented shelf availability count from 2 to 1 in real time; created active loan record with calculated due date. | **VERIFIED** |
| **F2** | **Hold Queue Targeting & Pickup Lock** | Unavailable title (*Clean Code*, 0 available) placed member in FIFO queue position #3; returning checked-out copy `BC-CSE-0884-A` immediately triggered targeting engine, assigned copy to top waiting patron, locked copy as `RESERVED`, set 5-day pickup deadline, and generated patron notification. | **VERIFIED** |
| **F3** | **Overdue Flagging & Policy Fine Accrual** | Loan 6 days past due date evaluated against policy (1 grace day + 5 chargeable days @ ₹5/day = ₹25); returned item computed final fine and logged financial liability in ledger. | **VERIFIED** |
| **F4** | **Hard Eligibility Blocking Gates** | Verified 4 discrete checkout blockages: (1) Account restricted, (2) Copy reserved for another patron, (3) Member has overdue loan, (4) Max loan quota reached. Each returned an explicit human-readable diagnostic error message. | **VERIFIED** |
| **F5** | **Damaged/Lost Copy Transitions** | Transitioning copy status from `AVAILABLE` $\rightarrow$ `DAMAGED` $\rightarrow$ `LOST` dynamically recalculated real-time catalogue availability while keeping all historical loan transactions intact. | **VERIFIED** |

---

## 6. Deployment Guide: MongoDB Atlas & Render

### A. Setup MongoDB Atlas Database
1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Under **Database Access**, create a database user (e.g. `lib_admin`) with password.
3. Under **Network Access**, add IP address `0.0.0.0/0` (allow access from anywhere).
4. Under **Database > Connect > Drivers**, copy your connection string:
   ```
   mongodb+srv://lib_admin:<password>@cluster0.mongodb.net/library_circulation?retryWrites=true&w=majority
   ```

### B. Deploy to Render
1. Push this repository to GitHub.
2. Sign in to [render.com](https://render.com) and click **New + > Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm run seed && npm start` (or run seed once via Render Shell)
5. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
   - `MONGODB_URI` = `mongodb+srv://...` (Your Atlas URI)
   - `SESSION_SECRET` = `any_secure_random_string_32_chars`
6. Click **Deploy Web Service**. Render will build, connect to MongoDB Atlas, and launch the platform live.
