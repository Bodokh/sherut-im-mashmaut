import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/flyers/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/he" },
      { source: "/lectures", destination: "/he/lectures" },
      { source: "/guidance", destination: "/he/guidance" },
      { source: "/team", destination: "/he/team" },
      { source: "/get-involved", destination: "/he/get-involved" },
      { source: "/faq", destination: "/he/faq" },
      { source: "/contact", destination: "/he/contact" },
    ];
  },
};

export default nextConfig;
