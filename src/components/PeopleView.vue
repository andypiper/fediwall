<script setup lang="ts">
import { computed } from 'vue';
import { type Post } from '@/types';

const props = defineProps<{
  posts: Post[]
}>()

interface Contributor {
  name: string
  profile: string
  avatar?: string
  url?: string
  postCount: number
  recentPosts: Post[]
}

const contributors = computed((): Contributor[] => {
  const map = new Map<string, Contributor>()

  for (const post of props.posts) {
    if (!post.author?.profile) continue
    const key = post.author.profile

    if (!map.has(key)) {
      map.set(key, {
        name: post.author.name,
        profile: post.author.profile,
        avatar: post.author.avatar,
        url: post.author.url,
        postCount: 0,
        recentPosts: [],
      })
    }

    const entry = map.get(key)!
    entry.postCount++
    if (entry.recentPosts.length < 3)
      entry.recentPosts.push(post)
  }

  return [...map.values()].sort((a, b) => b.postCount - a.postCount)
})
</script>

<template>
  <div class="contributors-view">
    <div v-if="contributors.length === 0" class="contributors-empty text-muted text-center py-4">
      No contributors yet.
    </div>
    <div v-else class="contributors-grid">
      <div v-for="c in contributors" :key="c.profile" class="contributor-card card mx-2 my-3">
        <div class="card-body d-flex gap-3 align-items-start">

          <!-- Avatar -->
          <a :href="c.url || '#'" target="_blank" class="flex-shrink-0">
            <img v-if="c.avatar" :src="c.avatar" class="contrib-avatar" loading="lazy"
              :alt="c.name" width="48" height="48" />
            <div v-else class="contrib-avatar contrib-avatar-fallback"></div>
          </a>

          <!-- Info -->
          <div class="flex-grow-1 min-w-0">
            <a :href="c.url || '#'" target="_blank" class="text-body text-decoration-none">
              <div v-dompurify-html="c.name" class="fw-semibold contrib-name"></div>
              <div class="contrib-profile text-muted">{{ c.profile }}</div>
            </a>
            <div class="contrib-posts mt-2">
              <a v-for="p in c.recentPosts" :key="p.id" :href="p.url" target="_blank"
                class="contrib-post-snippet text-muted text-decoration-none"
                v-dompurify-html="p.content">
              </a>
            </div>
          </div>

          <!-- Post count badge -->
          <span class="badge contrib-badge flex-shrink-0" :title="`${c.postCount} post${c.postCount !== 1 ? 's' : ''}`">
            {{ c.postCount }}
          </span>

        </div>
      </div>
    </div>
  </div>
</template>

<style>
.contributors-view {
  padding: 1rem;
}

.contributors-grid {
  columns: 360px;
  column-gap: 0;
}

@supports (grid-template-rows: masonry) {
  .contributors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    grid-template-rows: masonry;
    columns: unset;
    gap: 0;
  }
}

.contributor-card {
  break-inside: avoid;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .contributor-card {
    transition: none;
  }
}

.contributor-card:hover {
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.22);
  transform: translateY(-1px);
}

.contrib-avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  object-fit: cover;
}

.contrib-avatar-fallback {
  background: var(--bs-secondary-bg);
}

.contrib-name {
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contrib-profile {
  font-size: 0.8em;
  opacity: 0.6;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contrib-badge {
  background: var(--bs-primary-bg-subtle);
  color: var(--bs-primary-text-emphasis);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.35em 0.6em;
  border-radius: 999px;
}

/* Show up to 3 recent post snippets as small teasers */
.contrib-post-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 0.78rem;
  line-height: 1.4;
  opacity: 0.7;
  margin-top: 0.25rem;
  /* Strip any HTML formatting inherited from post content */
}

.contrib-post-snippet * {
  display: inline;
}

.contrib-post-snippet p,
.contrib-post-snippet br {
  display: none;
}

@media (max-width: 40rem) {
  .contributors-grid {
    columns: 1;
  }
}
</style>
