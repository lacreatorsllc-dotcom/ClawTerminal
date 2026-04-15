const fetch = require("node-fetch");

async function callOllama(prompt) {
  const res = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5-coder:7b",
      prompt: prompt,
      stream: false
    })
  });

  const data = await res.json();
  console.log(data.response);
}

callOllama(`
Fix this code so it does not call an API repeatedly:

function fetchData() {
  setInterval(() => {
    callAPI()
  }, 1000)
}
`);