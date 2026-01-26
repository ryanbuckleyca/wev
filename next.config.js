const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
// Also try loading from current directory as fallback
require('dotenv').config({ path: path.join(__dirname, '.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Removed 'output: export' to enable SSR/hybrid mode
  // This allows API routes and server-side rendering
}

module.exports = nextConfig
