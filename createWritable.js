const INVALID = ['seeking position failed.', 'InvalidStateError']
const GONE = ['A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError']
const SYNTAX = m => [`Failed to execute 'write' on 'UnderlyingSinkBase': Invalid params passed. ${m}`, 'SyntaxError']

class _FileSystemWritableFileStream extends WritableStream {
  constructor (writer) {
    super(writer)
    // Stupid Safari hack to extend native classes
    // https://bugs.webkit.org/show_bug.cgi?id=226201
    Object.setPrototypeOf(this, FileSystemWritableFileStream.prototype)

    /** @private */
    this._closed = false
  }

  async close () {
    this._closed = true
    const w = this.getWriter()
    const p = w.close()
    w.releaseLock()
    return p
    // return super.close ? super.close() : this.getWriter().close()
  }

  /** @param {number} position */
  seek (position) {
    return this.write({ type: 'seek', position })
  }

  /** @param {number} size */
  truncate (size) {
    return this.write({ type: 'truncate', size })
  }

  // The write(data) method steps are:
  write (data) {
    if (this._closed) {
      return Promise.reject(new TypeError('Cannot write to a CLOSED writable stream'))
    }

    // 1. Let writer be the result of getting a writer for this.
    const writer = this.getWriter()

    // 2. Let result be the result of writing a chunk to writer given data.
    const result = writer.write(data)

    // 3. Release writer.
    writer.releaseLock()

    // 4. Return result.
    return result
  }
}

Object.defineProperty(_FileSystemWritableFileStream.prototype, Symbol.toStringTag, {
  value: 'FileSystemWritableFileStream',
  writable: false,
  enumerable: false,
  configurable: true
})

Object.defineProperties(_FileSystemWritableFileStream.prototype, {
  close: { enumerable: true },
  seek: { enumerable: true },
  truncate: { enumerable: true },
  write: { enumerable: true }
})

// Safari safari doesn't support writable streams yet.
if (
  globalThis.FileSystemFileHandle &&
  !globalThis.FileSystemFileHandle.prototype.createWritable &&
  !globalThis.FileSystemWritableFileStream
) {
  globalThis.FileSystemWritableFileStream = _FileSystemWritableFileStream
}

// Safari doesn't support async createWritable streams yet.
if (
  globalThis.FileSystemFileHandle &&
  !globalThis.FileSystemFileHandle.prototype.createWritable
) {
  const wm = new WeakMap()

  let workerUrl

  // Worker code that should be inlined (can't use any external functions)
  const code = () => {
    let fileHandle, handle

    onmessage = async evt => {
      const port = evt.ports[0]
      const cmd = evt.data
      switch (cmd.type) {
        case 'open': {
          const file = cmd.name

          let dir = await navigator.storage.getDirectory()

          for (const folder of cmd.path) {
            dir = await dir.getDirectoryHandle(folder)
          }

          fileHandle = await dir.getFileHandle(file)
          // @ts-ignore
          handle = await fileHandle.createSyncAccessHandle()
          break
        }
        case 'write':
          handle.write(cmd.data, { at: cmd.position })
          handle.flush()
          break
        case 'truncate':
          handle.truncate(cmd.size)
          break
        case 'abort':
        case 'close':
          handle.close()
          break
      }

      port.postMessage(0)
    }
  }

  globalThis.FileSystemFileHandle.prototype.createWritable = async function (options) {
    // Safari only support writing data in a worker with sync access handle.
    if (!workerUrl) {
      const stringCode = `(${code.toString()})()`
      const blob = new Blob([stringCode], {
        type: 'text/javascript'
      })
      workerUrl = URL.createObjectURL(blob)
    }
    const worker = new Worker(workerUrl, { type: 'module' })

    let position = 0
    const textEncoder = new TextEncoder()
    let size = await this.getFile().then(file => file.size)

    const send = message => new Promise((resolve, reject) => {
      const mc = new MessageChannel()
      mc.port1.onmessage = evt => {
        if (evt.data instanceof Error) reject(evt.data)
        else resolve(evt.data)
        mc.port1.close()
        mc.port2.close()
        mc.port1.onmessage = null
      }
      worker.postMessage(message, [mc.port2])
    })

    // Safari also don't support transferable file system handles.
    // So we need to pass the path to the worker. This is a bit hacky and ugly.
    const root = await navigator.storage.getDirectory()
    const parent = await wm.get(this)
    const path = await root.resolve(parent)

    // Should likely never happen, but just in case...
    if (path === null) throw new DOMException(...GONE)

    await send({ type: 'open', path, name: this.name })

    if (options?.keepExistingData === false) {
      await send({ type: 'truncate', size: 0 })
      size = 0
    }

    return new _FileSystemWritableFileStream({
      async write (chunk) {
        const isPlainObject = chunk?.constructor === Object

        if (isPlainObject) {
          chunk = { ...chunk }
        } else {
          chunk = { type: 'write', data: chunk, position }
        }

        if (chunk.type === 'write') {
          if (!('data' in chunk)) {
            await send({ type: 'close' })
            throw new DOMException(...SYNTAX('write requires a data argument'))
          }

          chunk.position ??= position

          if (typeof chunk.data === 'string') {
            chunk.data = textEncoder.encode(chunk.data)
          } else if (chunk.data instanceof ArrayBuffer) {
            chunk.data = new Uint8Array(chunk.data)
          } else if (!(chunk.data instanceof Uint8Array) && ArrayBuffer.isView(chunk.data)) {
            chunk.data = new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength)
          } else if (!(chunk.data instanceof Uint8Array)) {
            const ab = await new Response(chunk.data).arrayBuffer()
            chunk.data = new Uint8Array(ab)
          }

          if (Number.isInteger(chunk.position) && chunk.position >= 0) {
            position = chunk.position
          }
          position += chunk.data.byteLength
          size += chunk.data.byteLength
        } else if (chunk.type === 'seek') {
          if (Number.isInteger(chunk.position) && chunk.position >= 0) {
            if (size < chunk.position) {
              throw new DOMException(...INVALID)
            }
            position = chunk.position
            return // Don't need to enqueue seek...
          } else {
            await send({ type: 'close' })
            throw new DOMException(...SYNTAX('seek requires a position argument'))
          }
        } else if (chunk.type === 'truncate') {
          if (Number.isInteger(chunk.size) && chunk.size >= 0) {
            size = chunk.size
            if (position > size) { position = size }
          } else {
            await send({ type: 'close' })
            throw new DOMException(...SYNTAX('truncate requires a size argument'))
          }
        }

        await send(chunk)
      },
      async close () {
        await send({ type: 'close' })
        worker.terminate()
      },
      async abort (reason) {
        await send({ type: 'abort', reason })
        worker.terminate()
      }
    })
  }

  const orig = FileSystemDirectoryHandle.prototype.getFileHandle
  FileSystemDirectoryHandle.prototype.getFileHandle = async function (...args) {
    const handle = await orig.call(this, ...args)
    wm.set(handle, this)
    return handle
  }
}
