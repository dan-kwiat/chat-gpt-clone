import {
  Conversation,
  HEADERS_STREAM,
  RequestBodyPrompt,
} from "./api/converse-edge"
import { forwardRef, LegacyRef, useEffect, useRef, useState } from "react"
import Head from "next/head"
import { SubmitHandler, useForm } from "react-hook-form"
import useServerSentEvents from "hooks/useServerSentEvents"
import LogoOpenAI from "components/icons/LogoOpenAI"
import LogoUser from "components/icons/LogoUser"
import { inter } from "lib/fonts"
import { fetchEventSource } from "@microsoft/fetch-event-source"

interface FormData {
  prompt: string
}
class RetriableError extends Error {}
class FatalError extends Error {}

function MessageHuman({ message }: { message: string }) {
  return (
    <div className="w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group dark:bg-gray-800">
      <div className="text-base space-x-4 md:space-x-6 m-auto md:max-w-2xl lg:max-w-2xl xl:max-w-3xl p-4 md:py-6 flex lg:px-0">
        <div className="bg-gray-300 relative w-8 h-8 p-1 rounded-sm text-gray-600 flex items-center justify-center">
          <LogoUser className="h-6 w-6" />
        </div>
        <div className="min-h-[20px] whitespace-pre-wrap">{message}</div>
      </div>
    </div>
  )
}

