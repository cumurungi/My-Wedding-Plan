# My Wedding Plan

A wedding-planning platform foundation with a warm, calm dashboard inspired by the supplied reference. Phase 1 uses a **React + Vite + TypeScript frontend** and a **Node.js + Express + TypeScript backend with MySQL**.

## Requirements

- Node.js 20 or newer
- npm
- MySQL 8 or newer

## Start locally

1. Create a MySQL database: `CREATE DATABASE my_wedding_plan CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
2. Copy `.env.example` to `.env`, set the MySQL connection values, and replace `SESSION_SECRET` and `ADMIN_PASSWORD` with private values. The initial admin password must have at least 10 characters.
3. Run `npm install`.
4. Run `npm run dev` and open the Vite URL shown in the terminal.

The API listens on port 3001 by default. On startup it creates the users, couple profile, MySQL session, vendor, contract, and payment tables, then adds any missing wedding-details columns to existing profile tables. Couple accounts are always assigned their role by the server; registration cannot grant administrator access. The configured administrator account is created once, if that email does not already exist. Uploaded contracts and payment evidence are stored under `server/data/private-files` and are only served through admin-authenticated API routes. Back up that directory alongside the database.

For deployment, set `NODE_ENV=production`, use a long random `SESSION_SECRET`, serve the app over HTTPS, and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator account. Production MySQL connections use TLS, as required by TiDB Cloud Starter. Use a dedicated MySQL user with permissions limited to this database.

## Implemented scope

- React + Vite couple dashboard and account screens
- Express + TypeScript API
- MySQL user accounts and couple profile records
- Hashed passwords and HTTP-only, same-site sessions stored in MySQL
- Couple and admin role guards
- Admin workspace shell with the requested planning areas
- Couple wedding-details onboarding and profile editing, with validated, persistent budget, guest count, date, location, style, and special requirements
- Live admin overview metrics and an admin-only vendor directory with search, vendor details, verification, pricing approval, and active/inactive status
- Admin contract register: upload a vendor contract PDF for a couple, search or filter by couple, see vendor and payment balance details, download the private file, and update pending/partially signed/fully signed status
- Admin payment tracker: record deposits, installments, due dates, paid dates, and optional private payment evidence against a vendor contract
- Couple dashboard budget guide with illustrative categories; couples can describe optional expenses such as church services or accommodation under other costs
- Admin-managed budget plans: admins choose vendors, enter agreed wedding prices for beverages, catering, invitations, and transport, and enter a makeup price per person plus the number of people receiving makeup. Vendor directory prices are used only when no agreed price is entered. Category guides are references and unselected categories add nothing to plan totals.
- Versioned budget proposals show the selected vendor costs and flag totals that exceed the requested budget; admins can approve or request changes with notes
- Couple accounts can view approved budget allocations, assigned vendor contracts, payment schedules, balances, and their own contract/evidence downloads
- Persistent light/dark theme preference and mobile-accessible administrator navigation

Automatic email notifications remain a later phase. Couple-facing illustrative recommendations may use the vendor directory price when there is no planner-entered agreed price; the generated plan total uses the selected vendors and applicable agreed prices.
