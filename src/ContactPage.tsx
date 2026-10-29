import { useState, type FormEvent } from 'react';
import { Mail, MessageSquare, Phone, Send } from 'lucide-react';
import type { User } from './wedding';

export default function ContactPage({ user }: { user: User | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setSent(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch('/api/contact-messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send your message.');
      formElement.reset();
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your message.');
    } finally { setBusy(false); }
  }

  return <section className="couple-page-panel contact-page">
    <header className="couple-page-heading"><div><span className="eyebrow">WE’RE HERE TO HELP</span><h2>Contact us</h2><p>Questions about your event plans? Send our team a message and we’ll get back to you.</p></div><MessageSquare size={22} /></header>
    <ContactDetails />
    {sent ? <div className="contact-success" role="status">Your message has been sent. Thank you for contacting us.</div> : <form className="contact-form" onSubmit={submit}>
      <label>Your name<input name="name" minLength={2} maxLength={80} autoComplete="name" defaultValue={user?.name ?? ''} required /></label>
      <label>Email address<input name="email" type="email" pattern={String.raw`[^\s@]+@[^\s@]+\.[^\s@]{2,}`} title="Enter a valid email address, such as name@example.com." maxLength={254} autoComplete="email" defaultValue={user?.email ?? ''} required /></label>
      <label>Phone number <span>Optional</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" placeholder="+250 7xx xxx xxx" /></label>
      <label className="contact-message-field">Message<textarea name="message" rows={5} minLength={10} maxLength={5000} required placeholder="How can our team help?" /></label>
      {error && <p className="couple-page-error" role="alert">{error}</p>}
      <button className="admin-primary" type="submit" disabled={busy}><Send size={15} />{busy ? 'Sending…' : 'Send message'}</button>
    </form>}
  </section>;
}

export function ContactDetails({ className = '' }: { className?: string }) {
  return <div className={`contact-details ${className}`}>
    <a href="mailto:cumurungi9@gmail.com"><Mail size={16} /><span><b>Email</b><small>cumurungi9@gmail.com</small></span></a>
    <a href="tel:+250788774958"><Phone size={16} /><span><b>Call us</b><small>0788 774 958</small></span></a>
  </div>;
}
