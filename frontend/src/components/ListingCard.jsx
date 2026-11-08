
import { useNavigate } from 'react-router-dom'
import './ListingCard.css'

export default function ListingCard({ listing }) {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate(`/listing/${listing.listing_id}`)
  }

  // Format the price based on SELL vs BORROW
  const priceLabel = listing.type === 'BORROW'
    ? `₹${listing.price_per_day}/day`
    : `₹${listing.price}`

  // Category display
  const displayCategory = listing.category_name || `Category ${listing.category_id}`

  // Get the image path from the API response
  const imagePath = listing.primary_image || listing.images?.[0]

  // Convert Supabase storage path into a public image URL
  const imageUrl = imagePath
    ? imagePath.startsWith('http')
      ? imagePath
      : `https://esdwtoeijsahokfxfgxa.supabase.co/storage/v1/object/public/listing-images/${imagePath.replace(/^listing-images\//, '')}`
    : null

  return (
    <div className="listing-card">
      <span className="listing-card-tag">{displayCategory}</span>

      {imageUrl ? (
        <img
          src={imageUrl}
          alt={listing.title}
          className="listing-card-img"
        />
      ) : (
        <div className="listing-card-img placeholder-img">
          No Image
        </div>
      )}

      <div className="listing-card-body">
        <div className="listing-card-info">
          <h3 className="listing-card-title">{listing.title}</h3>
          <p className="listing-card-desc">{listing.description}</p>
          <span className="listing-card-price">{priceLabel}</span>
        </div>

        <button
          className="listing-card-btn"
          onClick={handleClick}
          aria-label={`More details about ${listing.title}`}
        >
          More details
        </button>
      </div>
    </div>
  )
}
