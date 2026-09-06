<template lang='pug'>
.general-logo-workflow
  p.general-logo-note Uploads publish independently of the settings draft. Review your image before starting; processing continues after you leave this page.
  .logo-manager
    .logo-preview-grid
      .logo-preview-card
        .logo-preview-heading {{ $t('admin:general.logoActive') }}
        .logo-preview-frame
          v-img(
            v-if='activeLogoUrl'
            :src='activeLogoUrl'
            :alt='$t(`admin:general.logoActivePreviewAlt`)'
          )
          v-icon(v-else size='42' color='grey') mdi-image-off-outline
        v-chip.mt-3(
          v-if='activeLogoUrl'
          color='success'
          variant='tonal'
          size='small'
        ) {{ $t('admin:general.logoStatusActive') }}
      .logo-preview-card(v-if='candidateVisible')
        .logo-preview-heading {{ $t('admin:general.logoCandidate') }}
        .logo-preview-frame
          v-img(
            v-if='candidatePreviewUrl'
            :src='candidatePreviewUrl'
            :alt='$t(`admin:general.logoCandidatePreviewAlt`)'
          )
          v-icon(v-else size='42' color='grey') mdi-image-sync-outline
        v-chip.mt-3(
          :color='candidateStatusColor'
          variant='tonal'
          size='small'
          aria-live='polite'
        )
          v-progress-circular(
            v-if='logoUploading || candidateIsProcessing'
            indeterminate
            size='14'
            width='2'
            class='mr-2'
          )
          | {{ $t(candidateStatusKey) }}
        v-btn.mt-3(
          v-if='candidateHasFailed'
          color='primary'
          variant='tonal'
          size='small'
          :loading='logoRetrying'
          :disabled='disabled || logoUploading || logoRetrying || confirming'
          @click='retryLogo'
        )
          v-icon(start) mdi-refresh
          | {{ $t('admin:general.logoRetry') }}
    input.logo-file-input(
      ref='logoFileInput'
      type='file'
      tabindex='-1'
      :aria-label='$t(`admin:general.logoPickerLabel`)'
      accept='image/png,image/jpeg,image/webp'
      :disabled='disabled || logoUploading || logoRetrying || confirming'
      @change='onLogoFileChange'
      @click.stop
    )
    .logo-drop-target(
      :class='{ "logo-drop-target--active": logoDragActive, "logo-drop-target--disabled": disabled || logoUploading || logoRetrying || confirming }'
      role='button'
      tabindex='0'
      :aria-label='$t(`admin:general.logoPickerLabel`)'
      :aria-disabled='disabled || logoUploading || logoRetrying || confirming'
      @click='openLogoPicker'
      @keydown.enter.prevent='openLogoPicker'
      @keydown.space.prevent='openLogoPicker'
      @dragenter.prevent='onLogoDragEnter'
      @dragover.prevent
      @dragleave.prevent='onLogoDragLeave'
      @drop.prevent='onLogoDrop'
    )
      v-icon.logo-drop-icon(size='34') mdi-image-plus-outline
      .logo-drop-copy
        .text-body-large.font-weight-medium {{ $t('admin:general.logoPickerTitle') }}
        .text-body-small.text-medium-emphasis {{ $t('admin:general.logoPickerHint') }}
    .logo-message.logo-message--error(
      v-if='logoErrorKey'
      role='alert'
    ) {{ $t(logoErrorKey) }}
    p.logo-disclosure.text-body-small.text-medium-emphasis
      v-icon.mr-2(size='18') mdi-earth
      | {{ $t('admin:general.logoPublicUsage') }}
  v-dialog(v-model='confirming', max-width='520', :persistent='logoUploading', aria-labelledby='general-logo-review-title')
    v-card.general-logo-review
      v-card-title#general-logo-review-title Publish a new workspace logo
      v-card-text
        img.general-logo-selection(:src='candidatePreviewUrl', alt='Selected workspace logo')
        p The new logo becomes public when processing succeeds. Your current logo stays active if processing fails.
        p.text-body-small.text-medium-emphasis {{ selectedFile?.name }}
      v-card-actions
        v-btn(variant='text', @click='cancelSelection') Cancel
        v-spacer
        v-btn(color='primary', variant='flat', :disabled='disabled || !selectedFile', @click='publishSelected') Process and publish
