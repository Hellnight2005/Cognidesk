const axios = require("axios");

axios
  .post("http://localhost:11434/api/embeddings", {
    model: "nomic-embed-text",
    prompt: "Hello world",
  })
  .then((res) => console.log(res.data.embedding))
  .catch(console.error);
