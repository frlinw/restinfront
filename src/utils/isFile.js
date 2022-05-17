import isUrl from './isUrl.js'

/**
 * @param {string} value
 * @return {boolean}
 */
function isBase64 (value) {
  return value.includes('data:') && value.includes(';base64')
}

/**
 * Check if a value is a URL or a base64 string
 * @param {string} value
 * @return {boolean}
 */
export default function isFile (value) {
  return isUrl(value) || isBase64(value)
}
