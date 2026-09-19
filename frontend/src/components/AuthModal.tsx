import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, X } from '@phosphor-icons/react'
import { login, signup } from '../api'
import type { Session } from '../types'

export type AuthMode = 'signin' | 'signup'

export interface AuthModalProps {
  initialMode: AuthMode
  onClose: () => void
  onSuccess: (session: Session) => void
}

export function AuthModal({ initialMode, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [mode])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const session =
        mode === 'signin'
          ? await login(email.trim(), password)
          : await signup(email.trim(), password)
      onSuccess(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'signin' ? 'Welcome back' : 'Create your account'
  const submitLabel = busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Sign up'

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <div className="modal-head">
          <h2 id="auth-title" className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close sign in dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-tab${mode === 'signin' ? ' active' : ''}`}
            onClick={() => {
              setMode('signin')
              setError('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
            onClick={() => {
              setMode('signup')
              setError('')
            }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input
              ref={emailRef}
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signin' ? 'Your password' : '8 or more characters'}
              required
              minLength={8}
            />
            {mode === 'signup' && (
              <p className="field-hint">Use 8 or more characters.</p>
            )}
          </div>

          {error !== '' && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={busy}>
            {!busy && <ArrowRight size={18} weight="bold" />}
            {submitLabel}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'signin' ? (
            <>
              New to Verixa?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup')
                  setError('')
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin')
                  setError('')
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

export default AuthModal
