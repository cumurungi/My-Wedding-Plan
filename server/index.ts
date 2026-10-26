import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { z } from 'zod';
import { initializeDatabase, pool, type UserRow, type VendorRow } from './db.js';
import { MySQLSessionStore } from './session-store.js';
import { budgetCategories, generateAllocations } from './budget-planner.js';

const app = express();
const port = Number(process.env.PORT || 3001);
const production = process.env.NODE_ENV === 'production';
const requiredEnv = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

if (production && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production.');
const secret = requiredEnv('SESSION_SECRET', 'local-development-secret-change-me');
const sessionStore = new MySQLSessionStore();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const inspirationImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const vendorImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const uploadDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'private-files');
const inspirationImageDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'inspiration-images');
const vendorImageDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'vendor-images');

class UploadValidationError extends Error {}

app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(session({
  store: sessionStore,
  name: 'mywedding.sid',
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
const weddingDetailsSchema = z.object({
  budgetRwf: z.coerce.number().int().min(1).max(10_000_000_000_000),
  guestCount: z.coerce.number().int().min(1).max(100_000),
  weddingDate: z.string().trim().max(10).refine((value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid wedding date.'),
  location: z.string().trim().min(2).max(160),
  style: z.string().trim().max(100).default(''),
  weddingFormat: z.enum(['traditional_church_reception', 'church_reception', 'traditional_only', 'other']).default('other'),
  vendorNeeds: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  specialRequirements: z.string().trim().max(5000).default(''),
  otherCostsDescription: z.string().trim().max(500).default(''),
});
function parseVendorNeeds(value: string | null): string[] {
  if (!value) return [];
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; }
  catch { return []; }
}
const vendorCategoriesForNeed: Record<string, string[]> = {
  'Venue': ['Venue'],
  'Catering': ['Catering'],
  'Photography & video': ['Photography & Video'],
  'Decorator (includes tables, chairs & tents)': ['Decoration'],
  'Florist': ['Florist & Flowers'],
  'Wedding attire': ['Decoration'],
  'Makeup & hair': ['Makeup Artist', 'Hair Stylist'],
  'Transport': ['Transport'],
  'Cake': ['Cake'],
  'Music & entertainment': ['Sound System', 'Music Band', 'DJ', 'MC'],
  'Drinks & beverages': ['Drinks & Beverage Service'],
  'Church services': ['Other Costs'],
  'Traditional dancers / Itorero': ['Traditional Dancers'],
  'Wedding services & protocol': ['Wedding Services & Protocol'],
  'Stationery & invitations': ['Stationery & Invitations'],
  'Accommodation': ['Other Costs'],
  'Other': ['Other Costs'],
};
async function getCoupleVendorAvailability(coupleUserId: number, includeInternal: boolean) {
  const [profiles] = await pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(wedding_date, '%Y-%m-%d') AS weddingDate,
    vendor_needs AS vendorNeeds, budget_rwf AS budgetRwf, guest_count AS guestCount FROM couple_profiles WHERE user_id = ?`, [coupleUserId]);
  const weddingDate = profiles[0]?.weddingDate as string | null | undefined;
  if (!profiles.length) return { weddingDate: null, vendors: [], recommendations: [] };
  const needs = parseVendorNeeds(profiles[0]?.vendorNeeds ?? null);
  const categories = [...new Set(needs.flatMap((need) => vendorCategoriesForNeed[need] ?? []))];
  if (!categories.length) return { weddingDate: weddingDate ?? null, vendors: [], recommendations: [] };
  const marks = categories.map(() => '?').join(',');
  const internalColumn = includeInternal ? ', v.is_verified AS isVerified, v.prices_approved AS pricesApproved, v.status AS vendorStatus, a.internal_note AS internalNote' : '';
  const [vendors] = await pool.query<RowDataPacket[]>(`SELECT v.id AS vendorId, v.business_name AS businessName,
    v.category, v.location, v.price_from_rwf AS priceFromRwf, v.price_to_rwf AS priceToRwf,
    v.pricing_basis AS pricingBasis,
    COALESCE(a.status, 'not_checked') AS availabilityStatus,
    DATE_FORMAT(a.updated_at, '%Y-%m-%d %H:%i') AS availabilityUpdatedAt${internalColumn}
    FROM vendors v LEFT JOIN vendor_date_availability a ON a.vendor_id = v.id AND a.couple_user_id = ? AND a.wedding_date = ?
    WHERE v.status IN ('active','pending') AND v.category IN (${marks}) ORDER BY v.category, v.business_name`,
  [coupleUserId, weddingDate, ...categories]);
  const [savedSelections] = await pool.query<RowDataPacket[]>(`SELECT category, vendor_id AS vendorId FROM couple_vendor_selections
    WHERE couple_user_id = ? AND wedding_date = ?`, [coupleUserId, weddingDate]);
  const selectedByCategory = new Map(savedSelections.map((row) => [String(row.category).toLowerCase(), Number(row.vendorId)]));
  const [adminSelections] = await pool.query<RowDataPacket[]>('SELECT category, vendor_id AS vendorId FROM admin_budget_vendor_selections WHERE couple_user_id = ?', [coupleUserId]);
  for (const selection of adminSelections) selectedByCategory.set(String(selection.category).toLowerCase(), Number(selection.vendorId));
  const [agreedPriceRows] = await pool.query<RowDataPacket[]>(`SELECT category, vendor_id AS vendorId,
    agreed_price_rwf AS agreedPriceRwf, quantity FROM admin_budget_vendor_agreed_prices WHERE couple_user_id = ?`, [coupleUserId]);
  const agreedPricesByCategory = new Map(agreedPriceRows.map((row) => [String(row.category).toLowerCase(), {
    vendorId: Number(row.vendorId),
    agreedPriceRwf: Number(row.agreedPriceRwf),
    quantity: Number(row.quantity),
  }]));
  const budget = Number(profiles[0]?.budgetRwf ?? 0);
  const guestCount = Number(profiles[0]?.guestCount ?? 0);
  const recommendations = needs.flatMap((need) => (vendorCategoriesForNeed[need] ?? []).map((category) => {
    const categoryShare = budgetCategories.find((item) => item.category.toLowerCase() === category.toLowerCase())?.percent ?? 0;
    const categoryBudget = budget * categoryShare / 100;
    const agreedPrice = agreedPricesByCategory.get(category.toLowerCase());
    const savedVendorId = selectedByCategory.get(category.toLowerCase());
    const candidates = vendors.filter((vendor) => String(vendor.category).toLowerCase() === category.toLowerCase()
      && ((vendor.priceFromRwf !== null || vendor.priceToRwf !== null)
        || (agreedPrice?.vendorId === Number(vendor.vendorId) && Number(vendor.vendorId) === savedVendorId)));
    const estimate = (vendor: RowDataPacket) => {
      if (agreedPrice?.vendorId === Number(vendor.vendorId)) return agreedPrice.agreedPriceRwf * agreedPrice.quantity;
      return Number(vendor.priceFromRwf ?? vendor.priceToRwf) * (vendor.pricingBasis === 'per_guest' ? guestCount : 1);
    };
    const inBudget = candidates.filter((vendor) => estimate(vendor) <= categoryBudget);
    const eligible = candidates.filter((vendor) => (estimate(vendor) <= categoryBudget || Number(vendor.vendorId) === savedVendorId)
      && (vendor.availabilityStatus !== 'unavailable' || Number(vendor.vendorId) === savedVendorId));
    const saved = eligible.find((vendor) => Number(vendor.vendorId) === savedVendorId);
    const match = (saved ?? eligible.sort((a, b) => estimate(a) - estimate(b))[0] ?? null) as RowDataPacket | null;
    const adminCandidates = includeInternal ? vendors
      .filter((vendor) => String(vendor.category).toLowerCase() === category.toLowerCase()
        && (vendor.availabilityStatus !== 'unavailable' || Number(vendor.vendorId) === savedVendorId))
      .map((vendor) => ({
        ...vendor,
        id: Number(vendor.vendorId),
        estimatedPriceRwf: estimate(vendor),
      })) : [];
    return { need, category, categoryBudget, vendor: match ? {
      ...match,
      id: Number(match.vendorId),
      agreedPriceRwf: agreedPrice?.vendorId === Number(match.vendorId) ? agreedPrice.agreedPriceRwf : null,
      agreedPriceQuantity: agreedPrice?.vendorId === Number(match.vendorId) ? agreedPrice.quantity : null,
      effectivePriceRwf: estimate(match),
    } : null,
      candidates: eligible.map((vendor) => ({ ...vendor, id: Number(vendor.vendorId), estimatedPriceRwf: estimate(vendor) })),
      adminCandidates,
      hasPricedVendor: candidates.length > 0 };
  }));
  const selectedVendors: RowDataPacket[] = recommendations.flatMap((recommendation) => {
    const vendor = recommendation.vendor as RowDataPacket | null;
    return vendor ? [{ ...vendor, need: recommendation.need, candidates: recommendation.candidates,
      adminCandidates: recommendation.adminCandidates,
      estimatedPriceRwf: Number(vendor.effectivePriceRwf) }] : [];
  });
  return { weddingDate: weddingDate ?? null, vendors: selectedVendors, recommendations };
}

async function getVendorChecklist(coupleUserId: number) {
  const [[profiles], [selections], [contracts], [planVendors], [completedRows], illustrative] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT vendor_needs AS vendorNeeds FROM couple_profiles WHERE user_id = ?`, [coupleUserId]),
    pool.query<RowDataPacket[]>(`SELECT s.category, v.id AS vendorId, v.business_name AS vendorName FROM couple_vendor_selections s
      INNER JOIN couple_profiles cp ON cp.user_id = s.couple_user_id AND cp.wedding_date = s.wedding_date
      INNER JOIN vendors v ON v.id = s.vendor_id WHERE s.couple_user_id = ?`, [coupleUserId]),
    pool.query<RowDataPacket[]>(`SELECT v.category, v.id AS vendorId, v.business_name AS vendorName FROM contracts c
      INNER JOIN vendors v ON v.id = c.vendor_id WHERE c.couple_user_id = ? ORDER BY c.updated_at, c.id`, [coupleUserId]),
    pool.query<RowDataPacket[]>(`SELECT a.category, a.vendor_id AS vendorId, COALESCE(v.business_name, a.vendor_name_snapshot) AS vendorName
      FROM wedding_plans p INNER JOIN wedding_plan_allocations a ON a.wedding_plan_id = p.id
      LEFT JOIN vendors v ON v.id = a.vendor_id WHERE p.couple_user_id = ?
        AND p.version = (SELECT MAX(p2.version) FROM wedding_plans p2 WHERE p2.couple_user_id = ?)
        AND COALESCE(v.business_name, a.vendor_name_snapshot) IS NOT NULL`, [coupleUserId, coupleUserId]),
    pool.query<RowDataPacket[]>('SELECT category FROM couple_vendor_checklist WHERE couple_user_id = ? AND is_completed = 1', [coupleUserId]),
    getCoupleVendorAvailability(coupleUserId, false),
  ]);
  const needs = parseVendorNeeds(profiles[0]?.vendorNeeds ?? null);
  const categories = [...new Set(needs.flatMap((need) => vendorCategoriesForNeed[need] ?? []))];
  const vendorByCategory = new Map(selections.map((row) => [String(row.category).toLowerCase(), row]));
  const contractByCategory = new Map(contracts.map((row) => [String(row.category).toLowerCase(), row]));
  const planByCategory = new Map(planVendors.map((row) => [String(row.category).toLowerCase(), row]));
  const illustrativeByCategory = new Map(illustrative.recommendations.flatMap((recommendation) => {
    const vendor = recommendation.vendor as RowDataPacket | null;
    return vendor ? [[String(recommendation.category).toLowerCase(), { vendorId: vendor.id, vendorName: vendor.businessName }] as const] : [];
  }));
  const optionsByCategory = new Map<string, RowDataPacket[]>();
  if (categories.length) {
    const marks = categories.map(() => '?').join(',');
    const [options] = await pool.query<RowDataPacket[]>(`SELECT id AS vendorId, business_name AS businessName, category, location, status
      FROM vendors WHERE category IN (${marks}) ORDER BY business_name`, categories);
    for (const option of options) {
      const key = String(option.category).toLowerCase();
      optionsByCategory.set(key, [...(optionsByCategory.get(key) ?? []), option]);
    }
  }
  const completed = new Set(completedRows.map((row) => String(row.category).toLowerCase()));
  return categories.map((category) => {
    const key = category.toLowerCase();
    const selected = vendorByCategory.get(key);
    const contracted = contractByCategory.get(key);
    const suggested = planByCategory.get(key);
    const illustratedMatch = illustrativeByCategory.get(key);
    const current = selected ?? contracted ?? illustratedMatch ?? suggested;
    const vendorSource = selected ? 'Selected' : contracted ? 'Contracted' : illustratedMatch ? 'Illustrative plan match' : suggested ? 'Budget plan suggestion' : null;
    return {
      category,
      vendorName: current ? String(current.vendorName) : null,
      vendorSource,
      selectedVendorId: current?.vendorId == null ? null : Number(current.vendorId),
      vendorOptions: optionsByCategory.get(key) ?? [],
      completed: completed.has(key),
    };
  });
}
const vendorInputSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(160),
  contactName: z.preprocess((value) => typeof value === 'string' && !value.trim() ? null : value, z.string().trim().max(120).nullable()),
  contactEmail: z.preprocess((value) => typeof value === 'string' && !value.trim() ? null : value, z.string().trim().email().max(254).nullable()),
  phone: z.preprocess((value) => typeof value === 'string' && !value.trim() ? null : value, z.string().trim().max(40).nullable()),
  description: z.string().trim().max(4000),
  serviceDescription: z.string().trim().max(4000),
  colorPalette: z.string().trim().max(255).default(''),
  priceFromRwf: z.preprocess((value) => value === '' || value === undefined ? null : value, z.coerce.number().int().min(0).max(10_000_000_000_000).nullable()),
  priceToRwf: z.preprocess((value) => value === '' || value === undefined ? null : value, z.coerce.number().int().min(0).max(10_000_000_000_000).nullable()),
  pricingBasis: z.enum(['fixed', 'per_guest']).default('fixed'),
}).superRefine((vendor, context) => {
  if (vendor.priceFromRwf !== null && vendor.priceToRwf !== null && vendor.priceFromRwf > vendor.priceToRwf) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['priceToRwf'], message: 'The maximum price must be at least the starting price.' });
  }
  if (vendor.pricingBasis === 'per_guest' && [vendor.priceFromRwf, vendor.priceToRwf].some((price) => price !== null && price > 1_000_000_000)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['priceFromRwf'], message: 'Per-guest prices must not exceed 1,000,000,000 RWF per guest.' });
  }
  const colors = vendor.colorPalette.split(',').map((color) => color.trim()).filter(Boolean);
  if (colors.length > 6 || colors.some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['colorPalette'], message: 'Use up to six hex colors, separated by commas (for example #F4E6D2, #263B35).' });
  }
});
const vendorStatusSchema = z.object({ status: z.enum(['pending', 'active', 'inactive']) });
const vendorApprovalSchema = z.object({ approved: z.boolean() });
const contractInputSchema = z.object({
  coupleUserId: z.coerce.number().int().min(1),
  vendorId: z.coerce.number().int().min(1),
  title: z.string().trim().min(2).max(180),
  amountRwf: z.coerce.number().int().min(1).max(10_000_000_000_000),
  signatureStatus: z.enum(['pending', 'partially_signed', 'fully_signed']),
  contractDate: z.string().trim().max(10).refine((value) => !value || isDateOnly(value), 'Enter a valid contract date.'),
  notes: z.string().trim().max(5000).default(''),
});
const contractStatusSchema = z.object({ signatureStatus: z.enum(['pending', 'partially_signed', 'fully_signed']) });
const budgetReviewSchema = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(1000).default('') });
const budgetAgreedPriceCategories = ['Drinks & Beverage Service', 'Catering', 'Stationery & Invitations', 'Transport', 'Makeup Artist'];
const budgetAgreedPriceSchema = z.object({
  vendorId: z.coerce.number().int().min(1),
  agreedPriceRwf: z.number().int().min(0).max(10_000_000_000_000).nullable(),
  quantity: z.number().int().min(1).max(1_000_000),
});
const vendorAvailabilitySchema = z.object({
  status: z.enum(['not_checked', 'waiting_for_vendor', 'available', 'unavailable', 'approved']),
  internalNote: z.string().trim().max(1000).default(''),
});
const paymentInputSchema = z.object({
  contractId: z.coerce.number().int().min(1),
  amountRwf: z.coerce.number().int().min(1).max(10_000_000_000_000),
  paymentType: z.enum(['deposit', 'installment', 'balance', 'other']),
  status: z.enum(['pending', 'paid']),
  dueDate: z.string().trim().max(10).refine((value) => !value || isDateOnly(value), 'Enter a valid due date.').default(''),
  paidDate: z.string().trim().max(10).refine((value) => !value || isDateOnly(value), 'Enter a valid payment date.').default(''),
  reference: z.string().trim().max(120).default(''),
  note: z.string().trim().max(1000).default(''),
});
const inspirationInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  itemType: z.enum(['theme', 'palette', 'decoration', 'idea']),
  vendorCategory: z.string().trim().max(80).default(''),
  description: z.string().trim().max(5000).default(''),
  priceRwf: z.preprocess((value) => value === '' || value === undefined || value === null ? null : value, z.coerce.number().int().min(0).max(10_000_000_000_000).nullable()).default(null),
  colorPalette: z.string().trim().max(255).default(''),
  isPublished: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).default(false),
}).superRefine((item, context) => {
  const colors = item.colorPalette.split(',').map((color) => color.trim()).filter(Boolean);
  if (colors.length > 6 || colors.some((color) => !/^#[0-9a-fA-F]{6}$/.test(color))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['colorPalette'], message: 'Use up to six hex colors, separated by commas (for example #F4E6D2, #263B35).' });
  }
});
const checklistInputSchema = z.object({
  coupleUserId: z.coerce.number().int().min(1),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(3000).default(''),
  dueDate: z.string().trim().max(10).refine((value) => !value || isDateOnly(value), 'Enter a valid due date.').default(''),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
});
const publicUserColumns = 'id, name, email, role, created_at AS createdAt';
const vendorColumns = `id, business_name AS businessName, category, location, contact_name AS contactName,
  contact_email AS contactEmail, phone, description, service_description AS serviceDescription, color_palette AS colorPalette,
  CASE WHEN image_key IS NOT NULL THEN CONCAT('/api/admin/vendors/', id, '/image') ELSE NULL END AS imageUrl,
  price_from_rwf AS priceFromRwf, price_to_rwf AS priceToRwf, pricing_basis AS pricingBasis, (is_verified = 1) AS isVerified,
  (prices_approved = 1) AS pricesApproved, status, created_at AS createdAt, updated_at AS updatedAt`;

async function getVendor(id: number): Promise<VendorRow | null> {
  const [rows] = await pool.query<VendorRow[]>(`SELECT ${vendorColumns} FROM vendors WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

function readResourceId(rawId: string, res: Response, resource = 'vendor'): number | null {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: `Invalid ${resource} ID.` }); return null; }
  return id;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sniffUploadMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

async function savePrivateFile(file: Express.Multer.File, allowedMimeTypes: string[]): Promise<{ key: string; mimeType: string }> {
  const mimeType = sniffUploadMime(file.buffer);
  if (!mimeType || !allowedMimeTypes.includes(mimeType)) throw new UploadValidationError('Unsupported file. Upload a valid PDF, JPG, or PNG file.');
  const extension = mimeType === 'application/pdf' ? '.pdf' : mimeType === 'image/png' ? '.png' : '.jpg';
  const key = `${randomUUID()}${extension}`;
  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(path.join(uploadDirectory, key), file.buffer, { flag: 'wx' });
  return { key, mimeType };
}

function originalUploadName(name: string): string {
  const safe = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (safe || 'uploaded-document').slice(0, 255);
}

function sendPrivateDownload(res: Response, key: string, originalName: string, mimeType: string): void {
  if (!/^[a-f0-9-]+\.(pdf|png|jpg)$/.test(key)) { res.status(404).json({ error: 'File not found.' }); return; }
  const absolutePath = path.join(uploadDirectory, key);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(mimeType);
  res.download(absolutePath, originalName, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: 'File not found.' });
  });
}

async function saveInspirationImage(file: Express.Multer.File): Promise<{ key: string; mimeType: string }> {
  const mimeType = sniffUploadMime(file.buffer);
  if (!mimeType || !['image/jpeg', 'image/png'].includes(mimeType)) throw new UploadValidationError('Upload a valid JPG or PNG image.');
  const extension = mimeType === 'image/png' ? '.png' : '.jpg';
  const key = `${randomUUID()}${extension}`;
  await fs.mkdir(inspirationImageDirectory, { recursive: true });
  await fs.writeFile(path.join(inspirationImageDirectory, key), file.buffer, { flag: 'wx' });
  return { key, mimeType };
}

async function saveVendorImage(file: Express.Multer.File): Promise<{ key: string; mimeType: string }> {
  const mimeType = sniffUploadMime(file.buffer);
  if (!mimeType || !['image/jpeg', 'image/png'].includes(mimeType)) throw new UploadValidationError('Upload a valid JPG or PNG vendor photo.');
  const extension = mimeType === 'image/png' ? '.png' : '.jpg';
  const key = `${randomUUID()}${extension}`;
  await fs.mkdir(vendorImageDirectory, { recursive: true });
  await fs.writeFile(path.join(vendorImageDirectory, key), file.buffer, { flag: 'wx' });
  return { key, mimeType };
}

function sendInspirationImage(res: Response, key: string, mimeType: string): void {
  if (!/^[a-f0-9-]+\.(png|jpg)$/.test(key) || !['image/jpeg', 'image/png'].includes(mimeType)) { res.status(404).end(); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.type(mimeType);
  res.sendFile(path.join(inspirationImageDirectory, key), (error) => {
    if (error && !res.headersSent) res.status(404).end();
  });
}

function sendVendorImage(res: Response, key: string, mimeType: string): void {
  if (!/^[a-f0-9-]+\.(png|jpg)$/.test(key) || !['image/jpeg', 'image/png'].includes(mimeType)) { res.status(404).end(); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.type(mimeType);
  res.sendFile(path.join(vendorImageDirectory, key), (error) => {
    if (error && !res.headersSent) res.status(404).end();
  });
}

async function getUser(id: number): Promise<UserRow | null> {
  const [rows] = await pool.query<UserRow[]>(`SELECT ${publicUserColumns} FROM users WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) { res.status(401).json({ error: 'Please sign in to continue.' }); return; }
  try {
    const user = await getUser(req.session.userId);
    if (!user) { res.status(401).json({ error: 'Please sign in to continue.' }); return; }
    req.user = user;
    next();
  } catch (error) { next(error); }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') { res.status(403).json({ error: 'Administrator access required.' }); return; }
  next();
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/auth/me', async (req, res, next) => {
  try { res.json({ user: req.session.userId ? await getUser(req.session.userId) : null }); }
  catch (error) { next(error); }
});

