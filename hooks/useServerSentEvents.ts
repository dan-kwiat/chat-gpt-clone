export default function useServerSentEvents<
  QueryParams extends Record<any, any>
>({
  baseUrl,
  config,
  onData,
  onOpen,
  onClose,
  onError,
}: {
  baseUrl: string
  config?: EventSourceInit | undefined
  onData: (data: string) => void
  onOpen: (event: Event) => void
  onClose: () => void
  onError: (event: Event) => void
}) {
  function openStream({ query }: { query: QueryParams }) {
    const params = new URLSearchParams()
    Object.keys(query).forEach((key) => {
      params.set(key, query[key as keyof QueryParams])
    })
    const evtSource = new EventSource(`${baseUrl}?${params}`, config)
    evtSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        evtSource.close()
        onClose()
      } else {
        onData(event.data)
      }
    }
    evtSource.onerror = onError
    evtSource.onopen = onOpen
    return evtSource
  }

  function closeStream(evtSource: EventSource) {
    evtSource.close()
  }

  return { openStream, closeStream }
}
