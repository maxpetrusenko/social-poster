export function generateReplyDrafts(tweetText: string, category: string): string[] {
  const text = tweetText.toLowerCase();

  if (text.includes("open source") || text.includes("open sourced") || text.includes("open")) {
    return [
      "yeah open is the easy part. maintenance is the hard part",
      "launch day open is one thing. year two is the test",
      "open helps. staying alive after launch is the real game",
    ];
  }

  if (text.includes("apple silicon") || text.includes("mlx") || text.includes("local")) {
    return [
      "local stack keeps getting more real",
      "apple silicon infra is getting weirdly good now",
      "this is where local starts to feel practical",
    ];
  }

  if (text.includes("token") || text.includes("throughput") || text.includes("latency")) {
    return [
      "throughput always wins the argument in prod",
      "latency math gets real fast once people actually use it",
      "perf numbers are the only part that survives prod",
    ];
  }

  if (category === "mentions") {
    return [
      "nice. curious where you take it next",
      "yeah this is where it gets interesting",
      "do it. would love to see what you make",
    ];
  }

  if (["spirituality", "mindfulness", "culture"].includes(category)) {
    return [
      "quiet is harder than it sounds",
      "consistency matters more than intensity there",
      "the hard part is remembering when things get noisy",
    ];
  }

  return [
    "yeah the maintenance curve is the real test",
    "the boring part after launch is usually the whole story",
    "curious how this holds up a few months in",
  ];
}
