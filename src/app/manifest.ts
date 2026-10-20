import type { MetadataRoute } from "next";

// Makes the site installable; iPhones only allow web push for sites added to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rokomet stats",
    short_name: "Rokomet",
    description: "Slovenian handball results and stats",
    start_url: "/stats",
    scope: "/",
    display: "standalone",
    background_color: "#f3f5f8",
    theme_color: "#1e2b38",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
