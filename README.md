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

The API listens on port 3001 by default. On startup it creates missing application tables, including the contact-message inbox, and adds missing profile columns. These are non-destructive `CREATE TABLE IF NOT EXISTS` and guarded `ALTER TABLE` operations; existing client and wedding records are preserved. Contact form submissions are stored in the configured database and shown in the admin inbox. Couple accounts are always assigned their role by the server; registration cannot grant administrator access. The configured administrator account is created once, if that email does not already exist. Uploaded contracts and payment evidence are only served through admin-authenticated API routes. Uploaded files (including vendor and inspiration images) are stored under `DATA_DIR` in `private-files`, `vendor-images`, and `inspiration-images` directories. If `DATA_DIR` is unset, the server uses a `data` directory next to its entry point; this local default is not persistent on hosted services.

For Render, attach a persistent disk to the API service with mount path `/var/data` and set the service environment variable `DATA_DIR=/var/data`. Keep the disk attached across deploys and back it up alongside the database. Without a persistent disk, uploaded files can disappear after a restart or deploy even though their database records remain, causing image requests to return 404. Any files already lost from an ephemeral filesystem must be uploaded again after persistent storage is configured.

For deployment, set `NODE_ENV=production`, use a long random `SESSION_SECRET`, serve the app over HTTPS, and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator account. Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` for the MySQL-compatible production database. Production connections use TLS, as required by TiDB Cloud Starter. Use a dedicated database user with permissions limited to this application database.

One-time planning packages support wedding plans for 200,000 RWF (Basic), 400,000 RWF (Standard), and 1,000,000 RWF (Premium), plus a 100,000 RWF Short Event Plan for birthdays, bridal showers, baby showers, meetings, anniversaries, graduations, and other events. Basic includes a budget, vendor recommendations, and the option to request vendor changes. Standard adds personalized budget adjustments and our team contacting vendors on the client's behalf. Premium includes everything in Standard plus ongoing coordination. The Short Event Plan covers a focused budget allocation and vendor recommendations, not ongoing coordination. Clients create an account, enter and save their budget and event preferences from **Budget**, then choose **Send to planning team** to open package selection and pay a 50% deposit. The saved details remain private until payment is verified. After confirmation, the request appears in the planning team's admin queue. The full plan is prepared by the planning team and shared in the couple's account. The remaining balance is due once the initial plan is ready for review and can be paid from **Packages**. Checkout supports manual MTN MoMo and bank transfers: customers send payment using their own app/USSD or online banking, submit the transaction reference, and an administrator verifies receipt in **Package payments** before activating the package. Configure `MOMO_MANUAL_PHONE`, `MOMO_MANUAL_ACCOUNT_NAME`, `BANK_TRANSFER_BANK_NAME`, `BANK_TRANSFER_ACCOUNT_NAME`, `BANK_TRANSFER_ACCOUNT_NUMBER`, and optional `BANK_TRANSFER_BRANCH` as private backend environment variables (for example, Render), never in Vercel frontend variables or source control. A method without its required destination details is not offered at checkout.

Basic clients can access their budget proposal and recommendations from verified vendors, including vendor contact details. Admins can see each paid tier and its included scope in the budget and event-plan workspaces. Standard and Premium clients also get checklist, contract, payment, and vendor-coordination access; those pages and their supporting APIs are unavailable to Basic and Short Event clients. The Vercel frontend proxies `/api/*` requests to the Render backend using `vercel.json`. Update that rewrite destination if the Render service URL changes.

## Implemented scope

- React + Vite couple dashboard and account screens
- Express + TypeScript API
- MySQL user accounts and couple profile records
- Hashed passwords and HTTP-only, same-site sessions stored in MySQL
- Couple and admin role guards
- Admin workspace shell with the requested planning areas
- Couple wedding-details onboarding and profile editing, with validated, persistent budget, guest count, date, location, style, and special requirements
- Couple contact phone collection (optional) and a public Contact Us form with an administrator inbox
- Paid one-time Basic, Standard, and Premium planning packages, with manually verified MTN MoMo and bank transfer checkout
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
