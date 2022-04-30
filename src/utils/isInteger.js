import isNumber from './isNumber.js'


export default function isInteger (value) {
  return isNumber(value) && Number.isInteger(value)
}