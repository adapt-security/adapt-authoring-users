const AbstractApiModule = require('adapt-authoring-api');
const { Utils } = require('adapt-authoring-core');
const UserSchema = require('../schema/user.schema.js');
const Middleware = require('./middleware');
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
          route: '/:id?',
          handlers: {
            post: Middleware.postUser.bind(this),
            get: AbstractApiModule.requestHandler(),
            put: AbstractApiModule.requestHandler(),
            delete: AbstractApiModule.requestHandler()
          }
        }
      ]
    };
  }
}
module.exports = UsersModule;