const MessageBot = forwardRef(
  (
    { message, hidden }: { message: string; hidden?: boolean },
    ref?: LegacyRef<HTMLParagraphElement>
  ) => {
    return (
      <div
        className={`${
          hidden ? "hidden" : "block"
        } w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group bg-gray-50 dark:bg-[#444654]`}
      >
        <div className="text-base space-x-4 md:space-x-6 m-auto md:max-w-2xl lg:max-w-2xl xl:max-w-3xl p-4 md:py-6 flex lg:px-0">
          <div className="bg-[#10a37f] relative w-8 h-8 p-1 rounded-sm text-white flex items-center justify-center">
            <LogoOpenAI className="h-6 w-6" />
          </div>
          <div className="min-h-[20px] whitespace-pre-wrap">
            <div className="break-words">
              <p
                ref={ref}
                className={
                  ref && !hidden
                    ? "after:content-[''] after:-mb-1 after:inline-block after:animate-blink after:h-5 after:w-2 after:bg-gray-600 after:dark:bg-gray-400"
                    : ""
                }
              >
                {message}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }
)
MessageBot.displayName = "MessageBot"

export default function Page() {
  const answerNode = useRef<HTMLParagraphElement>(null)
  const [conversation, setConversation] = useState<Conversation>({
    history: [],
  })
  const [streaming, setStreaming] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    setFocus,
  } = useForm<FormData>()

  function onData(data: string) {
    if (!answerNode.current) {
      return
    }
    try {
      let text = JSON.parse(data).choices[0].delta.content
      if (text) {
        answerNode.current.innerText = answerNode.current.innerText + text
      }
    } catch (err) {
      console.log(`Failed to parse data: ${data}`)
      if (data !== "[DONE]") {
        setError(`Failed to parse the response`)
      }
    }
  }

  function onClose() {
    setStreaming(false)
    setConversation((prev) => {
      return {
        ...prev,
        history: [
          ...prev.history,
          {
            speaker: "bot",
            text: answerNode.current?.innerText.replace(
              /<br>/g,
              "\n"
            ) as string,
          },
        ],
      }
    })
  }

  const onSubmit: SubmitHandler<FormData> = (data) => {
    if (answerNode.current) {
      answerNode.current.innerText = ""
    }
    setStreaming(true)
    setValue("prompt", "")

    document.getElementsByTagName("textarea")[0].style.height = "auto"

    const newConversation: Conversation = {
      history: [
        ...conversation.history,
        { speaker: "human", text: data.prompt },
      ],
    }

    setConversation(newConversation)

    const paramsObj: RequestBodyPrompt = {
      conversation: JSON.stringify(newConversation),
      temperature: "0.7",
    }
    const ctrl = new AbortController()

    fetchEventSource("/api/converse-edge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paramsObj),
      signal: ctrl.signal,
      async onopen(response) {
        // answerValue.current = ""
        if (answerNode.current) {
          answerNode.current.innerText = ""
        }
        console.log("onopen")
        if (
          response.ok &&
          response.headers.get("content-type")?.replace(/ /g, "") ===
            HEADERS_STREAM["Content-Type"]
        ) {
          // all good
          return
        } else if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          // client-side errors are usually non-retriable:
          throw new FatalError()
        } else {
          throw new RetriableError()
        }
      },
      onmessage(msg) {
        // if the server emits an error message, throw an exception
        // so it gets handled by the onerror callback below:
        if (msg.event === "FatalError") {
          throw new FatalError(msg.data)
        }
        try {
          onData(msg.data)
        } catch (error) {
          console.log("aborting")
          ctrl.abort()
          onClose()
        }
      },
      onclose() {
        // if the server closes the connection unexpectedly, retry:
        // throw new RetriableError()

        onClose()
      },
      onerror(err) {
        if (err instanceof FatalError) {
          console.log("onerror fatal", err)
          // rethrow to stop the operation
          // setAwaitingFirstToken(false)
          setStreaming(false)
          setError(`Something went wrong with the request`)
          // throw err
        } else {
          console.log("onerror other", err)
          // do nothing to automatically retry. You can also
          // return a specific retry interval here.
        }
      },
    })
  }

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return () => {}
    }

    const observer = new ResizeObserver((entries) => {
      // TODO: debounce scroll?
      window.scroll({
        top: document.body.scrollHeight,
        behavior: "smooth",
      })
    })

    if (answerNode.current) {
      observer.observe(answerNode.current)
    }

    return () => {
      if (answerNode.current) {
        observer.unobserve(answerNode.current)
      }
    }
  }, [answerNode.current])

  useEffect(() => {
    setFocus("prompt")
  }, [conversation.history])

  return (
    <div className={inter.className}>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>CloneGPT</title>
        <meta name="description" content="A basic clone of ChatGPT" />
        <meta name="og:title" content="CloneGPT" />
        <meta name="og:url" content="https://clone-gpt.vercel.app/" />
      </Head>
      <main className="relative w-full flex flex-col items-center text-sm overflow-hidden pb-24 md:pb-40">
        {conversation.history.length > 0 ? (
          conversation.history.map((x, i) =>
            x.speaker === "human" ? (
              <MessageHuman key={i} message={x.text} />
            ) : (
              <MessageBot key={i} message={x.text} />
            )
          )
        ) : (
          <div className="px-3 py-12 text-center dark:text-white">
            <h1 className="text-lg font-bold">CloneGPT</h1>
            <p className="mt-4">Start typing below 👇</p>
          </div>
        )}
        <MessageBot ref={answerNode} message="" hidden={!streaming} />
      </main>
      <div className="fixed bottom-0 bg-gray-50 inset-x-0 border-t dark:border-white/20 dark:bg-gray-800">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="stretch mx-2 flex flex-row gap-3 pt-2 last:mb-2 md:last:mb-6 lg:mx-auto lg:max-w-3xl lg:pt-6"
        >
          <div className="relative flex h-full flex-1 md:flex-col">
            {/* <div className="ml-1 mt-1.5 hidden md:w-full md:m-auto md:flex md:mb-2 gap-2 justify-center">
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed items-center bg-white border-gray-900 text-[#40414F]  dark:bg-[#343541] dark:border-[#565869] dark:text-[#D9D9E3] border-transparent rounded-md border inline-flex text-sm px-3 py-2 pointer-events-auto justify-center"
                >
                  <svg
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 mr-2"
                    height="1em"
                    width="1em"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <polyline points="23 20 23 14 17 14"></polyline>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                  </svg>
                  Regenerate response
                </button>
              </div> */}
            <div className="flex flex-col w-full py-2 flex-grow md:py-3 md:pl-4 relative border border-black/10 bg-white dark:border-gray-900/50 dark:text-white dark:bg-gray-700 rounded-md shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]">
              <textarea
                tabIndex={0}
                rows={1}
                placeholder=""
                onKeyUp={(e) => {
                  const textarea = e.target as HTMLTextAreaElement
                  if (e.key === "Enter" && !e.shiftKey) {
                    handleSubmit(onSubmit)()
                  } else {
                    textarea.style.height = "auto" // Reset the height to its default to allow it to shrink when deleting text
                    textarea.style.height = `${textarea.scrollHeight}px` // Set the height to the scroll height so that it expands on new lines
                  }
                }}
                className="max-h-52 h-6 overflow-y-hidden m-0 w-full resize-none border-0 bg-transparent p-0 pl-2 pr-7 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:pl-0"
                {...register("prompt", {
                  required: true,
                  disabled: streaming,
                })}
              />
              <button
                type="submit"
                className="absolute p-1 rounded-md text-gray-500 bottom-1.5 right-1 md:bottom-2.5 md:right-2 hover:bg-gray-100 dark:hover:text-gray-400 dark:hover:bg-gray-900 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
              >
                <svg
                  stroke="currentColor"
                  fill="currentColor"
                  strokeWidth="0"
                  viewBox="0 0 20 20"
                  className="h-4 w-4 rotate-90"
                  height="1em"
                  width="1em"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                </svg>
              </button>
            </div>
          </div>
        </form>
        <div className="lg:mx-auto lg:max-w-3xl px-2 py-4">
          {error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <div className="space-x-2 text-center text-xs text-black/50 dark:text-white/50 md:px-4 md:pt-3 md:pb-6">
              <a
                href="https://github.com/dan-kwiat/chat-gpt-clone"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                GitHub Repo
              </a>{" "}
              <span>&middot;</span>{" "}
              <a
                href="https://dan.kwiat.info/projects"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                More Projects
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
