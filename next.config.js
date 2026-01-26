const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
// Also try loading from current directory as fallback
require('dotenv').config({ path: path.join(__dirname, '.env') })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
