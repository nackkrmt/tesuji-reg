/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // react-pdf / pdfjs-dist pulls in an optional Node-only "canvas" dependency
    // that must not be bundled for the browser (the viewer is client-only).
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
