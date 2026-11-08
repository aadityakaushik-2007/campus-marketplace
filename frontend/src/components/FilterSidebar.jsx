import { useEffect, useRef, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'
import './FilterSidebar.css'

// ---------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------
const CATEGORIES = [
  { id: '1', name: 'Books' },
  { id: '2', name: 'Electronics' },
  { id: '3', name: 'Stationery'},
  { id: '4', name: 'Furniture' },
  { id: '5', name: 'Clothing' },
  { id: '6', name: 'Other'}
]

const MIN_PRICE = 0
const MAX_PRICE = 5000

const EMPTY_FILTERS = {
  category_id: '',
  type: '',
  minPrice: MIN_PRICE,
  maxPrice: MAX_PRICE,
}

export default function FilterSidebar({ onApply, loading, initialFilters = {}, open = false, onClose = () => {} }) {
  const fromProps = () => ({
    category_id: initialFilters.categoryId || '',
    type: initialFilters.type || '',
    minPrice: initialFilters.minPrice === '' || initialFilters.minPrice == null ? MIN_PRICE : Number(initialFilters.minPrice),
    maxPrice: initialFilters.maxPrice === '' || initialFilters.maxPrice == null ? MAX_PRICE : Number(initialFilters.maxPrice),
  })
  const [filters, setFilters] = useState(fromProps)
  const formRef = useRef(null)
  const previousFocus = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => setFilters(fromProps()), [initialFilters])

  useEffect(() => {
    if (!open) return undefined
    previousFocus.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => formRef.current?.querySelector('select')?.focus(), 0)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key !== 'Tab' || !formRef.current) return
      const controls = [...formRef.current.querySelectorAll('button:not(:disabled), select, input:not(:disabled)')]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus.current?.focus?.()
    }
  }, [open])

  const update = (field) => (e) => setFilters({ ...filters, [field]: e.target.value })

  const handleMinChange = (e) => {
    const value = Math.min(Number(e.target.value), filters.maxPrice)
    setFilters({ ...filters, minPrice: value })
  }
  const handleMaxChange = (e) => {
    const value = Math.max(Number(e.target.value), filters.minPrice)
    setFilters({ ...filters, maxPrice: value })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onApply({
      categoryId: filters.category_id,
      type: filters.type,
      minPrice: filters.minPrice === MIN_PRICE ? '' : filters.minPrice,
      maxPrice: filters.maxPrice === MAX_PRICE ? '' : filters.maxPrice,
    })
    if (open) onClose()
  }

  const handleReset = () => {
    setFilters(EMPTY_FILTERS)
    onApply({ categoryId: '', type: '', minPrice: '', maxPrice: '' })
    if (open) onClose()
  }

  return (
    <>
      {open && <button type="button" className="filter-backdrop" onClick={onClose} aria-label="Close filters" />}
      <form ref={formRef} className={`filter-sidebar${open ? ' mobile-open' : ''}`} onSubmit={handleSubmit} role={open ? 'dialog' : undefined} aria-modal={open ? 'true' : undefined} aria-label={open ? 'Listing filters' : undefined}>
      <div className="filter-heading-row"><h2>Filters</h2><button type="button" className="filter-close-btn" onClick={onClose} aria-label="Close filters">×</button></div>

      <label className="filter-field">
        Category
        <select value={filters.category_id} onChange={update('category_id')}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        Listing type
        <select value={filters.type} onChange={update('type')}>
          <option value="">Sell + Borrow</option>
          <option value="SELL">For sale</option>
          <option value="BORROW">For borrowing</option>
        </select>
      </label>

      <div className="filter-field">
        Price range
        <span className="filter-price-values">
          ₹{filters.minPrice} – ₹{filters.maxPrice}
        </span>
        <div className="price-slider">
          <input
            type="range"
            min={MIN_PRICE}
            max={MAX_PRICE}
            value={filters.minPrice}
            onChange={handleMinChange}
          />
          <input
            type="range"
            min={MIN_PRICE}
            max={MAX_PRICE}
            value={filters.maxPrice}
            onChange={handleMaxChange}
          />
        </div>
      </div>

      <button type="submit" className="filter-apply-btn" disabled={loading}>
        {loading && <LoadingSpinner />}
        Apply filters
      </button>
      <button type="button" className="filter-reset-btn" onClick={handleReset} disabled={loading}>
        Reset
      </button>
      </form>
    </>
  )
}
