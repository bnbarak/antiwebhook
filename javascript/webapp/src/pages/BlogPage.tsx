import { Helmet } from "react-helmet-async";
import { ArrowRight } from "lucide-react";
import { BLOG_POSTS } from "@/lib/blog-posts.js";

export function BlogPage() {
  return (
    <div>
      <Helmet>
        <title>Blog — simplehook</title>
        <meta
          name="description"
          content="Articles about webhooks, local development, AI agents, and building simplehook."
        />
        <link rel="canonical" href="https://simplehook.dev/blog" />
        <meta property="og:title" content="Blog — simplehook" />
        <meta property="og:url" content="https://simplehook.dev/blog" />
      </Helmet>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-[700px]">
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
            <span className="inline-block h-px w-5 bg-border-strong mr-2.5 align-middle" />
            Blog
          </p>
          <h1 className="mb-3 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            From the team
          </h1>
          <p className="mb-12 max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            How we think about webhooks, developer tools, and building for
            humans and AI agents.
          </p>

          <div className="flex flex-col gap-6">
            {BLOG_POSTS.map((post) => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                <span className="mb-2 block font-mono text-[11px] text-muted-foreground/60">
                  {post.date}
                </span>
                <h2 className="mb-2 text-lg font-medium tracking-[-0.01em] group-hover:text-foreground transition-colors">
                  {post.title}
                </h2>
                <p className="mb-3 text-[14px] leading-relaxed text-muted-foreground">
                  {post.description}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  Read
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
