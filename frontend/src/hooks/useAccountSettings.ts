import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { changePassword, fetchMe, updateProfile } from '../api'
import type { Session } from '../types'

export interface FeedbackMsg {
  ok: boolean
  text: string
}

export function useAccountSettings(
  session: Session | null,
  onProfileSaved: (me: { full_name: string; username: string }) => void,
) {
  const [memberSince, setMemberSince] = useState('')
  const [fullName, setFullName] = useState(session?.full_name ?? '')
  const [username, setUsername] = useState(session?.username ?? '')
  const [profileMsg, setProfileMsg] = useState<FeedbackMsg | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pwMsg, setPwMsg] = useState<FeedbackMsg | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  useEffect(() => {
    if (!session) return
    fetchMe(session.token)
      .then((me) => setMemberSince(me.created_at))
      .catch(() => undefined)
  }, [session])

  const token = session?.token ?? ''

  async function submitProfile(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (profileBusy || !token) return
    setProfileMsg(null)
    setProfileBusy(true)
    try {
      const me = await updateProfile(token, {
        full_name: fullName.trim(),
        username: username.trim(),
      })
      setFullName(me.full_name)
      setUsername(me.username)
      onProfileSaved({ full_name: me.full_name, username: me.username })
      setProfileMsg({ ok: true, text: 'Profile saved.' })
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not save profile.',
      })
    } finally {
      setProfileBusy(false)
    }
  }

  async function submitPassword(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (pwBusy || !token) return
    setPwMsg(null)
    setPwBusy(true)
    try {
      await changePassword(token, current, next)
      setCurrent('')
      setNext('')
      setPwMsg({ ok: true, text: 'Password updated.' })
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not update password.',
      })
    } finally {
      setPwBusy(false)
    }
  }

  return {
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
  }
}
