import { Component } from 'react'

// Fängt Render-Fehler innerhalb der Three.js-Szene ab und zeigt
// einen kontrollierten Fallback statt einer leeren/weißen Seite.
export default class SceneErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[SceneErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '100%',
            background: '#0e1116',
            color: '#e2e8f0',
            fontFamily: 'inherit',
            gap: 12,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
              3D-Szene konnte nicht gerendert werden.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94a3b8' }}>
              {this.state.error?.message ?? 'Unbekannter Fehler'}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ padding: '6px 14px' }}
            >
              Neu versuchen
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
