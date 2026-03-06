const path = require('path')
const createNextIntlPlugin = require('next-intl/plugin')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
// Also try loading from current directory as fallback
require('dotenv').config({ path: path.join(__dirname, '.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removed 'output: export' to enable SSR/hybrid mode
  // This allows API routes and server-side rendering
  turbopack: {
    root: __dirname,
  },
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

module.exports = withNextIntl(nextConfig)
