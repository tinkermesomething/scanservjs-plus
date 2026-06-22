<template>
  <div>
    <v-app-bar class="elevation-0" :color="appColor" app>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <v-toolbar-title class="unselectable">{{ $t('global.application-name') }}</v-toolbar-title>
      <v-spacer />
      <v-toolbar-items class="d-none d-md-block">
        <v-btn class="transparent" elevation="0" @click="go('/scan')"><v-icon class="mr-2" :icon="mdiCamera" />{{ $t('navigation.scan') }}</v-btn>
        <v-btn class="transparent" elevation="0" @click="go('/files')"><v-icon class="mr-2" :icon="mdiFileDocumentMultiple" />{{ $t('navigation.files') }}</v-btn>
        <v-btn class="transparent" elevation="0" @click="go('/settings')"><v-icon class="mr-2" :icon="mdiCog" />{{ $t('navigation.settings') }}</v-btn>
        <v-btn class="transparent" elevation="0" @click="go('/about')"><v-icon class="mr-2" :icon="mdiInformation" />{{ $t('navigation.about') }}</v-btn>
        <v-btn v-if="auth.user && auth.user.isAdmin" class="transparent" elevation="0" @click="go('/admin')"><v-icon class="mr-2" :icon="mdiShieldAccount" />{{ $t('navigation.admin') }}</v-btn>
      </v-toolbar-items>
    </v-app-bar>

    <v-navigation-drawer v-model="drawer" class="elevation-0" app temporary>
      <v-list nav>
        <v-list-item :title="$t('navigation.scan')" @click="go('/scan')">
          <template #prepend>
            <v-icon :icon="mdiCamera" />
          </template>
        </v-list-item>

        <v-list-item :title="$t('navigation.files')" @click="go('/files')">
          <template #prepend>
            <v-icon :icon="mdiFileDocumentMultiple" />
          </template>
        </v-list-item>

        <v-list-item :title="$t('navigation.settings')" @click="go('/settings')">
          <template #prepend>
            <v-icon :icon="mdiCog" />
          </template>
        </v-list-item>

        <v-list-item :title="$t('navigation.about')" @click="go('/about')">
          <template #prepend>
            <v-icon :icon="mdiInformation" />
          </template>
        </v-list-item>

        <v-list-item v-if="auth.user && auth.user.isAdmin" :title="$t('navigation.admin')" @click="go('/admin')">
          <template #prepend>
            <v-icon :icon="mdiShieldAccount" />
          </template>
        </v-list-item>

        <v-divider />

        <v-list-item>
          <v-list-item-title class="unselectable">{{ $t('navigation.version') }} {{ version }}</v-list-item-title>
          <template #prepend>
            <v-icon :icon="mdiTools" />
          </template>
        </v-list-item>
      </v-list>

      <template #append>
        <div class="d-flex flex-row pa-4 text-caption">
          <div class="ml-auto">
            &copy; 2016 - {{ new Date().getFullYear() }} Sam Strachan
          </div>
        </div>
      </template>
    </v-navigation-drawer>
  </div>
</template>

<script>
import Constants from '../classes/constants';
import auth from '../classes/auth';
import { mdiCamera, mdiCog, mdiFileDocumentMultiple, mdiInformation, mdiShieldAccount, mdiTools } from '@mdi/js';
export default {
  name: 'Navigation',

  props: {
    appColor: {
      type: String,
      default: 'accent-4'
    }
  },

  setup() {
    return {
      auth,
      mdiCamera,
      mdiCog,
      mdiFileDocumentMultiple,
      mdiInformation,
      mdiShieldAccount,
      mdiTools
    };
  },

  data() {
    return {
      drawer: false,
      version: Constants.Version
    };
  },

  methods: {
    go(location) {
      if (this.$route.path !== location) {
        this.$router.push(location);
      }
    }
  }
};
</script>

<style>
.unselectable {
  -moz-user-select: none;
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
</style>
