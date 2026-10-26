import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, MapPin, RefreshCw, Sparkles, Users } from 'lucide-react';
import { readApiResponse } from './api-response';

type Allocation = { category: string; percent: number | string; targetAmountRwf: number | string; plannedAmountRwf: number | string; vendorId: number | null; vendorName: string | null; vendorEstimateRwf: number | string | null; priceSource: string };
type AgreedPrice = { vendorId: number; agreedPriceRwf: number | string; quantity: number | string };
type Plan = { coupleUserId: number; coupleName: string; coupleEmail: string; requestedBudgetRwf: number | string; guestCount: number; location: string; weddingDate: string | null; weddingFormat: string | null; vendorNeeds: string[]; otherCostsDescription: string | null; requestDate: string | null; planId: number | null; version: number | null; plannedTotalRwf: number | string | null; isOverBudget: boolean | number; status: 'proposed' | 'approved' | 'rejected' | null; reviewNote: string | null; generatedAt: string | null; allocations: Allocation[]; adminVendorSelections: Record<string, number>; agreedPrices: Record<string, AgreedPrice> };
type Vendor = { id: number; businessName: string; category: string; location: string; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; isVerified: boolean | number; pricesApproved: boolean | number; status: 'active' | 'pending' | 'inactive' };
type Tab = 'all' | 'proposed' | 'approved' | 'rejected' | 'not-generated';
const colors = ['#24463c', '#81a08d', '#e5b86e', '#dd8f7c', '#9581a8', '#7394af', '#b8c9cf', '#c59e7b'];
const money = (value: number | string | null | undefined) => `${Number(value ?? 0).toLocaleString()} RWF`;
const showDate = (date: string | null) => date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not provided';
const statusName = (plan: Plan) => !plan.planId ? 'Not generated' : plan.status === 'proposed' ? 'Pending review' : plan.status === 'approved' ? 'Approved' : 'Changes requested';
const needCategories: Record<string, string[]> = {
  Venue: ['Venue'], Catering: ['Catering'], 'Photography & video': ['Photography & Video'],
  'Decorator (includes tables, chairs & tents)': ['Decoration'], Florist: ['Florist & Flowers'],
  'Wedding attire': ['Decoration'], 'Makeup & hair': ['Makeup Artist', 'Hair Stylist'], Transport: ['Transport'], Cake: ['Cake'],
  'Music & entertainment': ['Sound System', 'Music Band', 'DJ', 'MC'], 'Drinks & beverages': ['Drinks & Beverage Service'],
  'Church services': ['Other Costs'], 'Traditional dancers / Itorero': ['Traditional Dancers'],
  'Wedding services & protocol': ['Wedding Services & Protocol'], 'Stationery & invitations': ['Stationery & Invitations'],
  Accommodation: ['Other Costs'], Other: ['Other Costs'],
};
const categoryShares: Record<string, number> = { Venue: 11, Catering: 14, Decoration: 9, 'Florist & Flowers': 2, 'Photography & Video': 5, 'Makeup Artist': 3, 'Hair Stylist': 2, Transport: 3, Cake: 2, 'Traditional Dancers': 3, 'Sound System': 3, 'Music Band': 3, DJ: 2, MC: 1, 'Wedding Services & Protocol': 4, 'Drinks & Beverage Service': 4, 'Lighting, Screens & Stage': 2, 'Rings, Gifts & Souvenirs': 2, 'Stationery & Invitations': 1, 'Other Costs': 2 };
const weddingFormatLabel = (format: string | null) => ({ traditional_church_reception: 'Traditional + church + reception', church_reception: 'Church + reception', traditional_only: 'Traditional celebration', other: 'Other / still deciding' }[format ?? 'other'] ?? 'Other / still deciding');
const priceForGuest = (vendor: Vendor, guests: number) => {
  const price = vendor.priceFromRwf ?? vendor.priceToRwf;
  return price == null ? null : Number(price) * (vendor.pricingBasis === 'per_guest' ? guests : 1);
};
const agreedPriceCategories = new Set(['Drinks & Beverage Service', 'Catering', 'Stationery & Invitations', 'Transport', 'Makeup Artist']);

