export default function isNumber (value) {
  return Number(value) === value && Number.isFinite(value)
}