app.post('/api/auth/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your details.' }); return; }
  const { name, email, password } = parsed.data;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email.toLowerCase(), passwordHash, 'couple'],
    );
    await connection.execute('INSERT INTO couple_profiles (user_id) VALUES (?)', [result.insertId]);
    await connection.commit();
    req.session.regenerate((sessionError) => {
      if (sessionError) { next(sessionError); return; }
      req.session.userId = result.insertId;
      req.session.save(async (saveError) => {
        if (saveError) { next(saveError); return; }
        try { res.status(201).json({ user: await getUser(result.insertId) }); }
        catch (error) { next(error); }
      });
    });
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') { res.status(409).json({ error: 'An account with that email already exists.' }); return; }
    next(error);
  } finally { connection.release(); }
});

app.post('/api/auth/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Enter a valid email and password.' }); return; }
  try {
    const [rows] = await pool.query<(UserRow & { passwordHash: string })[]>(
      `SELECT ${publicUserColumns}, password_hash AS passwordHash FROM users WHERE email = ?`, [parsed.data.email.toLowerCase()],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: 'Email or password is incorrect.' }); return;
    }
    req.session.regenerate((error) => {
      if (error) { next(error); return; }
      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) { next(saveError); return; }
        const { passwordHash: _passwordHash, ...publicUser } = user;
        res.json({ user: publicUser });
      });
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) { next(error); return; }
    res.clearCookie('mywedding.sid', { httpOnly: true, sameSite: 'lax', secure: production });
    res.json({ ok: true });
  });
});