function AgreedPriceEditor({ plan, category, vendor, disabled, onChange, onSave }: {
  plan: Plan;
  category: string;
  vendor: Vendor;
  disabled: boolean;
  onChange: (priceRwf: string, quantity: string) => void;
  onSave: () => void;
}) {
  if (!agreedPriceCategories.has(category)) return null;
  const savedPrice = plan.agreedPrices?.[category];
  const matchesVendor = savedPrice?.vendorId === vendor.id;
  const priceRwf = matchesVendor ? String(savedPrice.agreedPriceRwf) : '';
  const quantity = matchesVendor ? String(savedPrice.quantity) : '';
  const isMakeup = category === 'Makeup Artist';
  const total = priceRwf !== '' && (!isMakeup || quantity !== '') ? Number(priceRwf) * (isMakeup ? Number(quantity) : 1) : null;
  return <div className="budget-agreed-price">
    <p>{isMakeup
      ? 'Enter the agreed price per person and how many people will receive makeup.'
      : 'Enter the total RWF price you agreed with this vendor for the wedding.'}</p>
    <div className="budget-agreed-price-fields">
      <label><span>{isMakeup ? 'Agreed price per person (RWF)' : 'Agreed total price (RWF)'}</span>
        <input aria-label={`${category} agreed price`} type="number" min="0" step="1" value={priceRwf} onChange={(event) => onChange(event.target.value, quantity)} /></label>
      {isMakeup && <label><span>People receiving makeup</span>
        <input aria-label="Number of people receiving makeup" type="number" min="1" step="1" value={quantity} onChange={(event) => onChange(priceRwf, event.target.value)} /></label>}
      <button type="button" className="admin-primary" disabled={disabled} onClick={onSave}>{priceRwf === '' && matchesVendor ? 'Remove agreed price' : 'Save agreed price'}</button>
    </div>
    {total !== null && Number.isFinite(total) && <small className="budget-agreed-price-total">Included in plan: {money(total)}</small>}
  </div>;
}

