import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, ChevronDown, Download, FileCheck2, FileText, Plus, ShieldCheck, Upload, UserRound, Wallet, X } from 'lucide-react';

type Couple = { id: number; name: string; email: string };
type Vendor = { id: number; businessName: string; category: string; location: string };
type Contract = {
  id: number; coupleUserId: number; coupleName: string; coupleEmail: string; vendorId: number; vendorName: string;
  vendorCategory: string; title: string; amountRwf: number | string; signatureStatus: 'pending' | 'partially_signed' | 'fully_signed';
  contractDate: string | null; originalFilename: string; fileSize: number; createdAt: string;
  paidRwf: number | string; balanceRwf: number | string; notes: string | null;
};
type Payment = {
  id: number; contractId: number; amountRwf: number | string; paymentType: 'deposit' | 'installment' | 'balance' | 'other';
  status: 'pending' | 'paid'; dueDate: string | null; paidDate: string | null; reference: string | null; note: string | null;
  evidenceKey: string | null; evidenceFilename: string | null; contractTitle: string; contractAmountRwf: number | string;
  signatureStatus: string; coupleUserId: number; coupleName: string; coupleEmail: string; vendorName: string;
  paidRwf: number | string; balanceRwf: number | string;
};
const amount = (value: number | string | null | undefined) => value == null ? '—' : `${Number(value).toLocaleString()} RWF`;
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';

async function getJson<T>(url: string, key: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load the records.');
  return data[key] as T;
}