app.get('/api/couple/profile', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try {
    const [rows] = await pool.query<import('./db.js').CoupleProfileRow[]>(
      'SELECT budget_rwf AS budgetRwf, guest_count AS guestCount, DATE_FORMAT(wedding_date, \'%Y-%m-%d\') AS weddingDate, location, style, special_requirements AS specialRequirements, other_costs_description AS otherCostsDescription, wedding_format AS weddingFormat, vendor_needs AS vendorNeeds FROM couple_profiles WHERE user_id = ?',
      [req.user.id],
    );
    res.json({ profile: rows[0] ? { ...rows[0], vendorNeeds: parseVendorNeeds(rows[0].vendorNeeds) } : null });
  } catch (error) { next(error); }
});

app.get('/api/couple/vendor-recommendations', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try { const data = await getCoupleVendorAvailability(req.user.id, false); res.json({ recommendations: data.recommendations }); }
  catch (error) { next(error); }
});

app.put('/api/couple/profile', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  const parsed = weddingDetailsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check your wedding details.' }); return; }
  const details = parsed.data;
  try {
    await pool.execute(
      `INSERT INTO couple_profiles (user_id, budget_rwf, guest_count, wedding_date, location, style, special_requirements, other_costs_description, wedding_format, vendor_needs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE budget_rwf = VALUES(budget_rwf), guest_count = VALUES(guest_count),
       wedding_date = VALUES(wedding_date), location = VALUES(location), style = VALUES(style),
       special_requirements = VALUES(special_requirements), other_costs_description = VALUES(other_costs_description),
       wedding_format = VALUES(wedding_format), vendor_needs = VALUES(vendor_needs)`,
      [req.user.id, details.budgetRwf, details.guestCount, details.weddingDate || null, details.location, details.style || null, details.specialRequirements || null, details.otherCostsDescription || null, details.weddingFormat, JSON.stringify(details.vendorNeeds)],
    );
    const [rows] = await pool.query<import('./db.js').CoupleProfileRow[]>(
      'SELECT budget_rwf AS budgetRwf, guest_count AS guestCount, DATE_FORMAT(wedding_date, \'%Y-%m-%d\') AS weddingDate, location, style, special_requirements AS specialRequirements, other_costs_description AS otherCostsDescription, wedding_format AS weddingFormat, vendor_needs AS vendorNeeds FROM couple_profiles WHERE user_id = ?',
      [req.user.id],
    );
    res.json({ profile: rows[0] ? { ...rows[0], vendorNeeds: parseVendorNeeds(rows[0].vendorNeeds) } : null });
  } catch (error) { next(error); }
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [[accounts], [profiles], [vendors], [contracts], [payments]] = await Promise.all([
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS totalUsers, COALESCE(SUM(role = 'couple'), 0) AS coupleAccounts FROM users"),
      pool.query<RowDataPacket[]>("SELECT COUNT(*) AS weddingBriefs FROM couple_profiles WHERE budget_rwf IS NOT NULL AND guest_count IS NOT NULL"),
      pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS totalVendors, COALESCE(SUM(is_verified = 1), 0) AS verifiedVendors,
        COALESCE(SUM(is_verified = 0), 0) AS awaitingVerification,
        COALESCE(SUM(prices_approved = 0 AND (price_from_rwf IS NOT NULL OR price_to_rwf IS NOT NULL)), 0) AS pricesToReview FROM vendors`),
      pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS totalContracts,
        COALESCE(SUM(signature_status = 'pending'), 0) AS unsignedContracts,
        COALESCE(SUM(signature_status = 'partially_signed'), 0) AS partiallySignedContracts FROM contracts`),
      pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount_rwf ELSE 0 END), 0) AS pendingPaymentRwf,
        COALESCE(SUM(p.status = 'pending' AND p.due_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY)), 0) AS paymentsDueSoon FROM payments p`),
    ]);
    res.json({ ...accounts[0], ...profiles[0], ...vendors[0], ...contracts[0], ...payments[0] });
  } catch (error) { next(error); }
});

app.get('/api/admin/notifications', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [vendors] = await pool.query<RowDataPacket[]>(`SELECT CONCAT('vendor-verify-', v.id) AS id, 'vendor_verification' AS type,
      CONCAT('Verify ', v.business_name) AS title, CONCAT(v.category, ' · Business details need review.') AS detail,
      v.updated_at AS createdAt FROM vendors v WHERE v.is_verified = 0 AND v.status <> 'inactive'
      ORDER BY v.updated_at DESC LIMIT 50`);
    const [prices] = await pool.query<RowDataPacket[]>(`SELECT CONCAT('vendor-price-', v.id) AS id, 'vendor_price' AS type,
      CONCAT('Review price for ', v.business_name) AS title, CONCAT(v.category, ' · ', v.location) AS detail,
      v.updated_at AS createdAt FROM vendors v WHERE v.is_verified = 1 AND v.prices_approved = 0 AND v.status = 'active'
      ORDER BY v.updated_at DESC LIMIT 50`);
    const [plans] = await pool.query<RowDataPacket[]>(`SELECT CONCAT('plan-', p.id) AS id, 'wedding_plan' AS type,
      CONCAT('Review wedding plan for ', u.name) AS title, CONCAT('Version ', p.version, ' · ', FORMAT(p.planned_total_rwf, 0), ' RWF proposed') AS detail,
      p.generated_at AS createdAt FROM wedding_plans p JOIN users u ON u.id = p.couple_user_id
      WHERE p.status = 'proposed' ORDER BY p.generated_at DESC LIMIT 50`);
    const [contracts] = await pool.query<RowDataPacket[]>(`SELECT CONCAT('contract-', c.id) AS id, 'contract' AS type,
      CONCAT('Contract needs signatures: ', c.title) AS title, CONCAT(u.name, ' · ', v.business_name, ' · ', c.signature_status) AS detail,
      c.updated_at AS createdAt FROM contracts c JOIN users u ON u.id = c.couple_user_id JOIN vendors v ON v.id = c.vendor_id
      WHERE c.signature_status <> 'fully_signed' ORDER BY c.updated_at DESC LIMIT 50`);
    const [payments] = await pool.query<RowDataPacket[]>(`SELECT CONCAT('payment-', p.id) AS id, 'payment' AS type,
      CONCAT('Payment pending for ', c.title) AS title, CONCAT(u.name, ' · ', FORMAT(p.amount_rwf, 0), ' RWF',
      IF(p.due_date IS NULL, '', CONCAT(' · Due ', DATE_FORMAT(p.due_date, '%e %b %Y')))) AS detail,
      p.updated_at AS createdAt FROM payments p JOIN contracts c ON c.id = p.contract_id JOIN users u ON u.id = c.couple_user_id
      WHERE p.status = 'pending' ORDER BY COALESCE(p.due_date, p.updated_at) ASC LIMIT 50`);
    const notifications = [...vendors, ...prices, ...plans, ...contracts, ...payments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ notifications });
  } catch (error) { next(error); }
});

app.get('/api/admin/couples', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.name, u.email, cp.guest_count AS guestCount, cp.budget_rwf AS budgetRwf,
        DATE_FORMAT(cp.wedding_date, '%Y-%m-%d') AS weddingDate, cp.location, cp.style,
        cp.special_requirements AS specialRequirements, cp.vendor_needs AS vendorNeeds,
        cp.user_id IS NOT NULL AS hasWeddingDetails
       FROM users u LEFT JOIN couple_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'couple' ORDER BY u.name, u.email`,
    );
    res.json({ couples: rows.map((row) => ({ ...row, vendorNeeds: parseVendorNeeds(row.vendorNeeds) })) });
  } catch (error) { next(error); }
});

