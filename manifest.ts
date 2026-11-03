import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estilos Gestor",
    short_name: "Estilos Gestor",
    description: "Gestão financeira e de negócios: produtos, vendas, entradas, saídas e gráficos.",
    lang: "pt-BR",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1d3a",
    theme_color: "#0b1d3a",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Registrar venda", url: "/app/produtos?vender=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Entradas e Saídas", url: "/app/entradas-saidas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
