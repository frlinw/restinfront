export default function isEmail (value) {
  return /[a-zA-Z0-9._-]+@[a-zA-Z0-9-]+\.[a-zA-Z]+/.test(value)
}