app.get('/api/admin/couples/:id/vendor-checklist', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.id, res, 'couple');
  if (coupleUserId === null) return;
  try {
    const [[couples], tasks] = await Promise.all([
      pool.query<RowDataPacket[]>(`SELECT u.id, u.name, u.email, cp.guest_count AS guestCount, cp.budget_rwf AS budgetRwf,
        DATE_FORMAT(cp.wedding_date, '%Y-%m-%d') AS weddingDate, cp.location, cp.style,
        cp.wedding_format AS weddingFormat, cp.special_requirements AS specialRequirements,
        cp.other_costs_description AS otherCostsDescription
        FROM users u LEFT JOIN couple_profiles cp ON cp.user_id = u.id WHERE u.id = ? AND u.role = 'couple'`, [coupleUserId]),
      getVendorChecklist(coupleUserId),
    ]);
    if (!couples.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
    res.json({ couple: couples[0], tasks });
  } catch (error) { next(error); }
});

app.put('/api/admin/couples/:id/vendor-checklist/:category/selection', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.id, res, 'couple');
  if (coupleUserId === null) return;
  const parsed = z.object({ vendorId: z.number().int().positive().nullable() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose a vendor from the directory.' }); return; }
  try {
    const category = decodeURIComponent(req.params.category);
    const tasks = await getVendorChecklist(coupleUserId);
    if (!tasks.some((task) => task.category === category)) { res.status(404).json({ error: 'Vendor category not found for this couple.' }); return; }
    if (parsed.data.vendorId === null) {
      await pool.execute('DELETE FROM couple_vendor_selections WHERE couple_user_id = ? AND category = ?', [coupleUserId, category]);
      res.json({ updated: true });
      return;
    }
    const [profiles] = await pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(wedding_date, '%Y-%m-%d') AS weddingDate FROM couple_profiles WHERE user_id = ?`, [coupleUserId]);
    if (!profiles[0]?.weddingDate) { res.status(400).json({ error: 'Set the wedding date before assigning a vendor.' }); return; }
    const [vendors] = await pool.query<RowDataPacket[]>(`SELECT id FROM vendors WHERE id = ? AND LOWER(category) = LOWER(?) AND status IN ('active','pending')`, [parsed.data.vendorId, category]);
    if (!vendors.length) { res.status(404).json({ error: 'Choose an active vendor in this category.' }); return; }
    await pool.execute(`INSERT INTO couple_vendor_selections (couple_user_id, wedding_date, category, vendor_id, updated_by)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE vendor_id = VALUES(vendor_id), updated_by = VALUES(updated_by)`,
    [coupleUserId, profiles[0].weddingDate, category, parsed.data.vendorId, req.user!.id]);
    res.json({ updated: true });
  } catch (error) { next(error); }
});

app.put('/api/admin/couples/:id/vendor-checklist/:category', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.id, res, 'couple');
  if (coupleUserId === null) return;
  const parsed = z.object({ completed: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose whether this vendor item is complete.' }); return; }
  try {
    const category = decodeURIComponent(req.params.category);
    const tasks = await getVendorChecklist(coupleUserId);
    if (!tasks.some((task) => task.category === category)) { res.status(404).json({ error: 'Vendor item not found for this couple.' }); return; }
    await pool.execute(`INSERT INTO couple_vendor_checklist (couple_user_id, category, is_completed, updated_by)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE is_completed = VALUES(is_completed), updated_by = VALUES(updated_by)`,
    [coupleUserId, category, Number(parsed.data.completed), req.user!.id]);
    res.json({ updated: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/inspiration', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [items] = await pool.query<RowDataPacket[]>(`SELECT id, title, item_type AS itemType, vendor_category AS vendorCategory, description, price_rwf AS priceRwf,
      color_palette AS colorPalette, CASE WHEN image_key IS NOT NULL THEN CONCAT('/api/admin/inspiration/', id, '/image') ELSE image_url END AS imageUrl,
      (is_published = 1) AS isPublished, created_at AS createdAt, updated_at AS updatedAt
      FROM inspiration_items ORDER BY updated_at DESC, id DESC`);
    res.json({ items });
  } catch (error) { next(error); }
});

app.get('/api/couple/inspiration', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try {
    const [items] = await pool.query<RowDataPacket[]>(`SELECT id, title, item_type AS itemType, vendor_category AS vendorCategory, description, price_rwf AS priceRwf,
      color_palette AS colorPalette, CASE WHEN image_key IS NOT NULL THEN CONCAT('/api/couple/inspiration/', id, '/image') ELSE image_url END AS imageUrl,
      updated_at AS updatedAt FROM inspiration_items ORDER BY updated_at DESC, id DESC`);
    res.json({ items });
  } catch (error) { next(error); }
});

app.get('/api/couple/vendors', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try {
    const [vendors] = await pool.query<RowDataPacket[]>(`SELECT id, business_name AS businessName, category, location,
      service_description AS serviceDescription, price_from_rwf AS priceFromRwf, price_to_rwf AS priceToRwf,
      pricing_basis AS pricingBasis, color_palette AS colorPalette,
      CASE WHEN image_key IS NOT NULL THEN CONCAT('/api/couple/vendors/', id, '/image') ELSE NULL END AS imageUrl
      FROM vendors WHERE status = 'active' AND is_verified = 1 AND prices_approved = 1
        AND (price_from_rwf IS NOT NULL OR price_to_rwf IS NOT NULL)
      ORDER BY category, business_name`);
    res.json({ vendors });
  } catch (error) { next(error); }
});

app.get('/api/couple/vendors/:id/image', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).end(); return; }
  const id = readResourceId(req.params.id, res, 'vendor');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT image_key AS imageKey, image_mime_type AS imageMimeType
      FROM vendors WHERE id = ? AND status = 'active' AND is_verified = 1 AND prices_approved = 1
        AND image_key IS NOT NULL`, [id]);
    if (!rows.length) { res.status(404).end(); return; }
    sendVendorImage(res, rows[0].imageKey, rows[0].imageMimeType);
  } catch (error) { next(error); }
});

app.get('/api/couple/inspiration/:id/image', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).end(); return; }
  const id = readResourceId(req.params.id, res, 'inspiration item');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT image_key AS imageKey, image_mime_type AS imageMimeType FROM inspiration_items WHERE id = ? AND image_key IS NOT NULL', [id]);
    if (!rows.length) { res.status(404).end(); return; }
    sendInspirationImage(res, rows[0].imageKey, rows[0].imageMimeType);
  } catch (error) { next(error); }
});

app.get('/api/admin/inspiration/:id/image', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'inspiration item');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT image_key AS imageKey, image_mime_type AS imageMimeType FROM inspiration_items WHERE id = ? AND image_key IS NOT NULL', [id]);
    if (!rows.length) { res.status(404).end(); return; }
    sendInspirationImage(res, rows[0].imageKey, rows[0].imageMimeType);
  } catch (error) { next(error); }
});

app.post('/api/admin/inspiration', requireAuth, requireAdmin, inspirationImageUpload.single('image'), async (req, res, next) => {
  const parsed = inspirationInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the inspiration details.' }); return; }
  const item = parsed.data;
  let storedImage: { key: string; mimeType: string } | null = null;
  try {
    if (req.file) storedImage = await saveInspirationImage(req.file);
    const [result] = await pool.execute<ResultSetHeader>(`INSERT INTO inspiration_items
      (title, item_type, vendor_category, description, price_rwf, color_palette, reference_url, image_url, image_key, image_mime_type, image_filename, is_published, created_by)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`, [item.title, item.itemType, item.vendorCategory || null, item.description, item.priceRwf, item.colorPalette || null,
      storedImage?.key ?? null, storedImage?.mimeType ?? null, req.file ? originalUploadName(req.file.originalname) : null,
      Number(item.isPublished), req.user!.id]);
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (storedImage) await fs.unlink(path.join(inspirationImageDirectory, storedImage.key)).catch(() => undefined);
    next(error);
  }
});

