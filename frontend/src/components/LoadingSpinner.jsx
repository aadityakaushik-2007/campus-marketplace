import './LoadingSpinner.css'

export default function LoadingSpinner({ fullPage = false, label = 'Loading...' }) {
  if (fullPage) {
    return (
      <div className="spinner-fullpage">
        <div className="spinner">
          <div className="spinner-dot"></div>
          <div className="spinner-dot"></div>
          <div className="spinner-dot"></div>
        </div>
        <span>{label}</span>
      </div>
    )
  }
  return (
    <span className="spinner spinner-inline" aria-label={label} role="status">
      <span className="spinner-dot"></span>
      <span className="spinner-dot"></span>
      <span className="spinner-dot"></span>
    </span>
  )
}
