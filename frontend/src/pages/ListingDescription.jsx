import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { getListingById, createPurchaseRequest, createBorrowing, getErrorMessage, getCurrentUser } from '../api/api'
import LoadingSpinner from '../components/LoadingSpinner'
import './ListingDescription.css'
import { beginLogin } from '../auth/navigation'

export default function ListingDescription() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0()
  const [listing, setListing] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [dates, setDates] = useState(() => location.state?.requestDates || { start: '', end: '' })
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const resumedAction = useRef(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const listingData = await getListingById(id)
        setListing(listingData)

        // If they are logged in, fetch their DB ID so we can check ownership
        if (isAuthenticated) {
          const token = await getAccessTokenSilently()
          const dbUser = await getCurrentUser(token, user)
          setCurrentUser(dbUser)
        }
      } catch (err) {
        console.error("Failed to fetch data:", err)
        setLoadError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, isAuthenticated, getAccessTokenSilently, user])

  const handleBuyRequest = async () => {
    if (!isAuthenticated) return beginLogin(loginWithRedirect, { appState: { returnTo: `${location.pathname}${location.search}${location.hash}` } })
    if (!currentUser?.name?.trim() || !/^\d{10}$/.test(currentUser?.contact_info || '')) {
      navigate('/profile', { state: { returnTo: `${location.pathname}${location.search}${location.hash}`, message: 'Add your name and a valid 10-digit phone number before requesting an item.', continueAction: 'buy', requestDates: dates } })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const token = await getAccessTokenSilently()
      await createPurchaseRequest(listing.listing_id, token)
      setRequestSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
      if (err.response?.status === 409) getListingById(id).then(setListing).catch(() => {})
    } finally {
      setSubmitting(false)
    }
  }

  const handleBorrowRequest = async (e) => {
    e?.preventDefault()
    if (!dates.start || !dates.end || new Date(dates.end) <= new Date(dates.start)) {
      setError('Choose an end time after the start time.')
      return
    }
    if (!isAuthenticated) return beginLogin(loginWithRedirect, { appState: { returnTo: `${location.pathname}${location.search}${location.hash}` } })
    if (!currentUser?.name?.trim() || !/^\d{10}$/.test(currentUser?.contact_info || '')) {
      navigate('/profile', { state: { returnTo: `${location.pathname}${location.search}${location.hash}`, message: 'Add your name and a valid 10-digit phone number before requesting an item.', continueAction: 'borrow', requestDates: dates } })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const token = await getAccessTokenSilently()
      await createBorrowing({
        listing_id: listing.listing_id,
        start_time: new Date(dates.start).toISOString(),
        end_time: new Date(dates.end).toISOString(),
      }, token)
      setRequestSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
      if (err.response?.status === 409) getListingById(id).then(setListing).catch(() => {})
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const action = location.state?.continueAction
    if (!action || loading || !isAuthenticated || !currentUser || resumedAction.current) return
    resumedAction.current = true
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })
    if (action === 'buy') handleBuyRequest()
    if (action === 'borrow') handleBorrowRequest()
  }, [location.key, currentUser, listing, loading, isAuthenticated])

  if (loading) return <LoadingSpinner fullPage label="Loading listing..." />
  if (!listing) return <div className="description-error" role="alert"><p>{loadError || 'Listing not found.'}</p><Link to="/browse">Back to listings</Link></div>

  const isOwner = currentUser?.user_id === listing.owner_id
  const images = listing?.images || []
  // Availability windows are not returned by the deployed backend.
  const isBorrowed = false
  const borrowedUntil = null
  const localDateTimeMin = (() => { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16) })()

  return (
    <div className="description-window">
      <Link to="/browse" className="description-back">
        &larr; Back to listings
      </Link>

      <div className="description-content">
        
      {/* --- IMAGE GALLERY --- */}
      <div className="description-gallery">
        {images.length > 0 ? (
          <>
            <div className="main-image-container">
              {/* Fallback to img.image_url if your backend sends objects instead of strings */}
              <img 
                src={images[currentImageIndex]?.image_url || images[currentImageIndex]} 
                alt={`${listing.title} — photo ${currentImageIndex + 1}`} 
                className="main-image" 
              />
            </div>
            
            {/* Only show thumbnails if there is more than 1 image */}
            {images.length > 1 && (
              <div className="thumbnail-row">
                {images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img.image_url || img}
                    alt={`Show photo ${idx + 1}`}
                    className={`thumbnail ${idx === currentImageIndex ? 'active' : ''}`}
                    onClick={() => setCurrentImageIndex(idx)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Show photo ${idx + 1}`}
                    aria-pressed={idx === currentImageIndex}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCurrentImageIndex(idx) } }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="main-image-container no-image">
            <p>No Images Available</p>
          </div>
        )}
      </div>

        <div className="description-details">
          {isBorrowed && <p className="borrowed-notice" role="status">Currently borrowed · expected back {borrowedUntil.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>}
          {listing.status === 'SOLD' && (
          <div className="sold-badge">
            Sold Out
          </div>
        )}
          <span className="description-category">{listing.category_name}</span>
          <h1>{listing.title}</h1>
          <span className="description-price">
            {listing.type === 'BORROW' ? `₹${listing.price_per_day}/day` : `₹${listing.price}`}
          </span>
          <p className="description-text">{listing.description}</p>

          <div className="description-meta">
            <p>
              <strong>Listed by:</strong> <Link to={`/users/${listing.owner_id}`} className="owner-profile-link">{listing.owner_name || 'Campus member'}</Link>
            </p>
          </div>

          {error && <p className="description-error-msg">{error}</p>}
          
          {isOwner ? (
            <div className="description-owner-message">
              <p className="owner-message-text"> This is your listing</p>
              <Link className="description-edit-btn" to={`/listing/${listing.listing_id}/edit`}>
                Edit listing
              </Link>
            </div>
          ) : listing.status === 'SOLD' ? (
            <button 
              className="description-contact-btn" 
              disabled 
              style={{ opacity: 0.5, cursor: 'not-allowed', backgroundColor: '#555' }}
            >
              Item Sold
            </button>
          ) : requestSent ? (
            <p className="description-sent">Request sent ✓</p>
          ) : listing.type === 'SELL' ? (
            <button className="description-contact-btn" onClick={handleBuyRequest} disabled={submitting}>
              {submitting && <LoadingSpinner />}
              Request to buy
            </button>
          ) : (
            <form className="description-borrow-form" onSubmit={handleBorrowRequest}>
              <label>
                From
                <input
                  type="datetime-local"
                  required
                  value={dates.start}
                  min={localDateTimeMin}
                  onChange={(e) => setDates({ ...dates, start: e.target.value })}
                />
              </label>
              <label>
                To
                <input
                  type="datetime-local"
                  required
                  value={dates.end}
                  min={dates.start || localDateTimeMin}
                  onChange={(e) => setDates({ ...dates, end: e.target.value })}
                />
              </label>
              <button type="submit" className="description-contact-btn" disabled={submitting}>
                {submitting && <LoadingSpinner />}
                Request to borrow
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
