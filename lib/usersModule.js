const AbstractApiModule = require('adapt-authoring-api');
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
    this.routes = this.routes.slice(1);
  }
  async init() {
    await super.init();
    const auth = await this.app.waitForModule('auth');
    auth.secureRoute('/api/users', 'get', ['read:users']);
    auth.secureRoute('/api/users', 'post', ['write:users']);
    auth.secureRoute('/api/users', 'put', ['write:users']);
    auth.secureRoute('/api/users', 'delete', ['write:users']);
  }
}

module.exports = UsersModule;
