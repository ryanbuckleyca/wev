import Link from 'next/link'
import { headers } from 'next/headers'

async function detectLocaleFromHeaders(): Promise<string> {
  try {
    const headersList = await headers()
    const acceptLanguage = headersList.get('accept-language')
    
    if (acceptLanguage) {
      // Check if French is preferred (simple check for 'fr' in Accept-Language)
      const languages = acceptLanguage.toLowerCase().split(',')
      for (const lang of languages) {
        const langCode = lang.split(';')[0].trim()
        if (langCode.startsWith('fr')) {
          return 'fr'
        }
        if (langCode.startsWith('en')) {
          return 'en'
        }
      }
    }
  } catch (error) {
    // If headers() fails, fallback to default
    console.error('Error reading headers:', error)
  }
  
  // Default to 'en' if we can't determine
  return 'en'
}

export default async function AuthCodeError() {
  const locale = await detectLocaleFromHeaders()
  const loginHref = `/${locale}/login`

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
          href={loginHref}
          className="underline font-medium"
          style={{ color: 'var(--primary-text)' }}
        >
          Back to login
        </Link>
      </div>
    </div>
  )
}
