<script setup lang="ts">
import { sanitizeConfig, isServer, isLanguage, toQuery } from '@/config';
import { computed, ref } from 'vue';
import { arrayUnique } from '@/utils';
import { type Config } from '@/types';
import { siteConfigParam } from '@/config'

const emit = defineEmits(['update:modelValue'])
const modalBody = ref<HTMLElement | null>(null)

const props = defineProps<{
  modelValue: Config
}>()

const config = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', sanitizeConfig(value)),
});

const formServers = computed({
  get: () => config.value.servers.join(" "),
  set: (value) => config.value.servers = (value || "").replace(/https?:\/\//ig, "").split(/[, ]+/).filter(isServer),
});

const hasServers = computed(()=> {
  return config.value.servers.length > 0
})

const tagPattern = /#?([\p{Letter}\p{Number}\p{Mark}\p{Connector_Punctuation}_]+)/igu
const formTags = computed({
  get: () => config.value.tags.map(t => '#' + t).join(" "),
  set: (value) => config.value.tags = arrayUnique([...(value || "").matchAll(tagPattern)].map(m => m[1])),
});

const badwordPattern = /([^, ]+)/igu
const formBadWords = computed({
  get: () => config.value.badWords.join(" "),
  set: (value) => config.value.badWords = arrayUnique([...(value || "").matchAll(badwordPattern)].map(m => m[1])),
});

const accountPattern = /\b([a-z0-9_]+)(@([a-z0-9.-]+\.[a-z]{2,}))?\b/ig;
const formAccounts = computed({
  get: () => config.value.accounts.map(t => "@" + t).join(" "),
  set: (value) => config.value.accounts = [...(value || "").matchAll(accountPattern)].map(m => m[0]),
});

const langPattern = /\b([a-z]{2})\b/ig;
const formLang = computed({
  get: () => config.value.languages.join(" "),
  set: (value) => config.value.languages = [...(value || "").matchAll(langPattern)].map(m => m[0]).filter(isLanguage),
});

const formLimit = computed({
  get: () => config.value.limit.toString(),
  set: (value) => config.value.limit = Math.min(100, Math.max(10, parseInt(value || "0") || 0)),
});

const formInterval = computed({
  get: () => config.value.interval.toString(),
  set: (value) => config.value.interval = Math.min(600, Math.max(5, parseInt(value || "0") || 0)),
});

const formMediaText = computed({
  get: () => config.value.showText,
  set: (value) => {
    config.value.showText = value
    if (!value)
      config.value.showMedia = true
  }
});

const formMediaMedia = computed({
  get: () => config.value.showMedia,
  set: (value) => {
    config.value.showMedia = value
    if (!value) {
      config.value.showText = true
    }
  }
});

const sourceCount = computed(() => {
  var c = 0
  c += config.value.servers.length * config.value.tags.length
  c += config.value.loadFederated ? config.value.servers.length : 0
  c += config.value.loadPublic ? config.value.servers.length : 0
  c += config.value.loadTrends ? config.value.servers.length : 0
  c += config.value.accounts
    .map(a => a.indexOf('@') > 0 ? 1 : config.value.servers.length)
    .reduce((p, e) => p + e, 0)
  return c;
})

const rateLimitRisk = computed(() => {
  return sourceCount.value / config.value.interval > 1
})

const saveConfigLink = computed(() => {
  const json = JSON.stringify(config.value, undefined, 2)
  const bytes = new TextEncoder().encode(json)
  const binString = Array.from(bytes, (x) => String.fromCodePoint(x)).join("");
  return "data:application/json;charset=utf-8;base64," + btoa(binString);
})

const fullUrl = computed(() => {
  const url = new URL(location.href.toString());
  url.hash = ""
  url.search = toQuery(config.value)
  return url.toString()
})

const onSubmit = () => {
  location.assign(fullUrl.value)
}

const copyUrlToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(fullUrl.value)
    copyUrlLabel.value = 'Copied!'
    setTimeout(() => { copyUrlLabel.value = 'Copy URL' }, 2000)
  } catch {
    copyUrlLabel.value = 'Copy URL'
  }
}
const copyUrlLabel = ref('Copy URL')

