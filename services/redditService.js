export async function fetchRedditPosts(ticker) {
  const subreddits = ["wallstreetbets", "stocks", "investing"];
  const postsPerSub = Math.ceil(100 / subreddits.length);

  const allPosts = [];

  for (const sub of subreddits) {
    const url = `https://www.reddit.com/r/${sub}/search.json?q=${ticker}&sort=top&t=day&limit=${postsPerSub}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AlphaBot/1.0" }
    });
    const data = await res.json();
    const posts = data?.data?.children || [];

    allPosts.push(...posts.map(p => ({
      text: `${p.data.title} ${p.data.selftext || ""}`.trim(),
      source: "reddit",
      engagement: p.data.score + (p.data.num_comments * 2),
      declaredSentiment: null,
      createdAt: new Date(p.data.created_utc * 1000).toISOString(),
    })));
  }

  return allPosts;
}