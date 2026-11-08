const RETURN_SCROLL_KEY = 'campus-marketplace:return-scroll'

export function getInternalReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

export function beginLogin(loginWithRedirect, options = {}) {
  const returnTo = getInternalReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`)
  const scrollY = window.scrollY
  try { sessionStorage.setItem(RETURN_SCROLL_KEY, JSON.stringify({ returnTo, scrollY })) } catch { /* storage may be disabled */ }
  return loginWithRedirect({ ...options, appState: { ...(options.appState || {}), returnTo } })
}

export function restoreReturnScroll(returnTo) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(RETURN_SCROLL_KEY) || 'null')
    if (!saved || getInternalReturnTo(saved.returnTo) !== returnTo) return
    sessionStorage.removeItem(RETURN_SCROLL_KEY)
    let attempts = 0
    const restore = () => {
      const desiredY = Math.max(0, Number(saved.scrollY) || 0)
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      window.scrollTo(0, Math.min(desiredY, maxY))
      attempts += 1
      // API-backed pages can grow after auth/profile checks finish. Keep
      // restoring as content arrives, then clamp to the final page height.
      if (attempts < 50 && (maxY < desiredY || window.scrollY < desiredY)) {
        window.setTimeout(() => requestAnimationFrame(restore), 100)
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(restore))
  } catch { /* ignore invalid or unavailable session storage */ }
}
