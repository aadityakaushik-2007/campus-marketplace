import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getListings } from '../api/api'
import ListingCard from '../components/ListingCard'
import LoadingSpinner from '../components/LoadingSpinner'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()
  const [latestListings, setLatestListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const data = await getListings({})
        const listingsArray = Array.isArray(data) ? data : []
        setLatestListings(listingsArray.slice(0, 8))
      } catch (err) {
        console.error("Failed to load latest listings:", err)
        setError(err.response?.status === 401 ? 'Sign in to view marketplace listings.' : 'Could not load listings right now.')
      } finally {
        setLoading(false)
      }
    }
    fetchLatest()
  }, [])

  // Smooth scroll function for the indicator
  const scrollToListings = () => {
    const showcase = document.getElementById('showcase')
    if (showcase) {
      showcase.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="home-page">
      {/* CREATIVE TOUCH: Ambient background glows */}
      <div className="ambient-glow blob-1"></div>
      <div className="ambient-glow blob-2"></div>

      {/* 1. FULLSCREEN HERO SECTION */}
      <section className="hero-fullscreen">
        <div className="hero-content">
          <h1 className="hero-title">
            Your Campus.<br />
            <span className="hero-title-highlight">Your Marketplace.</span>
          </h1>
          <p className="hero-subtitle">
            Buy, sell, and borrow items safely within the Thapar community. 
            No shady meetups, just students helping students.
          </p>
        </div>

        {/* Bouncing Scroll Indicator */}
        <div className="scroll-indicator" onClick={scrollToListings}>
          <span className="scroll-text">Scroll to explore</span>
          <div className="scroll-arrow">↓</div>
        </div>
      </section>

      {/* 2. GLASSMORPHIC LISTINGS SECTION */}
      <section className="listings-showcase" id="showcase">
        <div className="showcase-glass-header">
          <h2>Fresh on Campus</h2>
          <button className="view-all-link" onClick={() => navigate('/browse')}>
            View all listings &rarr;
          </button>
        </div>

        <div className="showcase-content">
          {loading ? (
            <LoadingSpinner label="Loading latest drops..." />
          ) : error ? (
            <p className="empty-state">{error}</p>
          ) : latestListings.length > 0 ? (
            <div className="listing-grid">
              {latestListings.map((listing) => (
                <ListingCard key={listing.listing_id} listing={listing} />
              ))}
            </div>
          ) : (
            <p className="empty-state">No listings available yet. Be the first to post!</p>
          )}
        </div>
      </section>
    </div>
  )
}
