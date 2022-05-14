import has from './utils/has.js'
import isFunction from './utils/isFunction.js'
import isArray from './utils/isArray.js'
import isObject from './utils/isObject.js'
import isString from './utils/isString.js'
import isDate from './utils/isDate.js'
import joinPaths from './utils/joinPaths.js'


const COLLECTION_SYMBOL = Symbol.for('collection')


class Model {
  static configured = false
  static collectionKey = 'collection'
  static endpoint = ''
  static authentication = false
  static primaryKeyRequired = true
  static buildRawItemOnNew = true
  static collectionDataKey = 'rows'
  static collectionCountKey = 'count'
  static onValidationError = () => null
  static onFetchError = () => null

  /*****************************************************************
  * Static: Public API
  *****************************************************************/

  static config (options = {}) {
    if (!options.baseUrl) {
      throw new Error(`[Restinfront][Config] \`baseUrl\` is required`)
    }

    this.baseUrl = options.baseUrl

    if ('authentication' in options) {
      this.authentication = options.authentication
    }
    if ('collectionDataKey' in options) {
      this.collectionDataKey = options.collectionDataKey
    }
    if ('collectionCountKey' in options) {
      this.collectionCountKey = options.collectionCountKey
    }
    if ('onValidationError' in options) {
      this.onValidationError = options.onValidationError
    }
    if ('onFetchError' in options) {
      this.onFetchError = options.onFetchError
    }

    this.configured = true
  }

  static init (schema, options = {}) {
    if (!this.configured) {
      throw new Error(`[Restinfront][${this.name}] Model.config() must be called before ${this.name}.init()`)
    }

    // Override global config
    if ('authentication' in options) {
      this.authentication = options.authentication
    }
    if ('primaryKeyRequired' in options) {
      this.primaryKeyRequired = options.primaryKeyRequired
    }
    if ('buildRawItemOnNew' in options) {
      this.buildRawItemOnNew = options.buildRawItemOnNew
    }

    // Prebuild the url
    if (options.endpoint) {
      this.endpoint = options.endpoint
      this.requestUrl = joinPaths(this.baseUrl, this.endpoint)
    }

    // Parse schema fields to set default values for each option
    this.schema = schema
    this.primaryKeyFieldname = null

    for (const fieldname in this.schema) {
      const fieldconf = this.schema[fieldname]

      // Type is a required param
      if (!('type' in fieldconf)) {
        throw new Error(`[Restinfront][${this.name}] \`type\` is missing on field '${fieldname}'`)
      }

      // Set the primary key
      if (fieldconf.primaryKey) {
        this.primaryKeyFieldname = fieldname
      }

      // Define the default value
      const defaultValue = 'defaultValue' in fieldconf
        ? fieldconf.defaultValue
        : fieldconf.type.defaultValue
      // Optimization: Ensure defaultValue is a function (avoid type check on runtime)
      fieldconf.defaultValue = isFunction(defaultValue)
        ? defaultValue
        : () => defaultValue

      // Default blank is restricted
      const allowBlank = 'allowBlank' in fieldconf
        ? fieldconf.allowBlank
        : false
      // Optimization: Ensure allowBlank is a function (avoid type check on runtime)
      fieldconf.allowBlank = isFunction(allowBlank)
        ? allowBlank
        : () => allowBlank

      // Default valid method is permissive
      if (!('isValid' in fieldconf)) {
        fieldconf.isValid = () => true
      }

      // Require validation as a default except for primary key and timestamp fields
      fieldconf.autoChecked = fieldconf.autoChecked || fieldconf.primaryKey || ['createdAt', 'updatedAt'].includes(fieldname) || false
    }

    if (
      this.primaryKeyRequired &&
      this.primaryKeyFieldname === null
    ) {
      throw new Error(`[Restinfront][${this.name}] \`primaryKey\` is missing`)
    }

    return this
  }

  /*****************************************************************
  * Data formating
  *****************************************************************/

  static _buildRawItem (item = {}) {
    const rawItem = {}

    // Build the item with default values
    const primaryKey = item['primaryKey'] || item[this.primaryKeyFieldname] || this.schema[this.primaryKeyFieldname].defaultValue()

    for (const fieldname in this.schema) {
      if (fieldname === this.primaryKeyFieldname) {
        rawItem[fieldname] = primaryKey
      } else if (has(item, fieldname)) {
        rawItem[fieldname] = item[fieldname]
      } else {
        rawItem[fieldname] = this.schema[fieldname].defaultValue(primaryKey) // primaryKey argument is necessary for HASONE datatype
      }
    }

    return rawItem
  }

