import { useCallback, useEffect, useRef, useState } from 'react'
import SearchBar from '../components/SearchBar'
import FilterSidebar from '../components/FilterSidebar'
import ListingCard from '../components/ListingCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { getListings } from '../api/api'
import { useSearchParams } from 'react-router-dom'
import './MainWindow.css'

export default function MainWindow() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState(() => searchParams.get('query') || '')
  const [filters, setFilters] = useState(() => ({
    categoryId: searchParams.get('categoryId') || '',
    type: searchParams.get('type') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
  }))
  const [sort, setSort] = useState(() => searchParams.get('sort') || 'newest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const requestVersion = useRef(0)

  const activeFilterCount = Number(Boolean(filters.categoryId)) + Number(Boolean(filters.type)) +
    Number(filters.minPrice !== '' || filters.maxPrice !== '')
  const closeFilters = useCallback(() => setFiltersOpen(false), [])

  const fetchListings = async (params) => {
    const version = ++requestVersion.current
    setLoading(true)
    setError(null)
    try {
      const data = await getListings(params)
      if (version !== requestVersion.current) return
      setListings(Array.isArray(data) ? data : [])
    } catch (err) {
      if (version !== requestVersion.current) return
      setError(err.response?.status === 401 ? 'Sign in to view marketplace listings.' : 'Could not load listings. Is the backend running?')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchListings({ query, ...filters, sort })
  }, [query, filters, sort])

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    ;['query', 'categoryId', 'type', 'minPrice', 'maxPrice', 'sort'].forEach((key) => params.delete(key))
    if (query.trim()) params.set('query', query.trim())
    Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, String(value)) })
    if (sort !== 'newest') params.set('sort', sort)
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true })
  }, [query, filters, sort, searchParams, setSearchParams])

  useEffect(() => {
    const nextQuery = searchParams.get('query') || ''
    const nextFilters = {
      categoryId: searchParams.get('categoryId') || '',
      type: searchParams.get('type') || '',
      minPrice: searchParams.get('minPrice') || '',
      maxPrice: searchParams.get('maxPrice') || '',
    }
    setQuery((current) => current === nextQuery ? current : nextQuery)
    setFilters((current) => JSON.stringify(current) === JSON.stringify(nextFilters) ? current : nextFilters)
    const nextSort = searchParams.get('sort') || 'newest'
    setSort((current) => current === nextSort ? current : nextSort)
  }, [searchParams])

  const clearFilter = (key) => {
    setFilters((current) => {
      if (key === 'price') return { ...current, minPrice: '', maxPrice: '' }
      return { ...current, [key]: '' }
    })
  }

  return (
    <div className="main-window">
      <FilterSidebar onApply={setFilters} loading={loading} initialFilters={filters} open={filtersOpen} onClose={closeFilters} />

      <div className="main-window-content">
        <h1>Browse listings</h1>
        <SearchBar onSearch={(value) => setQuery(value.trim())} loading={loading} initialQuery={query} />

        <div className="browse-mobile-controls">
          <button type="button" className="browse-filter-toggle" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10m-7 6h4" /></svg>
            Filters{activeFilterCount > 0 && <span className="browse-filter-count">{activeFilterCount}</span>}
          </button>
          <label className="browse-sort-control">Sort
            <select aria-label="Sort listings" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="newest">Newest</option>
              <option value="price_low">Price: low to high</option>
              <option value="price_high">Price: high to low</option>
            </select>
          </label>
        </div>

        {activeFilterCount > 0 && <div className="active-filter-chips" aria-label="Active filters">
          {filters.categoryId && <button type="button" onClick={() => clearFilter('categoryId')}>{({ '1': 'Books', '2': 'Electronics', '3': 'Stationery', '4': 'Furniture', '5': 'Clothing', '6': 'Other' })[filters.categoryId] || 'Category'} <span aria-hidden="true">×</span></button>}
          {filters.type && <button type="button" onClick={() => clearFilter('type')}>{filters.type === 'SELL' ? 'For sale' : 'For borrowing'} <span aria-hidden="true">×</span></button>}
          {(filters.minPrice !== '' || filters.maxPrice !== '') && <button type="button" onClick={() => clearFilter('price')}>Price range <span aria-hidden="true">×</span></button>}
          <button type="button" className="clear-all-filters" onClick={() => setFilters({ categoryId: '', type: '', minPrice: '', maxPrice: '' })}>Clear all</button>
        </div>}

        {!loading && !error && <p className="browse-results-count" aria-live="polite">{listings.length} {listings.length === 1 ? 'listing' : 'listings'}</p>}

        {loading && <div className="browse-loading"><LoadingSpinner label="Fetching listings..." /></div>}
        {error && <p className="main-window-error">{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <div className="main-window-empty"><strong>No listings found</strong><span>Try a different search or reset your filters.</span></div>
        )}

        <div className="listing-grid">
          {!loading &&
            listings?.map((listing) => (
              <ListingCard key={listing.listing_id} listing={listing} />
            ))}
        </div>
      </div>
    </div>
  )
}
