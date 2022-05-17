/**
 * Check if an objet is empty
 * @param {object} value
 * @return {boolean}
 */
export default function isEmptyObject (obj) {
  return Object.keys(obj).length === 0
}
