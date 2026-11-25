/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: { serverComponentsExternalPackages: ["postgres", "nodemailer", "exceljs"], instrumentationHook: true, serverActions: { bodySizeLimit: "20mb" },
    // Node 22+ resolve "module-sync" para require.mjs, que o rastreio de arquivos do Next não copia sozinho (exceljs depende disso).
    outputFileTracingIncludes: { "/**/*": ["./node_modules/*/require.mjs"] } },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};
export default nextConfig;
