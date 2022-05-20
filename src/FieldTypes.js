import RestinfrontError from './RestinfrontError.js'
import {
  has,
  isArray,
  isBoolean,
  isDate,
  isEmail,
  isFile,
  isInteger,
  isIp,
  isNull,
  isNumber,
  isObject,
  isObjectEmpty,
  isString,
  isUrl,
  parseDate,
  prependZero,
  typecheck
} from 'utilib'


const FIELDTYPES_PRESETS = {
  //
  // String
  //
  STRING: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value),
  },
  UUID: {
    defaultValue: () => crypto.randomUUID(),
    isBlank: (value) => value === '',
    isValid: (value) => isString(value)
  },
  EMAIL: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isEmail(value),
  },
  PHONE: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value),
    beforeSerialize: (value) => {
      let sanitizedPhone = ''

      for (const n of value) {
        if (
          (sanitizedPhone === '' && n === '+') ||
          isInteger(Number.parseInt(n))
        ) {
          sanitizedPhone += n
        }
      }

      return sanitizedPhone
    }
  },
  URL: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isUrl(value)
  },
  FILE: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isFile(value)
  },
  IP: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isIp(value)
  },
  //
  // Boolean
  //
  BOOLEAN: {
    defaultValue: () => null,
    isBlank: (value) => isNull(value),
    isValid: (value) => isBoolean(value)
  },
  //
  // Number
  //
  INTEGER: {
    defaultValue: () => null,
    isBlank: (value) => isNull(value),
    isValid: (value) => isInteger(value) && value >= 0,
    beforeBuild: (value) => {
      const parsedValue = Number.parseInt(value)

      if (isNumber(parsedValue)) {
        return parsedValue
      } else {
        return null
      }
    }
  },
  FLOAT: {
    defaultValue: () => null,
    isBlank: (value) => isNull(value),
    isValid: (value) => isNumber(value) && value >= 0,
    beforeBuild: (value) => {
      const parsedValue = Number.parseFloat(value)

      if (isNumber(parsedValue)) {
        return parsedValue
      } else {
        return null
      }
    }
  },
  //
  // Date
  //
  DATEONLY: {
    defaultValue: () => null,
    isBlank: (value) => isNull(value),
    isValid: (value) => isDate(value),
    beforeSerialize: (value) => {
      if (isDate(value)) {
        // Cannot use .toISOString because it convert date to UTC
        // DateOnly must be the day in the local time
        const year = value.getFullYear()
        const month = prependZero(value.getMonth() + 1) // require +1 because month start at 0
        const day = prependZero(value.getDate())

        return `${year}-${month}-${day}`
      } else {
        return null
      }
    },
    beforeBuild: (value) => {
      if (isString(value) && value !== '') {
        return parseDate(value)
      } else if (isDate(value)) {
        return value
      } else {
        return null
      }
    }
  },
  DATE: {
    defaultValue: () => null,
    isBlank: (value) => isNull(value),
    isValid: (value) => isDate(value),
    beforeSerialize: (value) => {
      if (isDate(value)) {
        return value.toISOString()
      } else {
        return null
      }
    },
    beforeBuild: (value) => {
      if (isString(value) && value !== '') {
        return parseDate(value)
      } else if (isDate(value)) {
        return value
      } else {
        return null
      }
    }
  },
  //
  // Object
  //
  OBJECT: {
    defaultValue: () => ({}),
    isBlank: (value) => isObjectEmpty(value),
    isValid: (value) => isObject(value),
  },
  //
  // Array
  //
  ARRAY: {
    defaultValue: () => ([]),
    isBlank: (value) => value.length === 0,
    isValid: (value) => isArray(value),
  },
  //
  // Associations
  //
  HASMANY: (Model) => ({
    defaultValue: () => ([]),
    isBlank: (value) => value.isEmpty,
    isValid: (value) => value instanceof Model && value.isCollection && isArray(value.items()),
    beforeSerialize: (value, options) => {
      if (value instanceof Model) {
        return value.beforeSerialize(options)
      } else {
        return null
      }
    },
    beforeBuild: (value, options) => {
      if (!value) {
        return null
      } else if (value instanceof Model) {
        return value
      } else {
        return new Model(value, options)
      }
    },
    // Association specific
    model: Model,
    association: 'HasMany'
  }),
  HASONE: (Model) => ({
    defaultValue: (primaryKey) => Model._buildRawItem({ primaryKey }),
    isBlank: (value) => isNull(value),
    isValid: (value) => value instanceof Model && has(value, Model.primaryKeyFieldname),
    beforeSerialize: (value, options) => {
      if (value instanceof Model) {
        return value.beforeSerialize(options)
      } else {
        return null
      }
    },
    beforeBuild: (value, options) => {
      if (!value) {
        return null
      } else if (value instanceof Model) {
        return value
      } else {
        return new Model(value, options)
      }
    },
    // Association specific
    model: Model,
    association: 'HasOne'
  }),
  BELONGSTO: (Model) => ({
    defaultValue: () => Model._buildRawItem(),
    isBlank: (value) => isNull(value),
    isValid: (value) => value instanceof Model && has(value, Model.primaryKeyFieldname),
    beforeSerialize: (value, options) => {
      if (value instanceof Model) {
        return value.beforeSerialize(options)
      } else {
        return null
      }
    },
    beforeBuild: (value, options) => {
      if (!value) {
        return null
      } else if (value instanceof Model) {
        return value
      } else {
        return new Model(value, options)
      }
    },
    // Association specific
    model: Model,
    association: 'BelongsTo'
  })
} 

export default class FieldTypes {
  static {
    for (const [name, options] of Object.entries(FIELDTYPES_PRESETS)) {
      this.add(name, options)
    }
  }

  /**
   * Add an new fieldtype
   * @param {string} name
   * @param {object} options
   * @param {function} options.defaultValue
   * @param {function} options.isBlank
   * @param {function} options.isValid
   * @param {function} [options.beforeSerialize]
   * @param {function} [options.beforeBuild]
   */
  static add (name, options) {
    typecheck({
      name: {
        type: 'string'
      },
      options: {
        type: ['function', 'object', {
          defaultValue: { type: 'function', required: true },
          isBlank: { type: 'function', required: true },
          isValid: { type: 'function', required: true },
          beforeSerialize: { type: 'function' },
          beforeBuild: { type: 'function' }
        }]
      }
    })

    this[name] = isFunction(options)
      ? options
      : { ...options }
    
    if (!has(options, 'beforeSerialize')) {
      this[name].beforeSerialize = (value) => value
    }
    if (!has(options, 'beforeBuild')) {
      this[name].beforeBuild = (value) => value
    }
  }

  /**
   * Override an existing fieldtype
   * @param {string} name
   * @param {object} options
   * @param {function} [options.defaultValue]
   * @param {function} [options.isBlank]
   * @param {function} [options.isValid]
   * @param {function} [options.beforeSerialize]
   * @param {function} [options.beforeBuild]
   */
  static override (name, options) {
    if (!has(this, name)) {
      throw new RestinfrontError('override: the fieldtype you are trying to override does not exist')
    }

    typecheck({
      name: {
        type: 'string'
      },
      options: {
        type: ['object', {
          defaultValue: { type: 'function' },
          isBlank: { type: 'function' },
          isValid: { type: 'function' },
          beforeSerialize: { type: 'function' },
          beforeBuild: { type: 'function' }
        }]
      }
    })

    this[name] = {
      ...this[name],
      ...options
    }
  }
}
