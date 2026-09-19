export function SignInPrompt({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <div>
      <p className="settings-lead">Sign in to use this section.</p>
      <button type="button" className="ask-button" onClick={onOpenAuth}>
        Sign in
      </button>
    </div>
  )
}

export default SignInPrompt
