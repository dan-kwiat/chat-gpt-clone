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

export interface RequestQueryConversation {
  conversation: string
  temperature: string
}

function getPrompt({ conversation }: { conversation: Conversation }) {
  let prompt = `You are a chat bot trying to be has helpful as possible to a human. Continue the conversation:\n\n`
  conversation.history.forEach((speech: Speech, i) => {
    prompt += `${speech.speaker === "human" ? "Human" : "Chat Bot"}:\n\n`
    prompt += `${speech.text}\n\n`
  })
  prompt += `Chat Bot:\n\n`
  console.log(prompt)
  return prompt
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
  const { searchParams } = new URL(req.url)

  let conversation: Conversation
  let temperature: number
  try {
    conversation = JSON.parse(searchParams.get("conversation") as string)
    temperature = parseFloat(searchParams.get("temperature") as string)
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
    const completion = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: getPrompt({
        conversation,
      }),
      max_tokens: 80,
      temperature,
      stream: true,
    })

    return new Response(completion.body, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/event-stream;charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
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
