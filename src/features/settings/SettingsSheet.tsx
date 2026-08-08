import { useState, type ReactNode } from 'react'
import { Sheet } from '@/components/primitives/Sheet'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { useUI } from '@/store/useUI'
import { useCurrentProfile, useProfile, useSettings, updateSettings } from '@/store/useProfile'
import { fire, ALL_HAPTIC_EVENTS, hasRealHaptics } from '@/lib/haptics'
import { unlockAudio } from '@/lib/sound'
import { isIOS, isNative } from '@/lib/platform'
import { enablePush, pushState, type PushState } from '@/lib/notifications'
import { fileToAvatarDataUrl, dataUrlBytes } from '@/lib/image'
import { Avatar } from '@/components/primitives/ClaimChip'
import { toast } from 'sonner'
import type { Profile } from '@/data/types'
import type {
  HapticIntensity,
  NavApp,
  ThemeMode,
  HapticEventName,
  NotifyEvent,
} from '@/data/types'

const ACCENTS = [
  '#7c5cff', '#ff6ea9', '#3aa0ff', '#2bb673',
  '#f5a524', '#e0563c', '#00c2b8', '#b06cff',
]

const THEMES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'oled', label: 'OLED' },
]

const INTENSITIES: { key: HapticIntensity; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: 'subtle', label: 'Subtle' },
  { key: 'normal', label: 'Normal' },
  { key: 'heavy', label: 'Heavy' },
]

