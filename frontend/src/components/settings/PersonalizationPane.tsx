import type { Profile } from '../../types'

export interface PersonalizationPaneProps {
  profile: Profile
  onProfile: (profile: Profile) => void
}

export function PersonalizationPane({
  profile,
  onProfile,
}: PersonalizationPaneProps) {
  function set(patch: Partial<Profile>): void {
    onProfile({ ...profile, ...patch })
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <p className="settings-lead">
        Tell Verixa about yourself and how to answer. Saved automatically on
        this device and sent with every question.
      </p>
      <div className="field">
        <label htmlFor="settings-name">What should Verixa call you?</label>
        <input
          id="settings-name"
          type="text"
          autoComplete="nickname"
          value={profile.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Asha"
          maxLength={100}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="settings-occupation">Occupation</label>
          <input
            id="settings-occupation"
            type="text"
            autoComplete="organization-title"
            value={profile.occupation}
            onChange={(e) => set({ occupation: e.target.value })}
            placeholder="Nurse"
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-company">Company</label>
          <input
            id="settings-company"
            type="text"
            autoComplete="organization"
            value={profile.company}
            onChange={(e) => set({ company: e.target.value })}
            placeholder="Patan Hospital"
            maxLength={120}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="settings-dob">Date of birth</label>
          <input
            id="settings-dob"
            type="date"
            value={profile.dob}
            max={today}
            onChange={(e) => set({ dob: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="settings-gender">Gender</label>
          <select
            id="settings-gender"
            value={profile.gender}
            onChange={(e) => set({ gender: e.target.value })}
          >
            <option value="">Select...</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="nonbinary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="settings-instructions">Custom instructions</label>
        <textarea
          id="settings-instructions"
          value={profile.instructions}
          onChange={(e) => set({ instructions: e.target.value })}
          placeholder="Example: keep answers short and skip the background."
          rows={4}
          maxLength={2000}
        />
      </div>

      <h4 className="settings-sub">Location</h4>
      <label className="switch-row" htmlFor="settings-shareloc">
        <span className="switch-text">
          <span className="switch-title">Share location</span>
          <span className="switch-sub">
            Uses your city or country for locally relevant answers.
          </span>
        </span>
        <input
          id="settings-shareloc"
          type="checkbox"
          className="switch"
          checked={profile.shareLocation}
          onChange={(e) => set({ shareLocation: e.target.checked })}
        />
      </label>
      {profile.shareLocation && (
        <div className="field">
          <label htmlFor="settings-location">City or country</label>
          <input
            id="settings-location"
            type="text"
            autoComplete="country-name"
            value={profile.location}
            onChange={(e) => set({ location: e.target.value })}
            placeholder="Lalitpur, Nepal"
            maxLength={120}
          />
        </div>
      )}

      <h4 className="settings-sub">Response preferences</h4>
      <div className="field-row">
        <div className="field">
          <label htmlFor="settings-length">Response length</label>
          <select
            id="settings-length"
            value={profile.responseLength}
            onChange={(e) =>
              set({
                responseLength: e.target.value as Profile['responseLength'],
              })
            }
          >
            <option value="short">Short</option>
            <option value="default">Default</option>
            <option value="long">Long</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="settings-format">Headers and lists</label>
          <select
            id="settings-format"
            value={profile.responseFormat}
            onChange={(e) =>
              set({
                responseFormat: e.target.value as Profile['responseFormat'],
              })
            }
          >
            <option value="lists">Lists</option>
            <option value="default">Default</option>
            <option value="paragraph">Paragraph</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export default PersonalizationPane
