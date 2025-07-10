const { Kafka } = require("kafkajs");
const axios = require("axios");

const kafka = new Kafka({
  clientId: "idea-consumer",
  brokers: ["localhost:9092"],
});

const consumer = kafka.consumer({ groupId: "idea-group" });

const run = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: "idea-events", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const idea = JSON.parse(message.value.toString());
      console.log(`📥 Received idea: ${idea.id}`);

      try {
        // Step 1: Generate embedding using Ollama
        const embedResponse = await axios.post(
          "http://localhost:11434/api/embeddings",
          {
            model: "nomic-embed-text",
            prompt: idea.content,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const embedding = embedResponse.data.embedding;

        // Step 2: Store in ChromaDB
        await axios.post("http://localhost:8000/api/v2/collections/default", {
          ids: [idea.id],
          documents: [idea.content],
          embeddings: [embedding],
          metadatas: [{ source: "idea-vault" }],
        });

        console.log(`✅ Stored embedding for idea ${idea.id} in ChromaDB`);
      } catch (error) {
        console.error(`❌ Error processing idea ${idea.id}:`, error.message);
      }
    },
  });
};

run().catch(console.error);
