import { ArrowSquareOut } from '@phosphor-icons/react'
import type { Session } from '../../types'
import { useAccountSettings } from '../../hooks/useAccountSettings'
import { SignInPrompt } from './SignInPrompt'

export const SUPPORT_URL = 'https://github.com/Theani7/Verixa/issues'

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export interface AccountPaneProps {
  session: Session | null
  onSignOut: () => void
  onProfileSaved: (me: { full_name: string; username: string }) => void
  onOpenAuth: () => void
}

export function AccountPane({
  session,
  onSignOut,
  onProfileSaved,
  onOpenAuth,
}: AccountPaneProps) {
  const {
    memberSince,
    fullName,
    setFullName,
    username,
    setUsername,
    profileMsg,
    profileBusy,
    submitProfile,
    current,
    setCurrent,
    next,
    setNext,
    pwMsg,
    pwBusy,
    submitPassword,
    confirmingSignOut,
    setConfirmingSignOut,
  } = useAccountSettings(session, onProfileSaved)

  if (!session) return <SignInPrompt onOpenAuth={onOpenAuth} />

  return (
    <div>
      <h3 className="settings-section-title">Account</h3>
      <form onSubmit={submitProfile} className="settings-form">
        <div className="field">
          <label htmlFor="settings-fullname">Full name</label>
          <input
            id="settings-fullname"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Asha Sharma"
            maxLength={100}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-username">Username</label>
          <input
            id="settings-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ashas"
            maxLength={40}
          />
        </div>
        {profileMsg && (
          <p
            className={profileMsg.ok ? 'settings-ok' : 'auth-error'}
            role="status"
          >
            {profileMsg.text}
          </p>
        )}
        <button type="submit" className="settings-button" disabled={profileBusy}>
          {profileBusy ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      <div className="settings-row">
        <span className="settings-key">Email</span>
        <span className="settings-value">{session.email}</span>
      </div>
      <p className="settings-lead">Email cannot be changed.</p>
      {memberSince !== '' && (
        <div className="settings-row">
          <span className="settings-key">Member since</span>
          <span className="settings-value">{formatDate(memberSince)}</span>
        </div>
      )}

      <h4 className="settings-sub">Support</h4>
      <a
        className="support-link"
        href={SUPPORT_URL}
        target="_blank"
        rel="noreferrer"
      >
        Get help on GitHub
        <ArrowSquareOut size={16} aria-hidden="true" />
      </a>

      <h4 className="settings-sub">Change password</h4>
      <form onSubmit={submitPassword}>
        <div className="field">
          <label htmlFor="settings-current">Current password</label>
          <input
            id="settings-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="settings-new">New password</label>
          <input
            id="settings-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {pwMsg && (
          <p className={pwMsg.ok ? 'settings-ok' : 'auth-error'} role="status">
            {pwMsg.text}
          </p>
        )}
        <button type="submit" className="settings-button" disabled={pwBusy}>
          {pwBusy ? 'Updating...' : 'Update password'}
        </button>
      </form>

      <h4 className="settings-sub">Session</h4>
      {!confirmingSignOut ? (
        <button
          type="button"
          className="settings-button ghost"
          onClick={() => setConfirmingSignOut(true)}
        >
          Sign out
        </button>
      ) : (
        <div className="confirm-box">
          <p>Sign out of {session.email}?</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="settings-button ghost"
              onClick={() => setConfirmingSignOut(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="settings-button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountPane
