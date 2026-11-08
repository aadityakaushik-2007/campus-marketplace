import { useEffect, useState } from 'react'
import { useAuth0, withAuthenticationRequired } from '@auth0/auth0-react'
import { getCurrentUser, updateCurrentUser, getMyListings, getIncomingRequests, getOutgoingRequests, decidePurchaseRequest, decideBorrowing, deleteListing, getMyTransactions, completeTransaction, createTransactionReview, createBorrowingReview, activateBorrowing, updateBorrowingStatus } from '../api/api'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import './ProfileWindow.css'

function InlineReviewForm({ onSubmit, disabled }) {
  const [rating, setRating] = useState('5')
  const [comment, setComment] = useState('')
  return <form className="inline-review-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ rating: Number(rating), comment }) }}>
    <label>Rating <select value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
    <label>Comment <input maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="How did it go? (optional)" /></label>
    <button type="submit" disabled={disabled}>Leave review</button>
  </form>
}

function ProfileWindow() {
  const [profile, setProfile] = useState(null)
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [processingId, setProcessingId] = useState('')
  const [reviewingId, setReviewingId] = useState('')
  const [reviewedIds, setReviewedIds] = useState(() => new Set())
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', contact_info: '' })
  const [saving, setSaving] = useState(false)
  const { user: auth0user } = useAuth0()
  const { user: auth0User, getAccessTokenSilently } = useAuth0()
  const navigate = useNavigate();
  const location = useLocation()
  const [feedback, setFeedback] = useState(location.state?.message || '')

  const loadProfile = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const token = await getAccessTokenSilently()
      const [user, listings, incoming, outgoing, transactionRows] = await Promise.all([
        getCurrentUser(token, auth0User),
        getMyListings(token),
        getIncomingRequests(token),
        getOutgoingRequests(token),
        getMyTransactions(token),
      ])

      if (!user) throw new Error('Your marketplace profile could not be found. Please sign in again.')
      setProfile({ ...user, listings })
      setForm({ name: user.name || '', contact_info: user.contact_info || '' })
      setIncomingRequests(incoming || [])
      setOutgoingRequests(outgoing || [])
      setTransactions(transactionRows || [])
    } catch (error) {
     console.error("Failed to load profile:", error)
     setLoadError(error.response?.data?.error || error.message || 'Could not load your profile. Please try again.')
    } finally {
     setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setFeedback('')
    if (form.contact_info && !/^\d{10}$/.test(form.contact_info)) {
      setFeedback('Phone number must contain exactly 10 digits, or leave it blank.')
      return
    }
    setSaving(true)
    try {
      const token = await getAccessTokenSilently()
      const updated = await updateCurrentUser(form, token)
      setProfile((prev) => ({ ...prev, ...updated }))
      setEditing(false)
      if (location.state?.returnTo && updated.name?.trim() && /^\d{10}$/.test(updated.contact_info || '')) {
        navigate(location.state.returnTo, { replace: true, state: { resumeRequest: true, continueAction: location.state.continueAction, requestDates: location.state.requestDates } })
      } else if (location.state?.returnTo) {
        setFeedback('Your profile was saved. Add both your name and a valid 10-digit phone number to continue.')
      }
    } catch (error) {
      console.error("Error saving profile:",error)
      setFeedback(error.response?.data?.error || 'Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDecision = async (requestId, type, decision) => {
    const key = `${type}:${requestId}`
    setProcessingId(key)
    setFeedback('')
    try {
      const token = await getAccessTokenSilently()
      
      // Route to the correct backend patch function based on listing type
      if (type === 'SELL') {
        await decidePurchaseRequest(requestId, decision, token)
      } else {
        await decideBorrowing(requestId, decision, token)
      }

      const [incoming, outgoing, transactionRows] = await Promise.all([
        getIncomingRequests(token), getOutgoingRequests(token), getMyTransactions(token),
      ])
      setIncomingRequests(incoming || [])
      setOutgoingRequests(outgoing || [])
      setTransactions(transactionRows || [])
      setFeedback(decision === 'REJECT' ? 'Request declined.' : 'Request accepted.')
    } catch (error) {
      console.error(`Failed to mark request as ${decision}:`, error)
      setFeedback(error.response?.data?.error || 'Something went wrong processing that request.')
    } finally {
      setProcessingId('')
    }
  }

  const refreshActivity = async (token) => {
    const [incoming, outgoing, transactionRows] = await Promise.all([
      getIncomingRequests(token), getOutgoingRequests(token), getMyTransactions(token),
    ])
    setIncomingRequests(incoming || [])
    setOutgoingRequests(outgoing || [])
    setTransactions(transactionRows || [])
  }

  const handleBorrowingStatus = async (requestId, status) => {
    setProcessingId(`BORROW:${requestId}`)
    setFeedback('')
    try {
      const token = await getAccessTokenSilently()
      if (status === 'ACTIVE') await activateBorrowing(requestId, token)
      else await updateBorrowingStatus(requestId, status, token)
      await refreshActivity(token)
      setFeedback(status === 'ACTIVE' ? 'Borrowing marked as handed over.' : 'Borrowing marked as returned.')
    } catch (error) {
      setFeedback(error.response?.data?.error || 'Could not update the borrowing status.')
    } finally {
      setProcessingId('')
    }
  }

  const handleCompleteTransaction = async (transactionId) => {
    setProcessingId(`TRANSACTION:${transactionId}`)
    setFeedback('')
    try {
      const token = await getAccessTokenSilently()
      await completeTransaction(transactionId, token)
      setTransactions(await getMyTransactions(token))
      setFeedback('Transaction marked complete. You can now leave a review.')
    } catch (error) {
      setFeedback(error.response?.data?.error || 'Could not complete the transaction.')
    } finally {
      setProcessingId('')
    }
  }

  const handleReview = async (dealType, dealId, payload) => {
    const key = `${dealType}:${dealId}`
    setReviewingId(key)
    setFeedback('')
    try {
      const token = await getAccessTokenSilently()
      if (dealType === 'T') await createTransactionReview({ transaction_id: dealId, ...payload }, token)
      else await createBorrowingReview({ borrowing_id: dealId, ...payload }, token)
      setReviewedIds((current) => new Set(current).add(key))
      await refreshActivity(token)
      setFeedback('Thanks for leaving a review.')
    } catch (error) {
      setFeedback(error.response?.data?.error || 'Could not submit your review.')
    } finally {
      setReviewingId('')
    }
  }

  const handleDeleteListing = async (listingId) => {
    // 1. Ask for confirmation
    const isConfirmed = window.confirm("Are you sure you want to delete this listing? This cannot be undone.");
    if (!isConfirmed) return;

    try {
      const token = await getAccessTokenSilently();
      
      // 2. Tell the backend to delete it
      await deleteListing(listingId, token);

      // 3. THE FIX: Update the profile state to remove the listing instantly
      setProfile(prevProfile => ({
        ...prevProfile,
        listings: prevProfile.listings.filter(l => l.listing_id !== listingId)
      }));
      
      alert("Listing deleted.");
    } catch (error) {
      console.error("Failed to delete listing:", error);
      // If we get a 404, it probably means it was already deleted!
      if (error.response && error.response.status === 404) {
        alert("This listing was already deleted.");
        // Clean it up from the screen anyway
        setProfile(prevProfile => ({
          ...prevProfile,
          listings: prevProfile.listings.filter(l => l.listing_id !== listingId)
        }));
      } else {
        alert("Something went wrong trying to delete that listing.");
      }
    }
  }

  if (loading) return <LoadingSpinner fullPage label="Loading profile..." />

  if (loadError) return <div className="profile-window">
    <Link to="/browse" className="description-back">&larr; Back to listings</Link>
    <h1>Your Profile</h1>
    <p className="profile-load-error" role="alert">{loadError}</p>
    <button type="button" className="profile-edit-btn" onClick={loadProfile}>Try again</button>
  </div>

  return (
    <div className="profile-window">
      <Link to="/browse" className="description-back">
        &larr; Back to listings
      </Link>
      <h1>Your Profile</h1>
      {feedback && <p className="profile-feedback" role="status">{feedback}</p>}

      <section className="profile-card">
        {editing ? (
          <form className="profile-edit-form" onSubmit={handleSave}>
            <label htmlFor="profile-name">
              Name
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Enter your name"
              />
            </label>
            <label htmlFor="profile-phone">
              Phone
              <input
                id="profile-phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                autoComplete="tel-national"
                value={form.contact_info}
                onChange={(e) => setForm({ ...form, contact_info: e.target.value })}
                placeholder="Enter your phone number"
              />
            </label>
            <div className="profile-edit-actions">
              <button type="submit" className="profile-save-btn" disabled={saving}>
                {saving && <LoadingSpinner />}
                Save Changes
              </button>
              <button type="button" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="profile-field">
              <span className="profile-label">Name</span>
              <span>{profile?.name || '—'}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">Email</span>
              <span>{auth0user?.email}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">Phone</span>
              <span>{profile?.contact_info || '—'}</span>
            </div>
            <button className="profile-edit-btn" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          </>
        )}
      </section>

      <section>
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Your Listings</h2>
          <button 
              className="profile-save-btn" 
              onClick={() => navigate('/create-listing')}
            >
              + Create New Listing
            </button>
        </div>
        {profile?.listings?.length ? (
          <ul className="profile-list">
            {profile.listings.map((l) => (
              <li 
                key={l.listing_id} 
                className="clickable-card" 
                onClick={() => navigate(`/listing/${l.listing_id}`)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                {/* Title and Price Group */}
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <span>{l.title}</span>
                  <span className="profile-price">
                    {l.type === 'BORROW' ? `₹${l.price_per_day}/day` : `₹${l.price}`}
                  </span>
                </div>

                {/* Delete Button */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation(); // <-- CRITICAL: Stops the card from navigating!
                    handleDeleteListing(l.listing_id);
                  }}
                  style={{ 
                    backgroundColor: '#EA1B23', 
                    color: 'white', 
                    border: 'none', 
                    padding: '6px 12px', 
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="profile-empty">You haven't posted any listings yet.</p>
        )}
      </section>

      <section className="profile-section">
        <div className="section-header" style={{ borderBottom: 'none' }}>
          <h2>Your Requests</h2>
        </div>

        <div className="requests-container">
          
          {/* INCOMING */}
          <div className="request-column">
            <h3>Received Requests</h3>
            {incomingRequests?.length > 0 ? (
              incomingRequests.map(req => (
                <div key={req.id} className="request-card incoming">
                  <p>
                  <Link to={`/users/${req.requester_user_id}`} className="request-user-link"><strong>{req.requester_name || 'Campus member'}</strong></Link> wants to {req.type === 'SELL' ? 'buy' : 'borrow'} your <Link to={`/listing/${req.listing_id}`}><strong>{req.title}</strong></Link>
                  </p>
                {req.type === 'BORROW' && <p className="request-date-range">Requested: {req.start_time ? new Date(req.start_time).toLocaleString() : '—'} – {req.end_time ? new Date(req.end_time).toLocaleString() : '—'}</p>}
                  
                  {/* Show buttons if PENDING, otherwise show the status badge */}
                  {req.status === 'PENDING' ? (
                    <div className="request-actions">
                      <button disabled={processingId === `${req.type}:${req.id}`}
                        className="btn-approve" 
                        onClick={() => handleDecision(req.id, req.type, 'ACCEPT')}
                      >
                        Approve
                      </button>
                      <button disabled={processingId === `${req.type}:${req.id}`}
                        className="btn-reject" 
                        onClick={() => handleDecision(req.id, req.type, 'REJECT')}
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <span className={`status-badge ${req.status?.toLowerCase()}`}>
                      {req.status}
                    </span>
                  )}
                  {req.type === 'BORROW' && req.status === 'BOOKED' && <button className="request-status-action" disabled={processingId === `BORROW:${req.id}`} onClick={() => handleBorrowingStatus(req.id, 'ACTIVE')}>Mark handed over</button>}
                  {req.type === 'BORROW' && req.status === 'RETURNED' && !reviewedIds.has(`B:${req.id}`) && <InlineReviewForm disabled={reviewingId === `B:${req.id}`} onSubmit={(payload) => handleReview('B', req.id, payload)} />}
                </div>
              ))
            ) : (
              <p className="profile-empty">No pending requests for your items.</p>
            )}
          </div>

          {/* OUTGOING */}
          <div className="request-column">
            <h3>Sent Requests</h3>
            {outgoingRequests?.length > 0 ? (
              outgoingRequests.map(req => (
                <div key={req.id} className="request-card outgoing">
                  <p>You requested to {req.type === 'SELL' ? 'buy' : 'borrow'} <strong>{req.title}</strong> from <strong>{req.owner_name}</strong></p>
                  <span className={`status-badge ${req.status?.toLowerCase()}`}>
                    {req.status}
                  </span>
                  {req.type === 'BORROW' && req.status === 'ACTIVE' && <button className="request-status-action" disabled={processingId === `BORROW:${req.id}`} onClick={() => handleBorrowingStatus(req.id, 'RETURNED')}>Mark returned</button>}
                  {req.type === 'BORROW' && req.status === 'RETURNED' && !reviewedIds.has(`B:${req.id}`) && <InlineReviewForm disabled={reviewingId === `B:${req.id}`} onSubmit={(payload) => handleReview('B', req.id, payload)} />}
                </div>
              ))
            ) : (
              <p className="profile-empty">You haven't made any requests yet.</p>
            )}
          </div>

        </div>
      </section>

      <section className="profile-section">
        <div className="section-header"><h2>Transactions</h2></div>
        {transactions.length ? <div className="profile-list transaction-list">
          {transactions.map((transaction) => <article className="transaction-card" key={transaction.transaction_id}>
            <div><Link to={`/listing/${transaction.listing_id}`}><strong>{transaction.listing_title || 'Marketplace item'}</strong></Link><span className={`status-badge ${transaction.status?.toLowerCase()}`}>{transaction.status}</span></div>
            {transaction.status === 'PENDING' && <button className="request-status-action" disabled={processingId === `TRANSACTION:${transaction.transaction_id}`} onClick={() => handleCompleteTransaction(transaction.transaction_id)}>Mark transaction complete</button>}
            {transaction.status === 'COMPLETED' && !reviewedIds.has(`T:${transaction.transaction_id}`) && <InlineReviewForm disabled={reviewingId === `T:${transaction.transaction_id}`} onSubmit={(payload) => handleReview('T', transaction.transaction_id, payload)} />}
          </article>)}
        </div> : <p className="profile-empty">No completed purchases yet.</p>}
      </section>
    </div>
  )
}

export default withAuthenticationRequired(ProfileWindow, {
  onRedirecting: () => <LoadingSpinner fullPage label="Redirecting to login..." />,
})
