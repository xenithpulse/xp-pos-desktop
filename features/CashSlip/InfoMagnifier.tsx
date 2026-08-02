'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Calendar, User, FileText } from 'lucide-react';

interface InfoMagnifierProps {
  createdAt: Date | string;
  createdBy?: string | null;
  description?: string | null;
  maxLength?: number;
}

const truncateText = (text: string, maxLength: number): string => {
  if (text && text.length > maxLength) {
    return `${text.substring(0, maxLength)}...`;
  }
  return text || '';
};

const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  });
};

const formatShortDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-PK', {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: true,
  });
};

export const InfoMagnifier: React.FC<InfoMagnifierProps> = ({
  createdAt,
  createdBy,
  description,
  maxLength = 25,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const descriptionRequiresTruncation = description && description.length > maxLength;
  const truncatedDescription = description ? truncateText(description, maxLength) : '-';

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Compact inline view */}
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span className="whitespace-nowrap">{formatShortDate(createdAt)}</span>
        {createdBy && (
          <span className="text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">
            {createdBy}
          </span>
        )}
      </div>

      {/* Magnified popup */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute z-50 left-0 top-full mt-2 p-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl min-w-70 max-w-130"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {/* Arrow */}
            <div className="absolute -top-2 left-4 w-4 h-4 bg-neutral-900 border-l border-t border-neutral-700 rotate-45" />

            <div className="space-y-3 relative">
              {/* Created At */}
              <div className="flex items-start gap-3">
                <div className="p-2 bg-neutral-800 rounded-lg">
                  <Calendar className="w-4 h-4 text-neutral-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-200 mb-0.5">
                    Created At
                  </p>
                  <p className="text-sm text-white font-medium">
                    {formatDate(createdAt)}
                  </p>
                </div>
              </div>

              {/* Created By */}
              <div className="flex items-start gap-3">
                <div className="p-2 bg-neutral-800 rounded-lg">
                  <User className="w-4 h-4 text-neutral-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-200 mb-0.5">
                    Created By
                  </p>
                  <p className="text-sm text-white font-medium">
                    {createdBy || '-'}
                  </p>
                </div>
              </div>

              {/* Description */}
              {description && (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-neutral-800 rounded-lg">
                    <FileText className="w-4 h-4 text-neutral-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-200 mb-0.5">
                      Description
                    </p>
                    <p className="text-sm text-white leading-relaxed wrap-break-word">
                      {description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Truncated description shown below date */}
      {description && (
        <motion.p
          className="text-xs text-neutral-600 mt-0.5 truncate max-w-125"
          animate={isHovered && descriptionRequiresTruncation ? { scale: 1.02 } : { scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {truncatedDescription}
        </motion.p>
      )}
    </div>
  );
};

export default InfoMagnifier;
