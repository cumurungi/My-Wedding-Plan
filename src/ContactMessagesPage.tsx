import { useCallback, useEffect, useState } from 'react';
import { Mail, MessageSquare, Phone, RefreshCw } from 'lucide-react';
import { readApiResponse } from './api-response';

type ContactMessage = { id: number; name: string; email: string; phone: string | null; message: string; status: 'new' | 'handled'; createdAt: string };

export default function ContactMessagesPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/contact-messages');
      const data = await readApiResponse<{ messages: ContactMessage[] }>(response);
      setMessages(data.messages);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load messages.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(message: ContactMessage) {
    const status = message.status === 'new' ? 'handled' : 'new';
    setBusyId(message.id); setError('');
    try {
      const response = await fetch(`/api/admin/contact-messages/${message.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      await readApiResponse<{ updated: boolean }>(response);
      onNotify(status === 'handled' ? 'Message marked as handled.' : 'Message moved back to new.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this message.'); }
    finally { setBusyId(null); }
  }

  return <section className="contact-inbox">
    <div className="contact-inbox-toolbar"><p>Messages submitted through the Contact Us page.</p><button className="subtle-action" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button></div>
    {error && <div className="admin-alert">{error}</div>}
    {loading ? <div className="admin-empty">Loading messages…</div> : messages.length ? <div className="contact-message-list">{messages.map((message) => <article key={message.id} className={`contact-message-card ${message.status}`}>
      <header><div><span className={`contact-message-status ${message.status}`}>{message.status === 'new' ? 'New' : 'Handled'}</span><h3>{message.name}</h3><time>{message.createdAt}</time></div><button className="subtle-action" disabled={busyId === message.id} onClick={() => void updateStatus(message)}>{busyId === message.id ? 'Saving…' : message.status === 'new' ? 'Mark handled' : 'Reopen'}</button></header>
      <div className="contact-message-links"><a href={`mailto:${encodeURIComponent(message.email)}`}><Mail size={14} />{message.email}</a>{message.phone && <a href={`tel:${encodeURIComponent(message.phone)}`}><Phone size={14} />{message.phone}</a>}</div>
      <p>{message.message}</p>
    </article>)}</div> : <div className="admin-empty"><MessageSquare size={18} /> No contact messages yet.</div>}
  </section>;
}
