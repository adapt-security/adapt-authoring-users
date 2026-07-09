/**
 * Checks whether a resource has been explicitly shared with a specific user.
 * Returns false when the resource lists no users; open access is expressed
 * separately by the additive `_access.public` grant.
 * @param {Array} docUsers The `_access.users` array from the resource
 * @param {String} userId The id of the requesting user
 * @return {Boolean}
 * @memberof users
 */
export function hasUserAccess (docUsers, userId) {
  if (!docUsers?.length || !userId) return false
  return docUsers.some(u => u.toString() === userId.toString())
}
