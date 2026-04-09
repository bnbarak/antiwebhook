import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Dev-only plugin: route non-asset paths to the correct HTML entry
function mpaDevRewrites(): Plugin {
  return {
    name: "mpa-dev-rewrites",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === "/docs") {
          req.url = "/docs.html";
        } else if (
          url !== "/" &&
          !url.includes(".") &&
          !url.startsWith("/@") &&
          !url.startsWith("/src/") &&
          !url.startsWith("/node_modules/")
        ) {
          req.url = "/app.html";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mpaDevRewrites()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        docs: path.resolve(__dirname, "docs.html"),
        app: path.resolve(__dirname, "app.html"),
      },
    },
  },
  server: {
    port: 4000,
    proxy: {
      "/api": "http://localhost:8400",
      "/auth": "http://localhost:8401",
    },
  },
});
