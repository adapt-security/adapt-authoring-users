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
    this.groupModules = []
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

    await this.registerGroupModule(this)
  }

  /**
   * Registers a module for use with groups. Extends the module's schema
   * with the userGroups field.
   * @param {AbstractApiModule} mod
   */
  async registerGroupModule (mod) {
    if (!mod.schemaName) {
      return this.log('warn', 'cannot register module, module doesn\'t define a schemaName')
    }
    const jsonschema = await this.app.waitForModule('jsonschema')
    jsonschema.extendSchema(mod.schemaName, 'usergroups')
    this.log('debug', `registered ${mod.name} for use with groups`)
    this.groupModules.push(mod)
  }

  forceLowerCaseEmail (data) {
    if (data.email) data.email = data.email.toLowerCase()
  }

  /** @override */
  async processRequestMiddleware (req, res, next) {
    super.processRequestMiddleware(req, res, () => {
      req.apiData.schemaName = req.routeConfig.schemaName || req.auth.userSchemaName
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
      await this.removeGroupRefs(doc._id)
    }
    return doc
  }

  /**
   * Removes references to a deleted group from all registered modules
   * @param {String} groupId The _id of the deleted group
   */
  async removeGroupRefs (groupId) {
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
}

export default UsersModule
