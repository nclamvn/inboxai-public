'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface SelectionContextType {
  selectedIds: Set<string>
  isSelecting: boolean
  toggleSelect: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  selectRange: (ids: string[], fromId: string, toId: string) => void
  isSelected: (id: string) => boolean
}

const SelectionContext = createContext<SelectionContextType | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const selectRange = useCallback((ids: string[], fromId: string, toId: string) => {
    const fromIndex = ids.indexOf(fromId)
    const toIndex = ids.indexOf(toId)
    if (fromIndex === -1 || toIndex === -1) return

    const start = Math.min(fromIndex, toIndex)
    const end = Math.max(fromIndex, toIndex)
    const rangeIds = ids.slice(start, end + 1)

    setSelectedIds(prev => {
      const next = new Set(prev)
      rangeIds.forEach(id => next.add(id))
      return next
    })
  }, [])

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id)
  }, [selectedIds])

  return (
    <SelectionContext.Provider
      value={{
        selectedIds,
        isSelecting: selectedIds.size > 0,
        toggleSelect,
        selectAll,
        clearSelection,
        selectRange,
        isSelected,
      }}
    >
      {children}
    </SelectionContext.Provider>
  )
}

export function useSelection() {
  const context = useContext(SelectionContext)
  if (!context) {
    throw new Error('useSelection must be used within SelectionProvider')
  }
  return context
}
