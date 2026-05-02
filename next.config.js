/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // ensure turbopack uses this folder as the workspace root
    root: __dirname
  }
};

module.exports = nextConfig;
