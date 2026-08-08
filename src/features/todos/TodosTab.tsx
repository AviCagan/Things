import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Screen, Section, EmptyState } from '@/components/shell/Screen'
import { ListRow } from '@/components/primitives/ListRow'
import { Icon } from '@/components/primitives/Icon'
import { useData, dataActions } from '@/store/useData'
import { useProfile } from '@/store/useProfile'
import type { Todo, Urgency } from '@/data/types'

/** Urgent first, then newest. Completed items fall out to the Done section. */
function sortTodos(a: Todo, b: Todo) {
  if (a.urgency !== b.urgency) return b.urgency - a.urgency
  return b.sort_order - a.sort_order
}

export function TodosTab() {
  const todos = useData((s) => s.todos)
  const profiles = useData((s) => s.profiles)
  const profileId = useProfile((s) => s.profileId)

  const { active, done } = useMemo(() => {
    const sorted = [...todos].sort(sortTodos)
    return {
      active: sorted.filter((t) => !t.is_done),
      done: sorted
        .filter((t) => t.is_done)
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    }
  }, [todos])

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? 'Someone'

  return (
    <Screen title="To-do" count={active.length}>
      {active.length === 0 && done.length === 0 ? (
        <EmptyState
          icon={<Icon name="check" size={44} strokeWidth={1.5} />}
          title="All clear"
          hint="Type below to add the first thing. Swipe a row right to finish it, left to claim it."
        />
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {active.map((todo) => (
              <motion.div
                key={todo.id}
                layout
                layoutId={`todo-${todo.id}`}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              >
                <ListRow
                  title={todo.title}
                  urgency={todo.urgency}
                  claimedBy={todo.claimed_by}
                  profiles={profiles}
                  onComplete={() => dataActions.toggleTodo(todo, profileId)}
                  onClaim={() =>
                    profileId &&
                    dataActions.toggleClaim(
                      'todos',
                      todo.id,
                      profileId,
                      todo.claimed_by,
                      nameOf,
                    )
                  }
                  onUrgency={(u: Urgency) => dataActions.setUrgency('todos', todo.id, u)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Section label="Done" count={done.length}>
        {done.map((todo) => (
          <ListRow
            key={todo.id}
            title={todo.title}
            urgency={todo.urgency}
            claimedBy={todo.claimed_by}
            profiles={profiles}
            done
            meta={
              todo.completed_by ? (
                <span>Finished by {nameOf(todo.completed_by)}</span>
              ) : undefined
            }
            trailing={
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void dataActions.remove('todos', todo.id)
                }}
                aria-label="Delete"
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ color: 'var(--text-faint)' }}
              >
                <Icon name="trash" size={16} />
              </button>
            }
            onComplete={() => dataActions.toggleTodo(todo, profileId)}
            onClaim={() => {}}
            onUrgency={(u: Urgency) => dataActions.setUrgency('todos', todo.id, u)}
          />
        ))}
      </Section>
    </Screen>
  )
}
