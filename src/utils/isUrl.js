export default function isUrl (value) {
  return /^https?:\/\/[a-zA-Z0-9-_.?=&]/.test(value)
}