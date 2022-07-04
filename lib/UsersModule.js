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
      {
        route: '/role/unassign',
        modifiers: ['post'],
        handlers: { post: this.unassignRole.bind(this) },
        permissions: { post: ['write:users'] },
      },
      {
        route: '/role/assign',
        modifiers: ['post'],
        handlers: { post: this.assignRole.bind(this) },
        permissions: { post: ['write:users'] },
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

  /**
   * Handles removing a user role
   * @param {ClientRequest} req
   * @param {ServerResponse} res
   * @param {Function} next
   */
  async unassignRole(req, res, next) {
    let dropRole = req.body.role;
    let userId = req.body._id;
    if (!dropRole || !userId) return res.status(500).send(this.app.lang.t('error.missingfields'));
    this.find({_id: userId}, {})
    .then((results) => {
      if (!results) return res.status(500).send(this.app.lang.t('error.faileduserquery'));

      let filteredRoles = results[0].roles.map(role => {
        if (role.toString() !== dropRole) return role.toString();
      }).filter(role => typeof role !== 'undefined');

      this.update({ _id: userId }, { roles: filteredRoles }, {})
      .then(results =>  {
        return res.status(200).json(results);
      });
    })
    .catch(next);
  }

  /**
   * Handles adding a user role
   * @param {ClientRequest} req
   * @param {ServerResponse} res
   * @param {Function} next
   */
  async assignRole(req, res, next) {
    let newRole = req.body.role;
    let userId = req.body._id;
    if (!newRole || !userId) return res.status(500).send(this.app.lang.t('error.missingfields'));
    this.find({_id: userId}, {})
    .then((results) => {
      if (!results) return res.status(500).send(this.app.lang.t('error.faileduserquery'));

      let newRoles = results[0].roles.map(role => {
        return role.toString();
      });
      newRoles.push(newRole);
      this.update({ _id: userId }, { roles: newRoles }, {})
      .then(results => {
        return res.status(200).json(results);
      });
    })
    .catch(next);
  }
}

export default UsersModule;