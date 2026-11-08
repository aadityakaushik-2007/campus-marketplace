import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getUserPublicProfile } from '../api/api'
import LoadingSpinner from '../components/LoadingSpinner'
import ListingCard from '../components/ListingCard'
import './UserDirectory.css'

export default function PublicProfile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setLoading(true)
    getUserPublicProfile(id).then((data) => { if (alive) setProfile(data) })
      .catch((err) => { if (alive) setError(err.response?.data?.error || 'Could not load this profile.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])
  if (loading) return <LoadingSpinner fullPage label="Loading member profile…" />
  if (error || !profile) return <section className="user-directory" role="alert"><p className="directory-message error">{error || 'Profile not found.'}</p><Link to="/users">Find another member</Link></section>
  return <section className="public-profile">
    <Link to="/users" className="description-back">← Find people</Link>
    <header className="public-profile-card">
      <span className="user-avatar large" aria-hidden="true">{profile.name?.slice(0, 1)?.toUpperCase() || '?'}</span>
      <div><p className="profile-eyebrow">Campus member</p><h1>{profile.name || 'Campus member'}</h1>
        {profile.email && <a href={`mailto:${profile.email}`}>{profile.email}</a>}
        {profile.contact_info && <a href={`tel:${profile.contact_info}`}>{profile.contact_info}</a>}
      </div>
    </header>
    <div className="public-profile-heading"><h2>Active listings</h2><span>{profile.listings?.length || 0}</span></div>
    {profile.listings?.length ? <div className="listing-grid">{profile.listings.map((listing) => <ListingCard key={listing.listing_id} listing={listing} />)}</div> : <p className="directory-message">No active listings right now.</p>}
    <div className="public-profile-heading"><h2>Reviews</h2><span>{profile.reviews?.length || 0}</span></div>
    {profile.reviews?.length ? <ul className="user-results">{profile.reviews.map((review) => <li key={review.review_id}><div><strong>{review.reviewer_name || 'Campus member'} · {review.rating}/5</strong><small>{review.comment || 'No written comment.'}</small></div></li>)}</ul> : <p className="directory-message">No reviews yet.</p>}
  </section>
}
