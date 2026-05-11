import type { StateCreator } from 'zustand'

type StorageLike = {
  getItem: (name: string) => string | null | Promise<string | null>
  setItem: (name: string, value: string) => void | Promise<void>
  removeItem: (name: string) => void | Promise<void>
}

type PersistOptions<T> = {
  name: string
  storage: StorageLike
  partialize?: (state: T) => Partial<T>
}

export function persistState<T extends object>(
  initializer: StateCreator<T, [], []>,
  options: PersistOptions<T>
): StateCreator<T, [], []> {
  return (set, get, api) => {
    let hydrated = false

    const write = () => {
      if (!hydrated) return
      const state = options.partialize ? options.partialize(get()) : get()
      void Promise.resolve(
        options.storage.setItem(options.name, JSON.stringify({ state }))
      ).catch(() => {})
    }

    const persistedSet: typeof set = ((partial, replace) => {
      set(partial as never, replace as never)
      write()
    }) as typeof set

    const initialState = initializer(persistedSet, get, api)

    Promise.resolve(options.storage.getItem(options.name))
      .then((raw) => {
        if (!raw) return
        const parsed = JSON.parse(raw)
        const state = parsed?.state ?? parsed
        if (state && typeof state === 'object') set(state)
      })
      .catch(() => {})
      .finally(() => {
        hydrated = true
      })

    return initialState
  }
}

