import { Search, X, Loader2 } from 'lucide-react'
import { Command } from 'cmdk'
import { useTranslations } from 'next-intl'

interface SkillSearchInputProps {
  query: string
  onQueryChange: (value: string) => void
  isSearching: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  onClear: () => void
  placeholder?: string
}

export default function SkillSearchInput({
  query,
  onQueryChange,
  isSearching,
  inputRef,
  onClear,
  placeholder,
}: SkillSearchInputProps) {
  const t = useTranslations('profile')

  return (
    <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 transition-all focus-within:border-gray-200 focus-within:ring-2 focus-within:ring-gray-100/50 dark:bg-zinc-900/50 dark:border-zinc-800 dark:focus-within:border-zinc-700 dark:focus-within:ring-zinc-800/50">
      <Search className="h-4 w-4 shrink-0 text-gray-400" />
      <Command.Input
        ref={inputRef}
        value={query}
        onValueChange={onQueryChange}
        placeholder={placeholder || t('skillsPlaceholder')}
        className="min-w-0 flex-1 bg-transparent text-base sm:text-[13px] font-medium text-foreground outline-none placeholder:text-gray-400"
      />
      {isSearching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      {query && !isSearching && (
        <button 
          onClick={onClear}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
