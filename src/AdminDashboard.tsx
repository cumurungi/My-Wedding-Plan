import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BadgeCheck, Bell, CalendarDays, Check, ChevronRight, CircleDollarSign, ClipboardCheck, FileCheck2, FileText, Flower2, Heart, Lightbulb, LogOut, MapPin, Mail, Menu, MessageSquare, Moon, Plus, Search, ShieldCheck, Sparkles, Store, Sun, Users, Wallet, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from './wedding';
import { ContractsPage, PaymentsPage } from './ContractPayments';
import BudgetPlansPage from './BudgetPlans';
import InspirationPage from './InspirationPage';
import ChecklistsPage from './ChecklistsPage';
import BudgetOverviewPage from './BudgetOverviewPage';
import AdminNotificationsPage from './AdminNotificationsPage';
import ContactMessagesPage from './ContactMessagesPage';
import PackagePaymentsPage from './PackagePaymentsPage';
import Brand from './Brand';
import { LanguagePicker, useLanguage } from './i18n';
import { eventTypeLabels, getPackagePlan, type EventType } from '../shared/package-plans';

type View = 'overview' | 'budgets' | 'vendors' | 'guests' | 'inspiration' | 'plans' | 'checklists' | 'contracts' | 'payments' | 'packagePayments' | 'notifications' | 'contact';
type VendorStatus = 'pending' | 'active' | 'inactive';
type Vendor = {
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
  status: VendorStatus;
  createdAt: string;
  updatedAt: string;
};
type Overview = {
  totalUsers: number;
  coupleAccounts: number;
  weddingBriefs: number;
  totalVendors: number;
  verifiedVendors: number;
  awaitingVerification: number;
  pricesToReview: number;
  totalContracts: number;
  unsignedContracts: number;
  partiallySignedContracts: number;
  pendingPaymentRwf: number;
  paymentsDueSoon: number;
};
type VendorInput = Omit<Vendor, 'id' | 'isVerified' | 'pricesApproved' | 'status' | 'createdAt' | 'updatedAt' | 'imageUrl'>;
type NavItem = { label: string; icon: LucideIcon; view?: View };

const categories = ['Venue', 'Catering', 'Decoration', 'Florist & Flowers', 'Photography & Video', 'Makeup Artist', 'Hair Stylist', 'Transport', 'Cake', 'Traditional Dancers', 'Wedding Services & Protocol', 'Sound System', 'Music Band', 'DJ', 'MC', 'Drinks & Beverage Service', 'Lighting, Screens & Stage', 'Rings, Gifts & Souvenirs', 'Stationery & Invitations', 'Other Costs', 'Emergency Reserve'];
const legacyCategories = ['Attire & Makeup', 'Music & Entertainment', 'Protocol', 'Drinks', 'Traditional dancers', 'Sound system', 'Other costs', 'Other'];
const navigation: NavItem[] = [
  { label: 'Overview', icon: Sparkles, view: 'overview' },
  { label: 'Contact messages', icon: MessageSquare, view: 'contact' },
  { label: 'Package payments', icon: CircleDollarSign, view: 'packagePayments' },
  { label: 'Budgets', icon: Wallet, view: 'budgets' },
  { label: 'Vendors', icon: Store, view: 'vendors' }, { label: 'Guests', icon: Users, view: 'guests' },
  { label: 'Inspiration', icon: Lightbulb, view: 'inspiration' }, { label: 'Event plans', icon: ClipboardCheck, view: 'plans' },
  { label: 'Checklists', icon: Check, view: 'checklists' }, { label: 'Contracts', icon: ShieldCheck, view: 'contracts' },
  { label: 'Payments', icon: CircleDollarSign, view: 'payments' }, { label: 'Notifications', icon: Bell, view: 'notifications' },
];
const money = (value: number | null) => value == null ? 'Not provided' : `${Number(value).toLocaleString()} RWF`;