export function ContractsPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [couples, setCouples] = useState<Couple[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [coupleFilter, setCoupleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ search });
      if (coupleFilter !== 'all') query.set('coupleUserId', coupleFilter);
      const [list, people, partners] = await Promise.all([
        getJson<Contract[]>(`/api/admin/contracts?${query}`, 'contracts'),
        getJson<Couple[]>('/api/admin/couples', 'couples'),
        getJson<Vendor[]>('/api/admin/vendors?status=all', 'vendors'),
      ]);
      setContracts(list); setCouples(people); setVendors(partners);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load contracts.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [search, coupleFilter]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/contracts', { method: 'POST', body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload the contract.');
      setShowForm(false); onNotify('Contract uploaded and linked to the couple and vendor.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload the contract.'); }
    finally { setSaving(false); }
  }

  async function changeSignatureStatus(contract: Contract, signatureStatus: Contract['signatureStatus']) {
    setError('');
    try {
      const response = await fetch(`/api/admin/contracts/${contract.id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the contract status.');
      onNotify(`Signature status updated for ${contract.title}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the contract status.'); }
  }

  return <>
    <section className="admin-panel contract-workspace">
      <div className="admin-panel-heading"><div><span className="eyebrow">CONTRACT REGISTER</span><h3>Contracts by couple and vendor</h3><p>Upload agreements and track whether each is pending, partially signed, or fully signed.</p></div><button className="admin-primary" onClick={() => { setShowForm(!showForm); setError(''); }}><Plus size={15} /> Upload contract</button></div>
      {showForm && <form className="record-form" onSubmit={submit}>
        <div className="record-form-heading"><div><FileText size={17} /><b>New vendor contract</b></div><button type="button" className="modal-close" onClick={() => setShowForm(false)} aria-label="Close"><X size={17} /></button></div>
        <div className="record-form-grid"><label>Couple account<select name="coupleUserId" required defaultValue=""><option value="" disabled>Select a couple</option>{couples.map((couple) => <option key={couple.id} value={couple.id}>{couple.name} · {couple.email}</option>)}</select></label><label>Vendor<select name="vendorId" required defaultValue=""><option value="" disabled>Select a vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.businessName} · {vendor.category}</option>)}</select></label><label className="record-wide">Contract title<input name="title" required minLength={2} maxLength={180} placeholder="e.g. Wedding catering agreement" /></label><label>Contract amount<input name="amountRwf" type="number" min="1" max="10000000000000" step="1000" required placeholder="RWF" /></label><label>Contract date<input name="contractDate" type="date" /></label><label>Signature status<select name="signatureStatus" defaultValue="pending"><option value="pending">Pending signatures</option><option value="partially_signed">Partially signed</option><option value="fully_signed">Fully signed</option></select></label><label>Signed contract PDF<input name="document" type="file" accept="application/pdf,.pdf" required /></label><label className="record-wide">Notes for your team<textarea name="notes" rows={2} maxLength={5000} placeholder="Optional notes about signatures, deposits, or deliverables." /></label></div>
        {error && <p className="form-error">{error}</p>}<div className="record-form-footer"><p><ShieldCheck size={14} /> PDF files are stored privately and only admins can download them.</p><button className="admin-primary" disabled={saving}>{saving ? 'Uploading…' : <><Upload size={14} /> Save contract</>}</button></div>
      </form>}
      <div className="record-toolbar"><label className="vendor-search"><FileText size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contract, vendor, or couple" /></label><label className="couple-filter"><UserRound size={15} /><select value={coupleFilter} onChange={(event) => setCoupleFilter(event.target.value)}><option value="all">All couples</option>{couples.map((couple) => <option key={couple.id} value={couple.id}>{couple.name} · {couple.email}</option>)}</select><ChevronDown size={13} /></label></div>
      {error && !showForm && <div className="admin-alert">{error}</div>}
      {loading ? <div className="admin-empty">Loading contract records…</div> : contracts.length ? <div className="contract-list">{contracts.map((contract) => <article className="contract-card" key={contract.id}><span className="record-file-icon"><FileCheck2 size={19} /></span><div className="contract-main"><div className="contract-title-line"><h4>{contract.title}</h4><select aria-label={`Signature status for ${contract.title}`} className={`contract-status-select ${contract.signatureStatus}`} value={contract.signatureStatus} onChange={(event) => void changeSignatureStatus(contract, event.target.value as Contract['signatureStatus'])}><option value="pending">Pending signatures</option><option value="partially_signed">Partially signed</option><option value="fully_signed">Fully signed</option></select></div><div className="contract-parties"><span><UserRound size={13} />{contract.coupleName}</span><a href={`mailto:${contract.coupleEmail}`}>{contract.coupleEmail}</a><span className="party-divider">→</span><span>{contract.vendorName}</span><small>{contract.vendorCategory}</small></div><div className="contract-meta"><span><Wallet size={13} />{amount(contract.amountRwf)}</span><span><CalendarDays size={13} />{contract.contractDate ? dateLabel(contract.contractDate) : `Uploaded ${contract.createdAt}`}</span><span>{amount(contract.paidRwf)} paid · {amount(contract.balanceRwf)} balance</span></div>{contract.notes && <p className="contract-note">{contract.notes}</p>}</div><a className="download-document" href={`/api/admin/contracts/${contract.id}/document`}><Download size={14} /> Download PDF</a></article>)}</div> : <div className="admin-empty"><span className="empty-check"><FileText size={16} /></span><div><b>No contracts found</b><p>Upload a contract to connect it with a couple and vendor.</p></div></div>}
      <div className="record-count">{contracts.length} contract{contracts.length === 1 ? '' : 's'}{coupleFilter !== 'all' && couples.find((couple) => String(couple.id) === coupleFilter) ? ` for ${couples.find((couple) => String(couple.id) === coupleFilter)?.name}` : ''}</div>
    </section>
  </>;
}

