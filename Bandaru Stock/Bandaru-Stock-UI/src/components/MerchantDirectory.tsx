import { useEffect, useMemo, useState } from 'react'
import {
  fetchMerchants,
  createMerchant,
  type Merchant,
  type MerchantStatus,
} from '../api/merchants'
import './MerchantDirectory.css'

const PAGE_SIZE = 4

const STATUS_LABELS: Record<MerchantStatus, string> = {
  ACTIVE: 'Active',
  PENDING_REVIEW: 'Pending Review',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
}

const STATUS_OPTIONS: MerchantStatus[] = ['ACTIVE', 'PENDING_REVIEW', 'INACTIVE', 'SUSPENDED']

type DirectoryTab = 'overview' | 'inventory' | 'merchants' | 'transfers' | 'analytics'

const TAB_LABELS: Record<DirectoryTab, string> = {
  overview: 'Overview',
  inventory: 'Inventory Logs',
  merchants: 'Merchants',
  transfers: 'Transfers',
  analytics: 'Analytics',
}


function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
}

function statusClassName(status: MerchantStatus): string {
  return `status-badge status-${status.toLowerCase()}`
}

function MerchantDirectory() {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('merchants')
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MerchantStatus | ''>('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const categories = useMemo(
    () => Array.from(new Set(merchants.map((m) => m.category).filter(Boolean))) as string[],
    [merchants],
  )

  const loadMerchants = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchMerchants({
        query: query || undefined,
        status: status || undefined,
        category: category || undefined,
        page,
        size: PAGE_SIZE,
      })
      setMerchants(result.content)
      setTotalElements(result.totalElements)
      setTotalPages(result.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load merchants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMerchants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, category])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
    loadMerchants()
  }

  const handleAddMerchant = async (formData: {
    merchantName: string
    businessType: string
    category: string
  }) => {
    await createMerchant({
      merchantName: formData.merchantName,
      businessType: formData.businessType || undefined,
      category: formData.category || undefined,
    })
    setShowAddForm(false)
    setPage(0)
    loadMerchants()
  }

  const rangeStart = totalElements === 0 ? 0 : page * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE + PAGE_SIZE, totalElements)

  return (
    <div className="merchant-page">
      <header className="merchant-header">
        <div className="merchant-brand">Bandaru Stock</div>
        <input className="merchant-global-search" placeholder="Global search..." />
      </header>

      <main className="merchant-main">
        <h1 className="merchant-title">Merchant Directory</h1>

        <nav className="merchant-tabs">
          <span
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </span>
          <span
            className={activeTab === 'inventory' ? 'active' : ''}
            onClick={() => setActiveTab('inventory')}
          >
            Inventory Logs
          </span>
          <span
            className={activeTab === 'merchants' ? 'active' : ''}
            onClick={() => setActiveTab('merchants')}
          >
            Merchants
          </span>
          <span
            className={activeTab === 'transfers' ? 'active' : ''}
            onClick={() => setActiveTab('transfers')}
          >
            Transfers
          </span>
          <span
            className={activeTab === 'analytics' ? 'active' : ''}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </span>
        </nav>

        {activeTab !== 'merchants' && (
          <p className="merchant-tab-placeholder">
            {TAB_LABELS[activeTab]} view is coming soon.
          </p>
        )}

        {activeTab === 'merchants' && (
          <>
        <form className="merchant-toolbar" onSubmit={handleSearchSubmit}>
          <input
            className="merchant-search-input"
            placeholder="Search by merchant name, ID, or category..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="merchant-filter-select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MerchantStatus | '')
              setPage(0)
            }}
          >
            <option value="">Status</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
          <select
            className="merchant-filter-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="merchant-add-btn"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            + Add Merchant
          </button>
        </form>

        {showAddForm && (
          <AddMerchantForm onCancel={() => setShowAddForm(false)} onSubmit={handleAddMerchant} />
        )}

        {error && <p className="merchant-error">{error}</p>}

        <div className="merchant-table-wrap">
          <table className="merchant-table">
            <thead>
              <tr>
                <th>Merchant Name</th>
                <th>ID</th>
                <th className="align-right">Total Products</th>
                <th>Category</th>
                <th className="align-right">Monthly Volume</th>
                <th>Status</th>
                <th className="align-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="merchant-empty">
                    Loading merchants...
                  </td>
                </tr>
              )}
              {!loading && merchants.length === 0 && (
                <tr>
                  <td colSpan={7} className="merchant-empty">
                    No merchants found.
                  </td>
                </tr>
              )}
              {!loading &&
                merchants.map((merchant) => (
                  <tr key={merchant.id}>
                    <td>
                      <div className="merchant-name-cell">
                        <span className="merchant-avatar">{initials(merchant.merchantName)}</span>
                        <div>
                          <div className="merchant-name">{merchant.merchantName}</div>
                          <div className="merchant-subtitle">{merchant.businessType}</div>
                        </div>
                      </div>
                    </td>
                    <td>{merchant.tenantId.replace(/\D/g, '') || merchant.id}</td>
                    <td className="align-right">{merchant.totalProducts.toLocaleString()}</td>
                    <td>{merchant.category}</td>
                    <td className="align-right">{formatCurrency(merchant.monthlyVolume)}</td>
                    <td>
                      <span className={statusClassName(merchant.status)}>
                        {STATUS_LABELS[merchant.status]}
                      </span>
                    </td>
                    <td className="align-right">···</td>
                  </tr>
                ))}
            </tbody>
          </table>

          <div className="merchant-pagination">
            <span className="merchant-pagination-info">
              Showing {rangeStart} to {rangeEnd} of {totalElements} entries
            </span>
            <div className="merchant-pagination-controls">
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i)
                .slice(0, 3)
                .map((p) => (
                  <button
                    key={p}
                    className={p === page ? 'active' : ''}
                    onClick={() => setPage(p)}
                  >
                    {p + 1}
                  </button>
                ))}
              {totalPages > 3 && <span className="merchant-pagination-ellipsis">...</span>}
              {totalPages > 3 && (
                <button
                  className={totalPages - 1 === page ? 'active' : ''}
                  onClick={() => setPage(totalPages - 1)}
                >
                  {totalPages}
                </button>
              )}
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                ›
              </button>
            </div>
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  )
}

interface AddMerchantFormProps {
  onCancel: () => void
  onSubmit: (data: { merchantName: string; businessType: string; category: string }) => void
}

function AddMerchantForm({ onCancel, onSubmit }: AddMerchantFormProps) {
  const [merchantName, setMerchantName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [category, setCategory] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!merchantName.trim()) return
    onSubmit({ merchantName, businessType, category })
  }

  return (
    <form className="add-merchant-form" onSubmit={handleSubmit}>
      <input
        placeholder="Merchant name"
        value={merchantName}
        onChange={(e) => setMerchantName(e.target.value)}
        required
      />
      <input
        placeholder="Business type"
        value={businessType}
        onChange={(e) => setBusinessType(e.target.value)}
      />
      <input
        placeholder="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      />
      <button type="submit" className="merchant-add-btn">
        Save
      </button>
      <button type="button" className="merchant-cancel-btn" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

export default MerchantDirectory