  static _buildValidator () {
    const validator = {}

    // Build the base validator
    for (const fieldname in this.schema) {
      const fieldconf = this.schema[fieldname]

      validator[fieldname] = {
        checked: fieldconf.autoChecked,
        isValid: (value, data) => {
          const isBlank = fieldconf.type.isBlank(value)

          return (
            (
              // Blank and allowed
              (isBlank && fieldconf.allowBlank(value, data)) ||
              // Not blank and valid
              (!isBlank && fieldconf.type.isValid(value))
            ) &&
            // Custom valid method
            fieldconf.isValid(value, data)
          )
        }
      }
    }

    return validator
  }

  /**
   * Throw an error if the instance is not a collection
   */
  _allowCollection () {
    if (!this.isCollection) {
      throw new Error('[Restinfront] Cannot use a collection method on a single item instance')
    }
  }

  /**
   * Throw an error if the instance is not a single item
   */
  _allowSingleItem () {
    if (this.isCollection) {
      throw new Error('[Restinfront] Cannot use a single item method on a collection instance')
    }
  }

  /**
   * Set the list of items
   */
  _setCollection (newCollection) {
    this[this.constructor.collectionKey] = newCollection
  }

  /**
   * Update the current model instance with new data
   */
  _mutateData (newData) {
    if (newData.isCollection) {
      // Extend the list or just replace it
      if (this.$restinfront.fetch?.options?.extend) {
        newData.forEach(newItem => this.add(newItem))
      } else {
        this._setCollection(newData.items())
      }

      this.$restinfront.count = newData.$restinfront.count
    } else {
      Object.keys(newData).forEach(key => {
        const value = newData[key]

        // Mutate only some keys
        if (key === '$restinfront') {
          this[key].isNew = value.isNew
        // Recursive mutation
        } else if (
          this[key] instanceof Model &&
          value instanceof Model
        ) {
          this[key]._mutateData(value)
        // Basic fields
        } else {
          this[key] = value
        }
      })
    }
  }

  /**
   * Format collections and objects to use in back
   */
  beforeSave (options) {
    if (this.isCollection) {
      return this.map(item => item._beforeSaveItem(options))
    } else {
      return this._beforeSaveItem(options)
    }
  }

  /**
   * Format data recursively based on schema definition
   */
  _beforeSaveItem (options) {
    const removeInvalid = options?.removeInvalid
    const newItem = {}

    for (const fieldname in this.$restinfront.validator) {
      const validator = this.$restinfront.validator[fieldname]
      const value = this[fieldname]

      if (removeInvalid) {
        if (validator.checked && validator.isValid(value, this)) {
          newItem[fieldname] = this.constructor.schema[fieldname].type.beforeSave(value, options)
        }
      } else {
        newItem[fieldname] = this.constructor.schema[fieldname].type.beforeSave(value, options)
      }
    }

    return newItem
  }

  /**
  * Build instance item
  */
  constructor (data, options = {}) {
    options = {
      isNew: true,
      ...options
    }

    this.$restinfront = {
      fetch: {
        options: null,
        request: null,
        response: null,
        getProgressing: false,
        getSucceededOnce: false,
        getSucceeded: false,
        getFailed: false
      }
    }

    // Format an item
    if (isObject(data)) {
      // Add single item specific properties
      this.$restinfront.isNew = options.isNew
      this.$restinfront.validator = this.constructor._buildValidator()
      this.$restinfront.saveProgressing = false
      this.$restinfront.saveSucceeded = false
      this.$restinfront.saveFailed = false

      // Build a raw item if it's a new instance
      if (
        this.$restinfront.isNew &&
        this.constructor.buildRawItemOnNew
      ) {
        data = this.constructor._buildRawItem(data)
      }

      // Format recursively existing fields only
      for (const fieldname in data) {
        const value = data[fieldname]
        // Try to format the value
        this[fieldname] = has(this.constructor.schema, fieldname)
          ? this.constructor.schema[fieldname].type.beforeBuild(value, options)
          : value
      }
    // Format a collection of items
    } else if (isArray(data)) {
      // Add collection of items specific properties
      this.$restinfront.count = 0

      Object.defineProperty(this.$restinfront, COLLECTION_SYMBOL, {
        value: true,
        writable: false,
        configurable: false,
        enumerable: false
      })

      // Add items to the list
      this._setCollection([])
      for (const item of data) {
        this.add(item, options)
      }

      // Update the count with the grand total
      // Note: must be after .add() processing
      if (has(options, 'count')) {
        this.$restinfront.count = options.count
      }
    }

    return this
  }

  /**
   * Getters
   */

