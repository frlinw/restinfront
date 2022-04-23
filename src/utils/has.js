/**
* Wrapper for object prototype hasOwnProperty method
* because hasOwnProperty may be shadowed by properties on the object
* @param {Object} object - object to check
* @param {String} key - key to find in the object
*/
export default function has (object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}