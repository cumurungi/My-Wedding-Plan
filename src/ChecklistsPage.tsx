import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Search, Users } from 'lucide-react';
import { eventTypeLabels, type EventType } from '../shared/package-plans';

type Couple = { id: number; name: string; email: string; eventType?: string | null; eventName?: string | null; packageCode?: string | null; guestCount: number | null; budgetRwf: number | null; weddingDate: string | null; location: string | null; style: string | null; weddingFormat?: string | null; specialRequirements: string | null; otherCostsDescription?: string | null; vendorNeeds: string[]; hasWeddingDetails: boolean };
type VendorOption = { vendorId: number; businessName: string; category: string; location: string; status: 'active' | 'pending' | 'inactive' };
type VendorTask = { category: string; vendorName: string | null; vendorSource: string | null; selectedVendorId: number | null; vendorOptions: VendorOption[]; completed: boolean };
type CoupleDetail = Omit<Couple, 'vendorNeeds' | 'hasWeddingDetails'>;
type ApiResponse = { error?: string; couples?: Couple[]; couple?: CoupleDetail; tasks?: VendorTask[] };
async function readApiResponse(response: Response): Promise<ApiResponse> {
  const body = await response.text();
  if (!body.trim()) return { error: `The server returned an empty response (${response.status}).` };
  try { return JSON.parse(body) as ApiResponse; }
  catch { return { error: `The server returned an unreadable response (${response.status}).` }; }
}
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set';
const money = (value: number | null) => value == null ? 'Not set' : `RWF ${Number(value).toLocaleString('en-US')}`;

