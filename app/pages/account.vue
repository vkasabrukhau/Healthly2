<script setup lang="ts">
import { computed } from 'vue'

const { isLoaded, isSignedIn, user } = useUser()

const fullName = computed(() => {
  if (!user.value) {
    return ''
  }
  const { firstName, lastName, username } = user.value
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(' ')
  }
  return username ?? ''
})

const age = computed(() => {
  const birthday = user.value?.birthday
  if (!birthday) {
    return null
  }

  let birthDate: Date | null = null

  if (birthday instanceof Date) {
    birthDate = birthday
  } else if (typeof birthday === 'string') {
    birthDate = new Date(birthday)
  } else if (
    typeof birthday === 'object' &&
    birthday !== null &&
    'year' in birthday &&
    'month' in birthday &&
    'day' in birthday
  ) {
    const { year, month, day } = birthday as { year?: number; month?: number; day?: number }
    if (year && month && day) {
      birthDate = new Date(year, month - 1, day)
    }
  }

  if (!birthDate || Number.isNaN(birthDate.getTime())) {
    return null
  }

  const today = new Date()
  let computedAge = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  const dayDiff = today.getDate() - birthDate.getDate()

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    computedAge--
  }

  return `${computedAge} years`
})

const memberDuration = computed(() => {
  const createdAt = user.value?.createdAt
  if (!createdAt) {
    return null
  }

  const createdDate = new Date(createdAt)
  if (Number.isNaN(createdDate.getTime())) {
    return null
  }

  const now = new Date()
  const monthsDiff =
    (now.getFullYear() - createdDate.getFullYear()) * 12 + (now.getMonth() - createdDate.getMonth())
  const years = Math.floor(monthsDiff / 12)
  const months = monthsDiff % 12

  const parts = []
  if (years > 0) {
    parts.push(`${years} yr${years > 1 ? 's' : ''}`)
  }
  if (months > 0) {
    parts.push(`${months} mo${months > 1 ? 's' : ''}`)
  }

  const formattedDate = createdDate.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric'
  })

  return {
    label: parts.length > 0 ? parts.join(' · ') : 'Less than a month',
    joined: formattedDate
  }
})
</script>

<template>
  <div class="page">
    <div v-if="!isLoaded" class="loading">
      <div class="skeleton skeleton--avatar"></div>
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--text short"></div>
    </div>

    <div v-else-if="!isSignedIn" class="card empty-state">
      <h1>Sign in to view your account</h1>
      <p>
        This page shows your Clerk profile photo and membership details. Please sign in to continue.
      </p>
      <NuxtLink class="btn" to="/sign-in">
        Go to Clerk sign in
      </NuxtLink>
    </div>

    <section v-else class="card profile">
      <div class="profile__media">
        <img
          :src="user?.imageUrl ?? ''"
          :alt="fullName ? `${fullName} profile photo` : 'Profile photo'"
          class="profile__photo"
        />
      </div>
      <div class="profile__details">
        <div>
          <p class="eyebrow">Account</p>
          <h1>{{ fullName || 'Unnamed member' }}</h1>
          <p class="email">{{ user?.primaryEmailAddress?.emailAddress }}</p>
        </div>
        <dl class="info-grid">
          <div v-if="age" class="info-item">
            <dt>Age</dt>
            <dd>{{ age }}</dd>
          </div>
          <div v-if="memberDuration" class="info-item">
            <dt>Member since</dt>
            <dd>
              <span>{{ memberDuration.joined }}</span>
              <span class="info-item__sub">{{ memberDuration.label }}</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  </div>
</template>

<style scoped>
:global(body) {
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin: 0;
  background: #05070a;
  color: #f6f3ee;
}

.page {
  min-height: 100vh;
  padding: 72px clamp(1.5rem, 6vw, 6rem) 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  width: min(960px, 100%);
  border-radius: 32px;
  padding: clamp(2rem, 4vw, 4rem);
  background: rgba(12, 14, 19, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 25px 65px rgba(0, 0, 0, 0.45);
}

.profile {
  display: grid;
  grid-template-columns: minmax(220px, 340px) 1fr;
  gap: clamp(2rem, 4vw, 3rem);
  align-items: center;
}

.profile__media {
  display: flex;
  justify-content: center;
}

.profile__photo {
  width: min(320px, 100%);
  aspect-ratio: 1/1;
  border-radius: 999px;
  object-fit: cover;
  border: 6px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4);
}

.profile__details h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.25rem);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 0.75rem;
  color: #ffb08f;
  margin: 0 0 0.75rem;
}

.email {
  margin: 0.4rem 0 0;
  color: #cfcac2;
}

.info-grid {
  margin: 2rem 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
}

.info-item {
  padding: 1.25rem;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.info-item dt {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
}

.info-item dd {
  margin: 0.8rem 0 0;
  font-size: 1.1rem;
}

.info-item__sub {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.9rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #f6f3ee;
  text-decoration: none;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.loading {
  width: min(600px, 100%);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.skeleton {
  border-radius: 16px;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.08) 35%, rgba(255, 255, 255, 0.04) 50%, rgba(255, 255, 255, 0.08) 65%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}

.skeleton--avatar {
  width: 220px;
  height: 220px;
  border-radius: 999px;
  align-self: center;
}

.skeleton--text {
  height: 24px;
}

.skeleton--text.short {
  width: 60%;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@media (max-width: 768px) {
  .profile {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .profile__details {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .info-grid {
    width: 100%;
  }
}
</style>
