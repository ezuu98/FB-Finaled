import { supabase } from "@/lib/supabase-client"
import type { InventoryWithDetails, StockMovementDetailsResponse } from "@/lib/supabase"
import { all } from "axios"

export type { StockMovementDetailsResponse } from "@/lib/supabase"

export class InventoryAPI {
  static async getInventoryWithWarehouses(): Promise<{
    data: InventoryWithDetails[]
    total: number
  }> {
    try {
      const batchSize = 1000
      let allMergedData: InventoryWithDetails[] = []

      const { count, error: countError } = await supabase
        .from("inventory")
        .select("odoo_id", { count: "exact", head: true })
        .eq("active", true)
        .eq("type", "product")

      if (countError) throw countError
      const total = typeof count === "number" ? count : 0

      for (let from = 0; from < total; from += batchSize) {
        const to = from + batchSize - 1

        const { data: inventoryBatch, error: inventoryError } = await supabase
          .from("inventory")
          .select(`
          odoo_id, name, barcode, uom_name, standard_price, reordering_min_qty, reordering_max_qty, list_price,
          category:categories(display_name, active, name)
        `)
          .eq("active", true)
          .eq("type", "product")
          .order("name", { ascending: true })
          .range(from, to)

        if (inventoryError) throw inventoryError

        const odooIds = (inventoryBatch || []).map(item => item.odoo_id)

        const { data: warehouseInventory, error: whError } = await supabase
          .from("warehouse_inventory")
          .select(`
          product_id,
          quantity,
          warehouse:warehouses!warehouse_inventory_warehouse_id_fkey(id, name, code)
        `)
          .in("product_id", odooIds)

        if (whError) throw whError

        const { data: stockMovements, error: stockError } = await supabase
          .from("stock_movements")
          .select(`product_id, movement_type, quantity, warehouse_id, warehouse_dest_id`)
          .in("product_id", odooIds)

        if (stockError) throw stockError
        

        const stockMap = new Map<number, Map<number, number>>()

        for (const move of stockMovements || []) {
          const { product_id, movement_type, quantity, warehouse_id, warehouse_dest_id } = move
          if (!product_id || !quantity) continue

          const updateWarehouseStock = (productId: number, warehouseId: number, qtyDelta: number) => {
            if (!stockMap.has(productId)) stockMap.set(productId, new Map())
            const warehouseMap = stockMap.get(productId)!
            warehouseMap.set(warehouseId, (warehouseMap.get(warehouseId) || 0) + qtyDelta)
          }

          if (movement_type === "purchase") {
            if (warehouse_dest_id) updateWarehouseStock(product_id, warehouse_dest_id, quantity)
          } else if (movement_type === "purchase_return") {
            if (warehouse_id) updateWarehouseStock(product_id, warehouse_id, -quantity)
          } else if (movement_type === "sales") {
            if (warehouse_id) updateWarehouseStock(product_id, warehouse_id, -quantity)
          } else if (movement_type === "sales_returns") {
            if (warehouse_id) updateWarehouseStock(product_id, warehouse_id, Math.abs(quantity))
          } else if (movement_type === "transfer_in") {
            if (warehouse_dest_id) updateWarehouseStock(product_id, warehouse_dest_id, quantity)
            if (warehouse_id) updateWarehouseStock(product_id, warehouse_id, -quantity)
          } else if (movement_type === "manufacturing") {
            if (warehouse_id) updateWarehouseStock(product_id, warehouse_id, quantity)
          } else if (movement_type === "wastages") {
            if (warehouse_id) updateWarehouseStock(product_id, warehouse_id, -quantity)
          }
        }

        const mergedBatch: InventoryWithDetails[] = (inventoryBatch || []).map(item => {
          const mergedInventory = (warehouseInventory?.filter(wi => wi.product_id === item.odoo_id) || []).map(wi => {
            const warehouseObj = Array.isArray(wi.warehouse) ? wi.warehouse[0] : wi.warehouse;
            const openingStock = wi.quantity || 0;
            const movementStock = stockMap.get(item.odoo_id)?.get(warehouseObj.id) || 0;
            const calculatedStock = openingStock + movementStock;
            
            return {
              ...wi,
              warehouse: warehouseObj,
              stock_quantity: calculatedStock,
            }
          })
          
          return {
            ...item,
            warehouse_inventory: mergedInventory,
          }
        })
        allMergedData = allMergedData.concat(mergedBatch)
      }
      
      return {
        data: allMergedData,
        total,
      }
    } catch (error) {
      console.error("Error in getInventoryWithWarehouses:", error)
      throw error
    }
  }

