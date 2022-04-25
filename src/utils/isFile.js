import isUrl from './isUrl.js'


function isBase64 (value) {
  return value.includes('data:') && value.includes(';base64')
}


export default function isFile (value) {
  return isUrl(value) || isBase64(value)
}