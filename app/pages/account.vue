<script setup lang="ts">
import { computed } from "vue";

const { isLoaded, isSignedIn, user } = useUser();

const fullName = computed(() => {
  if (!user.value) {
    return "";
  }
  const { firstName, lastName, username } = user.value;
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ");
  }
  return username ?? "";
});

const age = computed(() => {
  const birthday = (user.value as any)?.birthday;
  if (!birthday) {
    return null;
  }

  let birthDate: Date | null = null;

  if (birthday instanceof Date) {
    birthDate = birthday;
  } else if (typeof birthday === "string") {
    birthDate = new Date(birthday);
  } else if (
    typeof birthday === "object" &&
    birthday !== null &&
    "year" in birthday &&
    "month" in birthday &&
    "day" in birthday
  ) {
    const { year, month, day } = birthday as {
      year?: number;
      month?: number;
      day?: number;
    };
    if (year && month && day) {
      birthDate = new Date(year, month - 1, day);
    }
  }

  if (!birthDate || Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let computedAge = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    computedAge--;
  }

  return `${computedAge} years`;
});

const memberDuration = computed(() => {
  const createdAt = user.value?.createdAt;
  if (!createdAt) {
    return null;
  }

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) {
    return null;
  }

  const now = new Date();
  const monthsDiff =
    (now.getFullYear() - createdDate.getFullYear()) * 12 +
    (now.getMonth() - createdDate.getMonth());
  const years = Math.floor(monthsDiff / 12);
  const months = monthsDiff % 12;

  const parts = [];
  if (years > 0) {
    parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  }
  if (months > 0) {
    parts.push(`${months} mo${months > 1 ? "s" : ""}`);
  }

  const formattedDate = createdDate.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  return {
    label: parts.length > 0 ? parts.join(" · ") : "Less than a month",
    joined: formattedDate,
  };
});
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
        This page shows your Clerk profile photo and membership details. Please
        sign in to continue.
      </p>
      <NuxtLink class="btn" to="/sign-in"> Go to Clerk sign in </NuxtLink>
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
          <h1>{{ fullName || "Unnamed member" }}</h1>
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

<style scoped src="./account.css"></style>

