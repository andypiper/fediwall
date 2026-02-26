<script setup lang="ts">
import { useElementVisibility, useIntervalFn } from '@vueuse/core'
import { computed, inject, ref } from 'vue';
import { timeAgo as formatTimeAgo } from '@/utils'
import { type Config, type Post } from '@/types';

const props = defineProps<{
  config: Config,
  post: Post,
}>()

const timeAgoText = ref(formatTimeAgo(props.post.date))

// Relative timestamps only need refreshing every 30 s — using one interval
// per card at 1 s was a needless CPU sink (N cards × 1 Hz callbacks).
useIntervalFn(() => {
  timeAgoText.value = formatTimeAgo(props.post.date)
}, 30_000)

const media = computed(() => {
  return props.post.media[0]
})

const mediaElement = ref(null)
const mediaIsVisible = useElementVisibility(mediaElement)
const playVideo = computed(() => {
  return media.value?.type === "video" && props.config.playVideos && mediaIsVisible.value
})

const onMediaLoad = inject('fixLayout', () => undefined)

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
        <div v-if="config.showMedia && media" class="wall-media mb-3" ref="mediaElement">
          <img v-if="media.type === 'image'" :src="media.url" :alt="media.alt" :title="media.alt"
            loading="lazy" @load="onMediaLoad">
          <video v-else-if="media.type === 'video'" muted loop :autoplay="playVideo"
            :poster="media.preview" :alt="media.alt" :title="media.alt" @loadedmetadata="onMediaLoad">
            <source v-if="playVideo" :src="media.url">
          </video>
          <a v-else-if="media.type==='card'" :href="media.url" target="_blank">
            <img :src="media.preview" :alt="media.alt" :title="media.alt" loading="lazy" @load="onMediaLoad">
          </a>
        </div>
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

.wall-media img,
.wall-media video {
  width: 100%;
  max-height: 60vh;
  object-fit: cover;
  border-radius: 0;
  display: block;
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
