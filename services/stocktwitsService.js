export async function fetchStockTwitsPosts(ticker) {
  const url = `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json?limit=30`;

  const posts = [];
  let cursor = null;

  for (let i = 0; i < 5; i++) {
    const endpoint = cursor ? `${url}&max=${cursor}` : url;
    const res = await fetch(endpoint);
    const data = await res.json();
    if (!data.messages?.length) break;

    posts.push(...data.messages);
    cursor = data.messages[data.messages.length - 1].id;
  }

  return posts.map(p => ({
    text: p.body,
    source: "stocktwits",
    engagement: (p.likes?.total || 0) + (p.user?.followers || 0),
    declaredSentiment: p.entities?.sentiment?.basic || null,
    createdAt: p.created_at,
  }));
}