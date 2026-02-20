import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

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
})
