// lib/types.ts
export interface InventoryItem {
  id: string;
  label: string;
  code?: string | null;
  category?: string | null;
  totalStock?: number;
  isLowStock?: boolean;
  reorderLevel?: number;
  originalData?: any;
}

export interface Category {
  categ_id: number;
  complete_name: string;
}

export interface Warehouse {
  id: number;
  display_name: string;
}