const brandingColorPresets = [
  { value: '#1d4ed8', label: 'Blue' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#db2777', label: 'Pink' },
  { value: '#dc2626', label: 'Red' },
  { value: '#d97706', label: 'Amber' },
  { value: '#16a34a', label: 'Green' },
  { value: '#0f172a', label: 'Dark navy' },
  { value: '#f8fafc', label: 'Near-white' },
]

const scrollToSection = (id: string) => {
  const el = document.getElementById(id)
  if (!el || !modalBody.value) return
  // Scroll within the modal body, accounting for the sticky jump-nav (~2.5rem)
  const navHeight = 44
  const top = el.offsetTop - navHeight
  modalBody.value.scrollTo({ top, behavior: 'smooth' })
}

</script>

<template>
  <div class="modal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">

        <div class="modal-header">
          <h5 class="modal-title">Configure Wall</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body" ref="modalBody">

          <!-- ── Jump navigation ────────────────────────────────────────── -->
          <nav class="cfg-jumpnav" aria-label="Jump to section">
            <button type="button" class="cfg-jumpbtn" @click="scrollToSection('cfg-sources')">
              <icon icon="server" class="me-1" />Sources
            </button>
            <button type="button" class="cfg-jumpbtn" @click="scrollToSection('cfg-filters')">
              <icon icon="filter" class="me-1" />Filters
            </button>
            <button type="button" class="cfg-jumpbtn" @click="scrollToSection('cfg-appearance')">
              <icon icon="paintbrush" class="me-1" />Appearance
            </button>
            <button type="button" class="cfg-jumpbtn" @click="scrollToSection('cfg-advanced')">
              <icon icon="sliders" class="me-1" />Advanced
            </button>
          </nav>

          <form @submit.prevent="onSubmit" id="settings-form">

            <!-- ── Sources ───────────────────────────────────────────────── -->
            <section id="cfg-sources" class="cfg-section">
              <h6 class="cfg-section-heading">
                <icon icon="server" class="cfg-section-icon" />Sources
              </h6>

              <div class="mb-3">
                <label for="edit-server" class="form-label">Servers</label>
                <input type="text" class="form-control" id="edit-server" placeholder="example.social" v-model.lazy="formServers">
                <div class="form-text"><span title="Mastodon or compatible"
                    style="border-bottom: 1px dotted; cursor: help;">Mastodon</span> server domains to query for
                  hashtags or timelines. Separate multiple with spaces.</div>
              </div>

              <div class="mb-3">
                <label for="edit-tags" class="form-label">Hashtags</label>
                <input type="text" class="form-control" id="edit-tags" v-model.lazy="formTags" :disabled="!hasServers">
                <div class="form-text">Search for public posts matching any of these hashtags.</div>
              </div>

              <div class="mb-3">
                <label for="edit-accounts" class="form-label">Profiles</label>
                <input type="text" class="form-control" id="edit-accounts" v-model.lazy="formAccounts">
                <div class="form-text">Show all public posts or boosts from these profiles (@user or @user@domain).</div>
              </div>

              <div class="mb-1">
                <label class="form-label">Public timelines</label>
              </div>
              <div class="form-check mb-1">
                <input class="form-check-input" type="checkbox" id="edit-trends" v-model="config.loadTrends" :disabled="!hasServers">
                <label class="form-check-label" for="edit-trends">Show trending posts</label>
              </div>
              <div class="form-check mb-1">
                <input class="form-check-input" type="checkbox" id="edit-local" v-model="config.loadPublic" :disabled="!hasServers">
                <label class="form-check-label" for="edit-local">Show all source-local posts</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="edit-federated" v-model="config.loadFederated" :disabled="!hasServers">
                <label class="form-check-label" for="edit-federated">Show all federated posts</label>
              </div>
            </section>

            <hr class="cfg-divider">

            <!-- ── Filters ───────────────────────────────────────────────── -->
            <section id="cfg-filters" class="cfg-section">
              <h6 class="cfg-section-heading">
                <icon icon="filter" class="cfg-section-icon" />Filters
              </h6>

              <div class="mb-2">
                <label class="form-label">Hide unwanted posts</label>
              </div>
              <div class="form-check mb-1">
                <input class="form-check-input" type="checkbox" id="edit-nsfw" v-model="config.hideSensitive">
                <label class="form-check-label" for="edit-nsfw">Hide sensitive content</label>
              </div>
              <div class="form-check mb-1">
                <input class="form-check-input" type="checkbox" id="edit-bots" v-model="config.hideBots">
                <label class="form-check-label" for="edit-bots">Hide bot accounts</label>
              </div>
              <div class="form-check mb-1">
                <input class="form-check-input" type="checkbox" id="edit-replies" v-model="config.hideReplies">
                <label class="form-check-label" for="edit-replies">Hide replies</label>
              </div>
              <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="edit-boosts" v-model="config.hideBoosts">
                <label class="form-check-label" for="edit-boosts">Hide boosts</label>
              </div>

              <div class="mb-3">
                <label for="edit-badwords" class="form-label">Blocked words</label>
                <input type="text" class="form-control" id="edit-badwords" v-model.lazy="formBadWords">
                <div class="form-text">Hide posts containing these words, domains or hashtags (full word match only).</div>
              </div>

              <div class="mb-0">
                <label for="edit-lang" class="form-label">Language filter</label>
                <input type="text" class="form-control" id="edit-lang" placeholder="all languages" v-model.lazy="formLang">
                <div class="form-text">Space-separated <a href="https://en.wikipedia.org/wiki/ISO_639-1"
                    target="_blank">two-letter language codes</a> to allow. Leave blank for all languages.</div>
              </div>
            </section>

            <hr class="cfg-divider">

            <!-- ── Appearance ────────────────────────────────────────────── -->
            <section id="cfg-appearance" class="cfg-section">
              <h6 class="cfg-section-heading">
                <icon icon="paintbrush" class="cfg-section-icon" />Appearance
              </h6>

              <div class="row g-3 mb-3">
                <div class="col-sm-6">
                  <label for="edit-title" class="form-label">Wall title</label>
                  <input type="text" class="form-control" id="edit-title" v-model.lazy="config.title">
                  <div class="form-text">Shown in the browser tab.</div>
                </div>
                <div class="col-sm-3">
                  <label for="edit-theme" class="form-label">Theme</label>
                  <select class="form-select" id="edit-theme" v-model="config.theme">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
                <div class="col-sm-3">
                  <label for="edit-infobar" class="form-label">Info bar</label>
                  <select class="form-select" id="edit-infobar" v-model="config.infobarPosition">
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label">Post content</label>
                <div class="form-check mb-1">
                  <input class="form-check-input" type="checkbox" id="edit-text" v-model="formMediaText">
                  <label class="form-check-label" for="edit-text">Show text</label>
                </div>
                <div class="form-check mb-1">
                  <input class="form-check-input" type="checkbox" id="edit-media" v-model="formMediaMedia">
                  <label class="form-check-label" for="edit-media">Show images and videos</label>
                </div>
                <div class="form-check ms-3">
                  <input class="form-check-input" type="checkbox" id="edit-autoplay" v-model="config.playVideos" :disabled="!formMediaMedia">
                  <label class="form-check-label" for="edit-autoplay">Autoplay videos (muted)</label>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label">Top bar</label>
                <div class="form-check mb-1">
                  <input class="form-check-input" type="checkbox" id="edit-hide-toggle" v-model="config.hideViewToggle">
                  <label class="form-check-label" for="edit-hide-toggle">Hide posts / contributors toggle buttons</label>
                </div>
              </div>

              <div class="mb-0">
                <label class="form-label">
                  Event branding
                  <span class="fw-normal text-muted">(optional)</span>
                </label>
                <div class="form-text mb-2">
                  Add a logo or title for conferences, events, or organisation displays.
                  Leave all fields blank to hide the branding area entirely.
                </div>

                <div class="row g-2 mb-2">
                  <div class="col-sm-6">
                    <label for="edit-logo" class="form-label">Logo image URL</label>
                    <input type="url" class="form-control form-control-sm" id="edit-logo"
                      placeholder="https://example.com/logo.png"
                      v-model.lazy="config.logoUrl">
                  </div>
                  <div class="col-sm-6">
                    <label for="edit-banner-text" class="form-label">Banner text</label>
                    <input type="text" class="form-control form-control-sm" id="edit-banner-text"
                      placeholder="My Event 2025"
                      v-model.lazy="config.bannerText">
                  </div>
                </div>

                <div class="mb-2">
                  <label for="edit-banner-image" class="form-label">Background image URL</label>
                  <input type="url" class="form-control form-control-sm" id="edit-banner-image"
                    placeholder="https://example.com/banner.jpg"
                    v-model.lazy="config.bannerImageUrl">
                  <div class="form-text">Full-width image behind the branding bar. Overrides colour below.</div>
                </div>

                <div>
                  <label for="edit-banner-color" class="form-label">Background colour</label>
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <input type="color" class="form-control form-control-color form-control-sm" id="edit-banner-color"
                      v-model="config.bannerColor" title="Choose a background colour">
                    <div class="d-flex flex-wrap gap-1">
                      <button v-for="c in brandingColorPresets" :key="c.value" type="button"
                        class="color-preset-btn"
                        :style="{ background: c.value, outline: config.bannerColor === c.value ? '2px solid var(--bs-primary)' : '2px solid transparent', outlineOffset: '2px' }"
                        :title="c.label"
                        @click="config.bannerColor = c.value"></button>
                      <button type="button" class="color-preset-btn color-preset-clear"
                        title="Clear colour" @click="config.bannerColor = ''">✕</button>
                    </div>
                  </div>
                  <div class="form-text">Used when no background image is set.</div>
                </div>
              </div>
            </section>

            <hr class="cfg-divider">

            <!-- ── Advanced ──────────────────────────────────────────────── -->
            <section id="cfg-advanced" class="cfg-section">
              <h6 class="cfg-section-heading">
                <icon icon="sliders" class="cfg-section-icon" />Advanced
              </h6>

              <div class="row g-3 mb-3">
                <div class="col-sm-6">
                  <label for="edit-interval" class="form-label">Update interval (seconds)</label>
                  <input type="text" class="form-control" id="edit-interval" v-model.lazy="formInterval">
                  <div class="form-text">How often to check for new posts.</div>
                </div>
                <div class="col-sm-6">
                  <label for="edit-limit" class="form-label">Results per query</label>
                  <input type="text" class="form-control" id="edit-limit" v-model.lazy="formLimit">
                  <div class="form-text">Increase only if filters hide too many posts.</div>
                </div>
              </div>

              <div v-if="rateLimitRisk" class="alert alert-warning py-2 mb-3" role="alert">
                Updating {{ sourceCount }} sources every {{ formInterval }}s may hit rate limits.
                Reduce sources or increase the interval.
              </div>

              <div class="mb-3">
                <label class="form-label">Share this wall</label>
                <div class="form-text mb-2">Copy the URL to share or bookmark your current configuration.</div>
                <div class="d-flex gap-2">
                  <input type="text" class="form-control form-control-sm" readonly :value="fullUrl" aria-label="Wall URL">
                  <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0"
                    @click.prevent="copyUrlToClipboard">{{ copyUrlLabel }}</button>
                </div>
              </div>

              <div class="mb-0">
                <label class="form-label">Download config</label>
                <div class="form-text">
                  <a :href="saveConfigLink" target="_blank" download="wall-config.json">Download</a>
                  the current configuration as <code>wall-config.json</code> to self-host, or load it via
                  <code>?{{ siteConfigParam }}=URL</code>.
                </div>
              </div>
            </section>

          </form>
        </div>

        <div class="modal-footer">
          <button type="submit" class="btn btn-primary" form="settings-form">Apply config</button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Jump navigation ───────────────────────────────────────────────────── */

.cfg-jumpnav {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  padding: 0.5rem 0 0.5rem;
  margin-bottom: 0.75rem;
  background: var(--bs-body-bg);
  border-bottom: 1px solid var(--bs-border-color-subtle);
}

.cfg-jumpbtn {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.25em 0.75em;
  font-size: 0.82rem;
  border-radius: 999px;
  border: 1px solid var(--bs-border-color);
  background: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.cfg-jumpbtn:hover {
  background: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  border-color: var(--bs-primary-border-subtle);
}

/* ── Section headers ───────────────────────────────────────────────────── */

.cfg-section {
  /* Offset for sticky jump-nav when scrolled to by JS */
  scroll-margin-top: 3rem;
}

.cfg-section-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bs-secondary-color);
  margin-bottom: 1rem;
}

.cfg-section-icon {
  font-size: 0.85em;
  opacity: 0.7;
}

.cfg-divider {
  margin: 1.5rem 0;
  border-color: var(--bs-border-color-subtle);
}

/* ── Form labels ───────────────────────────────────────────────────────── */

.form-label {
  font-weight: 600;
  margin-bottom: 0.3rem;
}

/* ── Colour presets ────────────────────────────────────────────────────── */

.color-preset-btn {
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.1s;
}

.color-preset-btn:hover {
  transform: scale(1.15);
}

.color-preset-clear {
  background: var(--bs-secondary-bg);
  border: 1px solid var(--bs-border-color) !important;
  color: var(--bs-secondary-color);
  font-size: 0.7rem;
  line-height: 1;
}
</style>
