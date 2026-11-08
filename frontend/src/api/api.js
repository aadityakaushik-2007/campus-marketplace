import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const api = axios.create({ baseURL: API_BASE_URL })

let getAccessToken = null
export const setAccessTokenGetter = (fn) => { getAccessToken = fn }

api.interceptors.request.use(async (config) => {
  if (!getAccessToken) return config
  try {
    const token = await getAccessToken({
      authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE },
    })
    config.headers.Authorization = `Bearer ${token}`
  } catch {
    // The backend will return its normal authentication error when no token is available.
  }
  return config
})

const tokenConfig = (token) => token ? { headers: { Authorization: `Bearer ${token}` } } : undefined

export const getErrorMessage = (err) =>
  err.response?.data?.error || 'Something went wrong. Please try again.'

const normalizeBorrowing = (borrowing) => ({
  ...borrowing,
  id: borrowing.borrowing_id,
  type: 'BORROW',
  requester_user_id: borrowing.borrower_id,
  requester_name: borrowing.borrower_name,
})

const normalizePurchaseRequest = (request) => ({
  ...request,
  id: request.request_id,
  type: 'SELL',
  requester_user_id: request.buyer_id,
  requester_name: request.buyer_name,
  owner_name: request.seller_name,
})

export const getCurrentUser = async (token) => {
  try {
    const { data } = await api.get('/api/users/me', tokenConfig(token))
    return data.user
  } catch (error) {
    if (error.response?.status === 404) return null
    throw error
  }
}

export const updateCurrentUser = (formData, token) =>
  api.patch('/api/users/me', formData, tokenConfig(token)).then((r) => r.data.user)

export const getListings = (filters = {}) => {
  const { categoryId, minPrice, maxPrice, sort = 'newest', ...otherFilters } = filters
  const params = {
    ...otherFilters,
    ...(categoryId != null ? { category_id: categoryId } : {}),
    ...(minPrice != null ? { min_price: minPrice } : {}),
    ...(maxPrice != null ? { max_price: maxPrice } : {}),
  }
  const cleanedParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null))

  return api.get('/api/listings', { params: cleanedParams }).then((r) => {
    const listings = r.data.listings || []
    if (sort === 'price_low') return [...listings].sort((a, b) => Number(a.price ?? a.price_per_day) - Number(b.price ?? b.price_per_day))
    if (sort === 'price_high') return [...listings].sort((a, b) => Number(b.price ?? b.price_per_day) - Number(a.price ?? a.price_per_day))
    return listings
  })
}

export const getListingById = (listingId) =>
  api.get(`/api/listings/${listingId}`).then((r) => r.data.listing)

export const createListing = (data, token) =>
  api.post('/api/listings', data, tokenConfig(token)).then((r) => r.data.listing)

export const getMyListings = (token) =>
  api.get('/api/listings/mine', tokenConfig(token)).then((r) => r.data.listings)

export const deleteListing = (listingId, token) =>
  api.patch(`/api/listings/${listingId}/status`, {}, tokenConfig(token)).then((r) => r.data.listing)

export const uploadListingImage = (listingId, file, token) => {
  const formData = new FormData()
  formData.append('image', file)
  return api.post(`/api/listings/${listingId}/images`, formData, tokenConfig(token)).then((r) => r.data.image)
}

export const deleteListingImage = (listingId, imageId, token) =>
  api.delete(`/api/listings/${listingId}/images/${imageId}`, tokenConfig(token)).then((r) => r.data.image)

export const createBorrowing = (data, token) =>
  api.post('/api/borrowings', data, tokenConfig(token)).then((r) => r.data.borrowing)

export const decideBorrowing = (borrowingId, decision, token) =>
  api.patch(`/api/borrowings/${borrowingId}/decision`, { decision }, tokenConfig(token)).then((r) => r.data.borrowing)

export const activateBorrowing = (borrowingId, token) =>
  api.patch(`/api/borrowings/${borrowingId}/activate`, {}, tokenConfig(token)).then((r) => r.data.borrowing)

export const updateBorrowingStatus = (borrowingId, status, token) =>
  api.patch(`/api/borrowings/${borrowingId}/status`, { status }, tokenConfig(token)).then((r) => r.data.borrowing)

export const createPurchaseRequest = (listingId, token) =>
  api.post('/api/purchase-requests', { listing_id: listingId }, tokenConfig(token)).then((r) => r.data.purchase_request)

export const decidePurchaseRequest = (requestId, decision, token) =>
  api.patch(`/api/purchase-requests/${requestId}/decision`, { decision }, tokenConfig(token))
    .then((r) => r.data.transaction || r.data.purchase_request)

export const completeTransaction = (transactionId, token) =>
  api.patch(`/api/transactions/${transactionId}/complete`, {}, tokenConfig(token)).then((r) => r.data.transaction)

export const getMyTransactions = (token) =>
  api.get('/api/transactions/mine', tokenConfig(token)).then((r) => r.data.transactions)

export const createTransactionReview = ({ transaction_id, rating, comment }, token) =>
  api.post('/api/reviews', { deal_type: 'T', transaction_id, rating, comment }, tokenConfig(token)).then((r) => r.data.review)

export const createBorrowingReview = ({ borrowing_id, rating, comment }, token) =>
  api.post('/api/reviews', { deal_type: 'B', borrowing_id, rating, comment }, tokenConfig(token)).then((r) => r.data.review)

export const getUserPublicProfile = (userId, token) =>
  api.get(`/api/users/${userId}`, tokenConfig(token)).then((r) => r.data.user)

export const searchUsers = (searchQuery, token) =>
  api.get('/api/users/search', { ...tokenConfig(token), params: { query: searchQuery } }).then((r) => r.data.users)

export const getIncomingRequests = async (token) => {
  const [borrowings, purchaseRequests] = await Promise.all([
    api.get('/api/borrowings/incoming', tokenConfig(token)),
    api.get('/api/purchase-requests/incoming', tokenConfig(token)),
  ])
  return [
    ...(borrowings.data.borrowings || []).map(normalizeBorrowing),
    ...(purchaseRequests.data.purchase_requests || []).map(normalizePurchaseRequest),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export const getOutgoingRequests = async (token) => {
  const [borrowings, purchaseRequests] = await Promise.all([
    api.get('/api/borrowings/mine', tokenConfig(token)),
    api.get('/api/purchase-requests/mine', tokenConfig(token)),
  ])
  return [
    ...(borrowings.data.borrowings || []).map(normalizeBorrowing),
    ...(purchaseRequests.data.purchase_requests || []).map(normalizePurchaseRequest),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export default api
