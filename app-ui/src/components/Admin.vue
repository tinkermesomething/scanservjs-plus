<template>
  <v-container>
    <h2 class="mb-4">{{ $t('admin.title') }}</h2>

    <v-table>
      <thead>
        <tr>
          <th>{{ $t('admin.name') }}</th>
          <th>{{ $t('admin.email') }}</th>
          <th>{{ $t('admin.output-directory') }}</th>
          <th>{{ $t('admin.last-login') }}</th>
          <th>{{ $t('admin.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="users.length === 0">
          <td colspan="5" class="text-center py-4">{{ $t('admin.no-users') }}</td>
        </tr>
        <tr v-for="user in users" :key="user.id">
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
          <td>{{ dirName(user.outputDirectory) }}</td>
          <td>{{ formatDate(user.lastLogin) }}</td>
          <td>
            <v-btn size="small" @click="startEdit(user)">{{ $t('admin.edit') }}</v-btn>
            <v-btn size="small" color="error" class="ml-2" @click="removeUser(user)">{{ $t('admin.remove') }}</v-btn>
          </td>
        </tr>
      </tbody>
    </v-table>

    <v-dialog v-model="editDialog" max-width="480">
      <v-card v-if="editTarget">
        <v-card-title>{{ editTarget.name }}</v-card-title>
        <v-card-subtitle>{{ editTarget.email }}</v-card-subtitle>
        <v-card-text>
          <v-select
            v-model="editDirectory"
            :items="directoryItems"
            item-title="name"
            item-value="path"
            :label="$t('admin.output-directory')"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="editDialog = false">{{ $t('admin.cancel') }}</v-btn>
          <v-btn color="primary" @click="saveEdit">{{ $t('admin.save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
import Common from '../classes/common';
import auth from '../classes/auth';

export default {
  name: 'Admin',

  emits: ['notify'],

  data() {
    return {
      users: [],
      directories: [],
      editDialog: false,
      editTarget: null,
      editDirectory: null,
    };
  },

  computed: {
    directoryItems() {
      return [
        { name: this.$t('admin.none-ephemeral'), path: null },
        ...this.directories,
      ];
    },
  },

  async created() {
    if (!auth.user?.isAdmin) {
      this.$router.replace('/scan');
      return;
    }
    await this.loadData();
  },

  methods: {
    async loadData() {
      [this.users, this.directories] = await Promise.all([
        Common.fetch('/api/v1/admin/users'),
        Common.fetch('/api/v1/admin/directories'),
      ]);
    },

    dirName(dirPath) {
      if (!dirPath) return this.$t('admin.none-ephemeral');
      const match = this.directories.find(d => d.path === dirPath);
      return match ? match.name : dirPath;
    },

    formatDate(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString();
    },

    startEdit(user) {
      this.editTarget = user;
      this.editDirectory = user.outputDirectory || null;
      this.editDialog = true;
    },

    async saveEdit() {
      try {
        await Common.fetch(`/api/v1/admin/users/${encodeURIComponent(this.editTarget.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outputDirectory: this.editDirectory }),
        });
        this.editDialog = false;
        await this.loadData();
      } catch (e) {
        this.$emit('notify', { type: 'e', message: e });
      }
    },

    async removeUser(user) {
      if (!confirm(this.$t('admin.confirm-remove'))) return;
      try {
        await Common.fetch(`/api/v1/admin/users/${encodeURIComponent(user.id)}`, {
          method: 'DELETE',
        });
        await this.loadData();
      } catch (e) {
        this.$emit('notify', { type: 'e', message: e });
      }
    },
  },
};
</script>
