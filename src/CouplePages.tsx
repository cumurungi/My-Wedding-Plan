import { useCallback, useEffect, useState } from 'react';
import { Check, CircleDollarSign, Image, Lightbulb, Palette, Sparkles, Store } from 'lucide-react';
import { useLanguage } from './i18n';

type CoupleTask = { category: string; vendorName: string | null; vendorSource: string | null; completed: boolean };
type InspirationItem = { id: number; title: string; itemType: 'theme' | 'palette' | 'decoration' | 'idea'; vendorCategory: string | null; priceRwf: number | string | null; description: string; colorPalette: string | null; imageUrl: string | null; updatedAt: string };
type AvailabilityItem = { vendorId: number; businessName: string; category: string; location: string; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; availabilityStatus: 'not_checked' | 'waiting_for_vendor' | 'available' | 'unavailable' | 'approved'; availabilityUpdatedAt: string | null };
type PublicVendor = { id: number; businessName: string; category: string; location: string; serviceDescription: string | null; colorPalette: string | null; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; imageUrl: string | null };

const inspirationType: Record<InspirationItem['itemType'], string> = { theme: 'Wedding theme', palette: 'Color palette', decoration: 'Decoration idea', idea: 'Planning idea' };
const availabilityLabel: Record<AvailabilityItem['availabilityStatus'], string> = { not_checked: 'Not checked', waiting_for_vendor: 'Waiting for vendor', available: 'Available', unavailable: 'Unavailable', approved: 'Approved · availability confirmed' };
const taskDate = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'No due date';
const displayPrice = (value: number | string | null) => value == null ? 'Price not listed' : `${Number(value).toLocaleString()} RWF`;

async function readJson<T extends object>(response: Response): Promise<T & { error?: string }> {
  const body = await response.text();
  if (!body.trim()) throw new Error(`The server returned an empty response (HTTP ${response.status}).`);
  try { return JSON.parse(body) as T & { error?: string }; }
  catch { throw new Error(`The server returned an unreadable response (HTTP ${response.status}).`); }
}