export default function BudgetOverviewPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [vendorBusyCategory, setVendorBusyCategory] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pageSize = 7;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [response, vendorResponse] = await Promise.all([fetch('/api/admin/budget-plans'), fetch('/api/admin/vendors?status=all')]);
      const [data, vendorData] = await Promise.all([
        readApiResponse<{ plans: Plan[] } & { error?: string }>(response),
        readApiResponse<{ vendors: Vendor[] } & { error?: string }>(vendorResponse),
      ]);
      setPlans(data.plans); setVendors(vendorData.vendors);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load budget requests.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const locations = useMemo(() => [...new Set(plans.map((plan) => plan.location).filter(Boolean))].sort(), [plans]);
  const filtered = useMemo(() => plans.filter((plan) => {
    const matchesTab = tab === 'all' || (tab === 'not-generated' ? !plan.planId : plan.status === tab);
    const matchesSearch = `${plan.coupleName} ${plan.coupleEmail} ${plan.location}`.toLowerCase().includes(search.trim().toLowerCase());
    const budget = Number(plan.requestedBudgetRwf);
    const matchesBudget = (!minBudget || budget >= Number(minBudget)) && (!maxBudget || budget <= Number(maxBudget));
    const matchesDate = (!fromDate || (plan.requestDate ?? '') >= fromDate) && (!toDate || (plan.requestDate ?? '') <= toDate);
    return matchesTab && matchesSearch && (location === 'all' || plan.location === location) && matchesBudget && matchesDate;
  }), [plans, tab, search, location, minBudget, maxBudget, fromDate, toDate]);
  const pendingCount = plans.filter((plan) => plan.status === 'proposed').length;
  const approvedCount = plans.filter((plan) => plan.status === 'approved').length;
  const totalBudget = plans.reduce((sum, plan) => sum + Number(plan.requestedBudgetRwf), 0);
  const selected = filtered.find((plan) => plan.coupleUserId === selectedId) ?? filtered[0] ?? null;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const requestedServices = selected ? Object.keys(categoryShares).map((category) => {
    const need = selected.vendorNeeds.find((item) => (needCategories[item] ?? []).some((serviceCategory) => serviceCategory.toLowerCase() === category.toLowerCase())) ?? 'Planning team selection';
    const options = vendors.filter((vendor) => vendor.category.toLowerCase() === category.toLowerCase() && vendor.status !== 'inactive')
      .sort((a, b) => (priceForGuest(a, selected.guestCount) ?? Infinity) - (priceForGuest(b, selected.guestCount) ?? Infinity));
    const categoryBudget = Number(selected.requestedBudgetRwf) * (categoryShares[category] ?? 0) / 100;
    const selectedVendorId = selected.adminVendorSelections?.[category] ?? null;
    const selectedVendor = options.find((vendor) => String(vendor.id) === String(selectedVendorId)) ?? null;
    return { need, category, options, selectedVendor, categoryBudget };
  }) : [];
  const selectedVendorTotal = requestedServices.reduce((total, service) => {
    const agreed = selected?.agreedPrices?.[service.category];
    if (service.selectedVendor && agreed?.vendorId === service.selectedVendor.id
      && String(agreed.agreedPriceRwf) !== ''
      && Number.isSafeInteger(Number(agreed.agreedPriceRwf))
      && Number.isSafeInteger(Number(agreed.quantity)) && Number(agreed.quantity) > 0) {
      return total + Number(agreed.agreedPriceRwf) * Number(agreed.quantity);
    }
    const price = service.selectedVendor ? priceForGuest(service.selectedVendor, selected?.guestCount ?? 0) : null;
    return total + (price ?? 0);
  }, 0);
  useEffect(() => { if (selected && selected.coupleUserId !== selectedId) setSelectedId(selected.coupleUserId); if (!filtered.length && selectedId !== null) setSelectedId(null); }, [selected?.coupleUserId, selectedId, filtered.length]);
  useEffect(() => { setPage(0); }, [tab, search, location, minBudget, maxBudget, fromDate, toDate]);

  async function generate(plan: Plan) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/generate`, { method: 'POST' });
      const data = await readApiResponse<{ isOverBudget: boolean; plannedTotalRwf: number }>(response);
      onNotify(data.isOverBudget ? `Selected vendor costs total ${money(data.plannedTotalRwf)}, which is over budget.` : `Budget recalculated from selected vendor prices: ${money(data.plannedTotalRwf)}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate a plan.'); }
    finally { setBusy(false); }
  }

  function updateAgreedPrice(plan: Plan, category: string, vendorId: number, agreedPriceRwf: string, quantity: string) {
    setPlans((current) => current.map((item) => item.coupleUserId === plan.coupleUserId ? {
      ...item,
      agreedPrices: {
        ...item.agreedPrices,
        [category]: { vendorId, agreedPriceRwf, quantity: category === 'Makeup Artist' ? quantity : 1 },
      },
    } : item));
  }

  async function saveAgreedPrice(plan: Plan, category: string, vendor: Vendor) {
    const agreed = plan.agreedPrices?.[category];
    const hasPrice = agreed?.vendorId === vendor.id && agreed.agreedPriceRwf !== '';
    const amount = hasPrice ? Number(agreed.agreedPriceRwf) : NaN;
    const quantity = category === 'Makeup Artist' && hasPrice ? Number(agreed.quantity) : 1;
    if (agreed?.vendorId === vendor.id && agreed.agreedPriceRwf !== '' && (!Number.isSafeInteger(amount) || amount < 0)) {
      setError('Enter a whole, non-negative agreed price in RWF.');
      return;
    }
    if (category === 'Makeup Artist' && agreed?.vendorId === vendor.id && agreed.agreedPriceRwf !== ''
      && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000)) {
      setError('Enter how many people will receive makeup (at least 1).');
      return;
    }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/agreed-price/${encodeURIComponent(category)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: vendor.id,
          agreedPriceRwf: agreed?.vendorId === vendor.id && agreed.agreedPriceRwf !== '' ? amount : null,
          quantity,
        }),
      });
      await readApiResponse<{ saved: boolean }>(response);
      const generated = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/generate`, { method: 'POST' });
      const data = await readApiResponse<{ isOverBudget: boolean; plannedTotalRwf: number }>(generated);
      onNotify(data.isOverBudget
        ? `Agreed price saved. The refreshed proposal is over budget at ${money(data.plannedTotalRwf)}.`
        : `Agreed price saved and included in the plan: ${money(data.plannedTotalRwf)}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the agreed price.'); }
    finally { setBusy(false); }
  }

  async function review(plan: Plan, status: 'approved' | 'rejected') {
    if (!plan.planId) return;
    const note = status === 'rejected' ? window.prompt('What should the planning team revise?') : window.prompt('Optional approval note:');
    if (note === null) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${plan.planId}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }) });
      await readApiResponse<{ ok: boolean }>(response);
      onNotify(status === 'approved' ? 'Wedding plan approved and shared with the couple.' : 'Revision request saved for this wedding plan.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not review this plan.'); }
    finally { setBusy(false); }
  }

  async function chooseBudgetVendor(plan: Plan, category: string, vendorId: number | null) {
    setVendorBusyCategory(category); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/vendor-selection/${encodeURIComponent(category)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId }),
      });
      await readApiResponse<{ ok: boolean }>(response);
      const generated = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/generate`, { method: 'POST' });
      const generatedData = await readApiResponse<{ isOverBudget: boolean; plannedTotalRwf: number }>(generated);
      onNotify(generatedData.isOverBudget
        ? `Vendor choice saved. The refreshed proposal is over budget at ${money(generatedData.plannedTotalRwf)}.`
        : 'Vendor choice saved and the budget proposal refreshed.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the budget vendor.'); }
    finally { setVendorBusyCategory(null); }
  }

  const tabs: [Tab, string, number][] = [['all', 'All requests', plans.length], ['proposed', 'Pending review', pendingCount], ['approved', 'Approved', approvedCount], ['rejected', 'Changes requested', plans.filter((plan) => plan.status === 'rejected').length], ['not-generated', 'No plan yet', plans.filter((plan) => !plan.planId).length]];
  const chartStyle = selected?.allocations.length ? { background: `conic-gradient(${selected.allocations.map((_, index) => `${colors[index % colors.length]} ${selected.allocations.slice(0, index).reduce((sum, item) => sum + Number(item.percent), 0)}% ${selected.allocations.slice(0, index + 1).reduce((sum, item) => sum + Number(item.percent), 0)}%`).join(',')})` } : undefined;

  return <div className="budget-dashboard">
    <div className="budget-overview-heading"><div><span className="eyebrow">BUDGET WORKSPACE</span><h2>Budget Overview</h2><p>Review wedding requests and their proposed plans.</p></div><button className="subtle-action" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button></div>
    <div className="budget-overview-metrics"><article><span className="budget-metric-icon"><ClipboardList size={19} /></span><div><small>Total requests</small><b>{plans.length}</b><em>Couples with complete briefs</em></div></article><article><span className="budget-metric-icon pending"><CalendarDays size={19} /></span><div><small>Pending review</small><b>{pendingCount}</b><em>Need your attention</em></div></article><article><span className="budget-metric-icon approved"><BadgeCheck size={19} /></span><div><small>Plans approved</small><b>{approvedCount}</b><em>Shared with couples</em></div></article><article><span className="budget-metric-icon value"><CircleDollarSign size={19} /></span><div><small>Total budget value</small><b>{money(totalBudget)}</b><em>Across all requests</em></div></article></div>
    {error && <div className="admin-alert">{error}</div>}
    <div className="budget-overview-columns"><section className="admin-panel budget-request-panel"><div className="budget-tabs">{tabs.map(([value, label, count]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{label}<span>{count}</span></button>)}</div>
      <div className="budget-request-filters"><label className="vendor-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search couple, email, or location" /></label><select value={location} onChange={(event) => setLocation(event.target.value)} aria-label="Filter by location"><option value="all">All locations</option>{locations.map((place) => <option key={place}>{place}</option>)}</select><label className="budget-date-filter"><CalendarDays size={14} /><input type="date" aria-label="Requests from date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="budget-date-filter"><CalendarDays size={14} /><input type="date" aria-label="Requests to date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><div className="budget-range-filter"><input type="number" min="0" aria-label="Minimum budget" placeholder="Min RWF" value={minBudget} onChange={(event) => setMinBudget(event.target.value)} /><input type="number" min="0" aria-label="Maximum budget" placeholder="Max RWF" value={maxBudget} onChange={(event) => setMaxBudget(event.target.value)} /></div></div>
      <div className="budget-request-table-wrap">{loading ? <div className="admin-empty">Loading budget requests…</div> : pageRows.length ? <table className="budget-request-table"><thead><tr><th>Couple</th><th>Wedding details</th><th>Budget</th><th>Status</th><th>Request date</th></tr></thead><tbody>{pageRows.map((plan) => <tr key={plan.coupleUserId} className={selected?.coupleUserId === plan.coupleUserId ? 'selected' : ''} onClick={() => setSelectedId(plan.coupleUserId)}><td><b>{plan.coupleName}</b><small>{plan.coupleEmail}</small></td><td><span><MapPin size={12} />{plan.location || 'Location not set'}</span><span><CalendarDays size={12} />{showDate(plan.weddingDate)}</span><span><Users size={12} />{plan.guestCount.toLocaleString()} guests</span></td><td>{money(plan.requestedBudgetRwf)}</td><td><i className={`budget-request-status ${!plan.planId ? 'unplanned' : plan.status}`}>{statusName(plan)}</i></td><td>{showDate(plan.requestDate)}</td></tr>)}</tbody></table> : <div className="admin-empty">No budget requests match these filters.</div>}</div>
      <footer className="budget-request-pagination"><span>Showing {filtered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length} requests</span><div><button disabled={page === 0} aria-label="Previous page" onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft size={15} /></button><b>{page + 1} / {pageCount}</b><button disabled={page + 1 >= pageCount} aria-label="Next page" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}><ChevronRight size={15} /></button></div></footer>
    </section>
    <aside className="admin-panel budget-request-detail">{selected ? <><header><div><span className="eyebrow">BUDGET REQUEST DETAILS</span><h3>{selected.coupleName}</h3><a href={`mailto:${selected.coupleEmail}`}>{selected.coupleEmail}</a></div><span className={`budget-request-status ${!selected.planId ? 'unplanned' : selected.status}`}>{statusName(selected)}</span></header>
      <div className="budget-detail-facts"><div><span>Location</span><b>{selected.location || 'Not provided'}</b></div><div><span>Wedding date</span><b>{showDate(selected.weddingDate)}</b></div><div><span>Guests</span><b>{selected.guestCount.toLocaleString()} people</b></div><div><span>Budget</span><b>{money(selected.requestedBudgetRwf)}</b></div><div><span>Request date</span><b>{showDate(selected.requestDate)}</b></div>{selected.reviewNote && <div className="budget-detail-note"><span>Review note</span><b>{selected.reviewNote}</b></div>}</div>
      <section className="budget-couple-brief"><h4>Couple’s wedding brief</h4><p><b>Celebration:</b> {weddingFormatLabel(selected.weddingFormat)}</p><h5>Requested services</h5>{selected.vendorNeeds.length ? <div className="budget-service-tags">{selected.vendorNeeds.map((need) => <span key={need}>{need}</span>)}</div> : <p>No specific vendor services were selected.</p>}{selected.otherCostsDescription && <p><b>Other costs / notes:</b> {selected.otherCostsDescription}</p>}</section>
      {selected && <section className="budget-service-options">
        <h4>Choose vendors by budget category <small>Automatic vendor matching is off. Only the vendors you select are included in this total; category guides are not added.</small></h4>
        <div className="budget-selected-total"><div><span>Current selected vendor and agreed total</span><b>{money(selectedVendorTotal)}</b><small>Uses agreed prices when entered; otherwise uses the selected vendor price. Unselected categories count as zero.</small></div><button type="button" className="admin-primary" disabled={busy || vendorBusyCategory !== null} onClick={() => void generate(selected)}><Sparkles size={14} />{busy ? 'Calculating…' : 'Calculate selected costs'}</button></div>
        {requestedServices.map(({ need, category, options, selectedVendor, categoryBudget }) => <article key={category} className="budget-service-option">
          <header><b>{category}</b><small>{need} · guide {money(categoryBudget)} (reference only)</small></header>
          <label className="budget-category-vendor-select"><span>Admin vendor choice</span><select aria-label={`Choose a vendor for ${category}`} value={selected.adminVendorSelections?.[category] == null ? '' : String(selected.adminVendorSelections[category])} disabled={vendorBusyCategory === category || !options.length} onChange={(event) => void chooseBudgetVendor(selected, category, event.currentTarget.value ? Number(event.currentTarget.value) : null)}><option value="">No vendor selected — admin decides</option>{options.map((vendor) => { const estimate = priceForGuest(vendor, selected.guestCount); return <option key={vendor.id} value={vendor.id}>{vendor.businessName} · {estimate == null ? 'price not entered' : money(estimate)} · {vendor.status} · {vendor.isVerified ? 'verified' : 'verification pending'} · {vendor.pricesApproved ? 'price approved' : 'price pending'}{estimate != null && estimate > categoryBudget ? ' · above guide' : ''}</option>; })}</select></label>
          {selectedVendor && <p className="budget-vendor-choice-summary">Selected by admin: <b>{selectedVendor.businessName}</b></p>}
          {agreedPriceCategories.has(category) && (selectedVendor
            ? <AgreedPriceEditor plan={selected} category={category} vendor={selectedVendor} disabled={busy} onChange={(price, quantity) => updateAgreedPrice(selected, category, selectedVendor.id, price, quantity)} onSave={() => void saveAgreedPrice(selected, category, selectedVendor)} />
            : <p className="budget-no-vendor-options">Select a vendor to enter the agreed price for this category.</p>)}
          {!options.length && <p className="budget-no-vendor-options">No non-inactive vendors are available in this category. Add a vendor in the Vendors section to enable selection.</p>}
        </article>)}
      </section>}
      <section className="budget-breakdown"><h4>Generated budget allocation <small>{selected.allocations.length ? 'Selected vendor costs' : 'Plan not generated'}</small></h4>{selected.allocations.length ? <><p className="budget-breakdown-note">Plan total is the sum of the prices for vendors you selected. Categories without a selected vendor add nothing to this total. Category guides are reference amounts only.</p><div className="budget-breakdown-content"><div className="budget-donut" style={chartStyle}><div><b>{money(selected.plannedTotalRwf)}</b><small>Selected vendor total</small></div></div><div className="budget-breakdown-rows">{selected.allocations.map((allocation, index) => { const categoryVendors = vendors.filter((vendor) => vendor.category.toLowerCase() === allocation.category.toLowerCase() && vendor.status !== 'inactive'); return <div key={allocation.category}><i style={{ background: colors[index % colors.length] }} /><span>{allocation.category}<small>{allocation.vendorName ?? (allocation.priceSource === 'reserve' ? 'No vendor selected' : 'No vendor selected')}</small></span><label className="budget-vendor-choice"><select aria-label={`Choose vendor for ${allocation.category}`} value={selected.adminVendorSelections?.[allocation.category] == null ? '' : String(selected.adminVendorSelections[allocation.category])} disabled={vendorBusyCategory === allocation.category || !categoryVendors.length} onChange={(event) => void chooseBudgetVendor(selected, allocation.category, event.currentTarget.value ? Number(event.currentTarget.value) : null)}><option value="">No vendor selected — admin decides</option>{categoryVendors.map((vendor) => { const estimate = priceForGuest(vendor, selected.guestCount); const categoryGuide = Number(selected.requestedBudgetRwf) * Number(allocation.percent) / 100; return <option key={vendor.id} value={vendor.id}>{vendor.businessName} · {estimate == null ? 'price not entered' : money(estimate)}{estimate != null && estimate > categoryGuide ? ' · above category guide' : ''}</option>; })}</select></label><b>{money(allocation.plannedAmountRwf)} <small>({Number(allocation.percent)}% guide)</small></b></div>; })}</div></div></> : <p className="budget-no-plan">Choose category vendors above to generate a plan and see the allocation breakdown.</p>}</section>
      <section className="budget-status-timeline"><h4>Plan status</h4><div className="budget-timeline"><div className="done"><i /><span><b>Request submitted</b><small>{showDate(selected.requestDate)}</small></span></div><div className={selected.planId ? 'done' : 'current'}><i /><span><b>Plan generated</b><small>{selected.generatedAt ?? 'Pending'}</small></span></div><div className={selected.status === 'approved' ? 'done' : selected.status === 'rejected' ? 'current' : ''}><i /><span><b>{selected.status === 'rejected' ? 'Changes requested' : 'Plan review'}</b><small>{selected.status === 'approved' ? 'Approved and shared' : selected.status === 'rejected' ? 'Waiting for revision' : selected.status === 'proposed' ? 'Awaiting review' : 'Pending'}</small></span></div></div></section>
      <footer className="budget-detail-actions">{selected.planId && selected.status === 'proposed' && <><button className="action-approve" disabled={busy} onClick={() => void review(selected, 'approved')}><BadgeCheck size={14} /> Approve</button><button className="action-reject" disabled={busy} onClick={() => void review(selected, 'rejected')}>Request changes</button></>}{!selected.planId ? <button className="admin-primary" disabled={busy} onClick={() => void generate(selected)}><Sparkles size={14} /> Generate plan</button> : <button className="subtle-action" disabled={busy} onClick={() => void generate(selected)}><Sparkles size={13} /> {selected.status === 'rejected' ? 'Generate revision' : 'Recalculate plan'}</button>}</footer>
    </> : <div className="admin-empty">Select a budget request to view its details.</div>}</aside></div>
  </div>;
}

function SearchIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>; }
