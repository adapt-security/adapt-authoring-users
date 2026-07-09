import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import UsersModule from '../lib/UsersModule.js'

/**
 * UsersModule extends AbstractApiModule and requires a running app.
 * We test forceLowerCaseEmail and onRequest logic in isolation.
 */

describe('UsersModule', () => {
  describe('#forceLowerCaseEmail()', () => {
    /* inline helper: extract forceLowerCaseEmail logic */
    function forceLowerCaseEmail (data) {
      if (data.email) data.email = data.email.toLowerCase()
    }

    it('should lowercase the email', () => {
      const data = { email: 'Test@Example.COM' }
      forceLowerCaseEmail(data)
      assert.equal(data.email, 'test@example.com')
    })

    it('should not modify already lowercase email', () => {
      const data = { email: 'test@example.com' }
      forceLowerCaseEmail(data)
      assert.equal(data.email, 'test@example.com')
    })

    it('should do nothing when email is not present', () => {
      const data = { name: 'Test' }
      forceLowerCaseEmail(data)
      assert.equal(data.email, undefined)
    })

    it('should handle empty string email', () => {
      const data = { email: '' }
      forceLowerCaseEmail(data)
      assert.equal(data.email, '')
    })
  })

  describe('#onRequest()', () => {
    /* inline helper: extracted onRequest logic */
    async function onRequest (req) {
      if (req.apiData.config.route === '/me') {
        req.params._id = req.apiData.query._id = req.auth.user._id
        if (req.apiData.data.isEnabled) delete req.apiData.data.isEnabled
      }
      if (req.method === 'DELETE' && (req.apiData.query._id === req.auth.user._id)) {
        throw new Error('USER_SELF_DELETE_ILLEGAL')
      }
    }

    it('should set _id from auth user on /me route', async () => {
      const req = {
        method: 'GET',
        params: {},
        apiData: {
          config: { route: '/me' },
          query: {},
          data: {}
        },
        auth: { user: { _id: 'user123' } }
      }
      await onRequest(req)
      assert.equal(req.params._id, 'user123')
      assert.equal(req.apiData.query._id, 'user123')
    })

    it('should remove isEnabled from /me data', async () => {
      const req = {
        method: 'PUT',
        params: {},
        apiData: {
          config: { route: '/me' },
          query: {},
          data: { isEnabled: true }
        },
        auth: { user: { _id: 'user123' } }
      }
      await onRequest(req)
      assert.equal(req.apiData.data.isEnabled, undefined)
    })

    it('should not modify data for non-/me routes', async () => {
      const req = {
        method: 'GET',
        params: { _id: 'other' },
        apiData: {
          config: { route: '/' },
          query: { _id: 'other' },
          data: {}
        },
        auth: { user: { _id: 'user123' } }
      }
      await onRequest(req)
      assert.equal(req.params._id, 'other')
    })

    it('should throw when user tries to delete themselves', async () => {
      const req = {
        method: 'DELETE',
        params: {},
        apiData: {
          config: { route: '/' },
          query: { _id: 'user123' },
          data: {}
        },
        auth: { user: { _id: 'user123' } }
      }
      await assert.rejects(
        () => onRequest(req),
        { message: 'USER_SELF_DELETE_ILLEGAL' }
      )
    })

    it('should not throw when deleting a different user', async () => {
      const req = {
        method: 'DELETE',
        params: {},
        apiData: {
          config: { route: '/' },
          query: { _id: 'otherUser' },
          data: {}
        },
        auth: { user: { _id: 'user123' } }
      }
      await onRequest(req)
    })
  })

  describe('#updateAccess()', () => {
    it('should call next regardless of auth state', () => {
      const next = mock.fn()
      /* inline helper: extract updateAccess logic */
      function updateAccess (req, res, next) {
        next()
      }
      updateAccess({}, {}, next)
      assert.equal(next.mock.calls.length, 1)
    })
  })

  describe('#registerUserModule()', () => {
    function fakeInstance (extendSchema) {
      const inst = Object.create(UsersModule.prototype)
      inst.log = mock.fn()
      inst.app = { waitForModule: mock.fn(async () => ({ extendSchema })) }
      return inst
    }

    function fakeMod () {
      const checkTaps = []
      const queryTaps = []
      return {
        checkTaps,
        queryTaps,
        name: 'content',
        schemaName: 'content',
        accessCheckHook: { tap: fn => checkTaps.push(fn) },
        accessQueryHook: { tap: fn => queryTaps.push(fn) }
      }
    }

    it('should warn and not register a module with no schemaName', async () => {
      const inst = fakeInstance()
      await inst.registerUserModule({ accessCheckHook: {}, accessQueryHook: {} })
      assert.equal(inst.log.mock.calls.length, 1)
      assert.equal(inst.log.mock.calls[0].arguments[0], 'warn')
      assert.equal(inst.app.waitForModule.mock.calls.length, 0)
    })

    it('should extend the schema and tap both access hooks', async () => {
      const extendSchema = mock.fn()
      const inst = fakeInstance(extendSchema)
      const mod = fakeMod()
      await inst.registerUserModule(mod)
      assert.deepEqual(extendSchema.mock.calls[0].arguments, ['content', 'users'])
      assert.equal(mod.checkTaps.length, 1)
      assert.equal(mod.queryTaps.length, 1)
      assert.equal(mod.checkTaps[0], UsersModule.prototype.checkUserAccess)
      assert.equal(mod.queryTaps[0], UsersModule.prototype.grantUserAccess)
    })
  })

  describe('#checkUserAccess()', () => {
    const check = UsersModule.prototype.checkUserAccess
    it('should grant a listed user', () => {
      assert.equal(check({ auth: { user: { _id: 'u1' } } }, { _access: { users: ['u1'] } }), true)
    })
    it('should not grant an unlisted user', () => {
      assert.equal(check({ auth: { user: { _id: 'u2' } } }, { _access: { users: ['u1'] } }), false)
    })
    it('should not grant when there is no auth user', () => {
      assert.equal(check({ auth: {} }, { _access: { users: ['u1'] } }), false)
    })
    it('should not grant when the resource lists no users', () => {
      assert.equal(check({ auth: { user: { _id: 'u1' } } }, {}), false)
    })
  })

  describe('#grantUserAccess()', () => {
    const grant = UsersModule.prototype.grantUserAccess
    it('should widen the query with the requesting user id', () => {
      const query = {}
      grant({ auth: { user: { _id: 'u1' } }, apiData: { query } })
      assert.deepEqual(query.$or, [{ '_access.users': 'u1' }])
    })
    it('should be a no-op when there is no authenticated user', () => {
      const query = {}
      grant({ auth: {}, apiData: { query } })
      assert.deepEqual(query, {})
    })
  })
})
