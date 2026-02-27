<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onKeyStroke, useDocumentVisibility, usePreferredDark, useWindowScroll, useWindowSize } from '@vueuse/core'

import { type Config, type Post, type PostMedia } from '@/types';
import { loadConfig } from '@/config';
import { fallbackConfig, gitVersion } from '@/defaults'
import { fetchPosts } from '@/sources'

import Card from './components/Card.vue';
import ConfigModal from './components/ConfigModal.vue';
import InfoBar from './components/InfoBar.vue';
import PeopleView from './components/PeopleView.vue';
import { whack } from './utils';

const config = ref<Config>();

const allPosts = ref<Array<Post>>([])
const pinned = ref<Array<string>>([])
const hidden = ref<Array<string>>([])
const updateInProgress = ref(false)

const statusText = ref<string | undefined>("Initializing ...")
const statusIsError = ref(false)

// View toggle: "wall" | "contributors"
const currentView = ref<'wall' | 'contributors'>('wall')

// Lightbox
const lightboxMedia = ref<PostMedia | null>(null)
const openLightbox = (media: PostMedia) => { lightboxMedia.value = media }
const closeLightbox = () => { lightboxMedia.value = null }

var updateIntervalHandle: number;
var lastUpdate = 0;

onMounted(async () => {
  config.value = await loadConfig()
  if (visibilityState.value !== "hidden")
    restartUpdates()
})

onBeforeUnmount(() => {
  stopUpdates()
})

// Wall column layout: distribute posts L-R across columns (matching old JS-masonry order).
// Column count is derived from window width; each column gets every Nth post.
const { width: windowWidth } = useWindowSize()
const wallColumns = computed<Post[][]>(() => {
  const n = Math.max(1, Math.floor(windowWidth.value / 320))
  const cols: Post[][] = Array.from({ length: n }, () => [])
  filteredPosts.value.forEach((post, i) => cols[i % n].push(post))
  return cols
})

// Pause updates while tab/window is hidden or window is scrolled down
const visibilityState = useDocumentVisibility()
const scrollState = useWindowScroll()
const updatePaused = computed(() => {
  const ypos = scrollState.y.value;
  const hidden = visibilityState.value === "hidden";
  return ypos > 256 || hidden
})

watch(updatePaused, () => {
  if (updatePaused.value) {
    console.debug("Updates paused")
    stopUpdates()
  } else {
    console.debug("Updates resumed")
    restartUpdates()
  }
})

// Watch for a theme changes
const isDarkPreferred = usePreferredDark()
const actualTheme = computed(() => {
  var theme = config.value?.theme
  if (!theme || theme === "auto")
    theme = isDarkPreferred.value ? "dark" : "light"
  return theme
})
watch(actualTheme, () => {
  document.body!.parentElement!.dataset.bsTheme = actualTheme.value
}, { immediate: true })

// Update page title
watch(() => config.value?.title, () => document.title = config.value?.title || fallbackConfig.title)

// Watch for a update interval changes
watch(() => config.value?.interval, () => restartUpdates())

// Keyboard shortcuts
onKeyStroke(['w'], (e) => {
  if(!(e.target instanceof HTMLElement)) return;
  if(e.target instanceof HTMLInputElement ||
     e.target instanceof HTMLTextAreaElement ||
     e.target.isContentEditable)
     return;
  whack("#wall *", 1)
})

onKeyStroke(['Escape'], () => {
  if (lightboxMedia.value) closeLightbox()
})

/**
 * Starts or restarts the update interval timer.
 */
const restartUpdates = () => {
  stopUpdates()
  if (!config.value) return

  // Mastodon default rate limit is 1/s (300/5m)
  // Be nice, only send one request every 2 seconds on average.
  const rqPerUpdate = config.value.accounts.length + config.value.tags.length
  const minInternal = Math.ceil(rqPerUpdate * 2)
  const interval = Math.max(minInternal, config.value.interval)

  updateIntervalHandle = setInterval(() => {
    updateWall()
  }, interval * 1000)

  // Trigger update immediately if new interval allows it
  if (lastUpdate + (interval * 1000) < Date.now())
    updateWall()
}