  static async lowStockCount(): Promise<{
    lowStockCount: number
    outOfStockCount: number
  }> {
    try {
      const { data: inventoryData, total } = await this.getInventoryWithWarehouses()
      
      let lowStockCount = 0
      let outOfStockCount = 0

      inventoryData.forEach(item => {
        const totalStock = item.warehouse_inventory?.reduce((sum, wh) => {
          const stockQuantity = (wh as any).stock_quantity !== undefined ? (wh as any).stock_quantity : wh.quantity || 0
          return sum + stockQuantity
        }, 0) || 0

        if (totalStock === 0) {
          outOfStockCount++
        } else if (totalStock < item.reordering_min_qty) {
          lowStockCount++
        }
      })

      return {
        lowStockCount,
        outOfStockCount,
      }
    } catch (error) {
      console.error("Error in lowStockCount:", error)
      throw error
    }
  }
}

export class SearchInventory {
  static searchFromCache(
    allInventory: InventoryWithDetails[],
    query: string,
    page = 1,
    limit = 30
  ): {
    data: InventoryWithDetails[]
    total: number
  } {
    const lowerQuery = query.trim().toLowerCase()
    const filtered = allInventory.filter(item =>
      item.name.toLowerCase().startsWith(lowerQuery)
    )

    const total = filtered.length

    const from = (page - 1) * limit
    const to = from + limit

    return {
      data: filtered.slice(from, to),
      total
    }
  }
}

