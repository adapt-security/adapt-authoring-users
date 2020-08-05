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
    /** @ignore */ this.routes = this.routes.slice(1);
  }
  /**
  * Initialises the module
  * @return {Promise}
  */
  async init() {
    await super.init();
    const mongodb = await this.app.waitForModule('mongodb');
    await mongodb.setIndex(this.collectionName, 'email', { unique: true });
  }
}

module.exports = UsersModule;
