/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@workspace/auth",
    "@workspace/module-registry",
    "@workspace/ui",
    "@workspace/api-client",
    "@workspace/assistant",
    "@workspace/types",
  ],
}

export default nextConfig