export function CoupleVendorAvailabilityPage() {
  const [vendors, setVendors] = useState<AvailabilityItem[]>([]);
  const [weddingDate, setWeddingDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void fetch('/api/couple/vendor-availability').then(async (response) => {
      const data = await readJson<{ vendors: AvailabilityItem[]; weddingDate: string | null }>(response);
      if (!response.ok) throw new Error(data.error || 'Could not load vendor availability.');
      setVendors(data.vendors ?? []); setWeddingDate(data.weddingDate ?? null);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load vendor availability.')).finally(() => setLoading(false));
  }, []);
  return <section className="account-record-panel couple-page-panel couple-availability-panel"><header className="couple-page-heading"><div><span className="eyebrow">DATE-SPECIFIC VENDOR UPDATES</span><h2>Vendor availability</h2><p>{weddingDate ? `Updates for ${taskDate(weddingDate)}.` : 'Availability will appear once your wedding date is set.'}</p></div><Store size={21} /></header>
    {error && <p className="couple-page-error">{error}</p>}
    {loading ? <p className="couple-page-empty">Loading vendor updates…</p> : vendors.length ? <div className="couple-availability-list">{vendors.map((vendor) => <article key={vendor.vendorId}><div><b>{vendor.businessName}</b><span>{vendor.category} · {vendor.location}</span><small>{displayPrice(vendor.priceFromRwf)}{vendor.priceToRwf != null ? ` – ${displayPrice(vendor.priceToRwf)}` : ''}{vendor.pricingBasis === 'per_guest' ? ' per guest' : ''}</small></div><span className={`couple-availability-status ${vendor.availabilityStatus}`}>{availabilityLabel[vendor.availabilityStatus]}</span></article>)}</div> : <p className="couple-page-empty">Your planning team will add vendor availability updates for your selected services here.</p>}
    <p className="couple-availability-note">Availability is checked for your wedding date. Your planner will update this page after contacting each vendor.</p>
  </section>;
}

export function CoupleChecklistPage() {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<CoupleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/couple/checklists');
      const data = await readJson<{ tasks: CoupleTask[] }>(response);
      if (!response.ok) throw new Error(data.error || 'Could not load your checklist.');
      setTasks(data.tasks ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your checklist.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const done = tasks.filter((task) => task.completed).length;
  return <section className="account-record-panel couple-page-panel"><header className="couple-page-heading"><div><span className="eyebrow">{t('YOUR WEDDING TASKS')}</span><h2>{t('Checklist')}</h2><p>{t('See your requested vendor services and the progress your planning team has marked.')}</p></div><span className="couple-checklist-count">{done} of {tasks.length} {t('complete')}</span></header>
    {error && <p className="couple-page-error">{error}</p>}
    {loading ? <p className="couple-page-empty">{t('Loading your checklist…')}</p> : tasks.length ? <div className="couple-task-list">{tasks.map((task) => <article className={`couple-task ${task.completed ? 'completed' : 'pending'}`} key={task.category}><span className="couple-task-check">{task.completed && <Check size={16} />}</span><div className="couple-task-copy"><b>{task.category}</b><p>{task.vendorName ? `${task.vendorSource}: ${task.vendorName}` : t('Vendor not selected yet')}</p><small>{task.completed ? t('Completed by your planning team') : t('To do')}</small></div></article>)}</div> : <p className="couple-page-empty">{t('Your selected vendor services will appear here.')}</p>}
  </section>;
}

export function CoupleInspirationPage({ publicAccess = false, onJoin }: { publicAccess?: boolean; onJoin?: () => void }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [vendors, setVendors] = useState<PublicVendor[]>([]);
  const [activeTab, setActiveTab] = useState<'ideas' | 'vendors'>(publicAccess ? 'ideas' : 'vendors');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([
      fetch(publicAccess ? '/api/public/inspiration' : '/api/couple/inspiration').then(async (response) => { const data = await readJson<{ items: InspirationItem[] }>(response); if (!response.ok) throw new Error(data.error || 'Could not load inspiration.'); return data.items ?? []; }),
      publicAccess ? Promise.resolve([] as PublicVendor[]) : fetch('/api/couple/vendors').then(async (response) => { const data = await readJson<{ vendors: PublicVendor[] }>(response); if (!response.ok) throw new Error(data.error || 'Could not load vendors.'); return data.vendors ?? []; }),
    ]).then(([inspirationItems, vendorItems]) => { setItems(inspirationItems); setVendors(vendorItems); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load inspiration and vendors.')).finally(() => setLoading(false));
  }, [publicAccess]);
  const removedBudgetCategories = new Set(['Attire', 'Ceremony & Church Services', 'Accommodation & Honeymoon']);
  const categories = [...new Set(['Venue', 'Catering', 'Decoration', 'Florist & Flowers', 'Photography & Video', 'Hair Stylist', 'Transport', 'Cake', 'Traditional Dancers', 'Wedding Services & Protocol', 'Sound System', 'Music Band', 'DJ', 'MC', 'Drinks & Beverage Service', 'Lighting, Screens & Stage', 'Rings, Gifts & Souvenirs', 'Stationery & Invitations', ...vendors.map((vendor) => vendor.category), ...items.map((item) => item.vendorCategory).filter((category): category is string => Boolean(category))].filter((category) => !removedBudgetCategories.has(category)))].sort((a, b) => a.localeCompare(b));
  const categoryItems = selectedCategory ? items.filter((item) => item.vendorCategory === selectedCategory || (!item.vendorCategory && selectedCategory === 'Decoration')) : [];
  function renderIdeaCards(entries: InspirationItem[], showDetails: boolean) {
    return <div className="couple-inspiration-grid">{entries.map((item) => <article key={item.id}>
      <div className="couple-inspiration-image">{item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" /> : <div><Image size={25} /><span>{item.vendorCategory || t(inspirationType[item.itemType])}</span></div>}
        {item.colorPalette && <div className="couple-inspiration-swatches">{item.colorPalette.split(',').map((color) => color.trim()).filter(Boolean).map((color) => <i key={color} style={{ backgroundColor: color }} />)}</div>}
      </div>
      <div className="couple-inspiration-copy"><small>{showDetails && item.vendorCategory ? item.vendorCategory : t(inspirationType[item.itemType])}{showDetails && item.priceRwf != null ? ` · ${Number(item.priceRwf).toLocaleString()} RWF` : ''}</small><h3>{item.title}</h3><p>{item.description}</p></div>
    </article>)}</div>;
  }
  let inspirationContent;
  if (loading) inspirationContent = <p className="couple-page-empty">{t('Loading inspiration…')}</p>;
  else if (publicAccess) inspirationContent = items.length
    ? renderIdeaCards(items, true)
    : <p className="couple-page-empty">{t('Our celebration inspiration is being prepared. Check back soon.')}</p>;
  else if (activeTab === 'ideas') inspirationContent = items.filter((item) => !item.vendorCategory).length
    ? renderIdeaCards(items.filter((item) => !item.vendorCategory), false)
    : <p className="couple-page-empty">{t('Your planning team will share wedding ideas here.')}</p>;
  else if (selectedCategory) inspirationContent = <><div className="couple-vendor-category-heading"><button onClick={() => setSelectedCategory(null)}>← {t('All categories')}</button><div><h3>{selectedCategory} inspiration</h3><span>{categoryItems.length} {t(categoryItems.length === 1 ? 'example' : 'examples')}</span></div></div>
    {categoryItems.length ? <div className="couple-vendor-gallery">{categoryItems.map((item) => <article className="couple-vendor-card" key={item.id}>
      <div className="couple-vendor-photo">{item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" /> : <div><Image size={28} /><span>{t('Inspiration photo coming soon')}</span></div>}</div>
      <div className="couple-vendor-info"><small>{item.vendorCategory}</small><h3>{item.title}</h3><p>{item.description || t('An example selected by your planning team.')}</p>
        {item.colorPalette && <div className="couple-vendor-palette"><span><Palette size={13} /> {t('Colors')}</span><div>{item.colorPalette.split(',').map((color) => color.trim()).filter(Boolean).map((color) => <i key={color} title={color} style={{ backgroundColor: color }} />)}</div><small>{item.colorPalette}</small></div>}
        {item.priceRwf != null && <div className="couple-vendor-price"><CircleDollarSign size={15} /><b>{Number(item.priceRwf).toLocaleString()} RWF</b></div>}
      </div>
    </article>)}</div> : <p className="couple-page-empty">{t('Your planning team has not added examples for this category yet.')}</p>}</>;
  else inspirationContent = <div className="couple-vendor-category-grid">{categories.map((category) => {
    const group = items.filter((item) => item.vendorCategory === category || (!item.vendorCategory && category === 'Decoration'));
    const cover = group.find((item) => item.imageUrl);
    return <button className="couple-vendor-category-card" key={category} onClick={() => setSelectedCategory(category)}>
      <div>{cover?.imageUrl ? <img src={cover.imageUrl} alt="" loading="lazy" /> : <Store size={30} />}<span>{group.length ? `${group.length} ${t(group.length === 1 ? 'example' : 'examples')}` : t('Coming soon')}</span></div>
      <h3>{category}</h3><small>{t('View inspiration boards')} <span>→</span></small>
    </button>;
  })}</div>;
  return <section className="couple-page-panel couple-inspiration-page">
    <header className="couple-page-heading"><div><span className="eyebrow">{t('IDEAS FOR YOUR CELEBRATION')}</span><h2>{t('Inspiration')}</h2><p>{t(publicAccess ? 'Explore ideas and celebration examples, no account needed.' : 'Browse the examples your planning team has prepared for each service.')}</p></div><Sparkles size={22} /></header>
    {!publicAccess && <nav className="couple-inspiration-tabs"><button className={activeTab === 'vendors' ? 'active' : ''} onClick={() => setActiveTab('vendors')}><Store size={14} /> {t('Vendor categories')} <span>{categories.length}</span></button><button className={activeTab === 'ideas' ? 'active' : ''} onClick={() => setActiveTab('ideas')}><Lightbulb size={14} /> {t('Wedding ideas')}</button></nav>}
    {error && <p className="couple-page-error">{error}</p>}
    {inspirationContent}
    {publicAccess && onJoin && <div className="public-inspiration-cta"><div><b>{t('Ready to plan your own event?')}</b><p>{t('Choose a package and create your account to get started.')}</p></div><button className="admin-primary" type="button" onClick={onJoin}>{t('Create an account')}</button></div>}
  </section>;
}