app.put('/api/admin/inspiration/:id', requireAuth, requireAdmin, inspirationImageUpload.single('image'), async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'inspiration item');
  if (id === null) return;
  const parsed = inspirationInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the inspiration details.' }); return; }
  const item = parsed.data;
  let storedImage: { key: string; mimeType: string } | null = null;
  try {
    const [existing] = await pool.query<RowDataPacket[]>('SELECT image_key AS imageKey FROM inspiration_items WHERE id = ?', [id]);
    if (!existing.length) { res.status(404).json({ error: 'Inspiration item not found.' }); return; }
    if (req.file) storedImage = await saveInspirationImage(req.file);
    const removeImage = req.body.removeImage === 'true' || req.body.removeImage === 'on';
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE inspiration_items SET title = ?, item_type = ?, vendor_category = ?, description = ?, price_rwf = ?,
      color_palette = ?, reference_url = NULL, image_url = IF(? = 1, NULL, image_url),
      image_key = IF(? = 1, ?, image_key), image_mime_type = IF(? = 1, ?, image_mime_type),
      image_filename = IF(? = 1, ?, image_filename), is_published = ? WHERE id = ?`, [item.title, item.itemType,
      item.vendorCategory || null, item.description, item.priceRwf, item.colorPalette || null, Number(Boolean(storedImage) || removeImage), Number(Boolean(storedImage) || removeImage),
      storedImage?.key ?? null, Number(Boolean(storedImage) || removeImage), storedImage?.mimeType ?? null,
      Number(Boolean(storedImage) || removeImage), req.file ? originalUploadName(req.file.originalname) : null,
      Number(item.isPublished), id]);
    if (!result.affectedRows) { res.status(404).json({ error: 'Inspiration item not found.' }); return; }
    if (existing[0].imageKey && (storedImage || removeImage)) await fs.unlink(path.join(inspirationImageDirectory, existing[0].imageKey)).catch(() => undefined);
    res.json({ updated: true });
  } catch (error) {
    if (storedImage) await fs.unlink(path.join(inspirationImageDirectory, storedImage.key)).catch(() => undefined);
    next(error);
  }
});

app.get('/api/admin/checklists', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [tasks] = await pool.query<RowDataPacket[]>(`SELECT t.id, t.couple_user_id AS coupleUserId,
      u.name AS coupleName, u.email AS coupleEmail, t.title, t.description,
      DATE_FORMAT(t.due_date, '%Y-%m-%d') AS dueDate, t.status,
      DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i') AS updatedAt
      FROM checklist_tasks t INNER JOIN users u ON u.id = t.couple_user_id
      ORDER BY (t.status = 'completed'), (t.due_date IS NULL), t.due_date, u.name, t.title`);
    res.json({ tasks });
  } catch (error) { next(error); }
});

app.post('/api/admin/checklists', requireAuth, requireAdmin, async (req, res, next) => {
  const parsed = checklistInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the checklist task details.' }); return; }
  const task = parsed.data;
  try {
    const [couples] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id = ? AND role = 'couple'", [task.coupleUserId]);
    if (!couples.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
    const [result] = await pool.execute<ResultSetHeader>(`INSERT INTO checklist_tasks
      (couple_user_id, title, description, due_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [task.coupleUserId, task.title, task.description || null, task.dueDate || null, task.status, req.user!.id]);
    res.status(201).json({ id: result.insertId });
  } catch (error) { next(error); }
});

app.put('/api/admin/checklists/:id', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'checklist task');
  if (id === null) return;
  const parsed = checklistInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the checklist task details.' }); return; }
  const task = parsed.data;
  try {
    const [couples] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id = ? AND role = 'couple'", [task.coupleUserId]);
    if (!couples.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE checklist_tasks SET couple_user_id = ?, title = ?, description = ?,
      due_date = ?, status = ? WHERE id = ?`, [task.coupleUserId, task.title, task.description || null, task.dueDate || null, task.status, id]);
    if (!result.affectedRows) { res.status(404).json({ error: 'Checklist task not found.' }); return; }
    res.json({ updated: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/budget-plans', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT u.id AS coupleUserId, u.name AS coupleName, u.email AS coupleEmail,
      cp.budget_rwf AS requestedBudgetRwf, cp.guest_count AS guestCount, cp.location,
      cp.wedding_format AS weddingFormat, cp.vendor_needs AS vendorNeeds,
      cp.other_costs_description AS otherCostsDescription,
      DATE_FORMAT(cp.wedding_date, '%Y-%m-%d') AS weddingDate,
      DATE_FORMAT(cp.created_at, '%Y-%m-%d') AS requestDate,
      p.id AS planId, p.version, p.planned_total_rwf AS plannedTotalRwf, p.is_over_budget AS isOverBudget,
      p.status, p.review_note AS reviewNote, DATE_FORMAT(p.generated_at, '%Y-%m-%d %H:%i') AS generatedAt
      FROM users u INNER JOIN couple_profiles cp ON cp.user_id = u.id
      LEFT JOIN wedding_plans p ON p.couple_user_id = u.id AND p.version = (
        SELECT MAX(latest.version) FROM wedding_plans latest WHERE latest.couple_user_id = u.id
      ) WHERE u.role = 'couple' AND cp.budget_rwf IS NOT NULL AND cp.guest_count IS NOT NULL
      ORDER BY (p.status = 'proposed') DESC, p.is_over_budget DESC, p.generated_at DESC, u.name`);
    const planIds = rows.map((row) => row.planId).filter((id) => id !== null);
    let allocations: RowDataPacket[] = [];
    if (planIds.length) {
      const marks = planIds.map(() => '?').join(',');
      [allocations] = await pool.query<RowDataPacket[]>(`SELECT a.wedding_plan_id AS planId, a.category,
        a.allocation_percent AS percent, a.target_amount_rwf AS targetAmountRwf,
        a.planned_amount_rwf AS plannedAmountRwf, a.vendor_id AS vendorId,
        a.vendor_name_snapshot AS vendorName, a.verified_price_from_rwf AS verifiedPriceFromRwf,
        a.vendor_estimate_rwf AS vendorEstimateRwf, a.pricing_basis AS pricingBasis,
        a.price_source AS priceSource FROM wedding_plan_allocations a WHERE a.wedding_plan_id IN (${marks}) ORDER BY a.id`, planIds);
    }
    const byPlan = new Map<number, RowDataPacket[]>();
    for (const allocation of allocations) {
      const items = byPlan.get(Number(allocation.planId)) ?? [];
      items.push(allocation); byPlan.set(Number(allocation.planId), items);
    }
    const coupleIds = rows.map((row) => Number(row.coupleUserId));
    let adminSelections: RowDataPacket[] = [];
    if (coupleIds.length) {
      const marks = coupleIds.map(() => '?').join(',');
      [adminSelections] = await pool.query<RowDataPacket[]>(`SELECT couple_user_id AS coupleUserId, category, vendor_id AS vendorId
        FROM admin_budget_vendor_selections WHERE couple_user_id IN (${marks})`, coupleIds);
    }
    const selectionsByCouple = new Map<number, Record<string, number>>();
    for (const selection of adminSelections) {
      const selectedByCategory = selectionsByCouple.get(Number(selection.coupleUserId)) ?? {};
      selectedByCategory[String(selection.category)] = Number(selection.vendorId);
      selectionsByCouple.set(Number(selection.coupleUserId), selectedByCategory);
    }
    let agreedPriceRows: RowDataPacket[] = [];
    if (coupleIds.length) {
      const marks = coupleIds.map(() => '?').join(',');
      [agreedPriceRows] = await pool.query<RowDataPacket[]>(`SELECT couple_user_id AS coupleUserId,
        category, vendor_id AS vendorId, agreed_price_rwf AS agreedPriceRwf, quantity
        FROM admin_budget_vendor_agreed_prices WHERE couple_user_id IN (${marks})`, coupleIds);
    }
    const agreedPricesByCouple = new Map<number, Record<string, { vendorId: number; agreedPriceRwf: number | string; quantity: number }>>();
    for (const item of agreedPriceRows) {
      const prices = agreedPricesByCouple.get(Number(item.coupleUserId)) ?? {};
      prices[String(item.category)] = {
        vendorId: Number(item.vendorId),
        agreedPriceRwf: item.agreedPriceRwf,
        quantity: Number(item.quantity),
      };
      agreedPricesByCouple.set(Number(item.coupleUserId), prices);
    }
    res.json({ plans: rows.map((row) => ({ ...row, vendorNeeds: parseVendorNeeds(row.vendorNeeds),
      allocations: row.planId ? byPlan.get(Number(row.planId)) ?? [] : [],
      adminVendorSelections: selectionsByCouple.get(Number(row.coupleUserId)) ?? {},
      agreedPrices: agreedPricesByCouple.get(Number(row.coupleUserId)) ?? {} })) });
  } catch (error) { next(error); }
});

