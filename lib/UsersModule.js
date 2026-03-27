import AbstractApiModule from 'adapt-authoring-api'
/**
 * Module which handles user management and user groups
 * @memberof users
 * @extends {AbstractApiModule}
 */
class UsersModule extends AbstractApiModule {
  /** @override */
  async setValues () {
    await super.setValues()
    /** @ignore */ this.schemaName = 'user'
    /** @ignore */ this.collectionName = 'users'
    /**
     * Modules registered for user group support
     * @type {Array<AbstractApiModule>}
     */
    this.usergroupModules = []
  }

  /**
   * Initialises the module
   * @return {Promise}
   */
  async init () {
    await super.init()
    const [mongodb, server, auth] = await this.app.waitForModule('mongodb', 'server', 'auth')
    await mongodb.setIndex(this.collectionName, 'email', { unique: true })

    server.api.addHandlerMiddleware(this.updateAccess.bind(this))

    this.requestHook.tap(this.onRequest.bind(this))

    if (this.getConfig('forceLowerCaseEmail')) {
      this.preInsertHook.tap(this.forceLowerCaseEmail)
      this.preUpdateHook.tap((ogDoc, updateData) => this.forceLowerCaseEmail(updateData))
    }

    this.initUsergroupRoutes(server, auth)
    await this.registerUsergroupModule(this)
  }

  /**
   * Sets up the /api/usergroups child router and routes
   * @param {Object} server The server module
   * @param {Object} auth The auth module
   */
  initUsergroupRoutes (server, auth) {
    this.usergroupsRouter = server.api.createChildRouter('usergroups')
    this.usergroupsRouter.addHandlerMiddleware(
      this.usergroupsProcessRequest.bind(this),
      this.sanitiseRequestDataMiddleware.bind(this)
    )
    const routes = [
      {
        route: '/',
        handlers: { get: this.queryHandler.bind(this), post: this.requestHandler.bind(this) },
        permissions: { get: ['read:usergroups'], post: ['write:usergroups'] }
      },
      {
        route: '/:_id',
        handlers: {
          get: this.requestHandler.bind(this),
          put: this.requestHandler.bind(this),
          patch: this.requestHandler.bind(this),
          delete: this.requestHandler.bind(this)
        },
        permissions: {
          get: ['read:usergroups'],
          put: ['write:usergroups'],
          patch: ['write:usergroups'],
          delete: ['write:usergroups']
        }
      }
    ]
    routes.forEach(r => {
      Object.entries(r.permissions).forEach(([method, perms]) => {
        const route = r.route.endsWith('/') ? r.route.slice(0, -1) : r.route
        auth.secureRoute(this.usergroupsRouter.path + route, method, perms)
      })
      this.usergroupsRouter.addRoute(r)
    })
  }

  /**
   * Express middleware to prepare req.apiData for usergroup requests
   * @param {external:ExpressRequest} req
   * @param {external:ExpressResponse} res
   * @param {Function} next
   */
  usergroupsProcessRequest (req, res, next) {
    const config = req.routeConfig || {}
    const modifiers = config.modifiers ?? ['post', 'put', 'patch', 'delete']
    const modifying = config.modifying ?? modifiers.includes(req.method.toLowerCase())
    req.apiData = {
      collectionName: 'usergroups',
      config,
      data: { ...req.body },
      modifying,
      query: { ...req.query, ...req.params },
      schemaName: 'usergroup'
    }
    next()
  }

  /**
   * Registers a module for use with user groups. Extends the module's schema
   * with the userGroups field.
   * @param {AbstractApiModule} mod
   */
  async registerUsergroupModule (mod) {
    if (!mod.schemaName) {
      return this.log('warn', 'cannot register module, module doesn\'t define a schemaName')
    }
    const jsonschema = await this.app.waitForModule('jsonschema')
    jsonschema.extendSchema(mod.schemaName, 'usergroups')
    this.log('debug', `registered ${mod.name} for use with usergroups`)
    this.usergroupModules.push(mod)
  }

  forceLowerCaseEmail (data) {
    if (data.email) data.email = data.email.toLowerCase()
  }

  /** @override */
  async processRequestMiddleware (req, res, next) {
    super.processRequestMiddleware(req, res, () => {
      req.apiData.schemaName = req.auth.userSchemaName
      next()
    })
  }

  /**
   * Updates the user access timestamp
   * @param {external:ExpressRequest} req
   * @param {external:ExpressResponse} res
   * @param {Function} next
   */
  updateAccess (req, res, next) {
    const _id = req.auth?.user?._id
    if (_id) { // note we only log any errors, as it's not necessarily a problem
      this.update({ _id }, { lastAccess: new Date().toISOString() })
        .catch(e => this.log('warn', `Failed to update user lastAccess, ${e}`))
    }
    next()
  }

  /**
   * Adds the current user _id to an incoming request to API
   * @param {external:ExpressRequest} req
   */
  async onRequest (req) {
    if (req.apiData.config.route === '/me') {
      req.params._id = req.apiData.query._id = req.auth.user._id
      // users shouldn't be able to disable themselves
      if (req.apiData.data.isEnabled) delete req.apiData.data.isEnabled
    }
    if (req.method === 'DELETE' && (req.apiData.query._id === req.auth.user._id)) {
      throw this.app.errors.USER_SELF_DELETE_ILLEGAL
        .setData({ id: req.user._id })
    }
  }

  /** @override */
  async insert (data, options, mongoOptions) {
    try {
      return await super.insert(data, options, mongoOptions)
    } catch (e) {
      if (e.code === this.app.errors.MONGO_DUPL_INDEX) throw this.app.errors.DUPL_USER.setData({ email: data.email })
      throw e
    }
  }

  /** @override */
  async find (query, options = {}, mongoOptions = {}) {
    query.email = this.getConfig('forceLowerCaseEmail') ? query.email?.toLowerCase() : undefined
    return super.find(query, options, mongoOptions)
  }

  /** @override */
  async delete (query, options = {}, mongoOptions = {}) {
    const doc = await super.delete(query, options, mongoOptions)
    if (options.collectionName === 'usergroups') {
      await this.removeUsergroupRefs(doc._id)
    }
    return doc
  }

  /**
   * Removes references to a deleted usergroup from all registered modules
   * @param {String} groupId The _id of the deleted usergroup
   */
  async removeUsergroupRefs (groupId) {
    await Promise.all(this.usergroupModules.map(async m => {
      const docs = await m.find({ userGroups: groupId })
      return Promise.all(docs.map(async d => {
        try {
          await m.update({ _id: d._id }, { $pull: { userGroups: groupId } }, { rawUpdate: true })
        } catch (e) {
          this.log('warn', `Failed to remove usergroup, ${e}`)
        }
      }))
    }))
  }
}

export default UsersModule
