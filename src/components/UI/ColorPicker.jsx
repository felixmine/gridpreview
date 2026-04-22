import { useState, useEffect, useRef, useCallback } from 'react'
import { HexColorPicker } from 'react-colorful'

const PALETTE = [
  '#4f8cff', '#22c55e', '#f59e0b', '#ef4444',
  '#a855f7', '#06b6d4', '#ec4899', '#f97316',
  '#14b8a6', '#64748b', '#e2e8f0', '#1e293b',
]

/**
 * ColorPicker — a styled popover wrapping react-colorful's HexColorPicker.
 *
 * Props:
 *   value      – current hex color string (e.g. "#4f8cff")
 *   onChange   – (hex: string) => void
 *   disabled   – boolean
 *   placement  – "bottom" (default) | "top"
 *   children   – trigger element
 */
export default function ColorPicker({ value, onChange, disabled, placement = 'bottom', children }) {
  const [open,    setOpen]    = useState(false)
  const [hexText, setHexText] = useState(value)
  const popoverRef = useRef(null)
  const triggerRef = useRef(null)

  // Sync hex input when value prop changes externally
  useEffect(() => { setHexText(value) }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const handleChange = useCallback((hex) => {
    setHexText(hex)
    onChange(hex)
  }, [onChange])

  function handleHexInput(e) {
    const raw = e.target.value
    setHexText(raw)
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) onChange(raw)
  }

  function toggle() {
    if (!disabled) setOpen((o) => !o)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Trigger */}
      <div ref={triggerRef} onClick={toggle}>
        {children}
      </div>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="color-picker-popover"
          style={placement === 'top' ? { top: 'auto', bottom: 'calc(100% + 8px)' } : undefined}
        >
          <HexColorPicker color={value} onChange={handleChange} />

          {/* Hex input */}
          <div className="color-picker-hex-row">
            <div className="color-picker-preview" style={{ background: value }} />
            <input
              className="color-picker-hex-input"
              type="text"
              value={hexText}
              onChange={handleHexInput}
              maxLength={7}
              spellCheck={false}
            />
          </div>

          {/* Preset palette */}
          <div className="color-picker-palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                className="color-picker-swatch"
                style={{
                  background: c,
                  outline: value.toLowerCase() === c ? '2px solid #fff' : 'none',
                  outlineOffset: 1,
                }}
                onClick={() => handleChange(c)}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
