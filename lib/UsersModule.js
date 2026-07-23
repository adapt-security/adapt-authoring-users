import AbstractApiModule, { addAccessClause } from 'adapt-authoring-api'
import { hasUserAccess } from './utils.js'
/**
 * Module which handles user management
 * @memberof users
 * @extends {AbstractApiModule}
 */
class UsersModule extends AbstractApiModule {
  /** @override */
  async setValues () {
    await super.setValues()
    /** @ignore */ this.schemaName = 'user'
    /** @ignore */ this.collectionName = 'users'
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
      this.preUpdateHook.tap((ogDoc, updateData) => this.forceLowerCaseEmail(updateData))
    }
  }

  forceLowerCaseEmail (data) {
    if (data.email) data.email = data.email.toLowerCase()
  }

  /**
   * Extends a module's `_access` object with a `users` grant key so its resources can be shared
   * with specific users, and taps the module's access hooks to grant a listed user access. This is
   * the consumer-facing API: a module opts in by calling this alongside `enableAccessControl()`.
   * @param {AbstractApiModule} mod The module to register for user-level access sharing
   * @return {Promise}
   */
  async registerUserModule (mod) {
    if (!mod.schemaName) {
      return this.log('warn', 'cannot register module for user access, no schemaName defined')
    }
    const jsonschema = await this.app.waitForModule('jsonschema')
    jsonschema.extendSchema(mod.schemaName, 'users')
    mod.accessCheckHook.tap(this.checkUserAccess)
    mod.accessQueryHook.tap(this.grantUserAccess)
    this.log('debug', `registered ${mod.name} for user access`)
  }

  /**
   * Per-item user grant (an `accessCheckHook` observer): grants access when the requesting user is
   * listed in the resource's `_access.users`.
   * @param {external:ExpressRequest} req
   * @param {Object} resource The resource being accessed
   * @return {Boolean}
   */
  checkUserAccess (req, resource) {
    return hasUserAccess(resource?._access?.users, req.auth?.user?._id)
  }

  /**
   * Query-level user grant (an `accessQueryHook` observer): widens the query to include resources
   * shared with the requesting user. No-op when there is no authenticated user.
   * @param {external:ExpressRequest} req
   */
  grantUserAccess (req) {
    const _id = req.auth?.user?._id
    if (_id) addAccessClause(req.apiData.query, { '_access.users': _id.toString() })
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
      if (!req.auth?.user?._id) throw this.app.errors.UNAUTHENTICATED
      req.params._id = req.apiData.query._id = req.auth.user._id
      // users shouldn't be able to disable themselves
      if (req.apiData.data.isEnabled) delete req.apiData.data.isEnabled
    }
    if (req.method === 'DELETE' && req.auth?.user?._id && req.apiData.query._id === req.auth.user._id) {
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

  /**
   * Transfers all content owned by the route user to the user passed as `_toUser` in the request body.
   * @param {external:ExpressRequest} req
   * @param {external:ExpressResponse} res
   * @param {Function} next
   * @return {Promise}
   */
  /**
   * Lists the courses and assets owned by the route user (for a transfer preview).
   * @param {external:ExpressRequest} req
   * @param {external:ExpressResponse} res
   * @param {Function} next
   * @return {Promise}
   */
  async ownedContentHandler (req, res, next) {
    try {
      const authored = await this.app.waitForModule('authored')
      res.json(await authored.getOwnedSummary(req.apiData.query._id))
    } catch (e) {
      next(e)
    }
  }

  async transferContentHandler (req, res, next) {
    try {
      const fromId = req.apiData.query._id
      const toId = req.apiData.data?._toUser
      if (!toId || toId === fromId) {
        throw this.app.errors.INVALID_TRANSFER_TARGET.setData({ _toUser: toId })
      }
      const [target] = await this.find({ _id: toId })
      if (!target) {
        throw this.app.errors.INVALID_TRANSFER_TARGET.setData({ _toUser: toId })
      }
      const authored = await this.app.waitForModule('authored')
      const moved = await authored.transferOwnership(fromId, toId)
      res.json({ moved })
    } catch (e) {
      next(e)
    }
  }
}

export default UsersModule
