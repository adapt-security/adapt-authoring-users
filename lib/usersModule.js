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

    const [ auth, mongodb ] = await this.app.waitForModule('auth', 'mongodb');

    auth.permissions.secureRoute('/api/users', 'get', ['read:users']);
    auth.permissions.secureRoute('/api/users', 'post', ['write:users']);
    auth.permissions.secureRoute('/api/users', 'put', ['write:users']);
    auth.permissions.secureRoute('/api/users', 'delete', ['write:users']);

    await mongodb.getCollection(this.collectionName).createIndex('email', { unique: true });
  }
}

module.exports = UsersModule;