  get isCollection () {
    return COLLECTION_SYMBOL in this.$restinfront
  }

  get isNew () {
    return this.$restinfront.isNew
  }

  get getProgressing () {
    return this.$restinfront.fetch.getProgressing
  }

  get getSucceededOnce () {
    return this.$restinfront.fetch.getSucceededOnce
  }

  get getSucceeded () {
    return this.$restinfront.fetch.getSucceeded
  }

  get getFailed () {
    return this.$restinfront.fetch.getFailed
  }

  get saveProgressing () {
    return this.$restinfront.fetch.saveProgressing
  }

  get saveSucceeded () {
    return this.$restinfront.fetch.saveSucceeded
  }

  get saveFailed () {
    return this.$restinfront.fetch.saveFailed
  }

  /**
   * Convert instance to JSON string
   */
  toJSON (options = {}) {
    return JSON.stringify(this.beforeSave(options))
  }

  /**
   * Clone an instance
   */
  clone () {
    return new this.constructor(JSON.parse(this.toJSON()))
  }

  /*****************************************************************
  * Collection methods
  *****************************************************************/

  /**
   * Define the callback for custom collection methods
   */
  static _getCollectionCallback (ref) {
    return isFunction(ref)
      ? ref
      : isString(ref)
        ? (item) => item[this.primaryKeyFieldname] === ref
        : (item) => item[this.primaryKeyFieldname] === ref[this.primaryKeyFieldname]
  }

  /**
   * Get the list of items
   */
  items () {
    this._allowCollection()
    return this[this.constructor.collectionKey]
  }

  /**
   * Proxy for native length
   */
  get length () {
    return this.items().length
  }

  /**
   * Check if there are items in the collection
   */
  get isEmpty () {
    return this.length === 0
  }

  /**
   * The collection can be extended with more items
   */
  get hasMore () {
    return this.length < this.$restinfront.count
  }

  /**
   * Return the last item of the collection
   */
  get last () {
    return this.items()[this.length - 1]
  }

  /**
   * Check if an item is the last of the list
   * @param {Object} ref - item (with the primary key) to check existence
   */
  isLast (ref) {
    return this.last[this.constructor.primaryKeyFieldname] === ref[this.constructor.primaryKeyFieldname]
  }

  /**
   * Proxy for native entries
   */
  entries () {
    return this.items().entries()
  }

  /**
   * Proxy for native forEach
   */
  forEach (callback) {
    this.items().forEach(callback)
  }

  /**
   * Proxy for native sort
   */
  sort (callback) {
    return [...this.items()].sort(callback)
  }

  /**
   * Proxy for native some
   */
  some (callback) {
    return this.items().some(callback)
  }

  /**
   * Proxy for native every
   */
  every (callback) {
    return this.items().every(callback)
  }

  /**
   * Proxy for native filter
   */
  filter (callback) {
    return this.items().filter(callback)
  }

  /**
   * Proxy for native map
   */
  map (callback) {
    return this.items().map(callback)
  }

  /**
   * Proxy for native reduce
   */
  reduce (callback, initialValue) {
    return this.items().reduce(callback, initialValue)
  }

  /**
   * Remove all items from the collection
   */
  clear () {
    this.items().splice(0, this.length)
  }

  /**
   * Proxy for native find
   * enhancement: find by primaryKey, find by item
   */
  find (ref) {
    return this.items().find(this.constructor._getCollectionCallback(ref)) || null
  }

  /**
   * Check if an item exists in the collection
   * enhancement: find by primaryKey, find by item
   */
  exists (ref) {
    return this.items().some(this.constructor._getCollectionCallback(ref))
  }

  /**
   * Remove the item from the collection based on its primary key
   * enhancement: find by primaryKey, find by item
   */
  remove (ref) {
    const indexToRemove = this.items().findIndex(this.constructor._getCollectionCallback(ref))

    if (indexToRemove === -1) {
      return null
    }

    this.$restinfront.count = this.$restinfront.count - 1

    return this.items().splice(indexToRemove, 1)
  }

  /**
   * Add a new item to the collection
   * @param {Object} options - optional definition of the item to add
   */
  add (item = {}, options = {}) {
    const instance = item instanceof this.constructor
      ? item
      : new this.constructor(item, options)

    this.items().push(instance)

    this.$restinfront.count = this.$restinfront.count + 1

    return instance
  }

  /**
   * Remove or add the item from the collection based on its primary key
   * @param {Object} item - item (with the primary key) to add or remove
   */
  toggle (item, callback = null) {
    const ref = callback || item

    if (this.exists(ref)) {
      return this.remove(ref)
    } else {
      return this.add(item)
    }
  }

