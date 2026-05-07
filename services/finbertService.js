import { spawn } from "child_process";

// Python environment requires: pip install transformers torch
export async function scorePosts(posts) {
  return new Promise((resolve, reject) => {
    const pythonCommand = process.platform === "win32" ? "python" : "python3";
    const scriptPath = "scripts/finbert_score.py";
    console.log("FINBERT SPAWN:", pythonCommand, scriptPath);

    const py = spawn(pythonCommand, [scriptPath]);
    let output = "";
    let error = "";

    py.stdout.on("data", (chunk) => (output += chunk));
    py.stderr.on("data", (data) => {
      const message = data.toString();
      error += message;
      console.log("FINBERT STDERR:", message);
    });

    py.on("error", (err) => {
      reject(err);
    });

    py.on("exit", (code, signal) => {
      console.log("FINBERT EXIT:", code, signal);
    });

    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(`FinBERT error: ${error}`));
      try {
        resolve(JSON.parse(output));
      } catch (e) {
        reject(new Error("FinBERT output parse failed"));
      }
    });

    try {
      if (py.exitCode !== null) {
        console.log("FINBERT EXITED BEFORE STDIN WRITE:", py.exitCode);
      }
      py.stdin.write(JSON.stringify(posts));
    } catch (err) {
      console.log("FINBERT STDIN WRITE ERROR:", err);
      reject(err);
      return;
    }

    try {
      py.stdin.end();
    } catch (err) {
      console.log("FINBERT STDIN END ERROR:", err);
      reject(err);
    }
  });
}