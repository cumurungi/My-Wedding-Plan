import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, BadgeCheck, CalendarDays, CheckCircle2, CircleDollarSign, Clock3, Download, Eye, MapPin, MoreVertical, Plus, RefreshCw, Search, Sparkles, Store, Users, X } from 'lucide-react';
import { readApiResponse } from './api-response';

type Allocation = { category: string; percent: number | string; targetAmountRwf: number | string; plannedAmountRwf: number | string; vendorId: number | null; vendorName: string | null; verifiedPriceFromRwf: number | string | null; vendorEstimateRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; priceSource: 'verified_vendor' | 'budget_allocation' | 'reserve' };
type Plan = { coupleUserId: number; coupleName: string; coupleEmail: string; requestedBudgetRwf: number | string; guestCount: number; location: string; weddingDate: string | null; weddingFormat: string | null; vendorNeeds: string[]; planId: number | null; version: number | null; plannedTotalRwf: number | string | null; isOverBudget: boolean | number; status: 'proposed' | 'approved' | 'rejected' | null; reviewNote: string | null; generatedAt: string | null; allocations: Allocation[]; adminVendorSelections: Record<string, number> };
type Vendor = { id: number; businessName: string; category: string; location: string; serviceDescription: string | null; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; isVerified: boolean; pricesApproved: boolean; status: string };
type AvailabilityStatus = 'not_checked' | 'waiting_for_vendor' | 'available' | 'unavailable' | 'approved';
type VendorChoice = { vendorId: number; businessName: string; location: string; priceFromRwf: number | string | null; priceToRwf: number | string | null; pricingBasis: 'fixed' | 'per_guest'; estimatedPriceRwf: number; isVerified?: boolean | number; pricesApproved?: boolean | number; vendorStatus?: string };
type VendorAvailability = VendorChoice & { need: string; category: string; categoryBudget: number; isVerified: boolean | number; pricesApproved: boolean | number; availabilityStatus: AvailabilityStatus; availabilityUpdatedAt: string | null; internalNote?: string | null; candidates?: VendorChoice[]; adminCandidates?: VendorChoice[] };
const availabilityLabels: Record<AvailabilityStatus, string> = { not_checked: 'Not checked', waiting_for_vendor: 'Waiting for vendor', available: 'Available', unavailable: 'Unavailable', approved: 'Approved · availability confirmed' };
const budgetCategories = [
  ['Venue', 4], ['Catering', 40], ['Decoration', 25], ['Florist & Flowers', 2], ['Photography & Video', 5], ['Makeup Artist', 1], ['Hair Stylist', 2], ['Transport', 1], ['Cake', 2], ['Traditional Dancers', 1], ['Sound System', 1], ['Music Band', 1], ['DJ', 2], ['MC', 1], ['Wedding Services & Protocol', 2], ['Drinks & Beverage Service', 2], ['Lighting, Screens & Stage', 2], ['Rings, Gifts & Souvenirs', 2], ['Stationery & Invitations', 1], ['Other Costs', 2], ['Emergency Reserve', 1],
] as const;
const money = (value: number | string | null | undefined) => `${Number(value ?? 0).toLocaleString()} RWF`;
const weddingFormatLabel = (format: string | null) => ({ traditional_church_reception: 'Traditional + church + reception', church_reception: 'Church + reception', traditional_only: 'Traditional celebration', other: 'Other / still deciding' }[format ?? 'other'] ?? 'Other / still deciding');