export default function ChecklistsPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [couples, setCouples] = useState<Couple[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CoupleDetail | null>(null);
  const [tasks, setTasks] = useState<VendorTask[]>([]);
  const [search, setSearch] = useState('');
  const [loadingCouples, setLoadingCouples] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadCouples = useCallback(async () => {
    setLoadingCouples(true);
    try {
      const response = await fetch('/api/admin/couples');
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load couple accounts.');
      setCouples(data.couples ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load couple accounts.'); }
    finally { setLoadingCouples(false); }
  }, []);
  useEffect(() => { void loadCouples(); }, [loadCouples]);

  const loadDetail = useCallback(async (id: number) => {
    setSelectedId(id); setLoadingDetail(true); setError('');
    try {
      const response = await fetch(`/api/admin/couples/${id}/vendor-checklist`);
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load this event plan.');
      if (!data.couple) throw new Error('The server response did not include this client’s event details.');
      setDetail(data.couple); setTasks(data.tasks ?? []);
    } catch (cause) { setDetail(null); setTasks([]); setError(cause instanceof Error ? cause.message : 'Could not load this event plan.'); }
    finally { setLoadingDetail(false); }
  }, []);

  const visibleCouples = useMemo(() => couples.filter((couple) => `${couple.name} ${couple.email} ${couple.location ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())), [couples, search]);
  const completed = tasks.filter((task) => task.completed).length;

  async function toggleTask(task: VendorTask, value: boolean) {
    if (selectedId === null) return;
    setError('');
    setTasks((current) => current.map((item) => item.category === task.category ? { ...item, completed: value } : item));
    try {
      const response = await fetch(`/api/admin/couples/${selectedId}/vendor-checklist/${encodeURIComponent(task.category)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: value }) });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not update vendor progress.');
      onNotify(`${task.category} marked ${value ? 'done' : 'to do'} for ${detail?.name ?? 'this couple'}.`);
    } catch (cause) {
      setTasks((current) => current.map((item) => item.category === task.category ? { ...item, completed: task.completed } : item));
      setError(cause instanceof Error ? cause.message : 'Could not update vendor progress.');
    }
  }

  async function selectVendor(task: VendorTask, vendorId: number | null) {
    if (selectedId === null) return;
    setSavingCategory(task.category); setError('');
    try {
      const response = await fetch(`/api/admin/couples/${selectedId}/vendor-checklist/${encodeURIComponent(task.category)}/selection`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendorId }) });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not assign this vendor.');
      onNotify(vendorId === null ? `Vendor removed from ${task.category}.` : `${task.category} vendor assigned to ${detail?.name ?? 'this couple'}.`);
      await loadDetail(selectedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not assign this vendor.'); }
    finally { setSavingCategory(null); }
  }

  return <>
    <div className="checklist-page-intro"><div><h2>Event plans</h2><p>Select a client to review their event brief, assign vendors from your directory, and track each requested service.</p></div></div>
    {error && <div className="admin-alert">{error}</div>}
    <div className="vendor-overview-layout checklist-couples-layout">
      <section className="admin-panel checklist-couple-panel"><header className="vendor-directory-heading"><div><Users size={18} /><div><h3>Clients</h3><p>{couples.length} event account{couples.length === 1 ? '' : 's'}</p></div></div></header>
        <label className="vendor-search checklist-couple-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search couples…" /></label>
        <div className="checklist-couple-list">{loadingCouples ? <div className="admin-empty">Loading couples…</div> : visibleCouples.length ? visibleCouples.map((couple) => {
          const active = selectedId === couple.id;
          const label = eventTypeLabels[(couple.eventType ?? 'wedding') as EventType] ?? 'Event';
          return <button key={couple.id} className={`checklist-couple-row ${active ? 'active' : ''}`} onClick={() => void loadDetail(couple.id)}><span className="avatar">{couple.name.slice(0, 1).toUpperCase()}</span><span className="checklist-couple-row-copy"><b>{couple.name} · {couple.eventName || label}</b><small>{couple.email}</small><small>{couple.weddingDate ? dateLabel(couple.weddingDate) : 'Event date not set'} · {couple.vendorNeeds.length} requested services</small></span><span className="checklist-couple-row-count">{couple.vendorNeeds.length}</span></button>;
        }) : <div className="admin-empty">No couples match this search.</div>}</div>
      </section>

      <section className="admin-panel checklist-detail-panel">{!selectedId ? <div className="admin-empty"><div><b>Select a client</b><p>Event details and requested services will appear here.</p></div></div> : loadingDetail ? <div className="admin-empty">Loading event details…</div> : detail && <>
        <header className="checklist-detail-heading"><div><span className="eyebrow">CLIENT EVENT PLAN</span><h3>{detail.name} · {detail.eventName || eventTypeLabels[(detail.eventType ?? 'wedding') as EventType] || 'Event'}</h3><p>{detail.email}</p></div><span className="couple-checklist-count">{completed} of {tasks.length} done</span></header>
        <div className="checklist-wedding-details"><div><small>Event type</small><b>{eventTypeLabels[(detail.eventType ?? 'wedding') as EventType] || 'Event'}</b></div><div><small>Event date</small><b><CalendarDays size={14} />{dateLabel(detail.weddingDate)}</b></div><div><small>Location</small><b>{detail.location || 'Not set'}</b></div><div><small>Guests / attendees</small><b>{detail.guestCount ? Number(detail.guestCount).toLocaleString('en-US') : 'Not set'}</b></div><div><small>Budget</small><b>{money(detail.budgetRwf)}</b></div><div><small>Style</small><b>{detail.style || 'Not set'}</b></div>{detail.eventType === 'wedding' && <div><small>Celebration format</small><b>{detail.weddingFormat?.replaceAll('_', ' ') || 'Not set'}</b></div>}{detail.otherCostsDescription && <div className="checklist-requirements"><small>Other costs</small><p>{detail.otherCostsDescription}</p></div>}{detail.specialRequirements && <div className="checklist-requirements"><small>Special requirements</small><p>{detail.specialRequirements}</p></div>}</div>
        <div className="checklist-vendor-heading"><div><h4>Requested vendors</h4><p>Tick an item when that vendor is confirmed or paid for.</p></div>{tasks.length > 0 && <span>{Math.round(completed / tasks.length * 100)}% complete</span>}</div>
        {tasks.length ? <div className="checklist-vendor-list">{tasks.map((task) => <div className={`checklist-vendor-row ${task.completed ? 'completed' : ''}`} key={task.category}><label className="checklist-vendor-toggle"><input type="checkbox" checked={task.completed} onChange={(event) => void toggleTask(task, event.target.checked)} /><span className="checklist-vendor-check"><Check size={14} /></span></label><span className="checklist-vendor-copy"><b>{task.category}</b><small>{task.vendorName ? `${task.vendorSource}: ${task.vendorName}` : 'Vendor not selected yet'}</small></span><select className="checklist-vendor-select" aria-label={`Select ${task.category} vendor`} value={task.selectedVendorId ?? ''} disabled={savingCategory === task.category} onChange={(event) => void selectVendor(task, event.target.value ? Number(event.target.value) : null)}><option value="">Choose vendor</option>{task.vendorOptions.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId} disabled={vendor.status === 'inactive'}>{vendor.businessName}{vendor.status === 'inactive' ? ' · inactive' : ''}</option>)}</select><span className="checklist-vendor-status">{task.completed ? 'Done' : 'To do'}</span></div>)}</div> : <div className="admin-empty"><div><b>No services selected</b><p>This client has not selected any services in their event details yet.</p></div></div>}
      </>}</section>
    </div>
  </>;
}
