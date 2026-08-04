// pos_modules/orders/order-editor/OrderEditor.tsx
// Slim orchestrator — delegates all state to useOrderEditorState
// and renders sub-components for each panel section.

'use client';

import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { useOrderEditorState } from './useOrderEditorState';
import TableSwitcher from './TableSwitcher';
import TakeawayClientPanel from './TakeawayClientPanel';
import TakeawayOrderSwitcher from './TakeawayOrderSwitcher';
import DeliveryDetailsBar from './DeliveryDetailsBar';
import OrderItemsList from './OrderItemsList';
import OrderFooter from './OrderFooter';
import PaymentDrawer from './PaymentDrawer';
import CatalogPanel from './CatalogPanel';
import AdjustmentManager from './AdjustmentManager';
import type { OrderEditorHandle, OrderEditorProps } from './types';
import { ITable, ITableSection } from '@/types/table.types';
import type { Order, TakeawayCustomer } from '@/types/order.types';

interface OrderEditorFullProps extends OrderEditorProps {
  /** All tables for the table switcher (dine-in mode) */
  tables?: ITable[];
  /** Available sections / zones */
  sections?: ITableSection[];
  /** Mode: 'dine-in' shows table switcher, 'takeaway'/'delivery' show the client panel instead */
  mode?: 'dine-in' | 'takeaway' | 'delivery';
  /** Active takeaway/delivery orders (for the order switcher) — only used outside dine-in */
  takeawayOrders?: Order[];
  /** Whether takeaway/delivery orders are still loading */
  isTakeawayLoading?: boolean;
  /** Called when switching to a different takeaway/delivery order */
  onTakeawaySwitch?: (order: Order) => void;
  /** Called when starting a fresh new takeaway/delivery order */
  onTakeawayNew?: () => void;
  /** Called when a customer is selected/created and a new takeaway/delivery order should be initiated */
  onTakeawayInitiate?: (customerId: string) => void;
}

