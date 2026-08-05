// pos_modules/orders/OrderDetailsPanel.tsx
// Side panel for viewing/editing order details

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  AlertTriangle,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  Flame,
  CreditCard,
  CheckCircle2,
  Timer,
  Play,
  XCircle,
  Printer,
  Plus,
  DollarSign,
  MessageSquare,
  UtensilsCrossed,
  Package,
  Truck,
  Car,
  ChevronRight,
  ChevronDown,
  FileText,
} from 'lucide-react';
import {
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  ORDER_MODE_LABELS,
  ORDER_MODE_COLORS,
  PAYMENT_METHOD_LABELS,
  ItemStatus,
} from '@/types/order.types';
import { formatDateTime, formatTime, getModeIcon } from './helpers';
import {
  getNextStatusAction,
  getStatusTrail,
  getTrailPosition,
  type StatusActionColor,
} from './statusLadder';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface OrderDetailsPanelProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (orderId: string, action: string, data?: Record<string, unknown>) => void;
  onAddPayment: (orderId: string, payment: { method: PaymentMethod; amount: number }) => void;
}

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'online', 'other'];

// Static gradient class map (dynamic class names don't work with Tailwind JIT)
const ACTION_BUTTON_STYLES: Record<StatusActionColor, string> = {
  blue: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500',
  amber: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500',
  green: 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500',
  cyan: 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500',
  purple: 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500',
  emerald: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OrderDetailsPanel({
  order,
  isOpen,
  onClose,
  onStatusChange,
  onAddPayment,
}: OrderDetailsPanelProps) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  // Cancelling is the only irreversible action on this panel and it used to
  // fire on one tap of an unlabelled X (Phase 16 §1.3).
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Never leave a primed "Yes, Cancel Order" waiting on the next order that
  // opens in this panel. Reset during render rather than in an effect — the
  // panel must not paint one frame with the previous order's confirmation up.
  const panelKey = `${order?._id ?? ''}:${isOpen}`;
  const [lastPanelKey, setLastPanelKey] = useState(panelKey);
  if (panelKey !== lastPanelKey) {
    setLastPanelKey(panelKey);
    setConfirmCancel(false);
    setShowPrintMenu(false);
  }

  if (!order) return null;

  const statusColor = ORDER_STATUS_COLORS[order.status];
  const paymentColor = PAYMENT_STATUS_COLORS[order.paymentStatus];
  const modeColor = ORDER_MODE_COLORS[order.mode];

  const handlePayment = () => {
    const amount = parseFloat(paymentAmount);
    if (!isNaN(amount) && amount > 0) {
      onAddPayment(order._id, { method: paymentMethod, amount });
      setPaymentAmount('');
      setShowPaymentForm(false);
    }
  };

  // ── Print Helpers ──
  const printThermalContent = (content: string) => {
    const html = `<!DOCTYPE html><html><head><style>
      @page { margin: 0; size: 80mm auto; }
      @media print { html, body { width: 80mm; margin: 0; padding: 0; } }
      body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.3; margin: 0; padding: 8px; width: 80mm; }
      .center { text-align: center; } .bold { font-weight: bold; } .large { font-size: 16px; } .small { font-size: 10px; }
      .divider { border-top: 1px dashed #000; margin: 8px 0; }
      .item-row { display: flex; justify-content: space-between; } .item-name { flex: 1; } .item-qty { width: 30px; text-align: center; }
      .item-price { width: 60px; text-align: right; } .modifier { padding-left: 30px; font-size: 10px; color: #333; }
      table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; } .right { text-align: right; }
    </style></head><body>${content}<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);};</script></body></html>`;

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) { doc.open(); doc.write(html); doc.close(); iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }
  };

  const handlePrintKOT = (o: Order) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    const tableInfo = o.table?.tableNumber ? `Table: ${o.table.tableNumber}` : ORDER_MODE_LABELS[o.mode];

    let items = '';
    for (const item of o.items) {
      items += `<div class="item-row"><span class="item-qty bold">${item.quantity}x</span><span class="item-name">${item.name}</span></div>`;
      if (item.modifiers?.length) {
        for (const mod of item.modifiers) {
          items += `<div class="modifier">+ ${mod.name}</div>`;
        }
      }
      if (item.specialInstructions) {
        items += `<div class="modifier" style="color:#c00;">! ${item.specialInstructions}</div>`;
      }
    }

    printThermalContent(`
      <div class="center bold large">KITCHEN ORDER</div>
      <div class="center">KOT #${String(o.orderNumber).split('-').pop()}</div>
      <div class="divider"></div>
      <div><strong>${tableInfo}</strong></div>
      <div>Mode: ${ORDER_MODE_LABELS[o.mode]}</div>
      <div>Time: ${time} | ${date}</div>
      ${o.table?.guestCount ? `<div>Guests: ${o.table.guestCount}</div>` : ''}
      <div class="divider"></div>
      <div class="bold">ITEMS:</div>
      ${items}
      ${o.kitchenNotes ? `<div class="divider"></div><div class="small bold">Notes: ${o.kitchenNotes}</div>` : ''}
      <div class="divider"></div>
      <div class="center small">*** Kitchen Copy ***</div><br>
    `);
  };

  const handlePrintInvoice = (o: Order) => {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const tableInfo = o.table?.tableNumber ? `Table: ${o.table.tableNumber}` : ORDER_MODE_LABELS[o.mode];

    let itemRows = '';
    for (const item of o.items) {
      itemRows += `<tr><td>${item.name}</td><td class="right">${item.quantity}</td><td class="right">${item.unitPrice.toFixed(2)}</td><td class="right">${item.subtotal.toFixed(2)}</td></tr>`;
    }

    // One line per payment, with the tenant's own method name — an order paid
    // across two methods must not print as though one method paid all of it.
    const payments = o.transactions ?? [];
    const paidRows = payments
      .map(
        (t) =>
          `<div class="item-row small"><span>${t.methodLabel || PAYMENT_METHOD_LABELS[t.method]}</span><span>Rs. ${t.amount.toFixed(2)}</span></div>`,
      )
      .join('');

    printThermalContent(`
      <div class="center bold large">RESTAURANT</div>
      <div class="center small">Address Line • Tel: +91-XXXXXXXXXX</div>
      <div class="center small">GSTIN: XXXXXXXXXXXX</div>
      <div class="divider"></div>
      <div class="center bold">TAX INVOICE</div>
      <div class="center small">#${o.orderNumber}</div>
      <div class="divider"></div>
      <div>${tableInfo}</div>
      ${o.customer?.name ? `<div>Customer: ${o.customer.name}</div>` : ''}
      <div>Date: ${date} | ${time}</div>
      <div class="divider"></div>
      <table>
        <tr class="bold"><td>Item</td><td class="right">Qty</td><td class="right">Rate</td><td class="right">Amt</td></tr>
        ${itemRows}
      </table>
      <div class="divider"></div>
      <div class="item-row"><span>Subtotal:</span><span>Rs. ${o.subtotal.toFixed(2)}</span></div>
      ${o.taxAmount > 0 ? `<div class="item-row"><span>Tax (${o.taxRate || 0}%):</span><span>Rs. ${o.taxAmount.toFixed(2)}</span></div>` : ''}
      ${o.discountAmount > 0 ? `<div class="item-row"><span>Discount:</span><span>-Rs. ${o.discountAmount.toFixed(2)}</span></div>` : ''}
      ${o.serviceCharge ? `<div class="item-row"><span>Service Charge:</span><span>Rs. ${o.serviceCharge.toFixed(2)}</span></div>` : ''}
      <div class="divider"></div>
      <div class="item-row bold large"><span>TOTAL:</span><span>Rs. ${o.grandTotal.toFixed(2)}</span></div>
      <div class="divider"></div>
      ${payments.length > 0
        ? `<div class="small bold">Paid</div>${paidRows}${
            payments.length > 1
              ? `<div class="item-row small bold"><span>Total Paid</span><span>Rs. ${o.amountPaid.toFixed(2)}</span></div>`
              : ''
          }`
        : '<div class="small">Payment: —</div>'}
      ${o.amountDue > 0 ? `<div class="item-row small bold"><span>Left to Pay</span><span>Rs. ${o.amountDue.toFixed(2)}</span></div>` : ''}
      <div class="divider"></div>
      <div class="center small">Thank you for dining with us!</div>
      <div class="center small">Please visit again</div>
      <br><br>
    `);
  };

  // This panel is a management view, so it gets the full ladder including
  // Close Order. The kitchen board deliberately does not — see statusLadder.ts.
  const currentAction = getNextStatusAction(order.status, order.mode, 'hub');
  const CurrentActionIcon = currentAction?.icon;

  const trail = getStatusTrail(order.mode);
  const trailPosition = getTrailPosition(order.status, trail);
  const isCancelled = order.status === 'cancelled';
  const canCancel = !['completed', 'cancelled'].includes(order.status);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-gray-900 border-l border-white/10 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span className={`
                  p-2 rounded-lg
                  ${modeColor.bg} ${modeColor.text}
                `}>
                  {getModeIcon(order.mode)}
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Order #{String(order.orderNumber).split('-').pop()}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {order.isPriority && (
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <Flame size={18} className="text-red-400" />
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ── Status strip ────────────────────────────────────────────
                Where the order is, stated. It sits outside the scroll area so
                it is always on screen, and it is deliberately separate from the
                actions block at the bottom: this panel used to make the reader
                work out the status from which buttons were present. */}
            <div className="shrink-0 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                  ${statusColor.bg} ${statusColor.text}
                `}>
                  {order.status === 'preparing' && <Timer size={14} className="animate-pulse" />}
                  {order.status === 'ready' && <CheckCircle2 size={14} />}
                  {ORDER_STATUS_LABELS[order.status]}
                </span>

                <span className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                  ${paymentColor.bg} ${paymentColor.text}
                `}>
                  <CreditCard size={14} />
                  {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                </span>

                <span className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                  ${modeColor.bg} ${modeColor.text}
                `}>
                  {getModeIcon(order.mode, 14)}
                  {ORDER_MODE_LABELS[order.mode]}
                </span>
              </div>

              {/* The rungs this order passes through, with the current one
                  marked. Labels, not colour alone — rule 0.2 / Part 4. */}
              {isCancelled ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
                  <XCircle size={15} />
                  This order was cancelled.
                </div>
              ) : (
                <ol className="mt-3 flex items-center gap-1">
                  {trail.map((step, idx) => {
                    const done = trailPosition >= 0 && idx < trailPosition;
                    const current = idx === trailPosition;
                    return (
                      <li key={step.status} className="flex-1 min-w-0">
                        <div className={`
                          h-1 rounded-full mb-1.5
                          ${done ? 'bg-cyan-500/60' : current ? 'bg-cyan-400' : 'bg-white/10'}
                        `} />
                        <div className={`
                          text-[11px] leading-tight truncate
                          ${current ? 'text-cyan-300 font-semibold' : done ? 'text-gray-400' : 'text-gray-600'}
                        `}>
                          {step.label}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Customer/Table Info */}
              {(order.table || order.customer) && (
                <div className="px-6 py-4 border-b border-white/5">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">
                    {order.table ? 'Table Information' : 'Customer Information'}
                  </h3>

                  {order.table && (
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                        <UtensilsCrossed size={18} className="text-cyan-400" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          Table {order.table.tableNumber}
                        </div>
                        {order.table.sectionName && (
                          <div className="text-sm text-gray-400">
                            {order.table.sectionName}
                            {order.table.guestCount && ` • ${order.table.guestCount} guests`}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {order.customer && (
                    <div className="space-y-2">
                      {order.customer.name && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <User size={16} className="text-gray-500" />
                          {order.customer.name}
                        </div>
                      )}
                      {order.customer.phone && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <Phone size={16} className="text-gray-500" />
                          {order.customer.phone}
                        </div>
                      )}
                      {order.customer.email && (
                        <div className="flex items-center gap-2 text-gray-300">
                          <Mail size={16} className="text-gray-500" />
                          {order.customer.email}
                        </div>
                      )}
                      {order.customer.address && (
                        <div className="flex items-start gap-2 text-gray-300">
                          <MapPin size={16} className="text-gray-500 mt-0.5" />
                          <div>
                            <div>{order.customer.address.line1}</div>
                            {order.customer.address.line2 && <div>{order.customer.address.line2}</div>}
                            <div>{order.customer.address.city}, {order.customer.address.postalCode}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Items */}
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="text-sm font-medium text-gray-400 mb-3">
                  Order Items ({order.items.length})
                </h3>

                <div className="space-y-3">
                  {order.items.map((item, idx) => {
                    const itemStatusColors: Record<ItemStatus, string> = {
                      pending: 'bg-gray-500',
                      preparing: 'bg-amber-500 animate-pulse',
                      ready: 'bg-green-500',
                      served: 'bg-cyan-500',
                      cancelled: 'bg-red-500',
                    };

                    return (
                      <div
                        key={item._id || idx}
                        className="flex items-start gap-3 p-3 rounded-lg bg-white/5"
                      >
                        <div className={`
                          w-2 h-2 rounded-full mt-2
                          ${itemStatusColors[item.status]}
                        `} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-gray-400 mr-1">{item.quantity}x</span>
                              <span className="font-medium text-white">{item.name}</span>
                            </div>
                            <span className="text-gray-300 font-medium">
                              {item.subtotal.toFixed(2)}
                            </span>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {item.modifiers.map(m => m.name).join(', ')}
                            </div>
                          )}
                          {item.specialInstructions && (
                            <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                              <MessageSquare size={12} />
                              {item.specialInstructions}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Payment Summary</h3>

                <div className="space-y-2">
                  <div className="flex justify-between text-gray-300">
                    <span>Subtotal</span>
                    <span>{order.subtotal.toFixed(2)}</span>
                  </div>
                  {order.discountAmount > 0 && (
                    <div className="flex justify-between text-green-400">
                      <span>Discount</span>
                      <span>-{order.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {order.taxAmount > 0 && (
                    <div className="flex justify-between text-gray-300">
                      <span>Tax ({order.taxRate}%)</span>
                      <span>{order.taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {order.serviceCharge && order.serviceCharge > 0 && (
                    <div className="flex justify-between text-gray-300">
                      <span>Service Charge</span>
                      <span>{order.serviceCharge.toFixed(2)}</span>
                    </div>
                  )}
                  {order.deliveryFee && order.deliveryFee > 0 && (
                    <div className="flex justify-between text-gray-300">
                      <span>Delivery Fee</span>
                      <span>{order.deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  {order.tipAmount && order.tipAmount > 0 && (
                    <div className="flex justify-between text-gray-300">
                      <span>Tip</span>
                      <span>{order.tipAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-white">
                    <span>Total</span>
                    <span>{order.grandTotal.toFixed(2)}</span>
                  </div>
                  {order.amountPaid > 0 && (
                    <>
                      <div className="flex justify-between text-green-400">
                        <span>Paid</span>
                        <span>{order.amountPaid.toFixed(2)}</span>
                      </div>
                      {order.amountDue > 0 && (
                        <div className="flex justify-between text-amber-400 font-medium">
                          <span>Due</span>
                          <span>{order.amountDue.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Payment Transactions */}
                {order.transactions && order.transactions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <h4 className="text-xs font-medium text-gray-500 mb-2">Transactions</h4>
                    <div className="space-y-2">
                      {order.transactions.map((tx, idx) => (
                        <div key={tx._id || idx} className="flex justify-between text-sm text-gray-400">
                          <span>
                            {PAYMENT_METHOD_LABELS[tx.method]}
                            {tx.paidBy && ` (${tx.paidBy})`}
                          </span>
                          <span>{tx.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Payment */}
                {order.amountDue > 0 && !showPaymentForm && (
                  <button
                    onClick={() => {
                      setPaymentAmount(order.amountDue.toFixed(2));
                      setShowPaymentForm(true);
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 font-medium hover:bg-green-500/30 transition-colors"
                  >
                    <Plus size={16} />
                    Add Payment
                  </button>
                )}

                {/* Payment Form */}
                <AnimatePresence>
                  {showPaymentForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 p-3 rounded-lg bg-white/5"
                    >
                      <div className="flex gap-2 mb-3">
                        {PAYMENT_METHODS.map((method) => (
                          <button
                            key={method}
                            onClick={() => setPaymentMethod(method)}
                            className={`
                              flex-1 px-3 py-2 rounded-lg text-sm font-medium
                              transition-colors
                              ${paymentMethod === method
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                              }
                            `}
                          >
                            {PAYMENT_METHOD_LABELS[method]}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="number"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-green-500/50"
                            placeholder="Amount"
                          />
                        </div>
                        <button
                          onClick={handlePayment}
                          className="px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-400 transition-colors"
                        >
                          Pay
                        </button>
                        <button
                          onClick={() => setShowPaymentForm(false)}
                          className="px-3 py-2 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Notes */}
              {(order.kitchenNotes || order.internalNotes) && (
                <div className="px-6 py-4 border-b border-white/5">
                  <h3 className="text-sm font-medium text-gray-400 mb-3">Notes</h3>
                  
                  {order.kitchenNotes && (
                    <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="text-xs font-medium text-amber-400 mb-1">Kitchen Notes</div>
                      <div className="text-sm text-gray-300">{order.kitchenNotes}</div>
                    </div>
                  )}
                  
                  {order.internalNotes && (
                    <div className="p-3 rounded-lg bg-white/5">
                      <div className="text-xs font-medium text-gray-500 mb-1">Internal Notes</div>
                      <div className="text-sm text-gray-300">{order.internalNotes}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Timeline */}
              <div className="px-6 py-4">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Timeline</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <Plus size={14} className="text-blue-400" />
                    </div>
                    <div>
                      <div className="text-gray-300">Created</div>
                      <div className="text-xs text-gray-500">{formatDateTime(order.createdAt)}</div>
                    </div>
                  </div>
                  
                  {order.confirmedAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <CheckCircle2 size={14} className="text-green-400" />
                      </div>
                      <div>
                        <div className="text-gray-300">Confirmed</div>
                        <div className="text-xs text-gray-500">{formatDateTime(order.confirmedAt)}</div>
                      </div>
                    </div>
                  )}
                  
                  {order.prepStartedAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Play size={14} className="text-amber-400" />
                      </div>
                      <div>
                        <div className="text-gray-300">Preparation Started</div>
                        <div className="text-xs text-gray-500">{formatDateTime(order.prepStartedAt)}</div>
                      </div>
                    </div>
                  )}
                  
                  {order.readyAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                        <CheckCircle2 size={14} className="text-cyan-400" />
                      </div>
                      <div>
                        <div className="text-gray-300">Ready</div>
                        <div className="text-xs text-gray-500">{formatDateTime(order.readyAt)}</div>
                      </div>
                    </div>
                  )}
                  
                  {order.completedAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-gray-300">Completed</div>
                        <div className="text-xs text-gray-500">{formatDateTime(order.completedAt)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Actions ─────────────────────────────────────────────────
                What you can do, separate from what the order is. Every control
                carries a text label — rule 0.1. */}
            <div className="px-6 py-4 border-t border-white/10 bg-gray-900/50 space-y-3">
              {/* Confirmation for the one irreversible action on this panel.
                  Named with its object so "Cancel" cannot be read as
                  "close this panel" — rule 0.4. */}
              {confirmCancel ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <div className="flex items-start gap-2 text-sm text-red-300">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Cancel order #{String(order.orderNumber).split('-').pop()}? The
                      customer&rsquo;s order is voided and the table is released. This
                      cannot be undone.
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        onStatusChange(order._id, 'cancel');
                        setConfirmCancel(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-400 transition-colors"
                    >
                      <XCircle size={16} />
                      Yes, Cancel Order
                    </button>
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 text-gray-300 font-medium hover:bg-white/10 transition-colors"
                    >
                      Keep Order
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {canCancel && (
                    <button
                      onClick={() => setConfirmCancel(true)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                    >
                      <XCircle size={16} />
                      Cancel Order
                    </button>
                  )}

                  <button
                    onClick={() => onStatusChange(order._id, 'toggle_priority')}
                    className={`
                      flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                      ${order.isPriority
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                      }
                    `}
                  >
                    <Flame size={16} />
                    {order.isPriority ? 'Remove Rush' : 'Mark Rush'}
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setShowPrintMenu(!showPrintMenu)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-gray-400 text-sm font-medium hover:bg-white/10 transition-colors"
                    >
                      <Printer size={16} />
                      Print
                      <ChevronDown size={14} />
                    </button>
                    {showPrintMenu && (
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-gray-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                        <button
                          onClick={() => {
                            handlePrintKOT(order);
                            setShowPrintMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                        >
                          <Printer size={14} className="text-amber-400" />
                          Kitchen Ticket
                        </button>
                        <button
                          onClick={() => {
                            handlePrintInvoice(order);
                            setShowPrintMenu(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 transition-colors"
                        >
                          <FileText size={14} className="text-green-400" />
                          Receipt
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentAction && CurrentActionIcon && !confirmCancel && (
                <button
                  onClick={() => onStatusChange(order._id, currentAction.action)}
                  className={`
                    w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                    font-semibold transition-colors text-white
                    ${ACTION_BUTTON_STYLES[currentAction.color]}
                  `}
                >
                  <CurrentActionIcon size={18} />
                  {currentAction.label}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
