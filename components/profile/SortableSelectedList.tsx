'use client'

import { useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTouchDevice } from '@/hooks/useTouchDevice'

export interface SortableItem {
  id: string
  label: string
  sublabel?: string
}

type WorkingItem =
  | (SortableItem & { type: 'item'; isRanked: boolean; originalIndex: number })
  | { id: string; type: 'divider' }

interface SortableSelectedListProps {
  items: SortableItem[]
  /** Index at which the divider appears. Items 0..rankCutoff-1 are ranked. */
  rankCutoff: number
  onReorder: (fromIndex: number, toIndex: number, newCutoff?: number) => void
  onRemove: (id: string) => void
  /** Which list is being ranked — drives empty-zone copy */
  variant?: 'skills' | 'values'
}

function SortableRow({
  item,
  index,
  isRanked,
  onRemove,
}: {
  item: SortableItem
  index: number
  isRanked: boolean
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = {
    // using Translate instead of Transform explicitly prevents dnd-kit from visually shrinking the item
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        isDragging
          ? 'bg-blue-50 border-blue-200 shadow-md dark:bg-blue-900/20 dark:border-blue-700'
          : 'bg-gray-50 border-gray-100 dark:bg-zinc-900 dark:border-zinc-800'
      }`}
    >
      {/* Rank badge or unranked dot */}
      {isRanked ? (
        <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center">
          {index + 1}
        </span>
      ) : (
        <span className="shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-zinc-500" />
        </span>
      )}

      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-zinc-600 dark:hover:text-zinc-400 touch-none p-1 -m-1"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-semibold truncate ${isRanked ? 'text-gray-800 dark:text-zinc-100' : 'text-gray-500 dark:text-zinc-400'}`}>
          {item.label}
        </p>
        {item.sublabel && (
          <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate">{item.sublabel}</p>
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="shrink-0 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
        aria-label={`Remove ${item.label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function SortableDivider({
  id,
  rankCutoff,
  total,
}: {
  id: string
  rankCutoff: number
  total: number
}) {
  const t = useTranslations('profile')
  const { setNodeRef, transform, transition } = useSortable({ id })
  // using Translate prevents weird scaling on the divider too
  const style = { transform: CSS.Translate.toString(transform), transition }

  const unrankedCount = total - rankCutoff
  const middle =
    rankCutoff > 0
      ? unrankedCount > 0
        ? `${t('sortablePrioritised', { count: rankCutoff })} · ${t('sortableUnordered', { count: unrankedCount })}`
        : t('sortablePrioritised', { count: rankCutoff })
      : t('sortableDragAbove')

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1 select-none pointer-events-none">
      <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 whitespace-nowrap">
        {middle}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
    </div>
  )
}

function StaticEmptyZone({ text }: { text: string }) {
  // Purely visual element, no droppable physics or active hover styling
  return (
    <div className="flex items-center justify-center rounded-lg border-2 border-dashed py-4 border-gray-200 bg-gray-50/30 dark:border-zinc-700 dark:bg-zinc-900/20">
      <span className="text-[11px] font-medium text-gray-400 dark:text-zinc-500">
        {text}
      </span>
    </div>
  )
}

export default function SortableSelectedList({
  items,
  rankCutoff,
  onReorder,
  onRemove,
  variant = 'skills',
}: SortableSelectedListProps) {
  const t = useTranslations('profile')
  const isTouch = useTouchDevice()
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  
  const sensors = useSensors(
    // On touch devices use TouchSensor (long-press); on desktop use PointerSensor (drag distance).
    ...(isTouch ? [touchSensor] : [pointerSensor]),
    keyboardSensor
  )

  // We map the real items and inject a special "dummy" item for the divider.
  // The empty zones are now static visual areas completely outside the SortableContext.
  const workingItems = useMemo<WorkingItem[]>(() => {
    const clampedCutoff = Math.min(rankCutoff, items.length)
    const ranked: WorkingItem[] = items.slice(0, clampedCutoff).map((item, i) => ({ ...item, type: 'item', isRanked: true, originalIndex: i }))
    const divider: WorkingItem = { id: '__divider__', type: 'divider' }
    const unranked: WorkingItem[] = items.slice(clampedCutoff).map((item, i) => ({ ...item, type: 'item', isRanked: false, originalIndex: clampedCutoff + i }))
    return [...ranked, divider, ...unranked]
  }, [items, rankCutoff])

  const sortableIds = useMemo(() => workingItems.map(i => i.id), [workingItems])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = workingItems.findIndex(i => i.id === active.id)
    const newIndex = workingItems.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Apply the reorder to our virtual list containing the dummy divider
    const newWorkingOrder = arrayMove(workingItems, oldIndex, newIndex)

    // The new rankCutoff is exactly where the divider ended up
    const newCutoff = newWorkingOrder.findIndex(i => i.type === 'divider')
    const realItems = newWorkingOrder.filter(i => i.type !== 'divider')

    const fromIndex = items.findIndex(i => i.id === active.id)
    const toIndex = realItems.findIndex(i => i.id === active.id)

    onReorder(fromIndex, toIndex, newCutoff)
  }, [workingItems, items, onReorder])

  if (items.length === 0) return null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-1.5">

        {rankCutoff === 0 && (
          <StaticEmptyZone text={t(variant === 'values' ? 'sortableDragValuesHere' : 'sortableDragSkillsHere')} />
        )}

        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {workingItems.map(item => {
            if (item.type === 'divider') {
              return (
                <SortableDivider
                  key={item.id}
                  id={item.id}
                  rankCutoff={rankCutoff}
                  total={items.length}
                />
              )
            }
            return (
              <SortableRow
                key={item.id}
                item={item}
                index={item.originalIndex}
                isRanked={item.isRanked}
                onRemove={onRemove}
              />
            )
          })}
        </SortableContext>

        {rankCutoff === items.length && items.length > 0 && (
          <StaticEmptyZone text={t('sortableDragDownUnprioritise')} />
        )}

      </div>
    </DndContext>
  )
}
