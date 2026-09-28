// Every decode and encode happens here, one image at a time, so the page never stalls.
import { compressImage, type Job, type WorkerMessage } from './compress'

const post = (msg: WorkerMessage) => self.postMessage(msg)

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, key, file, settings } = e.data
  post({ type: 'progress', id, key, progress: null })
  try {
    const result = await compressImage(file, settings, (progress) => post({ type: 'progress', id, key, progress }))
    post({ type: 'done', id, key, result })
  } catch (err) {
    post({ type: 'error', id, key, message: err instanceof Error ? err.message : String(err) })
  }
}
