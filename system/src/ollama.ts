/**
 * Ollama client — uses http module for reliable long-running requests on slow hardware
 */

import http from "http";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

export function generate(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; num_predict?: number; num_ctx?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ollamaOptions: Record<string, number> = {
      temperature: options?.temperature ?? 0.8,
      num_predict: options?.num_predict ?? 2048,
    };
    if (options?.num_ctx) {
      ollamaOptions.num_ctx = options.num_ctx;
    }

    const body = JSON.stringify({
      model: MODEL,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      keep_alive: "10m",
      options: ollamaOptions,
    });

    const url = new URL(`${OLLAMA_URL}/api/generate`);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 900000, // 15 minutes
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as OllamaResponse;
            resolve(parsed.response);
          } catch (e) {
            reject(new Error(`Failed to parse Ollama response: ${data.substring(0, 200)}`));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Ollama request timed out (15 min)"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function isAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(`${OLLAMA_URL}/api/tags`);
    const req = http.get(
      { hostname: url.hostname, port: url.port, path: url.pathname, timeout: 5000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}