</template>
<script lang='ts'>
import { wikiStore } from '@/store/index.ts'
import {
  fetchSiteLogoStatus,
  retrySiteLogo,
  SiteLogoApiError,
  SITE_LOGO_MAX_BYTES,
  uploadSiteLogo,
  type SiteLogoErrorCode,
  type SiteLogoStatus
} from '../../helpers/site-logo-api'
const logoErrorMessageKeys: Record<SiteLogoErrorCode, string> = {
  UNSUPPORTED_IMAGE: 'admin:general.logoErrorUnsupported',
  IMAGE_TOO_LARGE: 'admin:general.logoErrorTooLarge',
  INVALID_IMAGE: 'admin:general.logoErrorInvalid',
  NO_VISIBLE_PIXELS: 'admin:general.logoErrorNoVisiblePixels',
  UNSUITABLE_LOGO: 'admin:general.logoErrorUnsuitable',
  PROCESSING_FAILED: 'admin:general.logoErrorProcessing',
  ARTIFACT_TOO_LARGE: 'admin:general.logoErrorArtifactTooLarge',
  MANAGED_LOGO_CONFLICT: 'admin:general.logoErrorConflict'
}

export default {
  props: { disabled: Boolean },
  data() {
    return {
      logoStatus: null as SiteLogoStatus | null,
      logoUploading: false, logoRetrying: false, logoDragActive: false, logoDragDepth: 0,
      logoErrorKey: null as string | null, candidatePreviewUrl: '', logoPollTimer: null as number | null,
      logoRequestId: 0, logoRequestController: null as AbortController | null, logoDisposed: false,
      selectedFile: null as File | null, confirming: false
    }
  },
  computed: {
    activeLogoUrl () {
      return this.logoStatus?.active?.logoUrl || wikiStore.site.logoUrl || ''
    },
    candidateVisible () {
      return Boolean(
        this.logoUploading ||
        this.candidatePreviewUrl ||
        (this.logoStatus?.candidate && this.logoStatus.candidate.status !== 'ready')
      )
    },
    candidateIsProcessing () {
      const status = this.logoStatus?.candidate?.status
      return status === 'pending' || status === 'running'
    },
    candidateHasFailed () {
      return this.logoStatus?.candidate?.status === 'failed'
    },
    candidateStatusKey () {
      if (this.logoUploading) return 'admin:general.logoStatusUploading'
      if (this.logoErrorKey || this.logoStatus?.candidate?.status === 'failed') return 'admin:general.logoStatusFailed'
      return 'admin:general.logoStatusProcessing'
    },
    candidateStatusColor () {
      return this.logoErrorKey || this.logoStatus?.candidate?.status === 'failed' ? 'error' : 'info'
    }
  },
  watch: {
    confirming(value: boolean) { if (!value && !this.logoUploading && this.selectedFile) this.cancelSelection() }
  },
  methods: {
    cancelSelection() { this.confirming = false; this.selectedFile = null; this.clearCandidatePreview() },
    async publishSelected() {
      if (this.disabled || !this.selectedFile || this.logoUploading) return
      const file = this.selectedFile
      this.selectedFile = null
      this.confirming = false
      await this.uploadSelectedLogo(file)
    },
    clearLogoPoll () {
      if (this.logoPollTimer !== null) {
        window.clearTimeout(this.logoPollTimer)
        this.logoPollTimer = null
      }
    },
    scheduleLogoPoll () {
      this.clearLogoPoll()
      if (this.logoDisposed || !this.candidateIsProcessing) return
      this.logoPollTimer = window.setTimeout(() => {
        this.logoPollTimer = null
        this.refreshLogoStatus()
      }, 1500)
    },
    applyLogoStatus (status: SiteLogoStatus) {
      this.logoStatus = status
      if (status.active?.logoUrl) wikiStore.site.logoUrl = status.active.logoUrl
      this.logoErrorKey = status.candidate?.status === 'failed'
        ? this.logoErrorMessageKey(status.candidate.errorCode)
        : null
      if (!this.selectedFile && (!status.candidate || status.candidate.status === 'ready')) this.clearCandidatePreview()
      if (status.candidate?.status === 'pending' || status.candidate?.status === 'running') {
        this.scheduleLogoPoll()
      } else {
        this.clearLogoPoll()
      }
    },
    logoErrorMessageKey (code: SiteLogoErrorCode | null) {
      return code ? logoErrorMessageKeys[code] : 'admin:general.logoErrorGeneric'
    },
    logoRequestErrorKey (error: unknown) {
      return error instanceof SiteLogoApiError
        ? this.logoErrorMessageKey(error.code)
        : 'admin:general.logoErrorGeneric'
    },
    async refreshLogoStatus () {
      const requestId = ++this.logoRequestId
      this.logoRequestController?.abort()
      const controller = new AbortController()
      this.logoRequestController = controller
      try {
        const status = await fetchSiteLogoStatus(window.fetch.bind(window), controller.signal)
        if (requestId !== this.logoRequestId || this.logoDisposed) return
        this.applyLogoStatus(status)
      } catch (error) {
        if (requestId === this.logoRequestId && !this.logoDisposed && !controller.signal.aborted) {
          this.clearLogoPoll()
          this.logoErrorKey = this.logoRequestErrorKey(error)
        }
      }
    },
    openLogoPicker () {
      if (this.disabled || this.logoUploading || this.logoRetrying || this.confirming) return
      ;(this.$refs.logoFileInput as HTMLInputElement | undefined)?.click()
    },
    onLogoDragEnter () {
      if (this.disabled || this.logoUploading || this.logoRetrying || this.confirming) return
      this.logoDragDepth++
      this.logoDragActive = true
    },
    onLogoDragLeave () {
      this.logoDragDepth = Math.max(0, this.logoDragDepth - 1)
      this.logoDragActive = this.logoDragDepth > 0
    },
    onLogoDrop (event: DragEvent) {
      this.logoDragDepth = 0
      this.logoDragActive = false
      if (this.disabled || this.logoUploading || this.logoRetrying || this.confirming) return
      this.acceptLogoFiles(event.dataTransfer?.files)
    },
    onLogoFileChange (event: Event) {
      const input = event.target as HTMLInputElement
      this.acceptLogoFiles(input.files)
      input.value = ''
    },
    acceptLogoFiles (files: FileList | null | undefined) {
      if (!files || files.length !== 1) {
        this.logoErrorKey = 'admin:general.logoErrorOneFile'
        return
      }
      const file = files.item(0)
      if (!file) {
        this.logoErrorKey = 'admin:general.logoErrorOneFile'
      } else if (file.size > SITE_LOGO_MAX_BYTES) {
        this.logoErrorKey = 'admin:general.logoErrorTooLarge'
      } else {
        this.selectedFile = file
        this.replaceCandidatePreview(file)
        this.confirming = true
      }
    },
    replaceCandidatePreview (file: File) {
      this.clearCandidatePreview()
      this.candidatePreviewUrl = URL.createObjectURL(file)
    },
    clearCandidatePreview () {
      if (!this.candidatePreviewUrl) return
      URL.revokeObjectURL(this.candidatePreviewUrl)
      this.candidatePreviewUrl = ''
    },
    async uploadSelectedLogo (file: File) {
      this.clearLogoPoll()
      const requestId = ++this.logoRequestId
      this.logoRequestController?.abort()
      const controller = new AbortController()
      this.logoRequestController = controller
      this.logoErrorKey = null
      this.logoUploading = true
      this.replaceCandidatePreview(file)
      try {
        const status = await uploadSiteLogo(window.fetch.bind(window), file, controller.signal)
        if (requestId !== this.logoRequestId || this.logoDisposed) return
        this.applyLogoStatus(status)
      } catch (error) {
        if (requestId === this.logoRequestId && !this.logoDisposed && !controller.signal.aborted) {
          this.logoErrorKey = this.logoRequestErrorKey(error)
        }
      } finally {
        if (requestId === this.logoRequestId && !this.logoDisposed) this.logoUploading = false
      }
    },
    async retryLogo () {
      if (this.disabled || this.logoUploading || this.logoRetrying || this.confirming) return
      this.clearLogoPoll()
      const requestId = ++this.logoRequestId
      this.logoRequestController?.abort()
      const controller = new AbortController()
      this.logoRequestController = controller
      this.logoErrorKey = null
      this.logoRetrying = true
      try {
        const status = await retrySiteLogo(window.fetch.bind(window), controller.signal)
        if (requestId !== this.logoRequestId || this.logoDisposed) return
        this.applyLogoStatus(status)
      } catch (error) {
        if (requestId === this.logoRequestId && !this.logoDisposed && !controller.signal.aborted) {
          this.logoErrorKey = this.logoRequestErrorKey(error)
        }
      } finally {
        if (requestId === this.logoRequestId && !this.logoDisposed) this.logoRetrying = false
      }
    }
  },
  mounted() { this.refreshLogoStatus() },
  beforeUnmount() {
    this.logoDisposed = true
    this.logoRequestId++
    this.logoRequestController?.abort()
    this.clearLogoPoll()
    this.clearCandidatePreview()
  }
}
</script>
<style lang='scss' scoped>
.general-logo-note { margin: 0 0 1.25rem; color: var(--wiki-text-muted); line-height: 1.7; }
.general-logo-selection { display: block; width: 100%; height: 180px; object-fit: contain; margin-bottom: 1.5rem; }
.general-logo-review { max-height:90dvh; .v-card-title { white-space:normal; } .v-card-text { overflow:auto; } }
.general-logo-review p { line-height: 1.7; overflow-wrap: anywhere; }

  .logo-manager {
    --logo-manager-border: rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .logo-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .logo-preview-card {
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--logo-manager-border);
    border-radius: 12px;
    background: rgba(var(--v-theme-surface-variant), .24);
  }
  .logo-preview-heading {
    margin-bottom: .75rem;
    color: rgba(var(--v-theme-on-surface), .72);
    font-size: .75rem;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .logo-preview-frame {
    display: grid;
    width: 100%;
    height: 112px;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    background:
      linear-gradient(45deg, rgba(var(--v-theme-on-surface), .05) 25%, transparent 25%) 0 0 / 16px 16px,
      linear-gradient(-45deg, rgba(var(--v-theme-on-surface), .05) 25%, transparent 25%) 0 8px / 16px 16px,
      linear-gradient(45deg, transparent 75%, rgba(var(--v-theme-on-surface), .05) 75%) 8px -8px / 16px 16px,
      linear-gradient(-45deg, transparent 75%, rgba(var(--v-theme-on-surface), .05) 75%) -8px 0 / 16px 16px;
  }
  .logo-preview-frame > .v-img {
    width: 100%;
    height: 100%;
  }
  .logo-drop-target {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 96px;
    padding: 1rem 1.25rem;
    border: 1.5px dashed rgba(var(--v-theme-primary), .5);
    border-radius: 12px;
    background: rgba(var(--v-theme-primary), .045);
    cursor: pointer;
    transition: border-color .16s ease, background-color .16s ease, transform .16s ease;
  }
  .logo-drop-target:hover,
  .logo-drop-target:focus-visible,
  .logo-drop-target--active {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), .1);
    outline: none;
    transform: translateY(-1px);
  }
  .logo-drop-target:focus-visible {
    box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), .22);
  }
  .logo-drop-target--disabled {
    cursor: wait;
    opacity: .58;
    transform: none;
  }
  .logo-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .logo-drop-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
  .logo-drop-copy {
    min-width: 0;
  }
  .logo-message {
    margin-top: .75rem;
    font-size: .875rem;
  }
  .logo-message--error {
    color: rgb(var(--v-theme-error));
  }
  .logo-disclosure {
    display: flex;
    align-items: flex-start;
    margin: 1rem 0 0;
    line-height: 1.5;
  }
  @media (max-width: 600px) {
    .logo-preview-grid {
      grid-template-columns: 1fr;
    }
    .logo-drop-target {
      align-items: flex-start;
    }
  }
</style>
