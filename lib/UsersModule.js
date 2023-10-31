import AbstractApiModule from 'adapt-authoring-api'
/**
 * Module which handles user management
 * @memberof users
 * @extends {AbstractApiModule}
 */
class UsersModule extends AbstractApiModule {
  /** @override */
  async setValues () {
    /** @ignore */ this.root = 'users'
    /** @ignore */ this.schemaName = 'user'
    /** @ignore */ this.collectionName = 'users'

    this.useDefaultRouteConfig()
    // remove POST / route
    delete this.routes.find(r => r.route === '/').handlers.post

    const desc = method => `This endpoint is shorthand for \`${method}\` \`/api/${this.root}/:_id\`, see the documentation for that endpoint for more details`

    this.routes = [{
      route: '/me',
      modifiers: ['put', 'patch'],
      handlers: { get: this.requestHandler(), put: this.requestHandler(), patch: this.requestHandler() },
      permissions: { get: ['read:me'], put: ['write:me'], patch: ['write:me'] },
      meta: {
        get: { summary: 'Retrieve your own user data', description: desc('GET') },
        put: { summary: 'Replace your own user data', description: desc('PUT') },
        patch: { summary: 'Update your own user data', description: desc('PATCH') }
      }
    }, ...this.routes]
  }

  /**
   * Initialises the module
   * @return {Promise}
   */
  async init () {
    await super.init()
    const [mongodb, server] = await this.app.waitForModule('mongodb', 'server')
    await mongodb.setIndex(this.collectionName, 'email', { unique: true })

    server.api.addHandlerMiddleware(this.updateAccess.bind(this))

    this.requestHook.tap(this.onRequest.bind(this))

    if (this.getConfig('forceLowerCaseEmail')) {
      this.preInsertHook.tap(this.forceLowerCaseEmail)
      this.preUpdateHook.tap(this.forceLowerCaseEmail)
    }
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
}

export default UsersModule
