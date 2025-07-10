const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "idea-producer",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();

const run = async () => {
  await producer.connect();

  await producer.send({
    topic: "idea-events",
    messages: [
      {
        key: "idea-001",
        value: JSON.stringify({
          id: "idea-001",
          content: "This is a test idea about AI village simulation.",
        }),
      },
    ],
  });

  console.log("✅ Test message sent.");
  await producer.disconnect();
};

run().catch(console.error);
