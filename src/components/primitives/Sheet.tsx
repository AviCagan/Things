import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Icon } from './Icon'
import { fire } from '@/lib/haptics'

/** Bottom sheet with drag-to-dismiss. Every modal surface in the app uses it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  maxHeight = '86vh',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  maxHeight?: string
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[80]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              fire('tap')
              onClose()
            }}
            style={{ background: 'rgb(0 0 0 / 0.5)', backdropFilter: 'blur(3px)' }}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[81] flex flex-col safe-bottom"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 550) {
                fire('tap')
                onClose()
              }
            }}
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: '26px 26px 0 0',
              borderTop: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              maxHeight,
            }}
          >
            <div className="grid shrink-0 place-items-center pt-3 pb-1">
              <div
                className="h-1 w-10 rounded-full"
                style={{ background: 'var(--border-strong)' }}
              />
            </div>

            {title && (
              <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
                <h2 className="text-[17px] font-semibold">{title}</h2>
                <button
                  onClick={() => {
                    fire('tap')
                    onClose()
                  }}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-dim)' }}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
            )}

            <div className="scroll-y min-h-0 flex-1 px-5 pb-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
