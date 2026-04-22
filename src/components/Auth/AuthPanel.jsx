import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'

export default function AuthPanel() {
  const { signIn, signUp, isConfigured } = useAuth()
  const [mode,     setMode]     = useState('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [info,     setInfo]     = useState('')
  const [busy,     setBusy]     = useState(false)

  if (!isConfigured) {
    return (
      <div className="panel hint-text" style={{ lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Local mode</strong>
        Supabase is not configured. Arrangements cannot be saved to the cloud.
        Add a <code>.env.local</code> with your Supabase keys to enable login (see README).
      </div>
    )
  }

  const validate = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password.length > 72) return 'Password too long.'
    return null
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError(''); setInfo('')
    const v = validate()
    if (v) { setError(v); return }
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setInfo('Check your inbox and confirm your email to complete signup.')
      }
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>{mode === 'login' ? 'Sign in' : 'Create account'}</strong>
        <button
          type="button"
          className="btn-xs"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo('') }}
        >
          {mode === 'login' ? 'Register' : 'Sign in'}
        </button>
      </div>

      <form onSubmit={onSubmit} className="col" autoComplete="on">
        <div>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            name="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}
        {info  && <div className="success-text">{info}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : (mode === 'login' ? 'Sign in' : 'Register')}
        </button>
      </form>
    </div>
  )
}
