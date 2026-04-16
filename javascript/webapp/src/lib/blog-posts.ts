// Single source of truth for the blog post list.
// Used by BlogPage.tsx (React render), each BlogPost*.tsx page (H1 + Helmet meta),
// and a Vite transformIndexHtml hook that injects the list into blog.html at build time.

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  publishedISO: string;
  modifiedISO: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "agent-webhooks",
    title: "How to Give Your AI Agent Access to Webhooks",
    description:
      "Step-by-step guide to connecting AI agents to real-time webhook events using simplehook's CLI and SDK. Pull, filter, stream, and never miss an event.",
    date: "April 2026",
    publishedISO: "2026-04-15",
    modifiedISO: "2026-04-16",
  },
  {
    slug: "webhook-dx-is-broken",
    title: "The Webhook Developer Experience Is Broken",
    description:
      "Why receiving webhooks locally is still painful in 2026, how ngrok and Hookdeck approach the problem differently, and what simplehook does instead.",
    date: "April 2026",
    publishedISO: "2026-04-08",
    modifiedISO: "2026-04-16",
  },
  {
    slug: "webhooks-that-never-change",
    title: "Let's kill webhooks",
    description:
      "We need to kill webhooks in the way we think about them. Why webhook URLs should be permanent, how simplehook works, and what it means for your daily development workflow.",
    date: "April 2026",
    publishedISO: "2026-04-01",
    modifiedISO: "2026-04-16",
  },
];

export function getPost(slug: string): BlogPost {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) throw new Error(`Unknown blog post slug: ${slug}`);
  return post;
}
