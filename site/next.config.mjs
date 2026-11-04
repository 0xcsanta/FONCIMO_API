/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const repoBase = "/FONCIMO_API";

const nextConfig = {
  // Static HTML export so the site can be served by GitHub Pages
  output: "export",
  // GitHub Pages serves a project site under /<repo>, so prefix in prod only
  basePath: isProd ? repoBase : "",
  assetPrefix: isProd ? repoBase + "/" : "",
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
