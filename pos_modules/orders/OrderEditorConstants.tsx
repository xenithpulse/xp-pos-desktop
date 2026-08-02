// pos_modules/orders/OrderEditorConstants.tsx
// Constants extracted from OrderEditor for cleaner code organization

import React from 'react';
import {
  ChefHat,
  CheckCircle2,
  Utensils,
  Banknote,
  CreditCard,
  Smartphone,
  Receipt,
} from 'lucide-react';
import { PaymentMethod } from '@/types/order.types';

// Payment method icons
export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  cash: <Banknote size={16} />,
  card: <CreditCard size={16} />,
  online: <Smartphone size={16} />,
  other: <Receipt size={16} />,
};

// Lifecycle actions mapped to order status
export const LIFECYCLE_ACTIONS: Record<
  string,
  { label: string; action: string; icon: React.ReactNode; color: string }[]
> = {
  draft: [],
  confirmed: [
    {
      label: 'Start Preparing',
      action: 'start_preparing',
      icon: <ChefHat size={14} />,
      color: 'bg-amber-600 hover:bg-amber-500',
    },
  ],
  preparing: [
    {
      label: 'Mark Ready',
      action: 'mark_ready',
      icon: <CheckCircle2 size={14} />,
      color: 'bg-green-600 hover:bg-green-500',
    },
  ],
  ready: [
    {
      label: 'Mark Served',
      action: 'mark_served',
      icon: <Utensils size={14} />,
      color: 'bg-cyan-600 hover:bg-cyan-500',
    },
    {
      label: 'Complete Order',
      action: 'complete',
      icon: <CheckCircle2 size={14} />,
      color: 'bg-emerald-600 hover:bg-emerald-500',
    },
  ],
  served: [
    {
      label: 'Complete Order',
      action: 'complete',
      icon: <CheckCircle2 size={14} />,
      color: 'bg-emerald-600 hover:bg-emerald-500',
    },
  ],
  out_for_delivery: [
    {
      label: 'Complete Order',
      action: 'complete',
      icon: <CheckCircle2 size={14} />,
      color: 'bg-emerald-600 hover:bg-emerald-500',
    },
  ],
  completed: [],
  cancelled: [],
};
