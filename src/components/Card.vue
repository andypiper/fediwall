<script setup lang="ts">
import { useElementVisibility, useIntervalFn } from '@vueuse/core'
import { computed, ref } from 'vue';
import { timeAgo as formatTimeAgo } from '@/utils'
import { type Config, type Post, type PostMedia } from '@/types';

const props = defineProps<{
  config: Config,
  post: Post,
}>()

const emit = defineEmits<{
  'open-media': [media: PostMedia]
}>()

const timeAgoText = ref(formatTimeAgo(props.post.date))

// Relative timestamps only need refreshing every 30 s — using one interval
// per card at 1 s was a needless CPU sink (N cards × 1 Hz callbacks).
useIntervalFn(() => {
  timeAgoText.value = formatTimeAgo(props.post.date)
}, 30_000)

const allMedia = computed(() => props.post.media)
const firstMedia = computed(() => props.post.media[0])

const mediaElement = ref(null)
const mediaIsVisible = useElementVisibility(mediaElement)
const playVideo = computed(() => {
  return firstMedia.value?.type === "video" && props.config.playVideos && mediaIsVisible.value
})

// Carousel ID must be a valid DOM id; post IDs from Mastodon are numeric strings.
const carouselId = computed(() => `carousel-${props.post.id}`)

</script>

<template>
  <div class="wall-item">
    <div class="card mx-2 my-3" :class="post.pinned ? 'pinned' : ''">
      <div v-if="post.author" class="card-header d-flex align-items-center gap-2">
        <a v-if="post.author?.avatar" :href="post.url" target="_blank" class="flex-shrink-0">
          <img :src="post.author.avatar" class="avatar" loading="lazy" width="32" height="32" />
        </a>
        <a :href="post.url" target="_blank" class="text-body flex-grow-1 m-0 avatarlink">
          <div v-dompurify-html="post.author.name" class="displayname fw-semibold"></div>
          <div v-dompurify-html="post.author.profile" class="profile"></div>
        </a>
        <slot name="topleft"></slot>
      </div>
      <div class="card-body">

        <!-- ── Media section ─────────────────────────────────────────── -->
        <div v-if="config.showMedia && allMedia.length > 0" class="wall-media mb-3" ref="mediaElement">

          <!-- Single attachment -->
          <template v-if="allMedia.length === 1">
            <img v-if="firstMedia.type === 'image'" :src="firstMedia.url" :alt="firstMedia.alt"
              :title="firstMedia.alt" loading="lazy" class="media-clickable"
              @click="emit('open-media', firstMedia)" />
            <video v-else-if="firstMedia.type === 'video'" muted loop :autoplay="playVideo"
              :poster="firstMedia.preview" :alt="firstMedia.alt" :title="firstMedia.alt">
              <source v-if="playVideo" :src="firstMedia.url">
            </video>
            <a v-else-if="firstMedia.type === 'card'" :href="firstMedia.url" target="_blank">
              <img :src="firstMedia.preview" :alt="firstMedia.alt" :title="firstMedia.alt" loading="lazy">
            </a>
          </template>

          <!-- Multi-attachment carousel -->
          <div v-else :id="carouselId" class="carousel slide" data-bs-ride="false">
            <div class="carousel-inner">
              <div v-for="(m, i) in allMedia" :key="i" class="carousel-item" :class="{ active: i === 0 }">
                <img v-if="m.type === 'image'" :src="m.url" :alt="m.alt" :title="m.alt"
                  loading="lazy" class="d-block w-100 media-clickable"
                  @click="emit('open-media', m)" />
                <video v-else-if="m.type === 'video'" muted loop controls
                  :poster="m.preview" :alt="m.alt" :title="m.alt" class="d-block w-100">
                  <source :src="m.url">
                </video>
                <a v-else-if="m.type === 'card'" :href="m.url" target="_blank" class="d-block">
                  <img :src="m.preview" :alt="m.alt" :title="m.alt" loading="lazy" class="d-block w-100">
                </a>
              </div>
            </div>
            <!-- Navigation arrows (only when >1 item) -->
            <button class="carousel-control-prev" type="button" :data-bs-target="`#${carouselId}`"
              data-bs-slide="prev">
              <span class="carousel-control-prev-icon" aria-hidden="true"></span>
              <span class="visually-hidden">Previous</span>
            </button>
            <button class="carousel-control-next" type="button" :data-bs-target="`#${carouselId}`"
              data-bs-slide="next">
              <span class="carousel-control-next-icon" aria-hidden="true"></span>
              <span class="visually-hidden">Next</span>
            </button>
            <!-- Dot indicators -->
            <div class="carousel-indicators">
              <button v-for="(_, i) in allMedia" :key="i" type="button"
                :data-bs-target="`#${carouselId}`" :data-bs-slide-to="i"
                :class="{ active: i === 0 }" :aria-current="i === 0 ? 'true' : undefined"
                :aria-label="`Slide ${i + 1}`"></button>
            </div>
          </div>

        </div>
        <!-- ── End media section ──────────────────────────────────────── -->

        <p v-if="config.showText" class="card-text" v-dompurify-html="post.content"></p>
        <p class="card-text text-end text-break mb-0">
          <a :href="post.url" target="_blank" :title="post.date.toLocaleString()"
            class="text-decoration-none text-muted timestamp">
            <small>{{ timeAgoText }}</small>
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<style>
.wall-item .card {
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .wall-item .card {
    transition: none;
  }
}

.wall-item .card:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.25);
  transform: translateY(-1px);
}

.wall-item .card.pinned {
  border-color: var(--bs-primary);
}

.wall-item .card.pinned .card-header {
  background-color: var(--bs-primary-bg-subtle);
}

.wall-item a {
  text-decoration: none;
}

.wall-item img.avatar {
  width: 2em;
  height: 2em;
  border-radius: 50%;
  object-fit: cover;
}

.wall-item a.avatarlink {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  min-width: 0;
}

.wall-item div.displayname {
  line-height: 1.2;
}

.wall-item div.profile {
  margin-top: .1em;
  font-size: .8em;
  opacity: .55;
  line-height: 1.2;
}

.wall-item img.emoji {
  height: 1em;
  width: 1em;
  object-fit: contain;
  vertical-align: middle;
  font-size: inherit;
}

/* Single-media sizing */
.wall-media > img,
.wall-media > video {
  width: 100%;
  max-height: 60vh;
  object-fit: cover;
  border-radius: 0;
  display: block;
}

/* Carousel-media sizing */
.wall-media .carousel-item img,
.wall-media .carousel-item video {
  max-height: 60vh;
  object-fit: cover;
}

/* Suppress Bootstrap's slide animation when prefers-reduced-motion is set */
@media (prefers-reduced-motion: reduce) {
  .wall-media .carousel .carousel-item {
    transition: none;
  }
}

/* Clickable cursor on images that open the lightbox */
.media-clickable {
  cursor: zoom-in;
}

.wall-item .card-header {
  border-bottom: 1px solid rgba(0,0,0,.06);
}

.wall-item .card-body {
  padding: 0.85rem 1rem;
}

.wall-item .card-text {
  font-size: 0.92rem;
  line-height: 1.5;
}

.wall-item a.timestamp:hover {
  opacity: 0.8;
}

.wall-item .invisible {
  font-size: 0 !important;
  line-height: 0 !important;
}
</style>
