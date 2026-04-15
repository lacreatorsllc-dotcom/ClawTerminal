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
You are a senior backend engineer.

My system is accidentally calling an API 2000+ times.

Give me:
1. The likely cause
2. A fix
3. Example code
`);