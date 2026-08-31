<script setup lang="ts">
/**
 * One nutrient against its target (§15's target-and-over-limit rules, §9's
 * honesty rules). Presentational: it takes numbers already scaled to the window
 * by the caller and makes no comparison decisions of its own beyond how to draw
 * them.
 *
 * The bar itself is aria-hidden. Everything it encodes is also stated in text
 * beside it, which is what §15 requires — colour and length never carry meaning
 * alone — and it means a screen reader gets the figures rather than a shape.
 */
import { computed } from 'vue'

import type { NutrientKey, NutrientTotal, ResolvedTarget } from '../data/nutrients'
import {
  estimatedPercent,
  formatAmount,
  hasNoData,
  isPartial,
  labelFor,
  unitFor,
} from '../nutrient-display'

const {
  nutrient,
  total,
  target,
  limit,
  origin = 'user',
} = defineProps<{
  nutrient: NutrientKey
  total: NutrientTotal
  /** Already scaled to the window by the caller — §9's target × daysLogged. */
  target?: number
  /** Scaled the same way. Absent means no limit is known, never zero (§5). */
  limit?: number
  origin?: ResolvedTarget['origin']
}>()

const noData = computed(() => hasNoData(total))

/**
 * The widest figure the track has to hold, so the target tick can stay at 100%
 * of target while the fill still runs past it when intake exceeds it. Scaling to
 * a fixed multiple of target instead would clip a large overshoot.
 */
const scale = computed(() => {
  if (target === undefined) return undefined

  return Math.max(total.amount, target, limit ?? 0)
})

const percentOfScale = (value: number) => (scale.value ? (value / scale.value) * 100 : 0)

const tickPercent = computed(() => (target === undefined ? 0 : percentOfScale(target)))
const fillPercent = computed(() => percentOfScale(total.amount))

/** Only ever true when a limit is actually known (§5). */
const overLimit = computed(() => limit !== undefined && total.amount > limit)

const belowTarget = computed(() => target !== undefined && total.amount < target)

/** Share of target, for the figure beside the bar. Undefined without a target. */
const share = computed(() =>
  target === undefined || target === 0 ? undefined : Math.round((total.amount / target) * 100),
)

const against = computed(() => (origin === 'user' ? 'your goal' : 'the reference'))
</script>

<template>
  <div class="row">
    <div class="head">
      <span class="label">{{ labelFor(nutrient) }}</span>

      <span v-if="noData" class="muted">No data</span>
      <span v-else class="figures">
        <span :class="{ estimated: estimatedPercent(total) > 0 }">
          {{ formatAmount(nutrient, total.amount) }} {{ unitFor(nutrient) }}
        </span>
        <template v-if="target !== undefined"> of {{ formatAmount(nutrient, target) }} </template>
      </span>
    </div>

    <!-- No target means nothing to draw against: no track rather than a full or
         an empty one, either of which would imply a comparison (§3). -->
    <div v-if="!noData && target !== undefined" class="track" aria-hidden="true">
      <div
        class="fill"
        :class="{ over: overLimit, under: belowTarget }"
        :style="{ width: `${fillPercent}%` }"
      />
      <!-- Always at 100% of target, wherever that falls on the scale (§15). -->
      <span class="tick" :style="{ left: `${tickPercent}%` }" />
    </div>

    <p class="notes">
      <span v-if="target === undefined" class="muted">No target</span>
      <template v-else-if="!noData">
        <span>{{ share }}% of {{ against }}</span>
        <!-- Paired with the bar's length, never colour alone (§15). -->
        <span v-if="overLimit" class="over-label">· over the limit</span>
      </template>

      <span v-if="isPartial(total)" class="note"
        >· at least this much, {{ total.missing }} without data</span
      >
      <span v-if="estimatedPercent(total) > 0" class="note">
        · {{ estimatedPercent(total) }}% estimated
      </span>
    </p>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.figures {
  font-feature-settings: var(--figures-tabular);
}

.track {
  position: relative;
  height: 0.5rem;
  background: var(--line);
  border-radius: var(--radius-pill);
}

.fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--status-ok);
  transition: width var(--motion-slow) var(--ease-out);
}

/* Two tones only. Over-limit deliberately reuses the deviation tone rather than
   introducing a third: §15 makes severity a matter of length, and a dedicated
   over-limit hue would collide with --macro-fat. The "over" label carries the
   direction. */
.fill.under,
.fill.over {
  background: var(--status-under);
}

.tick {
  position: absolute;
  top: -0.125rem;
  width: 2px;
  height: 0.75rem;
  background: var(--ink);
  transform: translateX(-1px);
}

.notes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.over-label {
  color: var(--status-under);
}

/* Provenance without relying on colour (§15) — same marker as the day summary. */
.estimated {
  border-bottom: 1px dotted var(--ink-soft);
}

.muted {
  color: var(--ink-soft);
}
</style>
