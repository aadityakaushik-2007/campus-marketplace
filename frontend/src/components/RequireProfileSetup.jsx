import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { getCurrentUser } from '../api/api'
import LoadingSpinner from './LoadingSpinner'

// The deployed backend creates the marketplace user on the first authenticated
// request, so frontend registration must not call a nonexistent POST /api/users.
export default function RequireProfileSetup({ children }) {
  const { isAuthenticated, getAccessTokenSilently, isLoading } = useAuth0()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      setChecking(false)
      return
    }

    let active = true
    ;(async () => {
      try {
        const token = await getAccessTokenSilently()
        await getCurrentUser(token)
      } catch (error) {
        console.error('Error verifying marketplace account:', error)
      } finally {
        if (active) setChecking(false)
      }
    })()
    return () => { active = false }
  }, [isAuthenticated, isLoading, getAccessTokenSilently])

  if (isLoading || checking) return <LoadingSpinner fullPage label="Verifying account..." />
  return children
}
