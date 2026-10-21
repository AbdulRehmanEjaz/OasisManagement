import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oasis Field Operations",
    short_name: "Oasis",
    description: "Field operations management",
    start_url: "/",
    display: "standalone",
    background_color: "#c5c1bf",
    theme_color: "#008d78",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
