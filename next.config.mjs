/** @type {import('next').NextConfig} */

// The app is same-origin (next/font self-hosts, QR is drawn client-side) and only
// talks to Supabase over https/wss. Scripts stay permissive ('unsafe-inline'/
// 'unsafe-eval') for the Next.js runtime, but external script/connect/frame
// origins are locked down as defense-in-depth.
// A violation currently happens in silence: script-src allows 'unsafe-inline'
// and 'unsafe-eval' (the Next.js runtime needs them, and the /live and /judge
// shells are raw HTML with dozens of inline handlers), so the policy is
// defence-in-depth only — and with no reporting there is no signal at all when
// something does trip it. CSP_REPORT_URI points at a collector and turns both
// report directives on; unset, the policy is exactly what it was, because a
// report-uri pointing nowhere makes every browser log a console error on every
// page load. report-uri is deprecated but still the only form Safari honours,
// so both are sent (browsers that support report-to ignore report-uri).
const reportUri = process.env.CSP_REPORT_URI?.trim();

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
  ...(reportUri ? [`report-uri ${reportUri}`, "report-to csp-endpoint"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Names the group `report-to` above refers to. Omitted with no collector
  // configured, so nothing advertises an endpoint that does not exist.
  ...(reportUri
    ? [
        {
          key: "Reporting-Endpoints",
          value: `csp-endpoint="${reportUri}"`,
        },
      ]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // drop the X-Powered-By: Next.js fingerprint
  // Nothing in the app imports next/image (banners are plain <img> with Supabase
  // storage URLs), so the optimizer is pure attack surface — several Next image
  // advisories land there. Disabling it removes the /_next/image endpoint.
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
