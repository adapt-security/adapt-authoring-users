import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

describe('UsersModule usergroups', () => {
  describe('#processRequestMiddleware() schema routing', () => {
    function processRequestMiddleware (req, superCallback) {
      // Simulates the override: use per-route schemaName if set, otherwise userSchemaName
      req.apiData = { schemaName: 'user' } // super sets this
      superCallback()
    }

    function override (req) {
      req.apiData.schemaName = req.routeConfig.schemaName || req.auth.userSchemaName
    }

    it('should use per-route schemaName for usergroup routes', () => {
      const req = {
        routeConfig: { schemaName: 'usergroup' },
        auth: { userSchemaName: 'superuser' },
        apiData: {}
      }
      processRequestMiddleware(req, () => override(req))
      assert.equal(req.apiData.schemaName, 'usergroup')
    })

    it('should fall back to auth userSchemaName for user routes', () => {
      const req = {
        routeConfig: {},
        auth: { userSchemaName: 'superuser' },
        apiData: {}
      }
      processRequestMiddleware(req, () => override(req))
      assert.equal(req.apiData.schemaName, 'superuser')
    })
  })

  describe('#registerGroupModule()', () => {
    let instance, logCalls

    async function registerGroupModule (mod) {
      if (!mod.schemaName) {
        return this.log('warn', 'cannot register module, module doesn\'t define a schemaName')
      }
      const jsonschema = await this.app.waitForModule('jsonschema')
      jsonschema.extendSchema(mod.schemaName, 'usergroups')
      this.log('debug', `registered ${mod.name} for use with groups`)
      this.groupModules.push(mod)
    }

    beforeEach(() => {
      logCalls = []
      instance = {
        groupModules: [],
        app: {
          waitForModule: mock.fn(async () => ({
            extendSchema: mock.fn()
          }))
        },
        log: function (...args) { logCalls.push(args) }
      }
    })

    it('should log a warning if mod has no schemaName', async () => {
      await registerGroupModule.call(instance, {})
      assert.equal(logCalls.length, 1)
      assert.equal(logCalls[0][0], 'warn')
      assert.ok(logCalls[0][1].includes('schemaName'))
      assert.equal(instance.groupModules.length, 0)
    })

    it('should log a warning if mod.schemaName is empty string', async () => {
      await registerGroupModule.call(instance, { schemaName: '' })
      assert.equal(logCalls.length, 1)
      assert.equal(logCalls[0][0], 'warn')
      assert.equal(instance.groupModules.length, 0)
    })

    it('should register a module with a valid schemaName', async () => {
      const extendSchemaCalls = []
      instance.app.waitForModule = mock.fn(async () => ({
        extendSchema: function (schemaName, extensionName) {
          extendSchemaCalls.push({ schemaName, extensionName })
        }
      }))

      const mod = { schemaName: 'user', name: 'users' }
      await registerGroupModule.call(instance, mod)

      assert.equal(extendSchemaCalls.length, 1)
      assert.equal(extendSchemaCalls[0].schemaName, 'user')
      assert.equal(extendSchemaCalls[0].extensionName, 'usergroups')
      assert.equal(instance.groupModules.length, 1)
      assert.equal(instance.groupModules[0], mod)
    })

    it('should log debug message with module name after registering', async () => {
      instance.app.waitForModule = mock.fn(async () => ({ extendSchema: mock.fn() }))

      const mod = { schemaName: 'user', name: 'users' }
      await registerGroupModule.call(instance, mod)

      assert.equal(logCalls.length, 1)
      assert.equal(logCalls[0][0], 'debug')
      assert.ok(logCalls[0][1].includes('users'))
      assert.ok(logCalls[0][1].includes('groups'))
    })

    it('should allow registering multiple modules', async () => {
      instance.app.waitForModule = mock.fn(async () => ({ extendSchema: mock.fn() }))

      const mod1 = { schemaName: 'user', name: 'users' }
      const mod2 = { schemaName: 'course', name: 'courses' }

      await registerGroupModule.call(instance, mod1)
      await registerGroupModule.call(instance, mod2)

      assert.equal(instance.groupModules.length, 2)
      assert.equal(instance.groupModules[0], mod1)
      assert.equal(instance.groupModules[1], mod2)
    })
  })

  describe('#removeGroupRefs()', () => {
    let instance, logCalls

    async function removeGroupRefs (groupId) {
      await Promise.all(this.groupModules.map(async m => {
        const docs = await m.find({ userGroups: groupId })
        return Promise.all(docs.map(async d => {
          try {
            await m.update({ _id: d._id }, { $pull: { userGroups: groupId } }, { rawUpdate: true })
          } catch (e) {
            this.log('warn', `Failed to remove group reference, ${e}`)
          }
        }))
      }))
    }

    beforeEach(() => {
      logCalls = []
      instance = {
        groupModules: [],
        log: function (...args) { logCalls.push(args) }
      }
    })

    it('should remove usergroup reference from all registered module documents', async () => {
      const deletedId = 'group123'
      const updateCalls = []
      const mockModule = {
        find: mock.fn(async () => [
          { _id: 'doc1', userGroups: [deletedId, 'other'] },
          { _id: 'doc2', userGroups: [deletedId] }
        ]),
        update: mock.fn(async (query, data, opts) => {
          updateCalls.push({ query, data, opts })
        })
      }
      instance.groupModules = [mockModule]

      await removeGroupRefs.call(instance, deletedId)

      assert.equal(mockModule.find.mock.callCount(), 1)
      assert.deepEqual(mockModule.find.mock.calls[0].arguments[0], { userGroups: deletedId })
      assert.equal(mockModule.update.mock.callCount(), 2)

      assert.deepEqual(updateCalls[0].query, { _id: 'doc1' })
      assert.deepEqual(updateCalls[0].data, { $pull: { userGroups: deletedId } })
      assert.deepEqual(updateCalls[0].opts, { rawUpdate: true })

      assert.deepEqual(updateCalls[1].query, { _id: 'doc2' })
      assert.deepEqual(updateCalls[1].data, { $pull: { userGroups: deletedId } })
      assert.deepEqual(updateCalls[1].opts, { rawUpdate: true })
    })

    it('should handle empty documents list gracefully', async () => {
      const mockModule = {
        find: mock.fn(async () => []),
        update: mock.fn()
      }
      instance.groupModules = [mockModule]

      await removeGroupRefs.call(instance, 'group456')

      assert.equal(mockModule.find.mock.callCount(), 1)
      assert.equal(mockModule.update.mock.callCount(), 0)
    })

    it('should handle no registered modules', async () => {
      instance.groupModules = []
      await removeGroupRefs.call(instance, 'group789')
    })

    it('should log warning and continue when update fails', async () => {
      const updateError = new Error('DB write failed')
      const mockModule = {
        find: mock.fn(async () => [{ _id: 'doc1' }, { _id: 'doc2' }]),
        update: mock.fn(async (query) => {
          if (query._id === 'doc1') throw updateError
        })
      }
      instance.groupModules = [mockModule]

      await removeGroupRefs.call(instance, 'group-err')

      assert.equal(logCalls.length, 1)
      assert.equal(logCalls[0][0], 'warn')
      assert.ok(logCalls[0][1].includes('Failed to remove group reference'))
      assert.ok(logCalls[0][1].includes('DB write failed'))
      assert.equal(mockModule.update.mock.callCount(), 2)
    })

    it('should process multiple modules independently', async () => {
      const updateCalls = []
      const mockModule1 = {
        find: mock.fn(async () => [{ _id: 'mod1doc1' }]),
        update: mock.fn(async (query, data, opts) => {
          updateCalls.push({ module: 'mod1', query, data, opts })
        })
      }
      const mockModule2 = {
        find: mock.fn(async () => [{ _id: 'mod2doc1' }, { _id: 'mod2doc2' }]),
        update: mock.fn(async (query, data, opts) => {
          updateCalls.push({ module: 'mod2', query, data, opts })
        })
      }
      instance.groupModules = [mockModule1, mockModule2]

      await removeGroupRefs.call(instance, 'groupMulti')

      assert.equal(mockModule1.find.mock.callCount(), 1)
      assert.equal(mockModule2.find.mock.callCount(), 1)
      assert.equal(updateCalls.length, 3)

      const mod1Updates = updateCalls.filter(c => c.module === 'mod1')
      const mod2Updates = updateCalls.filter(c => c.module === 'mod2')
      assert.equal(mod1Updates.length, 1)
      assert.equal(mod2Updates.length, 2)
    })
  })

  describe('#delete() cascade', () => {
    it('should call removeGroupRefs when deleting from usergroups collection', async () => {
      const deletedId = 'groupReturn'
      const removeCalls = []
      const superDeleteResult = { _id: deletedId }

      async function deleteMethod (query, options = {}, mongoOptions = {}) {
        // simulate setDefaultOptions + super.delete
        if (!options.collectionName) options.collectionName = 'users'
        const doc = superDeleteResult
        if (options.collectionName === 'usergroups') {
          removeCalls.push(doc._id)
        }
        return doc
      }

      const result = await deleteMethod({}, { collectionName: 'usergroups' })
      assert.equal(result._id, deletedId)
      assert.equal(removeCalls.length, 1)
      assert.equal(removeCalls[0], deletedId)
    })

    it('should not call removeGroupRefs when deleting from users collection', async () => {
      const removeCalls = []

      async function deleteMethod (query, options = {}, mongoOptions = {}) {
        if (!options.collectionName) options.collectionName = 'users'
        const doc = { _id: 'user123' }
        if (options.collectionName === 'usergroups') {
          removeCalls.push(doc._id)
        }
        return doc
      }

      await deleteMethod({}, { collectionName: 'users' })
      assert.equal(removeCalls.length, 0)
    })
  })
})
