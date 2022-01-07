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

    const perms = ['write:me'];
    const handler = this.requestHandler();

    this.useDefaultRouteConfig();
    /** @ignore */ this.routes = [
      {
        route: '/me',
        handlers: { get: handler, put: handler, patch: handler },
        permissions: { get: perms, put: perms, patch: perms },
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