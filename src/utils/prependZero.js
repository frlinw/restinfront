export default function prependZero (value) {
  return `${value}`.padStart(2, '0')
}