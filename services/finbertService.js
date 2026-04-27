import { spawn } from "child_process";

// Python environment requires: pip install transformers torch
export async function scorePosts(posts) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", ["scripts/finbert_score.py"]);
    let output = "";
    let error = "";

    py.stdout.on("data", (chunk) => (output += chunk));
    py.stderr.on("data", (chunk) => (error += chunk));

    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(`FinBERT error: ${error}`));
      try {
        resolve(JSON.parse(output));
      } catch (e) {
        reject(new Error("FinBERT output parse failed"));
      }
    });

    py.stdin.write(JSON.stringify(posts));
    py.stdin.end();
  });
}