export const JOURNAL_POSTS = [
  {
    slug: "state-of-mind",
    title: "THE OFF GRID STATE OF MIND",
    excerpt: "Style is not about following a formula. It's about building a uniform that feels like you.",
    date: "2026-01-15",
    image: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1400&q=90",
    body: [
      "Most fashion is built around a formula — a season's worth of trends, distilled into a checklist you're supposed to tick off. We think that's backwards.",
      "The Off Grid started with a simple refusal: to keep making clothes that look like everything else on the rack. Every piece we make starts from the same question — does this hold up when the trend cycle moves on? If a garment can't answer that, it doesn't make the collection.",
      "That's not a marketing line. It shows up in the decisions you don't see: the fabric weight we choose over a cheaper option, the extra stitch on a seam that will never show in a product photo, the sizes we keep in stock instead of chasing what's hyped this month.",
      "A uniform, in the way we mean it, isn't about wearing the same thing every day. It's about having pieces you reach for without thinking — because they were never trying to be anyone else's idea of style in the first place.",
    ],
  },
  {
    slug: "wear-your-way",
    title: "WEAR YOUR WAY",
    excerpt: "Clean silhouettes. Strong details. Zero unnecessary rules.",
    date: "2026-02-03",
    image: "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?auto=format&fit=crop&w=1400&q=90",
    body: [
      "There's a version of streetwear that's all noise — logos stacked on logos, trying to say something loud enough to be heard over everyone else doing the same thing. We went the other way.",
      "Clean silhouettes aren't a lack of ambition. They're harder to get right than a busy design, because there's nowhere for a bad cut to hide. Every drop shoulder, every hem length, every proportion gets tested against one question: does this actually work on a real body, moving through a real day?",
      "The details that matter to us are the ones you notice on the second or third wear, not the first — the way a hood sits, the weight of a zip pull, whether a fabric still looks right after it's been through a wash cycle a dozen times.",
      "No unnecessary rules means exactly that. Wear it oversized or fitted. Layer it or don't. The clothes are built to hold up to how you actually want to wear them, not how a lookbook says you should.",
    ],
  },
  {
    slug: "made-for-the-exceptions",
    title: "MADE FOR THOSE WHO WALK ALONE",
    excerpt: "No trends to follow. No rules to fit. Just heavy fabric, honest pricing, and clothing built for people who make their own path.",
    date: "2026-03-10",
    image: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=1400&q=90",
    body: [
      "Honest pricing is a phrase that gets used loosely in this industry, so here's what it actually means to us: the price on the tag reflects the fabric, the construction, and a fair margin — not a number inflated so it can be discounted 40% during a sale event three weeks later.",
      "That approach means we can't always compete on price with brands optimizing for volume over quality. We're not trying to. We'd rather make fewer things that last longer, for people who'd rather own five pieces they trust than fifty they don't.",
      "Walking alone, in the way we mean it, isn't about being contrarian for its own sake. It's about being willing to build something on your own terms even when the easier path is to follow whatever's working for everyone else.",
    ],
  },
];

export function getJournalPost(slug) {
  return JOURNAL_POSTS.find((p) => p.slug === slug);
}
