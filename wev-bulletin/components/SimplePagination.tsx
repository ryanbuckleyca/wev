import Link from 'next/link';

interface SimplePaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
}

export default function SimplePagination({ currentPage, totalPages, baseUrl }: SimplePaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <div className="flex items-center justify-center gap-4 py-6">
      {hasPrev ? (
        <Link
          href={`${baseUrl}?page=${currentPage - 1}`}
          className="px-4 py-2 text-sm font-medium border border-border rounded-wev-btn bg-background text-foreground hover:bg-muted transition-colors"
        >
          Previous
        </Link>
      ) : (
        <div className="px-4 py-2 text-sm font-medium border border-border rounded-wev-btn bg-muted text-muted-foreground opacity-50 cursor-not-allowed">
          Previous
        </div>
      )}

      <span className="text-sm font-medium text-foreground">
        Page {currentPage} of {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={`${baseUrl}?page=${currentPage + 1}`}
          className="px-4 py-2 text-sm font-medium border border-border rounded-wev-btn bg-background text-foreground hover:bg-muted transition-colors"
        >
          Next
        </Link>
      ) : (
        <div className="px-4 py-2 text-sm font-medium border border-border rounded-wev-btn bg-muted text-muted-foreground opacity-50 cursor-not-allowed">
          Next
        </div>
      )}
    </div>
  );
}
