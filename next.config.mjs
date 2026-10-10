/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/documents": ["./node_modules/@opendataloader/pdf/lib/*.jar"],
    },
  },
};

export default nextConfig;