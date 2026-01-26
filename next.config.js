const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
// Also try loading from current directory as fallback
require('dotenv').config({ path: path.join(__dirname, '.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export', // Enable static export for GitHub Pages
  images: {
    unoptimized: true, // Required for static export
  },
}

module.exports = nextConfig
