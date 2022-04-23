import has from './utils/has.js'
import isFunction from './utils/isFunction.js'
import isArray from './utils/isArray.js'
import isObject from './utils/isObject.js'
import isString from './utils/isString.js'
import isDate from './utils/isDate.js'
import joinPaths from './utils/joinPaths.js'


const COLLECTION_SYMBOL = Symbol.for('collection')


class Model {
  /*****************************************************************
  * Fetch helpers
  *****************************************************************/

  static _buildRequestUrl ({ pathname, searchParams }) {
    let requestUrl = joinPaths(this.requestUrl, pathname)

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
    if (this.authRequired) {
      const token = await this.authToken()

      if (!token) {
        throw new Error(`[Modelize][Fetch] Impossible to get the auth token to access ${this.requestUrl}`)
      }

      requestInit.headers['Authorization'] = `Bearer ${token}`
    }

    if (['POST', 'PUT', 'PATCH'].includes(requestInit.method)) {
      // Extract validated data only
      requestInit.body = data.toJSON({ removeInvalid: true })
    }

    return requestInit
  }

  static _hasMatchedCollectionPattern (serverData) {
    return (
      has(serverData, this.collectionCountKey) &&
      has(serverData, this.collectionDataKey)
    )
  }

  /*****************************************************************
  * Format data before use in front
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

  /*****************************************************************
  * Static: Public API
  *****************************************************************/

  static config (options = {}) {
    if (!options.baseUrl) {
      throw new Error(`[Modelize][Config] \`baseUrl\` is required`)
    }
    if (options.authRequired && !options.authToken) {
      throw new Error(`[Modelize][Config] \`authToken\` is required if \`authRequired\` is enabled`)
    }

    this._configured = true
    this._collectionKey = 'collection'

    this.baseUrl = options.baseUrl
    this.endpoint = ''
    this.authRequired = options.authRequired || false
    this.authToken = options.authToken
    this.primaryKeyRequired = true
    this.buildRawItemOnNew = true
    this.collectionDataKey = options.collectionDataKey || 'rows'
    this.collectionCountKey = options.collectionCountKey || 'count'

    // Hooks
    this.onValidationError = isFunction(options.onValidationError)
      ? options.onValidationError
      : () => null

    this.onFetchError = isFunction(options.onFetchError)
      ? options.onFetchError
      : () => null
  }

  static init (schema, options = {}) {
    if (!this._configured) {
      throw new Error(`[Modelize][${this.name}] Model.config() must be called before ${this.name}.init()`)
    }
    if (options.authRequired && !options.authToken) {
      throw new Error(`[Modelize][${this.name}] \`authToken\` is required if \`authRequired\` is enabled`)
    }

    // Override global config
    if ('authRequired' in options) {
      this.authRequired = options.authRequired
    }
    if ('authToken' in options) {
      this.authToken = options.authToken
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
        throw new Error(`[Modelize][${this.name}] \`type\` is missing on field '${fieldname}'`)
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
      throw new Error(`[Modelize][${this.name}] \`primaryKey\` is missing`)
    }

    return this
  }

  /*****************************************************************
  * Instance: Private API
  *****************************************************************/

  /**
   * Throw an error if the instance is not a collection
   */
  _allowCollection () {
    if (!this.isCollection) {
      throw new Error('[Modelize] Cannot use a collection method on a single item instance')
    }
  }

  /**
   * Throw an error if the instance is not a single item
   */
  _allowSingleItem () {
    if (this.isCollection) {
      throw new Error('[Modelize] Cannot use a single item method on a collection instance')
    }
  }

  /**
   * Set the list of items
   */
  _setCollection (newCollection) {
    this[this.constructor._collectionKey] = newCollection
  }

