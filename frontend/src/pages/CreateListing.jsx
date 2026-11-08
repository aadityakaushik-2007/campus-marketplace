import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { createListing, getCurrentUser, uploadListingImage } from '../api/api'
import { useEffect, useRef } from 'react'
import LoadingSpinner from '../components/LoadingSpinner'
import './CreateListing.css'
import { beginLogin } from '../auth/navigation'

export default function CreateListing() {
  const { getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect } = useAuth0()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [images, setImages] = useState([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    category_id: '1', // Default category
    type: 'SELL',
    price: '',
    price_per_day: ''
  })
  const fileInputRef = useRef(null)
  const guardStarted = useRef(false)
  const [checkingProfile, setCheckingProfile] = useState(true)
  const [guardError, setGuardError] = useState('')

  useEffect(() => {
    if (isLoading || guardStarted.current) return
    guardStarted.current = true
    const target = `${location.pathname}${location.search}${location.hash}`
    if (!isAuthenticated) {
      beginLogin(loginWithRedirect)
      return
    }
    getAccessTokenSilently().then(getCurrentUser).then((profile) => {
      if (!profile?.name?.trim() || !/^\d{10}$/.test(profile?.contact_info || '')) {
        navigate('/profile', { replace: true, state: { returnTo: target, message: 'Complete your name and 10-digit phone number before posting a listing.' } })
      } else setCheckingProfile(false)
    }).catch((err) => {
      setGuardError(err.response?.data?.error || 'Could not verify your profile. Please try again.')
      setCheckingProfile(false)
    })
  }, [isLoading, isAuthenticated, getAccessTokenSilently, loginWithRedirect, location.pathname, location.search, location.hash, navigate])

  // Handle file selection
  const handleImageChange = (e) => {
    const selected = Array.from(e.target.files)
    if (selected.length + images.length > 5) {
      setFeedback('You can add up to 5 images. Remove an image before adding more.')
      e.target.value = ''
      return
    }
    setFeedback('')
    setImages([...images, ...selected])
  }

  const removeImage = (indexToRemove) => {
    // 1. Update React state
    const updatedImages = images.filter((_, index) => index !== indexToRemove)
    setImages(updatedImages)

    // 2. Force the HTML input to update its "X files selected" text
    if (fileInputRef.current) {
      const dataTransfer = new DataTransfer()
      updatedImages.forEach(file => dataTransfer.items.add(file))
      fileInputRef.current.files = dataTransfer.files
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFeedback('')
    try {
      const token = await getAccessTokenSilently()
      
      const listing = await createListing({
        title: form.title,
        description: form.description,
        category_id: Number(form.category_id),
        type: form.type,
        ...(form.type === 'SELL'
          ? { price: Number(form.price) }
          : { price_per_day: Number(form.price_per_day) }),
      }, token)

      const failedUploads = []
      for (const image of images) {
        try {
          await uploadListingImage(listing.listing_id, image, token)
        } catch (uploadError) {
          failedUploads.push(`${image.name}: ${uploadError.response?.data?.error || 'upload failed'}`)
        }
      }

      if (failedUploads.length) {
        setFeedback(`Listing was created, but ${failedUploads.length} image${failedUploads.length === 1 ? '' : 's'} could not be uploaded. ${failedUploads.join(' ')}`)
        return
      }
      
      setFeedback('Listing created successfully. Opening your profile…')
      navigate('/profile')
    } catch (error) {
      console.error("Failed to create listing:", error)
      setFeedback(error.response?.data?.error || 'Could not create your listing. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="create-listing-window">
      <h1>Create a New Listing</h1>
      {guardError && <p className="create-listing-feedback" role="alert">{guardError}</p>}
      {checkingProfile ? <LoadingSpinner label="Checking your profile…" /> : guardError ? null : (
      
      <form className="create-listing-form" onSubmit={handleSubmit}>
        {feedback && <p className={`create-listing-feedback ${saving ? 'is-pending' : ''}`} role="status">{feedback}</p>}
        
        <label>
          Title
          <input type="text" required maxLength="100" placeholder="Name of the Item"
            value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
        </label>

        <label>
          Category
          <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
            <option value="1">Books</option>
            <option value="2">Electronics</option>
            <option value="3">Stationery</option>
            <option value="4">Furniture</option>
            <option value="5">Clothing</option>
            <option value="6">Other</option>
          </select>
        </label>

        <label>
          Listing Type
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            <option value="SELL">For Sale</option>
            <option value="BORROW">For Rent / Borrow</option>
          </select>
        </label>

        {/* Dynamic Price Field */}
        {form.type === 'SELL' ? (
          <label>
            Price (₹)
            <input type="number" required min="0" step="0.01"
              value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
          </label>
        ) : (
          <label>
            Price Per Day (₹)
            <input type="number" required min="0" step="0.01"
              value={form.price_per_day} onChange={e => setForm({...form, price_per_day: e.target.value})} />
          </label>
        )}

        <label>
          Description
          <textarea required rows="4" placeholder="Condition, dimensions, pickup details..."
            value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
        </label>

        <div className="file-upload-section">
          <label className="file-upload-label">
            Upload Images (Max 5)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} ref={fileInputRef} aria-describedby="image-count" />
            <span id="image-count" className="file-count">{images.length} of 5 images selected</span>
          </label>

          {/* NEW: Display the list of selected files with a remove button */}
          {images.length > 0 && (
            <ul className="selected-files-list">
              {images.map((file, index) => (
                <li key={index} className="selected-file-item">
                  <span className="file-name">{file.name}</span>
                  {/* CRITICAL: type="button" prevents it from accidentally submitting the form! */}
                  <button 
                    type="button" 
                    className="remove-file-btn" 
                    onClick={() => removeImage(index)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" className="submit-listing-btn" disabled={saving}>
          {saving && <LoadingSpinner />}
          Post Listing
        </button>
      </form>
      )}
    </div>
  )
}
