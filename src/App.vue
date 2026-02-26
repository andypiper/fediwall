<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onKeyStroke, useDocumentVisibility, usePreferredDark, useWindowScroll } from '@vueuse/core'

import { type Config, type Post } from '@/types';
import { loadConfig } from '@/config';
import { fallbackConfig, gitVersion } from '@/defaults'
import { fetchPosts } from '@/sources'

import Card from './components/Card.vue';
import ConfigModal from './components/ConfigModal.vue';
import InfoBar from './components/InfoBar.vue';
import { whack } from './utils';

const config = ref<Config>();

const allPosts = ref<Array<Post>>([])
const pinned = ref<Array<string>>([])
const hidden = ref<Array<string>>([])
const updateInProgress = ref(false)

const statusText = ref<string | undefined>("Initializing ...")
const statusIsError = ref(false)

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

onKeyStroke(['w'], (e) => {
  if(!(e.target instanceof HTMLElement)) return;
  if(e.target instanceof HTMLInputElement ||
     e.target instanceof HTMLTextAreaElement ||
     e.target.isContentEditable)
     return;
  whack("#wall *", 1)
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

</script>

<template>
  <div id="page">

    <!-- Branding bar: shown when any branding option is configured.
         logoUrl   — small logo displayed on the left of the bar.
         bannerText — short text beside the logo.
         bannerImageUrl — used as a background image spanning the full bar width.
         All three are optional; the bar only appears when at least one is set. -->
    <div v-if="config?.bannerText || config?.logoUrl || config?.bannerImageUrl"
         id="branding-bar"
         :style="config?.bannerImageUrl ? { backgroundImage: `url('${config.bannerImageUrl}')` } : {}">
      <img v-if="config?.logoUrl" :src="config.logoUrl" class="branding-logo" alt="Logo" />
      <span v-if="config?.bannerText" class="branding-text">{{ config.bannerText }}</span>
    </div>

    <header v-if="config?.showInfobar" class="secret-hover" style="cursor: context-menu" data-bs-toggle="modal"
      data-bs-target="#configModal" title="Click to edit wall settings">
      <span class="text-muted float-end secret">
        <icon icon="gear" />
      </span>
      <InfoBar :config="config" />
    </header>

    <aside id="status-row" class="position-absolute opacity-25">
      <Transition>
        <icon v-if="statusIsError" icon="triangle-exclamation" class="mx-1" :title="statusText" />
        <icon v-else-if="updateInProgress" icon="spinner" spin class="mx-1" />
      </Transition>
    </aside>

    <main>
      <div v-if="config && filteredPosts.length > 0" id="wall">
        <Card class="wall-item secret-hover" v-for="post in filteredPosts" :key="post.id" :post="post"
          :config="config">

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
    </main>

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
        <button class="btn btn-link text-muted" data-bs-toggle="modal" data-bs-target="#configModal">Customize</button>
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

.secret-hover:hover .secret {
  opacity: 1;
}

#page header {
  padding: .5em .5em;
  font-size: 1.2em;
  display: block;
  width: 100%;
  text-align: center;
  background-color: var(--bs-light-bg-subtle);
}

/* ── Branding banner ────────────────────────────────────────────────────── */

#branding-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  /* Fallback colour when no banner image is set */
  background-color: var(--bs-primary-bg-subtle);
  background-size: cover;
  background-position: center;
  border-bottom: 1px solid var(--bs-border-color-subtle);
  min-height: 3.5rem;
}

.branding-logo {
  max-height: 3rem;
  width: auto;
  object-fit: contain;
  /* Subtle drop shadow so the logo reads on any background */
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
}

.branding-text {
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--bs-emphasis-color);
  letter-spacing: 0.01em;
  /* Legible on dark or image backgrounds */
  text-shadow: 0 1px 4px rgba(0,0,0,0.35);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

#page footer {
  padding: 0.75em 1em;
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

/* ── Wall layout — CSS multi-column (zero JS, no layout thrashing) ───────
   Items flow top→bottom within each column, which is natural for a
   display wall.  Column width is determined by the browser; ~320 px gives
   4–6 columns on typical HD/QHD screens and collapses gracefully.

   Progressive enhancement: browsers that already support the CSS Masonry
   spec (Firefox with flag, Chrome Canary) get native masonry instead.    */

#wall {
  columns: 320px;
  column-gap: 0;
}

@supports (grid-template-rows: masonry) {
  #wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    grid-template-rows: masonry;
    columns: unset;
    gap: 0;
  }
}

.wall-item {
  break-inside: avoid;
  display: block;
  width: 100%;
}

@media (max-width: 40rem) {
  #page main {
    padding: .5rem .5rem;
  }

  #wall {
    columns: 1;
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
</style>