/**
 * Stops the update interval
 */
const stopUpdates = () => {
  clearInterval(updateIntervalHandle)
}

/**
 * Trigger a wall update.
 *
 * Does nothing if there is an update running already.
 */
async function updateWall() {
  const cfg = config.value
  if (!cfg) return

  if (updateInProgress.value) {
    console.debug("Wall update skipped: Already in progress")
    return
  }

  console.debug("Updating wall...")
  updateInProgress.value = true

  try {
    allPosts.value = await fetchPosts(cfg, progress => {
      if (progress.errors.length) {
        setStatus(progress.errors.slice(-1)[0].message, true)
      } else if (progress.finished < progress.total) {
        setStatus(`Loading ${progress.finished}/${progress.total} sources ...`)
      } else {
        setStatus(false)
      }
    })

    console.debug("Update completed")
  } catch (e) {
    setStatus(`Update failed: ${e}`)
  } finally {
    lastUpdate = Date.now()
    updateInProgress.value = false;
  }

}


function setStatus(text: string | false, isError?: boolean) {
  if (text === false) {
    statusText.value = undefined
    statusIsError.value = false
  } else {
    statusText.value = text
    statusIsError.value = isError === true
  }
}

/**
 * Filter and order posts based on real-time criteria (e.g. pinned or hidden posts).
 * Most of filtering already happened earlier.
 */
const filteredPosts = computed(() => {
  // Copy to make sure those are detected as a reactive dependencies
  var posts: Array<Post> = [...allPosts.value]
  const pinnedLocal = [...pinned.value]
  const hiddenLocal = [...hidden.value]

  // Filter hidden posts, authors or domains
  posts = posts.filter((p) => !hiddenLocal.some(hide =>
    p.id == hide || p.author?.profile.endsWith(hide)
  ))

  // Mark pinned posts
  posts.forEach(p => { p.pinned = pinnedLocal.includes(p.id) })

  // Sort by pinned status / date
  posts = posts.sort((a, b) => {
    const aPinned = a.pinned ? 1 : 0
    const bPinned = b.pinned ? 1 : 0
    return bPinned - aPinned || b.date.getTime() - a.date.getTime()
  })
  return posts
})

/** True when the config has at least one content source defined. */
const hasAnySources = computed(() => {
  if (!config.value) return false
  return config.value.tags.length > 0
      || config.value.accounts.length > 0
      || config.value.loadPublic
      || config.value.loadFederated
      || config.value.loadTrends
})

function toggle<T>(array: T[], value: T) {
  if (array.includes(value))
    array.splice(array.indexOf(value), 1)
  else
    array.push(value)
}

const pin = (id: string) => {
  toggle(pinned.value, id)
}

const hide = (id: string) => {
  toggle(hidden.value, id)
}

const hideAuthor = (profile: string) => {
  toggle(hidden.value, profile)
}

const hideDomain = (profile: string) => {
  var domain = profile.split("@").pop()
  if (domain)
    toggle(hidden.value, "@" + domain)
}

const toggleTheme = () => {
  if (!config.value) return
  config.value.theme = actualTheme.value === "dark" ? "light" : "dark"
}

const privacyLink = computed(() => {
  if (config.value?.servers.length)
    return `https://${config.value.servers[0]}/privacy-policy`
  return "#"
})

/** Inline style for the branding bar background. */
const brandingBarStyle = computed(() => {
  if (!config.value) return {}
  if (config.value.bannerImageUrl)
    return { backgroundImage: `url('${config.value.bannerImageUrl}')` }
  if (config.value.bannerColor)
    return { backgroundColor: config.value.bannerColor }
  return {}
})

