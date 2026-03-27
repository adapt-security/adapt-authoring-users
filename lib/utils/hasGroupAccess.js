/**
 * Checks whether a user shares at least one group with a document.
 * Returns true if the document has no group restrictions.
 * @param {Array} docGroups The userGroups array from the document
 * @param {Array} userGroups The userGroups array from the requesting user
 * @return {Boolean}
 * @memberof users
 */
export function hasGroupAccess (docGroups, userGroups) {
  if (!docGroups?.length) return true
  if (!userGroups?.length) return false
  const userSet = new Set(userGroups.map(g => g.toString()))
  return docGroups.some(g => userSet.has(g.toString()))
}
