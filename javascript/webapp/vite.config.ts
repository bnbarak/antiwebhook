import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { BLOG_POSTS } from "./src/lib/blog-posts.js";

// Dev-only plugin: route non-asset paths to the correct HTML entry
function mpaDevRewrites(): Plugin {
  return {
    name: "mpa-dev-rewrites",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === "/docs") {
          req.url = "/docs.html";
        } else if (url === "/blog" || url.startsWith("/blog/")) {
          req.url = "/blog.html";
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

// Inject the blog post list (from src/lib/blog-posts.ts — single source of truth)
// into blog.html's static SEO fallback at <!--BLOG_POSTS--> placeholder.
function blogPostInjector(): Plugin {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const renderCards = () =>
    BLOG_POSTS.map((post) => `        <article style="margin-bottom:32px;padding:24px;border:1px solid #262626;border-radius:12px;background:#1a1a1a">
          <h2 style="font-size:20px;font-weight:500;margin:0 0 8px;color:#e5e5e5">
            <a href="/blog/${escape(post.slug)}" style="color:inherit;text-decoration:none">${escape(post.title)}</a>
          </h2>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#a1a1a1">
            ${escape(post.description)}
          </p>
        </article>`).join("\n");
  return {
    name: "blog-post-injector",
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith("blog.html")) return html;
      return html.replace("<!--BLOG_POSTS-->", renderCards());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mpaDevRewrites(), blogPostInjector()],
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
        blog: path.resolve(__dirname, "blog.html"),
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
