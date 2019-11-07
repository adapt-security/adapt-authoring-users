const AbstractApiModule = require('adapt-authoring-api');
const { Utils } = require('adapt-authoring-core');
const UserSchema = require('../schema/user.schema.js');
/**
 * Abstract module which handles users
 * @extends {AbstractApiModule}
 */
class UsersModule extends AbstractApiModule {
  /** @override */
  static get def() {
    return {
      name: 'users',
      model: 'user',
      schemas: [ UserSchema ],
      routes: [
        {
          route: '/:_id?',
          handlers: ['post','get','put','delete']
        }
      ]
    };
  }
}
module.exports = UsersModule;
