import { Helmet } from "react-helmet-async";
import { type ReactNode } from "react";
import { getPost } from "@/lib/blog-posts.js";

interface BlogPostShellProps {
  slug: string;
  /** Override the meta description if a punchier version is desired (defaults to post.description) */
  metaDescription?: string;
  /** Optional kicker shown above the H1 (defaults to "Blog") */
  kicker?: string;
  children: ReactNode;
}

const ORIGIN = "https://simplehook.dev";
const OG_IMAGE = `${ORIGIN}/logos/og-image.png`;

export function BlogPostShell({ slug, metaDescription, kicker = "Blog", children }: BlogPostShellProps) {
  const post = getPost(slug);
  const url = `${ORIGIN}/blog/${post.slug}`;
  const description = metaDescription ?? post.description;
  const fullTitle = `${post.title} — simplehook`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": description,
    "image": OG_IMAGE,
    "datePublished": post.publishedISO,
    "dateModified": post.modifiedISO,
    "author": { "@type": "Organization", "name": "simplehook", "url": ORIGIN },
    "publisher": {
      "@type": "Organization",
      "name": "simplehook",
      "url": ORIGIN,
      "logo": { "@type": "ImageObject", "url": `${ORIGIN}/logos/simplehook-wordmark-dark.png` },
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
  };

  return (
    <div>
      <Helmet>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
      </Helmet>

      <article className="px-6 py-20">
        <div className="mx-auto max-w-[640px]">
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
            <span className="inline-block h-px w-5 bg-border-strong mr-2.5 align-middle" />
            {kicker}
          </p>
          <h1 className="mb-6 text-[clamp(32px,5vw,44px)] font-normal leading-[1.1] tracking-[-0.02em]">
            {post.title}
          </h1>

          {children}
        </div>
      </article>
    </div>
  );
}
