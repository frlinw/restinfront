import has from './utils/has.js'
import isBoolean from './utils/isBoolean.js'
import isArray from './utils/isArray.js'
import isObject from './utils/isObject.js'
import isDate from './utils/isDate.js'
import isNumber from './utils/isNumber.js'
import isInteger from './utils/isInteger.js'
import isString from './utils/isString.js'
import isUrl from './utils/isUrl.js'
import isEmail from './utils/isEmail.js'
import isFile from './utils/isFile.js'
import isIp from './utils/isIp.js'
import isEmptyObject from './utils/isEmptyObject.js'
import prependZero from './utils/prependZero.js'
import parseDate from './utils/parseDate.js'


export default {
  //
  // String
  //
  STRING: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  UUID: {
    defaultValue: () => crypto.randomUUID(),
    isBlank: (value) => value === '',
    isValid: (value) => isString(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  EMAIL: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isEmail(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  PHONE: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value),
    beforeSave: (value) => {
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
    },
    beforeBuild: (value) => value
  },
  URL: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isUrl(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  FILE: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isFile(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  IP: {
    defaultValue: () => '',
    isBlank: (value) => value === '',
    isValid: (value) => isString(value) && isIp(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  //
  // Boolean
  //
  BOOLEAN: {
    defaultValue: () => null,
    isBlank: (value) => value === null,
    isValid: (value) => isBoolean(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  //
  // Number
  //
  INTEGER: {
    defaultValue: () => null,
    isBlank: (value) => value === null,
    isValid: (value) => isInteger(value) && value >= 0,
    beforeSave: (value) => value,
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
    isBlank: (value) => value === null,
    isValid: (value) => isNumber(value) && value >= 0,
    beforeSave: (value) => value,
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
    isBlank: (value) => value === null,
    isValid: (value) => isDate(value),
    beforeSave: (value) => {
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
    isBlank: (value) => value === null,
    isValid: (value) => isDate(value),
    beforeSave: (value) => {
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
    isBlank: (value) => isEmptyObject(value),
    isValid: (value) => isObject(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  ADDRESS: {
    defaultValue: () => ({
      number: '',
      route: '',
      postcode: '',
      city: '',
      latitude: '',
      longitude: ''
    }),
    isBlank: (value) => isEmptyObject(value) || value.route === '' || value.postcode === '' || value.city === '',
    isValid: (value) => isObject(value) && has(value, 'number') && has(value, 'route') && has(value, 'postcode') && has(value, 'city'),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  //
  // Array
  //
  ARRAY: {
    defaultValue: () => ([]),
    isBlank: (value) => value.length === 0,
    isValid: (value) => isArray(value),
    beforeSave: (value) => value,
    beforeBuild: (value) => value
  },
  //
  // Associations
  //
  HASMANY: (Model) => ({
    defaultValue: () => ([]),
    isBlank: (value) => value.isEmpty,
    isValid: (value) => value instanceof Model && value.isCollection && isArray(value.items()),
    beforeSave: (value, options) => {
      if (value instanceof Model) {
        return value.beforeSave(options)
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
    isBlank: (value) => value === null,
    isValid: (value) => value instanceof Model && has(value, Model.primaryKeyFieldname),
    beforeSave: (value, options) => {
      if (value instanceof Model) {
        return value.beforeSave(options)
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
    isBlank: (value) => value === null,
    isValid: (value) => value instanceof Model && has(value, Model.primaryKeyFieldname),
    beforeSave: (value, options) => {
      if (value instanceof Model) {
        return value.beforeSave(options)
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
