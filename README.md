# The EventNest

A wedding-planning platform foundation with a warm, calm dashboard inspired by the supplied reference. It uses a **React + Vite + TypeScript frontend** and a **Node.js + Express + TypeScript backend** with MySQL-compatible database support, including TiDB Cloud.

## Requirements

- Node.js 20 or newer
- npm
- MySQL 8 or newer, or a MySQL-compatible TiDB Cloud cluster

## Start locally

1. Create a MySQL database: `CREATE DATABASE my_wedding_plan CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`
2. Copy `.env.example` to `.env`, set the MySQL connection values, and replace `SESSION_SECRET` and `ADMIN_PASSWORD` with private values. The initial admin password must have at least 10 characters.
3. Run `npm install`.
4. Run `npm run dev` and open the Vite URL shown in the terminal.

The API listens on port 3001 by default. On startup it creates missing application tables, including the contact-message inbox, and adds missing profile columns. These are non-destructive `CREATE TABLE IF NOT EXISTS` and guarded `ALTER TABLE` operations; existing client and wedding records are preserved. Contact form submissions are stored in the configured database and shown in the admin inbox. Couple accounts are always assigned their role by the server; registration cannot grant administrator access. The configured administrator account is created once, if that email does not already exist. Uploaded contracts and payment evidence are stored under `server/data/private-files` and are only served through admin-authenticated API routes. Back up that directory alongside the database.

For deployment, set `NODE_ENV=production`, use a long random `SESSION_SECRET`, serve the app over HTTPS, and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator account. Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` for the MySQL-compatible production database. Production connections use TLS, as required by TiDB Cloud Starter. Use a dedicated database user with permissions limited to this application database.

One-time planning packages support wedding plans for 200,000 RWF (Basic), 400,000 RWF (Standard), and 1,000,000 RWF (Premium), plus a 100,000 RWF Short Event Plan for birthdays, bridal showers, baby showers, meetings, anniversaries, graduations, and other events. The Short Event Plan covers a focused budget allocation and vendor recommendations, not ongoing coordination. Clients can check out with MTN Mobile Money Collection or manual bank transfer. After MTN confirms payment, the client is sent to sign in or create an account; the checkout is securely linked to that account before the event details form is shown. Bank transfer clients submit their receipt reference, then sign in or create an account; the package stays locked until an administrator verifies the transfer in **Package payments**. Configure the `MTN_MOMO_*` values and `BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_ACCOUNT_NAME`, `BANK_TRANSFER_ACCOUNT_NUMBER`, and optional `BANK_TRANSFER_BRANCH` as private environment variables on the backend host (for example, Render), never in Vercel frontend variables or source control. Use MTN's sandbox credentials and `sandbox` target to test first; use `mtnrwanda` and production credentials only after the MTN merchant account is approved. A method without its required configuration is not offered for checkout.

The Vercel frontend proxies `/api/*` requests to the Render backend using `vercel.json`. Update that rewrite destination if the Render service URL changes.

## Implemented scope

- React + Vite couple dashboard and account screens
- Express + TypeScript API
- MySQL user accounts and couple profile records
- Hashed passwords and HTTP-only, same-site sessions stored in MySQL
- Couple and admin role guards
- Admin workspace shell with the requested planning areas
- Couple wedding-details onboarding and profile editing, with validated, persistent budget, guest count, date, location, style, and special requirements
- Couple contact phone collection (optional) and a public Contact Us form with an administrator inbox
- Paid one-time Basic, Standard, and Premium planning packages, with MTN Mobile Money checkout and payment-confirmed client access
- Budget request status flow: new or updated budget details are pending, generating a proposal moves the request to review, and admin approval or revision requests update its status
- Live admin overview metrics and an admin-only vendor directory with search, vendor details, verification, pricing approval, and active/inactive status
- Admin contract register: upload a vendor contract PDF for a couple, search or filter by couple, see vendor and payment balance details, download the private file, and update pending/partially signed/fully signed status
- Admin payment tracker: record deposits, installments, due dates, paid dates, and optional private payment evidence against a vendor contract
- Couple dashboard budget guide with illustrative categories; couples can describe optional expenses such as church services or accommodation under other costs
- Admin-managed budget plans: admins choose vendors, enter agreed wedding prices for beverages, catering, invitations, and transport, and enter a makeup price per person plus the number of people receiving makeup. Vendor directory prices are used only when no agreed price is entered. Category guides are references and unselected categories add nothing to plan totals.
- Versioned budget proposals show the selected vendor costs and flag totals that exceed the requested budget; admins can approve or request changes with notes
- Couple accounts can view approved budget allocations, assigned vendor contracts, payment schedules, balances, and their own contract/evidence downloads
- Persistent light/dark theme preference and mobile-accessible administrator navigation

Automatic email notifications remain a later phase. Couple-facing illustrative recommendations may use the vendor directory price when there is no planner-entered agreed price; the generated plan total uses the selected vendors and applicable agreed prices.
