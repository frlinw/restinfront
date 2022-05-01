# Restinfront

Model based Rest API manager.

Retrieve, parse, valid, transform and save data.

## Installation

```sh
npm install restinfront
```

## Usage

### Create a configuration file

config.js

```javascript
import Restinfront from 'restinfront'


// Main config
const Model = Restinfront.Model
const DataTypes = Restinfront.DataTypes

Model.config({
  // Base URL for API call
  baseUrl: 'https://api.example.com',
  // Active authorization header for every API call
  authentication: () => localStorage.get('jwt'),
  onFetchError: (response) => {
    console.warn('[Restinfront][Fetch]', error)
  },
  onValidationError: (error) => {
    console.warn('[Restinfront][Validation]', error)
  }
})


export {
  Model,
  DataTypes
}
```

### Define your models

User.js

```javascript
import { Model, DataTypes } from './config.js'

import Sponsor from './Sponsor.js'
import Profile from './Profile.js'
import Plan from './Plan.js'


class User extends Model {
  static init () {
    return super.init({
      id: {
        type: DataTypes.UUID, // required
        primaryKey: true, // only once per model
        // defaultValue: // optional | defaultValue from `type` option
        // allowBlank: // optional | false
        // isValid: // optional | (value, data) => true
      },
      createdAt: {
        type: DataTypes.DATETIME
      },
      firstName: {
        type: DataTypes.STRING
      },
      lastName: {
        type: DataTypes.STRING
      },
      email: {
        type: DataTypes.EMAIL
      },
      password: {
        type: DataTypes.STRING
      },
      phone: {
        type: DataTypes.PHONE,
        allowBlank: true
      },
      address: {
        type: DataTypes.ADDRESS,
        allowBlank: true
      },
      role: {
        type: DataTypes.STRING
      },
      isActive: {
        type: DataTypes.BOOLEAN
      },
      // One-to-One relation
      profile: {
        type: DataTypes.HASONE(Profile)
      },
      // One-to-Many relation
      plans: {
        type: DataTypes.HASMANY(Plan)
      },
      // Many-to-One relation
      sponsor: {
        type: DataTypes.BELONGSTO(Sponsor)
      },
      // Virtual fields
      newEmail: {
        type: DataTypes.EMAIL
      },
      newPassword: {
        type: DataTypes.STRING
      }
    }, {
      endpoint: 'private/users'
      // authentication can be disabled per model
      // authentication: false
    })
  }
}


export default User.init()
```

### Manage your data

UserEdit.vue

```javascript
<script>

import User from './User.js'
import Plan from './Plan.js'


export default {
  props: {
    id: {
      type: String
    }
  },

  data () {
    return {
      // Create a new user with default values
      user: new User({}),
      // Create an empty collection of your app plans
      plans: new Plan([])
    }
  },

  async created () {
    // Note: Data will be reactives
    // Result fetched from api will mutate data

    // Get all plans of your app
    // .get(url: string)
    await this.plans.get()
    // Some flags are mutated during the fetch operation:
    // this.plans.getProgressing
    // this.plans.getSucceeded
    // this.plans.getSucceededOnce
    // this.plans.getFailed

    if (this.id) {
      // Get the existing user if there is an id in the URL
      // .get(url: string)
      await this.user.get(this.id)
      // Some flags are mutated during the fetch operation:
      // this.user.getProgressing
      // this.user.getSucceeded
      // this.user.getSucceededOnce
      // this.user.getFailed
      // this.user.saveProgressing
      // this.user.saveSucceeded
      // this.user.saveFailed
    }
  },

  methods: {
    async saveUser () {
      if (
        // Data validation is required before .put() & .post()
        this.user.valid([
          // Validation of direct field
          'firstName',
          // Nested validation of BELONGSTO
          ['sponsor', [
              'code'
          ]],
          // Nested validation of HASONE
          ['profile', [
            'picture'
          ]],
          // Nested validation of HASMANY
          ['plans', [
            'name',
            'price'
          ]]
        ])
      ) {
        // .save() is a syntax sugar for .put() or .post()
        await this.user.save()

        if (this.user.saveSucceeded) {
          if (this.id) {
            console.log('Yeah! user updated !')
          } else {
            console.log('Yeah! user created !')
          }
        }
      }
    }
  }
}

</script>
```
```html
<template>

  <div>
    <h1>User example</h1>

    <form
      id="UserEdit"
      @submit.prevent="saveUser()"
    >
      <div :class="{ 'form-error': user.error('firstName') }">
        <input
          v-model="user.firstName"
          type="text"
          placeholder="Firstname"
        >
      </div>

      <div :class="{ 'form-error': user.profile.error('picture') }">
        <input
          v-model="user.profile.picture"
          type="file"
          placeholder="Avatar"
        >
      </div>

      <div :class="{ 'form-error': user.sponsor.error('code') }">
        <input
          v-model="user.sponsor.code"
          type="text"
          placeholder="Sponsor code"
        >
      </div>

      <div :class="{ 'form-error': user.error('plans') }">
        <div
          v-for="plan of plans.items()"
          :key="plan.id"
        >
          <label>
            <input
              type="checkbox"
              :value="user.plans.exists(plan)"
              @change="user.plans.toggle(plan)"
            >
            {{plan.name}} - {{plan.price}}
          </label>
        </div>
      </div>

      <button type="submit">
        <span v-if="user.saveProgressing">Save in progress</span>
        <span v-else>Save</span>
      </button>
    </form>
  </div>

</template>
```

## TODO
- Build & release workflow
- Tests
- Improved documentation
