// API Client for FreshBasket Backend
const API_BASE_URL = typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  total?: number;
  page?: number;
  limit?: number;
}

export interface InventoryItem {
  id?: number;
  odoo_id: number;
  name: string;
  barcode?: string;
  uom_name: string;
  standard_price: number;
  reordering_min_qty: number;
  reordering_max_qty: number;
  list_price: number;
  active?: boolean;
  type?: string;
  created_at?: string;
  updated_at?: string;
  category?: {
    id: number;
    display_name: string;
    name: string;
    active: boolean;
  };
  warehouse_inventory?: Array<{
    warehouse: {
      id: number;
      name: string;
      code: string;
      active: boolean;
    };
    quantity: number;
    stock_quantity: number;
  }>;
}

export interface StockMovement {
  id: number;
  movement_type: string;
  quantity: number;
  created_at: string;
  warehouse?: {
    id?: number;
    name: string;
    code: string;
  };
  warehouse_dest?: {
    id?: number;
    name: string;
    code: string;
  };
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

export interface StockCounts {
  lowStockCount: number;
  outOfStockCount: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    // Try to get token from localStorage on client side
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as any)['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        ...options,
        headers,
      });

      let data: any = null;
      try {
        data = await response.clone().json();
      } catch {
        try {
          const text = await response.text();
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
      }

      if (!response.ok) {
        const message = (data && (data.error || data.message)) || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(message);
      }

      return (data as ApiResponse<T>) || { success: true } as any;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Authentication methods
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data) {
      this.token = response.data.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', response.data.token);
      }
      return response.data;
    }

    throw new Error(response.error || 'Login failed');
  }

  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Registration failed');
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  async getCurrentUser(): Promise<{ id: string; email: string; role: string }> {
    const response = await this.request<any>('/auth/me');
    if (response.success && response.data) {
      // Support both { data: { user: {...} } } and { data: {...} }
      const user = response.data.user || response.data;
      if (user && user.id && user.email) return user;
    }
    throw new Error(response.error || 'Failed to get current user');
  }

  // Inventory methods
  async getInventory(): Promise<{ data: InventoryItem[]; total: number }> {
    const response = await this.request<InventoryItem[]>('/inventory');
    
    if (response.success && response.data) {
      return {
        data: response.data || [],
        total: response.total || 0
      };
    }
    throw new Error(response.error || 'Failed to fetch inventory');
  }

  async getInventoryWithFilters(queryParams: string): Promise<{ data: InventoryItem[]; total: number }> {
    const response = await this.request<InventoryItem[]>(`/inventory?${queryParams}`) ;
    
    if (response.success && response.data) {
      return {
        data: response.data || [],
        total: response.total || 0
      };
    }
    throw new Error(response.error || 'Failed to fetch inventory');
  }

  async searchInventory(query: string, page = 1, limit = 30): Promise<{ data: InventoryItem[]; total: number }> {
    const response = await this.request<{ data: InventoryItem[]; total: number }>(
      `/inventory/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    if (response.success && response.data) {
      // The response structure is { success: true, data: Array, total: number }
      // But we need to return { data: Array, total: number }
      return {
        data: response.data.data || [],
        total: response.data.total || 0
      };
    }
    throw new Error(response.error || 'Failed to search inventory');
  }

  async getStockCounts(): Promise<StockCounts> {
    const response = await this.request<StockCounts>('/inventory/stock-counts');
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || 'Failed to get stock counts');
  }

  async getStockMovementDetails(productId: string, month: number, year: number): Promise<{ data: StockMovement[] }> {
    const response = await this.request<StockMovement[]>(
      `/inventory/stock-movements/${productId}?month=${month}&year=${year}`
    );
    if (response.success && response.data) {
      return { data: response.data };
    }
    throw new Error(response.error || 'Failed to get stock movement details');
  }

  async getStockMovementDetailsByDateRange(productId: string, startDate: string, endDate: string): Promise<{ success: boolean; data: StockMovement[]; opening_stocks?: Record<string, number> }> {
    const response = await this.request<StockMovement[]>(
      `/inventory/stock-movements/date-range/${productId}?start_date=${startDate}&end_date=${endDate}`
    );
    if (response.success && response.data) {
      return { 
        success: true, 
        data: response.data || [], 
        opening_stocks: (response as any).opening_stocks 
      };
    }
    throw new Error(response.error || 'Failed to get stock movement details');
  }

  async getAllStockMovements(productId: string): Promise<{ success: boolean; data: StockMovement[] }> {
    const response = await this.request<StockMovement[]>(
      `/inventory/stock-movements/all/${productId}`
    );
    if (response.success && response.data) {
      return { 
        success: true, 
        data: response.data || []
      };
    }
    throw new Error(response.error || 'Failed to get all stock movements');
  }

  async getAllStockMovementsBeforeDate(productId: string, beforeDate: string): Promise<{ success: boolean; data: StockMovement[] }> {
    const response = await this.request<StockMovement[]>(
      `/inventory/stock-movements/before-date/${productId}?before_date=${beforeDate}`
    );
    if (response.success && response.data) {
      return { 
        success: true, 
        data: response.data || []
      };
    }
    throw new Error(response.error || 'Failed to get stock movements before date');
  }

  // Sync methods
  async syncPurchases(): Promise<{ success: boolean; count: number }> {
    const response = await this.request<{ success: boolean; count: number }>('/sync/purchases', {
      method: 'POST',
    });
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || 'Failed to sync purchases');
  }

  async syncSales(): Promise<{ success: boolean; count: number }> {
    const response = await this.request<{ success: boolean; count: number }>('/sync/sales', {
      method: 'POST',
    });
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || 'Failed to sync sales');
  }

  async syncProducts(): Promise<{ success: boolean; count: number }> {
    const response = await this.request<{ success: boolean; count: number }>('/sync/products', {
      method: 'POST',
    });
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || 'Failed to sync products');
  }

  async syncAll(since?: string): Promise<{ success: boolean; count: number }> {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    const response = await this.request<{ success: boolean; count: number }>(`/sync/all${qs}`, {
      method: 'POST',
    });
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || 'Failed to sync all data');
  }

  // Stock Variance methods
  async uploadStockVariance(variances: any[]): Promise<{ success_count: number; error_count: number; errors: any[] }> {
    const response = await this.request<{ success_count: number; error_count: number; errors: any[] }>('/stock-corrections/upload', {
      method: 'POST',
      body: JSON.stringify({ variances }),
    });
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || 'Failed to upload stock variances');
  }

  // Utility methods
  setToken(token: string): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
