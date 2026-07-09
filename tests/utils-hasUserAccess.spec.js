import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasUserAccess } from '../lib/utils/hasUserAccess.js'

describe('hasUserAccess()', () => {
  const cases = [
    { name: 'no doc users (undefined)', docUsers: undefined, userId: 'a', expected: false },
    { name: 'no doc users (empty)', docUsers: [], userId: 'a', expected: false },
    { name: 'no requesting user', docUsers: ['a'], userId: undefined, expected: false },
    { name: 'user listed', docUsers: ['a', 'b'], userId: 'b', expected: true },
    { name: 'user not listed', docUsers: ['a', 'b'], userId: 'c', expected: false },
    { name: 'ObjectId-like values compared via toString', docUsers: [{ toString: () => 'x' }], userId: { toString: () => 'x' }, expected: true },
    { name: 'mixed string/ObjectId-like non-match', docUsers: [{ toString: () => 'x' }], userId: 'y', expected: false }
  ]
  for (const { name, docUsers, userId, expected } of cases) {
    it(`should return ${expected} when ${name}`, () => {
      assert.equal(hasUserAccess(docUsers, userId), expected)
    })
  }
})
