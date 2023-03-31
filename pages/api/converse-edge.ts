import type { NextRequest } from "next/server"
import { Configuration, OpenAIApi } from "openai-edge"

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

type Speaker = "bot" | "human"

export interface Speech {
  speaker: Speaker
  text: string
}

export interface Conversation {
  history: Array<Speech>
}

export interface RequestBodyPrompt {
  conversation: string
  temperature: string
}

export const HEADERS_STREAM = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "text/event-stream;charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
}

type Messages = Parameters<typeof openai.createChatCompletion>[0]["messages"]

function getMessages({
  conversation,
}: {
  conversation: Conversation
}): Messages {
  let messages: Messages = [
    { role: "system", content: "You are a helpful assistant." },
  ]
  conversation.history.forEach((speech: Speech, i) => {
    messages.push({
      role: speech.speaker === "human" ? "user" : "assistant",
      content: speech.text,
    })
  })
  return messages
}

function validateConversation(conversation: Conversation) {
  if (!conversation) {
    throw new Error("Invalid conversation")
  }
  if (!conversation.history) {
    throw new Error("Invalid conversation")
  }
}

function validateTemperature(temperature: number) {
  if (isNaN(temperature)) {
    throw new Error("Invalid temperature")
  }
  if (temperature < 0 || temperature > 1) {
    throw new Error("Invalid temperature")
  }
}

const handler = async (req: NextRequest) => {
  const body: RequestBodyPrompt = await req.json()

  let conversation: Conversation
  let temperature: number
  try {
    conversation = JSON.parse(body.conversation)
    temperature = parseFloat(body.temperature)
    validateConversation(conversation)
    validateTemperature(temperature)
  } catch (e: any) {
    return new Response(
      JSON.stringify({ message: e.message || "Invalid parameter" }),
      {
        status: 400,
        headers: {
          "content-type": "application/json",
        },
      }
    )
  }

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: getMessages({ conversation }),
      max_tokens: 1024,
      temperature,
      stream: true,
    })

    return new Response(completion.body, {
      headers: HEADERS_STREAM,
    })
  } catch (error: any) {
    console.error(error)
    if (error.response) {
      console.error(error.response.status)
      console.error(error.response.data)
    } else {
      console.error(error.message)
    }
    return new Response(JSON.stringify(error), {
      status: 400,
      headers: {
        "content-type": "application/json",
      },
    })
  }
}

export const config = {
  runtime: "edge",
}

export default handler
