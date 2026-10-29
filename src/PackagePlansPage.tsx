import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Crown, Heart, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { packageCheckoutClaimStorageKey, packagePlans, type CouplePackageView, type PackageCode, type PackageOrderView } from '../shared/package-plans';
import type { User } from './wedding';

const formatPrice = (amount: number) => `${amount.toLocaleString()} RWF`;
const selectedPackageKey = 'my-wedding-plan-selected-package';
type CheckoutOrder = PackageOrderView & { claimToken?: string };
function getInitialPackage(): PackageCode {
  const saved = sessionStorage.getItem(selectedPackageKey);
  return packagePlans.find((plan) => plan.code === saved)?.code ?? 'basic';
}

export default function PackagePlansPage({ user, onAuth, onPaid }: {
  user: User | null;
  onAuth: (mode: 'login' | 'register') => void;
  onPaid: (activePackage: PackageOrderView) => void;
}) {
  const [access, setAccess] = useState<CouplePackageView | null>(null);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mtn_momo' | 'bank_transfer'>('mtn_momo');
  const [transferReference, setTransferReference] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PackageCode>(getInitialPackage);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completedOrder = useRef<number | null>(null);

  const loadAccess = useCallback(async () => {
    const response = await fetch(user ? '/api/couple/package' : '/api/package-checkout');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load your package status.');
    setAccess(user ? data : { ...data, activePackage: null, pendingOrder: null });
    if (!data.paymentMethods.mtnMomo && data.paymentMethods.bankTransfer) setPaymentMethod('bank_transfer');
    const savedCheckout = !user ? sessionStorage.getItem(packageCheckoutClaimStorageKey) : null;
    if (savedCheckout) {
      try {
        const saved = JSON.parse(savedCheckout) as { orderId: number; claimToken: string; code: PackageCode; paymentMethod: 'mtn_momo' | 'bank_transfer'; phone?: string };
        const statusResponse = await fetch(`/api/package-checkout/${saved.orderId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimToken: saved.claimToken }),
        });
        const orderData = await statusResponse.json();
        if (statusResponse.ok) {
          const order: CheckoutOrder = { ...orderData, claimToken: saved.claimToken };
          if (order.status === 'failed') {
            sessionStorage.removeItem(packageCheckoutClaimStorageKey);
          } else {
            setAccess((current) => current ? { ...current, pendingOrder: order } : current);
            setCheckoutOpen(true);
            setPaymentMethod(order.paymentMethod);
            setSelectedPackage(order.code);
            if (order.phone) setPhone(order.phone);
            if (order.payerReference) setTransferReference(order.payerReference);
            if (order.status === 'successful') onAuth('register');
          }
        } else if (statusResponse.status === 404) sessionStorage.removeItem(packageCheckoutClaimStorageKey);
      } catch {
        throw new Error('Could not restore your checkout. Please refresh the page or contact the planning team.');
      }
    }
    if (!user) return;
    if (data.pendingOrder?.code) setSelectedPackage(data.pendingOrder.code);
    else if (data.activePackage?.code) setSelectedPackage(data.activePackage.code);
    if (data.pendingOrder?.phone) setPhone(data.pendingOrder.phone);
    if (data.pendingOrder?.paymentMethod) setPaymentMethod(data.pendingOrder.paymentMethod);
    setTransferReference(data.pendingOrder?.payerReference ?? '');
  }, [onAuth, user]);

  useEffect(() => {
    void loadAccess().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load packages.'));
  }, [loadAccess, user]);

  useEffect(() => {
    if (!checkoutOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setCheckoutOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [checkoutOpen]);

  const checkPayment = useCallback(async (order: CheckoutOrder) => {
    const guestCheckout = !user && Boolean(order.claimToken);
    const response = await fetch(guestCheckout ? `/api/package-checkout/${order.id}/status` : `/api/couple/package-orders/${order.id}`, guestCheckout ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimToken: order.claimToken }),
    } : undefined);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not check the payment status.');
    const updatedOrder: PackageOrderView = { ...order, ...data };
    if (updatedOrder.status === 'successful') {
      if (guestCheckout) {
        onAuth('register');
        return;
      }
      setAccess((current) => current ? { ...current, activePackage: updatedOrder, pendingOrder: null } : current);
      if (completedOrder.current !== updatedOrder.id) {
        completedOrder.current = updatedOrder.id;
        onPaid(updatedOrder);
      }
    } else if (updatedOrder.status === 'failed') {
      if (guestCheckout) sessionStorage.removeItem(packageCheckoutClaimStorageKey);
      setAccess((current) => current ? { ...current, pendingOrder: null } : current);
      setTransferReference('');
      setError('The payment was not completed. Select a package to try again.');
    } else {
      setAccess((current) => current ? { ...current, pendingOrder: updatedOrder } : current);
    }
  }, [onAuth, onPaid, user]);

  useEffect(() => {
    const order = access?.pendingOrder as CheckoutOrder | null | undefined;
    if (!order || order.status !== 'pending') return;
    const interval = window.setInterval(() => {
      void checkPayment(order).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not check the payment status.'));
    }, order.paymentMethod === 'mtn_momo' ? 5000 : 15000);
    return () => window.clearInterval(interval);
  }, [access?.pendingOrder, checkPayment, user]);

  async function startPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(user ? '/api/couple/package-orders' : '/api/package-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageCode: selectedPackage, paymentMethod, ...(paymentMethod === 'mtn_momo' ? { phone } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start your payment.');
      const plan = packagePlans.find((item) => item.code === selectedPackage);
      if (!plan) throw new Error('The selected package is not available.');
      if (!user) {
        sessionStorage.setItem(packageCheckoutClaimStorageKey, JSON.stringify({
          orderId: data.orderId,
          claimToken: data.claimToken,
          code: plan.code,
          paymentMethod,
          ...(paymentMethod === 'mtn_momo' ? { phone } : {}),
        }));
      }
      setAccess((current) => current ? {
        ...current,
        pendingOrder: {
          id: data.orderId,
          code: plan.code,
          name: plan.name,
          priceRwf: plan.priceRwf,
          status: 'pending',
          paymentMethod,
          ...(!user ? { claimToken: data.claimToken } : {}),
          ...(paymentMethod === 'mtn_momo' ? { phone } : {}),
        },
      } : current);
      setCheckoutOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start your payment.');
    } finally { setBusy(false); }
  }

  async function submitTransferReference() {
    if (!pendingOrder) return;
    setBusy(true);
    setError('');
    try {
      const guestCheckout = !user && Boolean((pendingOrder as CheckoutOrder).claimToken);
      const response = await fetch(guestCheckout
        ? `/api/package-checkout/${pendingOrder.id}/reference`
        : `/api/couple/package-orders/${pendingOrder.id}/reference`, {
        method: guestCheckout ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: transferReference,
          ...(guestCheckout ? { claimToken: (pendingOrder as CheckoutOrder).claimToken } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit the bank transfer reference.');
      setAccess((current) => current?.pendingOrder
        ? { ...current, pendingOrder: { ...current.pendingOrder, payerReference: transferReference.trim() } }
        : current);
      if (guestCheckout) onAuth('register');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the bank transfer reference.');
    } finally { setBusy(false); }
  }

  const pendingOrder = access?.pendingOrder as CheckoutOrder | null | undefined;
  const bankTransfer = access?.paymentMethods.bankTransfer;
  return <section className="package-page">
    <header className="package-page-heading">
      <span className="eyebrow">PLANNING THAT FITS YOUR NEEDS</span>
      <h2>Choose a plan for your event</h2>
      <p>Packages are paid once. We begin your selected planning service after your payment has been confirmed.</p>
    </header>
    {access?.activePackage && <div className="package-active" role="status">
      <ShieldCheck size={18} />
      <span><b>{access.activePackage.name} active</b><small>Your package payment has been confirmed.</small></span>
    </div>}
    {pendingOrder && <div className="package-pending package-pending-summary" role="status"><LoaderCircle size={18} className={pendingOrder.paymentMethod === 'mtn_momo' ? 'package-spinner' : undefined} /><span><b>{pendingOrder.paymentMethod === 'bank_transfer' ? 'Bank transfer awaiting review' : 'Payment awaiting approval'}</b><small>{pendingOrder.paymentMethod === 'bank_transfer' ? 'Your package stays locked until our team verifies your transfer.' : `We’re checking the payment status for ${pendingOrder.name}.`}</small></span><button type="button" onClick={() => setCheckoutOpen(true)}>View payment</button></div>}
    <div className="package-cards">
      {packagePlans.map((plan, index) => <article className={`package-card ${plan.code === selectedPackage ? 'selected' : ''} ${plan.code === 'premium' ? 'featured' : ''}`} key={plan.code}>
        <div className="package-card-title"><span>{index === 2 ? <Crown size={18} /> : index === 1 ? <Sparkles size={18} /> : <Heart size={18} />}</span><h3>{plan.name}</h3></div>
        <p>{plan.description}</p>
        <strong className="package-price">{formatPrice(plan.priceRwf)}<small> one-time</small></strong>
        <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
        <button className="package-select" type="button" disabled={Boolean(pendingOrder || access?.activePackage)} aria-pressed={selectedPackage === plan.code} onClick={() => {
          setSelectedPackage(plan.code);
          sessionStorage.setItem(selectedPackageKey, plan.code);
          setError('');
          setCheckoutOpen(true);
        }}>
          {access?.activePackage?.code === plan.code ? 'Your active package' : `Choose ${plan.name}`}
        </button>
      </article>)}
    </div>
    {checkoutOpen && <div className="package-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingOrder) setCheckoutOpen(false); }}>
    <section className="package-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="package-checkout-title">
    <header className="package-checkout-modal-heading">
      <div><span className="eyebrow">SECURE CHECKOUT</span><h2 id="package-checkout-title">{packagePlans.find((item) => item.code === selectedPackage)?.name} · {formatPrice(packagePlans.find((item) => item.code === selectedPackage)?.priceRwf ?? 0)}</h2></div>
      <button className="package-modal-close" type="button" onClick={() => setCheckoutOpen(false)} aria-label="Close checkout"><X size={19} /></button>
    </header>
    <form className="package-checkout" onSubmit={(event) => void startPayment(event)}>
      <div className="package-checkout-copy">
        <h3>{user ? 'Choose how to pay' : 'Pay first, then set up your account'}</h3>
        <p>{user ? 'Bank transfers are verified by our team.' : 'Choose a package and pay. After payment, sign in or create an account to provide your event details.'}</p>
      </div>
      {!pendingOrder && !access?.activePackage && <fieldset className="package-methods">
        <legend>Payment method</legend>
        {access?.paymentMethods.mtnMomo && <label><input type="radio" name="payment-method" value="mtn_momo" checked={paymentMethod === 'mtn_momo'} onChange={() => setPaymentMethod('mtn_momo')} /> MTN Mobile Money</label>}
        {bankTransfer && <label><input type="radio" name="payment-method" value="bank_transfer" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} /> Bank transfer</label>}
        {!access?.paymentMethods.mtnMomo && !bankTransfer && <p className="package-error">Online payment is not available right now. Please contact the planning team.</p>}
      </fieldset>}
      {!pendingOrder && !access?.activePackage && paymentMethod === 'mtn_momo' && access?.paymentMethods.mtnMomo && <label>MTN Mobile Money number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0788 123 456" autoComplete="tel" required /></label>}
      {!access?.activePackage && bankTransfer && (paymentMethod === 'bank_transfer' || pendingOrder?.paymentMethod === 'bank_transfer') && <div className="package-bank-details">
        <b>Bank transfer details</b>
        <span>{bankTransfer.bankName}{bankTransfer.branch ? ` · ${bankTransfer.branch}` : ''}</span>
        <span>Account name: {bankTransfer.accountName}</span>
        <span>Account number: {bankTransfer.accountNumber}</span>
        <small>Use the selected package and amount as your transfer description.</small>
      </div>}
      {access?.activePackage && !pendingOrder && <p className="package-active-note">Your package is already active. Contact the planning team if you need to change packages.</p>}
      {pendingOrder && <div className="package-pending" role="status"><LoaderCircle size={18} className={pendingOrder.paymentMethod === 'mtn_momo' ? 'package-spinner' : undefined} /><span><b>{pendingOrder.paymentMethod === 'bank_transfer' ? 'Bank transfer awaiting review' : 'Payment awaiting approval'}</b><small>{pendingOrder.paymentMethod === 'bank_transfer' ? pendingOrder.payerReference ? 'Your reference was submitted. We will activate your package after verifying the transfer.' : `Transfer ${formatPrice(pendingOrder.priceRwf)} to the account above, then submit your bank reference.` : `Approve ${formatPrice(pendingOrder.priceRwf)} on ${pendingOrder.phone || 'your MTN phone'}. We’re checking the payment status.`}</small></span></div>}
      {pendingOrder?.paymentMethod === 'bank_transfer' && !pendingOrder.payerReference && <div className="package-reference-form">
        <label>Bank transfer reference<input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} placeholder="Enter the reference from your bank receipt" minLength={3} maxLength={120} required /></label>
        <button className="package-pay" type="button" onClick={() => void submitTransferReference()} disabled={busy || transferReference.trim().length < 3}>{busy ? 'Submitting…' : 'Submit transfer reference'}</button>
      </div>}
      {error && <p className="package-error" role="alert">{error}</p>}
      {pendingOrder && <button type="button" className="package-refresh" disabled={busy} onClick={() => { setBusy(true); void checkPayment(pendingOrder).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not check the payment status.')).finally(() => setBusy(false)); }}>{busy ? 'Checking…' : 'Check payment status'}</button>}
      {!pendingOrder && !access?.activePackage && <button type="submit" className="package-pay" disabled={busy || (paymentMethod === 'mtn_momo' ? !access?.paymentMethods.mtnMomo : !bankTransfer)}>{busy ? <><LoaderCircle size={16} className="package-spinner" /> Starting payment…</> : `Continue with ${formatPrice(packagePlans.find((item) => item.code === selectedPackage)?.priceRwf ?? 0)}`}</button>}
      <small className="package-checkout-note">After your payment is confirmed, you’ll create an account to access your event plan. Bank transfers are activated after our team verifies them. Never share your online banking password or PIN.</small>
    </form>
    </section>
    </div>}
  </section>;
}
