import { createInterface } from "node:readline/promises";

export async function promptText(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await readline.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || "";
  } finally {
    readline.close();
  }
}

export function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(
      new Error("Hidden input requires an interactive terminal"),
    );
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const output = process.stderr;

    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      output.write("\n");
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (text === "\u0003") {
        cleanup();
        reject(new Error("Interrupted"));
        return;
      }
      if (text === "\r" || text === "\n") {
        cleanup();
        resolve(value);
        return;
      }
      if (text === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += text;
    };

    output.write(`${question}: `);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}
