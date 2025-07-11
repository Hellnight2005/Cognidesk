// kafka/producer.js
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "idea-service",
  brokers: ["localhost:9092"], // Replace with your Kafka broker
});

const producer = kafka.producer();

const sendToKafka = async (topic, message) => {
  await producer.connect();
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  });
  await producer.disconnect();
};

module.exports = sendToKafka;
