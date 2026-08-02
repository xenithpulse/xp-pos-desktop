import type { StatBadgeProps } from './types';

export function StatBadge({ icon, value, label, color = 'purple' }: StatBadgeProps) {
  const colorClasses = {
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    green: 'bg-green-500/20 text-green-300 border-green-500/30',
    blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    red: 'bg-red-500/20 text-red-300 border-red-500/30',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colorClasses[color]}`}>
      {icon}
      <span className="font-semibold">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}
