import type { MetadataRoute } from "next";

/** Installable app: "Add to Home Screen" on iPhone (Safari) and "Install app" on Android (Chrome). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KS Precision Cleaning LLC",
    short_name: "KS Precision",
    description: "Check-ins, jobs, room maps and SOPs for the KS Precision Cleaning team.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Check in", url: "/checkin", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "My jobs", url: "/jobs", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