app.post('/api/admin/budget-plans/:coupleUserId/generate', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.coupleUserId, res, 'couple');
  if (coupleUserId === null) return;
  let connection;
  try {
    const [profiles] = await pool.query<RowDataPacket[]>(`SELECT cp.budget_rwf AS budgetRwf, cp.guest_count AS guestCount,
      DATE_FORMAT(cp.wedding_date, '%Y-%m-%d') AS weddingDate FROM couple_profiles cp
      INNER JOIN users u ON u.id = cp.user_id WHERE cp.user_id = ? AND u.role = 'couple'
      AND cp.budget_rwf IS NOT NULL AND cp.guest_count IS NOT NULL`, [coupleUserId]);
    if (!profiles.length) { res.status(404).json({ error: 'Complete wedding budget and guest details before generating a plan.' }); return; }
    const [vendors] = await pool.query<RowDataPacket[]>(`SELECT id, business_name AS businessName, category,
      COALESCE(price_from_rwf, price_to_rwf) AS priceFromRwf, pricing_basis AS pricingBasis
      FROM vendors WHERE status IN ('active', 'pending')`);
    const selectedVendorIds: Record<string, number | null> = {};
    const [adminSelections] = await pool.query<RowDataPacket[]>('SELECT category, vendor_id AS vendorId FROM admin_budget_vendor_selections WHERE couple_user_id = ?', [coupleUserId]);
    Object.assign(selectedVendorIds, Object.fromEntries(adminSelections.map((selection) => [String(selection.category), Number(selection.vendorId)])));
    const [agreedPrices] = await pool.query<RowDataPacket[]>(`SELECT category, vendor_id AS vendorId,
      agreed_price_rwf AS agreedPriceRwf, quantity FROM admin_budget_vendor_agreed_prices WHERE couple_user_id = ?`, [coupleUserId]);
    if (req.body?.selectedVendorIds && typeof req.body.selectedVendorIds === 'object' && !Array.isArray(req.body.selectedVendorIds)) {
      Object.assign(selectedVendorIds, req.body.selectedVendorIds);
    }
    const generated = generateAllocations(Number(profiles[0].budgetRwf), Number(profiles[0].guestCount), vendors as never[], selectedVendorIds);
    const activeAgreedPrices = new Set<string>();
    for (const agreedPrice of agreedPrices) {
      const category = String(agreedPrice.category);
      const vendorId = Number(agreedPrice.vendorId);
      if (!budgetAgreedPriceCategories.includes(category) || selectedVendorIds[category] !== vendorId) continue;
      const allocation = generated.allocations.find((item) => item.category === category && item.vendorId === vendorId);
      if (!allocation) continue;
      const agreedUnitPrice = Number(agreedPrice.agreedPriceRwf);
      const agreedTotal = agreedUnitPrice * Number(agreedPrice.quantity);
      if (!Number.isSafeInteger(agreedTotal)) {
        res.status(400).json({ error: `The agreed price for ${category} is too large.` });
        return;
      }
      allocation.plannedAmountRwf = agreedTotal;
      allocation.verifiedPriceFromRwf = agreedUnitPrice;
      allocation.vendorEstimateRwf = agreedTotal;
      allocation.pricingBasis = 'fixed';
      activeAgreedPrices.add(category);
    }
    generated.plannedTotalRwf = generated.allocations.reduce((total, item) => total + item.plannedAmountRwf, 0);
    generated.isOverBudget = generated.plannedTotalRwf > Number(profiles[0].budgetRwf);
    generated.missingPriceCategories = generated.missingPriceCategories.filter((category) => !activeAgreedPrices.has(category));
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [versions] = await connection.query<RowDataPacket[]>('SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM wedding_plans WHERE couple_user_id = ?', [coupleUserId]);
    const version = Number(versions[0].nextVersion);
    const [insert] = await connection.execute<ResultSetHeader>(`INSERT INTO wedding_plans
      (couple_user_id, version, requested_budget_rwf, planned_total_rwf, is_over_budget, generated_by)
      VALUES (?, ?, ?, ?, ?, ?)`, [coupleUserId, version, Number(profiles[0].budgetRwf), generated.plannedTotalRwf,
      Number(generated.isOverBudget), req.user!.id]);
    for (const item of generated.allocations) {
      await connection.execute(`INSERT INTO wedding_plan_allocations
        (wedding_plan_id, category, allocation_percent, target_amount_rwf, planned_amount_rwf, vendor_id,
         vendor_name_snapshot, verified_price_from_rwf, vendor_estimate_rwf, pricing_basis, price_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [insert.insertId, item.category, item.percent, item.targetAmountRwf, item.plannedAmountRwf, item.vendorId,
        item.vendorName, item.verifiedPriceFromRwf, item.vendorEstimateRwf, item.pricingBasis, item.priceSource]);
    }
    await connection.commit();
    res.status(201).json({ planId: insert.insertId, version, plannedTotalRwf: generated.plannedTotalRwf,
      requestedBudgetRwf: Number(profiles[0].budgetRwf), isOverBudget: generated.isOverBudget,
      missingPriceCategories: generated.missingPriceCategories });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => undefined);
    next(error);
  } finally { connection?.release(); }
});

app.put('/api/admin/budget-plans/:coupleUserId/agreed-price/:category', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.coupleUserId, res, 'couple');
  if (coupleUserId === null) return;
  const category = decodeURIComponent(req.params.category ?? '').trim();
  const parsed = budgetAgreedPriceSchema.safeParse(req.body);
  if (!budgetAgreedPriceCategories.includes(category)) {
    res.status(400).json({ error: 'Agreed prices are supported for beverages, catering, invitations, transport, and makeup.' });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the agreed price.' });
    return;
  }
  if (category === 'Makeup Artist' && parsed.data.agreedPriceRwf !== null
    && !Number.isSafeInteger(parsed.data.agreedPriceRwf * parsed.data.quantity)) {
    res.status(400).json({ error: 'The makeup total is too large. Check the price and number of people.' });
    return;
  }
  try {
    const [selectedVendor] = await pool.query<RowDataPacket[]>(`SELECT vendor_id AS vendorId FROM admin_budget_vendor_selections
      WHERE couple_user_id = ? AND category = ?`, [coupleUserId, category]);
    if (Number(selectedVendor[0]?.vendorId) !== parsed.data.vendorId) {
      res.status(400).json({ error: 'Select this vendor for the category before saving its agreed price.' });
      return;
    }
    if (parsed.data.agreedPriceRwf === null) {
      await pool.execute('DELETE FROM admin_budget_vendor_agreed_prices WHERE couple_user_id = ? AND category = ?',
        [coupleUserId, category]);
    } else {
      const quantity = category === 'Makeup Artist' ? parsed.data.quantity : 1;
      const [couples] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id = ? AND role = 'couple'", [coupleUserId]);
      if (!couples.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
      await pool.execute(`INSERT INTO admin_budget_vendor_agreed_prices
        (couple_user_id, category, vendor_id, agreed_price_rwf, quantity, updated_by)
        VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE vendor_id = VALUES(vendor_id),
        agreed_price_rwf = VALUES(agreed_price_rwf), quantity = VALUES(quantity),
        updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [coupleUserId, category, parsed.data.vendorId, parsed.data.agreedPriceRwf, quantity, req.user!.id]);
    }
    res.json({ saved: true });
  } catch (error) { next(error); }
});

app.put('/api/admin/budget-plans/:id/review', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'budget plan');
  if (id === null) return;
  const parsed = budgetReviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose approve or reject for this budget plan.' }); return; }
  try {
    const [result] = await pool.execute<ResultSetHeader>(`UPDATE wedding_plans SET status = ?, review_note = ?,
      reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'proposed'`,
    [parsed.data.status, parsed.data.note || null, req.user!.id, id]);
    if (!result.affectedRows) { res.status(404).json({ error: 'Proposed budget plan not found or already reviewed.' }); return; }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/budget-plans/:coupleUserId/vendor-availability', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.coupleUserId, res, 'couple');
  if (coupleUserId === null) return;
  try {
    const [couples] = await pool.query<RowDataPacket[]>("SELECT u.id FROM users u WHERE u.id = ? AND u.role = 'couple'", [coupleUserId]);
    if (!couples.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
    res.json(await getCoupleVendorAvailability(coupleUserId, true));
  } catch (error) { next(error); }
});

app.put('/api/admin/budget-plans/:coupleUserId/vendor-availability/:vendorId', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.coupleUserId, res, 'couple');
  const vendorId = readResourceId(req.params.vendorId, res, 'vendor');
  if (coupleUserId === null || vendorId === null) return;
  const parsed = vendorAvailabilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose a vendor availability status and check the internal note.' }); return; }
  try {
    const [profiles] = await pool.query<RowDataPacket[]>(`SELECT DATE_FORMAT(cp.wedding_date, '%Y-%m-%d') AS weddingDate,
      cp.vendor_needs AS vendorNeeds FROM couple_profiles cp INNER JOIN users u ON u.id = cp.user_id
      WHERE cp.user_id = ? AND u.role = 'couple'`, [coupleUserId]);
    if (!profiles.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
    if (!profiles[0].weddingDate) { res.status(400).json({ error: 'Set the couple’s wedding date before tracking vendor availability.' }); return; }
    const currentMatches = await getCoupleVendorAvailability(coupleUserId, true);
    if (!currentMatches.vendors.some((vendor) => Number((vendor as RowDataPacket).vendorId) === vendorId)) {
      res.status(400).json({ error: 'Availability can only be updated for the vendor currently matched in this couple’s illustrative budget.' }); return;
    }
    if (parsed.data.status === 'approved') {
      const [previous] = await pool.query<RowDataPacket[]>(`SELECT status FROM vendor_date_availability
        WHERE couple_user_id = ? AND vendor_id = ? AND wedding_date = ?`, [coupleUserId, vendorId, profiles[0].weddingDate]);
      if (previous[0]?.status !== 'available') { res.status(400).json({ error: 'Mark the vendor Available after confirming by phone before approving them.' }); return; }
    }
    await pool.execute(`INSERT INTO vendor_date_availability (couple_user_id, vendor_id, wedding_date, status, internal_note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), internal_note = VALUES(internal_note),
      updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
    [coupleUserId, vendorId, profiles[0].weddingDate, parsed.data.status, parsed.data.internalNote || null, req.user!.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.put('/api/admin/budget-plans/:coupleUserId/vendor-selection/:category', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = readResourceId(req.params.coupleUserId, res, 'couple');
  const vendorId = req.body?.vendorId === null ? null : Number(req.body?.vendorId);
  const category = decodeURIComponent(req.params.category ?? '').trim();
  if (coupleUserId === null) return;
  if (!category || !budgetCategories.some((item) => item.category.toLowerCase() === category.toLowerCase())
    || (vendorId !== null && (!Number.isSafeInteger(vendorId) || vendorId < 1))) {
    res.status(400).json({ error: 'Choose a valid budget category and vendor.' }); return;
  }
  try {
    if (vendorId === null) {
      await pool.execute('DELETE FROM admin_budget_vendor_agreed_prices WHERE couple_user_id = ? AND category = ?', [coupleUserId, category]);
      await pool.execute('DELETE FROM admin_budget_vendor_selections WHERE couple_user_id = ? AND category = ?', [coupleUserId, category]);
      res.json({ ok: true }); return;
    }
    const [vendors] = await pool.query<RowDataPacket[]>(`SELECT id FROM vendors WHERE id = ? AND category = ?
      AND status IN ('active', 'pending')`,
    [vendorId, category]);
    if (!vendors.length) { res.status(400).json({ error: 'Choose a non-inactive vendor in this category.' }); return; }
    const [previousSelection] = await pool.query<RowDataPacket[]>('SELECT vendor_id AS vendorId FROM admin_budget_vendor_selections WHERE couple_user_id = ? AND category = ?', [coupleUserId, category]);
    if (Number(previousSelection[0]?.vendorId) !== vendorId) {
      await pool.execute('DELETE FROM admin_budget_vendor_agreed_prices WHERE couple_user_id = ? AND category = ?', [coupleUserId, category]);
    }
    await pool.execute(`INSERT INTO admin_budget_vendor_selections (couple_user_id, category, vendor_id, updated_by)
      VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE vendor_id = VALUES(vendor_id), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
    [coupleUserId, category, vendorId, req.user!.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/couple/vendor-availability', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try { res.json(await getCoupleVendorAvailability(req.user.id, false)); }
  catch (error) { next(error); }
});

app.get('/api/couple/workspace', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try {
    const [planResult, contractResult, paymentResult] = await Promise.all([
      pool.query<RowDataPacket[]>(`SELECT id AS planId, version, requested_budget_rwf AS requestedBudgetRwf,
        planned_total_rwf AS plannedTotalRwf, is_over_budget AS isOverBudget, status, review_note AS reviewNote,
        DATE_FORMAT(generated_at, '%Y-%m-%d') AS generatedAt FROM wedding_plans
        WHERE couple_user_id = ? ORDER BY version DESC LIMIT 1`, [req.user.id]),
      pool.query<RowDataPacket[]>(`SELECT c.id, c.title, c.amount_rwf AS amountRwf, c.signature_status AS signatureStatus,
        c.original_filename AS originalFilename, DATE_FORMAT(c.contract_date, '%Y-%m-%d') AS contractDate,
        v.business_name AS vendorName, COALESCE(paid.total, 0) AS paidRwf,
        GREATEST(c.amount_rwf - COALESCE(paid.total, 0), 0) AS balanceRwf
        FROM contracts c INNER JOIN vendors v ON v.id = c.vendor_id
        LEFT JOIN (SELECT contract_id, SUM(amount_rwf) AS total FROM payments WHERE status = 'paid' GROUP BY contract_id) paid ON paid.contract_id = c.id
        WHERE c.couple_user_id = ? ORDER BY c.created_at DESC`, [req.user.id]),
      pool.query<RowDataPacket[]>(`SELECT p.id, p.amount_rwf AS amountRwf, p.payment_type AS paymentType, p.status,
        DATE_FORMAT(p.due_date, '%Y-%m-%d') AS dueDate, DATE_FORMAT(p.paid_date, '%Y-%m-%d') AS paidDate,
        (p.evidence_key IS NOT NULL) AS hasEvidence, c.title AS contractTitle, v.business_name AS vendorName
        FROM payments p INNER JOIN contracts c ON c.id = p.contract_id INNER JOIN vendors v ON v.id = c.vendor_id
        WHERE c.couple_user_id = ? ORDER BY (p.status = 'pending') DESC, p.due_date IS NULL, p.due_date, p.created_at DESC`, [req.user.id]),
    ]);
    const plan = planResult[0][0] ?? null;
    const contracts = contractResult[0];
    const payments = paymentResult[0];
    let allocations: RowDataPacket[] = [];
    if (plan) [allocations] = await pool.query<RowDataPacket[]>(`SELECT category, allocation_percent AS percent,
      target_amount_rwf AS targetAmountRwf, planned_amount_rwf AS plannedAmountRwf,
      vendor_name_snapshot AS vendorName, verified_price_from_rwf AS verifiedPriceFromRwf,
      vendor_estimate_rwf AS vendorEstimateRwf, pricing_basis AS pricingBasis, price_source AS priceSource
      FROM wedding_plan_allocations WHERE wedding_plan_id = ? ORDER BY id`, [plan.planId]);
    res.json({ plan: plan ? { ...plan, allocations } : null, contracts, payments });
  } catch (error) { next(error); }
});

app.get('/api/couple/checklists', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  try {
    const tasks = await getVendorChecklist(req.user.id);
    res.json({ tasks });
  } catch (error) { next(error); }
});