export default function AdminDashboard({ user, onSignOut, darkTheme, onToggleTheme }: { user: User; onSignOut: () => Promise<void>; darkTheme: boolean; onToggleTheme: () => void }) {
  const { t } = useLanguage();
  const [view, setView] = useState<View>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editor, setEditor] = useState<Vendor | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const loadOverview = useCallback(async () => {
    const response = await fetch('/api/admin/overview');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load the admin overview.');
    setOverview(data);
  }, []);

  const loadVendors = useCallback(async () => {
    const query = new URLSearchParams({ search, status: statusFilter });
    const response = await fetch(`/api/admin/vendors?${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load vendors.');
    setVendors(data.vendors);
  }, [search, statusFilter]);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (view === 'overview') await loadOverview();
      await loadVendors();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the admin workspace.'); }
    finally { setLoading(false); }
  }, [loadOverview, loadVendors, view]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function saveVendor(input: VendorInput, imageFile: File | null, removeImage: boolean) {
    setSaving(true); setError('');
    let savedVendor: Vendor | null = null;
    try {
      const editing = editor !== 'new' && editor !== null;
      const response = await fetch(editing ? `/api/admin/vendors/${editor.id}` : '/api/admin/vendors', {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the vendor.');
      savedVendor = data.vendor;
      if (imageFile) {
        const imageForm = new FormData(); imageForm.append('image', imageFile);
        const imageResponse = await fetch(`/api/admin/vendors/${savedVendor!.id}/image`, { method: 'POST', body: imageForm });
        const imageData = await imageResponse.json();
        if (!imageResponse.ok) throw new Error(imageData.error || 'Vendor details were saved, but the image could not be uploaded.');
      } else if (removeImage) {
        const imageResponse = await fetch(`/api/admin/vendors/${savedVendor!.id}/image`, { method: 'DELETE' });
        const imageData = await imageResponse.json();
        if (!imageResponse.ok) throw new Error(imageData.error || 'Could not remove the vendor photo.');
      }
      setEditor(null); setNotice(editing ? 'Vendor details updated.' : 'Vendor added to your directory.');
      await Promise.all([loadVendors(), loadOverview()]);
    } catch (cause) {
      if (savedVendor) { setEditor(savedVendor); await loadVendors().catch(() => undefined); }
      setError(cause instanceof Error ? cause.message : 'Could not save the vendor.');
    }
    finally { setSaving(false); }
  }

  async function updateVendor(id: number, endpoint: string, payload: object, success: string) {
    setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/vendors/${id}/${endpoint}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update this vendor.');
      setNotice(success);
      await Promise.all([loadVendors(), loadOverview()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this vendor.'); }
  }

  const pageTitle = view === 'overview' ? 'Overview' : view === 'budgets' ? 'Budget review' : view === 'vendors' ? 'Vendor management' : view === 'guests' ? 'Client events' : view === 'inspiration' ? 'Inspiration library' : view === 'plans' ? 'Event plans' : view === 'checklists' ? 'Checklists' : view === 'contracts' ? 'Contracts' : view === 'notifications' ? 'Notifications' : view === 'contact' ? 'Contact messages' : view === 'packagePayments' ? 'Package payments' : 'Payments';
  return <div className="admin-layout">
    {mobileNav && <button className="admin-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside id="admin-navigation" className={`admin-sidebar ${mobileNav ? 'open' : ''}`}><Brand href="#admin" onClick={(event) => { event.preventDefault(); setView('overview'); setMobileNav(false); }} /><div className="side-rule" /><span className="admin-label">ADMIN SECTION</span>
      <nav>{navigation.map(({ label, icon: Icon, view: target }) => <button key={label} disabled={!target} className={`nav-item ${target === view ? 'active' : ''} ${!target ? 'nav-disabled' : ''}`} onClick={() => { if (target) { setView(target); setMobileNav(false); } }} title={!target ? `${label} is planned for a later phase` : undefined}><Icon size={17} strokeWidth={1.7} />{t(label)}{label === 'Vendors' && overview?.awaitingVerification ? <span className="nav-count">{overview.awaitingVerification}</span> : null}</button>)}</nav>
      <div className="admin-user"><div className="avatar">{user.name.slice(0, 1)}</div><div><b>{user.name}</b><span>Administrator</span></div><button onClick={onSignOut} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><button className="icon-button admin-menu-button" aria-label={mobileNav ? 'Close admin navigation' : 'Open admin navigation'} aria-controls="admin-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button><div><span className="eyebrow">THE EVENTNEST / ADMIN</span><h1>{view === 'overview' ? `${t('Good morning')}, ${user.name.split(' ')[0]}` : t(pageTitle)}</h1></div><div className="admin-header-actions"><LanguagePicker /><span className="admin-status"><i /> {t('Secure administrator access')}</span><button className="icon-button" aria-label={darkTheme ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onToggleTheme}>{darkTheme ? <Sun size={17} /> : <Moon size={17} />}</button><button className="pill-button" onClick={onSignOut}>{t('Sign out')} <LogOut size={15} /></button></div></header>
      <div className={`admin-content ${view === 'inspiration' ? 'inspiration-view' : ''} ${view === 'checklists' ? 'checklists-view' : ''}`}>
        <div className="admin-heading"><div><h2>{view === 'overview' ? 'Your planning workspace' : view === 'budgets' ? 'Review event budget proposals' : view === 'vendors' ? 'Verified vendors, thoughtfully chosen' : view === 'guests' ? 'Client event details' : view === 'inspiration' ? 'Ideas for memorable events' : view === 'plans' ? 'Review proposed event plans' : view === 'checklists' ? 'Planning tasks and deadlines' : view === 'contracts' ? 'Contracts for your clients' : view === 'notifications' ? 'Items that need your attention' : view === 'contact' ? 'Messages from clients and visitors' : view === 'packagePayments' ? 'Review submitted bank transfers' : 'Payment tracking'}</h2><p>{view === 'overview' ? 'A clear view of clients, events, and vendor reviews.' : view === 'budgets' ? 'Approve realistic allocations or flag events that exceed the requested budget.' : view === 'vendors' ? 'Keep business details and approved prices up to date.' : view === 'guests' ? 'Review submitted event details, budgets, dates, and selected packages.' : view === 'inspiration' ? 'Organize themes, color palettes, decoration references, and planning ideas.' : view === 'plans' ? 'Review plan details, request revisions, and approve proposals for clients.' : view === 'checklists' ? 'Create tasks, set deadlines, and track progress for each client.' : view === 'contracts' ? 'Connect each agreement to the client and vendor it belongs to.' : view === 'notifications' ? 'Review pending vendor checks, event plans, contracts, and payments.' : view === 'contact' ? 'Reply to people using the email or phone shown with each message.' : view === 'packagePayments' ? 'Confirm a package only after matching the transfer in your bank account.' : 'Track deposits, installments, due dates, and balances.'}</p></div>{view === 'vendors' && <button className="admin-primary" onClick={() => { setError(''); setEditor('new'); }}><Plus size={16} /> Add vendor</button>}{view === 'overview' && <div className="admin-shortcuts"><button onClick={() => setView('budgets')}><Wallet size={15} /> Budget plans</button><button onClick={() => setView('contracts')}><FileText size={15} /> Contracts</button><button onClick={() => setView('payments')}><Wallet size={15} /> Payments</button></div>}</div>
        {error && <div className="admin-alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}
        {notice && <div className="admin-success">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
        {view === 'overview' ? <OverviewPage overview={overview} vendors={vendors} loading={loading} onOpenVendors={() => setView('vendors')} onEdit={(vendor) => { setView('vendors'); setEditor(vendor); }} onAdd={() => setEditor('new')} /> : view === 'budgets' ? <BudgetOverviewPage onNotify={setNotice} /> : view === 'plans' ? <BudgetPlansPage onNotify={setNotice} showCategories={false} /> : view === 'vendors' ? <VendorsPage vendors={vendors} loading={loading} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onEdit={setEditor} onUpdate={updateVendor} /> : view === 'guests' ? <GuestsPage /> : view === 'inspiration' ? <InspirationPage onNotify={setNotice} /> : view === 'checklists' ? <ChecklistsPage onNotify={setNotice} /> : view === 'contracts' ? <ContractsPage onNotify={setNotice} /> : view === 'notifications' ? <AdminNotificationsPage onNavigate={(target) => setView(target)} /> : view === 'contact' ? <ContactMessagesPage onNotify={setNotice} /> : view === 'packagePayments' ? <PackagePaymentsPage onNotify={setNotice} /> : <PaymentsPage onNotify={setNotice} />}
        {view === 'overview' && <section className="admin-placeholder"><div className="placeholder-icon"><Flower2 size={22} /></div><div><b>Your team workspace</b><p>Event briefs and verified vendor records are managed here. More planning tools will arrive in later phases.</p></div><span className="phase-chip">PHASE 3</span></section>}
      </div>
    </main>
    {editor && <VendorEditor vendor={editor === 'new' ? null : editor} saving={saving} error={error} onClose={() => { setEditor(null); setError(''); }} onSave={saveVendor} />}
  </div>;
}

function OverviewPage({ overview, vendors, loading, onOpenVendors, onEdit, onAdd }: {
  overview: Overview | null; vendors: Vendor[]; loading: boolean; onOpenVendors: () => void; onEdit: (vendor: Vendor) => void; onAdd: () => void;
}) {
  const metrics: [string, number | undefined, LucideIcon, string][] = [
    ['Couple accounts', overview?.coupleAccounts, Users, 'Registered couples'],
    ['Wedding briefs', overview?.weddingBriefs, ClipboardCheck, 'Details submitted'],
    ['Vendor partners', overview?.totalVendors, Store, 'In your directory'],
    ['Need verification', overview?.awaitingVerification, BadgeCheck, 'Business information'],
    ['Prices to review', overview?.pricesToReview, CircleDollarSign, 'Awaiting approval'],
    ['Contracts', overview?.totalContracts, ShieldCheck, 'Uploaded agreements'],
    ['Pending signatures', overview?.unsignedContracts, FileText, 'Awaiting signatures'],
    ['Partially signed', overview?.partiallySignedContracts, FileCheck2, 'Need completion'],
    ['Payments pending', overview?.pendingPaymentRwf, Wallet, 'RWF outstanding in records'],
    ['Due in 30 days', overview?.paymentsDueSoon, CalendarDays, 'Upcoming installments'],
  ];
  const reviewVendors = vendors.filter((vendor) => !vendor.isVerified || ((vendor.priceFromRwf !== null || vendor.priceToRwf !== null) && !vendor.pricesApproved)).slice(0, 5);
  return <>
    <div className="admin-metric-grid">{metrics.map(([label, value, Icon, caption], index) => <article className="admin-metric" key={label}><div className={`metric-icon tone-${index % 5}`}><Icon size={18} /></div><span>{label}</span><strong>{loading ? '—' : `${Number(value ?? 0).toLocaleString()}${label === 'Payments pending' ? ' RWF' : ''}`}</strong><small>{caption}</small></article>)}</div>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">VENDOR REVIEW</span><h3>Needs your attention</h3><p>Review details and prices before vendors are recommended to couples.</p></div><button className="admin-link-button" onClick={onOpenVendors}>Manage directory <ChevronRight size={15} /></button></div>
      {loading ? <div className="admin-empty">Loading your latest records…</div> : reviewVendors.length ? <div className="review-list">{reviewVendors.map((vendor) => <button className="review-row" key={vendor.id} onClick={() => onEdit(vendor)}><span className="vendor-avatar"><Store size={18} /></span><span className="review-vendor-name"><b>{vendor.businessName}</b><small>{vendor.category} · {vendor.location}</small></span><span className="review-badges">{!vendor.isVerified && <i className="status-badge pending">Verify details</i>}{(vendor.priceFromRwf !== null || vendor.priceToRwf !== null) && !vendor.pricesApproved && <i className="status-badge review">Approve prices</i>}</span><ChevronRight size={16} /></button>)}</div> : <div className="admin-empty"><span className="empty-check"><Check size={16} /></span><div><b>All caught up</b><p>No vendor records need review right now.</p></div></div>}
    </section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">RECENTLY ADDED</span><h3>Your vendor directory</h3></div><button className="admin-link-button" onClick={onAdd}><Plus size={15} /> Add a vendor</button></div>
      {vendors.length ? <div className="recent-vendor-grid">{vendors.slice(0, 3).map((vendor) => <button className="recent-vendor" key={vendor.id} onClick={() => onEdit(vendor)}><span className="vendor-avatar"><Store size={18} /></span><b>{vendor.businessName}</b><small>{vendor.category} · {vendor.location}</small><VendorState vendor={vendor} /></button>)}</div> : <div className="admin-empty"><div><b>Your directory is ready</b><p>Add your first venue, caterer, decorator, or other trusted business.</p></div><button className="admin-primary" onClick={onAdd}><Plus size={15} /> Add vendor</button></div>}
    </section>
    <div className="admin-total-note"><span><Users size={15} /> {Number(overview?.totalUsers ?? 0).toLocaleString()} total accounts</span><span><BadgeCheck size={15} /> {Number(overview?.verifiedVendors ?? 0).toLocaleString()} verified vendors</span></div>
  </>;
}

type CoupleGuestBrief = { id: number; name: string; email: string; eventType: string | null; eventName: string | null; packageCode: string | null; guestCount: number | null; budgetRwf: number | string | null; weddingDate: string | null; location: string | null; style: string | null; specialRequirements: string | null; hasWeddingDetails: boolean | number };

function GuestsPage() {
  const [couples, setCouples] = useState<CoupleGuestBrief[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'submitted' | 'missing'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/admin/couples').then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load client event details.');
      if (active) setCouples(data.couples);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load client event details.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const submittedCount = couples.filter((couple) => Boolean(couple.hasWeddingDetails)).length;
  const guestTotal = couples.reduce((sum, couple) => sum + (Number(couple.guestCount) || 0), 0);
  const filtered = couples.filter((couple) => {
    const matchesSearch = `${couple.name} ${couple.email} ${couple.location ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesFilter = filter === 'all' || (filter === 'submitted' ? Boolean(couple.hasWeddingDetails) : !couple.hasWeddingDetails);
    return matchesSearch && matchesFilter;
  });
  return <section className="guest-workspace">
    <div className="guest-metrics"><article><Users size={18} /><span>Client accounts</span><b>{couples.length}</b></article><article><ClipboardCheck size={18} /><span>Event briefs submitted</span><b>{submittedCount}</b></article><article><Users size={18} /><span>Guests in submitted briefs</span><b>{guestTotal.toLocaleString()}</b></article></div>
    {error && <div className="admin-alert">{error}</div>}
    <section className="admin-panel"><div className="guest-toolbar"><label className="vendor-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, email, event, or location" /></label><select aria-label="Filter clients by event details" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All clients</option><option value="submitted">Details submitted</option><option value="missing">Missing details</option></select></div>
      {loading ? <div className="admin-empty">Loading event details…</div> : filtered.length ? <div className="guest-list">{filtered.map((couple) => {
        const eventLabel = eventTypeLabels[(couple.eventType ?? 'wedding') as EventType] ?? 'Event';
        const packagePlan = getPackagePlan(couple.packageCode ?? '');
        return <article className="guest-card" key={couple.id}><div className="guest-avatar"><Users size={18} /></div><div className="guest-main"><div className="guest-title"><h3>{couple.name} · {couple.eventName || eventLabel}</h3><span className={`guest-brief-status ${couple.hasWeddingDetails ? 'submitted' : 'missing'}`}>{couple.hasWeddingDetails ? 'Details submitted' : 'Details needed'}</span></div><a href={`mailto:${couple.email}`}><Mail size={13} /> {couple.email}</a><div className="guest-facts"><span><b>{eventLabel}</b></span>{packagePlan && <span><Heart size={13} />{packagePlan.name} · {money(packagePlan.priceRwf)}</span>}<span><Users size={13} /><b>{couple.guestCount == null ? 'Guest count not set' : `${Number(couple.guestCount).toLocaleString()} guests`}</b></span><span><MapPin size={13} />{couple.location || 'Location not set'}</span><span><CalendarDays size={13} />{couple.weddingDate ? new Date(`${couple.weddingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not set'}</span>{couple.budgetRwf != null && <span><Wallet size={13} />{money(Number(couple.budgetRwf))}</span>}</div>{couple.style && <p className="guest-style">Style: {couple.style}</p>}{couple.specialRequirements && <p className="guest-notes">{couple.specialRequirements}</p>}</div></article>;
      })}</div> : <div className="admin-empty"><div><b>No clients match these filters</b><p>Try another search or filter.</p></div></div>}
    </section>
  </section>;
}

function VendorsPage({ vendors, loading, search, setSearch, statusFilter, setStatusFilter, onEdit, onUpdate }: {
  vendors: Vendor[]; loading: boolean; search: string; setSearch: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void;
  onEdit: (vendor: Vendor) => void; onUpdate: (id: number, endpoint: string, payload: object, success: string) => Promise<void>;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedCategory) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedCategory]);
  const categoryCards = categories;
  const visibleVendors = selectedCategory ? vendors.filter((vendor) => vendor.category.toLocaleLowerCase() === selectedCategory.toLocaleLowerCase()) : [];
  const categoryLabel = selectedCategory === 'Attire & Makeup' || selectedCategory === 'Music & Entertainment' || selectedCategory === 'Other' ? `${selectedCategory} · existing` : selectedCategory;
  return <section className="admin-panel vendor-panel" ref={detailRef}>
    <div className="vendor-toolbar"><label className="vendor-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business, category, or location" /></label><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    {!selectedCategory ? <><div className="vendor-category-heading"><div><span className="eyebrow">VENDOR DIRECTORY</span><h3>Browse vendors by category</h3><p>Choose a category to see the businesses your team has added.</p></div><span>{vendors.length} vendors</span></div><div className="vendor-category-grid">{categoryCards.map((category, index) => { const count = vendors.filter((vendor) => vendor.category.toLocaleLowerCase() === category.toLocaleLowerCase()).length; return <button className="vendor-category-card" key={category} onClick={() => setSelectedCategory(category)}><span className={`vendor-category-icon tone-${index % 5}`}><Store size={18} /></span><b>{category}</b><small>{count} vendor{count === 1 ? '' : 's'}</small><ChevronRight size={15} /></button>; })}</div></> : <><div className="vendor-category-detail-heading"><button className="subtle-action" onClick={() => setSelectedCategory(null)}>← All categories</button><div><span className="eyebrow">VENDOR CATEGORY</span><h3>{categoryLabel}</h3><p>{visibleVendors.length} listed vendor{visibleVendors.length === 1 ? '' : 's'} in this category.</p></div></div>{loading ? <div className="admin-empty">Loading vendors…</div> : visibleVendors.length === 0 ? <div className="admin-empty"><span className="empty-check"><Store size={17} /></span><div><b>No {categoryLabel} vendors match these filters</b><p>Try another search or status, or add a vendor in this category.</p></div></div> : <div className="vendor-list">{visibleVendors.map((vendor) => <VendorCard key={vendor.id} vendor={vendor} onEdit={() => onEdit(vendor)} onUpdate={onUpdate} />)}</div>}</>}
  </section>;
}

function VendorCard({ vendor, onEdit, onUpdate }: { vendor: Vendor; onEdit: () => void; onUpdate: VendorsPageProps['onUpdate'] }) {
  const hasPrice = vendor.priceFromRwf !== null || vendor.priceToRwf !== null;
  return <article className="vendor-card"><div className="vendor-card-main"><span className="vendor-avatar">{vendor.imageUrl ? <img src={vendor.imageUrl} alt="" /> : <Store size={20} />}</span><div className="vendor-info"><div className="vendor-title-line"><h3>{vendor.businessName}</h3><VendorState vendor={vendor} /></div><p>{vendor.category} <span>·</span> <MapPin size={12} /> {vendor.location}</p><p className="vendor-description">{vendor.serviceDescription || vendor.description || 'No service description yet.'}</p><div className="vendor-pricing"><CircleDollarSign size={14} /><b>{vendor.priceFromRwf === null && vendor.priceToRwf === null ? 'No prices added' : `${money(vendor.priceFromRwf)}${vendor.priceToRwf !== null ? ` – ${money(vendor.priceToRwf)}` : ' +'}`} {vendor.pricingBasis === 'per_guest' ? '/ guest' : 'package'}</b>{hasPrice && <i className={`status-badge ${vendor.pricesApproved ? 'verified' : 'review'}`}>{vendor.pricesApproved ? 'Prices approved' : 'Pricing review'}</i>}</div><div className="vendor-contact">{vendor.contactName && <span>{vendor.contactName}</span>}{vendor.contactEmail && <span>{vendor.contactEmail}</span>}{vendor.phone && <span>{vendor.phone}</span>}</div></div></div><div className="vendor-actions"><button className="subtle-action" onClick={onEdit}>Edit details</button><button className={vendor.isVerified ? 'subtle-action' : 'action-verify'} onClick={() => void onUpdate(vendor.id, 'verification', { verified: !vendor.isVerified }, vendor.isVerified ? 'Vendor verification removed.' : 'Vendor verified.')}>{vendor.isVerified ? 'Unverify' : 'Verify business'}</button>{hasPrice && !vendor.pricesApproved && <button className="action-approve" onClick={() => void onUpdate(vendor.id, 'pricing-approval', { approved: true }, 'Vendor pricing approved.')}>Approve prices</button>}{vendor.pricesApproved && <span className="approved-label"><Check size={13} /> Prices approved</span>}<button className="subtle-action" onClick={() => void onUpdate(vendor.id, 'status', { status: vendor.status === 'active' ? 'inactive' : 'active' }, vendor.status === 'active' ? 'Vendor set inactive.' : 'Vendor set active.')}>{vendor.status === 'active' ? 'Set inactive' : 'Set active'}</button></div></article>;
}

type VendorsPageProps = { onUpdate: (id: number, endpoint: string, payload: object, success: string) => Promise<void> };

function VendorState({ vendor }: { vendor: Vendor }) {
  return <span className={`vendor-state ${vendor.status}`}><i />{vendor.status}</span>;
}

function VendorEditor({ vendor, saving, error, onClose, onSave }: {
  vendor: Vendor | null; saving: boolean; error: string; onClose: () => void; onSave: (value: VendorInput, imageFile: File | null, removeImage: boolean) => Promise<void>;
}) {
  const [category, setCategory] = useState(vendor?.category ?? '');
  const [pricingBasis, setPricingBasis] = useState<'fixed' | 'per_guest'>(vendor?.pricingBasis ?? 'fixed');
  const isGuestPricedCategory = category === 'Catering' || category === 'Drinks & Beverage Service';
  const pricingHelp = pricingBasis === 'per_guest'
    ? 'Enter the amount charged for one guest. Budget totals multiply it by the couple’s guest count.'
    : isGuestPricedCategory
      ? 'If this vendor charges per guest, select “Per guest”; otherwise keep the fixed package price.'
      : 'Use “Per guest” for any service priced per attendee, or “Fixed package price” for a one-time total.';
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nullableNumber = (key: string) => { const value = String(form.get(key) ?? '').trim(); return value ? Number(value) : null; };
    const image = form.get('vendorImage');
    void onSave({
      businessName: String(form.get('businessName') ?? '').trim(), category: String(form.get('category') ?? ''),
      location: String(form.get('location') ?? '').trim(), contactName: String(form.get('contactName') ?? '').trim() || null,
      contactEmail: String(form.get('contactEmail') ?? '').trim() || null, phone: String(form.get('phone') ?? '').trim() || null,
      description: String(form.get('description') ?? '').trim(), serviceDescription: String(form.get('serviceDescription') ?? '').trim(),
      colorPalette: String(form.get('colorPalette') ?? '').trim(),
      priceFromRwf: nullableNumber('priceFromRwf'), priceToRwf: nullableNumber('priceToRwf'),
      pricingBasis: String(form.get('pricingBasis') ?? 'fixed') as 'fixed' | 'per_guest',
    }, image instanceof File && image.size ? image : null, form.get('removeImage') === 'on');
  }
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="vendor-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-form-title"><header><div><span className="eyebrow">VENDOR DIRECTORY</span><h2 id="vendor-form-title">{vendor ? 'Edit vendor details' : 'Add a vendor'}</h2></div><button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button></header><form onSubmit={submit}><div className="vendor-form-grid"><label>Business name<input name="businessName" required minLength={2} maxLength={160} defaultValue={vendor?.businessName ?? ''} placeholder="e.g. Jalia Convention Center" /></label><label>Category<select name="category" required value={category} onChange={(event) => { const nextCategory = event.currentTarget.value; setCategory(nextCategory); if (!vendor) setPricingBasis(nextCategory === 'Catering' || nextCategory === 'Drinks & Beverage Service' ? 'per_guest' : 'fixed'); }}><option value="" disabled>Select a service</option>{categories.map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}{vendor && legacyCategories.includes(vendor.category) && <option value={vendor.category}>{vendor.category} (existing category)</option>}</select></label><label className="form-wide">Location<input name="location" required minLength={2} maxLength={160} defaultValue={vendor?.location ?? ''} placeholder="Kigali, Rwanda" /></label><label>Contact person<input name="contactName" maxLength={120} defaultValue={vendor?.contactName ?? ''} placeholder="Contact name" /></label><label>Business email<input name="contactEmail" type="email" maxLength={254} defaultValue={vendor?.contactEmail ?? ''} placeholder="hello@example.com" /></label><label>Phone<input name="phone" maxLength={40} defaultValue={vendor?.phone ?? ''} placeholder="+250 ..." /></label><label>Starting price <em>RWF{pricingBasis === 'per_guest' ? ' per guest' : ''}</em><input name="priceFromRwf" type="number" min="0" max={pricingBasis === 'per_guest' ? '1000000000' : '10000000000000'} step="1000" defaultValue={vendor?.priceFromRwf ?? ''} placeholder="Optional" /></label><label>Maximum price <em>RWF{pricingBasis === 'per_guest' ? ' per guest' : ''}</em><input name="priceToRwf" type="number" min="0" max={pricingBasis === 'per_guest' ? '1000000000' : '10000000000000'} step="1000" defaultValue={vendor?.priceToRwf ?? ''} placeholder="Optional" /></label><label>Price basis<select name="pricingBasis" value={pricingBasis} onChange={(event) => setPricingBasis(event.currentTarget.value as 'fixed' | 'per_guest')}><option value="fixed">Fixed package price</option><option value="per_guest">Price per guest</option></select><small className="pricing-hint">{pricingHelp} You can use either price basis for any category.</small></label><label className="form-wide">Service color palette <em>Up to six hex codes, separated by commas</em><input name="colorPalette" maxLength={255} defaultValue={vendor?.colorPalette ?? ''} placeholder="#F4E6D2, #263B35" /></label><label className="form-wide vendor-image-upload">Service photo <em>JPG or PNG, up to 8 MB</em><input name="vendorImage" type="file" accept="image/jpeg,image/png" />{vendor?.imageUrl && <img src={vendor.imageUrl} alt="Current vendor service" />}</label>{vendor?.imageUrl && <label className="inspiration-publish-check"><input type="checkbox" name="removeImage" /> Remove current photo</label>}<label className="form-wide">Services offered<textarea name="serviceDescription" rows={3} maxLength={4000} defaultValue={vendor?.serviceDescription ?? ''} placeholder="Describe the services and packages they offer." /></label><label className="form-wide">Internal notes<textarea name="description" rows={2} maxLength={4000} defaultValue={vendor?.description ?? ''} placeholder="Verification notes or useful context for your team." /></label></div>{error && <p className="form-error">{error}</p>}<footer><p><ShieldCheck size={14} /> Couples see active verified vendors with approved prices.</p><button className="admin-primary" disabled={saving}>{saving ? 'Saving…' : vendor ? 'Save changes' : 'Add vendor'} <ChevronRight size={15} /></button></footer></form></section></div>;
}
