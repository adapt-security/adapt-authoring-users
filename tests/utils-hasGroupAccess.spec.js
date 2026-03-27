import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasGroupAccess } from '../lib/utils/hasGroupAccess.js'

describe('hasGroupAccess()', () => {
  it('should return true when document has no groups', () => {
    assert.equal(hasGroupAccess([], ['group1']), true)
  })

  it('should return true when document groups is undefined', () => {
    assert.equal(hasGroupAccess(undefined, ['group1']), true)
  })

  it('should return true when document groups is null', () => {
    assert.equal(hasGroupAccess(null, ['group1']), true)
  })

  it('should return false when user has no groups but document does', () => {
    assert.equal(hasGroupAccess(['group1'], []), false)
  })

  it('should return false when user groups is undefined', () => {
    assert.equal(hasGroupAccess(['group1'], undefined), false)
  })

  it('should return false when user groups is null', () => {
    assert.equal(hasGroupAccess(['group1'], null), false)
  })

  it('should return true when user shares a group with document', () => {
    assert.equal(hasGroupAccess(['group1', 'group2'], ['group2', 'group3']), true)
  })

  it('should return false when user shares no groups with document', () => {
    assert.equal(hasGroupAccess(['group1', 'group2'], ['group3', 'group4']), false)
  })

  it('should handle ObjectId-like objects by comparing via toString()', () => {
    const docId = { toString: () => '507f1f77bcf86cd799439011' }
    const userId = { toString: () => '507f1f77bcf86cd799439011' }
    assert.equal(hasGroupAccess([docId], [userId]), true)
  })

  it('should handle mixed string and object IDs', () => {
    const objectId = { toString: () => 'abc123' }
    assert.equal(hasGroupAccess([objectId], ['abc123']), true)
    assert.equal(hasGroupAccess(['abc123'], [objectId]), true)
  })

  it('should return false for different ObjectId-like objects', () => {
    const docId = { toString: () => '507f1f77bcf86cd799439011' }
    const userId = { toString: () => '507f1f77bcf86cd799439022' }
    assert.equal(hasGroupAccess([docId], [userId]), false)
  })
})
