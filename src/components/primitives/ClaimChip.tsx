import { motion } from 'motion/react'
import type { Profile } from '@/data/types'

/**
 * Who's taken this. Unclaimed is a dashed ghost so an empty slot still reads as
 * "you could take this" rather than as blank space.
 */
export function ClaimChip({
  claimedBy,
  profiles,
  onClick,
  size = 30,
}: {
  claimedBy: string | null
  profiles: Profile[]
  onClick?: () => void
  size?: number
}) {
  const owner = profiles.find((p) => p.id === claimedBy) ?? null

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      aria-label={owner ? `Claimed by ${owner.display_name}` : 'Unclaimed — tap to claim'}
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size }}
    >
      {owner ? (
        <motion.span
          key={owner.id}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          className="grid h-full w-full place-items-center rounded-full"
          style={{
            background: `color-mix(in oklab, ${owner.color_hex} 26%, transparent)`,
            border: `1.5px solid ${owner.color_hex}`,
            fontSize: size * 0.5,
            lineHeight: 1,
          }}
          title={owner.display_name}
        >
          {owner.avatar_emoji}
        </motion.span>
      ) : (
        <span
          className="h-full w-full rounded-full"
          style={{ border: '1.5px dashed var(--border-strong)' }}
        />
      )}
    </button>
  )
}
