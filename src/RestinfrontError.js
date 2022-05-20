export default class RestinfrontError extends Error {
  constructor (message) {
    super(`[Restinfront] ${message}`)
    this.name = this.constructor.name
  }
}
