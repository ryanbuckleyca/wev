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
}

const withNextIntl = createNextIntlPlugin()

module.exports = withNextIntl(nextConfig)
