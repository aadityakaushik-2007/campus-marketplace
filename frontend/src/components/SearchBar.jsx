import { useEffect, useState } from 'react'
import LoadingSpinner from './LoadingSpinner'
import './SearchBar.css'

export default function SearchBar({ onSearch, loading, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  useEffect(() => setQuery(initialQuery), [initialQuery])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch(query)
  }

  return (
    <form className='search-group' onSubmit={handleSubmit}>
      <div className="search-input-wrapper">
        <input
         type="text"
         className="search-input"
          aria-label="Search listings"
          placeholder="Search Listings..."
          value={query || ""}
          onChange={(e) => setQuery(e.target.value)}
        />
        <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M10 2a8 8 0 015.293 13.707l5 5a1 1 0 01-1.414 1.414l-5-5A8 8 0 1110 2zm0 2a6 6 0 100 12A6 6 0 0010 4z" />
        </svg>
      </div>
      <button type="submit" className="search-btn">
        {loading && <LoadingSpinner />}
        Search
      </button>
    </form>
  )
}
