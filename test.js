import FSAChunkStore from './index.js'
import tape from 'tape'
import parallel from 'run-parallel'

abstractTests(tape, FSAChunkStore)
abstractTests(tape, function (len, opts = {}) { return new FSAChunkStore(len, { ...opts, rootDir: navigator.storage.getDirectory() }) })
abstractTests(tape, function (len, opts = {}) {
  return new FSAChunkStore(len, {
    rootDir: navigator.storage.getDirectory(),
    files: [
      { path: 'tmp/multi1', length: 500 },
      { path: 'tmp/multi2', length: 500 }
    ],
    ...opts
  })
})

function makeBuffer (num) {
  const buf = new Uint8Array(10)
  buf.fill(num)
  return buf
}

const textEncoder = new TextEncoder()

const textToArr = (str) => new Uint8Array(textEncoder.encode(str))

function abstractTests (test, Store) {
  test('basic put, then get', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('0123456789'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('put invalid chunk length gives error', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('01234'), function (err) {
      t.ok(err instanceof Error)
      store.destroy(function (err) {
        t.error(err)
        t.end()
      })
    })
  })

  test('concurrent puts, then concurrent gets', function (t) {
    const store = new Store(10)

    function makePutTask (i) {
      return function (cb) {
        store.put(i, makeBuffer(i), cb)
      }
    }

    function makeGetTask (i) {
      return function (cb) {
        store.get(i, function (err, data) {
          if (err) return cb(err)
          t.deepEqual(data, makeBuffer(i))
          cb(null)
        })
      }
    }

    let tasks = []
    for (let i = 0; i < 100; i++) {
      tasks.push(makePutTask(i))
    }

    parallel(tasks, function (err) {
      t.error(err)

      tasks = []
      for (let i = 0; i < 100; i++) {
        tasks.push(makeGetTask(i))
      }

      parallel(tasks, function (err) {
        t.error(err)
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('interleaved puts and gets', function (t) {
    const store = new Store(10)
    const tasks = []

    function makeTask (i) {
      return function (cb) {
        store.put(i, makeBuffer(i), function (err) {
          if (err) return cb(err)
          store.get(i, function (err, data) {
            t.error(err)
            t.deepEqual(data, makeBuffer(i))
            cb(null)
          })
        })
      }
    }

    for (let i = 0; i < 100; i++) {
      tasks.push(makeTask(i))
    }

    parallel(tasks, function (err) {
      t.error(err)
      store.destroy(function (err) {
        t.error(err)
        t.end()
      })
    })
  })

  test('get with `offset` and `length` options', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, { offset: 2, length: 3 }, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('234'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('get with null option', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, null, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('0123456789'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('get with empty object option', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, {}, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('0123456789'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('get with `offset` option', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, { offset: 2 }, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('23456789'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('get with `length` option', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, { length: 5 }, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('01234'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('test for sparsely populated support', function (t) {
    const store = new Store(10)
    store.put(10, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(10, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('0123456789'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('test `put` without callback - error should be silent', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('01234'), () => {
      store.destroy(function (err) {
        t.error(err)
        t.end()
      })
    })
  })

  test('test `put` without callback - success should be silent', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('01234'), () => {
      store.destroy(function (err) {
        t.error(err)
        t.end()
      })
    })
  })

  test('chunkLength property', function (t) {
    const store = new Store(10)
    t.equal(store.chunkLength, 10)
    store.destroy(function (err) {
      t.error(err)
      t.end()
    })
  })

  test('test `get` on non-existent index', function (t) {
    const store = new Store(10)
    store.get(0, function (err, chunk) {
      t.ok(err instanceof Error)
      store.destroy(function (err) {
        t.error(err)
        t.end()
      })
    })
  })

  test('test empty store\'s `close` calls its callback', function (t) {
    const store = new Store(10)
    store.close(function (err) {
      t.error(err)
      t.end()
    })
  })

  test('test non-empty store\'s `close` calls its callback', function (t) {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'))
    store.close(function (err) {
      t.error(err)
      t.end()
    })
  })

  test('length option', function (t) {
    const store = new Store(10, { length: 20, files: undefined })
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.put(1, textToArr('1234567890'), function (err) {
        t.error(err)
        store.get(0, function (err, chunk) {
          t.error(err)
          t.deepEqual(chunk, textToArr('0123456789'))
          store.get(1, function (err, chunk) {
            t.error(err)
            t.deepEqual(chunk, textToArr('1234567890'))
            store.destroy(function (err) {
              t.error(err)
              t.end()
            })
          })
        })
      })
    })
  })

  test('length option: less than chunk size', function (t) {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456'), function (err) {
      t.error(err)
      store.get(0, function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('0123456'))
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('length option: less than chunk size, write too large', function (t) {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456789'), function (err) {
      t.ok(err instanceof Error)
      store.destroy(function (err) {
        t.error(err)
        t.end()
      })
    })
  })

  test('length option: less than chunk size, get `offset` too large', function (t) {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456'), function (err) {
      t.error(err)
      store.get(0, { offset: 8 }, function (err, chunk) {
        t.ok(err instanceof Error)
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('length option: less than chunk size, get `offset + length` too large', function (t) {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456'), function (err) {
      t.error(err)
      store.get(0, { offset: 4, length: 4 }, function (err, chunk) {
        t.ok(err instanceof Error)
        store.destroy(function (err) {
          t.error(err)
          t.end()
        })
      })
    })
  })

  test('destroy: remove all data from the FS', function (t) {
    const store = new Store(10, { name: 'test' })
    store.put(0, textToArr('0123456789'), function (err) {
      t.error(err)
      store.get(0, async function (err, chunk) {
        t.error(err)
        t.deepEqual(chunk, textToArr('0123456789'))
        const rootDir = await navigator.storage.getDirectory()
        const folder = await rootDir.getDirectoryHandle('test')
        t.ok(folder instanceof FileSystemDirectoryHandle)
        store.destroy(async function (err) {
          t.error(err)
          let notfound = null
          try {
            await rootDir.getDirectoryHandle('test')
          } catch (e) {
            notfound = e
          }
          t.ok(notfound instanceof Error && notfound.name === 'NotFoundError')
          t.end()
        })
      })
    })
  })
}

tape('multiple files', function (t) {
  const store = new FSAChunkStore(10, {
    files: [
      { path: 'tmp/file1', length: 5 },
      { path: 'tmp/file2', length: 5 },
      { path: 'tmp2/file3', length: 8 },
      { path: 'tmp2/file4', length: 8 }
    ],
    rootDir: navigator.storage.getDirectory()
  })
  store.put(0, textToArr('0123456789'), function (err) {
    t.error(err)
    store.get(0, function (err, chunk) {
      t.error(err)
      t.deepEqual(chunk, textToArr('0123456789'))
      store.put(1, textToArr('abcdefghij'), function (err) {
        t.error(err)
        store.get(1, function (err, chunk) {
          t.error(err)
          t.deepEqual(chunk, textToArr('abcdefghij'))
          store.put(2, textToArr('klmnop'), function (err) {
            t.error(err)
            store.get(2, function (err, chunk) {
              t.error(err)
              t.deepEqual(chunk, textToArr('klmnop'))
              store.destroy(function (err) {
                t.error(err)
                t.end()
              })
            })
          })
        })
      })
    })
  })
})

tape('cleanup: multiple files', function (t) {
  const store = new FSAChunkStore(10, {
    files: [
      { path: 'tmp/file1', length: 5 },
      { path: 'tmp/file2', length: 5 },
      { path: 'tmp2/file3', length: 8 },
      { path: 'tmp2/file4', length: 8 }
    ],
    rootDir: navigator.storage.getDirectory()
  })
  store.put(0, textToArr('0123456789'), function (err) {
    t.error(err)
    store.get(0, function (err, chunk) {
      t.error(err)
      t.deepEqual(chunk, textToArr('0123456789'))
      store.put(1, textToArr('abcdefghij'), function (err) {
        t.error(err)
        store.get(1, async function (err, chunk) {
          t.error(err)
          t.deepEqual(chunk, textToArr('abcdefghij'))
          await store.cleanup()
          store.get(0, function (err, chunk) {
            t.error(err)
            t.deepEqual(chunk, textToArr('0123456789'))
            store.get(1, function (err, chunk) {
              t.error(err)
              t.deepEqual(chunk, textToArr('abcdefghij'))
              store.put(2, textToArr('klmnop'), function (err) {
                t.error(err)
                store.get(2, async function (err, chunk) {
                  t.error(err)
                  t.deepEqual(chunk, textToArr('klmnop'))
                  await store.cleanup()
                  store.get(2, function (err, chunk) {
                    t.error(err)
                    t.deepEqual(chunk, textToArr('klmnop'))
                    store.destroy(function (err) {
                      t.error(err)
                      t.end()
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })
})