</script>

<template>
  <div id="page">

    <!-- ── Unified top bar ──────────────────────────────────────────────
         Always rendered once config loads.  Three zones:
           Left  — branding (logo + text), only when any branding is set.
           Centre — info bar text, only when infobarPosition === "top".
           Right  — view toggle (when posts exist) + settings gear.
         Background styling (bannerColor / bannerImageUrl) applies to the
         whole bar when branding is configured.                           -->
    <div v-if="config" id="top-bar"
         :class="{ 'top-bar-branded': config.bannerText || config.logoUrl || config.bannerImageUrl }"
         :style="brandingBarStyle">

      <!-- Brand -->
      <div class="top-bar-brand">
        <img v-if="config.logoUrl" :src="config.logoUrl" class="branding-logo" alt="Logo" />
        <span v-if="config.bannerText" class="branding-text">{{ config.bannerText }}</span>
      </div>

      <!-- Info text (centre) -->
      <div class="top-bar-info">
        <span v-if="config.infobarPosition === 'top'" class="top-bar-infotext">
          <InfoBar :config="config" />
        </span>
      </div>

      <!-- Actions (right) -->
      <div class="top-bar-actions">
        <!-- Status indicator -->
        <Transition>
          <icon v-if="statusIsError" icon="triangle-exclamation" class="top-bar-status text-warning" :title="statusText" />
          <icon v-else-if="updateInProgress" icon="spinner" spin class="top-bar-status text-muted" />
        </Transition>

        <!-- View toggle — only when there is something to show -->
        <div v-if="filteredPosts.length > 0" class="btn-group" role="group" aria-label="View">
          <button type="button" class="btn btn-sm"
            :class="currentView === 'wall' ? 'btn-primary' : 'btn-outline-secondary'"
            @click="currentView = 'wall'" title="Post wall">
            <icon icon="table-cells" />
          </button>
          <button type="button" class="btn btn-sm"
            :class="currentView === 'contributors' ? 'btn-primary' : 'btn-outline-secondary'"
            @click="currentView = 'contributors'" title="Contributors">
            <icon icon="users" />
          </button>
        </div>

        <!-- Settings -->
        <button class="btn btn-sm btn-outline-secondary top-bar-settings"
          data-bs-toggle="modal" data-bs-target="#configModal" title="Customize wall">
          <icon icon="gear" />
        </button>
      </div>
    </div>

    <!-- ── Main content ──────────────────────────────────────────────── -->
    <main>
      <!-- Wall view: posts distributed L-R across columns to match old JS-masonry order -->
      <div v-if="config && filteredPosts.length > 0 && currentView === 'wall'" id="wall">
        <div class="wall-col" v-for="(col, ci) in wallColumns" :key="ci">
          <Card class="wall-item secret-hover" v-for="post in col" :key="post.id" :post="post"
            :config="config" @open-media="openLightbox">

            <template v-slot:topleft>
              <div class="dropdown secret">
                <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="dropdown"
                  aria-expanded="false">...</button>
                <ul class="dropdown-menu">
                  <li><a class="dropdown-item" href="#" @click.prevent="pin(post.id)">{{ post.pinned ? "Unpin" : "Pin"
                      }}</a></li>
                  <li><a class="dropdown-item" href="#" @click.prevent="hide(post.id)">Hide Post</a></li>
                  <li v-if="post.author?.profile"><a class="dropdown-item" href="#"
                      @click.prevent="hideAuthor(post.author?.profile)">Hide
                      Author</a></li>
                  <li v-if="post.author?.profile"><a class="dropdown-item" href="#"
                      @click.prevent="hideDomain(post.author?.profile)">Hide
                      Domain</a></li>
                </ul>
              </div>
            </template>

          </Card>
        </div>
      </div>

      <!-- Contributors view -->
      <PeopleView v-else-if="config && filteredPosts.length > 0 && currentView === 'contributors'"
        :posts="filteredPosts" />

      <!-- Zero state: no sources configured -->
      <div v-else-if="config && !hasAnySources && !updateInProgress" id="zero-state">
        <div class="zero-state-card card mx-auto">
          <div class="card-body text-center p-5">
            <icon icon="rss" class="zero-state-icon text-muted mb-3" />
            <h4 class="mb-2">Welcome to Fediwall</h4>
            <p class="text-muted mb-4">
              No content sources are configured yet. Add some hashtags, accounts, or timelines to
              start streaming posts from the Fediverse.
            </p>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#configModal">
              <icon icon="gear" class="me-2" />Set up your wall
            </button>
          </div>
        </div>
      </div>

      <!-- Empty state: sources configured but no posts yet -->
      <div v-else-if="config && hasAnySources && filteredPosts.length === 0 && !updateInProgress" id="zero-state">
        <div class="zero-state-card card mx-auto">
          <div class="card-body text-center p-5">
            <icon icon="magnifying-glass" class="zero-state-icon text-muted mb-3" />
            <h4 class="mb-2">No posts found</h4>
            <p class="text-muted mb-4">
              Posts matching your current filters haven't arrived yet, or your filters may be too strict.
            </p>
            <button class="btn btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#configModal">
              <icon icon="gear" class="me-2" />Review settings
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- ── Info bar (bottom position) ─────────────────────────────────── -->
    <div v-if="config?.infobarPosition === 'bottom'" id="infobar-bottom">
      <InfoBar :config="config" />
    </div>

    <ConfigModal v-if="config" v-model="config" id="configModal" />

    <footer>
      <Transition name="status">
        <aside v-if="statusText" class="status-text" :class="{ 'status-error': statusIsError }">
          {{ statusText }}
        </aside>
      </Transition>
      <nav class="footer-links">
        <button class="btn btn-link text-muted" @click="toggleTheme(); false">
          {{ actualTheme == "dark" ? "Light" : "Dark" }} mode
        </button>
        <span class="text-muted" aria-hidden="true">·</span>
        <a href="https://github.com/defnull/fediwall" target="_blank" class="text-muted">
          Fediwall<span v-if="gitVersion"> {{ gitVersion }}</span>
        </a>
        <span class="text-muted" aria-hidden="true">·</span>
        <a href="https://github.com/defnull/fediwall#readme" target="_blank" class="text-muted">Docs</a>
        <span class="text-muted" aria-hidden="true">·</span>
        <a :href="privacyLink" target="_blank" class="text-muted">Privacy</a>
      </nav>
    </footer>

    <!-- ── Lightbox overlay ───────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="lightbox">
        <div v-if="lightboxMedia" class="lightbox-overlay" @click.self="closeLightbox"
          role="dialog" aria-modal="true" aria-label="Media viewer">
          <button class="lightbox-close btn btn-sm btn-outline-light" @click="closeLightbox"
            aria-label="Close">
            <icon icon="xmark" />
          </button>
          <img v-if="lightboxMedia.type === 'image'" :src="lightboxMedia.url"
            :alt="lightboxMedia.alt" class="lightbox-media" />
          <video v-else-if="lightboxMedia.type === 'video'" :src="lightboxMedia.url"
            class="lightbox-media" controls autoplay muted loop />
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style>
body {
  background-color: var(--bs-dark-bg-subtle)
}

