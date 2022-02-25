import AbstractApiModule from 'adapt-authoring-api';
/**
 * Module which handles user management
 * @extends {AbstractApiModule}
 */
class UsersModule extends AbstractApiModule {
  /** @override */
  async setValues() {
    /** @ignore */ this.root = 'users';
    /** @ignore */ this.schemaName = 'user';
    /** @ignore */ this.collectionName = 'users';

    this.useDefaultRouteConfig();
    /** @ignore */ this.routes = [
      {
        route: '/',
        handlers: { get: this.queryHandler()  },
        permissions: { get: ['read:users'] },
      },
      {
        route: '/me',
        modifiers: ['put', 'patch'],
        handlers: { get: this.requestHandler(), put: this.requestHandler(), patch: this.requestHandler() },
        permissions: { get: ['read:me'], put: ['write:me'], patch: ['write:me'] },
      },
      ...this.routes.slice(1)
    ];
  }
  /**
   * Initialises the module
   * @return {Promise}
   */
  async init() {
    await super.init();
    const [mongodb, server] = await this.app.waitForModule('mongodb', 'server');
    await mongodb.setIndex(this.collectionName, 'email', { unique: true });

    server.api.addHandlerMiddleware(this.updateAccess.bind(this));
    this.requestHook.tap(this.onRequest.bind(this));

    this.insertHook.tap(this.forceLowerCaseEmail);
    this.updateHook.tap(this.forceLowerCaseEmail);
  }
  forceLowerCaseEmail(data) {
    if(data.email) data.email = data.email.toLowerCase();
  }
  /**
   * Updates the user access timestamp
   * @param {ClientRequest} req
   * @param {ServerResponse} res
   * @param {Function} next
   */
  updateAccess(req, res, next) {
    const _id = req.auth?.user?._id;
    if(_id) { // note we only log any errors, as it's not necessarily a problem
      this.update({ _id }, { lastAccess: new Date().toISOString() })
        .catch(e => this.log('warn', `Failed to update user lastAccess, ${e}`));
    }
    next();
  }
  /**
   * Adds the current user _id to an incoming request to API
   * @param {ClientRequest} req
   */
  async onRequest(req) {
    if(req.apiData.config.route === '/me') {
      try {
        req.params._id = req.apiData.query._id = req.auth.user._id;
      } catch(e) {
        throw this.app.errors.UNAUTHORISED;
      }
    }
  }
}

export default UsersModule;