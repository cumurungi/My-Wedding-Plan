import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Crown, Heart, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { packageCheckoutClaimStorageKey, packagePlans, type CouplePackageView, type EventType, type PackageCode, type PackageOrderView } from '../shared/package-plans';
import type { User } from './wedding';
import { useLanguage } from './i18n';

const formatPrice = (amount: number) => `${amount.toLocaleString()} RWF`;
const depositPrice = (amount: number) => Math.ceil(amount / 2);
const selectedPackageKey = 'my-wedding-plan-selected-package';
type CheckoutOrder = PackageOrderView & { claimToken?: string };
function getInitialPackage(): PackageCode {
  const saved = sessionStorage.getItem(selectedPackageKey);
  return packagePlans.find((plan) => plan.code === saved)?.code ?? 'basic';
}

export default function PackagePlansPage({ user, eventType, onAuth, onPaid }: {
  user: User | null;
  eventType?: EventType | null;
  onAuth: (mode: 'login' | 'register') => void;
  onPaid: (activePackage: PackageOrderView) => void;
}) {
  const { t } = useLanguage();
  const [access, setAccess] = useState<CouplePackageView | null>(null);
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mtn_momo' | 'bank_transfer'>('mtn_momo');
  const [transferReference, setTransferReference] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<PackageCode>(getInitialPackage);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completedOrder = useRef<number | null>(null);
  const eligiblePlans = useMemo(() => !access?.activePackage && eventType
    ? packagePlans.filter((plan) => eventType === 'wedding' ? plan.code !== 'event_short' : plan.code === 'event_short')
    : packagePlans, [access?.activePackage, eventType]);

  useEffect(() => {
    if (access?.pendingOrder || !eligiblePlans.length) return;
    if (!eligiblePlans.some((plan) => plan.code === selectedPackage)) setSelectedPackage(eligiblePlans[0].code);
  }, [access?.pendingOrder, eligiblePlans, selectedPackage]);

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
        setAccess((current) => current ? { ...current, pendingOrder: updatedOrder } : current);
        return;
      }
      const packageResponse = await fetch('/api/couple/package');
      const packageData = await packageResponse.json();
      if (!packageResponse.ok) throw new Error(packageData.error || 'Could not refresh your package balance.');
      setAccess(packageData);
      if (updatedOrder.paymentStage !== 'balance' && completedOrder.current !== updatedOrder.id) {
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
    }, 15000);
    return () => window.clearInterval(interval);
  }, [access?.pendingOrder, checkPayment, user]);

  async function startPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      onAuth('register');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const plan = packagePlans.find((item) => item.code === selectedPackage);
      if (!plan) throw new Error('The selected package is not available.');
      const paymentStage = user && access?.activePackage ? 'balance' : 'deposit';
      const amountRwf = paymentStage === 'balance' ? access?.activePackage?.balanceRwf ?? 0 : depositPrice(plan.priceRwf);
      const response = await fetch(user ? '/api/couple/package-orders' : '/api/package-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageCode: selectedPackage, paymentMethod, paymentStage, ...(paymentMethod === 'mtn_momo' ? { phone } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start your payment.');
      if (!user) {
        sessionStorage.setItem(packageCheckoutClaimStorageKey, JSON.stringify({
          orderId: data.orderId,
          claimToken: data.claimToken,
          code: plan.code,
          paymentMethod,
          paymentStage,
          ...(paymentMethod === 'mtn_momo' ? { phone } : {}),
        }));
      }
      setAccess((current) => current ? {
        ...current,
        pendingOrder: {
          id: data.orderId,
          code: plan.code,
          name: plan.name,
          priceRwf: data.amountRwf ?? amountRwf,
          status: 'pending',
          paymentStage,
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the payment reference.');
    } finally { setBusy(false); }
  }

  const pendingOrder = access?.pendingOrder as CheckoutOrder | null | undefined;
  const bankTransfer = access?.paymentMethods.bankTransfer;
  const momoDetails = access?.paymentMethods.mtnMomo;
  return <section className="package-page">
    <header className="package-page-heading">
      <span className="eyebrow">{t('PLANNING THAT FITS YOUR NEEDS')}</span>
      <h2>{t('Choose a plan for your event')}</h2>
      <p>{t('Pay a 50% deposit to begin. The balance is due after your initial plan is ready for review.')}</p>
    </header>
    {access?.activePackage && <div className="package-active" role="status">
      <ShieldCheck size={18} />
      <span><b>{t(access.activePackage.name)} · {t('active')}</b><small>{t('{paid} paid of {total} total.', { paid: formatPrice(access.activePackage.paidRwf), total: formatPrice(access.activePackage.priceRwf) })}</small></span>
    </div>}
    {access?.activePackage && access.activePackage.balanceRwf > 0 && <div className="package-active package-balance-due">
      <span><b>{t('Remaining balance: {amount}', { amount: formatPrice(access.activePackage.balanceRwf) })}</b><small>{t(access.activePackage.balanceAvailable ? 'Your initial plan is ready. Review it, then pay the remaining 50% to complete your package.' : 'The remaining 50% is due after your initial plan is ready for review.')}</small></span>
      {access.activePackage.balanceAvailable && !pendingOrder && <button className="package-select" type="button" onClick={() => setCheckoutOpen(true)}>{t('Pay remaining balance')}</button>}
    </div>}
    {pendingOrder && <div className="package-pending package-pending-summary" role="status"><LoaderCircle size={18} /><span><b>{t(pendingOrder.status === 'successful' ? '50% deposit confirmed' : pendingOrder.paymentMethod === 'bank_transfer' ? 'Bank transfer awaiting review' : 'MTN MoMo awaiting review')}</b><small>{t(pendingOrder.status === 'successful' ? 'Your payment is confirmed. Your details are with our planning team.' : pendingOrder.payerReference ? 'Your payment reference was submitted. Our team will verify the payment.' : 'Your payment request is with our team. Complete the transfer; the reference is optional.')}</small></span>{pendingOrder.status === 'successful' && !user ? <button type="button" onClick={() => onAuth('register')}>{t('Create account')}</button> : <button type="button" onClick={() => setCheckoutOpen(true)}>{t('View payment')}</button>}</div>}
    <div className="package-cards">
      {eligiblePlans.map((plan, index) => <article className={`package-card ${plan.code === selectedPackage ? 'selected' : ''} ${plan.code === 'premium' ? 'featured' : ''}`} key={plan.code}>
        <div className="package-card-title"><span>{index === 2 ? <Crown size={18} /> : index === 1 ? <Sparkles size={18} /> : <Heart size={18} />}</span><h3>{t(plan.name)}</h3></div>
        <p>{t(plan.description)}</p>
        <strong className="package-price">{formatPrice(plan.priceRwf)}<small> {t('total · 50% deposit to start')}</small></strong>
        <ul>{plan.features.map((feature) => <li key={feature}><Check size={15} />{t(feature)}</li>)}</ul>
        <button className="package-select" type="button" disabled={Boolean(pendingOrder || access?.activePackage)} aria-pressed={selectedPackage === plan.code} onClick={() => {
          setSelectedPackage(plan.code);
          sessionStorage.setItem(selectedPackageKey, plan.code);
          setError('');
          setCheckoutOpen(true);
        }}>
          {access?.activePackage?.code === plan.code ? t('Your active package') : t('Choose {name}', { name: t(plan.name) })}
        </button>
      </article>)}
    </div>
    {checkoutOpen && <div className="package-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingOrder) setCheckoutOpen(false); }}>
    <section className="package-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="package-checkout-title">
    <header className="package-checkout-modal-heading">
      <div><span className="eyebrow">{t('SECURE CHECKOUT')}</span><h2 id="package-checkout-title">{t(packagePlans.find((item) => item.code === selectedPackage)?.name ?? '')} · {formatPrice(packagePlans.find((item) => item.code === selectedPackage)?.priceRwf ?? 0)}</h2></div>
      <button className="package-modal-close" type="button" onClick={() => setCheckoutOpen(false)} aria-label={t('Close checkout')}><X size={19} /></button>
    </header>
    <form className="package-checkout" onSubmit={(event) => void startPayment(event)}>
      <div className="package-checkout-copy">
        <h3>{t(pendingOrder?.status === 'successful' ? 'Your deposit is confirmed' : access?.activePackage ? 'Pay the remaining balance' : 'Pay a 50% deposit to begin')}</h3>
        <p>{t(pendingOrder?.status === 'successful' ? 'Your package is ready. Create an account to add your event details and access your planning workspace.' : access?.activePackage ? 'The remaining balance is due after your initial plan is ready for review.' : 'Pay half now to begin planning. The remaining half is due after your initial plan is ready for review.')}</p>
      </div>
      {!pendingOrder && (!access?.activePackage || access.activePackage.balanceAvailable) && <fieldset className="package-methods">
        <legend>{t('Payment method')}</legend>
        {access?.paymentMethods.mtnMomo && <label><input type="radio" name="payment-method" value="mtn_momo" checked={paymentMethod === 'mtn_momo'} onChange={() => setPaymentMethod('mtn_momo')} /> {t('MTN Mobile Money')}</label>}
        {bankTransfer && <label><input type="radio" name="payment-method" value="bank_transfer" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} /> {t('Bank transfer')}</label>}
        {!access?.paymentMethods.mtnMomo && !bankTransfer && <p className="package-error">{t('Online payment is not available right now. Please contact the planning team.')}</p>}
      </fieldset>}
      {!pendingOrder && (!access?.activePackage || access.activePackage.balanceAvailable) && paymentMethod === 'mtn_momo' && momoDetails && <label>{t('Your MTN Mobile Money number')}<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="0788 123 456" autoComplete="tel" required /></label>}
      {momoDetails && (paymentMethod === 'mtn_momo' || pendingOrder?.paymentMethod === 'mtn_momo') && <div className="package-bank-details">
        <b>{t('MTN MoMo payment details')}</b>
        <span>{t('Account name: {name}', { name: momoDetails.accountName })}</span>
        <span>{t('Send to this MTN MoMo number')}: {momoDetails.phone}</span>
        <small>{t(pendingOrder ? 'Complete the payment. Your team will verify receipt; the reference is optional.' : 'Transfer {amount} using the details above. You can provide a transaction reference after paying.', { amount: formatPrice(pendingOrder?.priceRwf ?? (access?.activePackage ? access.activePackage.balanceRwf : depositPrice(packagePlans.find((item) => item.code === selectedPackage)?.priceRwf ?? 0))) })}</small>
      </div>}
      {bankTransfer && (paymentMethod === 'bank_transfer' || pendingOrder?.paymentMethod === 'bank_transfer') && <div className="package-bank-details">
        <b>{t('Bank transfer details')}</b>
        <span>{bankTransfer.bankName}{bankTransfer.branch ? ` · ${bankTransfer.branch}` : ''}</span>
        <span>{t('Account name: {name}', { name: bankTransfer.accountName })}</span>
        <span>{t('Account number: {number}', { number: bankTransfer.accountNumber })}</span>
        <small>{t(pendingOrder ? 'Complete the payment. Your team will verify receipt; the reference is optional.' : 'Use the selected package and amount as your transfer description.')}</small>
      </div>}
      {pendingOrder?.status === 'successful' && !user && <div className="package-active-note"><b>{t('Deposit confirmed.')}</b> {t('Create your account to continue.')}<button className="package-pay" type="button" onClick={() => onAuth('register')}>{t('Create account')}</button></div>}
      {pendingOrder && pendingOrder.status !== 'successful' && <div className="package-pending" role="status"><LoaderCircle size={18} /><span><b>{t(pendingOrder.paymentMethod === 'bank_transfer' ? 'Bank transfer awaiting review' : 'MTN MoMo awaiting review')}</b><small>{t(pendingOrder.payerReference ? 'Your payment reference was submitted. Our team will verify the payment.' : 'Your payment request is with our team. Complete the transfer; the reference is optional.')}</small></span></div>}
      {pendingOrder && pendingOrder.status === 'pending' && !pendingOrder.payerReference && <div className="package-reference-form">
        <label>{t('Payment reference (optional)')}<input value={transferReference} onChange={(event) => setTransferReference(event.target.value)} placeholder={t('Enter reference from your MoMo or bank confirmation')} maxLength={120} /></label>
        {transferReference.trim() && <button className="package-pay" type="button" onClick={() => void submitTransferReference()} disabled={busy}>{busy ? t('Submitting…') : t('Submit payment reference')}</button>}
      </div>}
      {error && <p className="package-error" role="alert">{error}</p>}
      {pendingOrder && <button type="button" className="package-refresh" disabled={busy} onClick={() => { setBusy(true); void checkPayment(pendingOrder).catch((cause) => setError(cause instanceof Error ? cause.message : t('Could not check the payment status.'))).finally(() => setBusy(false)); }}>{busy ? t('Checking…') : t('Check payment status')}</button>}
      {!pendingOrder && (!access?.activePackage || access.activePackage.balanceAvailable) && <button type="submit" className="package-pay" disabled={busy || (paymentMethod === 'mtn_momo' ? !access?.paymentMethods.mtnMomo : !bankTransfer)}>{busy ? <><LoaderCircle size={16} className="package-spinner" /> {t('Starting payment…')}</> : t('Pay {amount}', { amount: formatPrice(access?.activePackage ? access.activePackage.balanceRwf : depositPrice(packagePlans.find((item) => item.code === selectedPackage)?.priceRwf ?? 0)) })}</button>}
      <small className="package-checkout-note">{t('Your package activates after our team verifies the payment. Never share your MoMo PIN or online banking password.')}</small>
    </form>
    </section>
    </div>}
  </section>;
}