export function PaymentsPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [records, agreements] = await Promise.all([
        getJson<Payment[]>('/api/admin/payments', 'payments'),
        getJson<Contract[]>('/api/admin/contracts', 'contracts'),
      ]);
      setPayments(records); setContracts(agreements);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load payments.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/payments', { method: 'POST', body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not record the payment.');
      setShowForm(false); setStatus('pending'); onNotify('Payment record added.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record the payment.'); }
    finally { setSaving(false); }
  }

  const outstanding = contracts.reduce((sum, contract) => sum + Number(contract.balanceRwf), 0);
  const collected = contracts.reduce((sum, contract) => sum + Number(contract.paidRwf), 0);
  const pendingTotal = payments.filter((payment) => payment.status === 'pending').reduce((sum, payment) => sum + Number(payment.amountRwf), 0);

  return <>
    <div className="payment-metrics"><article><span>Contracted value</span><b>{amount(contracts.reduce((sum, contract) => sum + Number(contract.amountRwf), 0))}</b></article><article><span>Paid to date</span><b>{amount(collected)}</b></article><article><span>Outstanding balance</span><b>{amount(outstanding)}</b></article><article><span>Pending payment records</span><b>{amount(pendingTotal)}</b></article></div>
    <section className="admin-panel payment-workspace"><div className="admin-panel-heading"><div><span className="eyebrow">PAYMENT TRACKER</span><h3>Deposits and balances</h3><p>Record each deposit or installment against its vendor contract.</p></div><button className="admin-primary" onClick={() => { setShowForm(!showForm); setError(''); }} disabled={!contracts.length}><Plus size={15} /> Record payment</button></div>
      {showForm && <form className="record-form" onSubmit={submit}>
        <div className="record-form-heading"><div><Wallet size={17} /><b>New payment record</b></div><button type="button" className="modal-close" onClick={() => setShowForm(false)} aria-label="Close"><X size={17} /></button></div>
        <div className="record-form-grid"><label className="record-wide">Contract<select name="contractId" required defaultValue=""><option value="" disabled>Select a vendor contract</option>{contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.vendorName} · {contract.coupleName} · Balance {amount(contract.balanceRwf)}</option>)}</select></label><label>Payment amount<input name="amountRwf" type="number" min="1" max="10000000000000" step="1000" required placeholder="RWF" /></label><label>Payment type<select name="paymentType" defaultValue="deposit"><option value="deposit">Deposit</option><option value="installment">Installment</option><option value="balance">Final balance</option><option value="other">Other</option></select></label><label>Status<select name="status" value={status} onChange={(event) => setStatus(event.target.value as 'pending' | 'paid')}><option value="pending">Pending</option><option value="paid">Paid</option></select></label>{status === 'paid' ? <label>Paid date<input name="paidDate" type="date" /></label> : <label>Due date<input name="dueDate" type="date" /></label>}<label>Reference<input name="reference" maxLength={120} placeholder="Receipt or transfer reference" /></label><label>Payment evidence <em>Optional · PDF, JPG, PNG</em><input name="evidence" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" /></label><label className="record-wide">Notes<input name="note" maxLength={1000} placeholder="Optional payment note" /></label></div>
        {error && <p className="form-error">{error}</p>}<div className="record-form-footer"><p><ShieldCheck size={14} /> Evidence files are private and admin-only.</p><button className="admin-primary" disabled={saving}>{saving ? 'Saving…' : <><Check size={14} /> Save payment</>}</button></div>
      </form>}
      {error && !showForm && <div className="admin-alert">{error}</div>}
      {loading ? <div className="admin-empty">Loading payment records…</div> : payments.length ? <div className="payment-list">{payments.map((payment) => <article className="payment-card" key={payment.id}><span className={`payment-icon ${payment.status}`}><Wallet size={18} /></span><div className="payment-main"><div className="payment-title-line"><b>{payment.paymentType[0].toUpperCase() + payment.paymentType.slice(1)} · {payment.vendorName}</b><span className={`payment-status ${payment.status}`}>{payment.status}</span></div><p>{payment.coupleName} · {payment.coupleEmail}</p><div className="payment-meta"><span>Payment {amount(payment.amountRwf)}</span><span>Contract balance {amount(payment.balanceRwf)}</span><span>{payment.status === 'paid' ? `Paid ${dateLabel(payment.paidDate)}` : `Due ${dateLabel(payment.dueDate)}`}</span>{payment.reference && <span>Ref: {payment.reference}</span>}</div>{payment.note && <small className="payment-note">{payment.note}</small>}</div>{payment.evidenceKey && <a className="download-document" href={`/api/admin/payments/${payment.id}/evidence`}><Download size={14} /> Evidence</a>}</article>)}</div> : <div className="admin-empty"><span className="empty-check"><Wallet size={16} /></span><div><b>No payments recorded yet</b><p>Add a deposit or installment to start tracking contract balances.</p></div></div>}
      <div className="record-count">{payments.length} payment record{payments.length === 1 ? '' : 's'}</div>
    </section>
  </>;
}