app.put('/api/couple/checklists/:id/status', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  const id = readResourceId(req.params.id, res, 'checklist task');
  if (id === null) return;
  const parsed = z.object({ status: z.enum(['pending', 'in_progress', 'completed']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose a valid checklist status.' }); return; }
  try {
    const [result] = await pool.execute<ResultSetHeader>('UPDATE checklist_tasks SET status = ? WHERE id = ? AND couple_user_id = ?', [parsed.data.status, id, req.user.id]);
    if (!result.affectedRows) { res.status(404).json({ error: 'Checklist task not found.' }); return; }
    res.json({ updated: true });
  } catch (error) { next(error); }
});

app.get('/api/couple/contracts/:id/document', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  const id = readResourceId(req.params.id, res, 'contract');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT document_key AS documentKey, original_filename AS originalFilename
      FROM contracts WHERE id = ? AND couple_user_id = ?`, [id, req.user.id]);
    if (!rows.length) { res.status(404).json({ error: 'Contract not found.' }); return; }
    sendPrivateDownload(res, rows[0].documentKey, rows[0].originalFilename, 'application/pdf');
  } catch (error) { next(error); }
});

app.get('/api/couple/payments/:id/evidence', requireAuth, async (req, res, next) => {
  if (req.user?.role !== 'couple') { res.status(403).json({ error: 'Couple access required.' }); return; }
  const id = readResourceId(req.params.id, res, 'payment');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT p.evidence_key AS evidenceKey, p.evidence_filename AS evidenceFilename,
      p.evidence_mime_type AS evidenceMimeType FROM payments p INNER JOIN contracts c ON c.id = p.contract_id
      WHERE p.id = ? AND c.couple_user_id = ? AND p.evidence_key IS NOT NULL`, [id, req.user.id]);
    if (!rows.length) { res.status(404).json({ error: 'Payment evidence not found.' }); return; }
    sendPrivateDownload(res, rows[0].evidenceKey, rows[0].evidenceFilename, rows[0].evidenceMimeType);
  } catch (error) { next(error); }
});

app.get('/api/admin/contracts', requireAuth, requireAdmin, async (req, res, next) => {
  const coupleUserId = req.query.coupleUserId ? Number(req.query.coupleUserId) : null;
  const search = String(req.query.search ?? '').trim().slice(0, 100);
  if (coupleUserId !== null && (!Number.isSafeInteger(coupleUserId) || coupleUserId < 1)) {
    res.status(400).json({ error: 'Invalid couple account filter.' }); return;
  }
  const conditions: string[] = [];
  const parameters: (number | string)[] = [];
  if (coupleUserId !== null) { conditions.push('c.couple_user_id = ?'); parameters.push(coupleUserId); }
  if (search) {
    conditions.push('(c.title LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR v.business_name LIKE ?)');
    const query = `%${search}%`; parameters.push(query, query, query, query);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.id, c.couple_user_id AS coupleUserId, u.name AS coupleName, u.email AS coupleEmail,
       c.vendor_id AS vendorId, v.business_name AS vendorName, v.category AS vendorCategory,
       c.title, c.amount_rwf AS amountRwf, c.signature_status AS signatureStatus,
       DATE_FORMAT(c.contract_date, '%Y-%m-%d') AS contractDate, c.original_filename AS originalFilename,
       c.file_size AS fileSize, c.notes, DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS createdAt,
       COALESCE(totals.paidRwf, 0) AS paidRwf, GREATEST(c.amount_rwf - COALESCE(totals.paidRwf, 0), 0) AS balanceRwf
       FROM contracts c INNER JOIN users u ON u.id = c.couple_user_id
       INNER JOIN vendors v ON v.id = c.vendor_id
       LEFT JOIN (SELECT contract_id, SUM(amount_rwf) AS paidRwf FROM payments WHERE status = 'paid' GROUP BY contract_id) totals
       ON totals.contract_id = c.id ${where} ORDER BY c.created_at DESC LIMIT 300`,
      parameters,
    );
    res.json({ contracts: rows });
  } catch (error) { next(error); }
});

app.post('/api/admin/contracts', requireAuth, requireAdmin, upload.single('document'), async (req, res, next) => {
  const parsed = contractInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the contract details.' }); return; }
  if (!req.file) { res.status(400).json({ error: 'Choose a signed contract PDF to upload.' }); return; }
  if (sniffUploadMime(req.file.buffer) !== 'application/pdf') { res.status(400).json({ error: 'Contract uploads must be valid PDF files.' }); return; }
  const input = parsed.data;
  let storedKey: string | null = null;
  try {
    const [couples] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id = ? AND role = 'couple'", [input.coupleUserId]);
    if (!couples.length) { res.status(404).json({ error: 'Couple account not found.' }); return; }
    const [vendors] = await pool.query<RowDataPacket[]>('SELECT id FROM vendors WHERE id = ?', [input.vendorId]);
    if (!vendors.length) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    const saved = await savePrivateFile(req.file, ['application/pdf']);
    storedKey = saved.key;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO contracts (couple_user_id, vendor_id, title, amount_rwf, signature_status, contract_date,
       document_key, original_filename, file_size, notes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.coupleUserId, input.vendorId, input.title, input.amountRwf, input.signatureStatus, input.contractDate || null,
        saved.key, originalUploadName(req.file.originalname), req.file.size, input.notes || null, req.user!.id],
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (storedKey) await fs.unlink(path.join(uploadDirectory, storedKey)).catch(() => undefined);
    next(error);
  }
});

app.get('/api/admin/contracts/:id/document', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'contract');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT document_key AS documentKey, original_filename AS originalFilename FROM contracts WHERE id = ?', [id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Contract not found.' }); return; }
    sendPrivateDownload(res, rows[0].documentKey, rows[0].originalFilename, 'application/pdf');
  } catch (error) { next(error); }
});

app.put('/api/admin/contracts/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'contract');
  if (id === null) return;
  const parsed = contractStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose a valid contract signing status.' }); return; }
  try {
    const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM contracts WHERE id = ?', [id]);
    if (!existing.length) { res.status(404).json({ error: 'Contract not found.' }); return; }
    await pool.execute('UPDATE contracts SET signature_status = ? WHERE id = ?', [parsed.data.signatureStatus, id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/payments', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.id, p.contract_id AS contractId, p.amount_rwf AS amountRwf, p.payment_type AS paymentType,
       p.status, DATE_FORMAT(p.due_date, '%Y-%m-%d') AS dueDate, DATE_FORMAT(p.paid_date, '%Y-%m-%d') AS paidDate,
       p.reference, p.note, p.evidence_key AS evidenceKey, p.evidence_filename AS evidenceFilename,
       c.title AS contractTitle, c.amount_rwf AS contractAmountRwf, c.signature_status AS signatureStatus,
       u.id AS coupleUserId, u.name AS coupleName, u.email AS coupleEmail,
       v.business_name AS vendorName,
       COALESCE(totals.paidRwf, 0) AS paidRwf,
       GREATEST(c.amount_rwf - COALESCE(totals.paidRwf, 0), 0) AS balanceRwf
       FROM payments p INNER JOIN contracts c ON c.id = p.contract_id
       INNER JOIN users u ON u.id = c.couple_user_id INNER JOIN vendors v ON v.id = c.vendor_id
       LEFT JOIN (SELECT contract_id, SUM(amount_rwf) AS paidRwf FROM payments WHERE status = 'paid' GROUP BY contract_id) totals
       ON totals.contract_id = c.id
       ORDER BY (p.status = 'pending') DESC, p.due_date IS NULL, p.due_date ASC, p.created_at DESC LIMIT 500`,
    );
    res.json({ payments: rows });
  } catch (error) { next(error); }
});

