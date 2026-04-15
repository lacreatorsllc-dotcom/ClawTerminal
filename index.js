const fs = require("fs");
const fetch = require("node-fetch");

async function fixFile() {
  const file = fs.readFileSync("index.js", "utf-8");

  const res = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5-coder:7b",
      prompt: `
You are a coding agent.

Fix this file to reduce API calls and improve structure.

${file}
`,
      stream: false
    })
  });

  const data = await res.json();
  fs.writeFileSync("index.js", data.response);
}

fixFile();