const NAV_APPS: { key: NavApp; label: string }[] = [
  { key: 'google', label: 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  { key: 'apple', label: 'Apple Maps' },
]

export function SettingsSheet() {
  const sheet = useUI((s) => s.sheet)
  const closeSheet = useUI((s) => s.closeSheet)
  const profile = useCurrentProfile()
  const settings = useSettings()
  const household = useData((s) => s.household_settings)[0]

  const [home, setHome] = useState(household?.home_address ?? '')
  const [showHaptics, setShowHaptics] = useState(false)

  if (!profile || !settings) return null
  const id = profile.id

  const set = (patch: Parameters<typeof updateSettings>[1]) =>
    void updateSettings(id, patch)

  return (
    <Sheet open={sheet.kind === 'settings'} onClose={closeSheet} title="Settings">
      <div className="flex flex-col gap-7 pb-6">
        <Group label={`${profile.display_name}'s look`}>
          <AvatarRow profile={profile} />

          <Row label="Theme" stacked>
            <div className="pt-2">
              <Segmented
                options={THEMES.map((t) => ({ key: t.key, label: t.label }))}
                value={settings.theme_mode}
                onChange={(v) => set({ theme_mode: v as ThemeMode })}
              />
            </div>
          </Row>

          <Row label="Accent" stacked>
            <div className="flex flex-wrap gap-2 pt-1">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    fire('snap')
                    set({ accent_hex: c })
                  }}
                  aria-label={`Accent ${c}`}
                  className="h-8 w-8 rounded-full"
                  style={{
                    background: c,
                    outline: settings.accent_hex === c ? '2px solid var(--text)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Row>

          <Row label="Text size" stacked>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>A</span>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={settings.font_scale}
                onChange={(e) => set({ font_scale: parseFloat(e.target.value) })}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="text-[19px]" style={{ color: 'var(--text-faint)' }}>A</span>
            </div>
          </Row>

          <Toggle
            label="Reduce motion"
            hint="Fades instead of springs"
            value={settings.reduce_motion}
            onChange={(v) => set({ reduce_motion: v })}
          />
        </Group>

        <Group label="Feel">
          {!hasRealHaptics() && (
            <p
              className="rounded-2xl p-3.5 text-[13px] leading-relaxed"
              style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
            >
              {isIOS()
                ? "iOS doesn't let web apps trigger haptics, so this device uses a visual pulse (and sound, if on) instead."
                : "This device doesn't report haptic support — you'll get the visual pulse instead."}
            </p>
          )}

          <Row label="Haptic strength" stacked>
            <div className="pt-2">
              <Segmented
                options={INTENSITIES.map((i) => ({ key: i.key, label: i.label }))}
                value={settings.haptic_intensity}
                onChange={(v) => {
                  set({ haptic_intensity: v as HapticIntensity })
                  // Fire a sample so the new strength is felt straight away.
                  setTimeout(() => fire('claim'), 60)
                }}
              />
            </div>
          </Row>

          <Toggle
            label="Sounds"
            hint="Short synthesised ticks on actions"
            value={settings.sound_enabled}
            onChange={(v) => {
              unlockAudio()
              set({ sound_enabled: v })
            }}
          />

          {isIOS() && !isNative() && (
            <Toggle
              label="Native iOS switch"
              hint="Experimental: uses Apple's switch control on the checkbox, which can produce a real haptic on iOS 17.4+. Apple may remove this at any time."
              value={settings.ios_native_switch}
              onChange={(v) => set({ ios_native_switch: v })}
            />
          )}

          <button
            onClick={() => {
              fire('tap')
              setShowHaptics((s) => !s)
            }}
            className="flex items-center justify-between rounded-2xl px-4 py-3.5"
            style={{ background: 'var(--surface-2)' }}
          >
            <span className="text-[14px]">Test & fine-tune each buzz</span>
            <Icon name="chevron" size={15} />
          </button>

          {showHaptics && (
            <div className="flex flex-col gap-1.5 pt-1">
              {ALL_HAPTIC_EVENTS.map((event) => {
                const on = settings.haptic_events[event] !== false
                return (
                  <div
                    key={event}
                    className="flex items-center gap-2.5 rounded-2xl px-4 py-3"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    <span className="flex-1 text-[13px]">{labelFor(event)}</span>
                    <button
                      onClick={() => fire(event)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
                    >
                      Test
                    </button>
                    <Switch
                      value={on}
                      onChange={(v) =>
                        set({
                          haptic_events: { ...settings.haptic_events, [event]: v },
                        })
                      }
                    />
                  </div>
                )
              })}
            </div>
          )}
        </Group>

        <Group label="Getting around">
          <Row label="Navigate with" stacked>
            <div className="pt-1">
              <Segmented
                options={NAV_APPS.map((n) => ({ key: n.key, label: n.label }))}
                value={settings.nav_app}
                onChange={(v) => set({ nav_app: v as NavApp })}
              />
              {settings.nav_app === 'waze' && (
                <p className="pt-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>
                  Waze can only navigate to one place at a time, so trips are handed
                  over stop by stop. The other apps stay available on every trip.
                </p>
              )}
            </div>
          </Row>

          <Row label="Home address" stacked>
            <div className="flex gap-2 pt-1">
              <input
                value={home}
                onChange={(e) => setHome(e.target.value)}
                placeholder="Street, city — or paste lat, lng"
                className="min-w-0 flex-1 rounded-xl px-3.5 py-3 text-[14px] outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              />
              <button
                onClick={() => {
                  fire('success')
                  // Clear cached coords so the new address gets re-geocoded.
                  void dataActions.patchRow('household_settings', 'singleton', {
                    home_address: home.trim() || null,
                    home_lat: null,
                    home_lng: null,
                  })
                }}
                className="shrink-0 rounded-xl px-4 text-[14px] font-semibold text-white"
                style={{ background: 'var(--accent)' }}
              >
                Save
              </button>
            </div>
            <p className="pt-1 text-[12px]" style={{ color: 'var(--text-faint)' }}>
              Shared by both of you. Every trip starts and ends here.
            </p>
          </Row>
        </Group>

        <NotificationsGroup profileId={id} settings={settings} onSet={set} />

        <Group label="Account">
          <button
            onClick={() => {
              fire('tap')
              closeSheet()
              void useProfile.getState().clearProfile()
            }}
            className="flex items-center justify-between rounded-2xl px-4 py-4"
            style={{ background: 'var(--surface-2)' }}
          >
            <span className="text-[14px]">
              Switch from {profile.display_name}
            </span>
            <Icon name="chevron" size={15} />
          </button>
        </Group>
      </div>
    </Sheet>
  )
}

const NOTIFY_EVENTS: { key: NotifyEvent; label: string; hint: string }[] = [
  {
    key: 'claim_complete',
    label: 'Claims & completions',
    hint: 'When something you added gets taken or finished',
  },
  {
    key: 'cooldown_ready',
    label: 'Chore ready again',
    hint: 'When a recurring chore comes off cooldown',
  },
  { key: 'urgent_added', label: 'Urgent items', hint: 'Only the top urgency level' },
  { key: 'any_added', label: 'Anything added', hint: 'Every new item on any list' },
]

function NotificationsGroup({
  profileId,
  settings,
  onSet,
}: {
  profileId: string
  settings: import('@/data/types').ProfileSettings
  onSet: (patch: Partial<import('@/data/types').ProfileSettings>) => void
}) {
  const [state, setState] = useState<PushState>(() => pushState())
  const [busy, setBusy] = useState(false)

  async function turnOn() {
    setBusy(true)
    // Must run inside this click — a permission prompt outside a user gesture
    // is refused, and on iOS a refusal sticks until the icon is reinstalled.
    const next = await enablePush(profileId)
    setState(next)
    fire(next === 'granted' ? 'success' : 'warning')
    setBusy(false)
  }

  return (
    <Group label="Notifications">
      {state === 'needs-install' && (
        <p
          className="rounded-2xl p-3.5 text-[13px] leading-relaxed"
          style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
        >
          Add Things to your Home Screen first, then open it from that icon.
          iOS only delivers notifications to installed web apps — not Safari tabs.
        </p>
      )}

      {state === 'unsupported' && (
        <p
          className="rounded-2xl p-3.5 text-[13px] leading-relaxed"
          style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
        >
          This browser can't receive notifications.
        </p>
      )}

      {state === 'denied' && (
        <p
          className="rounded-2xl p-3.5 text-[13px] leading-relaxed"
          style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
        >
          Notifications are blocked. Turn them back on in your device settings
          for Things.
        </p>
      )}

      {(state === 'default' || state === 'granted') && (
        <button
          onClick={turnOn}
          disabled={busy || state === 'granted'}
          className="flex items-center justify-between rounded-2xl px-4 py-4 disabled:opacity-70"
          style={{
            background: state === 'granted' ? 'var(--surface-2)' : 'var(--accent)',
            color: state === 'granted' ? 'var(--text)' : '#fff',
          }}
        >
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <Icon name="bell" size={16} />
            {state === 'granted'
              ? 'Notifications are on'
              : busy
                ? 'Asking…'
                : 'Turn on notifications'}
          </span>
          {state === 'granted' && <Icon name="check" size={16} strokeWidth={2.6} />}
        </button>
      )}

      {NOTIFY_EVENTS.map((e) => (
        <Toggle
          key={e.key}
          label={e.label}
          hint={e.hint}
          value={settings.notify_events[e.key] !== false}
          onChange={(v) =>
            onSet({ notify_events: { ...settings.notify_events, [e.key]: v } })
          }
        />
      ))}

      {settings.notify_events.any_added !== false && (
        <p className="px-1 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          "Anything added" already covers urgent items, so you'll still only get
          one notification per item.
        </p>
      )}
    </Group>
  )
}

/** Profile photo: pick, downscale, store. Emoji stays as the fallback. */
function AvatarRow({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      if (dataUrlBytes(dataUrl) > 400_000) {
        throw new Error('That image is too large even after resizing')
      }
      await dataActions.patchRow('profiles', profile.id, { avatar_url: dataUrl })
      fire('success')
    } catch (err) {
      fire('error')
      toast.error(err instanceof Error ? err.message : "Couldn't use that photo")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
      style={{ background: 'var(--surface-2)' }}
    >
      <span
        className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full text-[26px]"
        style={{
          background: `color-mix(in oklab, ${profile.color_hex} 24%, transparent)`,
          border: `2px solid ${profile.color_hex}`,
        }}
      >
        <Avatar profile={profile} size={56} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">Your photo</div>
        <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
          {profile.avatar_url ? 'Shown wherever you appear' : 'Using your emoji for now'}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {profile.avatar_url && (
          <button
            onClick={() => {
              fire('delete')
              void dataActions.patchRow('profiles', profile.id, { avatar_url: null })
            }}
            className="rounded-full px-3 py-2 text-[12px] font-medium"
            style={{ background: 'var(--surface-3)', color: 'var(--text-dim)' }}
          >
            Remove
          </button>
        )}
        <label
          className="cursor-pointer rounded-full px-3 py-2 text-[12px] font-semibold text-white"
          style={{ background: 'var(--accent)', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Saving…' : profile.avatar_url ? 'Change' : 'Add'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}

function labelFor(event: HapticEventName): string {
  const map: Record<HapticEventName, string> = {
    tap: 'Tap',
    toggleOn: 'Switch on',
    toggleOff: 'Switch off',
    claim: 'Claiming something',
    complete: 'Completing something',
    delete: 'Deleting',
    swipeThreshold: 'Swipe hits the line',
    longPress: 'Long press',
    dragStart: 'Starting a drag',
    snap: 'Small ticks',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
  }
  return map[event]
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3
        className="px-1 pb-0.5 text-[12px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-faint)' }}
      >
        {label}
      </h3>
      {children}
    </section>
  )
}

function Row({
  label,
  children,
  stacked = false,
}: {
  label: string
  children: ReactNode
  stacked?: boolean
}) {
  return (
    <div
      className={`rounded-2xl px-4 py-3.5 ${stacked ? '' : 'flex items-center justify-between gap-3'}`}
      style={{ background: 'var(--surface-2)' }}
    >
      <span className="text-[14px]">{label}</span>
      {children}
    </div>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px]">{label}</div>
        {hint && (
          <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
            {hint}
          </div>
        )}
      </div>
      <Switch value={value} onChange={onChange} />
    </div>
  )
}

function Switch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => {
        fire(value ? 'toggleOff' : 'toggleOn')
        onChange(!value)
      }}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ background: value ? 'var(--accent)' : 'var(--surface-3)' }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
        style={{ left: 2, transform: `translateX(${value ? 20 : 0}px)` }}
      />
    </button>
  )
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      className="flex gap-1 rounded-full p-1.5"
      style={{ background: 'var(--surface-3)' }}
    >
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => {
              fire('snap')
              onChange(o.key)
            }}
            className="flex-1 whitespace-nowrap rounded-full px-3 py-2.5 text-[13px] font-medium transition-colors"
            style={{
              background: on ? 'var(--accent)' : 'transparent',
              color: on ? '#fff' : 'var(--text-dim)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