app.post('/api/admin/payments', requireAuth, requireAdmin, evidenceUpload.single('evidence'), async (req, res, next) => {
  const parsed = paymentInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the payment details.' }); return; }
  const input = parsed.data;
  let storedKey: string | null = null;
  try {
    const [contracts] = await pool.query<RowDataPacket[]>('SELECT id FROM contracts WHERE id = ?', [input.contractId]);
    if (!contracts.length) { res.status(404).json({ error: 'Contract not found.' }); return; }
    let evidence: { key: string; mimeType: string } | null = null;
    if (req.file) {
      evidence = await savePrivateFile(req.file, ['application/pdf', 'image/jpeg', 'image/png']);
      storedKey = evidence.key;
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payments (contract_id, amount_rwf, payment_type, status, due_date, paid_date, reference, note,
       evidence_key, evidence_filename, evidence_mime_type, evidence_size, recorded_by)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, IF(? = 'paid', CURRENT_DATE, NULL)), ?, ?, ?, ?, ?, ?, ?)`,
      [input.contractId, input.amountRwf, input.paymentType, input.status, input.dueDate || null, input.paidDate || null,
        input.status, input.reference || null, input.note || null, evidence?.key ?? null,
        evidence?.mimeType ?? null, req.file?.size ?? null, req.user!.id],
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (storedKey) await fs.unlink(path.join(uploadDirectory, storedKey)).catch(() => undefined);
    next(error);
  }
});

app.get('/api/admin/payments/:id/evidence', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'payment');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT evidence_key AS evidenceKey, evidence_filename AS evidenceFilename, evidence_mime_type AS evidenceMimeType FROM payments WHERE id = ? AND evidence_key IS NOT NULL', [id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Payment evidence not found.' }); return; }
    sendPrivateDownload(res, rows[0].evidenceKey, rows[0].evidenceFilename, rows[0].evidenceMimeType);
  } catch (error) { next(error); }
});

app.get('/api/admin/vendors', requireAuth, requireAdmin, async (req, res, next) => {
  const search = String(req.query.search ?? '').trim().slice(0, 100);
  const status = String(req.query.status ?? 'all');
  const category = String(req.query.category ?? '').trim().slice(0, 80);
  if (!['all', 'pending', 'active', 'inactive'].includes(status)) { res.status(400).json({ error: 'Invalid vendor status filter.' }); return; }
  try {
    const conditions: string[] = [];
    const parameters: (string | number)[] = [];
    if (status !== 'all') { conditions.push('status = ?'); parameters.push(status); }
    if (category) { conditions.push('category = ?'); parameters.push(category); }
    if (search) {
      conditions.push('(business_name LIKE ? OR category LIKE ? OR location LIKE ? OR contact_name LIKE ?)');
      const pattern = `%${search}%`;
      parameters.push(pattern, pattern, pattern, pattern);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query<VendorRow[]>(`SELECT ${vendorColumns} FROM vendors ${where} ORDER BY updated_at DESC LIMIT 250`, parameters);
    res.json({ vendors: rows });
  } catch (error) { next(error); }
});

app.get('/api/admin/vendors/:id/image', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'vendor');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT image_key AS imageKey, image_mime_type AS imageMimeType FROM vendors WHERE id = ? AND image_key IS NOT NULL', [id]);
    if (!rows.length) { res.status(404).end(); return; }
    sendVendorImage(res, rows[0].imageKey, rows[0].imageMimeType);
  } catch (error) { next(error); }
});

app.post('/api/admin/vendors/:id/image', requireAuth, requireAdmin, vendorImageUpload.single('image'), async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'vendor');
  if (id === null) return;
  if (!req.file) { res.status(400).json({ error: 'Choose a JPG or PNG photo to upload.' }); return; }
  let stored: { key: string; mimeType: string } | null = null;
  try {
    const vendor = await getVendor(id);
    if (!vendor) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    stored = await saveVendorImage(req.file);
    const [existing] = await pool.query<RowDataPacket[]>('SELECT image_key AS imageKey FROM vendors WHERE id = ?', [id]);
    await pool.execute('UPDATE vendors SET image_key = ?, image_mime_type = ? WHERE id = ?', [stored.key, stored.mimeType, id]);
    if (existing[0]?.imageKey) await fs.unlink(path.join(vendorImageDirectory, existing[0].imageKey)).catch(() => undefined);
    res.json({ imageUrl: `/api/admin/vendors/${id}/image` });
  } catch (error) {
    if (stored) await fs.unlink(path.join(vendorImageDirectory, stored.key)).catch(() => undefined);
    next(error);
  }
});

app.delete('/api/admin/vendors/:id/image', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res, 'vendor');
  if (id === null) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT image_key AS imageKey FROM vendors WHERE id = ?', [id]);
    if (!rows.length) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    await pool.execute('UPDATE vendors SET image_key = NULL, image_mime_type = NULL WHERE id = ?', [id]);
    if (rows[0].imageKey) await fs.unlink(path.join(vendorImageDirectory, rows[0].imageKey)).catch(() => undefined);
    res.json({ removed: true });
  } catch (error) { next(error); }
});

app.post('/api/admin/vendors', requireAuth, requireAdmin, async (req, res, next) => {
  const parsed = vendorInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the vendor details.' }); return; }
  const vendor = parsed.data;
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO vendors (business_name, category, location, contact_name, contact_email, phone, description, service_description, color_palette, price_from_rwf, price_to_rwf, pricing_basis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vendor.businessName, vendor.category, vendor.location, vendor.contactName, vendor.contactEmail, vendor.phone, vendor.description || null, vendor.serviceDescription || null, vendor.colorPalette || null, vendor.priceFromRwf, vendor.priceToRwf, vendor.pricingBasis],
    );
    res.status(201).json({ vendor: await getVendor(result.insertId) });
  } catch (error) { next(error); }
});

app.put('/api/admin/vendors/:id', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res);
  if (id === null) return;
  const parsed = vendorInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the vendor details.' }); return; }
  const vendor = parsed.data;
  try {
    const current = await getVendor(id);
    if (!current) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    const pricesUnchanged = (current.priceFromRwf ?? null) === vendor.priceFromRwf && (current.priceToRwf ?? null) === vendor.priceToRwf && current.pricingBasis === vendor.pricingBasis;
    await pool.execute(
      `UPDATE vendors SET business_name = ?, category = ?, location = ?, contact_name = ?, contact_email = ?, phone = ?,
       description = ?, service_description = ?, color_palette = ?, price_from_rwf = ?, price_to_rwf = ?, pricing_basis = ?,
       prices_approved = IF(? = 1, prices_approved, 0),
       prices_approved_by = IF(? = 1, prices_approved_by, NULL),
       prices_approved_at = IF(? = 1, prices_approved_at, NULL) WHERE id = ?`,
      [vendor.businessName, vendor.category, vendor.location, vendor.contactName, vendor.contactEmail, vendor.phone, vendor.description || null, vendor.serviceDescription || null, vendor.colorPalette || null, vendor.priceFromRwf, vendor.priceToRwf, vendor.pricingBasis, Number(pricesUnchanged), Number(pricesUnchanged), Number(pricesUnchanged), id],
    );
    res.json({ vendor: await getVendor(id) });
  } catch (error) { next(error); }
});

app.put('/api/admin/vendors/:id/verification', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res);
  if (id === null) return;
  const parsed = vendorApprovalSchema.safeParse({ approved: req.body?.verified });
  if (!parsed.success) { res.status(400).json({ error: 'Choose whether this vendor is verified.' }); return; }
  try {
    if (!await getVendor(id)) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    await pool.execute<ResultSetHeader>(
      'UPDATE vendors SET is_verified = ?, verified_by = ?, verified_at = IF(? = 1, CURRENT_TIMESTAMP, NULL) WHERE id = ?',
      [Number(parsed.data.approved), parsed.data.approved ? req.user!.id : null, Number(parsed.data.approved), id],
    );
    res.json({ vendor: await getVendor(id) });
  } catch (error) { next(error); }
});

app.put('/api/admin/vendors/:id/pricing-approval', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res);
  if (id === null) return;
  const parsed = vendorApprovalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose whether the vendor pricing is approved.' }); return; }
  try {
    const vendor = await getVendor(id);
    if (!vendor) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    if (parsed.data.approved && vendor.priceFromRwf === null && vendor.priceToRwf === null) {
      res.status(400).json({ error: 'Add a vendor price before approving it.' }); return;
    }
    await pool.execute(
      'UPDATE vendors SET prices_approved = ?, prices_approved_by = ?, prices_approved_at = IF(? = 1, CURRENT_TIMESTAMP, NULL) WHERE id = ?',
      [Number(parsed.data.approved), parsed.data.approved ? req.user!.id : null, Number(parsed.data.approved), id],
    );
    res.json({ vendor: await getVendor(id) });
  } catch (error) { next(error); }
});

app.put('/api/admin/vendors/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  const id = readResourceId(req.params.id, res);
  if (id === null) return;
  const parsed = vendorStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid vendor status.' }); return; }
  try {
    if (!await getVendor(id)) { res.status(404).json({ error: 'Vendor not found.' }); return; }
    await pool.execute<ResultSetHeader>('UPDATE vendors SET status = ? WHERE id = ?', [parsed.data.status, id]);
    res.json({ vendor: await getVendor(id) });
  } catch (error) { next(error); }
});

async function seedAdministrator(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) return;
  const hash = await bcrypt.hash(password, 12);
  await pool.execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['My Wedding Plan Admin', email, hash, 'admin']);
  console.log(`Created initial administrator account for ${email}`);
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'The file is too large.' : 'The uploaded file could not be accepted.' });
    return;
  }
  if (error instanceof UploadValidationError) { res.status(400).json({ error: error.message }); return; }
  if ((error as { code?: string }).code === 'ER_NO_SUCH_TABLE' || (error as { code?: string }).code === 'ECONNREFUSED') {
    console.error('MySQL is unavailable or the schema is not ready.', error);
    res.status(503).json({ error: 'The database is not available. Check the MySQL configuration.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
app.use(errorHandler);

await initializeDatabase();
await seedAdministrator();
const sessionCleanup = setInterval(() => {
  void pool.execute('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)')
    .catch((error: Error) => console.error('Could not remove expired sessions.', error));
}, 15 * 60 * 1000);
sessionCleanup.unref();
app.listen(port, () => console.log(`My Wedding Plan API running on http://localhost:${port}`));
