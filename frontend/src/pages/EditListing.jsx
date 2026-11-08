import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { getCurrentUser, getErrorMessage, getListingById, uploadListingImage } from '../api/api'
import LoadingSpinner from '../components/LoadingSpinner'
import './EditListing.css'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const imageUrl = (image) => image?.image_url || image?.url || image

export default function EditListing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0()
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [fileErrors, setFileErrors] = useState([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef(null)

  const loadListing = async () => {
    const listingData = await getListingById(id)
    setListing(listingData)
  }

  useEffect(() => {
    if (isLoading) return
    let active = true
    ;(async () => {
      setLoading(true)
      setLoadError('')
      try {
        if (!isAuthenticated) throw new Error('Please sign in to edit a listing.')
        const [listingData, token] = await Promise.all([getListingById(id), getAccessTokenSilently()])
        const currentUser = await getCurrentUser(token)
        if (currentUser?.user_id !== listingData.owner_id) {
          throw new Error('Only the owner can edit this listing.')
        }
        if (active) setListing(listingData)
      } catch (error) {
        if (active) setLoadError(error.message || getErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [id, isAuthenticated, isLoading, getAccessTokenSilently])

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || [])
    const invalid = []
    const valid = []
    files.forEach((file) => {
      if (!ALLOWED_TYPES.has(file.type)) invalid.push(`${file.name}: use a JPEG, PNG, or WebP image.`)
      else if (file.size > MAX_FILE_SIZE) invalid.push(`${file.name}: exceeds the 5 MB limit.`)
      else valid.push(file)
    })
    setSelectedFiles(valid)
    setFileErrors(invalid)
  }

  const removeFile = (index) => {
    const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index)
    setSelectedFiles(nextFiles)
    if (inputRef.current) {
      const transfer = new DataTransfer()
      nextFiles.forEach((file) => transfer.items.add(file))
      inputRef.current.files = transfer.files
    }
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!selectedFiles.length) {
      setFileErrors(['Choose at least one valid image to upload.'])
      return
    }
    setUploading(true)
    setFileErrors([])
    try {
      // This is the same Auth0 access token used by every authenticated API request.
      const token = await getAccessTokenSilently()
      const outcomes = await Promise.all(selectedFiles.map(async (file) => {
        try {
          await uploadListingImage(listing.listing_id, file, token)
          return null
        } catch (error) {
          return `${file.name}: ${getErrorMessage(error)}`
        }
      }))
      const errors = outcomes.filter(Boolean)
      setFileErrors(errors)
      if (errors.length < selectedFiles.length) {
        await loadListing()
        setSelectedFiles([])
        if (inputRef.current) inputRef.current.value = ''
      }
    } catch (error) {
      setFileErrors([getErrorMessage(error)])
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <LoadingSpinner fullPage label="Loading listing editor..." />
  if (loadError) return (
    <div className="edit-listing-error" role="alert">
      <p>{loadError}</p>
      <button type="button" onClick={() => navigate(`/listing/${id}`)}>Back to listing</button>
    </div>
  )

  const images = listing.images || []
  return (
    <div className="edit-listing-window">
      <Link to={`/listing/${listing.listing_id}`} className="edit-listing-back">&larr; Back to listing</Link>
      <h1>Edit listing images</h1>
      <p className="edit-listing-note">You can add photos here. Other listing details cannot be changed.</p>

      <section aria-labelledby="existing-images-heading">
        <h2 id="existing-images-heading">Existing images</h2>
        {images.length ? (
          <div className="edit-listing-images">
            {images.map((image, index) => <img key={image?.image_id || image?.id || imageUrl(image) || index} src={imageUrl(image)} alt={`${listing.title} — image ${index + 1}`} />)}
          </div>
        ) : <p className="edit-listing-empty">This listing has no images yet.</p>}
      </section>

      <form className="edit-listing-form" onSubmit={handleUpload}>
        <label htmlFor="listing-images">Add images</label>
        <input id="listing-images" ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} disabled={uploading} />
        <p className="edit-listing-help">JPEG, PNG, or WebP only; up to 5 MB per image.</p>
        {selectedFiles.length > 0 && (
          <ul className="edit-listing-file-list">
            {selectedFiles.map((file, index) => <li key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><button type="button" onClick={() => removeFile(index)} disabled={uploading}>Remove</button></li>)}
          </ul>
        )}
        {fileErrors.length > 0 && <ul className="edit-listing-errors" role="alert">{fileErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>}
        <button className="edit-listing-upload" type="submit" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload images'}</button>
      </form>
    </div>
  )
}
