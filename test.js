import { expect, test } from 'vitest'
import FSAChunkStore from './index.js'
import parallel from 'run-parallel'

abstractTests(FSAChunkStore)
abstractTests(function (len, opts = {}) { return new FSAChunkStore(len, { ...opts, rootDir: navigator.storage.getDirectory() }) })
abstractTests(function (len, opts = {}) {
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

function abstractTests (Store) {
  test('basic put, then get', () => new Promise(done => {
  const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('0123456789'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('put invalid chunk length gives error', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('01234'), function (err) {
      expect(err instanceof Error).toBeTruthy()
      store.destroy(function (err) {
        expect(err).toBeFalsy()
        done()
      })
    })
  }))

  test('concurrent puts, then concurrent gets', () => new Promise(done => {
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
          expect(data).toEqual(makeBuffer(i))
          cb(null)
        })
      };
    }

    let tasks = []
    for (let i = 0; i < 100; i++) {
      tasks.push(makePutTask(i))
    }

    parallel(tasks, function (err) {
      expect(err).toBeFalsy()

      tasks = []
      for (let i = 0; i < 100; i++) {
        tasks.push(makeGetTask(i))
      }

      parallel(tasks, function (err) {
        expect(err).toBeFalsy()
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('interleaved puts and gets', () => new Promise(done => {
    const store = new Store(10)
    const tasks = []

    function makeTask (i) {
      return function (cb) {
        store.put(i, makeBuffer(i), function (err) {
          if (err) return cb(err)
          store.get(i, function (err, data) {
            expect(err).toBeFalsy()
            expect(data).toEqual(makeBuffer(i))
            cb(null)
          })
        })
      };
    }

    for (let i = 0; i < 100; i++) {
      tasks.push(makeTask(i))
    }

    parallel(tasks, function (err) {
      expect(err).toBeFalsy()
      store.destroy(function (err) {
        expect(err).toBeFalsy()
        done()
      })
    })
  }))

  test('get with `offset` and `length` options', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, { offset: 2, length: 3 }, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('234'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('get with null option', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, null, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('0123456789'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('get with empty object option', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, {}, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('0123456789'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('get with `offset` option', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, { offset: 2 }, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('23456789'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('get with `length` option', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, { length: 5 }, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('01234'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('test for sparsely populated support', () => new Promise(done => {
    const store = new Store(10)
    store.put(10, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(10, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('0123456789'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('test `put` without callback - error should be silent', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('01234'), () => {
      store.destroy(function (err) {
        expect(err).toBeFalsy()
        done()
      })
    })
  }))

  test('test `put` without callback - success should be silent', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('01234'), () => {
      store.destroy(function (err) {
        expect(err).toBeFalsy()
        done()
      })
    })
  }))

  test('chunkLength property', () => new Promise(done => {
    const store = new Store(10)
    expect(store.chunkLength).toBe(10)
    store.destroy(function (err) {
      expect(err).toBeFalsy()
      done()
    })
  }))

  test('test `get` on non-existent index', () => new Promise(done => {
    const store = new Store(10)
    store.get(0, function (err, chunk) {
      expect(err instanceof Error).toBeTruthy()
      store.destroy(function (err) {
        expect(err).toBeFalsy()
        done()
      })
    })
  }))

  test('test empty store\'s `close` calls its callback', () => new Promise(done => {
    const store = new Store(10)
    store.close(function (err) {
      expect(err).toBeFalsy()
      done()
    })
  }))

  test('test non-empty store\'s `close` calls its callback', () => new Promise(done => {
    const store = new Store(10)
    store.put(0, textToArr('0123456789'))
    store.close(function (err) {
      expect(err).toBeFalsy()
      done()
    })
  }))

  test('length option', () => new Promise(done => {
    const store = new Store(10, { length: 20, files: undefined })
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.put(1, textToArr('1234567890'), function (err) {
        expect(err).toBeFalsy()
        store.get(0, function (err, chunk) {
          expect(err).toBeFalsy()
          expect(chunk).toEqual(textToArr('0123456789'))
          store.get(1, function (err, chunk) {
            expect(err).toBeFalsy()
            expect(chunk).toEqual(textToArr('1234567890'))
            store.destroy(function (err) {
              expect(err).toBeFalsy()
              done()
            })
          })
        })
      })
    })
  }))

  test('length option: less than chunk size', () => new Promise(done => {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('0123456'))
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('length option: less than chunk size, write too large', () => new Promise(done => {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err instanceof Error).toBeTruthy()
      store.destroy(function (err) {
        expect(err).toBeFalsy()
        done()
      })
    })
  }))

  test('length option: less than chunk size, get `offset` too large', () => new Promise(done => {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, { offset: 8 }, function (err, chunk) {
        expect(err instanceof Error).toBeTruthy()
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('length option: less than chunk size, get `offset + length` too large', () => new Promise(done => {
    const store = new Store(10, { length: 7, files: undefined })
    store.put(0, textToArr('0123456'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, { offset: 4, length: 4 }, function (err, chunk) {
        expect(err instanceof Error).toBeTruthy()
        store.destroy(function (err) {
          expect(err).toBeFalsy()
          done()
        })
      })
    })
  }))

  test('destroy: remove all data from the FS', () => new Promise(done => {
    const store = new Store(10, { name: 'test' })
    store.put(0, textToArr('0123456789'), function (err) {
      expect(err).toBeFalsy()
      store.get(0, async function (err, chunk) {
        expect(err).toBeFalsy()
        expect(chunk).toEqual(textToArr('0123456789'))
        const rootDir = await navigator.storage.getDirectory()
        const folder = await rootDir.getDirectoryHandle('test')
        expect(folder instanceof FileSystemDirectoryHandle).toBeTruthy()
        store.destroy(async function (err) {
          expect(err).toBeFalsy()
          let notfound = null
          try {
            await rootDir.getDirectoryHandle('test')
          } catch (e) {
            notfound = e
          }
          expect(notfound instanceof Error && notfound.name === 'NotFoundError').toBeTruthy()
          done()
        })
      })
    })
  }))
}

test('multiple files', () => new Promise(done => {
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
    expect(err).toBeFalsy()
    store.get(0, function (err, chunk) {
      expect(err).toBeFalsy()
      expect(chunk).toEqual(textToArr('0123456789'))
      store.put(1, textToArr('abcdefghij'), function (err) {
        expect(err).toBeFalsy()
        store.get(1, function (err, chunk) {
          expect(err).toBeFalsy()
          expect(chunk).toEqual(textToArr('abcdefghij'))
          store.put(2, textToArr('klmnop'), function (err) {
            expect(err).toBeFalsy()
            store.get(2, function (err, chunk) {
              expect(err).toBeFalsy()
              expect(chunk).toEqual(textToArr('klmnop'))
              store.destroy(function (err) {
                expect(err).toBeFalsy()
                done()
              })
            })
          })
        })
      })
    })
  })
}))

test('cleanup: multiple files', () => new Promise(done => {
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
    expect(err).toBeFalsy()
    store.get(0, function (err, chunk) {
      expect(err).toBeFalsy()
      expect(chunk).toEqual(textToArr('0123456789'))
      store.put(1, textToArr('abcdefghij'), function (err) {
        expect(err).toBeFalsy()
        store.get(1, async function (err, chunk) {
          expect(err).toBeFalsy()
          expect(chunk).toEqual(textToArr('abcdefghij'))
          await store.cleanup()
          store.get(0, function (err, chunk) {
            expect(err).toBeFalsy()
            expect(chunk).toEqual(textToArr('0123456789'))
            store.get(1, function (err, chunk) {
              expect(err).toBeFalsy()
              expect(chunk).toEqual(textToArr('abcdefghij'))
              store.put(2, textToArr('klmnop'), function (err) {
                expect(err).toBeFalsy()
                store.get(2, async function (err, chunk) {
                  expect(err).toBeFalsy()
                  expect(chunk).toEqual(textToArr('klmnop'))
                  await store.cleanup()
                  store.get(2, function (err, chunk) {
                    expect(err).toBeFalsy()
                    expect(chunk).toEqual(textToArr('klmnop'))
                    store.destroy(function (err) {
                      expect(err).toBeFalsy()
                      done()
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
}))
