// pos_modules/orders/order-editor/CatalogItemCard.tsx
// Menu item card in the catalog grid — lightweight CSS transitions only

import { ChefHat, Clock, Leaf, Plus } from 'lucide-react';
import { IMenuItem, SPICE_LEVEL_ICONS, formatPrice } from '@/types/menu.types';

interface CatalogItemCardProps {
  item: IMenuItem;
  onAdd: () => void;
}

export default function CatalogItemCard({ item, onAdd }: CatalogItemCardProps) {
  return (
    <div
      className="overflow-hidden cursor-pointer group rounded-xl bg-gray-900 border border-gray-800 hover:border-purple-500/40 transition-all duration-150 active:scale-[0.97]"
      onClick={onAdd}
    >
      <div className="aspect-square relative">
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800/50">
            <ChefHat size={32} className="text-gray-600" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.isNewItem && (
            <span className="px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full">
              NEW
            </span>
          )}
          {item.isPopular && (
            <span className="px-2 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full">
              POPULAR
            </span>
          )}
        </div>
        <div className="absolute inset-0 bg-green-500/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Plus size={32} className="text-white" />
        </div>
      </div>
      <div className="p-2 md:p-2.5">
        <h4
          className="font-medium text-white text-xs md:text-sm leading-tight break-words"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            whiteSpace: 'normal',
          }}
          title={item.name}
        >
          {item.name}
        </h4>
        <div className="flex items-center justify-between mt-1">
          <span className="text-purple-400 font-semibold text-xs md:text-sm">{formatPrice(item.basePrice)}</span>
          <div className="flex items-center gap-1">
            {item.spiceLevel && item.spiceLevel !== 'none' && (
              <span className="text-xs">{SPICE_LEVEL_ICONS[item.spiceLevel]}</span>
            )}
            {item.dietaryTags?.includes('vegetarian') && (
              <Leaf size={12} className="text-green-400" />
            )}
          </div>
        </div>
        {item.preparationTime > 0 && (
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <Clock size={10} />
            <span>{item.preparationTime} min</span>
          </div>
        )}
      </div>
    </div>
  );
}
