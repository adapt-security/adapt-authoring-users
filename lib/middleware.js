const { App, DataStoreQuery } = require('adapt-authoring-core');
const UserModel = require('./userModel');
/**
 * Middleware for the users module
 */
class Middleware {
    /**
     * Called when creating a new user
     * @param req The client request object
     * @param res The server response object
     * @param {function} next The next middleware function in the stack
     */
    static postUser(req, res, next) {
        new UserModel().hashPassword(req.body.password, function(error, hash) {
            const dsquery = new DataStoreQuery({ "email": req.body.email, "password": hash, "type": "user" });
            App.instance.getModule('mongodb')['create'](dsquery).then(user => {
                return res.status(200).json({ user });
            }).catch(e => next(e));
        });
    }
}

module.exports = Middleware;