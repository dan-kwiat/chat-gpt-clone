import type { NextRequest } from "next/server"
import cors from "lib/cors"

export interface SamplingParameters {
  prompt: string
  temperature?: number
  max_tokens_to_sample: number
  stop_sequences: string[]
  top_k?: number
  top_p?: number
  model: string
  tags?: { [key: string]: string }
}

async function getResponse(req: NextRequest) {
  const ANTHROPIC_API_KEY = req.headers.get("x-api-key")

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ message: "Missing API key" }), {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    })
  }

  try {
    const completion = await fetch("https://api.anthropic.com/v1/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
      },
      body: req.body,
    })

    return new Response(completion.body, {
      status: completion.status,
      statusText: completion.statusText,
      headers: {
        "content-type": completion.headers.get("content-type") || "",
        // should we forward other headers too?
      },
    })
  } catch (error) {
    return new Response(JSON.stringify(error), {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    })
  }
}

export default async function handler(req: NextRequest) {
  return cors(req, await getResponse(req))
}

export const config = {
  runtime: "edge",
}