  /*****************************************************************
  * Validation
  *****************************************************************/

  /**
   * Valid a list of fields
   * @param {array} fieldlist list of fieldname
   * @return {object} errors
   */
  _getValidationErrors (fieldlist) {
    if (!isArray(fieldlist)) {
      throw new Error(`[Restinfront][Validation] .valid() params must be an array`)
    }

    let errors = null

    const mergeErrors = (fieldname, error) => {
      if (error) {
        if (!errors) {
          errors = {}
        }
        errors[fieldname] = error
      }
    }

    // Check user defined validation
    for (const fielditem of fieldlist) {
      // Validation for direct fields
      if (isString(fielditem)) {
        const fieldname = fielditem

        if (has(this, fieldname)) {
          this.$restinfront.validator[fieldname].checked = true

          if (this.$restinfront.validator[fieldname].isValid(this[fieldname], this) === false) {
            mergeErrors(fieldname, {
              value: this[fieldname],
              error: 'NOT_VALID'
            })
          }
        } else {
          mergeErrors(fieldname, {
            error: 'NOT_FOUND'
          })
        }
      // Recursive validation for associations
      } else if (isArray(fielditem)) {
        const fieldname = fielditem[0]
        const fieldlist = fielditem[1]

        if (has(this, fieldname)) {
          this.$restinfront.validator[fieldname].checked = true
          mergeErrors(fieldname, this._getValidationErrors([fieldname]))

          if (fieldlist) {
            switch (this.constructor.schema[fieldname].type.association) {
              case 'BelongsTo':
              case 'HasOne':
                if (this[fieldname] !== null) {
                  mergeErrors(fieldname, this[fieldname]._getValidationErrors(fieldlist))
                }
                break
              case 'HasMany':
                // Check if each item of the collection is valid
                this[fieldname].forEach(item => {
                  mergeErrors(fieldname, item._getValidationErrors(fieldlist))
                })
                break
            }
          }
        } else {
          mergeErrors(fieldname, {
            error: 'NOT_FOUND'
          })
        }
      } else {
        throw new Error('[Restinfront][Validation] Syntax error')
      }
    }

    return errors
  }

  /**
   * Valid a list of fields
   * @param {array} fieldlist list of fieldname
   * @return {boolean} result of fields validation
   */
  valid (fieldlist) {
    // Reset save states
    this.$restinfront.fetch.saveProgressing = false
    this.$restinfront.fetch.saveFailed = false
    this.$restinfront.fetch.saveSucceeded = false
    // Proceed to deep validation
    const errors = this._getValidationErrors(fieldlist)
    const isValid = errors === null

    if (!isValid) {
      this.constructor.onValidationError(errors)
    }

    return isValid
  }

  /**
   * Check validation status of a validated field
   * @param {string} fieldname
   */
  error (fieldname) {
    return (
      this.$restinfront.validator[fieldname].checked &&
      !this.$restinfront.validator[fieldname].isValid(this[fieldname], this)
    )
  }

  /*****************************************************************
  * HTTP
  *****************************************************************/

  static _hasMatchedCollectionPattern (serverData) {
    return (
      has(serverData, this.collectionCountKey) &&
      has(serverData, this.collectionDataKey)
    )
  }

  static _buildRequestUrl ({ pathname, searchParams }) {
    let requestUrl = joinPaths(this.baseUrl, this.endpoint, pathname)

    if (searchParams) {
      requestUrl += `?${
        Object.entries(searchParams)
          .filter(([key, value]) => value !== undefined)
          .map(([key, value]) => {
            if (isDate(value)) {
              value = value.toISOString()
            }
            return `${key}=${encodeURIComponent(value)}`
          })
          .join('&')
      }`
    }

    return requestUrl
  }

  static async _buildRequestInit (data, options = {}) {
    const requestInit = {
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    }

    // Set Authorization header for private api
    if (this.authentication) {
      const token = await this.authentication()

      if (!token) {
        throw new Error(`[Restinfront][${this.name}][Fetch] Impossible to retrieve the auth token`)
      }

      requestInit.headers['Authorization'] = `Bearer ${token}`
    }

    if (['POST', 'PUT', 'PATCH'].includes(requestInit.method)) {
      // Extract validated data only
      requestInit.body = data.toJSON({ removeInvalid: true })
    }

    return requestInit
  }