#page {
  margin: 0;
}

#page a,
#page button.btn-link {
  text-decoration: none;
}

#page main {
  padding: 1rem 1rem;
}

.secret-hover .secret {
  transition: opacity 0.2s;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .secret-hover .secret {
    transition: none;
  }
}

.secret-hover:hover .secret {
  opacity: 1;
}

/* ── Unified top bar ─────────────────────────────────────────────────── */

#top-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0.75rem;
  background-color: var(--bs-light-bg-subtle);
  border-bottom: 1px solid var(--bs-border-color-subtle);
  min-height: 2.8rem;
}

/* When branding is active, grow to accommodate logo + larger text */
#top-bar.top-bar-branded {
  padding: 0.6rem 1rem;
  background-color: var(--bs-primary-bg-subtle);
  background-size: cover;
  background-position: center;
  min-height: 3.5rem;
}

.top-bar-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

/* Centre zone grows to fill available space, pushing actions to the right */
.top-bar-info {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  font-size: 0.95em;
  color: var(--bs-secondary-color);
  /* Prevent very long info text overflowing on small screens */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  margin-left: auto;
}

.top-bar-status {
  font-size: 0.9rem;
  opacity: 0.45;
}

.branding-logo {
  max-height: 2.6rem;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
}

.branding-text {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--bs-emphasis-color);
  letter-spacing: 0.01em;
  text-shadow: 0 1px 4px rgba(0,0,0,0.3);
  white-space: nowrap;
}

