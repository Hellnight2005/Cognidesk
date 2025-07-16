const { searchFromQdrant, ensureCollection } = require("../vectorDb");

async function searchQdrant(vector, topK = 5) {
  await ensureCollection();
  const results = await searchFromQdrant(vector, topK);
  return results;
}

module.exports = searchQdrant;
