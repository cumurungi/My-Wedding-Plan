import mysql, { type RowDataPacket } from 'mysql2/promise';

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`${key} is required.`);
  return value;
};

export const pool = mysql.createPool({
  host: required('MYSQL_HOST', '127.0.0.1'),
  port: Number(required('MYSQL_PORT', '3306')),
  user: required('MYSQL_USER', 'root'),
  password: required('MYSQL_PASSWORD'),
  database: required('MYSQL_DATABASE', 'my_wedding_plan'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

export interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: 'couple' | 'admin';
  createdAt: Date;
}

export interface CoupleProfileRow extends RowDataPacket {
  budgetRwf: number | null;
  guestCount: number | null;
  weddingDate: string | null;
  location: string | null;
  style: string | null;
  specialRequirements: string | null;
  otherCostsDescription: string | null;
  weddingFormat: string | null;
  vendorNeeds: string | null;
}

export interface VendorRow extends RowDataPacket {
  id: number;
  businessName: string;
  category: string;
  location: string;
  contactName: string | null;
  contactEmail: string | null;
  phone: string | null;
  description: string | null;
  serviceDescription: string | null;
  imageUrl: string | null;
  colorPalette: string | null;
  priceFromRwf: number | null;
  priceToRwf: number | null;
  pricingBasis: 'fixed' | 'per_guest';
  isVerified: boolean;
  pricesApproved: boolean;
  status: 'pending' | 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export async function initializeDatabase(): Promise<void> {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('couple', 'admin') NOT NULL DEFAULT 'couple',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS couple_profiles (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      budget_rwf BIGINT UNSIGNED NULL,
      guest_count INT UNSIGNED NULL,
      wedding_date DATE NULL,
      location VARCHAR(160) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_couple_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await ensureProfileColumn('style', 'VARCHAR(100) NULL');
  await ensureProfileColumn('special_requirements', 'TEXT NULL');
  await ensureProfileColumn('other_costs_description', 'VARCHAR(500) NULL');
  await ensureProfileColumn('wedding_format', "VARCHAR(40) NULL");
  await ensureProfileColumn('vendor_needs', 'TEXT NULL');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(128) NOT NULL PRIMARY KEY,
      expires_at DATETIME(3) NOT NULL,
      data MEDIUMTEXT NOT NULL,
      INDEX idx_sessions_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS vendors (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      business_name VARCHAR(160) NOT NULL,
      category VARCHAR(80) NOT NULL,
      location VARCHAR(160) NOT NULL,
      contact_name VARCHAR(120) NULL,
      contact_email VARCHAR(254) NULL,
      phone VARCHAR(40) NULL,
      description TEXT NULL,
      service_description TEXT NULL,
      price_from_rwf BIGINT UNSIGNED NULL,
      price_to_rwf BIGINT UNSIGNED NULL,
      is_verified TINYINT(1) NOT NULL DEFAULT 0,
      verified_by BIGINT UNSIGNED NULL,
      verified_at DATETIME NULL,
      prices_approved TINYINT(1) NOT NULL DEFAULT 0,
      prices_approved_by BIGINT UNSIGNED NULL,
      prices_approved_at DATETIME NULL,
      status ENUM('pending', 'active', 'inactive') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_vendors_category (category),
      INDEX idx_vendors_status (status),
      INDEX idx_vendors_verified (is_verified, prices_approved),
      CONSTRAINT fk_vendors_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_vendors_prices_approved_by FOREIGN KEY (prices_approved_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await ensureVendorColumn('pricing_basis', "ENUM('fixed','per_guest') NOT NULL DEFAULT 'fixed'");
  await ensureVendorColumn('image_key', 'VARCHAR(80) NULL');
  await ensureVendorColumn('image_mime_type', 'VARCHAR(50) NULL');
  await ensureVendorColumn('color_palette', 'VARCHAR(255) NULL');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS contracts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      couple_user_id BIGINT UNSIGNED NOT NULL,
      vendor_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(180) NOT NULL,
      amount_rwf BIGINT UNSIGNED NOT NULL,
      signature_status ENUM('pending', 'partially_signed', 'fully_signed') NOT NULL DEFAULT 'pending',
      contract_date DATE NULL,
      document_key VARCHAR(80) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      file_size INT UNSIGNED NOT NULL,
      notes TEXT NULL,
      uploaded_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_contracts_couple (couple_user_id),
      INDEX idx_contracts_vendor (vendor_id),
      INDEX idx_contracts_signature_status (signature_status),
      CONSTRAINT fk_contracts_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_contracts_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
      CONSTRAINT fk_contracts_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      contract_id BIGINT UNSIGNED NOT NULL,
      amount_rwf BIGINT UNSIGNED NOT NULL,
      payment_type ENUM('deposit', 'installment', 'balance', 'other') NOT NULL DEFAULT 'other',
      status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
      due_date DATE NULL,
      paid_date DATE NULL,
      reference VARCHAR(120) NULL,
      note VARCHAR(1000) NULL,
      evidence_key VARCHAR(80) NULL,
      evidence_filename VARCHAR(255) NULL,
      evidence_mime_type VARCHAR(100) NULL,
      evidence_size INT UNSIGNED NULL,
      recorded_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payments_contract (contract_id),
      INDEX idx_payments_status_due (status, due_date),
      CONSTRAINT fk_payments_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE RESTRICT,
      CONSTRAINT fk_payments_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wedding_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      couple_user_id BIGINT UNSIGNED NOT NULL,
      version INT UNSIGNED NOT NULL,
      requested_budget_rwf BIGINT UNSIGNED NOT NULL,
      planned_total_rwf BIGINT UNSIGNED NOT NULL,
      is_over_budget TINYINT(1) NOT NULL DEFAULT 0,
      status ENUM('proposed','approved','rejected') NOT NULL DEFAULT 'proposed',
      generated_by BIGINT UNSIGNED NULL,
      reviewed_by BIGINT UNSIGNED NULL,
      review_note VARCHAR(1000) NULL,
      generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL,
      UNIQUE KEY uq_wedding_plans_couple_version (couple_user_id, version),
      INDEX idx_wedding_plans_status_budget (status, is_over_budget),
      CONSTRAINT fk_wedding_plans_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_wedding_plans_generator FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_wedding_plans_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wedding_plan_allocations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      wedding_plan_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(80) NOT NULL,
      allocation_percent DECIMAL(5,2) NOT NULL,
      target_amount_rwf BIGINT UNSIGNED NOT NULL,
      planned_amount_rwf BIGINT UNSIGNED NOT NULL,
      vendor_id BIGINT UNSIGNED NULL,
      vendor_name_snapshot VARCHAR(160) NULL,
      verified_price_from_rwf BIGINT UNSIGNED NULL,
      vendor_estimate_rwf BIGINT UNSIGNED NULL,
      pricing_basis ENUM('fixed','per_guest') NOT NULL DEFAULT 'fixed',
      price_source ENUM('verified_vendor','budget_allocation','reserve') NOT NULL,
      UNIQUE KEY uq_plan_allocation_category (wedding_plan_id, category),
      INDEX idx_plan_allocations_vendor (vendor_id),
      CONSTRAINT fk_plan_allocations_plan FOREIGN KEY (wedding_plan_id) REFERENCES wedding_plans(id) ON DELETE CASCADE,
      CONSTRAINT fk_plan_allocations_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await ensurePlanAllocationColumn('vendor_estimate_rwf', 'BIGINT UNSIGNED NULL');
  await ensurePlanAllocationColumn('pricing_basis', "ENUM('fixed','per_guest') NOT NULL DEFAULT 'fixed'");
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS vendor_date_availability (
      couple_user_id BIGINT UNSIGNED NOT NULL,
      vendor_id BIGINT UNSIGNED NOT NULL,
      wedding_date DATE NOT NULL,
      status ENUM('not_checked','waiting_for_vendor','available','unavailable','approved') NOT NULL DEFAULT 'not_checked',
      internal_note VARCHAR(1000) NULL,
      updated_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (couple_user_id, vendor_id, wedding_date),
      INDEX idx_vendor_date_status (vendor_id, wedding_date, status),
      CONSTRAINT fk_vendor_date_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_vendor_date_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
      CONSTRAINT fk_vendor_date_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS couple_vendor_selections (
      couple_user_id BIGINT UNSIGNED NOT NULL,
      wedding_date DATE NOT NULL,
      category VARCHAR(80) NOT NULL,
      vendor_id BIGINT UNSIGNED NOT NULL,
      updated_by BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (couple_user_id, wedding_date, category),
      INDEX idx_couple_vendor_selection_vendor (vendor_id),
      CONSTRAINT fk_couple_vendor_selection_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_couple_vendor_selection_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
      CONSTRAINT fk_couple_vendor_selection_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_budget_vendor_selections (
      couple_user_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(80) NOT NULL,
      vendor_id BIGINT UNSIGNED NOT NULL,
      updated_by BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (couple_user_id, category),
      INDEX idx_admin_budget_vendor_selection_vendor (vendor_id),
      CONSTRAINT fk_admin_budget_vendor_selection_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_budget_vendor_selection_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_budget_vendor_selection_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_budget_vendor_agreed_prices (
      couple_user_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(80) NOT NULL,
      vendor_id BIGINT UNSIGNED NOT NULL,
      agreed_price_rwf BIGINT UNSIGNED NOT NULL,
      quantity INT UNSIGNED NOT NULL DEFAULT 1,
      updated_by BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (couple_user_id, category),
      INDEX idx_admin_budget_agreed_price_vendor (vendor_id),
      CONSTRAINT fk_admin_budget_agreed_price_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_budget_agreed_price_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
      CONSTRAINT fk_admin_budget_agreed_price_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS inspiration_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      item_type ENUM('theme','palette','decoration','idea') NOT NULL,
      description TEXT NOT NULL,
      vendor_category VARCHAR(80) NULL,
      price_rwf BIGINT UNSIGNED NULL,
      color_palette VARCHAR(255) NULL,
      reference_url VARCHAR(500) NULL,
      image_url VARCHAR(500) NULL,
      image_key VARCHAR(80) NULL,
      image_mime_type VARCHAR(50) NULL,
      image_filename VARCHAR(255) NULL,
      is_published TINYINT(1) NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inspiration_type_published (item_type, is_published),
      CONSTRAINT fk_inspiration_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await ensureInspirationColumn('image_key', 'VARCHAR(80) NULL');
  await ensureInspirationColumn('image_mime_type', 'VARCHAR(50) NULL');
  await ensureInspirationColumn('image_filename', 'VARCHAR(255) NULL');
  await ensureInspirationColumn('vendor_category', 'VARCHAR(80) NULL');
  await ensureInspirationColumn('price_rwf', 'BIGINT UNSIGNED NULL');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS checklist_tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      couple_user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(160) NOT NULL,
      description TEXT NULL,
      due_date DATE NULL,
      status ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_checklist_couple_status_due (couple_user_id, status, due_date),
      CONSTRAINT fk_checklist_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_checklist_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS couple_vendor_checklist (
      couple_user_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(80) NOT NULL,
      is_completed TINYINT(1) NOT NULL DEFAULT 0,
      updated_by BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (couple_user_id, category),
      CONSTRAINT fk_vendor_checklist_couple FOREIGN KEY (couple_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_vendor_checklist_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function ensureProfileColumn(name: 'style' | 'special_requirements' | 'other_costs_description' | 'wedding_format' | 'vendor_needs', definition: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['couple_profiles', name],
  );
  if (rows.length === 0) {
    await pool.execute(`ALTER TABLE couple_profiles ADD COLUMN ${name} ${definition}`);
  }
}

async function ensureVendorColumn(name: 'pricing_basis' | 'image_key' | 'image_mime_type' | 'color_palette', definition: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['vendors', name],
  );
  if (rows.length === 0) await pool.execute(`ALTER TABLE vendors ADD COLUMN ${name} ${definition}`);
}

async function ensurePlanAllocationColumn(name: 'vendor_estimate_rwf' | 'pricing_basis', definition: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['wedding_plan_allocations', name],
  );
  if (rows.length === 0) await pool.execute(`ALTER TABLE wedding_plan_allocations ADD COLUMN ${name} ${definition}`);
}

async function ensureInspirationColumn(name: 'image_key' | 'image_mime_type' | 'image_filename' | 'vendor_category' | 'price_rwf', definition: string): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    ['inspiration_items', name],
  );
  if (rows.length === 0) await pool.execute(`ALTER TABLE inspiration_items ADD COLUMN ${name} ${definition}`);
}
