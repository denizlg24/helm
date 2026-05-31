/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/module-registry", "@workspace/ui"],
  async redirects() {
    return [
      {
        source: "/settings/:path+",
        destination: "/:path+",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