  /**
   * Proceed to the HTTP request
   */
  async fetch (options) {
    if (!this.constructor.endpoint) {
      throw new Error(`[Restinfront][Fetch] \`endpoint\` is required to perform a request`)
    }

    // Save fetch details
    this.$restinfront.fetch.options = options

    // Set states to inprogress
    if (options.method === 'GET') {
      this.$restinfront.fetch.getProgressing = true
      this.$restinfront.fetch.getFailed = false
      this.$restinfront.fetch.getSucceeded = false
    } else {
      this.$restinfront.fetch.saveProgressing = true
      this.$restinfront.fetch.saveFailed = false
      this.$restinfront.fetch.saveSucceeded = false
    }

    // Allow fetch request to be aborted
    const abortController = new AbortController()
    const requestUrl = this.constructor._buildRequestUrl(options)
    const requestInit = await this.constructor._buildRequestInit(this, { method: options.method, signal: abortController.signal })
    // Prepare fetch request
    const fetchRequest = new Request(requestUrl, requestInit)
    let fetchResponse

    this.$restinfront.fetch.request = fetchRequest

    try {
      const abortTimeout = setTimeout(() => {
        abortController.abort()
      }, 20000)

      // Proceed to api call
      // https://developer.mozilla.org/fr/docs/Web/API/Fetch_API
      fetchResponse = await fetch(fetchRequest)

      clearTimeout(abortTimeout)

      this.$restinfront.fetch.response = fetchResponse

      // Server side errors raise an exception
      if (!fetchResponse.ok) {
        throw new Error()
      }
    } catch (err) {
      this.constructor.onFetchError(fetchResponse)

      // Set states to failure
      if (options.method === 'GET') {
        this.$restinfront.fetch.getProgressing = false
        this.$restinfront.fetch.getFailed = true
      } else {
        this.$restinfront.saveProgressing = false
        this.$restinfront.saveFailed = true
      }

      return Promise.resolve(this)
    }

    // Get data from server response
    const serverData = await fetchResponse.json()

    let data = serverData
    const dataOptions = {
      isNew: false
    }

    if (this.constructor._hasMatchedCollectionPattern(serverData)) {
      data = serverData[this.constructor.collectionDataKey]
      dataOptions.count = serverData[this.constructor.collectionCountKey]
    }

    const formattedData = new this.constructor(data, dataOptions)
    this._mutateData(formattedData)

    // Set states to success
    if (options.method === 'GET') {
      this.$restinfront.fetch.getProgressing = false
      this.$restinfront.fetch.getSucceeded = true
      this.$restinfront.fetch.getSucceededOnce = true
    } else {
      this.$restinfront.fetch.saveProgressing = false
      this.$restinfront.fetch.saveSucceeded = true
    }

    return Promise.resolve(this)
  }

  /**
   * Retrieve a single item or a collection
   */
  get (pathname = '', searchParams = {}) {
    if (this.isCollection) {
      // Pathname is optional for collection
      // If pathname is an object, it's more likely searchParams
      if (isObject(pathname)) {
        searchParams = pathname
        pathname = ''
      }

      // Params
      if (!searchParams.limit) {
        searchParams.limit = 20
      }
      if (!searchParams.offset) {
        searchParams.offset = 0
      }

      return this.fetch({
        method: 'GET',
        pathname: pathname,
        searchParams: searchParams,
        extend: false
      })
    } else {
      if (!pathname) {
        throw new Error(`[Restinfront][Fetch] pathname is required in .get() method`)
      }

      return this.fetch({
        method: 'GET',
        pathname: pathname
      })
    }
  }

  /**
   * Extend a collection with more items
   */
  async getMore () {
    this._allowCollection()

    this.$restinfront.fetch.options.searchParams.offset += this.$restinfront.fetch.options.searchParams.limit

    return this.fetch({
      method: 'GET',
      pathname: this.$restinfront.fetch.options.pathname,
      searchParams: this.$restinfront.fetch.options.searchParams,
      extend: true
    })
  }

  /**
   * Create a new item
   */
  post (pathname = '') {
    this._allowSingleItem()

    return this.fetch({
      method: 'POST',
      pathname: pathname
    })
  }

  /**
   * Update an item
   */
  put (pathname = '') {
    this._allowSingleItem()

    return this.fetch({
      method: 'PUT',
      pathname: joinPaths(this[this.constructor.primaryKeyFieldname], pathname)
    })
  }

  /**
   * Partial update of an item
   */
  patch (pathname = '') {
    this._allowSingleItem()

    return this.fetch({
      method: 'PATCH',
      pathname: joinPaths(this[this.constructor.primaryKeyFieldname], pathname)
    })
  }

  /**
   * Create or update the item depends of if it comes from db or not
   */
  save (pathname = '') {
    this._allowSingleItem()

    return this.$restinfront.isNew
      ? this.post(pathname)
      : this.put(pathname)
  }
}


export default Model