export class StockMovementService {
  static async getStockMovementDetails(
    product_id: string,
    month: number,
    year: number
  ): Promise<{ data: StockMovementDetailsResponse[] }> {
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`
      const endDate = new Date(year, month, 0).toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("stock_movements")
        .select(`
          quantity,
          movement_type,
          warehouse_id,
          warehouse_dest_id,
          warehouse_source:warehouses!warehouse_id(code),
          warehouse_dest:warehouses!warehouse_dest_id(code)
        `)
        .eq("product_id", product_id)
        .gte("date", startDate)
        .lte("date", endDate)

      if (error) throw error

     
      // Group data by warehouse code and movement type
      const warehouseMovements: Record<string, {
        purchase: number
        purchase_return: number
        sales: number
        sales_returns: number
        wastages: number
        transfer_in: number
        transfer_out: number
        manufacturing: number
      }> = {}

      // Initialize warehouse movement tracking
      const initializeWarehouse = (warehouseCode: string) => {
        if (!warehouseMovements[warehouseCode]) {
          warehouseMovements[warehouseCode] = {
            purchase: 0,
            purchase_return: 0,
            sales: 0,
            sales_returns: 0,
            wastages: 0,
            transfer_in: 0,
            transfer_out: 0,
            manufacturing: 0
          }
        }
      }

      const getWarehouseCode = (wh: any) => {
        if (!wh) return undefined;
        if (Array.isArray(wh)) return wh[0]?.code;
        return wh.code;
      }

      // Process each stock movement
      for (const movement of data || []) {
        const { quantity, movement_type, warehouse_id, warehouse_dest_id } = movement
        const sourceWarehouseCode = getWarehouseCode(movement.warehouse_source)
        const destWarehouseCode = getWarehouseCode(movement.warehouse_dest)

        switch (movement_type) {
          case "purchase":
            if (destWarehouseCode) {
              initializeWarehouse(destWarehouseCode)
              warehouseMovements[destWarehouseCode].purchase += quantity || 0
            }
            break

          case "purchase_return":
            // Purchase returns subtract from warehouse_id
            if (sourceWarehouseCode) {
              initializeWarehouse(sourceWarehouseCode)
              warehouseMovements[sourceWarehouseCode].purchase_return += quantity || 0
            }
            break

          case "sales":
            // Sales subtract from warehouse_id
            if (sourceWarehouseCode) {
              initializeWarehouse(sourceWarehouseCode)
              warehouseMovements[sourceWarehouseCode].sales -= quantity || 0
            }
            break

          case "sales_return":
            // Sales subtract from warehouse_id
            if (sourceWarehouseCode) {
              initializeWarehouse(sourceWarehouseCode)
              warehouseMovements[sourceWarehouseCode].sales_returns += quantity || 0
            }
            break


          case "transfer_in":
          case "transfer_out":
            if (sourceWarehouseCode && destWarehouseCode) {
              initializeWarehouse(destWarehouseCode)
              warehouseMovements[destWarehouseCode].transfer_in += quantity || 0

              initializeWarehouse(sourceWarehouseCode)
              warehouseMovements[sourceWarehouseCode].transfer_out -= quantity || 0
            }
            break

          case "manufacturing":
            // Manufacturing adds to warehouse_dest_id
            if (sourceWarehouseCode) {
              initializeWarehouse(sourceWarehouseCode)
              warehouseMovements[sourceWarehouseCode].manufacturing += quantity || 0
            }
            break

          case "wastages":
            if (sourceWarehouseCode) {
              initializeWarehouse(sourceWarehouseCode)
              warehouseMovements[sourceWarehouseCode].wastages -= quantity || 0
            }
            break

          default:
            console.warn(`Unknown movement type: ${movement_type}`)
        }
      }

      // Convert to response format
      const result: StockMovementDetailsResponse[] = Object.entries(warehouseMovements).map(
        ([warehouse_code, movements]) => ({
          warehouse_code,
          purchases: movements.purchase,
          purchase_returns: movements.purchase_return,
          sales: movements.sales,
          sales_returns: movements.sales_returns,
          wastages: movements.wastages,
          transfer_in: movements.transfer_in,
          transfer_out: movements.transfer_out,
          manufacturing: movements.manufacturing
        })
      )

      return { data: result }
    } catch (error) {
      console.error("Error in getStockMovementDetails:", error)
      throw error
    }
  }

  /**
   * Get stock variance for a specific product and date range
   */
  static async getStockVariance(
    productId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    success: boolean;
    data: Array<{
      warehouse_id: string;
      warehouse_code: string;
      warehouse_name: string;
      calculated_closing_stock: number;
      stock_variance: number;
      closing_stock: number;
      has_variance: boolean;
    }>;
  }> {
    try {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD');
      }

      const response = await fetch(
        `/api/stock-corrections/variance/${productId}?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Validate response structure
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error('Invalid response format from server');
      }

      return result;
    } catch (error) {
      console.error("Error in getStockVariance:", error);
      throw error;
    }
  }

  /**
   * Get stock variance with totals for a specific product and date range
   */
  static async getStockVarianceWithTotals(
    productId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    success: boolean;
    data: Array<{
      warehouse_id: string;
      warehouse_code: string;
      warehouse_name: string;
      calculated_closing_stock: number;
      stock_variance: number;
      closing_stock: number;
      has_variance: boolean;
      is_total: boolean;
    }>;
  }> {
    try {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD');
      }

      const response = await fetch(
        `/api/stock-corrections/variance-with-totals/${productId}?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Validate response structure
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error('Invalid response format from server');
      }

      return result;
    } catch (error) {
      console.error("Error in getStockVarianceWithTotals:", error);
      throw error;
    }
  }
}
