const readline = require("readline");
const generateQueryEmbedding = require("./embeddings/queryEmbed");
const searchQdrant = require("./search/searchQdrant");
const askOllama = require("./llm/queryOllama");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("💬 Ask a question (type 'exit' to quit):");

rl.on("line", async (input) => {
  if (input.toLowerCase() === "exit") {
    rl.close();
    return;
  }

  try {
    // Step 1: Convert question into embedding
    const queryEmbedding = await generateQueryEmbedding(input);

    // Step 2: Search vector DB (Qdrant) for similar vectors
    const searchResults = await searchQdrant(queryEmbedding, 5); // top-k = 5

    // Step 3: Extract original text from matched chunks
    const contextChunks = searchResults
      .map((match) => match.payload?.original_text)
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!contextChunks.trim()) {
      console.warn("⚠️ No relevant context found in vector DB.");
    }

    // Step 4: Send context + question to Ollama LLM
    const answer = await askOllama({
      question: input,
      context: contextChunks,
    });

    console.log("\n🤖 Ollama:\n" + answer + "\n");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }

  rl.prompt();
});
