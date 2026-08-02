import type { SlotProps } from './types';

export function ContextBarSlot({ children, className = '' }: SlotProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {children}
    </div>
  );
}
