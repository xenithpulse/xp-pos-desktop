// pos_modules/orders/order-editor/OrderItemsList.tsx
// Unified item list — ALL items are editable (no "Committed" distinction).
// Server items and cart items are displayed in a single scrollable list.

'use client';

import { useState } from 'react';
import {
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  MessageSquare,
  Check,
} from 'lucide-react';
import { ICart, formatPrice } from '@/types/menu.types';
import {
  Order,
  OrderItem,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
} from '@/types/order.types';
import CartItemRow from './CartItemRow';
import { PAYMENT_METHOD_ICONS } from '../OrderEditorConstants';
import React from 'react';
import SmartMagnifier from '@/utils/TextMagnifier';

// ─────────────────────────────────────────────────────────────────────────────
// Server Item Row — editable inline, mirrors CartItemRow look-and-feel
// ─────────────────────────────────────────────────────────────────────────────

interface ServerItemRowProps {
  item: OrderItem;
  onUpdateQuantity: (newQuantity: number) => void;
  onRemove: () => void;
  onUpdateInstructions: (instructions: string) => void;
  isEditingInstructions: boolean;
  onToggleInstructions: () => void;
  disabled?: boolean;
}

function ServerItemRow({
  item,
  onUpdateQuantity,
  onRemove,
  onUpdateInstructions,
  isEditingInstructions,
  onToggleInstructions,
  disabled,
}: ServerItemRowProps) {
  const [instructions, setInstructions] = useState(
    item.specialInstructions || '',
  );

  return (
    <div className="px-2 py-1.5 rounded-lg bg-gray-800">
      <div className="flex items-center justify-between gap-1">
        {/* Name + price inline */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <SmartMagnifier text={item.name} maxWidthClass="max-w-[140px]" className="!text-xs !font-semibold" />
          <span className="text-[11px] text-purple-400 flex-shrink-0">
            {formatPrice(item.unitPrice)}{item.quantity > 1 && <span className="text-gray-500"> ×{item.quantity}</span>}
          </span>
        </div>

        {/* Compact controls */}
        <div className="flex items-center gap-px flex-shrink-0">
          <button
            onClick={onToggleInstructions}
            className={`p-1 rounded text-gray-400 hover:text-amber-400 ${
              item.specialInstructions ? 'text-amber-400' : ''
            }`}
            title="Special instructions"
            disabled={disabled}
          >
            <MessageSquare size={12} />
          </button>
          <button
            onClick={() => onUpdateQuantity(item.quantity - 1)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            disabled={disabled || item.quantity <= 1}
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1) onUpdateQuantity(val);
            }}
            className="w-7 text-center text-white text-xs font-medium bg-gray-700 border border-gray-600 rounded py-0.5 focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min={1}
            disabled={disabled}
          />
          <button
            onClick={() => onUpdateQuantity(item.quantity + 1)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            disabled={disabled}
          >
            <Plus size={12} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-red-600/20 rounded text-gray-400 hover:text-red-400"
            disabled={disabled}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {/* Secondary info row — modifiers / instructions */}
      {((item.modifiers?.length ?? 0) > 0 || (item.specialInstructions && !isEditingInstructions)) && (
        <div className="flex items-center gap-2 mt-0.5 text-[10px] truncate">
          {(item.modifiers?.length ?? 0) > 0 && (
            <span className="text-gray-500 truncate">{item.modifiers?.map((m) => m.name).join(', ')}</span>
          )}
          {item.specialInstructions && !isEditingInstructions && (
            <span className="text-amber-400 truncate flex items-center gap-0.5">
              <MessageSquare size={8} />
              {item.specialInstructions}
            </span>
          )}
        </div>
      )}

      {isEditingInstructions && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="No onions, extra spicy..."
            className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs placeholder-gray-500 focus:outline-none focus:border-amber-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdateInstructions(instructions);
                onToggleInstructions();
              }
            }}
            autoFocus
          />
          <button
            onClick={() => {
              onUpdateInstructions(instructions);
              onToggleInstructions();
            }}
            className="px-2 py-1.5 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-500"
          >
            <Check size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main List
// ─────────────────────────────────────────────────────────────────────────────

