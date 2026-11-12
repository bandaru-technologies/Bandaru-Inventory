import { API_BASE_URL } from '../config'

export type MerchantStatus = 'ACTIVE' | 'PENDING_REVIEW' | 'INACTIVE' | 'SUSPENDED'

export interface Merchant {
  id: number
  tenantId: string
  merchantName: string
  businessType: string | null
  totalProducts: number
  category: string | null
  monthlyVolume: number
  status: MerchantStatus
  createdAt: string
  updatedAt: string
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface MerchantSearchParams {
  query?: string
  status?: MerchantStatus
  category?: string
  page?: number
  size?: number
}

export interface MerchantCreateInput {
  merchantName: string
  businessType?: string
  totalProducts?: number
  category?: string
  monthlyVolume?: number
  status?: MerchantStatus
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? `Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchMerchants(params: MerchantSearchParams): Promise<Page<Merchant>> {
  const searchParams = new URLSearchParams()
  if (params.query) searchParams.set('query', params.query)
  if (params.status) searchParams.set('status', params.status)
  if (params.category) searchParams.set('category', params.category)
  searchParams.set('page', String(params.page ?? 0))
  searchParams.set('size', String(params.size ?? 4))

  const response = await fetch(`${API_BASE_URL}/merchants?${searchParams.toString()}`)
  return handleResponse<Page<Merchant>>(response)
}

export async function createMerchant(input: MerchantCreateInput): Promise<Merchant> {
  const response = await fetch(`${API_BASE_URL}/merchants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handleResponse<Merchant>(response)
}
