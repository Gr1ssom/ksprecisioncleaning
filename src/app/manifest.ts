import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KS Precision Cleaning",
    short_name: "KSPC",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0b72c2",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
