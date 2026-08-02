'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useLayoutEffect } from 'react';

type Placement = 'top' | 'bottom' | 'left' | 'right';

interface TextMagnifierProps {
  text: string;
  maxWidthClass?: string; // e.g. "max-w-[120px]"
  placement?: Placement;
  className?: string;
}

export default function TextMagnifier({
  text,
  maxWidthClass = 'max-w-[700px]',
  placement = 'right',
  className = '',
}: TextMagnifierProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const isTruncated =
    triggerRef.current &&
    triggerRef.current.scrollWidth > triggerRef.current.clientWidth;

  useLayoutEffect(() => {
    if (!isHovered) return;

    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const rect = trigger.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const spacing = 8;

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = rect.top - tipRect.height - spacing;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + spacing;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - spacing;
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + spacing;
        break;
    }

    // Viewport guard
    const padding = 8;

    if (left < padding) left = padding;
    if (left + tipRect.width > window.innerWidth - padding)
      left = window.innerWidth - tipRect.width - padding;

    if (top < padding) top = padding;
    if (top + tipRect.height > window.innerHeight - padding)
      top = window.innerHeight - tipRect.height - padding;

    setCoords({ top, left });
  }, [isHovered, placement]);

  return (
    <>
      {/* Truncated Name */}
      <div
        ref={triggerRef}
        className={`truncate whitespace-nowrap text-sm font-semibold text-white cursor-default ${maxWidthClass} ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {text}
      </div>

      <AnimatePresence>
        {isHovered && isTruncated && (
          <motion.div
            ref={tooltipRef}
            className="fixed z-[9999] px-4 py-2 rounded-lg bg-gray-900 text-white text-base font-semibold shadow-2xl max-w-[400px] whitespace-normal"
            style={{ top: coords.top, left: coords.left }}
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 4 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}