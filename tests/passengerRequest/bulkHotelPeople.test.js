import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeBulkIndexes,
  spliceAtIndexes
} from "../../services/passengerRequest/bulkHotelPeople.js"

test("индексы схлопываются и сортируются по убыванию", () => {
  assert.deepEqual(normalizeBulkIndexes([1, 5, 1, 3]), [5, 3, 1])
})

test("пустой и отсутствующий набор дают пустой массив", () => {
  assert.deepEqual(normalizeBulkIndexes([]), [])
  assert.deepEqual(normalizeBulkIndexes(undefined), [])
  assert.deepEqual(normalizeBulkIndexes(null), [])
})

test("вырезает именно выбранные элементы", () => {
  const list = ["a", "b", "c", "d", "e"]
  const { next, removed } = spliceAtIndexes(list, normalizeBulkIndexes([0, 2, 4]))
  assert.deepEqual(next, ["b", "d"])
  assert.deepEqual(removed, ["a", "c", "e"])
})

test("удалённые отдаются в порядке исходного списка, а не обхода", () => {
  const list = ["a", "b", "c", "d"]
  const { removed } = spliceAtIndexes(list, normalizeBulkIndexes([3, 1]))
  assert.deepEqual(removed, ["b", "d"])
})

test("исходный массив не мутируется", () => {
  const list = ["a", "b", "c"]
  spliceAtIndexes(list, normalizeBulkIndexes([1]))
  assert.deepEqual(list, ["a", "b", "c"])
})

test("вырезание одного элемента — частный случай пачки", () => {
  const { next, removed } = spliceAtIndexes(["a", "b", "c"], normalizeBulkIndexes([1]))
  assert.deepEqual(next, ["a", "c"])
  assert.deepEqual(removed, ["b"])
})

test("вырезание всех элементов даёт пустой остаток", () => {
  const { next, removed } = spliceAtIndexes(["a", "b"], normalizeBulkIndexes([0, 1]))
  assert.deepEqual(next, [])
  assert.deepEqual(removed, ["a", "b"])
})
