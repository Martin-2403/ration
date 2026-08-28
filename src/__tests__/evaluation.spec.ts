/**
 * Spec for the evaluation arithmetic (§9, §17).
 *
 * Per §19 the assertions here are written by hand and the implementation follows
 * — this is the module where a plausible-looking wrong number would go
 * unnoticed, so stating what "correct" means is the part worth doing yourself.
 *
 * The todos below are the surface §9 defines, not a suggested test order. Turn
 * each into a real assertion (or delete it if you disagree that it matters); the
 * implementation in evaluation.ts currently throws, so the first one you write
 * goes red immediately.
 *
 * Fixtures you will probably want:
 *   const entry = (at: number, energy: number): LogEntry => ({ ... })
 *   startOfLocalDay / addLocalDays from '../dates' for building day boundaries
 *   a ResolvedTarget map, e.g. { energy: { nutrient: 'energy', target: 2000,
 *     origin: 'user' } }
 */
import { describe, it } from 'vitest'

describe('trailingWindow', () => {
  it.todo('covers today and the days before it, ending at the next local midnight')
  it.todo('starts at a local midnight, not at the current time of day')
  it.todo('spans the right number of days across a DST change')
})

describe('daysLogged', () => {
  it.todo('counts a day once however many entries it holds')
  it.todo('ignores entries outside the window')
  it.todo('counts an entry at the window start and excludes one at its end')
  it.todo('reports zero logged days for an empty log, without dividing by it')
})

describe('evaluate', () => {
  it.todo('scales the target by days logged, not by the window length')
  it.todo('reports a shortfall against the scaled target')
  it.todo('reports over-limit only when an upper limit is known')
  it.todo('leaves share undefined when the nutrient has no target')
  it.todo('carries the target origin through, so the view can attribute it')
  it.todo('takes intake from the stored snapshots rather than the food cache')
  it.todo('keeps a nutrient with intake but no target in the result')
  it.todo('omits a nutrient with neither intake nor target')
  it.todo('does not treat a missing value as a zero contribution')
})

describe('byUrgency', () => {
  it.todo('sorts the largest shortfall first')
  it.todo('pins an over-limit nutrient above every shortfall')
})
