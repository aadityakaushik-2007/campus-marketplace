import { useState } from 'react'
import { Link } from 'react-router-dom'
import { searchUsers } from '../api/api'
import LoadingSpinner from '../components/LoadingSpinner'
import './UserDirectory.css'

export default function UserDirectory() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      setResults(await searchUsers(query.trim()))
    } catch (err) {
      setError(err.response?.status === 401 ? 'Sign in to search campus members.' : (err.response?.data?.error || 'Could not search members right now.'))
    } finally {
      setLoading(false)
    }
  }

  return <section className="user-directory">
    <Link to="/browse" className="description-back">← Back to listings</Link>
    <h1>Find people on campus</h1>
    <p>Search the Thapar community by name.</p>
    <form className="user-search" onSubmit={submit}>
      <label htmlFor="member-search">Name</label>
      <div><input id="member-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names" />
      <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button></div>
    </form>
    {loading && <LoadingSpinner label="Searching members…" />}
    {error && <p role="alert" className="directory-message error">{error}</p>}
    {!loading && searched && !error && results.length === 0 && <p className="directory-message">No members found. Try another name.</p>}
    <ul className="user-results">{results.map((person) => <li key={person.user_id}><Link to={`/users/${person.user_id}`}><span className="user-avatar" aria-hidden="true">{person.name?.slice(0, 1)?.toUpperCase() || '?'}</span><span><strong>{person.name || 'Campus member'}</strong></span><span aria-hidden="true">→</span></Link></li>)}</ul>
  </section>
}
