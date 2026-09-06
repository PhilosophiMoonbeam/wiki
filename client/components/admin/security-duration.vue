<template>
  <div class="security-duration">
    <v-text-field
      :model-value="modelValue / unit"
      :label="label"
      type="number"
      min="0"
      step="any"
      variant="outlined"
      :disabled="disabled"
      :hint="hint"
      persistent-hint
      @update:model-value="update"
    /><v-select
      v-model="unit"
      :items="units"
      :label="label + ' unit'"
      variant="outlined"
      :disabled="disabled"
    />
  </div>
</template>
<script lang="ts">
export default {
  props: {
    modelValue: { type: Number, required: true },
    label: { type: String, required: true },
    hint: String,
    disabled: Boolean
  },
  emits: ['update:modelValue'],
  data() {
    return {
      unit: 1,
      units: [
        { title: 'Seconds', value: 1 },
        { title: 'Minutes', value: 60 },
        { title: 'Hours', value: 3600 },
        { title: 'Days', value: 86400 }
      ]
    }
  },
  created() {
    this.unit =
      [86400, 3600, 60].find(
        (unit) => this.modelValue > 0 && this.modelValue % unit === 0
      ) ?? 1
  },
  methods: {
    update(value: string) {
      if (!this.disabled)
        this.$emit('update:modelValue', Number(value) * this.unit)
    }
  }
}
</script>