interface OrderItemsListProps {
  activeOrder: Order | null;
  cart: ICart;
  // Server item handlers
  onUpdateServerItem: (
    itemId: string,
    updates: { quantity?: number; specialInstructions?: string },
  ) => Promise<void>;
  onRemoveServerItem: (itemId: string) => Promise<void>;
  isUpdatingServerItem: boolean;
  // Cart item handlers
  updateCartItemQuantity: (cartItemId: string, quantity: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateCartItemInstructions: (
    cartItemId: string,
    instructions: string,
  ) => void;
  editingInstructionsId: string | null;
  setEditingInstructionsId: (id: string | null) => void;
}

export default function OrderItemsList({
  activeOrder,
  cart,
  onUpdateServerItem,
  onRemoveServerItem,
  isUpdatingServerItem,
  updateCartItemQuantity,
  removeFromCart,
  updateCartItemInstructions,
  editingInstructionsId,
  setEditingInstructionsId,
}: OrderItemsListProps) {
  const serverItems = activeOrder?.items || [];
  const hasServerItems = serverItems.length > 0;
  const hasCartItems = cart.items.length > 0;
  const hasAnyItems = hasServerItems || hasCartItems;

  return (
    <div className="flex-1 overflow-y-auto p-1.5 md:p-2">
      {/* Server-side items (fully editable, no "committed" label) */}
      {hasServerItems && (
        <div className={hasCartItems ? 'mb-4' : ''}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Order Items
          </h3>
          <div className="space-y-1.5">
            {serverItems.map((item) => (
              <ServerItemRow
                key={item._id}
                item={item}
                onUpdateQuantity={(qty) =>
                  onUpdateServerItem(item._id, { quantity: qty })
                }
                onRemove={() => onRemoveServerItem(item._id)}
                onUpdateInstructions={(instr) =>
                  onUpdateServerItem(item._id, {
                    specialInstructions: instr,
                  })
                }
                isEditingInstructions={editingInstructionsId === item._id}
                onToggleInstructions={() =>
                  setEditingInstructionsId(
                    editingInstructionsId === item._id ? null : item._id,
                  )
                }
                disabled={isUpdatingServerItem}
              />
            ))}
          </div>
        </div>
      )}

      {/* New cart items (not yet fired) */}
      {hasCartItems && (
        <div>
          {hasServerItems && (
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              New Items
            </h3>
          )}
          <div className="space-y-1.5">
            {cart.items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onIncrement={() =>
                  updateCartItemQuantity(item.id, item.quantity + 1)
                }
                onDecrement={() =>
                  updateCartItemQuantity(item.id, item.quantity - 1)
                }
                onSetQuantity={(qty) =>
                  updateCartItemQuantity(item.id, qty)
                }
                onRemove={() => removeFromCart(item.id)}
                isEditingInstructions={editingInstructionsId === item.id}
                onToggleInstructions={() =>
                  setEditingInstructionsId(
                    editingInstructionsId === item.id ? null : item.id,
                  )
                }
                onUpdateInstructions={(instr) =>
                  updateCartItemInstructions(item.id, instr)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasAnyItems && (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <ShoppingCart size={48} className="mb-4 opacity-30" />
          <p className="text-sm">Cart is empty</p>
          <p className="text-xs text-gray-600 mt-1">
            <span className="hidden md:inline">Add items from the catalog →</span>
            <span className="md:hidden">Switch to Menu tab to add items</span>
          </p>
        </div>
      )}

      {/* Payment transactions (read-only display) */}
      {activeOrder &&
        activeOrder.transactions &&
        activeOrder.transactions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Payments Received
            </h3>
            <div className="space-y-1">
              {activeOrder.transactions.map((txn, i) => (
                <div
                  key={txn._id || i}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-900/10 border border-green-800/20 text-sm"
                >
                  <div className="flex items-center gap-2 text-green-400">
                    {PAYMENT_METHOD_ICONS[txn.method as PaymentMethod]}
                    <span>
                      {PAYMENT_METHOD_LABELS[txn.method as PaymentMethod]}
                    </span>
                  </div>
                  <span className="text-green-300 font-medium">
                    {formatPrice(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
