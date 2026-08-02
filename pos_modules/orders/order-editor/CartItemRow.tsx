// pos_modules/orders/CartItemRow.tsx
// Single row in the local cart with quantity controls and instructions editor

'use client';

import { useState } from 'react';
import { Minus, Plus, Trash2, MessageSquare, Check } from 'lucide-react';
import { ISelectedModifier, formatPrice } from '@/types/menu.types';
import SmartMagnifier from '@/utils/TextMagnifier';

export interface CartItemRowProps {
  item: {
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
    totalPrice: number;
    modifiers: ISelectedModifier[];
    specialInstructions?: string;
  };
  onIncrement: () => void;
  onDecrement: () => void;
  onSetQuantity?: (quantity: number) => void;
  onRemove: () => void;
  isEditingInstructions: boolean;
  onToggleInstructions: () => void;
  onUpdateInstructions: (instructions: string) => void;
}

export default function CartItemRow({
  item,
  onIncrement,
  onDecrement,
  onSetQuantity,
  onRemove,
  isEditingInstructions,
  onToggleInstructions,
  onUpdateInstructions,
}: CartItemRowProps) {
  const [instructions, setInstructions] = useState(item.specialInstructions || '');

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
          >
            <MessageSquare size={12} />
          </button>
          <button
            onClick={onDecrement}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          >
            <Minus size={12} />
          </button>
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && onSetQuantity) onSetQuantity(val);
            }}
            className="w-7 text-center text-white text-xs font-medium bg-gray-700 border border-gray-600 rounded py-0.5 focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min={1}
          />
          <button
            onClick={onIncrement}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-red-600/20 rounded text-gray-400 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {/* Secondary info row — modifiers / instructions */}
      {(item.modifiers.length > 0 || (item.specialInstructions && !isEditingInstructions)) && (
        <div className="flex items-center gap-2 mt-0.5 text-[10px] truncate">
          {item.modifiers.length > 0 && (
            <span className="text-gray-500 truncate">{item.modifiers.map((m) => m.optionName).join(', ')}</span>
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
