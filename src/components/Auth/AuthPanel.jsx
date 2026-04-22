import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'

// ---------------------------------------------------------------------
// AuthPanel: kombinierte Login-/Registrierungs-Form.
// Sicherheit:
//   - Minimum Passwort-Länge 8 Zeichen (Frontend-Check), Supabase erzwingt
//     zusätzlich eigene Policies.
//   - Email wird clientseitig nur grob validiert - Supabase tut den Rest.
//   - Rate-Limiting & Confirm-Email übernimmt Supabase Auth.
// ---------------------------------------------------------------------

export default function AuthPanel() {
  const { signIn, signUp, isConfigured } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (!isConfigured) {
    return (
      <div className="panel" style={{ maxWidth: 420 }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>Lokaler Modus</h3>
        <p className="hint-text" style={{ lineHeight: 1.4 }}>
          Supabase ist nicht konfiguriert. Du kannst die App lokal verwenden, aber
          Anordnungen werden <strong>nicht</strong> in die Cloud gespeichert.
          Lege eine <code>.env.local</code> mit deinen Supabase-Keys an, um
          Login und Cloud-Speicher zu aktivieren (siehe README).
        </p>
      </div>
    )
  }

  const validate = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Bitte eine gültige E-Mail eingeben.'
    if (password.length < 8) return 'Passwort muss mindestens 8 Zeichen lang sein.'
    if (password.length > 72) return 'Passwort darf maximal 72 Zeichen lang sein.'
    return null
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    const v = validate()
    if (v) { setError(v); return }
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setInfo('Prüfe dein Postfach und bestätige die Registrierung.')
      }
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{mode === 'login' ? 'Anmelden' : 'Registrieren'}</h3>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo('') }}
          style={{ fontSize: 12 }}
        >
          {mode === 'login' ? 'Neu hier? Registrieren' : 'Schon Account? Anmelden'}
        </button>
      </div>
      <form onSubmit={onSubmit} className="stack" autoComplete="on">
        <div>
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
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
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="hint-text" style={{ marginTop: 4 }}>Mindestens 8 Zeichen.</p>
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}
        {info && <div style={{ color: 'var(--success)', fontSize: 13 }}>{info}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : (mode === 'login' ? 'Anmelden' : 'Registrieren')}
        </button>
      </form>
    </div>
  )
}