const OrderEditor = forwardRef<OrderEditorHandle, OrderEditorFullProps>(
  function OrderEditorInner({
    tables = [],
    sections = [],
    mode = 'dine-in',
    takeawayOrders = [],
    isTakeawayLoading,
    onTakeawaySwitch,
    onTakeawayNew,
    onTakeawayInitiate,
    ...props
  }, ref) {
    const state = useOrderEditorState(props);

    // Takeaway customer state — fetched from active order's customerId
    const [takeawayCustomer, setTakeawayCustomer] = useState<TakeawayCustomer | null>(null);
    const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>();

    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    // Mobile: toggle between cart view and catalog view
    const [mobileView, setMobileView] = useState<'cart' | 'catalog'>('catalog');

    // When a customer is selected (existing) → initiate a takeaway order
    const handleCustomerSelect = useCallback(
      (customer: TakeawayCustomer) => {
        if (!customer) {
          setTakeawayCustomer(null);
          setSelectedAddressId(undefined);
          return;
        }
        setTakeawayCustomer(customer);
        // Auto-select default address
        const defaultAddr = customer.addresses?.find((a) => a.isDefault) || customer.addresses?.[0];
        if (defaultAddr) setSelectedAddressId(defaultAddr._id);
        // If there's no active order yet, initiate one for this customer
        if (!state.activeOrder && onTakeawayInitiate) {
          onTakeawayInitiate(customer._id);
        }
      },
      [state.activeOrder, onTakeawayInitiate],
    );

    const handleCustomerUpdate = useCallback((updated: TakeawayCustomer) => {
      setTakeawayCustomer(updated);
    }, []);

    // Sync takeaway customer when active order changes
    // (e.g. switching between orders in the switcher)
    const lastSyncedOrderId = useState<string | null>(null);
    if (
      state.activeOrder?.customerId &&
      state.activeOrder._id !== lastSyncedOrderId[0]
    ) {
      lastSyncedOrderId[1](state.activeOrder._id);
      // Fetch customer data for this order
      fetch(`/api/customers/${state.activeOrder.customerId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((c) => {
          if (c) {
            setTakeawayCustomer(c);
            const defaultAddr = c.addresses?.find((a: { isDefault: boolean }) => a.isDefault) || c.addresses?.[0];
            if (defaultAddr) setSelectedAddressId(defaultAddr._id);
          }
        })
        .catch(() => {});
    }

    // Expose print + refresh methods to parent via ref
    useImperativeHandle(ref, () => ({
      printKOT: () => state.handlePrintKOT(),
      printInvoice: () => state.handlePrintInvoice(),
      refreshMenu: () => state.refreshMenu(),
      refreshOrder: () => state.refreshOrder(),
    }));

    // Cart item count for the mobile toggle badge
    const totalCartItems = state.cart.items.length + (state.activeOrder?.items?.length || 0);

    return (
      <div className="h-full flex flex-col md:flex-row">
        {/* ─── Mobile Tab Toggle ─── */}
        <div className="flex md:hidden items-center bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-2 py-1.5 gap-1.5 sticky top-0 z-20">
          <button
            onClick={() => setMobileView('cart')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              mobileView === 'cart'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-gray-800/70 text-gray-400 active:bg-gray-700'
            }`}
          >
            Cart
            {totalCartItems > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                mobileView === 'cart' ? 'bg-white/20' : 'bg-purple-500/30 text-purple-300'
              }`}>
                {totalCartItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileView('catalog')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              mobileView === 'catalog'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-gray-800/70 text-gray-400 active:bg-gray-700'
            }`}
          >
            Menu
          </button>
        </div>

        {/* ─── LEFT PANEL: Order Details / Cart ─── */}
        <div
          className={`
            md:w-[380px] md:flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-950
            ${mobileView === 'cart' ? 'flex' : 'hidden md:flex'}
            flex-1 md:flex-initial min-h-0 overflow-hidden
          `}
        >
          {/* Table Switcher (dine-in) — replaces old OrderHeader */}
          {mode === 'dine-in' && (
            <TableSwitcher
              tables={tables}
              focusedContext={state.focusedContext}
              sections={sections}
              selectedZoneId={selectedZoneId}
              onZoneChange={setSelectedZoneId}
            />
          )}

          {/* Client Details (takeaway / delivery mode) */}
          {(mode === 'takeaway' || mode === 'delivery') && (
            <>
              <TakeawayOrderSwitcher
                orders={takeawayOrders}
                activeOrderId={state.activeOrder?._id}
                onSwitchOrder={(order) => onTakeawaySwitch?.(order)}
                onNewOrder={() => {
                  setTakeawayCustomer(null);
                  setSelectedAddressId(undefined);
                  onTakeawayNew?.();
                }}
                isLoading={isTakeawayLoading}
                label={mode === 'delivery' ? 'Delivery Orders' : 'Takeaway Orders'}
              />
              <TakeawayClientPanel
                customer={takeawayCustomer}
                onCustomerSelect={handleCustomerSelect}
                onCustomerUpdate={handleCustomerUpdate}
                selectedAddressId={selectedAddressId}
                onAddressSelect={setSelectedAddressId}
              />
              {mode === 'delivery' && (
                <DeliveryDetailsBar
                  activeOrder={state.activeOrder}
                  onSaved={() => state.refreshOrder()}
                />
              )}
            </>
          )}

          <OrderItemsList
            activeOrder={state.activeOrder}
            cart={state.cart}
            onUpdateServerItem={state.handleUpdateServerItem}
            onRemoveServerItem={state.handleRemoveServerItem}
            isUpdatingServerItem={state.isUpdatingServerItem}
            updateCartItemQuantity={state.updateCartItemQuantity}
            removeFromCart={state.removeFromCart}
            updateCartItemInstructions={state.updateCartItemInstructions}
            editingInstructionsId={state.editingInstructionsId}
            setEditingInstructionsId={state.setEditingInstructionsId}
          />

          {/* Adjustment Manager — only when the order has an actual billed total.
              Adjustments (esp. fixed discounts) apply to FIRED items; showing
              them on an empty order (subtotal 0) lets a discount drive the total
              negative and wedge the order. Items sitting in the cart but not yet
              sent to kitchen don't count — fire them first, then adjust. */}
          {state.activeOrder && (state.activeOrder.subtotal ?? 0) > 0 && (
            <AdjustmentManager
              activeOrder={state.activeOrder}
              onAddAdjustment={state.handleAddAdjustment}
              onRemoveAdjustment={state.handleRemoveAdjustment}
              isUpdating={state.isUpdatingAdjustment}
            />
          )}

          <OrderFooter
            activeOrder={state.activeOrder}
            cart={state.cart}
            pendingTotal={state.pendingTotal}
            handleCommitItems={state.handleCommitItems}
            isCommitting={state.isCommitting}
            commitError={state.commitError}
            commitSuccess={state.commitSuccess}
            setCommitError={state.setCommitError}
            setCommitSuccess={state.setCommitSuccess}
            handlePrintKOT={state.handlePrintKOT}
            lifecycleActions={state.lifecycleActions}
            canCancel={state.canCancel}
            handleLifecycleAction={state.handleLifecycleAction}
            handleCancelOrder={state.handleCancelOrder}
            isPerformingAction={state.isPerformingAction}
            actionError={state.actionError}
            handleCompleteOrder={state.handleCompleteOrder}
            paymentMethods={state.paymentMethods}
            isCompletingOrder={state.isCompletingOrder}
            completeError={state.completeError}
            canPay={state.canPay}
            onOpenPayment={state.handleOpenPayment}
            clearErrors={state.clearErrors}
            onSwitchToCatalog={() => setMobileView('catalog')}
          />

          {state.activeOrder && (
            <PaymentDrawer
              activeOrder={state.activeOrder}
              show={state.showPaymentDrawer}
              onClose={() => state.setShowPaymentDrawer(false)}
              paymentMethods={state.paymentMethods}
              paymentMethod={state.paymentMethod}
              setPaymentMethod={state.setPaymentMethod}
              paymentAmount={state.paymentAmount}
              setPaymentAmount={state.setPaymentAmount}
              paymentRef={state.paymentRef}
              setPaymentRef={state.setPaymentRef}
              isSubmitting={state.isSubmittingPayment}
              error={state.paymentError}
              success={state.paymentSuccess}
              onSubmit={state.handleSubmitPayment}
            />
          )}
        </div>

        {/* ─── RIGHT PANEL: Catalog Browser ─── */}
        <div
          className={`
            flex-1 min-h-0 min-w-0 overflow-hidden
            ${mobileView === 'catalog' ? 'flex' : 'hidden md:flex'}
          `}
        >
          <CatalogPanel
            categories={state.categories}
            menuItems={state.menuItems}
            selectedCategoryId={state.selectedCategoryId}
            setSelectedCategoryId={state.setSelectedCategoryId}
            searchQuery={state.searchQuery}
            setSearchQuery={state.setSearchQuery}
            isLoadingCategories={state.isLoadingCategories}
            isLoadingItems={state.isLoadingItems}
            onQuickAdd={(item) => {
              state.handleQuickAdd(item);
            }}
          />    
        </div>
      </div>
    );
  },
);

export default OrderEditor;
