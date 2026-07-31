// Работа с пачкой людей, адресуемой индексами в массиве hotels[i].people.
//
// Удаление элемента сдвигает все последующие индексы, поэтому набор всегда
// обрабатывается по УБЫВАНИЮ. Обход по возрастанию вырезал бы не тех людей —
// и сделал бы это молча, поэтому порядок задан здесь, а не на стороне вызова.

export function normalizeBulkIndexes(personIndexes) {
  return [...new Set(personIndexes ?? [])].sort((a, b) => b - a)
}

// Вырезает элементы по набору индексов. descIndexes ДОЛЖНЫ идти по убыванию
// (используй normalizeBulkIndexes). Исходный массив не мутируется.
// removed отдаётся в порядке ИСХОДНОГО списка, а не порядка обхода, — чтобы
// история и уведомления читались в том же порядке, в каком люди стоят в списке.
export function spliceAtIndexes(list, descIndexes) {
  const next = [...(list || [])]
  const removed = []
  for (const idx of descIndexes) {
    removed.push(next.splice(idx, 1)[0])
  }
  removed.reverse()
  return { next, removed }
}