export default function BudgetPlansPage({ onNotify, showCategories = true }: { onNotify: (message: string) => void; showCategories?: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const vendorCategoryRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'proposed' | 'approved' | 'rejected' | 'over-budget'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [vendorAvailability, setVendorAvailability] = useState<VendorAvailability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityBusyId, setAvailabilityBusyId] = useState<number | null>(null);
  const [budgetVendorBusyCategory, setBudgetVendorBusyCategory] = useState<string | null>(null);
  const [replacementByCategory, setReplacementByCategory] = useState<Record<string, number>>({});
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [planResponse, vendorResponse] = await Promise.all([fetch('/api/admin/budget-plans'), fetch('/api/admin/vendors?status=all')]);
      const [planData, vendorData] = await Promise.all([
        readApiResponse<{ plans: Plan[] }>(planResponse),
        readApiResponse<{ vendors: Vendor[] }>(vendorResponse),
      ]);
      setPlans(planData.plans); setVendors(vendorData.vendors);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load budget plans.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedCategory) vendorCategoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selectedCategory]);

  async function generate(coupleUserId: number) {
    setBusyId(coupleUserId); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${coupleUserId}/generate`, { method: 'POST' });
      const data = await readApiResponse<{ isOverBudget: boolean; plannedTotalRwf: number }>(response);
      onNotify(data.isOverBudget ? `Plan generated and flagged: ${money(data.plannedTotalRwf)} exceeds this couple’s budget.` : 'A budget plan was generated using approved vendor prices.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate a plan.'); }
    finally { setBusyId(null); }
  }

  async function review(plan: Plan, status: 'approved' | 'rejected') {
    if (!plan.planId) return;
    const note = status === 'rejected' ? window.prompt('What should the couple or planning team revise?') : window.prompt('Optional approval note:') ;
    if (note === null) return;
    setBusyId(plan.coupleUserId); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${plan.planId}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }) });
      await readApiResponse<{ ok: boolean }>(response);
      onNotify(status === 'approved' ? 'Budget plan approved and shared with the couple.' : 'Budget plan rejected with revision notes.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not review this plan.'); }
    finally { setBusyId(null); }
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>, vendor: VendorAvailability) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get('status')) as AvailabilityStatus;
    const internalNote = String(form.get('internalNote') ?? '').trim();
    if (!selectedPlan) return;
    setAvailabilityBusyId(vendor.vendorId); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${selectedPlan.coupleUserId}/vendor-availability/${vendor.vendorId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, internalNote }),
      });
      await readApiResponse<{ ok: boolean }>(response);
      setVendorAvailability((items) => items.map((item) => item.vendorId === vendor.vendorId ? { ...item, availabilityStatus: status, internalNote } : item));
      onNotify(`${vendor.businessName}: ${availabilityLabels[status]}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save vendor availability.'); }
    finally { setAvailabilityBusyId(null); }
  }

  async function replaceVendor(vendor: VendorAvailability) {
    const vendorId = replacementByCategory[vendor.category] ?? vendor.candidates?.[0]?.vendorId;
    if (!selectedPlan || !vendorId || vendorId === vendor.vendorId) return;
    setAvailabilityBusyId(vendor.vendorId); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${selectedPlan.coupleUserId}/vendor-selection/${encodeURIComponent(vendor.category)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId }),
      });
      await readApiResponse<{ ok: boolean }>(response);
      const generated = await fetch(`/api/admin/budget-plans/${selectedPlan.coupleUserId}/generate`, { method: 'POST' });
      const generatedData = await readApiResponse<{ isOverBudget: boolean; plannedTotalRwf: number }>(generated);
      await load();
      const refreshedResponse = await fetch(`/api/admin/budget-plans/${selectedPlan.coupleUserId}/vendor-availability`);
      const refreshed = await readApiResponse<{ vendors: VendorAvailability[] }>(refreshedResponse);
      setVendorAvailability(refreshed.vendors ?? []);
      setReplacementByCategory((items) => ({ ...items, [vendor.category]: 0 }));
      onNotify(generatedData.isOverBudget
        ? `${vendor.category} vendor updated. The refreshed proposal is over budget at ${money(generatedData.plannedTotalRwf)}.`
        : `${vendor.category} vendor updated and the budget proposal refreshed for ${selectedPlan.coupleName}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not replace the vendor.'); }
    finally { setAvailabilityBusyId(null); }
  }

  async function chooseBudgetVendor(plan: Plan, category: string, vendorId: number | null) {
    setBudgetVendorBusyCategory(category); setError('');
    try {
      const response = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/vendor-selection/${encodeURIComponent(category)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId }),
      });
      await readApiResponse<{ ok: boolean }>(response);
      const generated = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/generate`, { method: 'POST' });
      const generatedData = await readApiResponse<{ isOverBudget: boolean; plannedTotalRwf: number }>(generated);
      await load();
      const availabilityResponse = await fetch(`/api/admin/budget-plans/${plan.coupleUserId}/vendor-availability`);
      const availabilityData = await readApiResponse<{ vendors: VendorAvailability[] }>(availabilityResponse);
      setVendorAvailability(availabilityData.vendors ?? []);
      onNotify(generatedData.isOverBudget
        ? `Vendor choice saved. The refreshed proposal is over budget at ${money(generatedData.plannedTotalRwf)}.`
        : 'Vendor choice saved and the budget proposal refreshed.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the budget vendor.'); }
    finally { setBudgetVendorBusyCategory(null); }
  }

  const filtered = plans.filter((plan) => {
    const matchesStatus = filter === 'all' || (filter === 'over-budget' ? Boolean(plan.isOverBudget) : filter === 'proposed' ? plan.status === 'proposed' : filter === 'approved' ? plan.status === 'approved' : plan.status === 'rejected');
    return matchesStatus && `${plan.coupleName} ${plan.coupleEmail} ${plan.location}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePlans = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedPlan = plans.find((plan) => plan.coupleUserId === selectedId) ?? visiblePlans[0] ?? null;
  useEffect(() => {
    if (!selectedPlan) { setVendorAvailability([]); return; }
    let current = true;
    setAvailabilityLoading(true);
    void fetch(`/api/admin/budget-plans/${selectedPlan.coupleUserId}/vendor-availability`).then(async (response) => {
      const data = await readApiResponse<{ vendors: VendorAvailability[] }>(response);
      if (current) setVendorAvailability(data.vendors ?? []);
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : 'Could not load vendor availability.'); })
      .finally(() => { if (current) setAvailabilityLoading(false); });
    return () => { current = false; };
  }, [selectedPlan?.coupleUserId]);
  const proposedCount = plans.filter((plan) => plan.status === 'proposed').length;
  const approvedCount = plans.filter((plan) => plan.status === 'approved').length;
  const rejectedCount = plans.filter((plan) => plan.status === 'rejected').length;
  const overBudgetCount = plans.filter((plan) => Boolean(plan.isOverBudget)).length;
  const availabilityCounts = vendorAvailability.reduce<Record<AvailabilityStatus, number>>((counts, vendor) => {
    counts[vendor.availabilityStatus] += 1;
    return counts;
  }, { not_checked: 0, waiting_for_vendor: 0, available: 0, unavailable: 0, approved: 0 });
  const setPlanFilter = (next: typeof filter) => { setFilter(next); setSelectedId(null); setPage(1); };
  const exportReport = () => {
    const rows = [['Couple', 'Email', 'Wedding date', 'Location', 'Guests', 'Requested budget (RWF)', 'Plan status', 'Plan estimate (RWF)'], ...filtered.map((plan) => [plan.coupleName, plan.coupleEmail, plan.weddingDate ?? '', plan.location, String(plan.guestCount), String(plan.requestedBudgetRwf), plan.status ?? 'not generated', String(plan.plannedTotalRwf ?? '')])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'wedding-plans-report.csv'; link.click(); URL.revokeObjectURL(link.href);
  };
  return <>
    <div className="plans-page-heading"><div><h2>Wedding Plans</h2><p>Manage and monitor all wedding plans in one place.</p></div><div><button className="plans-export" onClick={exportReport}><Download size={15} /> Export report</button><button className="plans-create" onClick={() => { const plan = plans.find((item) => !item.planId) ?? selectedPlan; if (plan) void generate(plan.coupleUserId); }} disabled={!plans.length}><Plus size={15} /> Generate plan</button></div></div>
    <div className="budget-review-metrics plans-metrics" aria-label="Filter wedding plans">
      {([['all', 'Total plans', plans.length, 'All wedding plans', Users], ['proposed', 'Planning', proposedCount, 'In progress', Clock3], ['approved', 'Confirmed', approvedCount, 'Approved plans', CheckCircle2], ['rejected', 'Needs revision', rejectedCount, 'Review requested', BadgeCheck], ['over-budget', 'Over budget', overBudgetCount, 'Require attention', AlertTriangle]] as const).map(([key, label, count, caption, Icon]) => <button type="button" key={key} className={`${key === 'over-budget' && overBudgetCount ? 'over-budget ' : ''}${filter === key ? 'active' : ''}`} aria-pressed={filter === key} onClick={() => setPlanFilter(key)}><Icon size={20} /><span>{label}</span><b>{count}</b><small>{caption}</small></button>)}
    </div>
    {selectedPlan && <section className="admin-panel plans-availability-panel"><div className="plans-availability-heading"><div><span className="eyebrow">SELECTED WEDDING</span><h3>Vendor choices · {selectedPlan.coupleName}</h3><p>{selectedPlan.weddingDate ? new Date(`${selectedPlan.weddingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Wedding date not set'} · Choose a verified vendor yourself; prices above the category guide are allowed and will be reflected in the plan total.</p></div><button className="availability-open-button" disabled={availabilityLoading || !selectedPlan.vendorNeeds.length} onClick={() => setAvailabilityOpen(true)}>{availabilityLoading ? 'Loading vendors…' : `Choose vendors${vendorAvailability.length ? ` (${vendorAvailability.length})` : ''}`}</button></div><div className="availability-summary" aria-label="Vendor availability summary">{(['not_checked', 'waiting_for_vendor', 'available', 'unavailable', 'approved'] as const).map((status) => <span className={`availability-summary-item ${status}`} key={status}><b>{availabilityCounts[status]}</b><small>{status === 'not_checked' ? 'Not checked' : availabilityLabels[status]}</small></span>)}</div></section>}
    {error && <div className="admin-alert">{error}</div>}
    {showCategories && <section className="admin-panel budget-category-panel"><div className="admin-panel-heading"><div><span className="eyebrow">BUDGET CATEGORIES</span><h3>{selectedCategory ? selectedCategory : 'Explore the wedding budget'}</h3><p>{selectedCategory ? 'Vendors and price verification for this budget category.' : 'Select a category to see its budget share and the vendors available to your planning team.'}</p></div>{selectedCategory && <button className="subtle-action" onClick={() => setSelectedCategory(null)}>? All categories</button>}</div>
      {!selectedCategory ? <div className="budget-category-cards">{budgetCategories.map(([category, percent], index) => { const matches = vendors.filter((vendor) => vendor.category.toLocaleLowerCase() === category.toLocaleLowerCase()); const priced = matches.filter((vendor) => vendor.priceFromRwf !== null).length; return <button key={category} className="budget-category-card" onClick={() => setSelectedCategory(category)}><span className={`budget-category-icon tone-${index % 5}`}><Store size={20} /></span><b>{category}</b><small>{percent}% of suggested budget</small><strong>{matches.length} vendor{matches.length === 1 ? '' : 's'} · {priced} priced</strong></button>; })}</div> : <div className="budget-category-vendors" ref={vendorCategoryRef}>{vendors.filter((vendor) => vendor.category.toLocaleLowerCase() === selectedCategory.toLocaleLowerCase()).length ? vendors.filter((vendor) => vendor.category.toLocaleLowerCase() === selectedCategory.toLocaleLowerCase()).map((vendor) => <article className="budget-category-vendor" key={vendor.id}><div className="budget-couple-icon"><Store size={17} /></div><div className="budget-category-vendor-info"><b>{vendor.businessName}</b><span><MapPin size={12} /> {vendor.location}</span>{vendor.serviceDescription && <small>{vendor.serviceDescription}</small>}</div><div className="budget-category-vendor-price"><b>{vendor.priceFromRwf == null ? 'Price not entered' : `${money(vendor.priceFromRwf)}${vendor.priceToRwf != null ? ` – ${money(vendor.priceToRwf)}` : '+'} ${vendor.pricingBasis === 'per_guest' ? '/ guest' : 'package'}`}</b><span className={`vendor-state ${vendor.status}`}><i />{vendor.status}</span><small>{vendor.isVerified ? 'Business verified' : 'Business not verified'} · {vendor.pricesApproved ? 'Price approved' : 'Price awaiting review'}</small></div></article>) : <div className="admin-empty"><div><b>No vendors in {selectedCategory} yet</b><p>Add one from Vendors and mark its price for review to use it in generated plans.</p></div></div>}</div>}
    </section>}
    <div className="plans-workspace"><section className="admin-panel plans-table-panel"><div className="plans-toolbar"><label className="vendor-search"><Search size={15} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); setSelectedId(null); }} placeholder="Search plans, couples, location…" /></label><select value={filter} onChange={(event) => setPlanFilter(event.target.value as typeof filter)} aria-label="Filter wedding plan status"><option value="all">Status: All</option><option value="proposed">Planning</option><option value="approved">Confirmed</option><option value="rejected">Needs revision</option><option value="over-budget">Over budget</option></select><button className="subtle-action" onClick={() => void load()}><RefreshCw size={13} /> Refresh</button></div>
      {loading ? <div className="admin-empty">Loading wedding plans…</div> : <><div className="plans-table-wrap"><table className="plans-table"><thead><tr><th>Couple</th><th>Wedding date</th><th>Location</th><th>Budget (RWF)</th><th>Status</th><th>Plan</th><th>Actions</th></tr></thead><tbody>{visiblePlans.map((plan) => { const state = plan.status === 'approved' ? 'Confirmed' : plan.status === 'proposed' ? 'Planning' : plan.status === 'rejected' ? 'Needs revision' : 'Not generated'; return <tr key={plan.coupleUserId} className={selectedPlan?.coupleUserId === plan.coupleUserId ? 'selected' : ''} onClick={() => setSelectedId(plan.coupleUserId)}><td><span className="plans-couple-avatar"><Users size={16} /></span><span><b>{plan.coupleName}</b><small>Plan #{plan.planId ? `WP-${String(plan.planId).padStart(5, '0')}` : 'Not generated'}</small></span></td><td>{plan.weddingDate ? new Date(`${plan.weddingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not set'}<small>{plan.guestCount} guests</small></td><td>{plan.location || 'Not set'}</td><td><b>{Number(plan.requestedBudgetRwf).toLocaleString()}</b><small>RWF</small></td><td><span className={`plans-status ${plan.status ?? 'missing'}`}>{state}</span>{Boolean(plan.isOverBudget) && <small className="plans-overbudget">Over budget</small>}</td><td><b>{plan.planId ? `${plan.allocations.length} categories` : 'Not generated'}</b><small>{plan.planId ? `v${plan.version}` : 'Ready to generate'}</small></td><td><button className="plans-view-button" aria-label={`View ${plan.coupleName}`} onClick={(event) => { event.stopPropagation(); setSelectedId(plan.coupleUserId); }}><Eye size={16} /></button><button className="plans-view-button" aria-label={`Generate plan for ${plan.coupleName}`} onClick={(event) => { event.stopPropagation(); void generate(plan.coupleUserId); }}><MoreVertical size={16} /></button></td></tr>; })}</tbody></table></div><div className="plans-table-footer"><span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} filtered · {plans.length} total</span><div className="plans-pagination"><button type="button" aria-label="Previous page" onClick={() => { setPage((value) => Math.max(1, value - 1)); setSelectedId(null); }} disabled={page <= 1}>Previous</button><span>Page {page} of {pageCount}</span><button type="button" aria-label="Next page" onClick={() => { setPage((value) => Math.min(pageCount, value + 1)); setSelectedId(null); }} disabled={page >= pageCount}>Next</button></div></div></>}
    </section>
    {selectedPlan && <aside className="admin-panel plans-detail"><header><div className="plans-detail-cover"><span className="plans-status confirmed">{selectedPlan.status === 'approved' ? 'Confirmed' : selectedPlan.status === 'proposed' ? 'Planning' : selectedPlan.status === 'rejected' ? 'Needs revision' : 'Not generated'}</span></div><div className="plans-detail-title"><div><h3>{selectedPlan.coupleName}</h3><p>Plan #{selectedPlan.planId ? `WP-${String(selectedPlan.planId).padStart(5, '0')}` : 'Not generated'}</p></div><button aria-label="Close plan details" onClick={() => setSelectedId(null)}><X size={16} /></button></div></header><div className="plans-detail-facts"><p><CalendarDays size={15} />{selectedPlan.weddingDate ? new Date(`${selectedPlan.weddingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Wedding date not set'}<small>{selectedPlan.guestCount} guests</small></p><p><MapPin size={15} />{selectedPlan.location || 'Location not set'}</p><p><CircleDollarSign size={15} />Total budget <b>{money(selectedPlan.requestedBudgetRwf)}</b></p></div><h4 className="plans-overview-label">Celebration format</h4><p className="plans-no-allocation">{weddingFormatLabel(selectedPlan.weddingFormat)}</p><h4 className="plans-overview-label">Vendor needs</h4><div className="plans-vendor-needs">{selectedPlan.vendorNeeds?.length ? selectedPlan.vendorNeeds.map((need) => <span key={need}>{need}</span>) : <small>No specific vendors selected</small>}</div><h4 className="plans-overview-label">Plan overview</h4>{selectedPlan.allocations.length ? <div className="plans-allocation-list">{selectedPlan.allocations.slice(0, 6).map((allocation, index) => <div key={allocation.category}><i className={`tone-${index % 5}`} /><span>{allocation.category}</span><b>{Number(allocation.percent)}%</b></div>)}</div> : <p className="plans-no-allocation">No plan has been generated for this wedding yet.</p>}<h4 className="plans-overview-label">Quick actions</h4><div className="plans-quick-actions"><button onClick={() => void generate(selectedPlan.coupleUserId)} disabled={busyId === selectedPlan.coupleUserId}><Sparkles size={15} />{selectedPlan.planId ? 'Regenerate' : 'Generate plan'}</button>{selectedPlan.status === 'proposed' && <><button onClick={() => void review(selectedPlan, 'approved')} disabled={busyId === selectedPlan.coupleUserId}><BadgeCheck size={15} />Approve</button><button onClick={() => void review(selectedPlan, 'rejected')} disabled={busyId === selectedPlan.coupleUserId}><AlertTriangle size={15} />Request changes</button></>}</div><a className="plans-detail-email" href={`mailto:${selectedPlan.coupleEmail}`}>Contact couple</a>{selectedPlan.reviewNote && <p className="budget-review-note"><b>Review note:</b> {selectedPlan.reviewNote}</p>}{selectedPlan.planId && <details className="plans-full-breakdown"><summary>Full budget breakdown · choose a vendor for each category</summary><div className="budget-table-wrap"><table className="budget-table"><thead><tr><th>Category</th><th>Share</th><th>Planned</th><th>Vendor choice</th></tr></thead><tbody>{selectedPlan.allocations.map((a) => { const categoryVendors = vendors.filter((vendor) => vendor.category.toLowerCase() === a.category.toLowerCase() && vendor.status !== 'inactive'); return <tr key={a.category}><td>{a.category}</td><td>{Number(a.percent)}%</td><td>{money(a.plannedAmountRwf)}</td><td><select aria-label={`Choose vendor for ${a.category}`} value={selectedPlan.adminVendorSelections?.[a.category] == null ? '' : String(selectedPlan.adminVendorSelections[a.category])} disabled={budgetVendorBusyCategory === a.category || !categoryVendors.length} onChange={(event) => void chooseBudgetVendor(selectedPlan, a.category, event.currentTarget.value ? Number(event.currentTarget.value) : null)}><option value="">No vendor selected — admin decides</option>{categoryVendors.map((vendor) => { const estimate = vendor.priceFromRwf == null ? null : Number(vendor.priceFromRwf) * (vendor.pricingBasis === 'per_guest' ? selectedPlan.guestCount : 1); const categoryGuide = Number(selectedPlan.requestedBudgetRwf) * Number(a.percent) / 100; return <option key={vendor.id} value={vendor.id}>{vendor.businessName} · {estimate == null ? 'price not entered' : money(estimate)} · {vendor.status} · {vendor.isVerified ? 'verified' : 'verification pending'} · {vendor.pricesApproved ? 'price approved' : 'price pending'}{estimate != null && estimate > categoryGuide ? ' · above category guide' : ''}</option>; })}</select>{!categoryVendors.length && <small>No non-inactive vendor is available.</small>}</td></tr>; })}</tbody></table></div></details>}</aside>}
    </div>
    {availabilityOpen && selectedPlan && <VendorAvailabilityDialog plan={selectedPlan} vendors={vendorAvailability} loading={availabilityLoading} busyId={availabilityBusyId} replacementByCategory={replacementByCategory} onSelectReplacement={(category, vendorId) => setReplacementByCategory((items) => ({ ...items, [category]: vendorId }))} onReplace={replaceVendor} onClose={() => setAvailabilityOpen(false)} onSave={saveAvailability} />}
  </>;
}

function VendorAvailabilityDialog({ plan, vendors: items, loading, busyId, replacementByCategory, onSelectReplacement, onReplace, onClose, onSave }: {
  plan: Plan; vendors: VendorAvailability[]; loading: boolean; busyId: number | null;
  replacementByCategory: Record<string, number>; onSelectReplacement: (category: string, vendorId: number) => void;
  onReplace: (vendor: VendorAvailability) => Promise<void>;
  onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>, vendor: VendorAvailability) => Promise<void>;
}) {
  const date = plan.weddingDate ? new Date(`${plan.weddingDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date not set';
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="availability-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="availability-modal" role="dialog" aria-modal="true" aria-labelledby="availability-modal-title">
      <header><div><span className="eyebrow">WEDDING PLAN · {date}</span><h2 id="availability-modal-title">Vendor availability</h2><p>{plan.coupleName} · Only vendors matched in this couple’s illustrative budget are listed. Call them and record the reply; private notes stay admin-only.</p></div><button className="modal-close" onClick={onClose} aria-label="Close vendor availability"><X size={18} /></button></header>
      {loading ? <div className="availability-modal-empty">Loading vendors…</div> : items.length ? <div className="availability-modal-list">{items.map((vendor) => {
        const adminCandidates = vendor.adminCandidates ?? [];
        const otherCandidates = adminCandidates.filter((candidate) => candidate.vendorId !== vendor.vendorId);
        return <form key={vendor.vendorId} onSubmit={(event) => void onSave(event, vendor)}>
          <div className="availability-modal-vendor"><b>{vendor.businessName}</b><span>{vendor.need} · {vendor.category} · {vendor.location}</span><small>{vendor.priceFromRwf == null ? 'No price entered' : `${money(vendor.priceFromRwf)}${vendor.priceToRwf != null ? ` – ${money(vendor.priceToRwf)}` : '+'}${vendor.pricingBasis === 'per_guest' ? ' per guest' : ' package'}`}</small><i>Illustrative budget match</i></div>
          <div className="availability-replacement"><label><span>Choose a different {vendor.category} vendor · category guide {money(vendor.categoryBudget)}</span><select value={replacementByCategory[vendor.category] ?? ''} onChange={(event) => onSelectReplacement(vendor.category, Number(event.target.value))}><option value="">Select vendor</option>{otherCandidates.map((candidate) => <option key={candidate.vendorId} value={candidate.vendorId}>{candidate.businessName} · {candidate.priceFromRwf == null && candidate.priceToRwf == null ? 'price not entered' : money(candidate.estimatedPriceRwf)} · {candidate.vendorStatus ?? 'status unknown'} · {candidate.isVerified ? 'verified' : 'verification pending'} · {candidate.pricesApproved ? 'price approved' : 'price pending'}{candidate.estimatedPriceRwf > vendor.categoryBudget ? ' · above category guide' : ''}</option>)}</select></label><button type="button" className="availability-save" disabled={busyId === vendor.vendorId || !otherCandidates.some((candidate) => candidate.vendorId === replacementByCategory[vendor.category])} onClick={() => void onReplace(vendor)}>{busyId === vendor.vendorId ? 'Updating…' : 'Use vendor & update plan'}</button>{otherCandidates.length === 0 && <small>No other non-inactive vendor is available in this category.</small>}</div>
          <label><span>Status shown to couple</span><select name="status" defaultValue={vendor.availabilityStatus}><option value="not_checked">Not checked</option><option value="waiting_for_vendor">Waiting for vendor</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="approved" disabled={!['available', 'approved'].includes(vendor.availabilityStatus)}>Approved · availability confirmed</option></select></label>
          <label className="availability-modal-note"><span>Private call note</span><input name="internalNote" defaultValue={vendor.internalNote ?? ''} placeholder="e.g. Called 21 Oct; free for the full day" /></label>
          <div className="availability-modal-footer"><small className={`availability-badge ${vendor.availabilityStatus}`}>{availabilityLabels[vendor.availabilityStatus]}{vendor.availabilityUpdatedAt ? ` · ${vendor.availabilityUpdatedAt}` : ''}</small><button className="availability-save" disabled={busyId === vendor.vendorId}>{busyId === vendor.vendorId ? 'Saving…' : 'Save status'}</button></div>
        </form>;
      })}</div> : <div className="availability-modal-empty">No vendor choices are available for the selected services right now.</div>}
    </section>
  </div>;
}
