"use client"

import { ArrowLeft, User, Calendar, Download, Search } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { useState, useEffect, useMemo } from "react"
import type { InventoryItem } from "@/lib/api-client"
import { apiClient, type StockMovement } from "@/lib/api-client"

interface SkuDetailViewProps {
  sku: InventoryItem
  onBack: () => void
}

// Get default date range (current month)
const today = new Date();
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

export function SkuDetailView({ sku, onBack }: SkuDetailViewProps) {
  console.log(sku)
  const [dateRange, setDateRange] = useState({
    startDate: firstDayOfMonth.toISOString().split('T')[0],
    endDate: lastDayOfMonth.toISOString().split('T')[0]
  });
  const [stockMovementLoading, setStockMovementLoading] = useState(false);
  const [stockMovementError, setStockMovementError] = useState<string | null>(null);
  const [stockMovementData, setStockMovementData] = useState<StockMovement[]>([]);
  const [allStockMovements, setAllStockMovements] = useState<StockMovement[]>([]);
  const [historicalMovements, setHistoricalMovements] = useState<StockMovement[]>([]);
  const [openingStocks, setOpeningStocks] = useState<Record<string, number>>({});
  const [stockVarianceData, setStockVarianceData] = useState<any[]>([]);
  const [varianceBeforeDate, setVarianceBeforeDate] = useState<any[]>([]);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [filterLoading, setFilterLoading] = useState(false);

  // If start date is on or before 2025-07-01, don't temper opening stock
  const shouldUseBaseOpeningOnly = useMemo(() => {
    try {
      const cutoff = new Date('2025-07-01');
      const start = new Date(dateRange.startDate);
      return start <= cutoff;
    } catch {
      return false;
    }
  }, [dateRange.startDate]);

  // Normalize movement types to a single canonical set
  const normalizeMovementType = (type?: string) => {
    switch ((type || '').toLowerCase()) {
      case 'sale':
        return 'sales';
      case 'purchase_return':
        return 'purchase_returns';
      case 'wastage':
        return 'wastages';
      case 'manufacturing_in':
        return 'manufacturing';
      case 'manufacturing_out':
        return 'consumption';
      default:
        return (type || '').toLowerCase();
    }
  };

  // Function to calculate dynamic opening stock: base inventory + historical movements before start date
  const calculateDynamicOpeningStock = (
    historical: StockMovement[],
    varianceBefore: any[]
  ): Record<string, number> => {
    // If start date is 1st July 2025 or earlier, return base inventory without adjustments
    if (shouldUseBaseOpeningOnly) {
      const baseOpening: Record<string, number> = {};
      sku.warehouse_inventory?.forEach((wh) => {
        const code = wh.warehouse?.code || `unknown_${Math.random()}`;
        baseOpening[code] = (wh.quantity || 0);
      });
      return baseOpening;
    }

    // Initialize with base inventory quantities per warehouse
    const computedOpening: Record<string, number> = {};
    sku.warehouse_inventory?.forEach((wh) => {
      const code = wh.warehouse?.code || `unknown_${Math.random()}`;
      computedOpening[code] = (wh.quantity || 0);
    });

    // Apply historical movements (movements before start date)
    historical.forEach((movement) => {
      const type = normalizeMovementType(movement.movement_type);
      const sourceWarehouse = movement.warehouse?.code;
      const destWarehouse = movement.warehouse_dest?.code;
      const quantity = Math.abs(movement.quantity || 0);

      // Ensure keys exist
      if (sourceWarehouse && computedOpening[sourceWarehouse] === undefined) {
        computedOpening[sourceWarehouse] = 0;
      }
      if (destWarehouse && computedOpening[destWarehouse] === undefined) {
        computedOpening[destWarehouse] = 0;
      }

      // Apply natural-signed effects to source warehouse
      if (sourceWarehouse) {
        if (['sales', 'transfer_out', 'wastages', 'consumption', 'purchase_returns', 'transfer_in'].includes(type)) {
          computedOpening[sourceWarehouse] -= quantity;
        } else if (['purchase', 'manufacturing', 'sales_returns', 'adjustment'].includes(type)) {
          computedOpening[sourceWarehouse] += quantity;
        }
      }

      // Apply natural-signed effects to destination warehouse
      if (destWarehouse) {
        if (['purchase', 'transfer_in', 'manufacturing', 'sales_returns', 'adjustment'].includes(type)) {
          computedOpening[destWarehouse] += quantity;
        } else if (['sales', 'transfer_out', 'wastages', 'consumption', 'purchase_returns'].includes(type)) {
          computedOpening[destWarehouse] -= quantity;
        }
      }
    });

    // Apply variance before start date to opening stock
    varianceBefore.forEach((variance) => {
      const warehouseCode = variance.warehouse_code;
      if (warehouseCode && computedOpening[warehouseCode] !== undefined) {
        computedOpening[warehouseCode] += variance.cumulative_variance || 0;
      } else if (warehouseCode) {
        // Create entry for warehouse if it doesn't exist
        computedOpening[warehouseCode] = variance.cumulative_variance || 0;
      }
    });

    return computedOpening;
  };
  
  // ADDITIONAL FIX: Ensure warehouseData recalculates when opening stocks change
  const warehouseData = useMemo(() => {
    const warehouses = new Map();
    
    // Add warehouses from inventory data
    sku.warehouse_inventory?.forEach((wh) => {
      const code = wh.warehouse?.code || `unknown_${Math.random()}`;
      const name = wh.warehouse?.name || wh.warehouse?.code || "Unknown";
      const warehouseId = wh.warehouse?.id;
      warehouses.set(code, {
        warehouse: name,
        warehouseCode: code,
        warehouseId: warehouseId,
        openingStock: openingStocks[code] || 0, // This will now use calculated opening stock
        lastUpdated: "N/A",
      });
    });
    
    // Add warehouses from stock movement data
    stockMovementData?.forEach((movement) => {
      const sourceWarehouse = movement.warehouse?.code;
      const destWarehouse = movement.warehouse_dest?.code;
      
      [sourceWarehouse, destWarehouse].forEach(warehouseCode => {
        if (warehouseCode && !warehouses.has(warehouseCode)) {
          const warehouseInfo = warehouseCode === sourceWarehouse 
            ? movement.warehouse 
            : movement.warehouse_dest;
            
          warehouses.set(warehouseCode, {
            warehouse: warehouseInfo?.name || warehouseCode,
            warehouseCode: warehouseCode,
            warehouseId: warehouseInfo?.id,
            openingStock: openingStocks[warehouseCode] || 0, // Use calculated opening stock
            calculatedStock: 0,
            lastUpdated: "N/A",
          });
        }
      });
    });
    
    return Array.from(warehouses.values());
  }, [sku.warehouse_inventory, stockMovementData, openingStocks]); // openingStocks is key dependency

  // Enhanced function to get stock movement data for a warehouse
  const getWarehouseMovements = (warehouseCode: string) => {
    const warehouseMovements = stockMovementData.reduce((acc, movement) => {
      const sourceWarehouse = movement.warehouse?.code;
      const destWarehouse = movement.warehouse_dest?.code;
      
      if (sourceWarehouse === warehouseCode) {
        switch (movement.movement_type) {
          case 'purchase':
            acc.purchases += Math.abs(movement.quantity);
            break;
          case 'sales':
            acc.sales += Math.abs(movement.quantity);
            break;
          case 'sales_returns':
            acc.sales_returns += Math.abs(movement.quantity);
            break;
          case 'purchase_return':
            acc.purchase_returns += Math.abs(movement.quantity);
            break;
          case 'transfer_in':
            acc.transfer_out += Math.abs(movement.quantity);
            break;
          case 'wastages':
            acc.wastages += Math.abs(movement.quantity);
            break;
          case 'consumption':
            acc.consumption += Math.abs(movement.quantity);
            break;
        }
      }
      
      if (destWarehouse === warehouseCode) {
        switch (movement.movement_type) {
          case 'purchase':
            acc.purchases += movement.quantity;
            break;
          case 'transfer_in':
            acc.transfer_in += movement.quantity;
            break;
          case 'manufacturing':
            acc.manufacturing += movement.quantity;
            break;
        }
      }
      
      return acc;
    }, {
      warehouse_code: warehouseCode,
      purchases: 0,
      purchase_returns: 0,
      sales: 0,
      sales_returns: 0,
      wastages: 0,
      transfer_in: 0,
      transfer_out: 0,
      manufacturing: 0,
      consumption: 0
    });
    
    return warehouseMovements;
  };

  // Calculate totals including all movement types
  const calculateTotals = () => {
    let totalOpeningStock = 0;
    let totalPurchases = 0;
    let totalSales = 0;
    let totalPurchaseReturns = 0;
    let totalSalesReturns = 0;
    let totalWastages = 0;
    let totalTransferIN = 0;
    let totalTransferOUT = 0;
    let totalManufacturing = 0;
    let totalConsumption = 0;
    let totalClosingStock = 0;

    warehouseData.forEach((row) => {
      const movements = getWarehouseMovements(row.warehouseCode);

      totalOpeningStock += row.openingStock;
      totalPurchases += movements.purchases;
      totalPurchaseReturns += Math.abs(movements.purchase_returns);
      totalSales += movements.sales;
      totalSalesReturns += movements.sales_returns;
      totalWastages += movements.wastages;
      totalTransferIN += movements.transfer_in;
      totalTransferOUT += movements.transfer_out;
      totalManufacturing += movements.manufacturing;
      totalConsumption += movements.consumption;

      const closingStock = row.openingStock
        + movements.purchases
        + movements.transfer_in
        + movements.manufacturing
        + movements.sales_returns
        - Math.abs(movements.sales)
        - Math.abs(movements.purchase_returns)
        - Math.abs(movements.transfer_out)
        - Math.abs(movements.wastages)
        - Math.abs(movements.consumption);

      totalClosingStock += closingStock;
    });

    return {
      totalOpeningStock,
      totalPurchases,
      totalPurchaseReturns,
      totalSales,
      totalSalesReturns,
      totalWastages,
      totalTransferIN,
      totalTransferOUT,
      totalManufacturing,
      totalConsumption,
      totalClosingStock,
    };
  };

  const totals = calculateTotals();

  // Function to fetch historical movements for opening stock calculation
  const fetchHistoricalMovements = async (): Promise<StockMovement[]> => {
    const productId = sku.odoo_id || sku.id;
    
    if (!productId) {
      console.warn('Missing product ID for historical movements');
      setHistoricalMovements([]);
      return [];
    }
    
    try {
      const productIdString = productId.toString();
      
      const { success, data } = await apiClient.getAllStockMovementsBeforeDate(
        productIdString,
        dateRange.startDate
      );
      
      if (success) {
        setHistoricalMovements(data);
        console.log(`✅ Fetched ${data.length} historical movements before ${dateRange.startDate}`);
        return data;
      } else {
        console.error('❌ Failed to fetch historical movements');
        setHistoricalMovements([]);
        return [];
      }
    } catch (err: any) {
      console.error('❌ Error fetching historical movements:', err);
      setHistoricalMovements([]);
      return [];
    }
  };
  
  // Function to fetch stock movement data
  const fetchStockMovementData = async () => { 
    const productId = sku.odoo_id || sku.id;
    
    if (!productId) {
      console.warn('Missing both sku.odoo_id and sku.id');
      setStockMovementError('Missing product ID. Please try again.');
      return;
    }
    
    setStockMovementLoading(true);
    setStockMovementError(null);
    
    try {
      const productIdString = productId.toString();
      
      // STEP 1: Fetch historical movements and current date range stock movements
      const historicalData = await fetchHistoricalMovements();
      const {success, data} = await apiClient.getStockMovementDetailsByDateRange(
        productIdString,
        dateRange.startDate,
        dateRange.endDate
      );
      
      if (!success) {
        throw new Error('Failed to fetch stock movement details');
      }
      
      setStockMovementData(data);
      
      let varianceBeforeData: any[] = [];
      let varianceData: any[] = [];
      try {
        // STEP 2: Fetch variance before date (for opening stock adjustments)
        const varianceBeforeResponse = await fetch(
          `/api/stock-corrections/variance-before-date/${productIdString}?date=${dateRange.startDate}`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (varianceBeforeResponse.ok) {
          const parsed = await varianceBeforeResponse.clone().json().catch(async () => {
            const text = await varianceBeforeResponse.text().catch(() => '');
            try { return JSON.parse(text || '{}'); } catch { return {}; }
          });
          if (parsed.success) {
            varianceBeforeData = parsed.data;
            setVarianceBeforeDate(varianceBeforeData);
          }
        }

        // STEP 3: Fetch variance within date range (for display in table)
        const varianceResponse = await fetch(
          `/api/stock-corrections/variance-with-totals/${productIdString}?start_date=${dateRange.startDate}&end_date=${dateRange.endDate}`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (varianceResponse.ok) {
          const parsed = await varianceResponse.clone().json().catch(async () => {
            const text = await varianceResponse.text().catch(() => '');
            try { return JSON.parse(text || '{}'); } catch { return {}; }
          });
          if (parsed.success) {
            varianceData = parsed.data;
            setStockVarianceData(varianceData);
          }
        }
      } catch (varianceErr) {
        console.error('Error fetching variance data:', varianceErr);
        setStockVarianceData([]);
        setVarianceBeforeDate([]);
        varianceBeforeData = [];
        varianceData = [];
      }

      // STEP 4: Calculate dynamic opening stock with all data available using local data
      const dynamicOpeningStocks = calculateDynamicOpeningStock(historicalData, varianceBeforeData);
      setOpeningStocks(dynamicOpeningStocks);

      console.log('✅ Complete opening stock calculation flow completed:', {
        historicalMovementsCount: historicalData.length,
        varianceBeforeCount: varianceBeforeData.length,
        varianceInRangeCount: varianceData.length,
        finalOpeningStocks: dynamicOpeningStocks
      });
    } catch (err: any) {
      console.error('Error in fetchStockMovementData:', err);
      setStockMovementError(err.message || "Failed to fetch stock movement data");
    } finally {
      setStockMovementLoading(false);
    }
  };

  // Function to apply filter
  const applyFilter = async () => {
    setFilterLoading(true);
    setStockMovementError(null);
    
    try {
      // Fetch both historical movements and current date range movements
      await fetchStockMovementData();
    } catch (error) {
      console.error('Error applying filter:', error);
      setStockMovementError('Failed to apply filter. Please try again.');
    } finally {
      setFilterLoading(false);
    }
  };

  // Initialize clean state on SKU change only (no auto-fetching)
  useEffect(() => {
    const productId = sku.odoo_id || sku.id;
    if (productId) {
      setHistoricalMovements([]);
      setVarianceBeforeDate([]);
      setStockVarianceData([]);
      setOpeningStocks({});
      // Initial load for current month
      fetchStockMovementData();
    }
  }, [sku.odoo_id, sku.id]);
  
  useEffect(() => { 
    setForceUpdate(prev => prev + 1);
  }, [stockMovementData]);
  
  useEffect(() => {
  }, [openingStocks]);

  const exportWarehouseData = () => {
    const headers = [
      "Warehouse",
      "Opening Stock",
      "Purchases", 
      "Purchase Returns",
      "Sales",
      "Sales Returns",
      "Wastages",
      "Transfer IN",
      "Transfer OUT",
      "Manufacturing",
      "Consumption",
      "Stock Variance",
      "Closing Stock"
    ];

    const csvData = warehouseData.map(row => {
      const movements = getWarehouseMovements(row.warehouseCode);
      const closingStock = 
        row.openingStock
        + movements.purchases
        + movements.transfer_in
        + movements.manufacturing
        + movements.sales_returns
        - Math.abs(movements.sales)
        - Math.abs(movements.purchase_returns)
        - Math.abs(movements.transfer_out)
        - Math.abs(movements.wastages)
        - Math.abs(movements.consumption);

      const warehouseVariance = stockVarianceData.find(
        v => v.warehouse_code === row.warehouseCode
      );
      const stockVariance = warehouseVariance?.stock_variance || 0;
      const closingStockWithVariance = closingStock + stockVariance;

      return [
        row.warehouse,
        row.openingStock,
        movements.purchases,
        movements.purchase_returns,
        movements.sales,
        movements.sales_returns,
        movements.wastages,
        movements.transfer_in,
        movements.transfer_out,
        movements.manufacturing,
        movements.consumption,
        stockVariance > 0 ? '+' + stockVariance : stockVariance,
        closingStockWithVariance
      ];
    });

    const totalsRow = [
      "Total",
      totals.totalOpeningStock.toFixed(2),
      totals.totalPurchases.toFixed(2),
      totals.totalPurchaseReturns.toFixed(2),
      totals.totalSales.toFixed(2),
      totals.totalSalesReturns.toFixed(2),
      totals.totalWastages.toFixed(2),
      totals.totalTransferIN.toFixed(2),
      totals.totalTransferOUT.toFixed(2),
      totals.totalManufacturing.toFixed(2),
      totals.totalConsumption.toFixed(2),
      stockVarianceData.filter(v => !v.is_total).reduce((sum, v) => sum + v.stock_variance, 0),
      totals.totalClosingStock + stockVarianceData.filter(v => !v.is_total).reduce((sum, v) => sum + v.stock_variance, 0)
    ];

    const csvContent = [
      headers.join(","),
      ...csvData.map(row => row.join(",")),
      totalsRow.join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Warehouse_Inventory_${sku.name}_${dateRange.startDate}_to_${dateRange.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gray-800 rounded"></div>
              <span className="text-xl font-semibold text-gray-900">FreshBasket</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Avatar className="w-8 h-8">
              <AvatarImage src="/placeholder-user.jpg" />
              <AvatarFallback>
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-2 text-sm text-gray-600 mb-6">
            <button onClick={onBack} className="flex items-center hover:text-gray-900">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Inventory
            </button>
            <span>/</span>
            <span className="text-gray-900">SKU Details</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">SKU: {sku.name}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>Barcode: {sku.barcode}</span>
              <span>•</span>
              <span>Category: {Array.isArray(sku.category) ? (sku.category[0] as any)?.display_name : (sku.category as any)?.display_name || "Uncategorized"}</span>
              <span>•</span>
              <span>Reorder Level: {sku.reordering_min_qty}</span>
            </div>
            <p className="text-gray-600 mt-2">Real-time inventory levels across all warehouse locations</p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Information</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Product Name:</span>
                  <span className="font-medium">{sku.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Barcode:</span>
                  <span className="font-mono text-sm">{sku.barcode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Category:</span>
                  <span>{Array.isArray(sku.category) ? (sku.category[0] as any)?.display_name : (sku.category as any)?.display_name || "Uncategorized"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unit of Measure:</span>
                  <span>{sku.uom_name}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing & Stock Levels</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Unit Cost:</span>
                  <span className="font-medium">PKR {sku.standard_price?.toFixed(2) || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Selling Price:</span>
                  <span className="font-medium">PKR {sku.list_price?.toFixed(2) || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Reorder Level:</span>
                  <span className="font-medium">{sku.reordering_min_qty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Stock Level:</span>
                  <span className="font-medium">{sku.reordering_max_qty || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Stock Value:</span>
                  <span className="font-medium text-green-600">
                    PKR {((sku.standard_price || 0) * totals.totalClosingStock).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {stockMovementLoading && (
            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800">Loading stock movement data...</p>
            </div>
          )}

          {stockMovementError && (
            <div className="mt-8 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error loading stock movement data: {stockMovementError}</p>
            </div>
          )}

          <div className="mt-12 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Warehouse Inventory</h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <Label htmlFor="start-date" className="text-sm font-medium text-gray-700">
                    From:
                  </Label>
                  <input
                    id="start-date"
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Label htmlFor="end-date" className="text-sm font-medium text-gray-700">
                    To:
                  </Label>
                  <input
                    id="end-date"
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyFilter}
                  disabled={filterLoading}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white"
                >
                  {filterLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                      Filtering...
                    </>
                  ) : (
                    <>
                      <Search className="w-3 h-3 mr-1" />
                      Filter
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const today = new Date();
                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    const newDateRange = {
                      startDate: firstDay.toISOString().split('T')[0],
                      endDate: lastDay.toISOString().split('T')[0]
                    };
                    setDateRange(newDateRange);
                    setFilterLoading(true);
                    setTimeout(async () => {
                      await fetchStockMovementData();
                      setFilterLoading(false);
                    }, 0);
                  }}
                  disabled={filterLoading}
                  className="text-xs"
                >
                  Current Month
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportWarehouseData()}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-medium text-gray-700 min-w-[130px] px-2 py-1">Warehouse</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[80px] px-2 py-1">Opening Stock</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[80px] px-2 py-1">Purchases</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Purchase Returns</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[80px] px-2 py-1">Sales</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Sales Returns</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Wastages</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Transfer IN</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Transfer OUT</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Manufacturing</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Consumption</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[90px] px-2 py-1">Stock Variance</TableHead>
                    <TableHead className="font-medium text-gray-700 text-center min-w-[100px] px-2 py-1">Closing Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouseData.length > 0 ? (
                    <>
                      {warehouseData.map((row, index) => {
                        const movements = getWarehouseMovements(row.warehouseCode);
                        const closingStock = 
                          row.openingStock
                          + movements.purchases
                          + movements.transfer_in
                          + movements.manufacturing
                          + movements.sales_returns
                          - Math.abs(movements.sales)
                          - Math.abs(movements.purchase_returns)
                          - Math.abs(movements.transfer_out)
                          - Math.abs(movements.wastages)
                          - Math.abs(movements.consumption);

                        // Handle duplicate warehouses by finding the one with variance or the first one
                        let finalVariance = 0;
                        let finalHasVariance = false;
                        
                        // Use date range variance for consistency (same as total row)
                        const dateRangeVariance = stockVarianceData.find(
                          v => v.warehouse_code === row.warehouseCode && !v.is_total
                        );
                        
                        if (dateRangeVariance) {
                          finalVariance = dateRangeVariance.stock_variance || 0;
                          finalHasVariance = dateRangeVariance.has_variance || false;
                        }
                        
                        const stockVariance = finalVariance;
                        const closingStockWithVariance = closingStock + stockVariance;
                        const hasVariance = finalHasVariance;

                        // Comprehensive calculation debugging
                        console.log(`Calculation Debug for ${row.warehouseCode}:`, {
                          openingStock: row.openingStock,
                          movements: {
                            purchases: movements.purchases,
                            transfer_in: movements.transfer_in,
                            manufacturing: movements.manufacturing,
                            sales_returns: movements.sales_returns,
                            sales: movements.sales,
                            purchase_returns: movements.purchase_returns,
                            transfer_out: movements.transfer_out,
                            wastages: movements.wastages,
                            consumption: movements.consumption
                          },
                          calculation: {
                            step1: row.openingStock + movements.purchases,
                            step2: row.openingStock + movements.purchases + movements.transfer_in,
                            step3: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing,
                            step4: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns,
                            step5: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales),
                            step6: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales) - Math.abs(movements.purchase_returns),
                            step7: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales) - Math.abs(movements.purchase_returns) - Math.abs(movements.transfer_out),
                            step8: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales) - Math.abs(movements.purchase_returns) - Math.abs(movements.transfer_out) - Math.abs(movements.wastages),
                            final: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales) - Math.abs(movements.purchase_returns) - Math.abs(movements.transfer_out) - Math.abs(movements.wastages) - Math.abs(movements.consumption)
                          },
                          closingStock: closingStock,
                          stockVariance: stockVariance,
                          closingStockWithVariance: closingStockWithVariance,
                          verification: {
                            expected: row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales) - Math.abs(movements.purchase_returns) - Math.abs(movements.transfer_out) - Math.abs(movements.wastages) - Math.abs(movements.consumption) + stockVariance,
                            actual: closingStockWithVariance,
                            isCorrect: (row.openingStock + movements.purchases + movements.transfer_in + movements.manufacturing + movements.sales_returns - Math.abs(movements.sales) - Math.abs(movements.purchase_returns) - Math.abs(movements.transfer_out) - Math.abs(movements.wastages) - Math.abs(movements.consumption) + stockVariance) === closingStockWithVariance
                          }
                        });

                        // Debug logging for stock variance
                        if (row.warehouseCode === 'MHOWH') { // Log for first warehouse or specific one
                          console.log('Stock Variance Debug for warehouse:', row.warehouseCode, {
                            stockVarianceData: stockVarianceData,
                            varianceBeforeDate: varianceBeforeDate,
                            warehouseVariance: dateRangeVariance,
                            cumulativeVariance: varianceBeforeDate.find(v => v.warehouse_code === row.warehouseCode),
                            finalVariance: finalVariance,
                            finalHasVariance: finalHasVariance,
                            stockVariance: stockVariance,
                            hasVariance: hasVariance,
                            warehouseCode: row.warehouseCode
                          });
                        }

                        // Additional debugging for all warehouses
                        console.log(`Warehouse ${row.warehouseCode}:`, {
                          warehouseCode: row.warehouseCode,
                          availableVarianceCodes: stockVarianceData.map(v => v.warehouse_code),
                          availableCumulativeCodes: varianceBeforeDate.map(v => v.warehouse_code),
                          foundVariance: dateRangeVariance,
                          cumulativeVariance: varianceBeforeDate.find(v => v.warehouse_code === row.warehouseCode),
                          stockVariance: stockVariance,
                          hasVariance: hasVariance
                        });

                        return (
                          <TableRow key={index} className="hover:bg-gray-50">
                            <TableCell className="font-medium px-2 py-1">
                              <div>
                                <div className="font-medium">{row.warehouse}</div>
                                {row.warehouseCode && (
                                  <div className="text-xs text-gray-500">{row.warehouseCode}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-blue-600 px-2 py-1">
                              {/* Opening stock includes variance adjustments from calculateDynamicOpeningStock */}
                              {Number(row.openingStock).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center text-green-600 px-2 py-1">{Number(movements.purchases).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-orange-600 px-2 py-1">{Number(movements.purchase_returns).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-red-600 font-medium px-2 py-1">{Number(movements.sales).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-red-600 font-medium px-2 py-1">{Number(movements.sales_returns).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-red-500 px-2 py-1">{Number(movements.wastages).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-green-500 px-2 py-1">{Number(movements.transfer_in).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-red-500 px-2 py-1">{Number(movements.transfer_out).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-blue-500 px-2 py-1">{Number(movements.manufacturing).toFixed(2)}</TableCell>
                            <TableCell className="text-center text-blue-500 px-2 py-1">{Number(movements.consumption).toFixed(2)}</TableCell>
                            <TableCell className="text-center px-2 py-1">
                              {hasVariance ? (
                                <Badge 
                                  variant={stockVariance > 0 ? "destructive" : stockVariance < 0 ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {stockVariance > 0 ? '+' : ''}{Number(stockVariance).toFixed(2)}
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-medium text-blue-600 px-2 py-1">{Number(closingStockWithVariance).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-gray-50 border-t-2 border-gray-200">
                        <TableCell className="font-bold px-2 py-1">Total</TableCell>
                        <TableCell className="text-center font-bold text-blue-600 px-2 py-1">{totals.totalOpeningStock.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-green-600 px-2 py-1">{totals.totalPurchases.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-orange-600 px-2 py-1">{totals.totalPurchaseReturns.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-red-600 px-2 py-1">{totals.totalSales.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-red-600 px-2 py-1">{totals.totalSalesReturns.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-red-500 px-2 py-1">{totals.totalWastages.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-green-500 px-2 py-1">{totals.totalTransferIN.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-red-500 px-2 py-1">{totals.totalTransferOUT.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-blue-500 px-2 py-1">{totals.totalManufacturing.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold text-blue-500 px-2 py-1">{totals.totalConsumption.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold px-2 py-1">
                          {(() => {
                            // Calculate total variance from individual warehouse variances within date range
                            const totalIndividualVariance = stockVarianceData
                              .filter(v => !v.is_total)
                              .reduce((sum, v) => sum + v.stock_variance, 0);
                            
                            // Debug logging for total variance calculation
                            console.log('Total Variance Calculation:', {
                              stockVarianceData: stockVarianceData,
                              totalIndividualVariance: totalIndividualVariance
                            });
                            
                            return totalIndividualVariance !== 0 ? (
                              <Badge 
                                variant={totalIndividualVariance > 0 ? "destructive" : "default"}
                                className="text-xs"
                              >
                                {totalIndividualVariance > 0 ? '+' : ''}{Number(totalIndividualVariance).toFixed(2)}
                              </Badge>
                            ) : (
                              '-'
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center font-bold text-blue-600 px-2 py-1">
                          {(() => {
                            // Calculate total variance from individual warehouse variances within date range
                            const totalIndividualVariance = stockVarianceData
                              .filter(v => !v.is_total)
                              .reduce((sum, v) => sum + v.stock_variance, 0);
                            
                            // Calculate expected total closing stock
                            const expectedTotalClosingStock = totals.totalOpeningStock + 
                              totals.totalPurchases + 
                              totals.totalTransferIN + 
                              totals.totalManufacturing + 
                              totals.totalSalesReturns - 
                              totals.totalSales - 
                              totals.totalPurchaseReturns - 
                              totals.totalTransferOUT - 
                              totals.totalWastages - 
                              totals.totalConsumption + 
                              totalIndividualVariance;
                            
                            // Debug total calculation
                            console.log('Total Calculation Verification:', {
                              totals: {
                                openingStock: totals.totalOpeningStock,
                                purchases: totals.totalPurchases,
                                transferIN: totals.totalTransferIN,
                                manufacturing: totals.totalManufacturing,
                                salesReturns: totals.totalSalesReturns,
                                sales: totals.totalSales,
                                purchaseReturns: totals.totalPurchaseReturns,
                                transferOUT: totals.totalTransferOUT,
                                wastages: totals.totalWastages,
                                consumption: totals.totalConsumption
                              },
                              variance: totalIndividualVariance,
                              calculation: {
                                step1: totals.totalOpeningStock + totals.totalPurchases,
                                step2: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN,
                                step3: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing,
                                step4: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing + totals.totalSalesReturns,
                                step5: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing + totals.totalSalesReturns - totals.totalSales,
                                step6: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing + totals.totalSalesReturns - totals.totalSales - totals.totalPurchaseReturns,
                                step7: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing + totals.totalSalesReturns - totals.totalSales - totals.totalPurchaseReturns - totals.totalTransferOUT,
                                step8: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing + totals.totalSalesReturns - totals.totalSales - totals.totalPurchaseReturns - totals.totalTransferOUT - totals.totalWastages,
                                step9: totals.totalOpeningStock + totals.totalPurchases + totals.totalTransferIN + totals.totalManufacturing + totals.totalSalesReturns - totals.totalSales - totals.totalPurchaseReturns - totals.totalTransferOUT - totals.totalWastages - totals.totalConsumption,
                                final: expectedTotalClosingStock
                              },
                              verification: {
                                expected: expectedTotalClosingStock,
                                actual: totals.totalClosingStock + totalIndividualVariance,
                                isCorrect: expectedTotalClosingStock === (totals.totalClosingStock + totalIndividualVariance)
                              }
                            });
                            
                            return Number(totals.totalClosingStock + totalIndividualVariance).toFixed(2);
                          })()}
                        </TableCell>
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                        No warehouse data available for this SKU
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-center space-x-8 mb-4">
            <a href="#" className="text-blue-600 hover:text-blue-800 text-sm">
              Privacy Policy
            </a>
            <a href="#" className="text-blue-600 hover:text-blue-800 text-sm">
              Terms of Service
            </a>
            <a href="#" className="text-blue-600 hover:text-blue-800 text-sm">
              Contact Us
            </a>
          </div>
          <div className="text-center text-gray-500 text-sm">©2024 FreshBasket. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
