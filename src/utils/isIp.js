export default function isIp (value) {
  const blocks = value.split('.')

  if (blocks.length === 4) {
    return blocks.every(block => (
      !Number.isNaN(block) &&
      Number.parseInt(block, 10) >= 0 &&
      Number.parseInt(block, 10) <= 255
    ))
  }

  return false
}