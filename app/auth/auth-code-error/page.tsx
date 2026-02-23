import Link from 'next/link'

export default function AuthCodeError() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Authentication error
        </h1>
        <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          Something went wrong during sign-in. Please try again.
        </p>
        <Link
          href="/login"
          className="underline font-medium"
          style={{ color: 'var(--primary-text)' }}
        >
          Back to login
        </Link>
      </div>
    </div>
  )
}
