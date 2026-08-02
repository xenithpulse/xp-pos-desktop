'use client';

import React from 'react';
import DailyExpenseForm from './ExpenseSheet/DailyExpenseInput';
import DailyExpenseList from './DailyExpenseList';
import { useSession } from 'next-auth/react';
import { motion, useReducedMotion, cubicBezier } from 'framer-motion';
import type { Transition } from 'framer-motion';

export default function DailyExpenseInput() {
  const { data: session } = useSession();
  const user = session?.user.name || '';

  const prefersReduced = useReducedMotion();

  const parentInitial = prefersReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 };
  const parentAnimate = { opacity: 1, y: 0 };

  const parentTransition: Transition = {
    duration: 0.45,
    ease: cubicBezier(0.2, 0.85, 0.2, 1),
    when: 'beforeChildren',
    staggerChildren: prefersReduced ? 0 : 0.15,
  };

  const childInitial = prefersReduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 };
  const childAnimate = { opacity: 1, y: 0 };

  const childTransition: Transition = {
    duration: 0.35,
    ease: cubicBezier(0.25, 0.8, 0.25, 1),
  };

  // NOTE: DailySheetProvider is now hoisted to the page level
  // (app/(pages)/daily-sheet/page.tsx) so the global context bar can read
  // sheet status (open/closed) and trigger Open/Close from the top bar.
  return (
    <motion.div
      className="space-y-6"
      initial={parentInitial}
      animate={parentAnimate}
      transition={parentTransition}
    >
      <motion.div initial={childInitial} animate={childAnimate} transition={childTransition}>
        <DailyExpenseForm />
      </motion.div>

      <motion.div initial={childInitial} animate={childAnimate} transition={childTransition}>
        <DailyExpenseList currentUserId={user} />
      </motion.div>
    </motion.div>
  );
}