  /**
   * Update the current model instance with new data
   */
  _mutateData (newData) {
    if (newData.isCollection) {
      // Extend the list or just replace it
      if (this.$modelize.fetch?.options?.extend) {
        newData.forEach(newItem => this.add(newItem))
      } else {
        this._setCollection(newData.items())
      }

      this.$modelize.count = newData.$modelize.count
    } else {
      Object.keys(newData).forEach(key => {
        const value = newData[key]

        // Mutate only some keys
        if (key === '$modelize') {
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
  _beforeSave (options) {
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
    const removeInvalid = options && options.removeInvalid
    const newItem = {}

    for (const fieldname in this.$modelize.validator) {
      const validator = this.$modelize.validator[fieldname]
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
   * Define the callback for custom collection methods
   */
  _getCollectionCallback (ref) {
    return isFunction(ref)
      ? ref
      : isString(ref)
        ? (item) => item[this.constructor.primaryKeyFieldname] === ref
        : (item) => item[this.constructor.primaryKeyFieldname] === ref[this.constructor.primaryKeyFieldname]
  }

  /**
   * Valid a list of fields
   * @param {array} fieldlist list of fieldname
   * @return {object} errors
   */
  _getValidationErrors (fieldlist) {
    if (!isArray(fieldlist)) {
      throw new Error(`[Modelize][Validation] .valid() params must be an array`)
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
          this.$modelize.validator[fieldname].checked = true

          if (this.$modelize.validator[fieldname].isValid(this[fieldname], this) === false) {
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
          this.$modelize.validator[fieldname].checked = true
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
        throw new Error('[Modelize][Validation] Syntax error')
      }
    }

    return errors
  }

  /*****************************************************************
  * Instance: Public API
  *****************************************************************/

  constructor (data, options = {}) {
    options = {
      isNew: true,
      ...options
    }

    // Format an item
    if (isObject(data)) {
      // Add modelize specific infos
      this.$modelize = {
        isNew: options.isNew,
        validator: this.constructor._buildValidator(),
        states: {
          fetchInProgress: false,
          fetchSuccessOnce: false,
          fetchSuccess: false,
          fetchFailure: false,
          saveInProgress: false,
          saveSuccess: false,
          saveFailure: false
        }
      }

      // Build a raw item if it's a new instance
      if (
        this.$modelize.isNew &&
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
      // Add modelize specific infos
      this.$modelize = {
        count: 0,
        states: {
          fetchInProgress: false,
          fetchSuccessOnce: false,
          fetchSuccess: false,
          fetchFailure: false
        }
      }

      Object.defineProperty(this.$modelize, COLLECTION_SYMBOL, {
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
        this.$modelize.count = options.count
      }
    }

    return this
  }

  /**
   * Getters
   */

  get isCollection () {
    return COLLECTION_SYMBOL in this.$modelize
  }

  get isNew () {
    return this.$modelize.isNew
  }

  get fetchInProgress () {
    return this.$modelize.states.fetchInProgress
  }

  get fetchSuccessOnce () {
    return this.$modelize.states.fetchSuccessOnce
  }

  get fetchSuccess () {
    return this.$modelize.states.fetchSuccess
  }

  get fetchFailure () {
    return this.$modelize.states.fetchFailure
  }

  get saveInProgress () {
    return this.$modelize.states.saveInProgress
  }

  get saveSuccess () {
    return this.$modelize.states.saveSuccess
  }

  get saveFailure () {
    return this.$modelize.states.saveFailure
  }

  /**
   * Convert instance to JSON string
   */
  toJSON (options = {}) {
    return JSON.stringify(this._beforeSave(options))
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
   * Get the list of items
   */
  items () {
    this._allowCollection()
    return this[this.constructor._collectionKey]
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
    return this.length < this.$modelize.count
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
    return this.items().find(this._getCollectionCallback(ref)) || null
  }

  /**
   * Check if an item exists in the collection
   * enhancement: find by primaryKey, find by item
   */
  exists (ref) {
    return this.items().some(this._getCollectionCallback(ref))
  }

  /**
   * Remove the item from the collection based on its primary key
   * enhancement: find by primaryKey, find by item
   */
  remove (ref) {
    const indexToRemove = this.items().findIndex(this._getCollectionCallback(ref))

    if (indexToRemove === -1) {
      return null
    }

    this.$modelize.count = this.$modelize.count - 1

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

    this.$modelize.count = this.$modelize.count + 1

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

  /**
   * Valid a list of fields
   * @param {array} fieldlist list of fieldname
   * @return {boolean} result of fields validation
   */
  valid (fieldlist) {
    // Reset save states
    this.$modelize.states.saveInProgress = false
    this.$modelize.states.saveFailure = false
    this.$modelize.states.saveSuccess = false
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
      this.$modelize.validator[fieldname].checked &&
      !this.$modelize.validator[fieldname].isValid(this[fieldname], this)
    )
  }

  /*****************************************************************
  * HTTP
  *****************************************************************/

  /**
   * Proceed to the HTTP request
   */
  async fetch (options) {
    if (!this.constructor.endpoint) {
      throw new Error(`[Modelize][Fetch] \`endpoint\` is required to perform a request`)
    }

    // Save fetch details
    this.$modelize.fetch = {
      options: options,
      request: null,
      response: null
    }

    // Set states to inprogress
    if (options.method === 'GET') {
      this.$modelize.states.fetchInProgress = true
      this.$modelize.states.fetchFailure = false
      this.$modelize.states.fetchSuccess = false
    } else {
      this.$modelize.states.saveInProgress = true
      this.$modelize.states.saveFailure = false
      this.$modelize.states.saveSuccess = false
    }

    // Allow fetch request to be aborted
    const abortController = new AbortController()
    const requestUrl = this.constructor._buildRequestUrl(options)
    const requestInit = await this.constructor._buildRequestInit(this, { method: options.method, signal: abortController.signal })
    // Prepare fetch request
    const fetchRequest = new Request(requestUrl, requestInit)
    let fetchResponse

    this.$modelize.fetch.request = fetchRequest

    try {
      const abortTimeout = setTimeout(() => {
        abortController.abort()
      }, 20000)

      // Proceed to api call
      // https://developer.mozilla.org/fr/docs/Web/API/Fetch_API
      fetchResponse = await fetch(fetchRequest)

      clearTimeout(abortTimeout)

      this.$modelize.fetch.response = fetchResponse

      // Server side errors raise an exception
      if (!fetchResponse.ok) {
        throw new Error()
      }
    } catch (err) {
      this.constructor.onFetchError(fetchResponse)

      // Set states to failure
      if (options.method === 'GET') {
        this.$modelize.states.fetchInProgress = false
        this.$modelize.states.fetchFailure = true
      } else {
        this.$modelize.states.saveInProgress = false
        this.$modelize.states.saveFailure = true
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
      this.$modelize.states.fetchInProgress = false
      this.$modelize.states.fetchSuccess = true
      this.$modelize.states.fetchSuccessOnce = true
    } else {
      this.$modelize.states.saveInProgress = false
      this.$modelize.states.saveSuccess = true
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
        throw new Error(`[Modelize][Fetch] pathname is required in .get() method`)
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

    this.$modelize.fetch.options.searchParams.offset += this.$modelize.fetch.options.searchParams.limit

    return this.fetch({
      method: 'GET',
      pathname: this.$modelize.fetch.options.pathname,
      searchParams: this.$modelize.fetch.options.searchParams,
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

    return this.$modelize.isNew
      ? this.post(pathname)
      : this.put(pathname)
  }
}


export default Model
