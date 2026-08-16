/**
 * What's actually installed, in one place — see vite.config.ts for why.
 */
export const BUILD_SHA = __BUILD_SHA__
export const BUILD_TIME = __BUILD_TIME__
export const BUILD_RUN = __BUILD_RUN__

/** "54c61f0 · run 42 · Aug 16, 3:41 PM" — short enough for a settings footer. */
export function buildLabel(): string {
  const date = new Date(BUILD_TIME)
  const when = Number.isNaN(date.getTime())
    ? BUILD_TIME
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
  const run = BUILD_RUN ? ` · run ${BUILD_RUN}` : ''
  return `${BUILD_SHA}${run} · ${when}`
}