/* ── Info bar (bottom position) — floating pill fixed to viewport bottom ── */

#infobar-bottom {
  position: fixed;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  /* Pill shape */
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.35em 1.1em;
  border-radius: 999px;
  font-size: 0.88em;
  white-space: nowrap;
  max-width: calc(100vw - 2rem);
  overflow: hidden;
  text-overflow: ellipsis;
  /* Glassy appearance */
  background-color: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  color: var(--bs-secondary-color);
  /* Ensure it doesn't obscure the footer on small screens */
  pointer-events: none;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

#page footer {
  padding: 0.75em 1em;
  /* Extra bottom padding ensures footer links stay above the floating
     bottom infobar pill (fixed, ~2rem tall, 1.25rem from viewport bottom) */
  padding-bottom: 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4em;
  width: 100%;
  font-size: 0.85em;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.25em 0.5em;
}

.footer-links .btn-link {
  padding: 0;
  font-size: inherit;
}

.status-text {
  font-size: 0.8em;
  opacity: 0.6;
  padding: 0.2em 0.75em;
  border-radius: 999px;
  background: var(--bs-secondary-bg);
}

.status-text.status-error {
  opacity: 1;
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}

.status-enter-active,
.status-leave-active {
  transition: opacity 0.4s ease;
}

.status-enter-from,
.status-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .status-enter-active,
  .status-leave-active {
    transition: none;
  }
}

/* ── Wall layout — flex columns with L-R card distribution ──────────────
   Posts are distributed left-to-right across columns (matching the order
   the old JS-masonry library used) by a Vue computed that round-robins
   filteredPosts into N arrays. Each array is rendered as a .wall-col.
   Column count = floor(windowWidth / 320), minimum 1.                   */

#wall {
  display: flex;
  align-items: flex-start;
}

.wall-col {
  flex: 1;
  min-width: 0;
}

.wall-item {
  display: block;
  width: 100%;
}

@media (max-width: 40rem) {
  #page main {
    padding: .5rem .5rem;
  }
}

/* ── Zero / empty state ──────────────────────────────────────────────── */

#zero-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 2rem 1rem;
}

.zero-state-card {
  max-width: 480px;
  width: 100%;
  box-shadow: 0 4px 24px rgba(0,0,0,0.1);
  border-radius: 16px;
}

.zero-state-icon {
  font-size: 3rem;
  display: block;
}

/* ── Lightbox overlay ────────────────────────────────────────────────── */

.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.lightbox-media {
  max-width: 95vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.6);
}

.lightbox-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10000;
  font-size: 1.2rem;
  line-height: 1;
}

.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .lightbox-enter-active,
  .lightbox-leave-active {
    transition: none;
  }
}

/* ── Vue default transition (status icon) ────────────────────────────── */

.v-enter-active,
.v-leave-active {
  transition: opacity 0.3s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .v-enter-active,
  .v-leave-active {
    transition: none;
  }
}
</style>
