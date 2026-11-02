import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, RefreshCw, X } from 'lucide-react';

type ManualPaymentOrder = {
  id: number;
  code: string;
  name: string;
  priceRwf: number;
  paymentStage: 'deposit' | 'balance';
  paymentMethod: 'mtn_momo' | 'bank_transfer';
  phone: string | null;
  payerReference: string | null;
  createdAt: string;
  coupleName: string;
  coupleEmail: string;
};

const formatPrice = (amount: number) => `${amount.toLocaleString()} RWF`;

export default function PackagePaymentsPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [orders, setOrders] = useState<ManualPaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/package-orders');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load payment submissions.');
      setOrders(data.orders);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load payment submissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  async function reviewOrder(order: ManualPaymentOrder, status: 'successful' | 'failed') {
    setBusyOrder(order.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/package-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update this package payment.');
      setOrders((current) => current.filter((item) => item.id !== order.id));
      onNotify(status === 'successful' ? `${order.name} payment confirmed for ${order.coupleName}.` : `Payment rejected for ${order.coupleName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this package payment.');
    } finally {
      setBusyOrder(null);
    }
  }

  return <section className="package-payment-review">
    <div className="package-payment-review-heading">
      <p>Orders appear here when checkout starts. Verify that payment has arrived in your MoMo or bank account before confirming it; the transaction reference is optional.</p>
      <button type="button" className="package-refresh" onClick={() => void loadOrders()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </div>
    {error && <p className="package-error" role="alert">{error}</p>}
    {loading ? <div className="package-payment-empty"><LoaderCircle size={18} className="package-spinner" /> Loading transfers…</div>
      : orders.length === 0 ? <div className="package-payment-empty">There are no payments awaiting review.</div>
        : <div className="package-payment-list">{orders.map((order) => <article className="package-payment-order" key={order.id}>
          <div className="package-payment-order-header">
            <div><h3>{order.name} · {order.paymentMethod === 'mtn_momo' ? 'MTN MoMo' : 'Bank transfer'} · {order.paymentStage === 'deposit' ? '50% deposit' : 'remaining balance'}</h3><span>{formatPrice(order.priceRwf)}</span></div>
            <small>{new Date(order.createdAt).toLocaleString()}</small>
          </div>
          <dl>
            <div><dt>Client</dt><dd>{order.coupleName} · {order.coupleEmail}</dd></div>
            {order.phone && <div><dt>Customer phone</dt><dd>{order.phone}</dd></div>}
            <div><dt>Payment reference</dt><dd>{order.payerReference || <span className="package-reference-missing">Not provided (optional)</span>}</dd></div>
          </dl>
          <div className="package-payment-actions">
            <button type="button" className="package-payment-confirm" disabled={busyOrder !== null} onClick={() => void reviewOrder(order, 'successful')}>
              {busyOrder === order.id ? <LoaderCircle size={15} className="package-spinner" /> : <Check size={15} />} Confirm payment
            </button>
            <button type="button" className="package-payment-reject" disabled={busyOrder !== null} onClick={() => void reviewOrder(order, 'failed')}>
              {busyOrder === order.id ? <LoaderCircle size={15} className="package-spinner" /> : <X size={15} />} Reject
            </button>
          </div>
        </article>)}</div>}
  </section>;
}
