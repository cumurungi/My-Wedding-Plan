import { useEffect, useState } from 'react';
import { BadgeCheck, Bell, CalendarDays, CircleDollarSign, FileText, RefreshCw } from 'lucide-react';

type NotificationType = 'vendor_verification' | 'vendor_price' | 'wedding_plan' | 'contract' | 'payment';
type AdminNotification = { id: string; type: NotificationType; title: string; detail: string; createdAt: string };
const labels: Record<NotificationType, string> = { vendor_verification: 'Vendor review', vendor_price: 'Price approval', wedding_plan: 'Wedding plan', contract: 'Contract', payment: 'Payment' };
const icons = { vendor_verification: BadgeCheck, vendor_price: CircleDollarSign, wedding_plan: CalendarDays, contract: FileText, payment: CircleDollarSign };
const destinations = { vendor_verification: 'vendors', vendor_price: 'vendors', wedding_plan: 'plans', contract: 'contracts', payment: 'payments' } as const;

export default function AdminNotificationsPage({ onNavigate }: { onNavigate: (view: 'vendors' | 'plans' | 'contracts' | 'payments') => void }) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/notifications');
      const body = await response.text();
      if (!body.trim()) throw new Error(`The server returned an empty response (HTTP ${response.status}).`);
      const data = JSON.parse(body) as { notifications?: AdminNotification[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load notifications.');
      setItems(data.notifications ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load notifications.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <section className="admin-panel admin-notifications"><header><div><span className="eyebrow">ADMIN WORKSPACE</span><h2><Bell size={19} /> Notifications</h2><p>Pending items across vendors, wedding plans, contracts, and payments.</p></div><button className="subtle-action" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh</button></header>
    {error && <div className="admin-alert">{error}</div>}
    {loading ? <div className="admin-empty">Loading notifications…</div> : items.length ? <div className="admin-notification-list">{items.map((item) => { const Icon = icons[item.type]; return <article key={item.id}><span className={`admin-notification-icon ${item.type}`}><Icon size={17} /></span><div className="admin-notification-copy"><small>{labels[item.type]} · {new Date(item.createdAt).toLocaleString()}</small><h3>{item.title}</h3><p>{item.detail}</p></div><button className="subtle-action" onClick={() => onNavigate(destinations[item.type])}>Open <span aria-hidden="true">→</span></button></article>; })}</div> : <div className="admin-notifications-empty"><span><Bell size={23} /></span><h3>You’re all caught up</h3><p>New vendor reviews, plan proposals, unsigned contracts, and pending payments will appear here.</p></div>}
  </section>;
}
